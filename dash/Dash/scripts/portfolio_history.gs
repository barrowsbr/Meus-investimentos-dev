/**
 * ============================================================================
 * SCRIPT DE GERAÇÃO DE HISTÓRICO PATRIMONIAL DIÁRIO (V2 - DEBUG & AUTO-DETECT)
 * ============================================================================
 */

// --- CONFIGURAÇÃO ---
const CONFIG = {
  SHEET_TRANSACOES: 'meus_ativos',
  SHEET_PROVENTOS: 'meus_proventos',
  SHEET_HISTORICO: 'Historico_Carteira',
  
  // Nomes dos Cabeçalhos para busca dinâmica (Case Insensitive)
  HEADERS_ATIVOS: {
    DATA: ['Data', 'Date'],
    TICKER: ['Símbolo', 'Simbolo', 'Ticker', 'Ativo', 'Papel'], // 'Símbolo' é o principal
    TIPO: ['Tipo de transação', 'Tipo', 'Operação', 'Movimento'], // 'Tipo de transação' é o principal
    QUANTIDADE: ['Quantidade', 'Qtd', 'Quant'],
    TOTAL: ['Valor líquido', 'Valor Liquido', 'Valor total', 'Total', 'Valor'] // 'Valor líquido' principal
  },
  
  HEADERS_PROVENTOS: {
    DATA_PAGAMENTO: ['Data Pagamento', 'Pagamento', 'Data', 'Payment Date'],
    TICKER: ['Ticker', 'Ativo'],
    VALOR: ['Valor Líquido', 'Valor Liquido', 'Valor', 'Total']
  }
};

function processHistory(forceFull) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shTrans = ss.getSheetByName(CONFIG.SHEET_TRANSACOES);
  const shProv = ss.getSheetByName(CONFIG.SHEET_PROVENTOS);
  let shHist = ss.getSheetByName(CONFIG.SHEET_HISTORICO);

  if (!shTrans || !shProv) {
    Logger.log("ERRO CRÍTICO: Planilhas de origem não encontradas.");
    SpreadsheetApp.getUi().alert("ERRO: Abas 'meus_ativos' ou 'meus_proventos' não encontradas.");
    return;
  }

  if (!shHist) {
    shHist = ss.insertSheet(CONFIG.SHEET_HISTORICO);
    forceFull = true;
  }

  // 1. Ler e Normalizar Dados (Com Auto-Detect)
  const events = fetchAllEvents(shTrans, shProv);
  
  Logger.log(`Total de Eventos Encontrados: ${events.length}`);
  if (events.length === 0) {
    SpreadsheetApp.getUi().alert("Nenhum evento de transação ou provento foi lido. Verifique os nomes das colunas.");
    return;
  }

  // 2. Identificar universo de Tickers
  const uniqueTickers = [...new Set(events.map(e => e.ticker))].sort().filter(t => t);
  Logger.log(`Tickers únicos: ${uniqueTickers.join(', ')}`);
  
  // 3. Preparar Cabeçalho
  const header = ['Data', 'Saldo_Caixa', ...uniqueTickers];

  // 4. Setup Inicial
  if (forceFull) {
    shHist.clear();
    shHist.appendRow(header);
    shHist.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#efefef');
    shHist.setFrozenRows(1);
    shHist.setFrozenColumns(1);
  }

  // Determinar range de datas
  let startDate = new Date(events[0].date); 
  // Força meia-noite
  startDate.setHours(0,0,0,0);
  
  const today = new Date();
  today.setHours(0,0,0,0);
  
  Logger.log(`Iniciando processamento de ${startDate.toDateString()} até ${today.toDateString()}`);

  // Estado Atual (Memória)
  let currentBalance = 0.0;
  let currentPortfolio = {}; 
  uniqueTickers.forEach(t => currentPortfolio[t] = 0.0);
  
  const rowsToWrite = [];
  let currDate = new Date(startDate.getTime());
  let eventIdx = 0;

  // LOOP TEMPORAL
  while (currDate <= today) {
    // Processar Eventos do Dia
    while (eventIdx < events.length) {
      const ev = events[eventIdx];
      const evDate = new Date(ev.date);
      evDate.setHours(0,0,0,0);
      
      if (evDate.getTime() < currDate.getTime()) {
        eventIdx++; 
        continue;
      }
      
      if (evDate.getTime() === currDate.getTime()) {
        processEvent(ev, currentPortfolio, uniqueTickers);
        currentBalance += ev.cashEffect;
        eventIdx++;
      } else {
        break; 
      }
    }
    
    // Preparar Linha
    const row = [new Date(currDate)]; // Col A
    row.push(currentBalance);        // Col B
    uniqueTickers.forEach(t => {
      row.push(currentPortfolio[t] || 0);
    });
    
    rowsToWrite.push(row);
    currDate.setDate(currDate.getDate() + 1);
  } 

  // Escrever
  if (rowsToWrite.length > 0) {
    Logger.log(`Escrevendo ${rowsToWrite.length} linhas...`);
    // Limite do Google Sheets para setValues é grande, mas bom fazer em chunks se for > 5000 linhas
    // Aqui assumimos < 5000 dias (~13 anos)
    const startRow = shHist.getLastRow() + 1;
    shHist.getRange(startRow, 1, rowsToWrite.length, rowsToWrite[0].length).setValues(rowsToWrite);
    
    // Formatação Básica
    shHist.getRange("A:A").setNumberFormat("dd/MM/yyyy");
    shHist.getRange(2, 2, shHist.getLastRow(), 1).setNumberFormat("R$ #,##0.00");
    
    SpreadsheetApp.getUi().alert(`Sucesso! ${rowsToWrite.length} dias processados.`);
  }
}

// --- HELPER DE COLUNAS ---
function findColIndex(headers, possibleNames) {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i]).toLowerCase().trim();
    for (const name of possibleNames) {
      if (h === name.toLowerCase()) return i;
    }
  }
  return -1;
}

function fetchAllEvents(shTrans, shProv) {
  const events = [];
  
  // A. TRANSACÕES
  const rawTrans = shTrans.getDataRange().getValues();
  if (rawTrans.length < 2) return [];
  
  const headerTrans = rawTrans[0];
  const idxData = findColIndex(headerTrans, CONFIG.HEADERS_ATIVOS.DATA);
  const idxTicker = findColIndex(headerTrans, CONFIG.HEADERS_ATIVOS.TICKER);
  const idxTipo = findColIndex(headerTrans, CONFIG.HEADERS_ATIVOS.TIPO);
  const idxQtd = findColIndex(headerTrans, CONFIG.HEADERS_ATIVOS.QUANTIDADE);
  const idxTotal = findColIndex(headerTrans, CONFIG.HEADERS_ATIVOS.TOTAL);
  
  Logger.log(`Indices Transações: Data=${idxData}, Ticker=${idxTicker}, Tipo=${idxTipo}, Qtd=${idxQtd}, Total=${idxTotal}`);
  
  if (idxData === -1 || idxTicker === -1) {
    Logger.log("Erro: Colunas obrigatórias (Data/Ticker) não encontradas em 'meus_ativos'.");
    return [];
  }
  
  for (let i = 1; i < rawTrans.length; i++) {
    const row = rawTrans[i];
    const date = row[idxData];
    const ticker = String(row[idxTicker]).trim().toUpperCase();
    
    if (!date || !ticker || ticker === "") continue;
    
    const qty = Number(row[idxQtd]) || 0;
    const total = Number(row[idxTotal]) || 0;
    const type = String(row[idxTipo]).toUpperCase();
    
    let cashEffect = 0;
    let normType = 'OUTROS';
    
    // Lógica Financeira Simples
    if (total > 0 && (type.includes('COMPRA') || type.includes('APORTE'))) {
       // Se está positivo na planilha mas é compra, é saída de caixa -> negativo
       cashEffect = -Math.abs(total);
       normType = 'COMPRA';
    } else if (total < 0 && (type.includes('COMPRA') || type.includes('APORTE'))) {
       // Já está negativo, mantemos
       cashEffect = total;
       normType = 'COMPRA';
    } else if (type.includes('VENDA') || type.includes('RESGATE')) {
       // Venda é entrada -> positivo
       cashEffect = Math.abs(total);
       normType = 'VENDA';
    }
    
    events.push({
      date: new Date(date),
      type: normType,
      ticker: ticker,
      quantity: qty,
      cashEffect: cashEffect
    });
  }
  
  // B. PROVENTOS
  const rawProv = shProv.getDataRange().getValues();
  if (rawProv.length > 1) {
    const headerProv = rawProv[0];
    const pIdxDate = findColIndex(headerProv, CONFIG.HEADERS_PROVENTOS.DATA_PAGAMENTO);
    const pIdxTicker = findColIndex(headerProv, CONFIG.HEADERS_PROVENTOS.TICKER);
    const pIdxVal = findColIndex(headerProv, CONFIG.HEADERS_PROVENTOS.VALOR);
    
    if (pIdxDate !== -1 && pIdxTicker !== -1) {
      for (let i = 1; i < rawProv.length; i++) {
        const row = rawProv[i];
        const date = row[pIdxDate];
        if (!date) continue;
        
        const val = Number(row[pIdxVal]) || 0;
        
        events.push({
          date: new Date(date),
          type: 'PROVENTO',
          ticker: String(row[pIdxTicker]).trim().toUpperCase(),
          quantity: 0,
          cashEffect: Math.abs(val)
        });
      }
    }
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  return events;
}

function processEvent(ev, portfolio, validTickers) {
  const t = ev.ticker;
  if (validTickers.includes(t)) {
    if (ev.type === 'COMPRA') portfolio[t] += Math.abs(ev.quantity);
    else if (ev.type === 'VENDA') portfolio[t] -= Math.abs(ev.quantity);
  }
}

function updatePortfolioHistory() { processHistory(false); }
function forceFullRebuild() { processHistory(true); }
function setupDailyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('updatePortfolioHistory').timeBased().everyDays(1).atHour(2).create();
}

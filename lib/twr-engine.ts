import { toNumber } from "./format";
import { identificarSetor, getMoedaEfetiva, isRendaFixaManual } from "./sectors";
import type { FxRates } from "./cotacoes";

type Row = Record<string, unknown>;

// ─── Date utilities ───────────────────────────────────────────────────────────

function toYMD(val: unknown): string {
  if (!val) return "";
  if (typeof val === "number") {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().split("T")[0];
  }
  const s = String(val).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

function nextBusinessDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export function businessDays(startStr: string, endStr: string): string[] {
  const result: string[] = [];
  const cur = new Date(startStr + "T12:00:00Z");
  const end = new Date(endStr + "T12:00:00Z");
  while (cur <= end) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) {
      result.push(cur.toISOString().split("T")[0]);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

// ─── Parsed transaction ────────────────────────────────────────────────────────

export interface ParsedTx {
  date: string;
  bizDate: string;
  ticker: string;
  tipo: "Compra" | "Venda";
  quantidade: number;
  preco: number;
  taxas: number;
  moeda: string;
  setor: string;
}

export function parseRVTransactions(rows: Row[]): ParsedTx[] {
  const result: ParsedTx[] = [];

  for (const row of rows) {
    const ticker = String(
      row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? ""
    ).toUpperCase().trim();
    if (!ticker) continue;

    const setor = identificarSetor(ticker);
    // RF manual (CDB/Tesouro) é excluída — vem da timeline de RF.
    if (isRendaFixaManual(setor)) continue;

    const tipoRaw = String(
      row["tipo de transação"] ?? row["tipo de transacao"] ?? row["tipo"] ?? ""
    ).toLowerCase();

    let tipo: "Compra" | "Venda" | null = null;
    if (tipoRaw.includes("compra") || tipoRaw.includes("buy") || tipoRaw.includes("aporte") || tipoRaw.includes("subscri") || tipoRaw.includes("bonif")) tipo = "Compra";
    else if (tipoRaw.includes("venda") || tipoRaw.includes("sell") || tipoRaw.includes("resgate")) tipo = "Venda";
    if (!tipo) continue;

    const quantidade = Math.abs(toNumber(row["quantidade"] ?? row["qtd"] ?? row["quantity"]) ?? 0);
    if (quantidade < 0.000001) continue;

    const preco = Math.abs(toNumber(row["preço"] ?? row["preco"] ?? row["price"]) ?? 0);
    const taxas = Math.abs(toNumber(row["taxa de corretagem"] ?? row["taxas"] ?? row["taxa"]) ?? 0);
    const moedaRaw = String(row["moeda"] ?? row["currency"] ?? "BRL").toUpperCase().trim();
    const moeda = getMoedaEfetiva(ticker, moedaRaw || "BRL", setor);
    const date = toYMD(row["data"] ?? row["date"]);
    if (!date) continue;

    result.push({ date, bizDate: nextBusinessDay(date), ticker, tipo, quantidade, preco, taxas, moeda, setor });
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Parse proventos ─────────────────────────────────────────────────────────

interface ParsedIncome {
  date: string;
  bizDate: string;
  ticker: string;
  valor: number;
  moeda: string;
}

export function parseProventos(rows: Row[]): ParsedIncome[] {
  const result: ParsedIncome[] = [];
  for (const row of rows) {
    const ticker = String(row["ticker"] ?? "").toUpperCase().trim();
    if (!ticker) continue;

    // IMPOSTO = IR retido na fonte. Não ignorar: é custo, entra como income
    // NEGATIVO (abate o provento bruto → retorno reflete o líquido recebido).
    const decisao = String(row["decisao"] ?? row["decisão"] ?? "").toLowerCase();
    const isImposto = decisao.includes("imposto");

    const valorAbs = Math.abs(toNumber(row["valor"]) ?? 0);
    if (valorAbs < 0.01) continue;
    const valor = isImposto ? -valorAbs : valorAbs;

    const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim();
    const date = toYMD(row["data"] ?? row["date"]);
    if (!date) continue;

    result.push({ date, bizDate: nextBusinessDay(date), ticker, valor, moeda });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── RF (renda fixa) timeline for TWR integration ────────────────────────────

const RF_BIZ_DAYS_YEAR = 252;
// Acrual de RF em USD: aproximação T-bill/money market. O true-up na data de
// atualização do saldo manual absorve o erro de aproximação.
const USD_RF_ANNUAL = 0.045;
const USD_RF_DAILY = Math.pow(1 + USD_RF_ANNUAL, 1 / RF_BIZ_DAYS_YEAR) - 1;
const CASH_TICKERS_RF = new Set(["CAIXA", "SALDO", "CASH", "RESERVA"]);

interface RfParsedTx {
  date: string;
  bizDate: string;
  ticker: string;
  tipo: "compra" | "venda";
  valor: number;
  moeda: string;
}

function normalizeRfTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, " ");
}

function parseRfTxs(rows: Row[]): RfParsedTx[] {
  const result: RfParsedTx[] = [];
  for (const row of rows) {
    const ticker = normalizeRfTicker(String(row["ticker"] ?? row["ativo"] ?? row["papel"] ?? ""));
    if (!ticker || CASH_TICKERS_RF.has(ticker)) continue;
    if (!isRendaFixaManual(identificarSetor(ticker))) continue;
    const tipoRaw = String(row["tipo"] ?? row["movimentacao"] ?? "").toLowerCase().trim();
    let tipo: "compra" | "venda" | null = null;
    if (tipoRaw.includes("compra") || tipoRaw.includes("aplica") || tipoRaw.includes("aporte")) tipo = "compra";
    else if (tipoRaw.includes("venda") || tipoRaw.includes("resgate") || tipoRaw.includes("vencimento")) tipo = "venda";
    // Linhas de IMPOSTO (IR retido no resgate) são IGNORADAS de propósito:
    // imposto sobre ganho de capital é do INVESTIDOR, não da carteira —
    // convenção de fundo (GIPS): a carteira acrua e resgata BRUTO. Descontar
    // o IR do retorno distorcia o TWR (ex.: R$ 109 de IR numa carteira de
    // R$ 7k = −1,5% compostos para sempre). O retorno é líquido apenas de
    // custos de transação (corretagem) e de IR na fonte sobre proventos.
    if (!tipo) continue;
    const valor = Math.abs(toNumber(row["valor"]) ?? 0);
    if (valor < 0.01) continue;
    const date = toYMD(row["compra"] ?? row["data"] ?? row["date"]);
    if (!date) continue;
    const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
    result.push({ date, bizDate: nextBusinessDay(date), ticker, tipo, valor, moeda });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// Dias de semana (seg–sex) no intervalo (start, end] — contagem REAL, não a
// aproximação ×252/365. A taxa implícita é aplicada no grid apenas em dias de
// semana (isWeekday), então o expoente da solução tem que contar exatamente os
// mesmos dias — o descasamento antigo (taxa por dia útil aplicada em dias
// corridos, já que o grid de cripto cobre sáb/dom) inflava o acrual em ~45%.
function rfBizDays(startStr: string, endStr: string): number {
  let count = 0;
  const d = new Date(startStr + "T12:00:00Z");
  const end = new Date(endStr + "T12:00:00Z");
  while (d < end) {
    d.setDate(d.getDate() + 1);
    const dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5) count++;
  }
  return count;
}

// Taxa diária implícita: resolve r tal que Σ lots × (1+r)^bizDays = targetValue.
// Dá uma "renda diária" constante — o caminho acrua suavemente de cada
// compra/venda até a data-alvo (data de atualização do saldo manual).
function solveImpliedRate(
  lots: { invested: number; bizDays: number }[],
  targetValue: number
): number {
  const DEFAULT_DAILY = 0.0005;
  if (lots.length === 0 || targetValue <= 0) return DEFAULT_DAILY;
  const totalInvested = lots.reduce((s, l) => s + l.invested, 0);
  if (totalInvested <= 0) return DEFAULT_DAILY;
  if (targetValue < totalInvested * 0.5) return 0;
  let r = DEFAULT_DAILY;
  for (let iter = 0; iter < 20; iter++) {
    let f = -targetValue;
    let df = 0;
    for (const l of lots) {
      const factor = Math.pow(1 + r, l.bizDays);
      f += l.invested * factor;
      df += l.invested * l.bizDays * Math.pow(1 + r, l.bizDays - 1);
    }
    if (Math.abs(df) < 1e-12) break;
    const step = f / df;
    r -= step;
    r = Math.max(0, Math.min(r, 0.002));
    if (Math.abs(step) < 1e-9) break;
  }
  return r;
}

// RF no TWR: taxa diária implícita constante ("renda diária") para posições
// com histórico de compra + saldo manual. fixa_aberta = posição aberta = saldo
// de HOJE: a taxa é resolvida de cada compra até lastDate, dando um caminho
// suave que atinge o saldo exatamente no último dia. Posições sem histórico de
// compra ficam com NAV plano. Cupons (NTN-B etc.) entram como income separado
// via meus_proventos. O lock mensal garante que meses fechados não mudam no
// heatmap. Modelo canônico: CALCULOS.md §26.
export function buildRfTimeline(
  rfTransacoes: Row[],
  fixaAberta: Row[],
  dates: string[],
  fxHistory: FxHistory,
  cdiDiario?: Record<string, number>,
): { navByDate: Record<string, number>; flowByDate: Record<string, number>; navFxByDate: Record<string, number>; costBasisAtual: number } {
  const navByDate: Record<string, number> = {};
  const flowByDate: Record<string, number> = {};
  const navFxByDate: Record<string, number> = {};
  // Custo investido das posições RF ATUAIS (abertas), em BRL — POR TICKER com
  // floor em 0, igual ao canônico. Somar flows líquidos globalmente (custo −
  // resgates históricos) zerava o custo da RF aberta na base do "Investido".
  let costBasisAtual = 0;
  if (dates.length === 0) return { navByDate, flowByDate, navFxByDate, costBasisAtual };

  const txs = parseRfTxs(rfTransacoes);
  const lastDate = dates[dates.length - 1];
  const { series: fxSeries } = buildAlignedFx(dates, fxHistory);

  const temCdiReal = cdiDiario != null && Object.keys(cdiDiario).length > 0;
  // Taxa do dia por moeda. Com CDI real, feriados não têm entrada na série →
  // acrual 0 (correto). No fallback (tabela SELIC), acrua em dias úteis.
  const rateOf = (date: string, moeda: string): number => {
    if (moeda === "BRL") {
      if (temCdiReal) return cdiDiario![date] ?? 0;
      return isWeekday(date) ? getSelicDiaria(date) : 0;
    }
    return isWeekday(date) ? USD_RF_DAILY : 0;
  };

  // Acrual PRÉ-JANELA (dias-calendário fora do grid): para BRL usa CDI real
  // quando a data está coberta; fora da cobertura cai na tabela SELIC
  // (~0,1pp/ano de erro, absorvido pelo true-up). Acrua de fromExcl
  // (exclusivo) até toIncl (inclusivo).
  const accrueTo = (
    bal: number, fromExcl: string, toIncl: string,
    moeda: string, fixedRate: number | null,
  ): number => {
    if (bal <= 0 || fromExcl >= toIncl) return bal;
    const d = new Date(fromExcl + "T12:00:00Z");
    const end = new Date(toIncl + "T12:00:00Z");
    while (true) {
      d.setDate(d.getDate() + 1);
      if (d > end) break;
      const ymd = d.toISOString().split("T")[0];
      let r: number;
      if (fixedRate != null) r = isWeekday(ymd) ? fixedRate : 0;
      else if (moeda === "BRL") r = cdiDiario?.[ymd] ?? (isWeekday(ymd) ? getSelicDiaria(ymd) : 0);
      else r = isWeekday(ymd) ? USD_RF_DAILY : 0;
      bal *= 1 + r;
    }
    return bal;
  };

  const manualValues = new Map<string, { atual: number; moeda: string; dataAtualizacao: string }>();
  for (const row of fixaAberta) {
    const ticker = normalizeRfTicker(String(row["ticker"] ?? row["ativo"] ?? ""));
    if (!ticker || CASH_TICKERS_RF.has(ticker)) continue;
    if (!isRendaFixaManual(identificarSetor(ticker))) continue;
    const atual = toNumber(row["atual"] ?? row["valor_atual"] ?? row["saldo"] ?? row["valor atual"]) ?? 0;
    const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
    // Ativo em fixa_aberta = posição aberta → o saldo manual é o valor de HOJE.
    // A taxa implícita sempre resolve de cada compra até lastDate (hoje).
    if (atual > 0) manualValues.set(ticker, { atual, moeda, dataAtualizacao: lastDate });
  }

  const byTicker = new Map<string, RfParsedTx[]>();
  for (const tx of txs) {
    if (!byTicker.has(tx.ticker)) byTicker.set(tx.ticker, []);
    byTicker.get(tx.ticker)!.push(tx);
  }

  interface TickerState {
    moeda: string;
    // Fluxos por data de grid (bizDate): compras positivas, vendas negativas.
    // bizDate (não a data crua) para o NAV reconhecer a transação no MESMO dia
    // de grid da série de fluxos — senão fim de semana gera spike + reversão.
    flowsByDate: Map<string, number>;
    // Taxa constante realizada (posições encerradas) — null = taxa do dia.
    fixedRate: number | null;
    // True-up: no primeiro dia de grid ≥ trueUpDate, o saldo vira manual.atual.
    trueUpDate: string | null;
    trueUpValue: number;
    balance: number;
    trueUpDone: boolean;
    // Posição encerrada (sem saldo manual, resgates ≥ 95% do investido):
    // a partir desta data o saldo é FORÇADO a zero. Sem isso, qualquer
    // descasamento taxa × dias deixa um resíduo fantasma acruando para
    // sempre — foi o que inflou o NAV de RF e divergiu o MTM.
    closeDate: string | null;
  }
  const states: TickerState[] = [];
  const allTickerNames = new Set([...manualValues.keys(), ...byTicker.keys()]);

  for (const ticker of allTickerNames) {
    const txList = byTicker.get(ticker) ?? [];
    const manual = manualValues.get(ticker);
    const compras = txList.filter(t => t.tipo === "compra");
    const vendas = txList.filter(t => t.tipo === "venda");

    if (compras.length === 0) {
      // fixa_aberta sem histórico de compra — posição pré-existente. Sem dados
      // para estimar retorno: NAV constante no saldo manual (só câmbio varia).
      if (manual && manual.atual > 0) {
        // Sem custo conhecido, o próprio saldo é o capital presente — entra
        // na base do "Investido" pela mesma lógica do caixa (capital sem
        // retorno medido ainda é capital).
        costBasisAtual += manual.atual * fxFactor(manual.moeda, fxSeries[fxSeries.length - 1]);
        states.push({
          moeda: manual.moeda,
          flowsByDate: new Map([[dates[0], manual.atual]]),
          fixedRate: null,
          trueUpDate: dates[0],
          trueUpValue: manual.atual,
          balance: 0,
          trueUpDone: false,
          closeDate: null,
        });
        flowByDate[dates[0]] = (flowByDate[dates[0]] ?? 0) + manual.atual * fxFactor(manual.moeda, fxSeries[0]);
      }
      continue;
    }

    const moeda = manual?.moeda ?? compras[0]?.moeda ?? "BRL";
    const trueUpTarget = manual
      ? (manual.dataAtualizacao < dates[0] ? dates[0] : manual.dataAtualizacao)
      : null;

    const totalInvested = compras.reduce((s, c) => s + c.valor, 0);
    // Resgate BRUTO: o IR do resgate é do investidor, não da carteira (GIPS).
    const totalRedeemed = vendas.reduce((s, v) => s + v.valor, 0);

    // Posição ABERTA (tem saldo manual): custo líquido remanescente por
    // ticker, floor 0 — entra na base do "Investido" (custo FIFO + RF + caixa).
    if (manual && manual.atual > 0) {
      costBasisAtual += Math.max(0, totalInvested - totalRedeemed)
        * fxFactor(moeda, fxSeries[fxSeries.length - 1]);
    }

    let fixedRate: number | null = null;
    let closeDate: string | null = null;
    if (manual && manual.atual > 0) {
      // Taxa implícita constante: "renda diária" suave de cada compra/venda
      // até a data de atualização do saldo manual. O caminho acrua e atinge
      // o saldo exatamente na data do true-up. Sem data de atualização,
      // trueUpTarget = lastDate e o comportamento é idêntico à produção.
      const target = trueUpTarget ?? lastDate;
      const lots = [
        ...compras.map(c => ({ invested: c.valor, bizDays: rfBizDays(c.bizDate, target) })),
        ...vendas.map(v => ({ invested: -v.valor, bizDays: rfBizDays(v.bizDate, target) })),
      ];
      fixedRate = solveImpliedRate(lots, manual.atual);
    } else if (!manual && vendas.length > 0) {
      // Posição encerrada: taxa realizada dos próprios fluxos (brutos).
      const lastVenda = vendas.reduce((m, v) => v.bizDate > m ? v.bizDate : m, vendas[0].bizDate);
      const holdingDays = rfBizDays(compras[0].bizDate, lastVenda);
      if (holdingDays > 0 && totalInvested > 0 && totalRedeemed > totalInvested * 0.3) {
        fixedRate = Math.max(0, Math.min(Math.pow(totalRedeemed / totalInvested, 1 / holdingDays) - 1, 0.002));
      }
      // Resgate (quase) total = posição encerrada: saldo zera na última venda.
      // Não fecha se houver compra POSTERIOR à última venda (reaplicação).
      const temCompraPosterior = compras.some(c => c.bizDate > lastVenda);
      if (totalRedeemed >= totalInvested * 0.95 && !temCompraPosterior) closeDate = lastVenda;
    }

    const flowsByDate = new Map<string, number>();
    for (const c of compras) flowsByDate.set(c.bizDate, (flowsByDate.get(c.bizDate) ?? 0) + c.valor);
    for (const v of vendas) flowsByDate.set(v.bizDate, (flowsByDate.get(v.bizDate) ?? 0) - v.valor);

    // Fluxos ANTERIORES à janela viram saldo de ABERTURA, acruado dia a dia
    // até a véspera de dates[0] — espelha a custódia RV, onde transações
    // pré-janela entram no NAV do dia-âncora e nunca como fluxo da janela.
    // Sem isso, janela filtrada (1A/6M/…) começava a posição em 0 e o
    // true-up virava um salto artificial gigante no TWR.
    let opening = 0;
    let cursor: string | null = null;
    for (const d of [...flowsByDate.keys()].filter(k => k < dates[0]).sort()) {
      if (cursor != null) opening = accrueTo(opening, cursor, d, moeda, fixedRate);
      opening = Math.max(0, opening + flowsByDate.get(d)!);
      flowsByDate.delete(d);
      cursor = d;
    }
    if (cursor != null) {
      const vespera = new Date(dates[0] + "T12:00:00Z");
      vespera.setDate(vespera.getDate() - 1);
      opening = accrueTo(opening, cursor, vespera.toISOString().split("T")[0], moeda, fixedRate);
    }

    states.push({
      moeda,
      flowsByDate,
      fixedRate,
      trueUpDate: trueUpTarget,
      trueUpValue: manual?.atual ?? 0,
      balance: opening,
      trueUpDone: false,
      closeDate,
    });
  }

  const sortedRfTxs = [...txs].sort((a, b) => a.bizDate.localeCompare(b.bizDate));
  let rfTxIdx = 0;
  while (rfTxIdx < sortedRfTxs.length && sortedRfTxs[rfTxIdx].bizDate < dates[0]) rfTxIdx++;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const fx = fxSeries[i];

    let dayFlow = 0;
    while (rfTxIdx < sortedRfTxs.length && sortedRfTxs[rfTxIdx].bizDate <= date) {
      const rtx = sortedRfTxs[rfTxIdx++];
      const fxF = fxFactor(rtx.moeda, fx);
      if (rtx.tipo === "compra") dayFlow += rtx.valor * fxF;
      else dayFlow -= rtx.valor * fxF;
    }
    if (Math.abs(dayFlow) > 0.01) flowByDate[date] = dayFlow;

    let dayNav = 0;
    let dayNavFx = 0;
    for (const st of states) {
      // Acrual: só ATÉ o true-up. Depois do snap ao saldo manual, congelamos
      // — acumular além inflaria o NAV acima do que o snapshot enxerga,
      // divergindo o MTM e injetando retorno sem dado real.
      // Posições sem true-up (encerradas ou sem saldo manual) acruam sempre.
      // Taxa implícita é POR DIA ÚTIL (rfBizDays conta seg–sex): no grid, que
      // pode ter sáb/dom (cripto cota todo dia), só acrua em dia de semana —
      // senão o caminho estoura o alvo (~45% de acrual a mais).
      if (i > 0 && st.balance > 0 && !st.trueUpDone) {
        const r = st.fixedRate != null
          ? (isWeekday(date) ? st.fixedRate : 0)
          : rateOf(date, st.moeda);
        st.balance *= 1 + r;
      }
      const flow = st.flowsByDate.get(date);
      if (flow != null) st.balance = Math.max(0, st.balance + flow);
      if (!st.trueUpDone && st.trueUpDate != null && date >= st.trueUpDate) {
        st.balance = st.trueUpValue;
        st.trueUpDone = true;
      }
      // Encerrada: resgate total já saiu via flow — zera qualquer resíduo de
      // descasamento taxa × dias para o NAV não acruar um fantasma eterno.
      if (st.closeDate != null && date >= st.closeDate) st.balance = 0;
      if (st.balance > 0) {
        const valBRL = st.balance * fxFactor(st.moeda, fx);
        dayNav += valBRL;
        if (st.moeda !== "BRL") dayNavFx += valBRL;
      }
    }
    navByDate[date] = dayNav;
    navFxByDate[date] = dayNavFx;
  }

  return { navByDate, flowByDate, navFxByDate, costBasisAtual };
}

// ─── Daily custody reconstruction (FIFO cumulative) ───────────────────────────

type CustodySnapshot = Record<string, number>;

function buildDailyCustody(txs: ParsedTx[], dates: string[]): CustodySnapshot[] {
  const events = txs.map(tx => ({
    date: tx.bizDate,
    ticker: tx.ticker,
    delta: tx.tipo === "Compra" ? tx.quantidade : -tx.quantidade,
  })).sort((a, b) => a.date.localeCompare(b.date));

  const running: Record<string, number> = {};
  let evtIdx = 0;
  const n = dates.length;
  const custody: CustodySnapshot[] = new Array(n);

  for (let i = 0; i < n; i++) {
    while (evtIdx < events.length && events[evtIdx].date <= dates[i]) {
      const e = events[evtIdx++];
      running[e.ticker] = (running[e.ticker] ?? 0) + e.delta;
    }
    custody[i] = { ...running };
  }

  return custody;
}

// ─── Price lookup (forward-fill up to 5 days) ─────────────────────────────────

function getPrice(
  ticker: string,
  idx: number,
  prices: PriceMatrix
): number | null {
  const arr = prices[ticker];
  if (!arr) return null;
  for (let j = idx; j >= Math.max(0, idx - 5); j--) {
    if (arr[j] != null) return arr[j]!;
  }
  return null;
}

// ─── FX helpers ───────────────────────────────────────────────────────────────

function fxFactor(moeda: string, fx: FxRates): number {
  const c = moeda.toUpperCase();
  if (c === "BRL") return 1;
  if (c === "USD") return fx.USDBRL;
  if (c === "EUR") return fx.EURBRL;
  if (c === "CAD") return fx.CADBRL;
  if (c === "GBP") return fx.GBPBRL;
  return 1;
}

// Último recurso quando NÃO existe nenhuma taxa no histórico inteiro.
// Nunca deve ser usado silenciosamente: buildAlignedFx conta os dias em
// fallback e o consumidor reporta via diagnostics/errors.
const FX_LAST_RESORT: FxRates = { USDBRL: 5.7, EURBRL: 6.4, CADBRL: 4.1, GBPBRL: 7.6 };

// Série FX alinhada ao grid de datas: ffill (taxa anterior) + bfill (primeira
// taxa conhecida). fallbackDays > 0 só quando fxHistory não cobre NENHUMA data.
function buildAlignedFx(
  dates: string[],
  fxHistory: FxHistory
): { series: FxRates[]; fallbackDays: number } {
  const n = dates.length;
  const series: (FxRates | null)[] = new Array(n).fill(null);
  let last: FxRates | null = null;
  for (let i = 0; i < n; i++) {
    const fx = fxHistory[dates[i]];
    if (fx) last = fx;
    series[i] = fx ?? last;
  }
  let next: FxRates | null = null;
  let fallbackDays = 0;
  for (let i = n - 1; i >= 0; i--) {
    if (series[i]) next = series[i];
    else if (next) series[i] = next;
    else { series[i] = FX_LAST_RESORT; fallbackDays++; }
  }
  return { series: series as FxRates[], fallbackDays };
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type PriceMatrix = Record<string, (number | null)[]>;

export interface FxHistory {
  [date: string]: FxRates;
}

export interface TwrDayPoint {
  date: string;
  nav: number;
  flow: number;
  income: number;
  ret: number;
  twr: number;
  forceZero: boolean;
  // Parcela do NAV em moeda estrangeira (em BRL) — usada pela decomposição
  // cambial ponderada. Opcional: benchmarks sintéticos não preenchem.
  navFx?: number;
}

export interface TwrResult {
  points: TwrDayPoint[];
  twrTotal: number;
  twrAnualizado: number;
  navInicial: number;
  navFinal: number;
  duracaoAnos: number;
  primeiraData: string;
  ultimaData: string;
  totalInvestido: number;
  custoPosicoesAtuais: number;
  ganhoEconomico: number;
  ganhoDecomposicao: {
    navFinal: number; navInicial: number; flowsFromFirst: number;
    firstMeaningfulFlow: number; incomeFromFirst: number;
    forceZeroDays: number;
  };
  mwr: number | null;
  // Contribuição EXATA por setor para o TWR total: ganhos diários por setor
  // divididos pela base Dietz do dia e encadeados geometricamente
  // (Σ contrib = twrTotal, identidade telescópica). Substitui a antiga
  // "atribuição" por peso de custo, que não continha performance nenhuma.
  contribuicoes: Array<{ setor: string; contrib: number; navMedio: number }>;
  diagnostics: {
    forceZeroDays: number;
    incomeTotal: number;
    tickersAtCost: string[];
    fxFallbackDays: number;
    stalePrices: Array<{ ticker: string; lastPriceDate: string }>;
  };
}

export interface TwrInput {
  transacoes: Row[];
  proventos?: Row[];
  dates: string[];
  prices: PriceMatrix;
  fxHistory: FxHistory;
  rfNavByDate?: Record<string, number>;
  rfFlowByDate?: Record<string, number>;
  rfNavFxByDate?: Record<string, number>;
  // Custo das posições RF ATUAIS (costBasisAtual de buildRfTimeline). Quando
  // presente substitui o fallback de net-flows, que zerava o custo da RF
  // aberta sempre que os resgates históricos superavam as compras atuais.
  rfCostBasis?: number;
  pmFx?: FxRates;
}

// ─── MWR (Money-Weighted Return / XIRR) — matches Python mwr.py ─────────────
// Uses year fractions (days / 365.25) and Newton-Raphson with bisection fallback.
// Convention: aporte (purchase) = negative (investor outflow), NAV final = positive.

function calculateMWR(
  flows: { date: string; amount: number }[],
  navFinal: number,
  lastDate: string,
  navInicial: number,
  firstDate: string,
): number | null {
  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
  const baseMs = new Date(firstDate + "T12:00:00Z").getTime();
  const lastMs = new Date(lastDate + "T12:00:00Z").getTime();
  const tFinal = (lastMs - baseMs) / MS_PER_YEAR;
  if (tFinal <= 0) return null;

  // Build cashflow vector: [yearFraction, amount]
  const cf: [number, number][] = [];
  if (navInicial > 0) cf.push([0, -navInicial]);
  for (const f of flows) {
    const t = (new Date(f.date + "T12:00:00Z").getTime() - baseMs) / MS_PER_YEAR;
    cf.push([t, -f.amount]);
  }
  cf.push([tFinal, navFinal]);
  cf.sort((a, b) => a[0] - b[0]);
  if (cf.length < 2) return null;

  function npv(rate: number): number {
    if (rate <= -1) return Infinity;
    return cf.reduce((s, [t, amt]) => s + amt / Math.pow(1 + rate, t), 0);
  }
  function npvDeriv(rate: number): number {
    if (rate <= -1) return Infinity;
    return cf.reduce((s, [t, amt]) => s - t * amt / Math.pow(1 + rate, t + 1), 0);
  }

  let r = 0.05;
  let converged = false;
  for (const guess of [0.05, 0.0, 0.2, -0.3, 0.5]) {
    r = guess;
    for (let i = 0; i < 200; i++) {
      const f = npv(r);
      const df = npvDeriv(r);
      if (Math.abs(df) < 1e-14) break;
      let step = f / df;
      if (Math.abs(step) > 1.0) step = Math.sign(step);
      const rNew = Math.max(-0.999, Math.min(100, r - step));
      if (Math.abs(rNew - r) < 1e-8) { r = rNew; converged = true; break; }
      r = rNew;
    }
    if (converged) break;
  }

  if (!converged) {
    let low = -0.99, high = 10.0;
    let fLow = npv(low);
    if (fLow * npv(high) > 0) {
      for (const h of [50, 100]) { if (fLow * npv(h) <= 0) { high = h; break; } }
    }
    for (let i = 0; i < 300; i++) {
      const mid = (low + high) / 2;
      const fMid = npv(mid);
      if (Math.abs(fMid) < 1e-8 || Math.abs(high - low) < 1e-8) { r = mid; converged = true; break; }
      if (fLow * fMid < 0) { high = mid; } else { low = mid; fLow = fMid; }
    }
    if (!converged) r = (low + high) / 2;
  }

  if (!isFinite(r) || Math.abs(r) > 10) return null;
  return r;
}

// ─── Main TWR calculation ──────────────────────────────────────────────────────

export function calcularTWR(input: TwrInput): TwrResult {
  const { dates, prices, fxHistory, rfNavByDate, rfFlowByDate, rfNavFxByDate, pmFx } = input;

  const EMPTY: TwrResult = {
    points: [], twrTotal: 0, twrAnualizado: 0,
    navInicial: 0, navFinal: 0, duracaoAnos: 0,
    primeiraData: "", ultimaData: "", totalInvestido: 0,
    custoPosicoesAtuais: 0,
    ganhoEconomico: 0,
    ganhoDecomposicao: { navFinal: 0, navInicial: 0, flowsFromFirst: 0, firstMeaningfulFlow: 0, incomeFromFirst: 0, forceZeroDays: 0 },
    mwr: null,
    contribuicoes: [],
    diagnostics: { forceZeroDays: 0, incomeTotal: 0, tickersAtCost: [], fxFallbackDays: 0, stalePrices: [] },
  };

  if (dates.length === 0) return EMPTY;

  const txs = parseRVTransactions(input.transacoes);
  const incomeEvents = input.proventos ? parseProventos(input.proventos) : [];

  const lastDate = dates[dates.length - 1];
  const inRange = txs.filter(tx => tx.date <= lastDate);
  const hasRf = rfNavByDate && Object.keys(rfNavByDate).length > 0;
  if (inRange.length === 0 && !hasRf) return EMPTY;

  const { series: fxSeries, fallbackDays: fxFallbackDays } = buildAlignedFx(dates, fxHistory);

  // ── Pre-fill price matrix: ffill + bfill (matching Python engine) ──
  // Without this, tickers with >5 day price gaps disappear from NAV.
  // ANTES do fill, registra o índice do último preço REAL por ticker — usado
  // para detectar preços congelados (delisting/fonte parada) e reportar em
  // diagnostics.stalePrices em vez de mascarar silenciosamente.
  const lastRealPriceIdx = new Map<string, number>();
  for (const ticker of Object.keys(prices)) {
    const arr = prices[ticker];
    for (let j = arr.length - 1; j >= 0; j--) {
      if (arr[j] != null) { lastRealPriceIdx.set(ticker, j); break; }
    }
    let lastKnown: number | null = null;
    for (let j = 0; j < arr.length; j++) {
      if (arr[j] != null) lastKnown = arr[j];
      else if (lastKnown != null) arr[j] = lastKnown;
    }
    let firstKnown: number | null = null;
    for (let j = arr.length - 1; j >= 0; j--) {
      if (arr[j] != null) firstKnown = arr[j];
      else if (firstKnown != null) arr[j] = firstKnown;
    }
  }

  const custody = buildDailyCustody(inRange, dates);

  // Build ticker → moeda map so NAV uses the same currency as flows
  const tickerMoeda = new Map<string, string>();
  for (const tx of inRange) {
    if (!tickerMoeda.has(tx.ticker)) tickerMoeda.set(tx.ticker, tx.moeda);
  }

  // Average purchase cost per ticker (in the ticker's currency). Used as a
  // fallback NAV price when an asset has NO market price at all (e.g. cripto or
  // RV tickers missing from the golden source / Yahoo). Without this the asset
  // would silently vanish from NAV — the Resumo values it at cost, so we match
  // that behaviour here instead of dropping it.
  const tickerAvgCost = new Map<string, number>();
  {
    const acc = new Map<string, { val: number; qty: number }>();
    for (const tx of inRange) {
      if (tx.tipo !== "Compra") continue;
      const a = acc.get(tx.ticker) ?? { val: 0, qty: 0 };
      a.val += tx.preco * tx.quantidade;
      a.qty += tx.quantidade;
      acc.set(tx.ticker, a);
    }
    for (const [t, a] of acc) if (a.qty > 0) tickerAvgCost.set(t, a.val / a.qty);
  }

  const sortedTxs = [...inRange].sort((a, b) => a.bizDate.localeCompare(b.bizDate));
  let txIdx = 0;
  const sortedInc = [...incomeEvents].sort((a, b) => a.bizDate.localeCompare(b.bizDate));
  let incIdx = 0;

  // FIFO lot tracking for cost of current positions.
  // Cost FX follows the canonical P0 rule (CANONICO.md): pmDólar real das
  // remessas (pmFx) — NOT the spot rate of the purchase date. This keeps
  // custoPosicoesAtuais aligned with the snapshot's Σ custoTotalBRL, which
  // also includes brokerage fees (taxas) in the cost basis.
  const fifoLots = new Map<string, { qty: number; costBrl: number }[]>();
  for (const tx of sortedTxs) {
    const fxCusto = pmFx ?? fxHistory[tx.bizDate] ?? fxSeries[0];
    const fxF = fxFactor(tx.moeda, fxCusto);
    if (tx.tipo === "Compra") {
      const lots = fifoLots.get(tx.ticker) ?? [];
      lots.push({ qty: tx.quantidade, costBrl: (tx.preco * tx.quantidade + tx.taxas) * fxF });
      fifoLots.set(tx.ticker, lots);
    } else {
      const lots = fifoLots.get(tx.ticker);
      if (lots) {
        let rem = tx.quantidade;
        while (rem > 1e-6 && lots.length > 0) {
          if (lots[0].qty <= rem + 1e-6) {
            rem -= lots[0].qty;
            lots.shift();
          } else {
            lots[0].costBrl *= (lots[0].qty - rem) / lots[0].qty;
            lots[0].qty -= rem;
            rem = 0;
          }
        }
      }
    }
  }
  let custoPosicoesAtuais = 0;
  for (const lots of fifoLots.values()) {
    for (const lot of lots) custoPosicoesAtuais += lot.costBrl;
  }

  // Track tickers at cost fallback (no market price available)
  const tickersAtCostSet = new Set<string>();

  // Setor por ticker (para contribuição). Proventos podem vir com variante de
  // ticker (ITUB4 × ITUB4.SA) — identificarSetor resolve o mesmo setor.
  const tickerSetor = new Map<string, string>();
  for (const tx of inRange) {
    if (!tickerSetor.has(tx.ticker)) tickerSetor.set(tx.ticker, tx.setor);
  }
  const setorOf = (ticker: string): string =>
    tickerSetor.get(ticker) ?? identificarSetor(ticker);
  const RF_SECTOR = "Renda Fixa";

  const points: TwrDayPoint[] = [];
  // Ganhos econômicos do dia por setor (gain = Δvalor − flow + income) e NAV
  // por setor — insumos da contribuição exata calculada no pós-processamento.
  const sectorGainsByDay: Array<Map<string, number>> = [];
  const sectorNavByDay: Array<Map<string, number>> = [];
  let prevVals = new Map<string, number>();
  let prevNavRF = 0;
  let prevNav = 0;
  let cumTwr = 1.0;
  let totalInvestido = 0;
  const mwrFlows: { date: string; amount: number }[] = [];
  const firstDate = dates[0];

  // Pre-window transactions AND income establish the OPENING position only.
  // They must NOT be replayed as in-window cash flows/income. Otherwise a
  // windowed view (YTD/1M/…) dumps the entire historical portfolio as a
  // giant day-1 inflow — inflating totalInvestido and collapsing MWR, or
  // dumps all historical dividends into day-1 income — inflating ganhoEconomico.
  // This mirrors Python's approach of slicing a pre-computed NAV/flow series:
  // only flows and income that fall inside the window count.
  while (txIdx < sortedTxs.length && sortedTxs[txIdx].bizDate < firstDate) txIdx++;
  while (incIdx < sortedInc.length && sortedInc[incIdx].bizDate < firstDate) incIdx++;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const snap = custody[i];
    const fx = fxSeries[i];

    // ── RV NAV ──
    let navRV = 0;
    let navFxRV = 0;
    const curVals = new Map<string, number>();
    for (const [ticker, qty] of Object.entries(snap)) {
      if (qty < 0.000001) continue;
      const mktPrice = getPrice(ticker, i, prices);
      const price = mktPrice ?? tickerAvgCost.get(ticker) ?? null;
      if (price == null) continue;
      if (mktPrice == null) tickersAtCostSet.add(ticker);
      const moeda = tickerMoeda.get(ticker) ?? getMoedaEfetiva(ticker, "BRL", identificarSetor(ticker));
      const val = qty * price * fxFactor(moeda, fx);
      navRV += val;
      curVals.set(ticker, val);
      if (moeda !== "BRL") navFxRV += val;
    }

    // ── RF NAV ──
    const navRF = rfNavByDate?.[date] ?? 0;
    let nav = navRV + navRF;
    const navFx = navFxRV + (rfNavFxByDate?.[date] ?? 0);

    // ── Flows: use MARKET prices (consistent with NAV) — Python engine v10.0 ──
    // Fall back to transaction price if no market price available.
    // Use SPOT FX for flows (same as NAV) to avoid flow/NAV mismatch.
    let flow = 0;
    const dayFlowByTicker = new Map<string, number>();
    while (txIdx < sortedTxs.length && sortedTxs[txIdx].bizDate <= date) {
      const tx = sortedTxs[txIdx++];
      let marketPrice = getPrice(tx.ticker, i, prices);
      if (marketPrice == null && i > 0) marketPrice = getPrice(tx.ticker, i - 1, prices);
      const price = (marketPrice != null && marketPrice > 0) ? marketPrice : tx.preco;
      const txFx = fxFactor(tx.moeda, fx);
      const value = tx.quantidade * price * txFx;
      const taxasBrl = tx.taxas * txFx;
      // Taxas (corretagem) entram no flow: na compra o investidor desembolsa
      // value + taxas mas o NAV só ganha value; na venda recebe value − taxas
      // mas o NAV perde value. Em ambos os casos o retorno do dia cai pela
      // taxa — retorno líquido de custos de transação (GIPS).
      let txFlow: number;
      if (tx.tipo === "Compra") {
        txFlow = value + taxasBrl;
        totalInvestido += (tx.preco * tx.quantidade + tx.taxas) * txFx;
      } else {
        txFlow = -(value - taxasBrl);
      }
      flow += txFlow;
      dayFlowByTicker.set(tx.ticker, (dayFlowByTicker.get(tx.ticker) ?? 0) + txFlow);
    }
    // ── Income: dividends/JCP received (incremental, synced with custody) ──
    let income = 0;
    const dayIncByTicker = new Map<string, number>();
    while (incIdx < sortedInc.length && sortedInc[incIdx].bizDate <= date) {
      const inc = sortedInc[incIdx++];
      const incBrl = inc.valor * fxFactor(inc.moeda, fx);
      income += incBrl;
      dayIncByTicker.set(inc.ticker, (dayIncByTicker.get(inc.ticker) ?? 0) + incBrl);
    }

    // ── RF flows (compra/venda of renda fixa) ──
    const rfFlow = rfFlowByDate?.[date] ?? 0;
    flow += rfFlow;
    if (rfFlow > 0) totalInvestido += rfFlow;

    // ── NAV data healing: forward-fill if price gaps produce 0/NaN ──
    if (i > 0 && prevNav > 0 && (nav <= 0 || !isFinite(nav))) {
      nav = Math.max(0, prevNav + flow);
    }

    // ── MWR flow tracking ──
    // Investor cashflows for XIRR: aportes are money IN (positive flow),
    // vendas are money OUT (negative flow), and dividends/JCP received in
    // cash are ALSO money out to the investor — they leave the portfolio.
    // Net investor flow = flow − income. Omitting income would systematically
    // understate MWR for dividend-paying portfolios.
    const netInvestorFlow = flow - income;
    if (Math.abs(netInvestorFlow) > 0.01) {
      mwrFlows.push({ date, amount: netInvestorFlow });
    }

    // ── Modified Dietz daily return (GIPS-compliant) ──
    // Base = prevNav + flow (Start-of-Day convention). The flow is assumed
    // to enter at the START of the day, so the market return applies to
    // (prevNav + flow). This is the standard for daily TWR when exact
    // intraday timing is unknown.
    //
    // Day 0 is ALWAYS an anchor: with no prevNav, the day's flow is not the
    // capital that produced the NAV (in windowed views the NAV carries the
    // whole pre-window portfolio), so Dietz on day 0 would divide a full-
    // portfolio NAV by a tiny flow base. Performance measurement starts at
    // the end of day 0 (GIPS inception-at-first-valuation).
    //
    // After day 0, return is undefined only when base ≤ 0 (no capital).
    // No caps, no ad-hoc thresholds.
    const base = prevNav + flow;
    let ret = 0;
    const forceZero = i > 0 && base <= 0;

    if (i > 0 && !forceZero) {
      ret = ((nav + income) - base) / base;
    }

    cumTwr *= (1 + ret);

    // ── Ganho econômico do dia por setor (insumo da contribuição exata) ──
    // gain(ticker) = Δvalor − flow + income; Σ por setor = ret × base
    // (mesma identidade Dietz do retorno do dia — decomposição exata).
    const dayGains = new Map<string, number>();
    const gainTickers = new Set([
      ...curVals.keys(), ...prevVals.keys(),
      ...dayFlowByTicker.keys(), ...dayIncByTicker.keys(),
    ]);
    for (const t of gainTickers) {
      const g = (curVals.get(t) ?? 0) - (prevVals.get(t) ?? 0)
        - (dayFlowByTicker.get(t) ?? 0) + (dayIncByTicker.get(t) ?? 0);
      if (g !== 0) {
        const s = setorOf(t);
        dayGains.set(s, (dayGains.get(s) ?? 0) + g);
      }
    }
    const rfGain = navRF - prevNavRF - rfFlow;
    if (rfGain !== 0) dayGains.set(RF_SECTOR, (dayGains.get(RF_SECTOR) ?? 0) + rfGain);
    sectorGainsByDay.push(dayGains);

    const dayNavs = new Map<string, number>();
    for (const [t, v] of curVals) {
      const s = setorOf(t);
      dayNavs.set(s, (dayNavs.get(s) ?? 0) + v);
    }
    if (navRF > 0) dayNavs.set(RF_SECTOR, (dayNavs.get(RF_SECTOR) ?? 0) + navRF);
    sectorNavByDay.push(dayNavs);

    points.push({ date, nav, flow, income, ret, twr: cumTwr - 1, forceZero, navFx });
    prevVals = curVals;
    prevNavRF = navRF;
    prevNav = nav;
  }

  // Find first day with NAV > 0 (first capital injection)
  const firstMeaningful = points.find(p => p.nav > 0);
  if (!firstMeaningful) return { ...EMPTY, points };

  const last = points[points.length - 1];
  const firstIdx = points.indexOf(firstMeaningful);

  // Recompute cumTwr starting from firstMeaningful (skip pre-capital noise)
  let cleanCum = 1.0;
  for (let i = firstIdx; i < points.length; i++) {
    if (!points[i].forceZero) {
      cleanCum *= (1 + points[i].ret);
    }
    points[i].twr = cleanCum - 1;
  }
  for (let i = 0; i < firstIdx; i++) {
    points[i].twr = 0;
  }

  const twrTotal = cleanCum - 1;

  // ── Contribuição exata por setor ────────────────────────────────────────────
  // Identidade telescópica: Π(1+ret_i) − 1 = Σ_i ret_i × Π_{k<i}(1+ret_k).
  // Com ret_i = Σ_s gain_{s,i}/base_i, a contribuição de cada setor é
  // Σ_i (gain_{s,i}/base_i) × linkFactor_i e a soma de TODOS os setores é
  // exatamente twrTotal. Dias com NAV healing geram resíduo → bucket "Ajustes".
  const contribAcc = new Map<string, number>();
  {
    let linkFactor = 1.0;
    for (let i = firstIdx; i < points.length; i++) {
      const p = points[i];
      if (i >= 1 && !p.forceZero) {
        const base = points[i - 1].nav + p.flow;
        if (base > 0) {
          let sum = 0;
          for (const [s, g] of sectorGainsByDay[i]) {
            const c = g / base;
            sum += c;
            contribAcc.set(s, (contribAcc.get(s) ?? 0) + c * linkFactor);
          }
          const resid = p.ret - sum;
          if (Math.abs(resid) > 1e-12) {
            contribAcc.set("Ajustes", (contribAcc.get("Ajustes") ?? 0) + resid * linkFactor);
          }
        }
      }
      if (!p.forceZero) linkFactor *= 1 + p.ret;
    }
  }
  const sectorNavSum = new Map<string, number>();
  const navDaysCount = points.length - firstIdx;
  for (let i = firstIdx; i < points.length; i++) {
    for (const [s, v] of sectorNavByDay[i]) {
      sectorNavSum.set(s, (sectorNavSum.get(s) ?? 0) + v);
    }
  }
  const contribuicoes = [...contribAcc.entries()]
    .map(([setor, contrib]) => ({
      setor,
      contrib,
      navMedio: navDaysCount > 0 ? (sectorNavSum.get(setor) ?? 0) / navDaysCount : 0,
    }))
    .sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib));

  // Annualize using calendar days / 365 (matching Streamlit calculator.py line 401)
  const startD = new Date(firstMeaningful.date + "T12:00:00Z");
  const endD = new Date(last.date + "T12:00:00Z");
  const calendarDays = Math.round((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24));
  const duracaoAnos = calendarDays / 365;

  const twrAnualizado = calendarDays > 20 && (1 + twrTotal) > 0
    ? Math.pow(1 + twrTotal, 365 / calendarDays) - 1
    : twrTotal;

  // ── Ganho econômico: exact accounting identity over the measured period ──
  // It is the telescoped sum of the daily economic gains
  // ((nav + income) − prevNav − flow) over every day the TWR measures:
  //
  //   • firstIdx === 0 → day 0 is the ANCHOR (windowed view, or first purchase
  //     on the very first date). Measurement starts at end of day 0:
  //       GE = navFinal − nav₀ − Σ_{i≥1} flow + Σ_{i≥1} income
  //     Flows/income ON the anchor day belong to the opening capital, not to
  //     the window — counting anchor-day income was the source of pre-window
  //     dividend leakage.
  //
  //   • firstIdx > 0 → capital first entered on day f via its flow (prevNav=0):
  //       GE = navFinal − Σ_{i≥f} flow + Σ_{i≥f} income
  //     Day f's own gain (nav_f − flow_f) IS part of the period, matching the
  //     TWR which also computes day f's Dietz return.
  const isAnchor = firstIdx === 0;
  const geStartIdx = isAnchor ? 1 : firstIdx;
  let flowsFromFirst = 0;
  let incomeFromFirst = 0;
  for (let i = geStartIdx; i < points.length; i++) {
    flowsFromFirst += points[i].flow;
    incomeFromFirst += points[i].income;
  }
  const navBase = isAnchor ? firstMeaningful.nav : 0;
  const firstMeaningfulFlow = isAnchor ? points[0].flow : 0;
  const ganhoEconomico = last.nav - navBase - flowsFromFirst + incomeFromFirst;

  // Exclude flows on or before firstMeaningful.date — they're already
  // captured in navInicial (end-of-day NAV). Including them double-counts
  // the initial investment, systematically understating MWR.
  const mwrFlowsAfterFirst = mwrFlows.filter(f => f.date > firstMeaningful.date);
  const mwr = calculateMWR(
    mwrFlowsAfterFirst, last.nav, last.date,
    firstMeaningful.nav, firstMeaningful.date,
  );

  // Custo da RF aberta: preferir o costBasisAtual do buildRfTimeline (por
  // ticker, floor 0). O fallback de net-flows fica para compat, mas zera o
  // custo da RF aberta quando resgates históricos superam as compras atuais.
  if (input.rfCostBasis != null) {
    custoPosicoesAtuais += input.rfCostBasis;
  } else {
    let rfCostBasis = 0;
    if (rfFlowByDate) {
      for (const v of Object.values(rfFlowByDate)) rfCostBasis += v;
    }
    if (rfCostBasis > 0) custoPosicoesAtuais += rfCostBasis;
  }

  let incomeTotal = 0;
  for (const p of points) incomeTotal += p.income;

  // forceZero days only count inside the measured period (after firstIdx).
  // Pre-capital days (nav = 0 before the first purchase) are structurally
  // base ≤ 0 and irrelevant — counting them would inflate the diagnostic.
  const forceZeroDays = points.slice(firstIdx).filter(p => p.forceZero).length;

  // Preços congelados: ticker AINDA em custódia cujo último preço REAL é mais
  // antigo que 7 dias corridos vs a última data — o ffill está sustentando o
  // NAV com preço velho (delisting, fonte parada). Reportado, não mascarado.
  const stalePrices: Array<{ ticker: string; lastPriceDate: string }> = [];
  const lastCustody = custody[custody.length - 1] ?? {};
  const lastDateMs = new Date(lastDate + "T12:00:00Z").getTime();
  for (const [ticker, qty] of Object.entries(lastCustody)) {
    if (qty < 0.000001) continue;
    const idx = lastRealPriceIdx.get(ticker);
    if (idx == null) continue; // sem preço algum → já coberto por tickersAtCost
    const lastPriceDate = dates[idx];
    const gapDays = (lastDateMs - new Date(lastPriceDate + "T12:00:00Z").getTime()) / 86400000;
    if (gapDays > 7) stalePrices.push({ ticker, lastPriceDate });
  }
  stalePrices.sort((a, b) => a.ticker.localeCompare(b.ticker));

  return {
    points,
    twrTotal,
    twrAnualizado,
    navInicial: firstMeaningful.nav,
    navFinal: last.nav,
    duracaoAnos,
    primeiraData: firstMeaningful.date,
    ultimaData: last.date,
    totalInvestido,
    custoPosicoesAtuais,
    ganhoEconomico,
    ganhoDecomposicao: {
      navFinal: Math.round(last.nav),
      navInicial: Math.round(firstMeaningful.nav),
      flowsFromFirst: Math.round(flowsFromFirst),
      firstMeaningfulFlow: Math.round(firstMeaningfulFlow),
      incomeFromFirst: Math.round(incomeFromFirst),
      forceZeroDays,
    },
    mwr,
    contribuicoes,
    diagnostics: {
      forceZeroDays,
      incomeTotal: Math.round(incomeTotal),
      tickersAtCost: [...tickersAtCostSet].sort(),
      fxFallbackDays,
      stalePrices,
    },
  };
}

// ─── CDI benchmark (SELIC proxy with historical rates) ───────────────────────

const SELIC_HISTORICO: [string, number][] = [
  ["2018-01-01", 0.0700],
  ["2018-03-22", 0.0650],
  ["2018-07-01", 0.0650],
  ["2019-02-07", 0.0650],
  ["2019-04-01", 0.0650],
  ["2019-06-20", 0.0650],
  ["2019-08-01", 0.0600],
  ["2019-09-19", 0.0550],
  ["2019-10-31", 0.0500],
  ["2019-12-12", 0.0450],
  ["2020-02-06", 0.0425],
  ["2020-03-19", 0.0375],
  ["2020-05-07", 0.0300],
  ["2020-06-18", 0.0225],
  ["2020-08-06", 0.0200],
  ["2021-03-18", 0.0275],
  ["2021-05-06", 0.0350],
  ["2021-06-17", 0.0425],
  ["2021-08-05", 0.0525],
  ["2021-09-23", 0.0625],
  ["2021-10-28", 0.0775],
  ["2021-12-09", 0.0925],
  ["2022-02-03", 0.1075],
  ["2022-03-17", 0.1175],
  ["2022-05-05", 0.1275],
  ["2022-06-16", 0.1325],
  ["2022-08-04", 0.1375],
  ["2023-08-03", 0.1325],
  ["2023-09-21", 0.1275],
  ["2023-11-02", 0.1225],
  ["2023-12-14", 0.1175],
  ["2024-01-31", 0.1125],
  ["2024-03-21", 0.1075],
  ["2024-05-09", 0.1050],
  ["2024-09-19", 0.1075],
  ["2024-11-07", 0.1125],
  ["2024-12-12", 0.1225],
  ["2025-01-30", 0.1325],
  ["2025-03-20", 0.1425],
  ["2025-05-08", 0.1475],
  ["2025-06-18", 0.1500],
  // ATENÇÃO: tabela manual — decisões do COPOM posteriores precisam ser
  // adicionadas aqui, ou o benchmark CDI fica defasado silenciosamente.
  // Solução definitiva: ingerir CDI da API SGS do BCB na golden source.
];

function isWeekday(date: string): boolean {
  const d = new Date(date + "T12:00:00Z");
  const dow = d.getUTCDay();
  return dow >= 1 && dow <= 5;
}

function getSelicDiaria(date: string): number {
  let rate = SELIC_HISTORICO[0][1];
  for (const [d, r] of SELIC_HISTORICO) {
    if (date >= d) rate = r;
    else break;
  }
  return Math.pow(1 + rate, 1 / 252) - 1;
}

// cdiDiario: taxas reais do BCB (SGS série 12) por data — quando presente, o
// benchmark usa o CDI efetivo (feriados sem entrada na série = acrual 0, que é
// o correto: a tabela SELIC fallback acruava ~9 feriados/ano a mais, inflando
// o benchmark em ~0,4% a.a.). Sem a série (API fora), cai na tabela embutida.
export function buildCDIBenchmark(dates: string[], cdiDiario?: Record<string, number>): TwrDayPoint[] {
  const temCdiReal = cdiDiario != null && Object.keys(cdiDiario).length > 0;
  let cdi = 1.0;
  return dates.map((date, i) => {
    const ret = i === 0 ? 0
      : temCdiReal ? (cdiDiario![date] ?? 0)
      : (!isWeekday(date) ? 0 : getSelicDiaria(date));
    cdi *= 1 + ret;
    return { date, nav: cdi, flow: 0, income: 0, ret, twr: cdi - 1, forceZero: false };
  });
}

// ─── IBOV benchmark builder (from raw price array) ────────────────────────────

export function buildPriceBenchmark(
  _name: string,
  dates: string[],
  prices: (number | null)[]
): TwrDayPoint[] {
  let base: number | null = null;
  let prevPrice: number | null = null;
  let cumTwr = 1.0;

  return dates.map((date, i) => {
    const price = prices[i] ?? prevPrice;
    if (price == null) return { date, nav: 0, flow: 0, income: 0, ret: 0, twr: 0, forceZero: false };

    if (base == null) base = price;
    const ret = prevPrice != null && prevPrice > 0 ? (price - prevPrice) / prevPrice : 0;
    cumTwr *= 1 + ret;
    prevPrice = price;

    return { date, nav: price / base, flow: 0, income: 0, ret, twr: cumTwr - 1, forceZero: false };
  });
}

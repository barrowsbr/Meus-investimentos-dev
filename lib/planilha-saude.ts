// Teste de saúde da planilha — varre as abas principais procurando "doideira
// nos dados": datas que não parseiam, números que não são números, células de
// erro do Sheets (#REF!, #N/A…), headers vazios/duplicados, moedas
// desconhecidas, lock mensal corrompido, etc. Usado pelo card Planilha em
// Configurações. Só LEITURA — não altera nada.

import { readTabRaw, listSheetNames } from "./gsheets";
import { toNumber } from "./format";

export interface AbaSaude {
  tab: string;
  linhas: number;
  colunas: number;
  erros: string[];
  avisos: string[];
}

export interface RelatorioSaude {
  geradoEm: string;
  totalErros: number;
  totalAvisos: number;
  abas: AbaSaude[];
}

const ERR_CELLS = ["#REF!", "#N/A", "#DIV/0!", "#VALUE!", "#NAME?", "#ERROR!", "#NUM!"];

// Data válida: dd/mm/aaaa, ISO — ou SERIAL do Excel (o app converte na leitura
// normal; ex.: 45875 = ago/2025). Sem aceitar serial, proventos importados
// apareciam como falso positivo.
// Serial do Excel plausível (1954–2119), tolerando exibição pt-BR ("45.875").
const serialFrom = (s: string): number | null => {
  const t = s.trim();
  if (!/^[\d.,]+$/.test(t)) return null;
  for (const n of [Number(t.replace(",", ".")), Number(t.replace(/\./g, "").replace(",", "."))]) {
    if (Number.isFinite(n) && n > 20000 && n < 80000) return n;
  }
  return null;
};

const isDate = (s: string) => {
  const t = s.trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t) || /^\d{4}-\d{1,2}-\d{1,2}/.test(t)) return true;
  return serialFrom(t) != null;
};

// Normaliza p/ ISO — para comparar cronologia entre formatos mistos.
const toIso = (s: string): string | null => {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const n = serialFrom(t);
  if (n != null) {
    const d = new Date(Math.floor(n - 25569) * 86400 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return null;
};

// Abas de formato "largo"/livre onde coluna sem nome no cabeçalho é DESENHO,
// não problema (identificador na 1ª coluna, anos como colunas etc.).
const HEADER_LIVRE = new Set(["composicao", "lb_historic"]);

const MOEDAS = new Set(["", "BRL", "USD", "EUR", "CAD", "GBP", "USDT", "R$", "US$"]);

const TIPOS_TRANSACAO = /compra|venda|buy|sell|aporte|resgate|bonif|subscri|desdobra|grupamento|split/i;

// Limita exemplos para o relatório não explodir.
function addCapped(list: string[], msg: string) {
  if (list.length < 12) list.push(msg);
  else if (list.length === 12) list.push("… (mais problemas omitidos)");
}

function colIdx(headers: string[], ...names: string[]): number {
  const low = headers.map((h) => h.trim().toLowerCase());
  for (const n of names) {
    const i = low.findIndex((h) => h === n || h.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

function checarGenerico(tab: string, headers: string[], rows: string[][], erros: string[], avisos: string[]) {
  // Coluna sem nome no cabeçalho: só é problema se tiver DADOS embaixo dela
  // (coluna vazia sobrando é artefato da largura da grade). Abas de formato
  // livre (composicao, lb_historic) são desenho — não avisa.
  const nonEmpty = headers.filter((h) => h.trim() !== "");
  if (nonEmpty.length < headers.length && !HEADER_LIVRE.has(tab.trim().toLowerCase())) {
    const idxSemNome = headers.map((h, i) => (h.trim() === "" ? i : -1)).filter((i) => i >= 0);
    const comDados = idxSemNome.filter((i) => rows.some((r) => (r[i] ?? "").trim() !== ""));
    if (comDados.length > 0) {
      avisos.push(`${comDados.length} coluna(s) sem nome no cabeçalho COM dados (coluna ${comDados.map((i) => i + 1).join(", ")})`);
    }
  }
  const seen = new Set<string>(); const dup = new Set<string>();
  for (const h of nonEmpty) {
    const k = h.trim().toLowerCase();
    if (seen.has(k)) dup.add(h.trim()); else seen.add(k);
  }
  if (dup.size > 0) avisos.push(`Cabeçalho duplicado: ${[...dup].join(", ")}`);

  // Células de erro do Sheets + linhas vazias
  let errCells = 0, emptyRows = 0, wideRows = 0;
  rows.forEach((r, i) => {
    if (r.every((c) => c.trim() === "")) { emptyRows++; return; }
    if (r.length > headers.length && r.slice(headers.length).some((c) => c.trim() !== "")) wideRows++;
    for (const c of r) {
      if (ERR_CELLS.some((e) => c.trim().toUpperCase().startsWith(e))) {
        errCells++;
        if (errCells <= 3) addCapped(erros, `Célula com erro do Sheets na linha ${i + 2}: "${c.trim()}"`);
      }
    }
  });
  if (errCells > 3) addCapped(erros, `… total de ${errCells} células com erro (#REF!/#N/A/…)`);
  if (emptyRows > 0) avisos.push(`${emptyRows} linha(s) totalmente vazia(s)`);
  if (wideRows > 0) avisos.push(`${wideRows} linha(s) com dados além da última coluna do cabeçalho`);
}

type Checker = (headers: string[], rows: string[][], erros: string[], avisos: string[]) => void;

const CHECKERS: Record<string, Checker> = {
  meus_ativos: (h, rows, erros, avisos) => {
    const iData = colIdx(h, "data"); const iTipo = colIdx(h, "tipo");
    const iQtd = colIdx(h, "quantidade"); const iPreco = colIdx(h, "preço", "preco");
    const iMoeda = colIdx(h, "moeda"); const iSimbolo = colIdx(h, "símbolo", "simbolo", "ticker");
    let badDate = 0, badNum = 0, badTipo = 0, badMoeda = 0, semTicker = 0;
    rows.forEach((r, i) => {
      if (r.every((c) => c.trim() === "")) return;
      const ln = i + 2;
      if (iData >= 0 && r[iData]?.trim() && !isDate(r[iData])) { badDate++; if (badDate <= 3) addCapped(erros, `Data inválida na linha ${ln}: "${r[iData]}"`); }
      if (iQtd >= 0 && r[iQtd]?.trim() && toNumber(r[iQtd]) == null) { badNum++; if (badNum <= 3) addCapped(erros, `Quantidade não numérica na linha ${ln}: "${r[iQtd]}"`); }
      if (iPreco >= 0 && r[iPreco]?.trim() && toNumber(r[iPreco]) == null) { badNum++; if (badNum <= 3) addCapped(erros, `Preço não numérico na linha ${ln}: "${r[iPreco]}"`); }
      if (iTipo >= 0 && r[iTipo]?.trim() && !TIPOS_TRANSACAO.test(r[iTipo])) { badTipo++; if (badTipo <= 3) addCapped(avisos, `Tipo de transação desconhecido na linha ${ln}: "${r[iTipo]}"`); }
      if (iMoeda >= 0 && !MOEDAS.has(r[iMoeda]?.trim().toUpperCase() ?? "")) { badMoeda++; if (badMoeda <= 3) addCapped(avisos, `Moeda incomum na linha ${ln}: "${r[iMoeda]}"`); }
      if (iSimbolo >= 0 && !r[iSimbolo]?.trim() && r.some((c) => c.trim() !== "")) { semTicker++; if (semTicker <= 3) addCapped(erros, `Linha ${ln} sem símbolo/ticker`); }
    });
    if (badDate > 3) addCapped(erros, `… total de ${badDate} datas inválidas`);
    if (badNum > 3) addCapped(erros, `… total de ${badNum} números inválidos`);
  },
  meus_proventos: (h, rows, erros, _avisos) => {
    const iData = colIdx(h, "data"); const iValor = colIdx(h, "valor");
    let badDate = 0, badVal = 0;
    rows.forEach((r, i) => {
      if (r.every((c) => c.trim() === "")) return;
      const ln = i + 2;
      if (iData >= 0 && r[iData]?.trim() && !isDate(r[iData])) { badDate++; if (badDate <= 3) addCapped(erros, `Data inválida na linha ${ln}: "${r[iData]}"`); }
      if (iValor >= 0 && r[iValor]?.trim() && toNumber(r[iValor]) == null) { badVal++; if (badVal <= 3) addCapped(erros, `Valor não numérico na linha ${ln}: "${r[iValor]}"`); }
    });
    if (badDate > 3) addCapped(erros, `… total de ${badDate} datas inválidas`);
    if (badVal > 3) addCapped(erros, `… total de ${badVal} valores inválidos`);
  },
  renda_fixa: (h, rows, erros, _a) => {
    const iValor = colIdx(h, "valor");
    let bad = 0;
    rows.forEach((r, i) => {
      if (iValor >= 0 && r[iValor]?.trim() && toNumber(r[iValor]) == null) { bad++; if (bad <= 3) addCapped(erros, `Valor não numérico na linha ${i + 2}: "${r[iValor]}"`); }
    });
    if (bad > 3) addCapped(erros, `… total de ${bad} valores inválidos`);
  },
  fixa_aberta: (h, rows, erros, _a) => {
    const iSaldo = colIdx(h, "atual", "valor_atual", "saldo", "valor");
    let bad = 0;
    rows.forEach((r, i) => {
      if (iSaldo >= 0 && r[iSaldo]?.trim() && toNumber(r[iSaldo]) == null) { bad++; if (bad <= 3) addCapped(erros, `Saldo não numérico na linha ${i + 2}: "${r[iSaldo]}"`); }
    });
    if (bad > 3) addCapped(erros, `… total de ${bad} saldos inválidos`);
  },
  cambio: (h, rows, erros, _a) => {
    const cols = ["valor_origem", "valor_entrada", "valor_destino", "valor_saida", "taxa", "vet"]
      .map((n) => colIdx(h, n)).filter((i) => i >= 0);
    let bad = 0;
    rows.forEach((r, i) => {
      for (const c of cols) {
        if (r[c]?.trim() && toNumber(r[c]) == null) { bad++; if (bad <= 3) addCapped(erros, `Valor/taxa não numérico na linha ${i + 2}: "${r[c]}"`); }
      }
    });
    if (bad > 3) addCapped(erros, `… total de ${bad} valores inválidos`);
  },
  historico_patrimonio: (h, rows, erros, avisos) => {
    const iTotal = colIdx(h, "patrimonio_total"); const iData = colIdx(h, "data"); const iHora = colIdx(h, "hora");
    let bad = 0; const chaves = new Set<string>(); let dups = 0; let prevTs = "";
    let desordem = 0;
    rows.forEach((r, i) => {
      if (r.every((c) => c.trim() === "")) return;
      if (iTotal >= 0) {
        const v = toNumber(r[iTotal]);
        if (v == null || v <= 0) { bad++; if (bad <= 3) addCapped(erros, `patrimonio_total inválido na linha ${i + 2}: "${r[iTotal]}"`); }
      }
      if (iData >= 0) {
        // Normaliza p/ ISO antes de comparar — a coluna mistura formatos
        // (writers diferentes ao longo do tempo) e comparação lexicográfica
        // de formatos mistos gerava falso "fora de ordem".
        const iso = toIso(r[iData] ?? "") ?? r[iData] ?? "";
        const k = `${iso}|${iHora >= 0 ? r[iHora] : ""}`;
        if (chaves.has(k)) dups++; else chaves.add(k);
        if (prevTs && iso < prevTs) desordem++;
        prevTs = iso;
      }
    });
    if (bad > 3) addCapped(erros, `… total de ${bad} totais inválidos`);
    if (dups > 0) avisos.push(`${dups} snapshot(s) duplicado(s) (mesma data+hora)`);
    if (desordem > 0) avisos.push(`${desordem} linha(s) fora de ordem cronológica`);
  },
  twr_mensal: (h, rows, erros, avisos) => {
    const iMonth = colIdx(h, "month"); const iPct = colIdx(h, "return_pct");
    const okMonth = (s: string) => {
      const t = s.trim();
      if (/^\d{4}-\d{1,2}(-\d{1,2})?/.test(t) || /^\d{1,2}\/\d{1,2}\/\d{4}/.test(t) || /^\d{1,2}\/\d{4}/.test(t)) return true;
      return serialFrom(t) != null; // serial (bug antigo — a leitura normaliza)
    };
    let badM = 0, corrompidos = 0; const meses = new Map<string, number>();
    rows.forEach((r, i) => {
      if (r.every((c) => c.trim() === "")) return;
      const ln = i + 2;
      const m = iMonth >= 0 ? (r[iMonth] ?? "").trim() : "";
      if (m && !okMonth(m)) { badM++; if (badM <= 3) addCapped(erros, `month ilegível na linha ${ln}: "${m}"`); }
      if (m) meses.set(m, (meses.get(m) ?? 0) + 1);
      if (iPct >= 0 && r[iPct]?.trim()) {
        const v = toNumber(r[iPct]);
        if (v == null || Math.abs(v) > 500) corrompidos++;
      }
    });
    const dupMeses = [...meses.values()].filter((n) => n > 1).length;
    if (corrompidos > 0) {
      avisos.push(
        `${corrompidos} linha(s) antigas com return_pct corrompido por locale (ex.: 0.755853% gravado virou "755.853") — ` +
        `são IGNORADAS na leitura (o lock recomputa esses meses); use "Compactar twr_mensal" abaixo para limpar de vez`,
      );
    }
    if (dupMeses > 0) {
      avisos.push(`${dupMeses} mês(es) com linhas duplicadas (bug do re-append, já corrigido) — inofensivo; a compactação remove`);
    }
  },
  p_tax: (h, rows, erros, avisos) => {
    const iTaxa = colIdx(h, "taxa");
    const iMoeda = colIdx(h, "moeda");
    let bad = 0, swap = 0; let exSwap = "";
    rows.forEach((r, i) => {
      if (iTaxa < 0 || !r[iTaxa]?.trim()) return;
      if (toNumber(r[iTaxa]) != null) return;
      // "USD"/"EUR" na coluna taxa + número na coluna moeda = colunas invertidas
      // naquela linha (writer antigo com outra ordem), não valor corrompido.
      const pareceMoeda = /^[A-Z]{3}$/.test(r[iTaxa].trim().toUpperCase());
      const moedaNumerica = iMoeda >= 0 && toNumber(r[iMoeda] ?? "") != null;
      if (pareceMoeda && moedaNumerica) {
        swap++; if (!exSwap) exSwap = `linha ${i + 2}`;
      } else {
        bad++; if (bad <= 3) addCapped(erros, `Taxa não numérica na linha ${i + 2}: "${r[iTaxa]}"`);
      }
    });
    if (swap > 0) avisos.push(`${swap} linha(s) com colunas moeda/taxa INVERTIDAS (ex.: ${exSwap}) — a taxa está na coluna moeda; vale corrigir a ordem dessas linhas`);
    if (bad > 3) addCapped(erros, `… total de ${bad} taxas inválidas`);
  },
};

const skipTab = (name: string) => {
  const n = name.trim().toLowerCase();
  return n.startsWith("bkp") || n === "db_cotacoes";
};

export async function checarSaude(): Promise<RelatorioSaude> {
  const names = (await listSheetNames()).filter((n) => !skipTab(n));
  const abas: AbaSaude[] = [];

  // Sequencial de propósito: leitura leve e sem estourar quota da API.
  for (const tab of names) {
    const erros: string[] = [];
    const avisos: string[] = [];
    let linhas = 0, colunas = 0;
    try {
      const { headers, rows } = await readTabRaw(tab);
      linhas = rows.length; colunas = headers.length;
      if (headers.length === 0) {
        avisos.push("Aba vazia (sem cabeçalho)");
      } else {
        checarGenerico(tab, headers, rows, erros, avisos);
        const checker = CHECKERS[tab.trim().toLowerCase()];
        if (checker) checker(headers, rows, erros, avisos);
      }
    } catch (e) {
      erros.push(`Falha ao ler a aba: ${e instanceof Error ? e.message : "erro"}`);
    }
    abas.push({ tab, linhas, colunas, erros, avisos });
  }

  return {
    geradoEm: new Date().toISOString(),
    totalErros: abas.reduce((s, a) => s + a.erros.length, 0),
    totalAvisos: abas.reduce((s, a) => s + a.avisos.length, 0),
    abas,
  };
}

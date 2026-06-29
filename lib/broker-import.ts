/**
 * Lógica COMPARTILHADA de importação de corretora — FONTE ÚNICA.
 *
 * Helpers, builders e deduplicação (proventos / trades / câmbio) usados por:
 *   - app/api/sync/import/handler.ts      (upload de CSV/Excel — IBKR e B3)
 *   - lib/ibkr-flex.ts / ibkr-flex-sync.ts (IBKR Flex Web Service — via API)
 *
 * Antes esta lógica vivia inline no sync/import e havia uma cópia mais fraca em
 * ibkr-sync.ts (causa dos falsos "novos" em ticker com sufixo, câmbio e proventos).
 * Consolidado aqui para que arquivo e API dedupliquem EXATAMENTE igual.
 *
 * Módulo puro (sem I/O / imports server-only).
 */

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface ProventoRow {
  ticker: string;
  data: string;
  decisao: string;
  mes: string;
  ano: string;
  lancamento: string;
  categoria: string;
  valor: string;
  moeda: string;
}

export interface TradeRow {
  Data: string;
  "Tipo de transação": string;
  Símbolo: string;
  Quantidade: string;
  Preço: string;
  "Valor bruto": string;
  "Taxa de corretagem": string;
  "Valor líquido": string;
  Moeda: string;
  Corretora: string;
}

export interface CambioRow {
  data: string;
  moeda_origem: string;
  moeda_destino: string;
  valor_origem: string;
  valor_destino: string;
  taxa: string;
  corretora: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MESES_PT: Record<number, string> = {
  1: "jan", 2: "fev", 3: "mar", 4: "abr", 5: "mai", 6: "jun",
  7: "jul", 8: "ago", 9: "set", 10: "out", 11: "nov", 12: "dez",
};

export function formatMesAno(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T12:00:00Z");
    return `${MESES_PT[d.getUTCMonth() + 1]}/${String(d.getUTCFullYear()).slice(2)}`;
  } catch { return ""; }
}

export function formatValorBR(val: number): string {
  return Math.abs(val).toFixed(2).replace(".", ",");
}

export function normalizeDate(s: string): string {
  // "2024-01-15, 10:30:00" → "2024-01-15"; aceita também o yyyyMMdd da Flex.
  const cleaned = s.replace(/['"]/g, "").trim();
  const iso = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = cleaned.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const brH = cleaned.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (brH) return `${brH[3]}-${brH[2]}-${brH[1]}`;
  const compact = cleaned.match(/^(\d{4})(\d{2})(\d{2})/); // IBKR Flex yyyyMMdd
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return cleaned.slice(0, 10);
}

export function normalizeTicker(t: string): string {
  // Preserva sufixo de bolsa (ex.: VOW3.DE, DPM.TO) — só remove .SA (B3,
  // adicionado automaticamente). O sufixo é o que o Yahoo precisa para precificar.
  const match = t.match(/^([A-Z0-9]+(?:\.[A-Z]{1,2})?)/i);
  return (match ? match[1] : t).replace(/\.SA$/i, "").trim().toUpperCase();
}

/** Remove TODOS os sufixos de bolsa para COMPARAÇÃO — "DPM.TO" e "DPM",
 *  "VOW3.DE" e "VOW3" precisam casar na dedup. */
export function dedupTk(t: string): string {
  return normalizeTicker(t).replace(/\.[A-Z]{1,2}$/i, "");
}

export function parseValor(v: string | number): number {
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (s.includes(",") && !s.includes(".")) return parseFloat(s.replace(",", ".")) || 0;
  if (s.includes(",") && s.includes(".")) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  return parseFloat(s) || 0;
}

export function normalizeTipo(t: string): string {
  const l = t.toLowerCase().trim();
  if (["compra", "buy", "aporte"].includes(l)) return "Compra";
  if (["venda", "sell", "resgate"].includes(l)) return "Venda";
  return t;
}

// ── Forex ──────────────────────────────────────────────────────────────────

export const FOREX_CURRENCIES = new Set(["USD", "EUR", "GBP", "CAD", "CHF", "JPY", "AUD", "HKD", "SGD", "SEK", "NOK", "DKK", "NZD", "BRL"]);

export function isForexSymbol(sym: string): boolean {
  const s = sym.trim().toUpperCase();
  const m = s.match(/^([A-Z]{3})\.([A-Z]{3})$/);
  if (!m) return false;
  return FOREX_CURRENCIES.has(m[1]) && FOREX_CURRENCIES.has(m[2]);
}

// ── Builders (fonte única do formato gravado na planilha) ─────────────────────

export function makeProvento(ticker: string, data: string, lancamento: string, valor: number, moeda: string, categoria: string): ProventoRow {
  const d = new Date(data + "T12:00:00Z");
  return {
    ticker,
    data,
    decisao: lancamento === "IMPOSTO" ? "IMPOSTO" : "Dividendo",
    mes: formatMesAno(data),
    ano: String(d.getUTCFullYear()),
    lancamento,
    categoria,
    valor: formatValorBR(valor),
    moeda,
  };
}

/** Monta uma linha de trade (decimais BR). Genérico — serve para qualquer parser. */
export function makeTradeRow(p: {
  data: string;
  tipo: "Compra" | "Venda";
  ticker: string;
  qtd: number;
  preco: number;
  valorBruto: number;
  comissao: number;
  moeda: string;
  corretora?: string;
}): TradeRow {
  const valorLiquido = p.tipo === "Compra" ? p.valorBruto + p.comissao : p.valorBruto - p.comissao;
  return {
    Data: p.data,
    "Tipo de transação": p.tipo,
    Símbolo: p.ticker,
    Quantidade: String(p.qtd).replace(".", ","),
    Preço: String(p.preco).replace(".", ","),
    "Valor bruto": formatValorBR(p.valorBruto),
    "Taxa de corretagem": formatValorBR(p.comissao),
    "Valor líquido": formatValorBR(valorLiquido),
    Moeda: p.moeda,
    Corretora: p.corretora ?? "IBKR",
  };
}

/** Monta uma linha de câmbio a partir de um par forex. Filtra micro-ajustes de
 *  arredondamento da IBKR (qty<10 e contravalor<10) — retorna null nesse caso.
 *  signedQty > 0 = compra da moeda-base; < 0 = venda. */
export function makeCambioRow(p: {
  date: string;
  base: string;
  quote: string;
  signedQty: number;
  price: number;
  corretora?: string;
}): CambioRow | null {
  if (p.signedQty === 0 || p.price === 0) return null;
  const corretora = p.corretora ?? "IBKR";
  const absQty = Math.abs(p.signedQty);
  const counterValue = absQty * p.price;

  // Micro-operações de arredondamento não são câmbio real.
  if (absQty < 10 && counterValue < 10) return null;

  if (p.signedQty > 0) {
    return {
      data: p.date,
      moeda_origem: p.quote,
      moeda_destino: p.base,
      valor_origem: formatValorBR(counterValue),
      valor_destino: formatValorBR(absQty),
      taxa: formatValorBR(p.price),
      corretora,
    };
  }
  return {
    data: p.date,
    moeda_origem: p.base,
    moeda_destino: p.quote,
    valor_origem: formatValorBR(absQty),
    valor_destino: formatValorBR(counterValue),
    taxa: formatValorBR(absQty / counterValue),
    corretora,
  };
}

// ── Dedup: proventos ──────────────────────────────────────────────────────────

// Assinatura: YYYYMMDD | TICKER_sem_sufixo | I(mposto)/D(ividendo) | round(valor*100).
// O tipo distingue dividendo e withholding de mesmo valor/dia/ticker.
export function sigProvento(data: string, ticker: string, valor: number, decisao: string): string {
  const d = normalizeDate(data).replace(/-/g, "").slice(0, 8);
  const t = dedupTk(ticker);
  const v = Math.round(Math.abs(valor) * 100);
  const tipo = decisao.toLowerCase().includes("imposto") ? "I" : "D";
  return `${d}|${t}|${tipo}|${v}`;
}

export function dedupProventos(
  existing: Record<string, unknown>[],
  incoming: ProventoRow[],
): Map<number, "novo" | "existente"> {
  const existingKeys = new Set<string>();

  for (const row of existing) {
    const ticker = String(row["ticker"] ?? "");
    const data = String(row["data"] ?? "");
    const valor = parseValor(String(row["valor"] ?? "0"));
    const decisao = String(row["decisao"] ?? row["lancamento"] ?? "");
    existingKeys.add(sigProvento(data, ticker, valor, decisao));
  }

  const statuses = new Map<number, "novo" | "existente">();
  for (let i = 0; i < incoming.length; i++) {
    const ev = incoming[i];
    const key = sigProvento(ev.data, ev.ticker, parseValor(ev.valor), ev.decisao);
    statuses.set(i, existingKeys.has(key) ? "existente" : "novo");
  }
  return statuses;
}

// ── Dedup: trades (com detecção de split e ordem fragmentada) ──────────────────

export function dedupTrades(
  existing: Record<string, unknown>[],
  incoming: TradeRow[],
): Map<number, "novo" | "existente" | "split"> {
  const existingTrades: Array<{
    ticker: string; tipo: string; qty: number; preco: number; matched: boolean;
  }> = [];

  for (const row of existing) {
    const ticker = dedupTk(String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? ""));
    const rawTipo = String(row["tipo de transação"] ?? row["tipo de transacao"] ?? row["tipo"] ?? "").trim();
    const tipo = normalizeTipo(rawTipo);
    const qty = Math.round(parseValor(String(row["quantidade"] ?? "0")) * 100) / 100;
    const preco = parseValor(String(row["preço"] ?? row["preco"] ?? row["precio"] ?? "0"));
    if (ticker) existingTrades.push({ ticker, tipo, qty, preco, matched: false });
  }

  function findMatch(ticker: string, tipo: string, qty: number, preco: number): typeof existingTrades[0] | null {
    const q = Math.round(qty);
    const p = Math.round(preco);
    for (const t of existingTrades) {
      if (t.matched) continue;
      if (t.ticker !== ticker) continue;
      if (t.tipo !== tipo) continue;
      if (Math.round(t.qty) !== q) continue;
      if (Math.round(t.preco) !== p) continue;
      return t;
    }
    return null;
  }

  function findSplitMatch(ticker: string, tipo: string, totalValue: number): boolean {
    for (const t of existingTrades) {
      if (t.matched) continue;
      if (t.ticker !== ticker || t.tipo !== tipo) continue;
      const existVal = t.qty * t.preco;
      const diff = Math.abs(existVal - totalValue);
      if (totalValue > 0 && (diff < 5 || diff / totalValue < 0.01)) return true;
    }
    return false;
  }

  // Agrupa ordens fragmentadas (mesmo ticker+tipo+data)
  const groups = new Map<string, number[]>();
  for (let i = 0; i < incoming.length; i++) {
    const t = incoming[i];
    const key = `${dedupTk(t.Símbolo)}|${t["Tipo de transação"]}|${t.Data}`;
    const indices = groups.get(key) ?? [];
    indices.push(i);
    groups.set(key, indices);
  }

  const statuses = new Map<number, "novo" | "existente" | "split">();
  const processedIndices = new Set<number>();

  // Fase A: match por grupo
  for (const [, indices] of groups) {
    if (indices.length <= 1) continue;
    const rows = indices.map(i => incoming[i]);
    let totalQty = 0, totalValue = 0;
    for (const r of rows) {
      const q = Math.abs(parseValor(r.Quantidade));
      const p = Math.abs(parseValor(r.Preço));
      totalQty += q;
      totalValue += q * p;
    }
    const avgPrice = totalQty > 0 ? totalValue / totalQty : 0;
    const ticker = dedupTk(rows[0].Símbolo);
    const tipo = rows[0]["Tipo de transação"];

    const match = findMatch(ticker, tipo, Math.round(totalQty * 100) / 100, avgPrice);
    if (match) {
      match.matched = true;
      for (const idx of indices) { processedIndices.add(idx); statuses.set(idx, "existente"); }
    }
  }

  // Fase B: match individual
  for (let i = 0; i < incoming.length; i++) {
    if (processedIndices.has(i)) continue;
    const row = incoming[i];
    const ticker = dedupTk(row.Símbolo);
    const tipo = row["Tipo de transação"];
    const qty = Math.round(Math.abs(parseValor(row.Quantidade)) * 100) / 100;
    const preco = Math.abs(parseValor(row.Preço));

    const match = findMatch(ticker, tipo, qty, preco);
    if (match) {
      match.matched = true;
      statuses.set(i, "existente");
    } else if (findSplitMatch(ticker, tipo, qty * preco)) {
      statuses.set(i, "split");
    } else {
      statuses.set(i, "novo");
    }
  }

  return statuses;
}

// ── Câmbio: dedup + escrita ────────────────────────────────────────────────

// fuzzyGet de 3 camadas (exact → normalized → substring)
export function fGet(row: Record<string, unknown>, ...patterns: string[]): string {
  const keys = Object.keys(row);
  for (const p of patterns) {
    if (row[p] !== undefined && row[p] !== null && row[p] !== "") return String(row[p]);
  }
  for (const p of patterns) {
    const norm = p.replace(/[_\s]/g, "").toLowerCase();
    for (const k of keys) {
      if (k.replace(/[_\s]/g, "").toLowerCase() === norm && row[k] !== undefined && row[k] !== null && row[k] !== "")
        return String(row[k]);
    }
  }
  for (const p of patterns) {
    for (const k of keys) {
      if (k.toLowerCase().includes(p.toLowerCase()) && row[k] !== undefined && row[k] !== null && row[k] !== "")
        return String(row[k]);
    }
  }
  return "";
}

export function dedupCambio(
  existing: Record<string, unknown>[],
  incoming: CambioRow[],
): Map<number, "novo" | "existente"> {
  const existingOps: Array<{ data: string; orig: string; dest: string; valDest: number; valOrig: number; matched: boolean }> = [];

  for (const row of existing) {
    const data = normalizeDate(fGet(row, "data", "date"));
    const orig = fGet(row, "moeda_origem", "moeda origem", "de", "origem").toUpperCase().trim();
    const dest = fGet(row, "moeda_destino", "moeda destino", "para", "destino").toUpperCase().trim();
    const valDestStr = fGet(row, "valor_destino", "valor total saída", "valor total saida", "valor saída", "valor_saida", "valor saida", "valor recebido", "recebido", "usd") || "0";
    const valOrigStr = fGet(row, "valor_origem", "valor total entrada", "valor entrada", "valor_entrada", "valor enviado", "enviado", "brl") || "0";
    const valDest = Math.round(parseValor(valDestStr));
    const valOrig = Math.round(parseValor(valOrigStr));
    if (data && (orig || dest)) existingOps.push({ data, orig, dest, valDest, valOrig, matched: false });
  }

  const statuses = new Map<number, "novo" | "existente">();

  for (let i = 0; i < incoming.length; i++) {
    const c = incoming[i];
    const data = c.data;
    const dest = c.moeda_destino;
    const val = Math.round(parseValor(c.valor_destino));
    const orig = c.moeda_origem;
    const incomingValOrig = Math.round(parseValor(c.valor_origem));
    let found = false;
    for (const e of existingOps) {
      if (e.matched) continue;
      if (e.data !== data) continue;
      if (e.dest && dest && e.dest !== dest) continue;
      if (e.orig && orig && e.orig !== orig) continue;
      const matchDest = e.valDest > 0 && Math.abs(e.valDest - val) <= 2;
      const matchOrig = e.valOrig > 0 && Math.abs(e.valOrig - incomingValOrig) <= 2;
      if (!matchDest && !matchOrig) continue;
      e.matched = true;
      found = true;
      break;
    }
    statuses.set(i, found ? "existente" : "novo");
  }

  return statuses;
}

/** Converte CambioRow[] em linhas posicionais conforme os headers reais da aba
 *  `cambio` (appendRows escreve por posição, não por nome). */
export function cambioRowsForSheet(sheetHeaders: string[], cambio: CambioRow[]): string[][] {
  const FIELD_MAP: Record<string, (c: CambioRow) => string> = {
    data: c => c.data,
    date: c => c.data,
    moeda_origem: c => c.moeda_origem,
    "moeda origem": c => c.moeda_origem,
    origem: c => c.moeda_origem,
    de: c => c.moeda_origem,
    moeda_destino: c => c.moeda_destino,
    "moeda destino": c => c.moeda_destino,
    destino: c => c.moeda_destino,
    para: c => c.moeda_destino,
    valor_origem: c => c.valor_origem,
    "valor total entrada": c => c.valor_origem,
    "valor entrada": c => c.valor_origem,
    valor_entrada: c => c.valor_origem,
    enviado: c => c.valor_origem,
    valor_destino: c => c.valor_destino,
    "valor total saída": c => c.valor_destino,
    "valor total saida": c => c.valor_destino,
    "valor saída": c => c.valor_destino,
    valor_saida: c => c.valor_destino,
    "valor saida": c => c.valor_destino,
    recebido: c => c.valor_destino,
    taxa: c => c.taxa,
    vet: c => c.taxa,
    "câmbio": c => c.taxa,
    cambio: c => c.taxa,
    rate: c => c.taxa,
    corretora: c => c.corretora,
    "corretora destino": c => c.corretora,
    "instituição": c => c.corretora,
    instituicao: c => c.corretora,
  };

  function resolveField(header: string): ((c: CambioRow) => string) | null {
    const h = header.toLowerCase().trim();
    if (FIELD_MAP[h]) return FIELD_MAP[h];
    const norm = h.replace(/[_\s]/g, "");
    for (const [k, fn] of Object.entries(FIELD_MAP)) {
      if (k.replace(/[_\s]/g, "") === norm) return fn;
    }
    return null;
  }

  const headers = sheetHeaders.length > 0
    ? sheetHeaders
    : ["data", "moeda_origem", "moeda_destino", "valor_origem", "valor_destino", "taxa", "corretora"];
  const mappers = headers.map(h => resolveField(h));
  return cambio.map(c => mappers.map(fn => fn ? fn(c) : ""));
}

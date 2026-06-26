import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getDataStore } from "@/lib/data-store";
import { backupTab } from "@/lib/backup";
import { resolveMultipleAssets, persistAssetMeta, type AssetMeta } from "@/lib/asset-meta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Types ────────────────────────────────────────────────────────────────────

interface PreviewItem {
  ticker: string;
  data: string;
  tipo: string;
  valor: string;
  moeda: string;
  corretora: string;
  categoria: "provento" | "trade" | "cambio";
  detalhe: string;
  status: "novo" | "existente" | "split";
  meta?: {
    yahooSymbol: string;
    exchange: string;
    currency: string;
    sector: string;
    longName: string;
  };
}

interface ProventoRow {
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

interface TradeRow {
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

interface CambioRow {
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

function formatMesAno(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T12:00:00Z");
    return `${MESES_PT[d.getUTCMonth() + 1]}/${String(d.getUTCFullYear()).slice(2)}`;
  } catch { return ""; }
}

function formatValorBR(val: number): string {
  return Math.abs(val).toFixed(2).replace(".", ",");
}

function normalizeDate(s: string): string {
  // "2024-01-15, 10:30:00" → "2024-01-15"
  const cleaned = s.replace(/['"]/g, "").trim();
  const iso = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = cleaned.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const brH = cleaned.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (brH) return `${brH[3]}-${brH[2]}-${brH[1]}`;
  return cleaned.slice(0, 10);
}

function normalizeTicker(t: string): string {
  // Preserva sufixo de bolsa (ex.: VOW3.DE, DPM.TO) — o regex captura
  // ticker + ponto + sufixo. Só remove .SA (B3 — adicionado automaticamente).
  const match = t.match(/^([A-Z0-9]+(?:\.[A-Z]{1,2})?)/i);
  return (match ? match[1] : t).replace(/\.SA$/i, "").trim().toUpperCase();
}

// Strip ALL exchange suffixes for dedup comparison — "DPM.TO" and "DPM" must match
function dedupTk(t: string): string {
  return normalizeTicker(t).replace(/\.[A-Z]{1,2}$/i, "");
}

function parseValor(v: string | number): number {
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (s.includes(",") && !s.includes(".")) return parseFloat(s.replace(",", ".")) || 0;
  if (s.includes(",") && s.includes(".")) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  return parseFloat(s) || 0;
}

function normalizeTipo(t: string): string {
  const l = t.toLowerCase().trim();
  if (["compra", "buy", "aporte"].includes(l)) return "Compra";
  if (["venda", "sell", "resgate"].includes(l)) return "Venda";
  return t;
}

const NON_TICKERS = new Set(["TOTAL", "SUBTOTAL", "NOTES", "HEADER", "DATA"]);

function extractTickerFromDesc(desc: string): string {
  const m = desc.match(/^([A-Z0-9]{1,10})\s*[\(]/i);
  if (m) {
    const t = m[1].toUpperCase();
    if (!NON_TICKERS.has(t)) return t;
  }
  const m2 = desc.match(/^([A-Z]{1,5}\d{0,2})\b/i);
  if (m2) {
    const t = m2[1].toUpperCase();
    if (!NON_TICKERS.has(t)) return t;
  }
  return "";
}

// ── Source detection ─────────────────────────────────────────────────────────

type Source = "ibkr" | "b3" | "desconhecido";

function detectSource(content: string): Source {
  const lower = content.toLowerCase();
  if (lower.includes("histórico de transações") || lower.includes("historico de transacoes")) return "ibkr";
  if (/^trades,header/im.test(content) || /^dividends,header/im.test(content)) return "ibkr";
  if (/^trades,data/im.test(content) || /^dividends,data/im.test(content)) return "ibkr";
  if (lower.includes("interactive brokers") || lower.includes("ibkr")) return "ibkr";
  if (lower.includes("withholding tax")) return "ibkr";
  if (content.includes(";")) {
    if (lower.includes("código") || lower.includes("ticker") || lower.includes("ativo")
      || lower.includes("evento") || lower.includes("data com")) return "b3";
  }
  return "desconhecido";
}

// ── IBKR Parser (multiple formats) ──────────────────────────────────────────

function parseIBKR(content: string): { proventos: ProventoRow[]; trades: TradeRow[]; cambio: CambioRow[] } {
  const proventos: ProventoRow[] = [];
  const trades: TradeRow[] = [];
  const cambio: CambioRow[] = [];
  const lines = content.split(/\r?\n/);

  // Format 1: Portuguese "Histórico de transações"
  for (const line of lines) {
    if (!line.startsWith("Histórico de transações,") && !line.startsWith("Historico de transacoes,")) continue;
    const parts = smartSplit(line);
    if (parts.length < 11) continue;

    const data = normalizeDate(parts[2] ?? "");
    const descricao = parts[4] ?? "";
    const tipo = parts[5] ?? "";
    const simbolo = parts[6] ?? "";
    const moedaPreco = (parts[9] ?? "").trim();
    const valorStr = parts[10] ?? "";

    if (!data || !simbolo) continue;

    // Detect forex: symbol like "EUR.USD", "GBP.USD", "CAD.USD"
    if (isForexSymbol(simbolo)) {
      const fx = parseForexTrade(simbolo, data, tipo, parts);
      if (fx) { cambio.push(fx); continue; }
    }

    const ticker = normalizeTicker(simbolo);
    const moeda = resolveIbkrCurrency(moedaPreco, descricao);

    if (tipo === "Dividendo" || tipo === "Dividend") {
      const valor = parseValor(valorStr);
      if (!valor || valor < 0) continue; // skip reversals
      proventos.push(makeProvento(ticker, data, "Dividendo", valor, moeda, "Ação Internacional"));
    } else if (tipo.includes("imposto") || tipo.includes("Tax") || tipo.includes("Retenção")) {
      const valor = parseValor(valorStr);
      if (!valor) continue;
      proventos.push(makeProvento(ticker, data, "IMPOSTO", Math.abs(valor), moeda, "Ação Internacional"));
    } else if (["Compra", "Venda", "Buy", "Sell"].includes(tipo)) {
      trades.push(makeTrade(parts, ticker, tipo, moeda));
    }
  }

  // Format 2: English Activity Statement (section-based)
  if (proventos.length === 0 && trades.length === 0 && cambio.length === 0) {
    parseActivityStatement(lines, proventos, trades, cambio);
  }

  return { proventos, trades, cambio };
}

function parseActivityStatement(lines: string[], proventos: ProventoRow[], trades: TradeRow[], cambio: CambioRow[]) {
  for (const line of lines) {
    const parts = smartSplit(line);
    if (parts.length < 3) continue;
    const section = parts[0]?.trim();
    const rowType = parts[1]?.trim();

    if (rowType !== "Data") continue;

    if (section === "Trades" && parts.length >= 10) {
      const assetCategory = parts[3]?.trim() || "";
      const currency = parts[4]?.trim() || "USD";
      const rawSymbol = parts[5] ?? "";
      const date = normalizeDate(parts[6] ?? "");

      // Forex trades: asset category "Forex" or symbol like "EUR.USD"
      if (assetCategory === "Forex" || isForexSymbol(rawSymbol)) {
        const fx = parseForexTradeActivity(rawSymbol, date, parts);
        if (fx) { cambio.push(fx); continue; }
      }

      const symbol = normalizeTicker(rawSymbol);
      const qty = Math.abs(parseValor(parts[7] ?? "0"));
      const price = Math.abs(parseValor(parts[8] ?? "0"));
      const proceeds = Math.abs(parseValor(parts[10] ?? "0"));
      const commission = Math.abs(parseValor(parts[11] ?? "0"));

      if (!symbol || !date || qty === 0) continue;

      const tipo = parseValor(parts[7] ?? "0") >= 0 ? "Compra" : "Venda";
      const valorBruto = proceeds > 0 ? proceeds : qty * price;
      const valorLiquido = tipo === "Compra" ? valorBruto + commission : valorBruto - commission;

      trades.push({
        Data: date,
        "Tipo de transação": tipo,
        Símbolo: symbol,
        Quantidade: String(qty).replace(".", ","),
        Preço: String(price).replace(".", ","),
        "Valor bruto": formatValorBR(valorBruto),
        "Taxa de corretagem": formatValorBR(commission),
        "Valor líquido": formatValorBR(valorLiquido),
        Moeda: currency,
        Corretora: "IBKR",
      });
    }

    if (section === "Dividends" && parts.length >= 5) {
      const currency = parts[2]?.trim() || "USD";
      const date = normalizeDate(parts[3] ?? "");
      const desc = parts[4] ?? "";
      const amount = parseValor(parts[5] ?? "0");

      if (!date || !date.match(/^\d{4}-\d{2}-\d{2}$/) || amount === 0) continue;
      if (amount < 0) continue; // reversal — skip
      if (/\bTotal\b/i.test(desc) || /\(Reversal\)/i.test(desc)) continue;
      const ticker = extractTickerFromDesc(desc);
      if (!ticker) continue;
      proventos.push(makeProvento(ticker, date, "Dividendo", amount, currency, "Ação Internacional"));
    }

    if ((section === "Withholding Tax" || section === "WithholdingTax") && parts.length >= 5) {
      const currency = parts[2]?.trim() || "USD";
      const date = normalizeDate(parts[3] ?? "");
      const desc = parts[4] ?? "";
      const amount = parseValor(parts[5] ?? "0");

      if (!date || !date.match(/^\d{4}-\d{2}-\d{2}$/) || amount === 0) continue;
      if (amount > 0) continue; // tax refund — skip (actual withholdings are negative)
      if (/\bTotal\b/i.test(desc) || /\(Reversal\)/i.test(desc)) continue;
      const ticker = extractTickerFromDesc(desc);
      if (!ticker) continue;
      proventos.push(makeProvento(ticker, date, "IMPOSTO", Math.abs(amount), currency, "Ação Internacional"));
    }
  }
}

// ── Forex helpers ───────────────────────────────────────────────────────────

const FOREX_CURRENCIES = new Set(["USD", "EUR", "GBP", "CAD", "CHF", "JPY", "AUD", "HKD", "SGD", "SEK", "NOK", "DKK", "NZD", "BRL"]);

function isForexSymbol(sym: string): boolean {
  const s = sym.trim().toUpperCase();
  const m = s.match(/^([A-Z]{3})\.([A-Z]{3})$/);
  if (!m) return false;
  return FOREX_CURRENCIES.has(m[1]) && FOREX_CURRENCIES.has(m[2]);
}

// Format 1 (Portuguese "Histórico de transações"): forex rows
function parseForexTrade(symbol: string, date: string, tipo: string, parts: string[]): CambioRow | null {
  const m = symbol.trim().toUpperCase().match(/^([A-Z]{3})\.([A-Z]{3})$/);
  if (!m) return null;
  const [, base, quote] = m;
  const qty = parseValor(parts[7] ?? "0");
  const price = Math.abs(parseValor(parts[8] ?? "0"));
  if (qty === 0 || price === 0) return null;

  const absQty = Math.abs(qty);
  const counterValue = absQty * price;

  // IBKR gera micro-operações de arredondamento (qty < 10) que não são câmbio real
  if (absQty < 10 && counterValue < 10) return null;

  if (qty > 0) {
    return {
      data: date,
      moeda_origem: quote,
      moeda_destino: base,
      valor_origem: formatValorBR(counterValue),
      valor_destino: formatValorBR(absQty),
      taxa: formatValorBR(price),
      corretora: "IBKR",
    };
  } else {
    return {
      data: date,
      moeda_origem: base,
      moeda_destino: quote,
      valor_origem: formatValorBR(absQty),
      valor_destino: formatValorBR(counterValue),
      taxa: formatValorBR(absQty / counterValue),
      corretora: "IBKR",
    };
  }
}

// Format 2 (Activity Statement): forex in Trades section
function parseForexTradeActivity(rawSymbol: string, date: string, parts: string[]): CambioRow | null {
  const sym = rawSymbol.trim().toUpperCase();
  const m = sym.match(/^([A-Z]{3})\.([A-Z]{3})$/);
  if (!m) return null;
  const [, base, quote] = m;
  const qty = parseValor(parts[7] ?? "0");
  const price = Math.abs(parseValor(parts[8] ?? "0"));
  if (qty === 0 || price === 0) return null;

  if (!date || !date.match(/^\d{4}-\d{2}-\d{2}$/)) return null;

  const absQty = Math.abs(qty);
  const counterValue = absQty * price;

  if (absQty < 10 && counterValue < 10) return null;

  if (qty > 0) {
    return {
      data: date,
      moeda_origem: quote,
      moeda_destino: base,
      valor_origem: formatValorBR(counterValue),
      valor_destino: formatValorBR(absQty),
      taxa: formatValorBR(price),
      corretora: "IBKR",
    };
  } else {
    return {
      data: date,
      moeda_origem: base,
      moeda_destino: quote,
      valor_origem: formatValorBR(absQty),
      valor_destino: formatValorBR(counterValue),
      taxa: formatValorBR(absQty / counterValue),
      corretora: "IBKR",
    };
  }
}

function smartSplit(line: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { parts.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  parts.push(current.trim());
  return parts;
}

const KNOWN_CURRENCIES = new Set(["USD", "CAD", "EUR", "GBP", "JPY", "CHF", "AUD", "HKD", "SGD", "SEK", "NOK", "DKK", "NZD"]);

function resolveIbkrCurrency(moedaPreco: string, desc: string): string {
  if (moedaPreco && moedaPreco !== "-" && KNOWN_CURRENCIES.has(moedaPreco.toUpperCase())) {
    return moedaPreco.toUpperCase();
  }
  return detectCurrency(desc);
}

function detectCurrency(desc: string): string {
  for (const m of ["CAD", "EUR", "GBP", "JPY", "CHF", "AUD"]) {
    if (desc.includes(m)) return m;
  }
  return "USD";
}

function makeProvento(ticker: string, data: string, lancamento: string, valor: number, moeda: string, categoria: string): ProventoRow {
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

function makeTrade(parts: string[], ticker: string, tipo: string, moeda: string): TradeRow {
  const qtdStr = parts[7] ?? "0";
  const precoStr = parts[8] ?? "0";
  const valorStr = parts[10] ?? "0";
  const comissaoStr = parts[11] ?? "0";

  const qtd = Math.abs(parseValor(qtdStr));
  const preco = Math.abs(parseValor(precoStr));
  const comissao = Math.abs(parseValor(comissaoStr));
  let valorBruto = Math.abs(parseValor(valorStr));
  if (valorBruto === 0 && qtd > 0 && preco > 0) valorBruto = Math.round(qtd * preco * 100) / 100;
  const tipoNorm = normalizeTipo(tipo);
  const valorLiquido = tipoNorm === "Compra" ? valorBruto + comissao : valorBruto - comissao;

  return {
    Data: normalizeDate(parts[2] ?? ""),
    "Tipo de transação": tipoNorm,
    Símbolo: ticker,
    Quantidade: String(qtd).replace(".", ","),
    Preço: String(preco).replace(".", ","),
    "Valor bruto": formatValorBR(valorBruto),
    "Taxa de corretagem": formatValorBR(comissao),
    "Valor líquido": formatValorBR(valorLiquido),
    Moeda: moeda,
    Corretora: "IBKR",
  };
}

// ── B3 Parser ────────────────────────────────────────────────────────────────

function parseB3(content: string): { proventos: ProventoRow[]; trades: TradeRow[] } {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { proventos: [], trades: [] };

  const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";

  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const h = lines[i].split(sep).map(c => c.trim().toLowerCase());
    if (h.some(c => c.includes("código") || c.includes("ticker") || c.includes("ativo") || c.includes("produto"))) {
      headerIdx = i;
      headers = h;
      break;
    }
  }

  if (headerIdx === -1) return { proventos: [], trades: [] };

  const findCol = (keywords: string[]) => {
    for (const kw of keywords) {
      const idx = headers.findIndex(h => h.includes(kw));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const tickerCol = findCol(["código", "ticker", "ativo", "produto", "papel"]);
  const dataCol = findCol(["data com", "data pagamento", "data", "pagamento"]);
  const valorCol = findCol(["valor por", "valor cota", "valor unit", "rendimento", "valor"]);
  const tipoCol = findCol(["evento", "tipo", "lançamento", "provento"]);

  const proventos: ProventoRow[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 3) continue;

    const rawTicker = tickerCol !== -1 ? cols[tickerCol] : "";
    if (!rawTicker) continue;
    const ticker = normalizeTicker(rawTicker);
    if (ticker.length < 4) continue;

    const rawData = dataCol !== -1 ? cols[dataCol] : "";
    if (!rawData) continue;
    const data = normalizeDate(rawData);
    if (!data.match(/^\d{4}-\d{2}-\d{2}$/)) continue;

    const rawValor = valorCol !== -1 ? cols[valorCol] : "0";
    const valor = parseValor(rawValor);
    if (valor <= 0) continue;

    const rawTipo = tipoCol !== -1 ? cols[tipoCol] : "";
    let lancamento = "Dividendo";
    let categoria = "Ações Brasil";

    const tipoLower = rawTipo.toLowerCase();
    if (tipoLower.includes("jcp") || tipoLower.includes("juros")) lancamento = "JCP";
    else if (tipoLower.includes("rend") || tipoLower.includes("fii")) { lancamento = "Rendimento"; categoria = "FIIs"; }
    else if (tipoLower.includes("amort")) lancamento = "Amortização";

    proventos.push(makeProvento(ticker, data, lancamento, valor, "BRL", categoria));
  }

  return { proventos, trades: [] };
}

// ── B3 Excel Parser (.xlsx "Movimentação") ──────────────────────────────────

// Extrai ticker do campo "Produto" da B3: texto antes de " - ".
// Ex.: "KNCR11 - KINEA RENDIMENTOS..." → "KNCR11"
function extractTickerB3(produto: string): string {
  if (typeof produto !== "string") return "";
  const s = produto.trim();
  if (s.includes(" - ")) {
    const candidate = s.split(" - ")[0].trim().toUpperCase();
    if (/^[A-Z]{3,6}[0-9]{1,2}[A-Z]?$/.test(candidate)) return candidate;
  }
  return s.toUpperCase();
}

// Normaliza a coluna Data: pode vir como Date (cellDates:true) ou string BR.
function normalizeExcelDate(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().split("T")[0];
  }
  return normalizeDate(String(v ?? ""));
}

// Lê um valor de coluna do objeto-linha de forma case/acento-insensível.
function getField(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (name in row) return row[name];
  }
  // Fallback: comparação normalizada (lowercase, sem espaços extras)
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const target = names.map(norm);
  for (const key of Object.keys(row)) {
    if (target.includes(norm(key))) return row[key];
  }
  return "";
}

function parseB3Excel(rows: Record<string, unknown>[]): { proventos: ProventoRow[]; trades: TradeRow[] } {
  const proventos: ProventoRow[] = [];
  const trades: TradeRow[] = [];

  const PROVENTO_TIPOS = ["dividendo", "juros sobre capital próprio", "rendimento"];
  const futuresPattern = /^(WIN|WDO|IND|DOL|WSP|BGI)/;

  for (const row of rows) {
    const entradaSaida = String(getField(row, "Entrada/Saída", "Entrada/Saida")).trim().toLowerCase();
    const movimentacao = String(getField(row, "Movimentação", "Movimentacao")).trim();
    const movLower = movimentacao.toLowerCase();
    const produto = String(getField(row, "Produto"));
    const data = normalizeExcelDate(getField(row, "Data"));
    const ticker = extractTickerB3(produto);

    // ── Proventos: Crédito + (Dividendo / JCP / Rendimento) ──
    if (entradaSaida === "credito" && PROVENTO_TIPOS.includes(movLower)) {
      if (!ticker || !/^[A-Z]{3,6}[0-9]{1,2}[A-Z]?$/.test(ticker)) continue;
      if (!data.match(/^\d{4}-\d{2}-\d{2}$/)) continue;
      const valor = parseValor(getField(row, "Valor da Operação", "Valor da Operacao") as string | number);
      if (valor <= 0) continue;

      const lancamento = movLower === "juros sobre capital próprio" ? "JCP" : "Dividendo";
      const categoria = /^[A-Z]{4}11[B]?$/.test(ticker) ? "FIIs" : "Ações Brasil";
      proventos.push(makeProvento(ticker, data, lancamento, valor, "BRL", categoria));
      continue;
    }

    // ── Trades: Transferência - Liquidação ──
    if (movLower === "transferência - liquidação" || movLower === "transferencia - liquidacao") {
      if (!ticker) continue;
      if (futuresPattern.test(ticker)) continue;
      if (!data.match(/^\d{4}-\d{2}-\d{2}$/)) continue;

      const tipo = entradaSaida === "debito" ? "Venda" : "Compra";
      const qtd = Math.abs(parseValor(getField(row, "Quantidade") as string | number));
      const preco = Math.abs(parseValor(getField(row, "Preço unitário", "Preco unitario") as string | number));
      const valorBruto = Math.abs(parseValor(getField(row, "Valor da Operação", "Valor da Operacao") as string | number));
      const corretora = String(getField(row, "Instituição", "Instituicao")).trim() || "B3";

      trades.push({
        Data: data,
        "Tipo de transação": tipo,
        Símbolo: ticker,
        Quantidade: String(qtd).replace(".", ","),
        Preço: String(preco).replace(".", ","),
        "Valor bruto": formatValorBR(valorBruto),
        "Taxa de corretagem": "0,00",
        "Valor líquido": formatValorBR(valorBruto),
        Moeda: "BRL",
        Corretora: corretora,
      });
    }
  }

  return { proventos, trades };
}

// ── Dedup ────────────────────────────────────────────────────────────────────

// Assinatura de provento: YYYYMMDD|TICKER_normalizado|I ou D|round(valor*100).
// Inclui I(mposto)/D(ividendo) para distinguir entradas com mesmo valor e data
// (ex.: IBKR pode reportar US$30 de dividendo e US$30 de withholding no mesmo
// dia para o mesmo ticker — sem o tipo, um seria descartado como "existente").
function sigProvento(data: string, ticker: string, valor: number, decisao: string): string {
  const d = normalizeDate(data).replace(/-/g, "").slice(0, 8);
  const t = dedupTk(ticker);
  const v = Math.round(Math.abs(valor) * 100);
  const tipo = decisao.toLowerCase().includes("imposto") ? "I" : "D";
  return `${d}|${t}|${tipo}|${v}`;
}

function dedupProventos(
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

function dedupTrades(
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

  // Group fragmented orders (same ticker+type+date)
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

  // Phase A: grouped matching
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

  // Phase B: individual matching
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

// ── Câmbio dedup ────────────────────────────────────────────────────────────

// Fuzzy column lookup — matches normalized keys (no underscores/spaces, lowercase)
function fGet(row: Record<string, unknown>, ...patterns: string[]): string {
  for (const p of patterns) {
    if (row[p] !== undefined && row[p] !== null && row[p] !== "") return String(row[p]);
  }
  const keys = Object.keys(row);
  for (const p of patterns) {
    const norm = p.replace(/[_\s]/g, "").toLowerCase();
    for (const k of keys) {
      if (k.replace(/[_\s]/g, "").toLowerCase() === norm && row[k] !== undefined && row[k] !== null && row[k] !== "")
        return String(row[k]);
    }
  }
  return "";
}

function dedupCambio(
  existing: Record<string, unknown>[],
  incoming: CambioRow[],
): Map<number, "novo" | "existente"> {
  const existingOps: Array<{ data: string; orig: string; dest: string; valDest: number; valOrig: number; matched: boolean }> = [];

  for (const row of existing) {
    const data = normalizeDate(fGet(row, "data", "date"));
    const orig = fGet(row, "moeda_origem", "moeda origem", "de", "origem").toUpperCase().trim();
    const dest = fGet(row, "moeda_destino", "moeda destino", "para", "destino").toUpperCase().trim();
    const valDestStr = fGet(row, "valor_destino", "valor total saída", "valor total saida", "valor saída", "valor_saida", "valor saida", "recebido") || "0";
    const valOrigStr = fGet(row, "valor_origem", "valor total entrada", "valor entrada", "valor_entrada", "enviado") || "0";
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
      // Match by destination value OR origin value (covers different column mappings)
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

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const dryRun = formData.get("dry_run") === "true";

    if (!file) {
      return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 400 });
    }

    // Parse based on detected source
    let proventos: ProventoRow[] = [];
    let trades: TradeRow[] = [];
    let cambio: CambioRow[] = [];

    // Detecta Excel pela extensão ou mimetype.
    const name = (file.name ?? "").toLowerCase();
    const isExcel =
      name.endsWith(".xlsx") ||
      name.endsWith(".xls") ||
      file.type.includes("spreadsheetml") ||
      file.type === "application/vnd.ms-excel";

    if (isExcel) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const excelRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: "",
        raw: false,
      });
      const parsed = parseB3Excel(excelRows);
      proventos = parsed.proventos;
      trades = parsed.trades;

      if (proventos.length === 0 && trades.length === 0) {
        return NextResponse.json({
          error: "Nenhum dado reconhecido no arquivo Excel da B3.",
          hint: "Use o relatório 'Movimentação' da B3 (.xlsx) com as colunas Entrada/Saída, Data, Movimentação, Produto, Valor da Operação, Quantidade, Preço unitário, Instituição.",
          source: "b3",
        }, { status: 422 });
      }

      return await buildResponse("b3", proventos, trades, cambio, dryRun);
    }

    const content = await file.text();
    let source = detectSource(content);

    if (source === "ibkr") {
      const parsed = parseIBKR(content);
      proventos = parsed.proventos;
      trades = parsed.trades;
      cambio = parsed.cambio;
    } else if (source === "b3") {
      const parsed = parseB3(content);
      proventos = parsed.proventos;
      trades = parsed.trades;
    } else {
      // Try both parsers
      const ibkr = parseIBKR(content);
      const b3 = parseB3(content);
      if (ibkr.proventos.length + ibkr.trades.length + ibkr.cambio.length >= b3.proventos.length + b3.trades.length && (ibkr.proventos.length + ibkr.trades.length + ibkr.cambio.length) > 0) {
        source = "ibkr";
        proventos = ibkr.proventos;
        trades = ibkr.trades;
        cambio = ibkr.cambio;
      } else if (b3.proventos.length + b3.trades.length > 0) {
        source = "b3";
        proventos = b3.proventos;
        trades = b3.trades;
      }
    }

    if (proventos.length === 0 && trades.length === 0 && cambio.length === 0) {
      return NextResponse.json({
        error: "Nenhum dado reconhecido no arquivo.",
        hint: "Formatos aceitos: CSV do IBKR (português ou inglês), CSV/TXT de proventos da B3.",
        source,
      }, { status: 422 });
    }

    return await buildResponse(source, proventos, trades, cambio, dryRun);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Dedup + preview + (opcional) inserção. Compartilhado entre CSV e Excel.
async function buildResponse(
  source: Source,
  proventos: ProventoRow[],
  trades: TradeRow[],
  cambio: CambioRow[],
  dryRun: boolean,
): Promise<NextResponse> {
  const store = getDataStore();
  // Fetch existing data for dedup
  const [existingProventos, existingTrades, existingCambio] = await Promise.all([
    proventos.length > 0 ? store.fetchTab("meus_proventos").catch(() => []) : Promise.resolve([]),
    trades.length > 0 ? store.fetchTab("meus_ativos").catch(() => []) : Promise.resolve([]),
    cambio.length > 0 ? store.fetchTab("cambio").catch(() => []) : Promise.resolve([]),
  ]);

  const proventoStatuses = proventos.length > 0 ? dedupProventos(existingProventos, proventos) : new Map();
  const tradeStatuses = trades.length > 0 ? dedupTrades(existingTrades, trades) : new Map();
  const cambioStatuses = cambio.length > 0 ? dedupCambio(existingCambio, cambio) : new Map();

  // Build preview items
  const items: PreviewItem[] = [];

  for (let i = 0; i < proventos.length; i++) {
    const p = proventos[i];
    items.push({
      ticker: p.ticker,
      data: p.data,
      tipo: p.lancamento,
      valor: p.valor,
      moeda: p.moeda,
      corretora: source === "ibkr" ? "IBKR" : "B3",
      categoria: "provento",
      detalhe: p.categoria,
      status: proventoStatuses.get(i) ?? "novo",
    });
  }

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    items.push({
      ticker: t.Símbolo,
      data: t.Data,
      tipo: t["Tipo de transação"],
      valor: t["Valor bruto"],
      moeda: t.Moeda,
      corretora: t.Corretora,
      categoria: "trade",
      detalhe: `${t.Quantidade} × ${t.Preço}`,
      status: tradeStatuses.get(i) ?? "novo",
    });
  }

  for (let i = 0; i < cambio.length; i++) {
    const c = cambio[i];
    items.push({
      ticker: `${c.moeda_origem}→${c.moeda_destino}`,
      data: c.data,
      tipo: "Câmbio",
      valor: c.valor_origem,
      moeda: c.moeda_origem,
      corretora: c.corretora,
      categoria: "cambio",
      detalhe: `${c.valor_origem} ${c.moeda_origem} → ${c.valor_destino} ${c.moeda_destino} @ ${c.taxa}`,
      status: cambioStatuses.get(i) ?? "novo",
    });
  }

  const novosProventos = proventos.filter((_, i) => proventoStatuses.get(i) === "novo");
  const novosTrades = trades.filter((_, i) => tradeStatuses.get(i) === "novo");
  const novosCambio = cambio.filter((_, i) => cambioStatuses.get(i) === "novo");

  // ── Yahoo Finance validation for new tickers ──
  // Collect unique tickers from new items, resolve via Yahoo, and attach
  // metadata (exchange, currency, sector, name) to each preview item.
  const newTickerSet = new Set<string>();
  for (const item of items) {
    if (item.status === "novo") newTickerSet.add(item.ticker);
  }

  let metaMap = new Map<string, AssetMeta>();
  if (newTickerSet.size > 0) {
    try {
      const tickersToResolve = [...newTickerSet].map(t => {
        const item = items.find(i => i.ticker === t);
        return { ticker: t, moeda: item?.moeda, corretora: item?.corretora };
      });
      metaMap = await resolveMultipleAssets(tickersToResolve);
    } catch {
      // Yahoo validation is best-effort — import still works without it
    }
  }

  // Attach metadata to preview items and enrich ticker/currency with Yahoo data.
  // If Yahoo returns a different symbol (e.g. VOW3 → VOW3.DE), update the trade/
  // provento so the sheet stores the correct, self-describing ticker.
  for (const item of items) {
    const meta = metaMap.get(item.ticker);
    if (meta) {
      item.meta = {
        yahooSymbol: meta.yahooSymbol,
        exchange: meta.exchange,
        currency: meta.currency,
        sector: meta.sector,
        longName: meta.longName,
      };

      // Enrich: use Yahoo-validated symbol as the canonical ticker
      const cleanYahoo = meta.yahooSymbol.replace(/\.SA$/i, "");
      if (cleanYahoo !== item.ticker && item.status === "novo") {
        const oldTicker = item.ticker;
        item.ticker = cleanYahoo;

        // Update underlying trade/provento objects so sheet write uses the corrected ticker
        for (const t of trades) {
          if (t.Símbolo === oldTicker) t.Símbolo = cleanYahoo;
        }
        for (const p of proventos) {
          if (p.ticker === oldTicker) p.ticker = cleanYahoo;
        }
      }

      // Enrich currency from Yahoo when the import doesn't have it right
      if (meta.currency && meta.currency !== item.moeda && item.status === "novo") {
        item.moeda = meta.currency;
        for (const t of trades) {
          if (t.Símbolo === item.ticker) t.Moeda = meta.currency;
        }
        for (const p of proventos) {
          if (p.ticker === item.ticker) p.moeda = meta.currency;
        }
      }
    }
  }

  const result: Record<string, unknown> = {
    source,
    items,
    resumo: {
      proventos: { total: proventos.length, novos: novosProventos.length, existentes: proventos.length - novosProventos.length },
      trades: { total: trades.length, novos: novosTrades.length, existentes: trades.length - novosTrades.length },
      cambio: { total: cambio.length, novos: novosCambio.length, existentes: cambio.length - novosCambio.length },
    },
  };

  // Insert if not dry run — com VERIFICAÇÃO pós-escrita: relê a aba e confere
  // que as linhas realmente chegaram na planilha (contagem antes × depois).
  if (!dryRun) {
    let insertedProventos = 0;
    let insertedTrades = 0;
    let insertedCambio = 0;
    const erros: string[] = [];
    const backups: Record<string, string> = {};

    // Backup antes de qualquer escrita
    try {
      const [bkpP, bkpT, bkpC] = await Promise.all([
        novosProventos.length > 0 ? backupTab("meus_proventos").then(r => r.backupName) : Promise.resolve(""),
        novosTrades.length > 0 ? backupTab("meus_ativos").then(r => r.backupName) : Promise.resolve(""),
        novosCambio.length > 0 ? backupTab("cambio").then(r => r.backupName) : Promise.resolve(""),
      ]);
      if (bkpP) backups.meus_proventos = bkpP;
      if (bkpT) backups.meus_ativos = bkpT;
      if (bkpC) backups.cambio = bkpC;
    } catch (e) {
      erros.push(`backup: ${e instanceof Error ? e.message : "falha no backup"}`);
    }

    if (novosProventos.length > 0) {
      const COLS = ["ticker", "data", "decisao", "mes", "ano", "lancamento", "categoria", "valor", "moeda"];
      const rows = novosProventos.map(e => COLS.map(c => (e as unknown as Record<string, string>)[c] ?? ""));
      try {
        await store.appendRows("meus_proventos", rows);
        insertedProventos = novosProventos.length;
      } catch (e) {
        erros.push(`proventos: ${e instanceof Error ? e.message : "falha na escrita"}`);
      }
    }

    if (novosTrades.length > 0) {
      const COLS = ["Data", "Tipo de transação", "Símbolo", "Quantidade", "Preço", "Valor bruto", "Taxa de corretagem", "Valor líquido", "Moeda", "Corretora"];
      const rows = novosTrades.map(t => COLS.map(c => (t as unknown as Record<string, string>)[c] ?? ""));
      try {
        await store.appendRows("meus_ativos", rows);
        insertedTrades = novosTrades.length;
      } catch (e) {
        erros.push(`operações: ${e instanceof Error ? e.message : "falha na escrita"}`);
      }
    }

    if (novosCambio.length > 0) {
      const COLS = ["data", "moeda_origem", "moeda_destino", "valor_origem", "valor_destino", "taxa", "corretora"];
      const rows = novosCambio.map(c => COLS.map(col => (c as unknown as Record<string, string>)[col] ?? ""));
      try {
        await store.appendRows("cambio", rows);
        insertedCambio = novosCambio.length;
      } catch (e) {
        erros.push(`câmbio: ${e instanceof Error ? e.message : "falha na escrita"}`);
      }
    }

    // Verificação: relê as abas e compara a contagem com o esperado.
    const verificacao: Record<string, unknown> = {};
    if (insertedProventos > 0) {
      const depois = await store.fetchTab("meus_proventos").catch(() => null);
      verificacao.proventos = depois === null
        ? { ok: false, detalhe: "não foi possível reler a aba" }
        : {
            ok: depois.length >= existingProventos.length + insertedProventos,
            antes: existingProventos.length,
            depois: depois.length,
            esperado: existingProventos.length + insertedProventos,
          };
    }
    if (insertedTrades > 0) {
      const depois = await store.fetchTab("meus_ativos").catch(() => null);
      verificacao.trades = depois === null
        ? { ok: false, detalhe: "não foi possível reler a aba" }
        : {
            ok: depois.length >= existingTrades.length + insertedTrades,
            antes: existingTrades.length,
            depois: depois.length,
            esperado: existingTrades.length + insertedTrades,
          };
    }
    if (insertedCambio > 0) {
      const depois = await store.fetchTab("cambio").catch(() => null);
      verificacao.cambio = depois === null
        ? { ok: false, detalhe: "não foi possível reler a aba" }
        : {
            ok: depois.length >= existingCambio.length + insertedCambio,
            antes: existingCambio.length,
            depois: depois.length,
            esperado: existingCambio.length + insertedCambio,
          };
    }

    const verificacoes = Object.values(verificacao) as Array<{ ok: boolean }>;
    result.inserted = { proventos: insertedProventos, trades: insertedTrades, cambio: insertedCambio };
    result.verificacao = verificacao;
    result.verificado = verificacoes.length > 0 && verificacoes.every(v => v.ok);
    if (Object.keys(backups).length > 0) result.backups = backups;
    if (erros.length > 0) {
      result.error = `Falha ao gravar na planilha — ${erros.join("; ")}`;
    } else if (verificacoes.length > 0 && !result.verificado) {
      result.error = "Escrita enviada mas a releitura da planilha não confirmou as novas linhas — confira a aba manualmente.";
    }

    // Persist asset metadata to ativos_meta sheet (best-effort)
    if (metaMap.size > 0) {
      try {
        await persistAssetMeta([...metaMap.values()]);
      } catch { /* metadata persistence is non-blocking */ }
    }
  }

  return NextResponse.json(result);
}

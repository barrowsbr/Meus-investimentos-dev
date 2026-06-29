import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getDataStore } from "@/lib/data-store";
import { backupTab } from "@/lib/backup";
import { resolveMultipleAssets, persistAssetMeta, type AssetMeta } from "@/lib/asset-meta";
import {
  type ProventoRow,
  type TradeRow,
  type CambioRow,
  formatValorBR,
  normalizeDate,
  normalizeTicker,
  parseValor,
  normalizeTipo,
  isForexSymbol,
  makeProvento,
  dedupProventos,
  dedupTrades,
  dedupCambio,
  cambioRowsForSheet,
  proventoRowsForSheet,
  tradeRowsForSheet,
} from "@/lib/broker-import";

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

// Tipos, helpers, builders e dedup vivem em lib/broker-import.ts (FONTE ÚNICA,
// compartilhada com o sync via IBKR Flex). Aqui ficam só os parsers de CSV/Excel.

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
// (isForexSymbol/FOREX_CURRENCIES em lib/broker-import.ts)

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

// ── Dedup, builders e helpers → lib/broker-import.ts (FONTE ÚNICA) ──────────────

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
      // Header-aware: grava por NOME de coluna (não por posição) — senão a data
      // cai em "lançamento" e o Sheets a converte em serial.
      const headers = existingProventos.length > 0 ? Object.keys(existingProventos[0]) : [];
      const rows = proventoRowsForSheet(headers, novosProventos);
      try {
        await store.appendRows("meus_proventos", rows);
        insertedProventos = novosProventos.length;
      } catch (e) {
        erros.push(`proventos: ${e instanceof Error ? e.message : "falha na escrita"}`);
      }
    }

    if (novosTrades.length > 0) {
      const headers = existingTrades.length > 0 ? Object.keys(existingTrades[0]) : [];
      const rows = tradeRowsForSheet(headers, novosTrades);
      try {
        await store.appendRows("meus_ativos", rows);
        insertedTrades = novosTrades.length;
      } catch (e) {
        erros.push(`operações: ${e instanceof Error ? e.message : "falha na escrita"}`);
      }
    }

    if (novosCambio.length > 0) {
      // Escreve respeitando os headers reais da aba (appendRows é posicional).
      const sheetHeaders = existingCambio.length > 0 ? Object.keys(existingCambio[0]) : [];
      const rows = cambioRowsForSheet(sheetHeaders, novosCambio);
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

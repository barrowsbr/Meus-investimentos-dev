import { NextResponse } from "next/server";
import { fetchTab, appendRows } from "@/lib/gsheets";

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
  categoria: "provento" | "trade";
  detalhe: string;
  status: "novo" | "existente" | "split";
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
  const match = t.match(/^([A-Z0-9]+)/i);
  return (match ? match[1] : t).replace(/\.(SA|TO|L|AS)$/i, "").trim().toUpperCase();
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

function extractTickerFromDesc(desc: string): string {
  const m = desc.match(/^([A-Z0-9]{1,10})\s*[\(]/i);
  if (m) return m[1].toUpperCase();
  const m2 = desc.match(/^([A-Z]{1,5}\d{0,2})\b/i);
  if (m2) return m2[1].toUpperCase();
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

function parseIBKR(content: string): { proventos: ProventoRow[]; trades: TradeRow[] } {
  const proventos: ProventoRow[] = [];
  const trades: TradeRow[] = [];
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
    const valorStr = parts[10] ?? "";

    if (!data || !simbolo) continue;
    const ticker = normalizeTicker(simbolo);
    const moeda = detectCurrency(descricao);

    if (tipo === "Dividendo" || tipo === "Dividend") {
      const valor = parseValor(valorStr);
      if (!valor) continue;
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
  if (proventos.length === 0 && trades.length === 0) {
    parseActivityStatement(lines, proventos, trades);
  }

  return { proventos, trades };
}

function parseActivityStatement(lines: string[], proventos: ProventoRow[], trades: TradeRow[]) {
  for (const line of lines) {
    const parts = smartSplit(line);
    if (parts.length < 3) continue;
    const section = parts[0]?.trim();
    const rowType = parts[1]?.trim();

    if (rowType !== "Data") continue;

    if (section === "Trades" && parts.length >= 10) {
      const currency = parts[4]?.trim() || "USD";
      const symbol = normalizeTicker(parts[5] ?? "");
      const date = normalizeDate(parts[6] ?? "");
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

      if (!date || amount === 0) continue;
      const ticker = extractTickerFromDesc(desc);
      if (!ticker) continue;
      proventos.push(makeProvento(ticker, date, "Dividendo", Math.abs(amount), currency, "Ação Internacional"));
    }

    if ((section === "Withholding Tax" || section === "WithholdingTax") && parts.length >= 5) {
      const currency = parts[2]?.trim() || "USD";
      const date = normalizeDate(parts[3] ?? "");
      const desc = parts[4] ?? "";
      const amount = parseValor(parts[5] ?? "0");

      if (!date || amount === 0) continue;
      const ticker = extractTickerFromDesc(desc);
      if (!ticker) continue;
      proventos.push(makeProvento(ticker, date, "IMPOSTO", Math.abs(amount), currency, "Ação Internacional"));
    }
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

// ── Dedup ────────────────────────────────────────────────────────────────────

function getDecisao(row: Record<string, unknown>): string {
  const v = row["decisao"] ?? row["decisão"] ?? row["lancamento"] ?? row["lançamento"] ?? "";
  return String(v).trim().toUpperCase();
}

function dedupProventos(
  existing: Record<string, unknown>[],
  incoming: ProventoRow[],
): Map<number, "novo" | "existente"> {
  const exactKeys = new Set<string>();
  const looseKeys = new Set<string>();

  for (const row of existing) {
    const ticker = normalizeTicker(String(row["ticker"] ?? ""));
    const data = normalizeDate(String(row["data"] ?? ""));
    const decisao = getDecisao(row);
    const valor = Math.round(parseValor(String(row["valor"] ?? "0")) * 10);
    const tipo = (decisao.includes("IMPOSTO") || decisao.includes("TAX")) ? "IMPOSTO" : "DIVIDENDO";

    try {
      const d = new Date(data + "T12:00:00Z");
      for (let offset = -3; offset <= 3; offset++) {
        const dd = new Date(d.getTime() + offset * 86400000);
        const ds = dd.toISOString().split("T")[0];
        exactKeys.add(`${ds}|${ticker}|${tipo}|${valor}`);
        looseKeys.add(`${ds}|${ticker}|${valor}`);
      }
    } catch {
      exactKeys.add(`${data}|${ticker}|${tipo}|${valor}`);
      looseKeys.add(`${data}|${ticker}|${valor}`);
    }
  }

  const statuses = new Map<number, "novo" | "existente">();
  for (let i = 0; i < incoming.length; i++) {
    const ev = incoming[i];
    const ticker = normalizeTicker(ev.ticker);
    const tipo = ev.decisao === "IMPOSTO" ? "IMPOSTO" : "DIVIDENDO";
    const valor = Math.round(parseValor(ev.valor) * 10);
    const keyExact = `${ev.data}|${ticker}|${tipo}|${valor}`;
    const keyLoose = `${ev.data}|${ticker}|${valor}`;
    statuses.set(i, (exactKeys.has(keyExact) || looseKeys.has(keyLoose)) ? "existente" : "novo");
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
    const ticker = normalizeTicker(String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? ""));
    const rawTipo = String(row["tipo de transação"] ?? row["tipo de transacao"] ?? row["tipo"] ?? "").trim();
    const tipo = normalizeTipo(rawTipo);
    const qty = Math.round(parseValor(String(row["quantidade"] ?? "0")) * 100) / 100;
    const preco = parseValor(String(row["preço"] ?? row["preco"] ?? row["precio"] ?? "0"));
    if (ticker) existingTrades.push({ ticker, tipo, qty, preco, matched: false });
  }

  function findMatch(ticker: string, tipo: string, qty: number, preco: number): typeof existingTrades[0] | null {
    for (const t of existingTrades) {
      if (t.matched) continue;
      if (t.ticker !== ticker) continue;
      if (t.tipo !== tipo) continue;
      if (Math.abs(t.qty - qty) > 0.01) continue;
      const pDiff = Math.abs(t.preco - preco);
      const pPct = pDiff / Math.max(t.preco, preco, 1) * 100;
      if (pPct <= 2 || pDiff <= 1) return t;
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
    const key = `${normalizeTicker(t.Símbolo)}|${t["Tipo de transação"]}|${t.Data}`;
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
    const ticker = normalizeTicker(rows[0].Símbolo);
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
    const ticker = normalizeTicker(row.Símbolo);
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

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const dryRun = formData.get("dry_run") === "true";

    if (!file) {
      return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 400 });
    }

    const content = await file.text();
    let source = detectSource(content);

    // Parse based on detected source
    let proventos: ProventoRow[] = [];
    let trades: TradeRow[] = [];

    if (source === "ibkr") {
      const parsed = parseIBKR(content);
      proventos = parsed.proventos;
      trades = parsed.trades;
    } else if (source === "b3") {
      const parsed = parseB3(content);
      proventos = parsed.proventos;
      trades = parsed.trades;
    } else {
      // Try both parsers
      const ibkr = parseIBKR(content);
      const b3 = parseB3(content);
      if (ibkr.proventos.length + ibkr.trades.length >= b3.proventos.length + b3.trades.length && (ibkr.proventos.length + ibkr.trades.length) > 0) {
        source = "ibkr";
        proventos = ibkr.proventos;
        trades = ibkr.trades;
      } else if (b3.proventos.length + b3.trades.length > 0) {
        source = "b3";
        proventos = b3.proventos;
        trades = b3.trades;
      }
    }

    if (proventos.length === 0 && trades.length === 0) {
      return NextResponse.json({
        error: "Nenhum dado reconhecido no arquivo.",
        hint: "Formatos aceitos: CSV do IBKR (português ou inglês), CSV/TXT de proventos da B3.",
        source,
      }, { status: 422 });
    }

    // Fetch existing data for dedup
    const [existingProventos, existingTrades] = await Promise.all([
      proventos.length > 0 ? fetchTab("meus_proventos").catch(() => []) : Promise.resolve([]),
      trades.length > 0 ? fetchTab("meus_ativos").catch(() => []) : Promise.resolve([]),
    ]);

    const proventoStatuses = proventos.length > 0 ? dedupProventos(existingProventos, proventos) : new Map();
    const tradeStatuses = trades.length > 0 ? dedupTrades(existingTrades, trades) : new Map();

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

    const novosProventos = proventos.filter((_, i) => proventoStatuses.get(i) === "novo");
    const novosTrades = trades.filter((_, i) => tradeStatuses.get(i) === "novo");

    const result: Record<string, unknown> = {
      source,
      items,
      resumo: {
        proventos: { total: proventos.length, novos: novosProventos.length, existentes: proventos.length - novosProventos.length },
        trades: { total: trades.length, novos: novosTrades.length, existentes: trades.length - novosTrades.length },
      },
    };

    // Insert if not dry run
    if (!dryRun) {
      let insertedProventos = 0;
      let insertedTrades = 0;

      if (novosProventos.length > 0) {
        const COLS = ["ticker", "data", "decisao", "mes", "ano", "lancamento", "categoria", "valor", "moeda"];
        const rows = novosProventos.map(e => COLS.map(c => (e as unknown as Record<string, string>)[c] ?? ""));
        await appendRows("meus_proventos", rows);
        insertedProventos = novosProventos.length;
      }

      if (novosTrades.length > 0) {
        const COLS = ["Data", "Tipo de transação", "Símbolo", "Quantidade", "Preço", "Valor bruto", "Taxa de corretagem", "Valor líquido", "Moeda", "Corretora"];
        const rows = novosTrades.map(t => COLS.map(c => (t as unknown as Record<string, string>)[c] ?? ""));
        await appendRows("meus_ativos", rows);
        insertedTrades = novosTrades.length;
      }

      result.inserted = { proventos: insertedProventos, trades: insertedTrades };
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

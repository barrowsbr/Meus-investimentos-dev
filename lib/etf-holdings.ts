/**
 * etf-holdings.ts
 * ===============
 * Fetches ETF holdings live and persists them to Google Sheets ('composicao' tab).
 *
 * Fetch strategy (5 tiers per ticker):
 *   1.   Financial Modeling Prep API (endpoint legado; hoje exige plano pago)
 *   1.5. Alpha Vantage ETF_PROFILE (free key, holdings COMPLETOS de ETFs US)
 *   2.   Live provider URL (iShares CSV, SSGA XLSX, Invesco)
 *   3.   Yahoo Finance quoteSummary API (top-10, universal — incl. UCITS/B3)
 *   4.   Embedded fallback (hardcoded top-25 holdings, Q1-2025)
 *
 * Persistence:
 *   - saveToGSheets(perEtf)  → writes to 'composicao' tab
 *   - loadFromGSheets()      → reads 'composicao', returns stored holdings
 */

import { getDataStore } from "./data-store";
import { getServiceAccountAuth } from "./gsheets";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Holding {
  ticker: string;
  name: string;
  weight_pct: number;
}

export interface EtfHoldingsResult {
  holdings: Holding[] | null;
  value_brl: number;
  covered_pct: number;
  status: "ok" | "empty" | "not_supported" | "none";
  source: string;
}

export type PerEtfResult = Record<string, EtfHoldingsResult>;

export interface LookThroughOutput {
  per_etf: PerEtfResult;
  combined: Array<{ ticker: string; name: string; value_brl: number; pct: number; via: string }>;
  rv_complete: Array<{ ticker: string; name: string; value_brl: number; pct: number; direct_brl: number; etf_brl: number; via: string }>;
  supported: string[];
  unsupported: string[];
  total_look_through_brl: number;
  sources: Record<string, string>;
  updated_at: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

const LOOKTHROUGH_SECTORS = new Set(["ETF USA", "ETF"]);

const PROVIDER_URLS: Record<string, { provider: string; url: string; type: "xlsx" | "csv" }> = {
  SPY: { provider: "SSGA", url: "https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spy.xlsx", type: "xlsx" },
  QQQ: { provider: "Invesco", url: "https://www.invesco.com/us/financial-products/etfs/holdings/main/holdings/0?audienceType=Investor&action=download&ticker=QQQ", type: "csv" },
  // VWRA.L (Vanguard FTSE All-World UCITS) NÃO tem URL aqui de propósito:
  // a antiga apontava para o iShares MSCI World — fundo ERRADO (sem emergentes).
  // VWRA cai para Yahoo top-10 + bucket OUTROS, que é honesto.
  IVV: { provider: "iShares", url: "https://www.ishares.com/us/products/239726/ishares-core-sp-500-etf/1467271812596.ajax?fileType=csv&fileName=IVV_holdings&dataType=fund", type: "csv" },
};
PROVIDER_URLS["IVVB11"] = PROVIDER_URLS["IVV"];
PROVIDER_URLS["VOO"] = PROVIDER_URLS["SPY"];

// ── Embedded fallback (Q1-2025, approximate) ─────────────────────────────────

const EMBEDDED: Record<string, Array<[string, string, number]>> = {
  QQQ: [
    ["AAPL", "Apple Inc", 8.9], ["MSFT", "Microsoft Corp", 8.1], ["NVDA", "NVIDIA Corp", 8.0],
    ["AMZN", "Amazon.com Inc", 5.4], ["META", "Meta Platforms", 4.8], ["AVGO", "Broadcom Inc", 4.6],
    ["GOOGL", "Alphabet Class A", 4.2], ["TSLA", "Tesla Inc", 3.6], ["GOOG", "Alphabet Class C", 3.5],
    ["COST", "Costco Wholesale", 2.7], ["NFLX", "Netflix Inc", 1.9], ["AMD", "Advanced Micro Devices", 1.7],
    ["ADBE", "Adobe Inc", 1.5], ["QCOM", "Qualcomm Inc", 1.5], ["INTU", "Intuit Inc", 1.4],
    ["TXN", "Texas Instruments", 1.3], ["AMAT", "Applied Materials", 1.2], ["AMGN", "Amgen Inc", 1.1],
    ["HON", "Honeywell International", 1.0], ["SBUX", "Starbucks Corp", 0.9],
    ["ISRG", "Intuitive Surgical", 0.9], ["MU", "Micron Technology", 0.8],
    ["LRCX", "Lam Research", 0.8], ["PDD", "PDD Holdings", 0.8], ["REGN", "Regeneron Pharmaceuticals", 0.7],
  ],
  "VWRA.L": [
    ["AAPL", "Apple Inc", 4.2], ["MSFT", "Microsoft Corp", 3.9], ["NVDA", "NVIDIA Corp", 3.8],
    ["AMZN", "Amazon.com Inc", 2.5], ["META", "Meta Platforms", 2.3], ["GOOGL", "Alphabet Class A", 2.0],
    ["AVGO", "Broadcom Inc", 1.8], ["TSLA", "Tesla Inc", 1.7], ["GOOG", "Alphabet Class C", 1.5],
    ["BRK-B", "Berkshire Hathaway B", 1.3], ["JPM", "JPMorgan Chase", 1.2], ["LLY", "Eli Lilly", 1.0],
    ["V", "Visa Inc", 0.9], ["XOM", "Exxon Mobil", 0.8], ["JNJ", "Johnson & Johnson", 0.8],
    ["UNH", "UnitedHealth Group", 0.8], ["MA", "Mastercard", 0.8], ["COST", "Costco Wholesale", 0.7],
    ["HD", "Home Depot", 0.7], ["ASML", "ASML Holding", 0.7], ["PG", "Procter & Gamble", 0.7],
    ["WMT", "Walmart Inc", 0.6], ["BAC", "Bank of America", 0.6], ["NFLX", "Netflix Inc", 0.6],
    ["ABBV", "AbbVie Inc", 0.6],
  ],
  SPY: [
    ["AAPL", "Apple Inc", 7.1], ["MSFT", "Microsoft Corp", 6.5], ["NVDA", "NVIDIA Corp", 6.3],
    ["AMZN", "Amazon.com Inc", 3.7], ["META", "Meta Platforms", 2.8], ["AVGO", "Broadcom Inc", 2.5],
    ["GOOGL", "Alphabet Class A", 2.2], ["TSLA", "Tesla Inc", 2.0], ["GOOG", "Alphabet Class C", 1.9],
    ["BRK-B", "Berkshire Hathaway B", 1.7], ["JPM", "JPMorgan Chase", 1.5], ["LLY", "Eli Lilly", 1.4],
    ["UNH", "UnitedHealth Group", 1.3], ["XOM", "Exxon Mobil", 1.3], ["COST", "Costco Wholesale", 1.2],
    ["V", "Visa Inc", 1.1], ["NFLX", "Netflix Inc", 1.1], ["MA", "Mastercard", 1.0],
    ["HD", "Home Depot", 0.9], ["PG", "Procter & Gamble", 0.9], ["JNJ", "Johnson & Johnson", 0.8],
    ["WMT", "Walmart Inc", 0.8], ["ABBV", "AbbVie Inc", 0.8], ["BAC", "Bank of America", 0.7],
    ["CRM", "Salesforce Inc", 0.7],
  ],
  FLJP: [
    ["7203.T", "Toyota Motor Corp", 4.2], ["8306.T", "Mitsubishi UFJ Financial", 3.3],
    ["6758.T", "Sony Group Corp", 2.9], ["6501.T", "Hitachi Ltd", 2.6],
    ["8316.T", "Sumitomo Mitsui Financial", 2.2], ["6857.T", "Advantest Corp", 2.0],
    ["8035.T", "Tokyo Electron Ltd", 2.0], ["8411.T", "Mizuho Financial Group", 1.8],
    ["8058.T", "Mitsubishi Corp", 1.8], ["9984.T", "SoftBank Group Corp", 1.7],
    ["6861.T", "Keyence Corp", 1.5], ["6098.T", "Recruit Holdings", 1.4],
    ["6902.T", "Denso Corp", 1.2], ["8766.T", "Tokio Marine Holdings", 1.2],
    ["9432.T", "Nippon Telegraph & Tel", 1.1], ["7974.T", "Nintendo Co Ltd", 1.1],
    ["6367.T", "Daikin Industries", 1.0], ["4063.T", "Shin-Etsu Chemical", 1.0],
    ["6981.T", "Murata Manufacturing", 0.9], ["9433.T", "KDDI Corp", 0.9],
    ["4568.T", "Daiichi Sankyo Co", 0.8], ["7741.T", "HOYA Corp", 0.8],
    ["6594.T", "Nidec Corp", 0.7], ["8001.T", "ITOCHU Corp", 0.7],
    ["4519.T", "Chugai Pharmaceutical", 0.7],
  ],
};
EMBEDDED["IVV"] = EMBEDDED["SPY"];
EMBEDDED["IVVB11"] = EMBEDDED["SPY"];
EMBEDDED["VOO"] = EMBEDDED["SPY"];
EMBEDDED["VWRA"] = EMBEDDED["VWRA.L"];

// ── In-memory cache (1 hour TTL) ────────────────────────────────────────────

const holdingsCache = new Map<string, { data: Holding[]; source: string; ts: number }>();
const CACHE_TTL = 3600_000; // 1 hour

// ── Fetch helpers ────────────────────────────────────────────────────────────

async function tryFetch(url: string, timeout = 15000): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (res.ok) return res;
  } catch {
    // ignore
  } finally {
    clearTimeout(timer);
  }
  return null;
}

// ── Tier 1: Financial Modeling Prep ──────────────────────────────────────────

async function fetchFMP(ticker: string): Promise<Holding[] | null> {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;
  try {
    const url = `https://financialmodelingprep.com/api/v3/etf-holder/${ticker}?apikey=${key}`;
    const res = await tryFetch(url);
    if (!res) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const holdings: Holding[] = data
      .filter((h: Record<string, unknown>) => (h.weightPercentage as number) > 0)
      .map((h: Record<string, unknown>) => ({
        ticker: String(h.asset ?? ""),
        name: String(h.name ?? h.asset ?? ""),
        weight_pct: Number(h.weightPercentage ?? 0),
      }));
    return holdings.length > 0 ? holdings : null;
  } catch {
    return null;
  }
}

// ── Tier 1.5: Alpha Vantage ETF_PROFILE ──────────────────────────────────────
// Holdings COMPLETOS (todas as posições, com peso) de qualquer ETF listado nos
// EUA. Chave gratuita (alphavantage.co/support/#api-key), 25 req/dia no plano
// free — suficiente porque o resultado é persistido na aba `composicao` e os
// holdings mudam devagar. Não cobre UCITS (VWRA.L) nem B3 (IVVB11) — esses
// caem para as camadas seguintes.

async function fetchAlphaVantage(ticker: string): Promise<Holding[] | null> {
  const key = process.env.ALPHAVANTAGE_API_KEY;
  if (!key) return null;
  try {
    const url = `https://www.alphavantage.co/query?function=ETF_PROFILE&symbol=${ticker}&apikey=${key}`;
    const res = await tryFetch(url);
    if (!res) return null;
    const data = await res.json();
    const raw = data?.holdings;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const holdings: Holding[] = raw
      .map((h: Record<string, unknown>) => ({
        ticker: String(h.symbol ?? "").trim(),
        name: String(h.description ?? h.symbol ?? "").trim(),
        // weight vem como fração em string (ex: "0.0712")
        weight_pct: Math.round(parseFloat(String(h.weight ?? "0")) * 100 * 10000) / 10000,
      }))
      .filter(h => h.ticker && h.ticker.toUpperCase() !== "N/A" && h.weight_pct > 0);
    return holdings.length > 0 ? holdings : null;
  } catch {
    return null;
  }
}

// ── Tier 2: Live provider (CSV/XLSX) ─────────────────────────────────────────

// Divide uma linha CSV respeitando campos entre aspas (nomes como
// "Berkshire Hathaway Inc, Class B" não podem desalinhar as colunas).
function splitCSVLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cols.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

function parseCSVHoldings(text: string): Holding[] | null {
  const lines = text.split("\n");
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const upper = lines[i].toUpperCase();
    if ((upper.includes("TICKER") || upper.includes("ISIN") || upper.includes("SYMBOL")) && upper.includes("WEIGHT")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return null;

  const headers = splitCSVLine(lines[headerIdx]).map(h => h.replace(/"/g, "").toLowerCase());
  const tickerCol = headers.findIndex(h => ["ticker", "symbol", "ativo"].some(k => h.includes(k)));
  const nameCol = headers.findIndex(h => ["name", "nome", "description", "holding"].some(k => h.includes(k)));
  // Peso de verdade primeiro; "market value" só como último recurso (a
  // normalização por totalWeight torna valores de mercado equivalentes a pesos).
  let weightCol = headers.findIndex(h => ["weight", "peso", "percentage", "%"].some(k => h.includes(k)));
  if (weightCol < 0) weightCol = headers.findIndex(h => h.includes("market value"));

  if (weightCol < 0) return null;

  const holdings: Holding[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]).map(c => c.replace(/"/g, ""));
    if (cols.length <= weightCol) continue;
    const weight = parseFloat(cols[weightCol].replace(/[%$\s]/g, ""));
    if (isNaN(weight) || weight <= 0) continue;
    const ticker = tickerCol >= 0 ? cols[tickerCol] : "";
    const name = nameCol >= 0 ? cols[nameCol] : ticker;
    if (!ticker || ticker === "-" || ticker.toUpperCase() === "CASH") continue;
    holdings.push({ ticker, name, weight_pct: weight });
  }
  return holdings.length > 0 ? holdings : null;
}

async function fetchLiveProvider(ticker: string): Promise<Holding[] | null> {
  const config = PROVIDER_URLS[ticker];
  if (!config) return null;

  const res = await tryFetch(config.url);
  if (!res) return null;

  try {
    if (config.type === "csv") {
      const text = await res.text();
      if (text.length < 500) return null;
      return parseCSVHoldings(text);
    }
    // XLSX: try to parse as CSV first (some providers serve CSV with xlsx extension)
    const text = await res.text();
    if (text.length > 500 && text.includes(",")) {
      return parseCSVHoldings(text);
    }
    return null;
  } catch {
    return null;
  }
}

// ── Tier 3: Yahoo Finance quoteSummary ───────────────────────────────────────

async function fetchYahooQS(ticker: string): Promise<Holding[] | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=topHoldings`;
    const res = await tryFetch(url);
    if (!res) return null;
    const data = await res.json();
    const holdings = data?.quoteSummary?.result?.[0]?.topHoldings?.holdings;
    if (!Array.isArray(holdings) || holdings.length === 0) return null;
    const result: Holding[] = holdings
      .filter((h: Record<string, unknown>) => (h.holdingPercent as number) > 0)
      .map((h: Record<string, unknown>) => ({
        ticker: String(h.symbol ?? ""),
        name: String(h.holdingName ?? h.symbol ?? ""),
        weight_pct: Math.round(((h.holdingPercent as number) ?? 0) * 100 * 10000) / 10000,
      }));
    return result.length > 0 ? result : null;
  } catch {
    return null;
  }
}

// ── Tier 4: Embedded fallback ────────────────────────────────────────────────

function fetchEmbedded(ticker: string): Holding[] | null {
  const rows = EMBEDDED[ticker.toUpperCase()];
  if (!rows) return null;
  return rows.map(([t, n, w]) => ({ ticker: t, name: n, weight_pct: w }));
}

// ── Main fetch with 4-tier fallback ──────────────────────────────────────────

export async function fetchHoldings(ticker: string): Promise<{ holdings: Holding[] | null; source: string }> {
  const t = ticker.toUpperCase();

  // Check cache
  const cached = holdingsCache.get(t);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { holdings: cached.data, source: cached.source };
  }

  // Tier 1: FMP
  let holdings = await fetchFMP(t);
  if (holdings && holdings.length > 0) {
    holdingsCache.set(t, { data: holdings, source: "fmp", ts: Date.now() });
    return { holdings, source: "fmp" };
  }

  // Tier 1.5: Alpha Vantage (holdings completos, qualquer ETF US)
  holdings = await fetchAlphaVantage(t);
  if (holdings && holdings.length > 0) {
    holdingsCache.set(t, { data: holdings, source: "alphavantage", ts: Date.now() });
    return { holdings, source: "alphavantage" };
  }

  // Tier 2: Live provider
  holdings = await fetchLiveProvider(t);
  if (holdings && holdings.length > 0) {
    holdingsCache.set(t, { data: holdings, source: "live", ts: Date.now() });
    return { holdings, source: "live" };
  }

  // Tier 3: Yahoo Finance
  holdings = await fetchYahooQS(t);
  if (holdings && holdings.length > 0) {
    holdingsCache.set(t, { data: holdings, source: "yahoo", ts: Date.now() });
    return { holdings, source: "yahoo" };
  }

  // Tier 4: Embedded
  holdings = fetchEmbedded(t);
  if (holdings && holdings.length > 0) {
    holdingsCache.set(t, { data: holdings, source: "embedded", ts: Date.now() });
    return { holdings, source: "embedded" };
  }

  return { holdings: null, source: "none" };
}

// ── Load stored compositions from GSheets ──────────────────────���─────────────

export async function loadFromGSheets(): Promise<{ stored: Record<string, Holding[]>; storedSources: Record<string, string>; updatedAt: string }> {
  try {
    const store = getDataStore();
    const rows = await store.fetchTab("composicao");
    if (!rows || rows.length === 0) return { stored: {}, storedSources: {}, updatedAt: "" };

    const result: Record<string, Holding[]> = {};
    const storedSources: Record<string, string> = {};
    let updatedAt = "";

    for (const row of rows) {
      const etf = String(row["etf"] ?? "").toUpperCase().trim();
      const ticker = String(row["ticker"] ?? "").trim();
      const weightRaw = String(row["weight_pct"] ?? row["peso"] ?? row["percentual"] ?? "0");
      const weight = parseFloat(weightRaw.replace(",", "."));
      if (!etf || !ticker || isNaN(weight) || weight <= 0) continue;
      if (!result[etf]) result[etf] = [];
      result[etf].push({
        ticker,
        name: String(row["name"] ?? row["nome"] ?? ticker),
        weight_pct: weight,
      });
      const src = String(row["source"] ?? "").trim();
      if (src && !storedSources[etf]) storedSources[etf] = src;
      if (!updatedAt && row["updated_at"]) updatedAt = String(row["updated_at"]);
    }
    return { stored: result, storedSources, updatedAt };
  } catch {
    return { stored: {}, storedSources: {}, updatedAt: "" };
  }
}

// ── Save compositions to GSheets ─────────────────────────────────────────────

export async function saveToGSheets(perEtf: PerEtfResult): Promise<boolean> {
  try {
    const { google } = await import("googleapis");
    // Escrita no Sheets exige service account — API key é rejeitada (401).
    const auth = getServiceAccountAuth();
    const spreadsheetId = process.env.SPREADSHEET_ID;
    if (!auth || !spreadsheetId) return false;

    const sheets = google.sheets({ version: "v4", auth });
    const nowStr = new Date().toISOString().slice(0, 16).replace("T", " ");

    const rows: string[][] = [["etf", "ticker", "name", "weight_pct", "source", "updated_at"]];
    for (const [etfTicker, data] of Object.entries(perEtf)) {
      if (data.status !== "ok" || !data.holdings) continue;
      for (const h of data.holdings) {
        if (h.ticker.startsWith("OUTROS.")) continue;
        rows.push([etfTicker, h.ticker, h.name, String(h.weight_pct), data.source, nowStr]);
      }
    }

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: "composicao!A:F",
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "composicao!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });
    return true;
  } catch (e) {
    console.error("[etf-holdings] saveToGSheets error:", e);
    return false;
  }
}

// ── Compute look-through (live fetch) ────────────────────────────────────────

interface PortfolioPosition {
  ticker: string;
  setor: string;
  valorAtualBRL: number;
  quantidade: number;
}

export async function computeLookThrough(
  positions: PortfolioPosition[],
  topN: number = 50
): Promise<LookThroughOutput> {
  const eligible = positions.filter(
    p => LOOKTHROUGH_SECTORS.has(p.setor) && p.quantidade > 0 && p.valorAtualBRL > 0
  );

  const perEtf: PerEtfResult = {};
  const supported: string[] = [];
  const unsupported: string[] = [];
  const sources: Record<string, string> = {};
  let totalLookThroughBRL = 0;

  // Fetch all ETF holdings in parallel — qualquer ETF tenta as camadas
  // (Alpha Vantage cobre qualquer ETF US; Yahoo cobre o resto com top-10).
  const fetchResults = await Promise.allSettled(
    eligible.map(async (pos) => {
      const t = pos.ticker.toUpperCase().replace(".SA", "");
      const lookupKeys = [...new Set([t, pos.ticker.toUpperCase()])];
      let result: { holdings: Holding[] | null; source: string } = { holdings: null, source: "none" };

      for (const key of lookupKeys) {
        result = await fetchHoldings(key);
        if (result.holdings) break;
      }

      return { pos, result, lookupKey: t };
    })
  );

  for (const settled of fetchResults) {
    if (settled.status !== "fulfilled") continue;
    const { pos, result } = settled.value;

    if (result.holdings && result.holdings.length > 0) {
      const top = result.holdings.slice(0, topN);
      const coveredPct = top.reduce((s, h) => s + h.weight_pct, 0);
      supported.push(pos.ticker);
      totalLookThroughBRL += pos.valorAtualBRL;
      sources[pos.ticker] = result.source;

      // Add tail bucket if significant uncovered weight
      const finalHoldings = [...top];
      const uncoveredPct = Math.max(0, 100 - coveredPct);
      if (uncoveredPct > 0.5) {
        finalHoldings.push({
          ticker: `OUTROS.${pos.ticker}`,
          name: `Demais ativos (${pos.ticker}) — ${uncoveredPct.toFixed(1)}% restante`,
          weight_pct: uncoveredPct,
        });
      }

      perEtf[pos.ticker] = {
        holdings: finalHoldings,
        value_brl: pos.valorAtualBRL,
        covered_pct: coveredPct,
        status: "ok",
        source: result.source,
      };
    } else {
      unsupported.push(pos.ticker);
      perEtf[pos.ticker] = {
        holdings: null,
        value_brl: pos.valorAtualBRL,
        covered_pct: 0,
        status: "not_supported",
        source: "none",
      };
    }
  }

  // Also mark non-LOOKTHROUGH ETFs as unsupported
  const allEtfPositions = positions.filter(
    p => LOOKTHROUGH_SECTORS.has(p.setor) && !eligible.some(e => e.ticker === p.ticker)
  );
  for (const pos of allEtfPositions) {
    unsupported.push(pos.ticker);
  }

  // Build combined look-through view
  const ltAccum: Record<string, { name: string; valueBRL: number; via: string[] }> = {};
  for (const [etfTicker, data] of Object.entries(perEtf)) {
    if (data.status !== "ok" || !data.holdings) continue;
    const totalWeight = data.holdings.reduce((s, h) => s + h.weight_pct, 0);
    for (const h of data.holdings) {
      const valueBRL = totalWeight > 0 ? (h.weight_pct / totalWeight) * data.value_brl : 0;
      if (!ltAccum[h.ticker]) ltAccum[h.ticker] = { name: h.name, valueBRL: 0, via: [] };
      ltAccum[h.ticker].valueBRL += valueBRL;
      if (!ltAccum[h.ticker].via.includes(etfTicker)) ltAccum[h.ticker].via.push(etfTicker);
    }
  }

  const combinedTotal = Object.values(ltAccum).reduce((s, v) => s + v.valueBRL, 0);
  const combined = Object.entries(ltAccum)
    .map(([ticker, v]) => ({
      ticker,
      name: v.name,
      value_brl: v.valueBRL,
      pct: combinedTotal > 0 ? (v.valueBRL / combinedTotal) * 100 : 0,
      via: v.via.join(", "),
    }))
    .sort((a, b) => b.value_brl - a.value_brl);

  // Build RV complete view (direct + ETF-derived)
  const directPositions = positions.filter(
    p => !LOOKTHROUGH_SECTORS.has(p.setor) && !["Renda Fixa", "Renda Fixa USD", "Caixa/Liquidez"].includes(p.setor) && p.quantidade > 0 && p.valorAtualBRL > 0
  );
  const rvAccum: Record<string, { name: string; directBRL: number; etfBRL: number; via: string[] }> = {};

  for (const pos of directPositions) {
    rvAccum[pos.ticker] = { name: pos.ticker, directBRL: pos.valorAtualBRL, etfBRL: 0, via: [] };
  }
  for (const [ticker, v] of Object.entries(ltAccum)) {
    if (rvAccum[ticker]) {
      rvAccum[ticker].etfBRL += v.valueBRL;
      for (const etf of v.via) {
        if (!rvAccum[ticker].via.includes(etf)) rvAccum[ticker].via.push(etf);
      }
    } else {
      rvAccum[ticker] = { name: v.name, directBRL: 0, etfBRL: v.valueBRL, via: [...v.via] };
    }
  }

  const rvTotal = Object.values(rvAccum).reduce((s, v) => s + v.directBRL + v.etfBRL, 0);
  const rv_complete = Object.entries(rvAccum)
    .map(([ticker, v]) => {
      const totalBRL = v.directBRL + v.etfBRL;
      const sources = (v.directBRL > 0 ? ["Direta"] : []).concat(v.via);
      return {
        ticker,
        name: v.name,
        value_brl: totalBRL,
        pct: rvTotal > 0 ? (totalBRL / rvTotal) * 100 : 0,
        direct_brl: v.directBRL,
        etf_brl: v.etfBRL,
        via: sources.join(", ") || "—",
      };
    })
    .sort((a, b) => b.value_brl - a.value_brl);

  return {
    per_etf: perEtf,
    combined,
    rv_complete,
    supported,
    unsupported: [...new Set(unsupported)],
    total_look_through_brl: totalLookThroughBRL,
    sources,
    updated_at: new Date().toISOString(),
  };
}

// ── Compute from stored (uses GSheets data, no live fetch) ────��──────────────

export function computeFromStored(
  storedCompositions: Record<string, Holding[]>,
  positions: PortfolioPosition[],
  topN: number = 50,
  storedSources: Record<string, string> = {}
): LookThroughOutput {
  const eligible = positions.filter(
    p => LOOKTHROUGH_SECTORS.has(p.setor) && p.quantidade > 0 && p.valorAtualBRL > 0
  );

  const perEtf: PerEtfResult = {};
  const supported: string[] = [];
  const unsupported: string[] = [];
  const sources: Record<string, string> = {};
  let totalLookThroughBRL = 0;

  for (const pos of eligible) {
    const keys = [pos.ticker.toUpperCase(), pos.ticker.replace(".SA", "").toUpperCase(), pos.ticker];
    let holdings: Holding[] | null = null;
    let matchedKey = "";
    for (const key of keys) {
      if (storedCompositions[key] && storedCompositions[key].length > 0) {
        holdings = storedCompositions[key].slice(0, topN);
        matchedKey = key;
        break;
      }
    }

    if (holdings && holdings.length > 0) {
      const coveredPct = holdings.reduce((s, h) => s + h.weight_pct, 0);
      supported.push(pos.ticker);
      totalLookThroughBRL += pos.valorAtualBRL;
      // Preserva a proveniência original ("stored:embedded" denuncia dado
      // hardcoded antigo; "stored:alphavantage"/"stored:live" são confiáveis).
      const origSrc = storedSources[matchedKey];
      sources[pos.ticker] = origSrc ? `stored:${origSrc}` : "stored";

      const finalHoldings = [...holdings];
      const uncoveredPct = Math.max(0, 100 - coveredPct);
      if (uncoveredPct > 0.5) {
        finalHoldings.push({
          ticker: `OUTROS.${pos.ticker}`,
          name: `Demais ativos (${pos.ticker}) — ${uncoveredPct.toFixed(1)}% restante`,
          weight_pct: uncoveredPct,
        });
      }

      perEtf[pos.ticker] = {
        holdings: finalHoldings,
        value_brl: pos.valorAtualBRL,
        covered_pct: coveredPct,
        status: "ok",
        source: sources[pos.ticker],
      };
    } else {
      unsupported.push(pos.ticker);
      perEtf[pos.ticker] = {
        holdings: null,
        value_brl: pos.valorAtualBRL,
        covered_pct: 0,
        status: "not_supported",
        source: "none",
      };
    }
  }

  // Build combined & rv_complete (same logic as computeLookThrough)
  const ltAccum: Record<string, { name: string; valueBRL: number; via: string[] }> = {};
  for (const [etfTicker, data] of Object.entries(perEtf)) {
    if (data.status !== "ok" || !data.holdings) continue;
    const totalWeight = data.holdings.reduce((s, h) => s + h.weight_pct, 0);
    for (const h of data.holdings) {
      const valueBRL = totalWeight > 0 ? (h.weight_pct / totalWeight) * data.value_brl : 0;
      if (!ltAccum[h.ticker]) ltAccum[h.ticker] = { name: h.name, valueBRL: 0, via: [] };
      ltAccum[h.ticker].valueBRL += valueBRL;
      if (!ltAccum[h.ticker].via.includes(etfTicker)) ltAccum[h.ticker].via.push(etfTicker);
    }
  }

  const combinedTotal = Object.values(ltAccum).reduce((s, v) => s + v.valueBRL, 0);
  const combined = Object.entries(ltAccum)
    .map(([ticker, v]) => ({
      ticker, name: v.name, value_brl: v.valueBRL,
      pct: combinedTotal > 0 ? (v.valueBRL / combinedTotal) * 100 : 0,
      via: v.via.join(", "),
    }))
    .sort((a, b) => b.value_brl - a.value_brl);

  const directPositions = positions.filter(
    p => !LOOKTHROUGH_SECTORS.has(p.setor) && !["Renda Fixa", "Renda Fixa USD", "Caixa/Liquidez"].includes(p.setor) && p.quantidade > 0 && p.valorAtualBRL > 0
  );
  const rvAccum: Record<string, { name: string; directBRL: number; etfBRL: number; via: string[] }> = {};

  for (const pos of directPositions) {
    rvAccum[pos.ticker] = { name: pos.ticker, directBRL: pos.valorAtualBRL, etfBRL: 0, via: [] };
  }
  for (const [ticker, v] of Object.entries(ltAccum)) {
    if (rvAccum[ticker]) {
      rvAccum[ticker].etfBRL += v.valueBRL;
      for (const etf of v.via) {
        if (!rvAccum[ticker].via.includes(etf)) rvAccum[ticker].via.push(etf);
      }
    } else {
      rvAccum[ticker] = { name: v.name, directBRL: 0, etfBRL: v.valueBRL, via: [...v.via] };
    }
  }

  const rvTotal = Object.values(rvAccum).reduce((s, v) => s + v.directBRL + v.etfBRL, 0);
  const rv_complete = Object.entries(rvAccum)
    .map(([ticker, v]) => {
      const totalBRL = v.directBRL + v.etfBRL;
      const srcs = (v.directBRL > 0 ? ["Direta"] : []).concat(v.via);
      return {
        ticker, name: v.name, value_brl: totalBRL,
        pct: rvTotal > 0 ? (totalBRL / rvTotal) * 100 : 0,
        direct_brl: v.directBRL, etf_brl: v.etfBRL,
        via: srcs.join(", ") || "—",
      };
    })
    .sort((a, b) => b.value_brl - a.value_brl);

  return {
    per_etf: perEtf, combined, rv_complete, supported,
    unsupported: [...new Set(unsupported)],
    total_look_through_brl: totalLookThroughBRL,
    sources, updated_at: new Date().toISOString(),
  };
}

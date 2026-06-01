import { yahooTicker } from "./cotacoes";
import { identificarSetor, isRendaFixa } from "./sectors";
import type { PriceMatrix, FxHistory } from "./twr-engine";
import type { FxRates } from "./cotacoes";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HistoricalData {
  dates: string[];
  prices: PriceMatrix;
  fxHistory: FxHistory;
  ibov: (number | null)[];
  sp500: (number | null)[];
  errors: string[];
}

const FX_TICKERS = ["BRL=X", "EURBRL=X", "CADBRL=X", "GBPBRL=X"] as const;
const IBOV_TICKER = "^BVSP";
const SP500_TICKER = "^GSPC";
const FX_DEFAULT: FxRates = { USDBRL: 5.7, EURBRL: 6.4, CADBRL: 4.1, GBPBRL: 7.6 };

// ─── Yahoo range helper ───────────────────────────────────────────────────────

function daysToRange(days: number): string {
  if (days <= 0) return "max";
  if (days <= 35) return "1mo";
  if (days <= 95) return "3mo";
  if (days <= 190) return "6mo";
  if (days <= 380) return "1y";
  if (days <= 740) return "2y";
  if (days <= 1900) return "5y";
  if (days <= 3700) return "10y";
  return "max";
}

// ─── Method 1: yahoo-finance2 library ────────────────────────────────────────

async function fetchViaYF2(
  ticker: string,
  startStr: string,
  endStr: string
): Promise<{ date: string; price: number }[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const YF: any = (await import("yahoo-finance2")).default;
  const yf = typeof YF === "function" ? new YF() : YF;
  const rows = await yf.historical(
    ticker,
    { period1: startStr, period2: endStr, interval: "1d" },
    { validateResult: false }
  );
  return (rows ?? []).flatMap((r: Record<string, unknown>) => {
    const close = (r.adjClose ?? r.close) as number | null;
    if (close == null || !isFinite(close)) return [];
    const d = r.date instanceof Date ? r.date : new Date(r.date as string);
    return [{ date: d.toISOString().split("T")[0], price: close }];
  });
}

// ─── Method 2: direct Yahoo v8 chart API (fallback) ──────────────────────────

async function fetchViaV8Chart(
  ticker: string,
  lookbackDays: number,
  host = "query1"
): Promise<{ date: string; price: number }[]> {
  const range = daysToRange(lookbackDays);
  const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d&includeAdjustedClose=true`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`v8/${host} HTTP ${res.status} for ${ticker}`);
  const json = await res.json();

  const result = json?.chart?.result?.[0];
  if (!result) {
    const errMsg = json?.chart?.error?.description ?? "no result";
    throw new Error(`v8/${host} no chart result for ${ticker}: ${errMsg}`);
  }

  // Yahoo uses "timestamp" (singular) — not "timestamps"
  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] =
    result.indicators?.adjclose?.[0]?.adjclose ??
    result.indicators?.quote?.[0]?.close ??
    [];

  return timestamps.flatMap((ts, i) => {
    const price = closes[i];
    if (price == null || !isFinite(price)) return [];
    const d = new Date(ts * 1000);
    return [{ date: d.toISOString().split("T")[0], price }];
  });
}

// ─── Per-ticker fetch with fallback chain ─────────────────────────────────────

async function fetchTicker(
  yt: string,
  startStr: string,
  endStr: string,
  lookbackDays: number
): Promise<{ date: string; price: number; source?: string }[]> {
  // 1) Try yahoo-finance2 library
  try {
    const rows = await fetchViaYF2(yt, startStr, endStr);
    if (rows.length > 0) return rows;
  } catch {
    // fall through
  }
  // 2) Try v8 chart via query1
  try {
    const rows = await fetchViaV8Chart(yt, lookbackDays, "query1");
    if (rows.length > 0) return rows;
  } catch {
    // fall through
  }
  // 3) Try v8 chart via query2
  try {
    const rows = await fetchViaV8Chart(yt, lookbackDays, "query2");
    if (rows.length > 0) return rows;
  } catch {
    // all sources exhausted
  }
  return [];
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchHistoricalData(
  originalTickers: { ticker: string; moeda: string; corretora: string }[],
  lookbackDays: number = 365
): Promise<HistoricalData> {
  const errors: string[] = [];

  const end = new Date();
  const start = new Date();
  if (lookbackDays > 0) {
    start.setDate(start.getDate() - lookbackDays - 10);
  } else {
    start.setFullYear(2000, 0, 1);
  }
  const startStr = start.toISOString().split("T")[0];
  const endStr = end.toISOString().split("T")[0];

  // Map original → Yahoo ticker (skip RF tickers — no market quote)
  const tickerMap = new Map<string, string>(); // yahooTicker → originalTicker
  for (const t of originalTickers) {
    const setor = identificarSetor(t.ticker);
    if (isRendaFixa(setor)) continue;
    const yt = yahooTicker(t.ticker, t.moeda, t.corretora);
    if (!tickerMap.has(yt)) tickerMap.set(yt, t.ticker);
  }

  const allYahoo = [...tickerMap.keys(), ...FX_TICKERS, IBOV_TICKER, SP500_TICKER];

  // Parallel fetch — best-effort
  const fetched = await Promise.allSettled(
    allYahoo.map(async (yt) => {
      const rows = await fetchTicker(yt, startStr, endStr, lookbackDays);
      return { yt, rows };
    })
  );

  // Build date → ticker → price map
  const rawByDate = new Map<string, Map<string, number>>();

  for (const res of fetched) {
    if (res.status !== "fulfilled") continue;
    const { yt, rows } = res.value;
    if (rows.length === 0) {
      errors.push(`Sem dados para ${yt}`);
      continue;
    }
    for (const { date, price } of rows) {
      if (!rawByDate.has(date)) rawByDate.set(date, new Map());
      rawByDate.get(date)!.set(yt, price);
    }
  }

  const allDates = [...rawByDate.keys()].sort();

  if (allDates.length === 0) {
    return { dates: [], prices: {}, fxHistory: {}, ibov: [], sp500: [], errors: ["Todas as fontes falharam: " + errors.join("; ")] };
  }

  const n = allDates.length;
  const lastKnown = new Map<string, number>();

  const prices: PriceMatrix = {};
  for (const origTicker of tickerMap.values()) prices[origTicker] = new Array(n).fill(null);
  const fxHistory: FxHistory = {};
  const ibovArr: (number | null)[] = new Array(n).fill(null);
  const sp500Arr: (number | null)[] = new Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    const date = allDates[i];
    for (const [yt, price] of rawByDate.get(date)!) lastKnown.set(yt, price);

    fxHistory[date] = {
      USDBRL: lastKnown.get("BRL=X") ?? FX_DEFAULT.USDBRL,
      EURBRL: lastKnown.get("EURBRL=X") ?? FX_DEFAULT.EURBRL,
      CADBRL: lastKnown.get("CADBRL=X") ?? FX_DEFAULT.CADBRL,
      GBPBRL: lastKnown.get("GBPBRL=X") ?? FX_DEFAULT.GBPBRL,
    };

    ibovArr[i] = lastKnown.get(IBOV_TICKER) ?? null;
    sp500Arr[i] = lastKnown.get(SP500_TICKER) ?? null;

    for (const [yt, origTicker] of tickerMap) {
      prices[origTicker][i] = lastKnown.get(yt) ?? null;
    }
  }

  return { dates: allDates, prices, fxHistory, ibov: ibovArr, sp500: sp500Arr, errors };
}

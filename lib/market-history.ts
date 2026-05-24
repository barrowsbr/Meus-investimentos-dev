import { yahooTicker } from "./cotacoes";
import { identificarSetor, isRendaFixa } from "./sectors";
import type { PriceMatrix, FxHistory } from "./twr-engine";
import type { FxRates } from "./cotacoes";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HistoricalData {
  dates: string[];        // sorted business days in the fetched range
  prices: PriceMatrix;    // originalTicker → price array aligned with dates
  fxHistory: FxHistory;   // date → FxRates
  ibov: (number | null)[]; // ^BVSP prices aligned with dates
  errors: string[];
}

interface YFHistRow {
  date: Date | string;
  close: number | null | undefined;
  adjClose?: number | null;
}

// ─── Yahoo Finance historical fetch ──────────────────────────────────────────

const FX_TICKERS = ["BRL=X", "EURBRL=X", "CADBRL=X", "GBPBRL=X"] as const;
const IBOV_TICKER = "^BVSP";

const FX_DEFAULT: FxRates = { USDBRL: 5.7, EURBRL: 6.4, CADBRL: 4.1, GBPBRL: 7.6 };

async function fetchYFHistorical(
  ticker: string,
  start: string,
  end: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<YFHistRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const yf: any = (await import("yahoo-finance2")).default;
  try {
    const rows = await yf.historical(ticker, {
      period1: start,
      period2: end,
      interval: "1d",
    });
    return rows ?? [];
  } catch {
    return [];
  }
}

function rowDate(row: YFHistRow): string {
  const d = row.date instanceof Date ? row.date : new Date(row.date);
  return d.toISOString().split("T")[0];
}

function rowClose(row: YFHistRow): number | null {
  const v = row.adjClose ?? row.close;
  return v != null && isFinite(v) ? v : null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchHistoricalData(
  originalTickers: { ticker: string; moeda: string; corretora: string }[],
  lookbackDays: number = 1825  // 5 anos
): Promise<HistoricalData> {
  const errors: string[] = [];

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - lookbackDays - 10); // +10 for weekends
  const startStr = start.toISOString().split("T")[0];
  const endStr = end.toISOString().split("T")[0];

  // Map original ticker → Yahoo ticker (skip RF)
  const tickerMap = new Map<string, string>(); // yahooTicker → originalTicker
  for (const t of originalTickers) {
    const setor = identificarSetor(t.ticker);
    if (isRendaFixa(setor)) continue;
    const yt = yahooTicker(t.ticker, t.moeda, t.corretora);
    if (!tickerMap.has(yt)) tickerMap.set(yt, t.ticker);
  }

  const allYahoo = [
    ...tickerMap.keys(),
    ...FX_TICKERS,
    IBOV_TICKER,
  ];

  // Parallel fetch — best-effort (failures produce empty arrays)
  const fetched = await Promise.allSettled(
    allYahoo.map(async (yt) => {
      const rows = await fetchYFHistorical(yt, startStr, endStr);
      return { yt, rows };
    })
  );

  // Build per-date maps
  const rawByDate = new Map<string, Map<string, number>>(); // date → ticker → price

  for (const res of fetched) {
    if (res.status !== "fulfilled") continue;
    const { yt, rows } = res.value;
    if (rows.length === 0) {
      errors.push(`Sem dados históricos para ${yt}`);
      continue;
    }
    for (const row of rows) {
      const price = rowClose(row);
      if (price == null) continue;
      const date = rowDate(row);
      if (!rawByDate.has(date)) rawByDate.set(date, new Map());
      rawByDate.get(date)!.set(yt, price);
    }
  }

  // Sorted date list (only business days present in Yahoo data)
  const allDates = [...rawByDate.keys()].sort();
  if (allDates.length === 0) {
    return { dates: [], prices: {}, fxHistory: {}, ibov: [], errors: ["Nenhum dado histórico retornado"] };
  }

  // Build forward-filled price arrays
  const lastKnown = new Map<string, number>();
  const n = allDates.length;

  // Initialize output arrays
  const prices: PriceMatrix = {};
  for (const origTicker of tickerMap.values()) {
    prices[origTicker] = new Array(n).fill(null);
  }
  const fxHistory: FxHistory = {};
  const ibovArr: (number | null)[] = new Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    const date = allDates[i];
    const dayMap = rawByDate.get(date)!;

    // Update last known prices
    for (const [yt, price] of dayMap) {
      lastKnown.set(yt, price);
    }

    // FX rates for this date (forward-filled)
    fxHistory[date] = {
      USDBRL: lastKnown.get("BRL=X") ?? FX_DEFAULT.USDBRL,
      EURBRL: lastKnown.get("EURBRL=X") ?? FX_DEFAULT.EURBRL,
      CADBRL: lastKnown.get("CADBRL=X") ?? FX_DEFAULT.CADBRL,
      GBPBRL: lastKnown.get("GBPBRL=X") ?? FX_DEFAULT.GBPBRL,
    };

    // IBOV
    ibovArr[i] = lastKnown.get(IBOV_TICKER) ?? null;

    // Asset prices — mapped from Yahoo ticker back to original
    for (const [yt, origTicker] of tickerMap) {
      prices[origTicker][i] = lastKnown.get(yt) ?? null;
    }
  }

  return { dates: allDates, prices, fxHistory, ibov: ibovArr, errors };
}

import { fetchTab } from "./gsheets";
import { readGoldenSource, writeGoldenSource, goldenSourceStatus, type GoldenSourceData } from "./db-cotacoes";
import { fetchTicker } from "./market-history";
import { yahooTicker } from "./cotacoes";
import { identificarSetor, isRendaFixaManual } from "./sectors";

const FX_TICKERS = ["BRL=X", "EURBRL=X", "CADBRL=X", "GBPBRL=X"];
// ^SP500TR = S&P 500 Total Return (com dividendos) — benchmark correto para
// carteira que mede retorno total. ^GSPC mantido como fallback histórico.
const INDEX_TICKERS = ["^BVSP", "^GSPC", "^SP500TR"];
const CRYPTO_TICKERS = new Set(["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "ADA-USD", "XRP-USD"]);

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.getUTCDay() === 0 || d.getUTCDay() === 6;
}

// Yahoo returns scrambled prices when exchanges are closed.
// Validate NEW data before inserting — reject weekends, holiday scrambles, out-of-range FX.
function isScrambledDate(
  dateStr: string,
  newPrices: Record<string, number>,
  lastGoodCanaries: { spy: number; itub: number },
): boolean {
  if (isWeekend(dateStr)) return true;

  const spy = newPrices["SPY"];
  if (spy != null && spy > 0 && lastGoodCanaries.spy > 0) {
    if (Math.abs(spy - lastGoodCanaries.spy) / lastGoodCanaries.spy > 0.40) return true;
  }

  const itub = newPrices["ITUB4.SA"];
  if (itub != null && itub > 0 && lastGoodCanaries.itub > 0) {
    if (Math.abs(itub - lastGoodCanaries.itub) / lastGoodCanaries.itub > 0.40) return true;
  }

  const bvsp = newPrices["^BVSP"];
  if (bvsp != null && bvsp > 0 && bvsp < 50000) return true;

  return false;
}

// Build last known good canary values from existing (validated) data
function buildCanaryBaseline(existing: GoldenSourceData): { spy: number; itub: number } {
  let spy = 0, itub = 0;
  for (let i = existing.dates.length - 1; i >= 0; i--) {
    const p = existing.prices[existing.dates[i]];
    if (!p) continue;
    if (!spy && p["SPY"] > 0) spy = p["SPY"];
    if (!itub && p["ITUB4.SA"] > 0) itub = p["ITUB4.SA"];
    if (spy && itub) break;
  }
  return { spy, itub };
}

export interface Anomaly {
  ticker: string;
  date: string;
  type: "large_move" | "gap" | "negative";
  detail: string;
}

export interface SyncReport {
  action: string;
  status: ReturnType<typeof goldenSourceStatus>;
  newPoints: number;
  rejectedDates: number;
  tickerErrors?: string[];
  anomalies: Anomaly[];
  anomalyCount: number;
  tickers: string[];
}

function detectAnomalies(data: GoldenSourceData): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const dayMs = 86400000;
  for (const ticker of data.tickers) {
    const isFxOrIndex = ticker.includes("=") || ticker.startsWith("^");
    let prevPrice: number | null = null;
    let prevDate = "";
    for (const date of data.dates) {
      const price = data.prices[date]?.[ticker];
      if (price == null) continue;

      if (price < 0) {
        anomalies.push({ ticker, date, type: "negative", detail: `Preço negativo: ${price}` });
      }

      if (prevPrice != null && prevPrice > 0) {
        const pctChange = ((price - prevPrice) / prevPrice) * 100;
        if (Math.abs(pctChange) > 25 && !isFxOrIndex) {
          anomalies.push({
            ticker, date, type: "large_move",
            detail: `${pctChange > 0 ? "+" : ""}${pctChange.toFixed(1)}% (${prevPrice.toFixed(2)} → ${price.toFixed(2)}). Possível split/bonificação.`,
          });
        }
        const gapDays = Math.round((new Date(date).getTime() - new Date(prevDate).getTime()) / dayMs);
        if (gapDays > 10) {
          anomalies.push({ ticker, date, type: "gap", detail: `${gapDays} dias sem cotação (${prevDate} → ${date})` });
        }
      }

      prevPrice = price;
      prevDate = date;
    }
  }
  return anomalies;
}

// Runs a backfill or incremental update of the golden source (db_cotacoes).
// On-demand only (no cron) — triggered by /api/cotacoes/refresh when app opens.
export async function runCotacoesSync(
  action: "backfill" | "update" = "update",
  lookbackYears = 5
): Promise<SyncReport> {
  const lookbackDays = Math.min(lookbackYears, 10) * 365;

  // 1. Portfolio tickers
  const transacoes = await fetchTab("meus_ativos");
  const tickerMeta = new Map<string, { moeda: string; corretora: string }>();
  for (const row of transacoes) {
    const ticker = String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? "").toUpperCase().trim();
    if (!ticker) continue;
    if (!tickerMeta.has(ticker)) {
      tickerMeta.set(ticker, {
        moeda: String(row["moeda"] ?? "BRL").toUpperCase().trim(),
        corretora: String(row["corretora"] ?? "").trim(),
      });
    }
  }

  // Map original → Yahoo ticker (skip renda fixa); FX + indices map to themselves
  const yahooMap = new Map<string, string>();
  for (const [ticker, meta] of tickerMeta) {
    if (isRendaFixaManual(identificarSetor(ticker))) continue;
    yahooMap.set(ticker, yahooTicker(ticker, meta.moeda, meta.corretora));
  }
  for (const yt of [...FX_TICKERS, ...INDEX_TICKERS]) yahooMap.set(yt, yt);

  const allOriginalTickers = [...yahooMap.keys()];

  // 2. Existing golden source
  const existing = await readGoldenSource();
  const existingStatus = goldenSourceStatus(existing);

  // 3. Date range
  const endStr = new Date().toISOString().split("T")[0];
  let startStr: string;
  if (action === "update" && !existingStatus.empty) {
    const last = new Date(existingStatus.lastDate);
    last.setDate(last.getDate() - 3); // small overlap for safety
    startStr = last.toISOString().split("T")[0];
  } else {
    const start = new Date();
    start.setDate(start.getDate() - lookbackDays);
    startStr = start.toISOString().split("T")[0];
  }

  // 4. Fetch from Yahoo
  const fetchResults = await Promise.allSettled(
    allOriginalTickers.map(async (orig) => {
      const yt = yahooMap.get(orig)!;
      const days = Math.ceil((Date.now() - new Date(startStr).getTime()) / 86400000);
      const rows = await fetchTicker(yt, startStr, endStr, days);
      return { orig: orig.toUpperCase(), rows };
    })
  );

  // 5. Carry forward existing data unchanged — it's already validated
  const prices: Record<string, Record<string, number>> = {};
  const tickerSet = new Set<string>();
  const dateSet = new Set<string>();

  if (!existingStatus.empty) {
    for (const date of existing.dates) {
      dateSet.add(date);
      prices[date] = { ...existing.prices[date] };
    }
    existing.tickers.forEach((t) => tickerSet.add(t));
  }

  // 6. Group new Yahoo data by date for validation
  const newByDate = new Map<string, { ticker: string; price: number }[]>();
  const tickerErrors: string[] = [];
  for (const res of fetchResults) {
    if (res.status !== "fulfilled") continue;
    const { orig, rows } = res.value;
    tickerSet.add(orig);
    if (rows.length === 0) {
      tickerErrors.push(orig);
      continue;
    }
    for (const { date, price } of rows) {
      if (!newByDate.has(date)) newByDate.set(date, []);
      newByDate.get(date)!.push({ ticker: orig, price });
    }
  }

  // 7. Validate new data per-date before inserting — reject scrambled dates entirely
  const canaries = buildCanaryBaseline(existing);
  let newPoints = 0;
  let rejectedDates = 0;
  const sortedNewDates = [...newByDate.keys()].sort();

  for (const date of sortedNewDates) {
    const entries = newByDate.get(date)!;
    const dateSnapshot: Record<string, number> = {};
    for (const { ticker, price } of entries) dateSnapshot[ticker] = price;

    if (isScrambledDate(date, dateSnapshot, canaries)) {
      // Only keep crypto from scrambled dates
      rejectedDates++;
      for (const { ticker, price } of entries) {
        if (!CRYPTO_TICKERS.has(ticker)) continue;
        dateSet.add(date);
        if (!prices[date]) prices[date] = {};
        if (prices[date][ticker] == null) {
          prices[date][ticker] = price;
          newPoints++;
        }
      }
      continue;
    }

    // Good date — update canary baselines
    if (dateSnapshot["SPY"] > 0) canaries.spy = dateSnapshot["SPY"];
    if (dateSnapshot["ITUB4.SA"] > 0) canaries.itub = dateSnapshot["ITUB4.SA"];

    // Insert only new points (never overwrite existing)
    for (const { ticker, price } of entries) {
      dateSet.add(date);
      if (!prices[date]) prices[date] = {};
      if (prices[date][ticker] == null) {
        prices[date][ticker] = price;
        newPoints++;
      }
    }
  }

  const merged: GoldenSourceData = {
    tickers: [...tickerSet].sort(),
    dates: [...dateSet].sort(),
    prices,
  };

  const anomalies = detectAnomalies(merged);
  if (newPoints > 0) {
    await writeGoldenSource(merged);
  }

  return {
    action,
    status: goldenSourceStatus(merged),
    newPoints,
    tickerErrors: tickerErrors.length > 0 ? tickerErrors : undefined,
    anomalies: anomalies.slice(0, 50),
    anomalyCount: anomalies.length,
    rejectedDates,
    tickers: merged.tickers,
  };
}

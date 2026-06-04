import { fetchTab } from "./gsheets";
import { readGoldenSource, writeGoldenSource, goldenSourceStatus, type GoldenSourceData } from "./db-cotacoes";
import { fetchTicker } from "./market-history";
import { yahooTicker } from "./cotacoes";
import { identificarSetor, isRendaFixaManual } from "./sectors";

const FX_TICKERS = ["BRL=X", "EURBRL=X", "CADBRL=X", "GBPBRL=X"];
const INDEX_TICKERS = ["^BVSP", "^GSPC"];

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
// Shared by the manual endpoint (POST) and the scheduled cron job.
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

  // 5. Merge — always carry forward existing data, overlay new
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

  let newPoints = 0;
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
      dateSet.add(date);
      if (!prices[date]) prices[date] = {};
      if (prices[date][orig] == null) newPoints++;
      prices[date][orig] = price;
    }
  }

  const merged: GoldenSourceData = {
    tickers: [...tickerSet].sort(),
    dates: [...dateSet].sort(),
    prices,
  };

  const anomalies = detectAnomalies(merged);
  await writeGoldenSource(merged);

  return {
    action,
    status: goldenSourceStatus(merged),
    newPoints,
    tickerErrors: tickerErrors.length > 0 ? tickerErrors : undefined,
    anomalies: anomalies.slice(0, 50),
    anomalyCount: anomalies.length,
    tickers: merged.tickers,
  };
}

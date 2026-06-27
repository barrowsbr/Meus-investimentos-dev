import { NextResponse } from "next/server";
import { writeGoldenSource, type GoldenSourceData } from "@/lib/db-cotacoes";
import { backupTab } from "@/lib/backup";
import { fetchTicker } from "@/lib/market-history";
import { getDataStore } from "@/lib/data-store";
import { yahooTicker } from "@/lib/cotacoes";
import { identificarSetor, isRendaFixaManual } from "@/lib/sectors";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FX_TICKERS = ["BRL=X", "EURBRL=X", "CADBRL=X", "GBPBRL=X"];
const INDEX_TICKERS = ["^BVSP", "^GSPC", "^SP500TR"];
const CRYPTO_TICKERS = new Set(["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "ADA-USD", "XRP-USD"]);

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.getUTCDay() === 0 || d.getUTCDay() === 6;
}

// POST /api/rebuild-cotacoes  { "lookbackYears": 4, "dryRun": false }
//
// Nuke and rebuild: backup → clear → fetch ALL from Yahoo → validate → write.
// Must run in production where Yahoo is accessible.

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const lookbackYears = Math.min(Number(body.lookbackYears ?? 4), 10);
  const dryRun = body.dryRun === true;

  // 1. Discover portfolio tickers from meus_ativos
  const store = getDataStore();
  const transacoes = await store.fetchTab("meus_ativos");
  const yahooMap = new Map<string, string>();
  for (const row of transacoes) {
    const ticker = String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? "").toUpperCase().trim();
    if (!ticker) continue;
    const setor = identificarSetor(ticker);
    if (isRendaFixaManual(setor)) continue;
    const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim();
    const corretora = String(row["corretora"] ?? "").trim();
    if (!yahooMap.has(ticker)) {
      yahooMap.set(ticker, yahooTicker(ticker, moeda, corretora));
    }
  }
  for (const t of [...FX_TICKERS, ...INDEX_TICKERS]) yahooMap.set(t, t);

  // 2. Determine start date: earliest transaction or lookbackYears, whichever is older
  const endStr = new Date().toISOString().split("T")[0];

  let earliestTx = "";
  for (const row of transacoes) {
    const val = row["data"] ?? row["date"];
    if (!val) continue;
    let d = "";
    if (typeof val === "number") {
      const dt = new Date(Math.floor((val as number) - 25569) * 86400000);
      d = dt.toISOString().split("T")[0];
    } else {
      const s = String(val).trim();
      const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (br) d = `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
      else if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = s.slice(0, 10);
    }
    if (d && (!earliestTx || d < earliestTx)) earliestTx = d;
  }

  const lookbackStart = new Date();
  lookbackStart.setFullYear(lookbackStart.getFullYear() - lookbackYears);
  const lookbackStr = lookbackStart.toISOString().split("T")[0];

  // Use whichever is earlier: the lookback or 30 days before the first transaction
  let startStr = lookbackStr;
  if (earliestTx) {
    const txStart = new Date(earliestTx);
    txStart.setDate(txStart.getDate() - 30);
    const txStartStr = txStart.toISOString().split("T")[0];
    if (txStartStr < startStr) startStr = txStartStr;
  }

  const lookbackDays = Math.ceil((Date.now() - new Date(startStr).getTime()) / 86400000);

  const allTickers = [...yahooMap.keys()];
  const fetchResults = await Promise.allSettled(
    allTickers.map(async (orig) => {
      const yt = yahooMap.get(orig)!;
      const rows = await fetchTicker(yt, startStr, endStr, lookbackDays);
      return { orig: orig.toUpperCase(), rows };
    })
  );

  // 3. Collect raw data, filter weekends, validate with canaries
  const rawByDate = new Map<string, Map<string, number>>();
  const tickerSet = new Set<string>();
  const tickerErrors: string[] = [];
  let totalRawPoints = 0;

  for (const res of fetchResults) {
    if (res.status !== "fulfilled") continue;
    const { orig, rows } = res.value;
    tickerSet.add(orig);
    if (rows.length === 0) {
      tickerErrors.push(orig);
      continue;
    }
    for (const { date, price } of rows) {
      if (price <= 0) continue;
      if (!rawByDate.has(date)) rawByDate.set(date, new Map());
      rawByDate.get(date)!.set(orig, price);
      totalRawPoints++;
    }
  }

  if (totalRawPoints === 0) {
    return NextResponse.json({
      ok: false,
      message: "Yahoo retornou 0 pontos — provavelmente inacessível deste ambiente. Rode em produção.",
      tickerErrors,
    });
  }

  // 4. Per-date validation
  const sortedDates = [...rawByDate.keys()].sort();
  const prices: Record<string, Record<string, number>> = {};
  const dateSet = new Set<string>();
  let rejectedDates = 0;
  let acceptedPoints = 0;

  let lastGoodSpy = 0;
  let lastGoodItub = 0;

  for (const date of sortedDates) {
    const dayData = rawByDate.get(date)!;

    // Weekend: only keep crypto
    if (isWeekend(date)) {
      rejectedDates++;
      for (const [ticker, price] of dayData) {
        if (CRYPTO_TICKERS.has(ticker)) {
          dateSet.add(date);
          if (!prices[date]) prices[date] = {};
          prices[date][ticker] = price;
          acceptedPoints++;
        }
      }
      continue;
    }

    // SPY canary: >40% swing from last good = scrambled date
    const spy = dayData.get("SPY");
    if (spy != null && spy > 0) {
      if (lastGoodSpy > 0 && Math.abs(spy - lastGoodSpy) / lastGoodSpy > 0.40) {
        rejectedDates++;
        for (const [ticker, price] of dayData) {
          if (CRYPTO_TICKERS.has(ticker)) {
            dateSet.add(date);
            if (!prices[date]) prices[date] = {};
            prices[date][ticker] = price;
            acceptedPoints++;
          }
        }
        continue;
      }
      lastGoodSpy = spy;
    }

    // ITUB4.SA canary: >40% swing = scrambled BR holiday
    const itub = dayData.get("ITUB4.SA");
    if (itub != null && itub > 0) {
      if (lastGoodItub > 0 && Math.abs(itub - lastGoodItub) / lastGoodItub > 0.40) {
        rejectedDates++;
        for (const [ticker, price] of dayData) {
          if (CRYPTO_TICKERS.has(ticker)) {
            dateSet.add(date);
            if (!prices[date]) prices[date] = {};
            prices[date][ticker] = price;
            acceptedPoints++;
          }
        }
        continue;
      }
      lastGoodItub = itub;
    }

    // ^BVSP sanity: below 50k is clearly wrong
    const bvsp = dayData.get("^BVSP");
    if (bvsp != null && bvsp > 0 && bvsp < 50000) {
      rejectedDates++;
      continue;
    }

    // Good date — accept all
    dateSet.add(date);
    if (!prices[date]) prices[date] = {};
    for (const [ticker, price] of dayData) {
      prices[date][ticker] = price;
      acceptedPoints++;
    }
  }

  const rebuilt: GoldenSourceData = {
    tickers: [...tickerSet].sort(),
    dates: [...dateSet].sort(),
    prices,
  };

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      tickers: rebuilt.tickers.length,
      dates: rebuilt.dates.length,
      rawPoints: totalRawPoints,
      acceptedPoints,
      rejectedDates,
      tickerErrors,
      message: "Dry run — nenhum dado foi escrito.",
    });
  }

  // 5. Backup, then write
  try {
    await backupTab("db_cotacoes");
  } catch { /* best-effort */ }

  await writeGoldenSource(rebuilt, { force: true });

  return NextResponse.json({
    ok: true,
    tickers: rebuilt.tickers.length,
    dates: rebuilt.dates.length,
    rawPoints: totalRawPoints,
    acceptedPoints,
    rejectedDates,
    tickerErrors: tickerErrors.length > 0 ? tickerErrors : undefined,
    firstDate: rebuilt.dates[0],
    lastDate: rebuilt.dates[rebuilt.dates.length - 1],
  });
}

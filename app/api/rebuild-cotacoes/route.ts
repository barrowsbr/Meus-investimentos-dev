import { NextResponse } from "next/server";
import { writeGoldenSource, type GoldenSourceData } from "@/lib/db-cotacoes";
import { fetchTicker } from "@/lib/market-history";
import { fetchTab } from "@/lib/gsheets";
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

// Rebuild db_cotacoes from scratch: fetch ALL tickers from Yahoo (the origin),
// validate (reject weekends + holiday scrambles), write clean data.
//
// This is the "nuke and rebuild" escape hatch for when the golden source is
// corrupted beyond repair. It makes a backup first, then replaces everything.
//
// SAFETY: aborts if Yahoo returns 0 rows for ALL tickers (unreachable).
// Must run in production where Yahoo is accessible.
//
// POST /api/rebuild-cotacoes  { "lookbackYears": 5, "dryRun": false }

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const lookbackYears = Math.min(Number(body.lookbackYears ?? 5), 10);
  const dryRun = body.dryRun === true;

  // 1. Discover portfolio tickers
  const transacoes = await fetchTab("meus_ativos");
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

  // 2. Fetch ALL from Yahoo
  const endStr = new Date().toISOString().split("T")[0];
  const start = new Date();
  start.setFullYear(start.getFullYear() - lookbackYears);
  const startStr = start.toISOString().split("T")[0];
  const lookbackDays = Math.ceil((Date.now() - start.getTime()) / 86400000);

  const allTickers = [...yahooMap.keys()];
  const fetchResults = await Promise.allSettled(
    allTickers.map(async (orig) => {
      const yt = yahooMap.get(orig)!;
      const rows = await fetchTicker(yt, startStr, endStr, lookbackDays);
      return { orig: orig.toUpperCase(), rows };
    })
  );

  // 3. Collect raw data by date
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

  // SAFETY: abort if Yahoo returned nothing (unreachable from sandbox)
  if (totalRawPoints === 0) {
    return NextResponse.json({
      ok: false,
      message: "Yahoo retornou 0 pontos para todos os tickers — provavelmente inacessível deste ambiente. Rode em produção.",
      tickerErrors,
    });
  }

  // 4. Validate per date: reject weekends + holiday scrambles (canary detection)
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
      let kept = 0;
      for (const [ticker, price] of dayData) {
        if (CRYPTO_TICKERS.has(ticker)) {
          dateSet.add(date);
          if (!prices[date]) prices[date] = {};
          prices[date][ticker] = price;
          kept++;
        }
      }
      acceptedPoints += kept;
      continue;
    }

    // SPY canary
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

    // ITUB4.SA canary
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

    // ^BVSP sanity
    const bvsp = dayData.get("^BVSP");
    if (bvsp != null && bvsp > 0 && bvsp < 50000) {
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

    // Good date: accept all data
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
      message: "Dry run — nenhum dado foi escrito. Remova dryRun para executar.",
    });
  }

  // 5. Write (writeGoldenSource makes a backup automatically)
  await writeGoldenSource(rebuilt);

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

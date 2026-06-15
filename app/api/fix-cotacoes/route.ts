import { NextResponse } from "next/server";
import { readGoldenSource, writeGoldenSource } from "@/lib/db-cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CRYPTO = new Set(["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "ADA-USD", "XRP-USD"]);

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.getUTCDay() === 0 || d.getUTCDay() === 6;
}

export async function POST() {
  const data = await readGoldenSource();
  let removed = 0;
  const badDates = new Set<string>();

  // 1) Weekends — Yahoo returns scrambled stock prices
  for (const date of data.dates) {
    if (isWeekend(date)) badDates.add(date);
  }

  // 2) Detect scrambled dates using SPY as canary.
  //    If SPY deviates >40% from last known good value, the date is scrambled.
  //    This catches US holidays, multi-day scrambled sequences, etc.
  let lastGoodSpy = 0;
  for (const date of data.dates) {
    if (badDates.has(date)) continue;
    const spy = data.prices[date]?.["SPY"];
    if (spy == null || spy <= 0) continue;
    if (lastGoodSpy > 0 && Math.abs(spy - lastGoodSpy) / lastGoodSpy > 0.40) {
      badDates.add(date);
    } else {
      lastGoodSpy = spy;
    }
  }

  // 3) Same for ITUB4.SA as canary for Brazilian holidays.
  //    B3 closes but NYSE stays open — .SA tickers get scrambled.
  let lastGoodItub = 0;
  for (const date of data.dates) {
    if (badDates.has(date)) continue;
    const itub = data.prices[date]?.["ITUB4.SA"];
    if (itub == null || itub <= 0) continue;
    if (lastGoodItub > 0 && Math.abs(itub - lastGoodItub) / lastGoodItub > 0.40) {
      badDates.add(date);
    } else {
      lastGoodItub = itub;
    }
  }

  // 4) Same for ^BVSP (Ibovespa) — should be in 60k-250k range
  for (const date of data.dates) {
    const bvsp = data.prices[date]?.["^BVSP"];
    if (bvsp != null && bvsp > 0 && bvsp < 50000) {
      badDates.add(date);
    }
  }

  // 5) Remove ALL non-crypto data from bad dates.
  //    (FX on scrambled dates is also unreliable — seen Jun 3-14 2026)
  for (const date of badDates) {
    const prices = data.prices[date];
    if (!prices) continue;
    for (const ticker of Object.keys(prices)) {
      if (CRYPTO.has(ticker)) continue;
      delete prices[ticker];
      removed++;
    }
  }

  if (removed === 0) {
    return NextResponse.json({ ok: true, message: "Nothing to fix", removed: 0 });
  }

  await writeGoldenSource(data);

  return NextResponse.json({
    ok: true,
    removed,
    badDates: badDates.size,
    weekends: [...badDates].filter(isWeekend).length,
    holidays: [...badDates].filter(d => !isWeekend(d)).length,
    sampleHolidays: [...badDates].filter(d => !isWeekend(d)).sort().slice(0, 20),
  });
}

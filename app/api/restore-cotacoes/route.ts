import { NextResponse } from "next/server";
import { readGoldenSource, writeGoldenSource } from "@/lib/db-cotacoes";
import { fetchTicker } from "@/lib/market-history";
import { yahooTicker } from "@/lib/cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Restore one or more tickers in db_cotacoes directly from the origin (Yahoo),
// then strip only UNAMBIGUOUS source artifacts: a price that spikes and reverts
// within 1-2 days (physically impossible for an index/ETF — it's a Yahoo glitch).
//
// This is the "fix the data at the source" tool, replacing the earlier ad-hoc
// fix-cotacoes that deleted legitimate data with blunt thresholds.
//
// SAFETY: if Yahoo returns no rows for a ticker (e.g. unreachable / rate-limited),
// that ticker is SKIPPED — never wiped. writeGoldenSource snapshots the tab first.
//
// POST /api/restore-cotacoes  { "tickers": ["VWRA.L","DPM.TO","XPML11.SA"], "lookbackYears": 5 }

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.getUTCDay() === 0 || d.getUTCDay() === 6;
}

// Detect a round-trip spike: day N jumps >=jumpPct vs N-1, and within 2 days
// reverts most of the way back. Returns the set of dates to drop (the spike tops).
function findRoundTripArtifacts(series: { date: string; price: number }[], jumpPct = 0.30): Set<string> {
  const drop = new Set<string>();
  for (let i = 1; i < series.length - 1; i++) {
    const prev = series[i - 1].price;
    const cur = series[i].price;
    if (prev <= 0) continue;
    const up = (cur - prev) / prev;
    if (Math.abs(up) < jumpPct) continue;
    // look ahead 1-2 days for a revert back toward prev
    for (let j = i + 1; j <= Math.min(i + 2, series.length - 1); j++) {
      const back = series[j].price;
      // reverted to within 15% of the pre-spike level, opposite direction
      if (Math.abs(back - prev) / prev < 0.15 && Math.sign(back - cur) !== Math.sign(up)) {
        for (let k = i; k < j; k++) drop.add(series[k].date);
        break;
      }
    }
  }
  return drop;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const tickers: string[] = Array.isArray(body.tickers) && body.tickers.length
    ? body.tickers.map((t: string) => String(t).toUpperCase())
    : ["VWRA.L", "DPM.TO", "XPML11.SA"];
  const lookbackYears = Math.min(Number(body.lookbackYears ?? 5), 10);

  const data = await readGoldenSource();
  if (data.dates.length === 0) {
    return NextResponse.json({ error: "db_cotacoes vazio" }, { status: 422 });
  }

  const endStr = new Date().toISOString().split("T")[0];
  const start = new Date();
  start.setFullYear(start.getFullYear() - lookbackYears);
  const startStr = start.toISOString().split("T")[0];
  const lookbackDays = Math.ceil((Date.now() - start.getTime()) / 86400000);

  const report: Record<string, { fetched: number; artifactsDropped: number; status: string }> = {};
  let anyChange = false;

  for (const ticker of tickers) {
    const yt = yahooTicker(ticker, "", "");
    let rows: { date: string; price: number }[] = [];
    try {
      rows = await fetchTicker(yt, startStr, endStr, lookbackDays);
    } catch {
      report[ticker] = { fetched: 0, artifactsDropped: 0, status: "fetch_error_skipped" };
      continue;
    }

    // SAFETY GUARD: never wipe a column on an empty/failed fetch
    if (rows.length === 0) {
      report[ticker] = { fetched: 0, artifactsDropped: 0, status: "no_data_skipped" };
      continue;
    }

    // Clean weekends, then strip round-trip artifacts (source glitches)
    const clean = rows.filter(r => r.price > 0 && !isWeekend(r.date)).sort((a, b) => a.date.localeCompare(b.date));
    const artifacts = findRoundTripArtifacts(clean);
    const final = clean.filter(r => !artifacts.has(r.date));

    // Replace this ticker's entire column with fresh origin data
    const dateSet = new Set(data.dates);
    for (const date of data.dates) {
      if (data.prices[date]) delete data.prices[date][ticker];
    }
    for (const { date, price } of final) {
      if (!dateSet.has(date)) { data.dates.push(date); dateSet.add(date); }
      if (!data.prices[date]) data.prices[date] = {};
      data.prices[date][ticker] = price;
    }
    if (!data.tickers.includes(ticker)) data.tickers.push(ticker);

    report[ticker] = { fetched: final.length, artifactsDropped: artifacts.size, status: "restored" };
    anyChange = true;
  }

  if (!anyChange) {
    return NextResponse.json({ ok: false, message: "No ticker restored (Yahoo unreachable?)", report });
  }

  data.dates.sort();
  await writeGoldenSource(data); // snapshots the tab before overwriting

  return NextResponse.json({ ok: true, report });
}

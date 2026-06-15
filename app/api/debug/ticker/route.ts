import { NextResponse } from "next/server";
import { readGoldenSource } from "@/lib/db-cotacoes";

export const dynamic = "force-dynamic";

// Read-only dump of a single ticker's full price series for debugging.
// GET /api/debug/ticker?t=VWRA.L
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = (url.searchParams.get("t") ?? "").toUpperCase();
  if (!ticker) return NextResponse.json({ error: "missing ?t=TICKER" }, { status: 400 });

  const data = await readGoldenSource();
  const series: { date: string; price: number; retPct: number | null }[] = [];
  let prev: number | null = null;
  for (const date of data.dates) {
    const p = data.prices[date]?.[ticker];
    if (p == null) continue;
    const retPct = prev != null && prev > 0 ? Math.round(((p - prev) / prev) * 10000) / 100 : null;
    series.push({ date, price: p, retPct });
    prev = p;
  }
  return NextResponse.json(
    { ticker, points: series.length, series },
    { headers: { "Cache-Control": "no-store" } },
  );
}

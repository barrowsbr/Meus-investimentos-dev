import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export interface OhlcPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchOhlc(
  ticker: string,
  range: string,
  interval: string,
): Promise<OhlcPoint[]> {
  for (const host of ["query1", "query2"]) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      let res: Response;
      try {
        res = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "application/json, */*",
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const timestamps: number[] = result.timestamp ?? [];
      const q = result.indicators?.quote?.[0] ?? {};
      const opens: (number | null)[] = q.open ?? [];
      const highs: (number | null)[] = q.high ?? [];
      const lows: (number | null)[] = q.low ?? [];
      const closes: (number | null)[] = q.close ?? [];
      const volumes: (number | null)[] = q.volume ?? [];

      const points: OhlcPoint[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const o = opens[i], h = highs[i], l = lows[i], c = closes[i];
        if (o == null || h == null || l == null || c == null) continue;
        if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) continue;
        points.push({
          time: new Date(timestamps[i] * 1000).toISOString().split("T")[0],
          open: o,
          high: h,
          low: l,
          close: c,
          volume: volumes[i] ?? 0,
        });
      }
      if (points.length > 0) return points;
    } catch {
      // try next host
    }
  }
  return [];
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const range = req.nextUrl.searchParams.get("range") ?? "1y";
  const interval = req.nextUrl.searchParams.get("interval") ?? "1d";

  try {
    const data = await fetchOhlc(symbol, range, interval);

    return NextResponse.json({ symbol, data }, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

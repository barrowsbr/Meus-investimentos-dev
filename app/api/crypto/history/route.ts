import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

function toYahooTicker(ticker: string): string {
  const t = ticker.toUpperCase().trim();
  if (t.endsWith("-USD")) return t;
  return `${t}-USD`;
}

function rangeToStartDate(range: string): string {
  const d = new Date();
  switch (range) {
    case "1mo": d.setMonth(d.getMonth() - 1); break;
    case "3mo": d.setMonth(d.getMonth() - 3); break;
    case "6mo": d.setMonth(d.getMonth() - 6); break;
    case "1y": d.setFullYear(d.getFullYear() - 1); break;
    case "max": d.setFullYear(d.getFullYear() - 10); break;
    default: d.setMonth(d.getMonth() - 6);
  }
  return d.toISOString().split("T")[0];
}

interface OHLCPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchViaYF2(symbol: string, range: string): Promise<OHLCPoint[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const YF: any = (await import("yahoo-finance2")).default;
  const yf = typeof YF === "function" ? new YF() : YF;
  const startDate = rangeToStartDate(range);
  const endDate = new Date().toISOString().split("T")[0];
  const rows = await yf.historical(
    symbol,
    { period1: startDate, period2: endDate, interval: "1d" },
    { validateResult: false }
  );
  return (rows ?? []).flatMap((r: Record<string, unknown>) => {
    const open = r.open as number | null;
    const high = r.high as number | null;
    const low = r.low as number | null;
    const close = (r.adjClose ?? r.close) as number | null;
    const volume = (r.volume ?? 0) as number;
    if (open == null || high == null || low == null || close == null) return [];
    const d = r.date instanceof Date ? r.date : new Date(r.date as string);
    return [{ date: d.toISOString().split("T")[0], open, high, low, close, volume }];
  });
}

async function fetchViaV8(symbol: string, range: string): Promise<OHLCPoint[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includeAdjustedClose=true`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error("No chart data");

    const timestamps: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};
    return timestamps.flatMap((ts, i) => {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
      if (o == null || h == null || l == null || c == null) return [];
      return [{ date: new Date(ts * 1000).toISOString().split("T")[0], open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? 0 }];
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const ticker = searchParams.get("ticker");
  const range = searchParams.get("range") || "6mo";

  if (!ticker) {
    return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
  }

  const yahooSymbol = toYahooTicker(ticker);
  const errors: string[] = [];

  // Try yahoo-finance2 first (more reliable), then v8 API
  for (const [label, fetcher] of [
    ["yf2", () => fetchViaYF2(yahooSymbol, range)],
    ["v8", () => fetchViaV8(yahooSymbol, range)],
  ] as [string, () => Promise<OHLCPoint[]>][]) {
    try {
      const data = await fetcher();
      if (data.length > 0) {
        return NextResponse.json({ ticker: ticker.toUpperCase().trim(), data });
      }
      errors.push(`${label}: empty result`);
    } catch (err) {
      errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json(
    { error: `Failed to fetch ${yahooSymbol}: ${errors.join("; ")}` },
    { status: 502 }
  );
}

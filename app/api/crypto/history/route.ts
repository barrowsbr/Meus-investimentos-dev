import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * Maps a crypto ticker to Yahoo Finance format.
 * BTC → BTC-USD, ETH → ETH-USD, etc.
 */
function toYahooTicker(ticker: string): string {
  const t = ticker.toUpperCase().trim();
  // Already in Yahoo format
  if (t.endsWith("-USD")) return t;
  return `${t}-USD`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const ticker = searchParams.get("ticker");
  const range = searchParams.get("range") || "6mo";

  if (!ticker) {
    return NextResponse.json(
      { error: "Missing required query parameter: ticker" },
      { status: 400 }
    );
  }

  const yahooSymbol = toYahooTicker(ticker);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=1d&includeAdjustedClose=true`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Yahoo Finance returned HTTP ${res.status}` },
        { status: 502 }
      );
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];

    if (!result) {
      const errMsg = json?.chart?.error?.description ?? "No data returned";
      return NextResponse.json(
        { error: `No chart data for ${yahooSymbol}: ${errMsg}` },
        { status: 404 }
      );
    }

    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0] ?? {};
    const opens: (number | null)[] = quote.open ?? [];
    const highs: (number | null)[] = quote.high ?? [];
    const lows: (number | null)[] = quote.low ?? [];
    const closes: (number | null)[] = quote.close ?? [];
    const volumes: (number | null)[] = quote.volume ?? [];

    const data = timestamps
      .map((ts, i) => {
        const open = opens[i];
        const high = highs[i];
        const low = lows[i];
        const close = closes[i];
        const volume = volumes[i];

        // Skip entries with missing price data
        if (open == null || high == null || low == null || close == null) {
          return null;
        }

        const date = new Date(ts * 1000).toISOString().split("T")[0];
        return { date, open, high, low, close, volume: volume ?? 0 };
      })
      .filter(Boolean);

    return NextResponse.json({ ticker: ticker.toUpperCase().trim(), data });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json(
        { error: "Request to Yahoo Finance timed out" },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: `Failed to fetch data: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  } finally {
    clearTimeout(timer);
  }
}

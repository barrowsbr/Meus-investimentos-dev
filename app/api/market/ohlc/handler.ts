import { NextRequest, NextResponse } from "next/server";
import { yahooTicker } from "@/lib/cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

function rangeToStartDate(range: string): string {
  const d = new Date();
  switch (range) {
    case "1mo": d.setMonth(d.getMonth() - 1); break;
    case "3mo": d.setMonth(d.getMonth() - 3); break;
    case "6mo": d.setMonth(d.getMonth() - 6); break;
    case "ytd": return `${d.getFullYear()}-01-01`;
    case "1y": d.setFullYear(d.getFullYear() - 1); break;
    case "2y": d.setFullYear(d.getFullYear() - 2); break;
    case "5y": d.setFullYear(d.getFullYear() - 5); break;
    case "max": d.setFullYear(d.getFullYear() - 20); break;
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
    // Use RAW close (golden source convention), fall back to adjClose only if missing.
    const close = (r.close ?? r.adjClose) as number | null;
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

async function searchYahooSymbol(query: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const YF: any = (await import("yahoo-finance2")).default;
    const yf = typeof YF === "function" ? new YF() : YF;
    const res = await yf.search(query, { quotesCount: 6 });
    const match = (res?.quotes ?? []).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q: any) => q.quoteType === "EQUITY" || q.quoteType === "ETF" || q.quoteType === "MUTUALFUND"
    );
    return match?.symbol ?? null;
  } catch {
    return null;
  }
}

interface QuoteInfo {
  sector?: string; industry?: string; longName?: string; currency?: string; exchange?: string;
  marketCap?: number; pe?: number; fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number;
}

async function fetchQuoteInfo(symbol: string): Promise<QuoteInfo> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const YF: any = (await import("yahoo-finance2")).default;
    const yf = typeof YF === "function" ? new YF() : YF;
    const summary = await yf.quoteSummary(symbol, {
      modules: ["assetProfile", "price", "summaryDetail"],
    });
    const price = summary?.price ?? {};
    const detail = summary?.summaryDetail ?? {};
    return {
      sector: summary?.assetProfile?.sector ?? undefined,
      industry: summary?.assetProfile?.industry ?? undefined,
      longName: price.longName ?? price.shortName ?? undefined,
      currency: price.currency ?? undefined,
      exchange: price.exchangeName ?? undefined,
      marketCap: price.marketCap ?? detail.marketCap ?? undefined,
      pe: detail.trailingPE ?? undefined,
      fiftyTwoWeekHigh: detail.fiftyTwoWeekHigh ?? undefined,
      fiftyTwoWeekLow: detail.fiftyTwoWeekLow ?? undefined,
    };
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const YF: any = (await import("yahoo-finance2")).default;
      const yf = typeof YF === "function" ? new YF() : YF;
      const q = await yf.quote(symbol);
      return {
        longName: q?.longName ?? q?.shortName ?? undefined,
        currency: q?.currency ?? undefined,
        exchange: q?.exchangeName ?? q?.fullExchangeName ?? undefined,
      };
    } catch {
      return {};
    }
  }
}

async function tryFetchOHLC(symbol: string, range: string): Promise<{ data: OHLCPoint[]; errors: string[] }> {
  const errors: string[] = [];
  for (const [label, fetcher] of [
    ["yf2", () => fetchViaYF2(symbol, range)],
    ["v8", () => fetchViaV8(symbol, range)],
  ] as [string, () => Promise<OHLCPoint[]>][]) {
    try {
      const data = await fetcher();
      if (data.length > 0) return { data, errors };
      errors.push(`${label}: empty result`);
    } catch (err) {
      errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { data: [], errors };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const ticker = searchParams.get("ticker");
  const moeda = searchParams.get("moeda") || "BRL";
  const corretora = searchParams.get("corretora") || "";
  const range = searchParams.get("range") || "6mo";

  if (!ticker) {
    return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
  }

  // Símbolos já "resolvidos" — índices (^GSPC), câmbio (BRL=X) e papéis com
  // sufixo de bolsa (PETR4.SA, 7203.T) — passam direto, sem o yahooTicker (que
  // é pra ticker de portfólio e re-sufixaria). US sem ponto segue o caminho normal.
  const isRawSymbol = /[\^=.]/.test(ticker);
  const symbol = isRawSymbol ? ticker.toUpperCase().trim() : yahooTicker(ticker, moeda, corretora);

  // 1) Try with the resolved symbol
  let result = await tryFetchOHLC(symbol, range);

  // 2) If failed, try Yahoo search to find correct symbol
  let resolvedSymbol = symbol;
  if (result.data.length === 0) {
    const found = await searchYahooSymbol(ticker);
    if (found && found !== symbol) {
      resolvedSymbol = found;
      result = await tryFetchOHLC(resolvedSymbol, range);
    }
  }

  if (result.data.length > 0) {
    // Fetch sector/industry info (non-blocking on failure)
    const info = await fetchQuoteInfo(resolvedSymbol).catch((): QuoteInfo => ({}));

    return NextResponse.json({
      ticker: ticker.toUpperCase().trim(),
      symbol: resolvedSymbol,
      data: result.data,
      sector: info.sector,
      industry: info.industry,
      longName: info.longName,
      currency: info.currency,
      exchange: info.exchange,
      marketCap: info.marketCap,
      pe: info.pe,
      fiftyTwoWeekHigh: info.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: info.fiftyTwoWeekLow,
    });
  }

  return NextResponse.json(
    { error: `Failed to fetch ${symbol}: ${result.errors.join("; ")}` },
    { status: 502 }
  );
}

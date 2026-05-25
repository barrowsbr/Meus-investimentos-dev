import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function testYF2(ticker: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const yf: any = (await import("yahoo-finance2")).default;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 10);
    const rows = await yf.historical(
      ticker,
      { period1: start.toISOString().split("T")[0], period2: end.toISOString().split("T")[0], interval: "1d" },
      { validateResult: false }
    );
    return { ok: true, count: (rows ?? []).length, sample: (rows ?? [])[0] ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

async function testV8(ticker: string, host: string) {
  const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d&includeAdjustedClose=true`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json, */*",
        },
        signal: controller.signal,
      });
    } finally { clearTimeout(timer); }
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    return {
      ok: !!result,
      status: res.status,
      timestamps: result?.timestamp?.length ?? 0,
      closes: (result?.indicators?.adjclose?.[0]?.adjclose ?? result?.indicators?.quote?.[0]?.close ?? []).length,
      chartError: json?.chart?.error ?? null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

async function testBrapi(ticker: string) {
  try {
    const url = `https://brapi.dev/api/quote/${ticker}?range=5d&interval=1d`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return { ok: false, status: res.status };
    const json = await res.json();
    const count = json?.results?.[0]?.historicalDataPrice?.length ?? 0;
    return { ok: count > 0, count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET() {
  const [yf2AAPL, yf2PETR4, v8q1AAPL, v8q2AAPL, v8q1PETR4, v8q1BRL, brapiPETR4] = await Promise.all([
    testYF2("AAPL"),
    testYF2("PETR4.SA"),
    testV8("AAPL", "query1"),
    testV8("AAPL", "query2"),
    testV8("PETR4.SA", "query1"),
    testV8("BRL=X", "query1"),
    testBrapi("PETR4"),
  ]);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    yf2: { AAPL: yf2AAPL, "PETR4.SA": yf2PETR4 },
    v8: {
      "AAPL/query1": v8q1AAPL,
      "AAPL/query2": v8q2AAPL,
      "PETR4.SA/query1": v8q1PETR4,
      "BRL=X/query1": v8q1BRL,
    },
    brapi: { PETR4: brapiPETR4 },
  });
}

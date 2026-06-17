import { NextRequest, NextResponse } from "next/server";
import { fetchHistory, type HistoryPoint } from "@/lib/cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

function closeNDaysAgo(history: HistoryPoint[], days: number): number | null {
  if (history.length === 0) return null;
  const target = new Date();
  target.setDate(target.getDate() - days);
  const targetStr = target.toISOString().split("T")[0];
  let chosen: number | null = null;
  for (const p of history) {
    if (p.date <= targetStr) chosen = p.close;
    else break;
  }
  return chosen ?? history[0].close;
}

function closeYtd(history: HistoryPoint[]): number | null {
  if (history.length === 0) return null;
  const year = new Date().getFullYear();
  const jan1 = `${year}-01-01`;
  for (const p of history) {
    if (p.date >= jan1) return p.close;
  }
  return history[0].close;
}

function pct(now: number, then: number | null): number | null {
  if (then == null || then <= 0) return null;
  return ((now / then) - 1) * 100;
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  try {
    const history = await fetchHistory(symbol, "1y", "1d");

    let periods = null;
    if (history.length > 5) {
      const now = history[history.length - 1].close;
      periods = {
        "1S": pct(now, closeNDaysAgo(history, 7)),
        "1M": pct(now, closeNDaysAgo(history, 30)),
        "3M": pct(now, closeNDaysAgo(history, 90)),
        "6M": pct(now, closeNDaysAgo(history, 180)),
        "1A": pct(now, closeNDaysAgo(history, 365)),
        YTD: pct(now, closeYtd(history)),
      };
    }

    return NextResponse.json({
      symbol,
      history: history.map(p => ({ date: p.date, close: p.close })),
      periods,
    }, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

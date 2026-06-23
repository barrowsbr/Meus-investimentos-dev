import { NextResponse } from "next/server";
import { fetchQuotes, fetchHistory, type HistoryPoint } from "@/lib/cotacoes";
import { INDICES, type IndexMeta } from "@/lib/radar/indices";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

interface IndexData extends IndexMeta {
  price: number;
  change: number;
  changePct: number;
  currency: string;
}

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

type PeriodKey = "1S" | "1M" | "3M" | "6M" | "1A" | "YTD";

interface Periods {
  "1S": number | null;
  "1M": number | null;
  "3M": number | null;
  "6M": number | null;
  "1A": number | null;
  YTD: number | null;
}

export async function GET() {
  try {
    const symbols = INDICES.map(i => i.symbol);

    const { quotes } = await fetchQuotes(symbols);

    const indices: (IndexData & { periods?: Periods })[] = [];
    for (const meta of INDICES) {
      const q = quotes[meta.symbol];
      indices.push({
        ...meta,
        price: q?.price ?? 0,
        change: q?.change ?? 0,
        changePct: q?.changePercent ?? 0,
        currency: q?.currency || "USD",
      });
    }

    const liveCount = indices.filter(i => i.price > 0).length;
    if (liveCount === 0) {
      return NextResponse.json(
        { error: "Nenhuma fonte de cotação disponível para índices" },
        { status: 502 },
      );
    }

    const spHistory = await fetchHistory("^GSPC", "1y", "1d").catch(() => [] as HistoryPoint[]);
    let spPeriods: Periods | null = null;
    const sp = indices.find(i => i.symbol === "^GSPC");
    if (sp && spHistory.length > 5) {
      const now = sp.price;
      spPeriods = {
        "1S": pct(now, closeNDaysAgo(spHistory, 7)),
        "1M": pct(now, closeNDaysAgo(spHistory, 30)),
        "3M": pct(now, closeNDaysAgo(spHistory, 90)),
        "6M": pct(now, closeNDaysAgo(spHistory, 180)),
        "1A": pct(now, closeNDaysAgo(spHistory, 365)),
        YTD: pct(now, closeYtd(spHistory)),
      };
    }

    const live = indices.filter(i => i.symbol !== "^VIX" && i.price > 0);
    const breadthUp = live.filter(i => i.changePct > 0).length;
    const breadthTotal = live.length;

    const best = live.reduce((a, b) => a.changePct > b.changePct ? a : b);
    const worst = live.reduce((a, b) => a.changePct < b.changePct ? a : b);

    return NextResponse.json({
      indices,
      spHistory: spHistory.map(p => ({ date: p.date, close: p.close })),
      spPeriods,
      breadth: { up: breadthUp, down: breadthTotal - breadthUp, total: breadthTotal },
      best: { symbol: best.symbol, name: best.name, flag: best.flag, changePct: best.changePct },
      worst: { symbol: worst.symbol, name: worst.name, flag: worst.flag, changePct: worst.changePct },
      lastUpdate: new Date().toISOString(),
    }, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

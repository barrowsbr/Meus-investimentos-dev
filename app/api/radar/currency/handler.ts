import { NextRequest, NextResponse } from "next/server";
import { fetchQuotes, fetchHistory, type HistoryPoint } from "@/lib/cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Currency detail — histórico e estatísticas de UMA moeda, para a aba "Moeda"
// do dossiê. Reaproveita fetchHistory/fetchQuotes (lib/cotacoes), sem novo motor.
//   • Moeda comum: símbolo `{CODE}=X` (Yahoo) → "unidades por 1 USD".
//   • USD: usa o Índice do Dólar (DXY, DX-Y.NYB) — não faz sentido "USD vs USD".
// ─────────────────────────────────────────────────────────────────────────────

function closeNDaysAgo(history: HistoryPoint[], days: number): number | null {
  if (history.length === 0) return null;
  const target = new Date();
  target.setDate(target.getDate() - days);
  const t = target.toISOString().split("T")[0];
  let chosen: number | null = null;
  for (const p of history) {
    if (p.date <= t) chosen = p.close;
    else break;
  }
  return chosen ?? history[0].close;
}

function closeYtd(history: HistoryPoint[]): number | null {
  if (history.length === 0) return null;
  const jan1 = `${new Date().getFullYear()}-01-01`;
  for (const p of history) if (p.date >= jan1) return p.close;
  return history[0].close;
}

function pct(now: number, then: number | null): number | null {
  if (then == null || then <= 0) return null;
  return ((now / then) - 1) * 100;
}

export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get("code") || "").toUpperCase();
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const isDollarIndex = code === "USD";
  const symbol = isDollarIndex ? "DX-Y.NYB" : `${code}=X`;

  try {
    const [{ quotes }, history] = await Promise.all([
      fetchQuotes([symbol]).catch(() => ({ quotes: {} as Record<string, import("@/lib/cotacoes").Quote>, source: "none" })),
      fetchHistory(symbol, "1y", "1d").catch(() => [] as HistoryPoint[]),
    ]);

    const q = quotes[symbol];
    const rate = q?.price ?? (history.length ? history[history.length - 1].close : null);
    if (rate == null || rate <= 0) {
      return NextResponse.json({ code, error: "Sem cotação disponível" }, { status: 404 });
    }

    const changePct = q?.changePercent ?? 0;
    const periods = history.length > 5 ? {
      "1S": pct(rate, closeNDaysAgo(history, 7)),
      "1M": pct(rate, closeNDaysAgo(history, 30)),
      "3M": pct(rate, closeNDaysAgo(history, 90)),
      "6M": pct(rate, closeNDaysAgo(history, 180)),
      "1A": pct(rate, closeNDaysAgo(history, 365)),
      "YTD": pct(rate, closeYtd(history)),
    } : null;

    const closes = history.map((h) => h.close);
    const hi52 = closes.length ? Math.max(...closes) : null;
    const lo52 = closes.length ? Math.min(...closes) : null;

    return NextResponse.json({
      code,
      isDollarIndex,
      symbol,
      rate,
      changePct,
      periods,
      hi52,
      lo52,
      history: history.map((h) => ({ date: h.date, close: h.close })),
    }, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ code, error: msg }, { status: 500 });
  }
}

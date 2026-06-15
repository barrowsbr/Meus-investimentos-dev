import { NextResponse } from "next/server";
import { runCotacoesSync } from "@/lib/sync-cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Manual incremental update of the golden source (db_cotacoes).
// No longer scheduled via cron — sync happens on-demand when the app opens
// (via /api/cotacoes/refresh). This endpoint is kept for manual triggers.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
  }

  try {
    const report = await runCotacoesSync("update");
    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      newPoints: report.newPoints,
      rejectedDates: report.rejectedDates,
      anomalyCount: report.anomalyCount,
      tickerErrors: report.tickerErrors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

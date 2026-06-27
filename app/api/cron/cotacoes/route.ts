import { NextResponse } from "next/server";
import { runCotacoesSync } from "@/lib/sync-cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Scheduled incremental update of the golden source (db_cotacoes).
// Triggered by the Vercel Cron defined in vercel.json. Vercel automatically
// sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set — we
// verify it so the endpoint can't be triggered by anyone else.
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
      writeMode: report.writeMode,
      writeReason: report.writeReason,
      written: report.written,
      anomalyCount: report.anomalyCount,
      tickerErrors: report.tickerErrors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

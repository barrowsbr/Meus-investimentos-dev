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

  // Liga/desliga em Configurações → Automações (o cron continua disparando;
  // o endpoint é quem pula quando desligado).
  const { isAutomacaoAtiva } = await import("@/lib/automacoes");
  if (!(await isAutomacaoAtiva("cron_cotacoes"))) {
    return NextResponse.json({ ok: true, skipped: "desligado em Configurações → Automações" });
  }

  try {
    const report = await runCotacoesSync("update");

    // PTAX → aba p_tax (best-effort): antes só salvava quando o dono abria a
    // página Impostos e a aba ficava para trás em silêncio. Pendurar no cron
    // diário garante a auditoria fiscal em dia; falha aqui não derruba o cron.
    const { salvarPtaxNaPlanilha } = await import("@/lib/ptax-store");
    const ptax = await salvarPtaxNaPlanilha().catch((e) => ({
      ok: false as const, newRows: 0, error: e instanceof Error ? e.message : "Erro",
    }));

    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      newPoints: report.newPoints,
      writeMode: report.writeMode,
      writeReason: report.writeReason,
      written: report.written,
      anomalyCount: report.anomalyCount,
      tickerErrors: report.tickerErrors,
      ptax,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

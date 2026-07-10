import { NextResponse } from "next/server";
import { recordHistorico } from "@/lib/historico-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Gravação do histórico patrimonial ────────────────────────────────────────
// NÃO é um cron da Vercel (o plano Hobby só permite 1×/dia). É chamado pelo
// GitHub Action `historico.yml` (3×/dia) com `Authorization: Bearer CRON_SECRET`.
// Respeita o liga/desliga de Configurações (aba historico_config).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
  }
  try {
    const result = await recordHistorico();
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

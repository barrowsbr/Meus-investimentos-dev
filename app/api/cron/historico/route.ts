import { NextResponse } from "next/server";
import { recordHistorico } from "@/lib/historico-store";
import { garantirWebhookTelegram } from "@/lib/telegram-ativacao";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Gravação do histórico patrimonial ────────────────────────────────────────
// NÃO é um cron da Vercel (o plano Hobby só permite 1×/dia). É chamado pelo
// GitHub Action `historico.yml` (3×/dia) com `Authorization: Bearer CRON_SECRET`.
// Respeita o liga/desliga de Configurações (escopo `historico` da app_config).
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
    // Carona 3×/dia: mantém o webhook do bot do Telegram SEMPRE registrado
    // (auto-curativo — se o registro cair, re-arma sozinho). Best-effort.
    const bot = await garantirWebhookTelegram().catch(() => null);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...result, bot });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

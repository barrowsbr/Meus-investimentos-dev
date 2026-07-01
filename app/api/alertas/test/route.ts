import { NextResponse } from "next/server";
import { isDemoRequest } from "@/lib/demo";
import { readAlertasConfig } from "@/lib/alertas-store";
import { sendTelegramMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

// POST — envia uma mensagem de teste agora (fora do cron). Não escreve na
// planilha, mas tem efeito real (chega no Telegram do dono) — bloqueado em
// modo demo para uma visita ao showcase não conseguir disparar notificação real.
export async function POST() {
  if (isDemoRequest()) {
    return NextResponse.json({ error: "Indisponível em modo demonstração" }, { status: 403 });
  }
  try {
    const config = await readAlertasConfig();
    if (!config.chatId) {
      return NextResponse.json({ error: "Configure e salve o chat_id primeiro" }, { status: 400 });
    }
    const res = await sendTelegramMessage(
      config.chatId,
      "✅ *Meus Investimentos* — alertas conectados! Você vai receber avisos de DARF, DIRPF e alavancagem por aqui.",
    );
    if (!res.ok) return NextResponse.json({ error: res.error ?? "Falha ao enviar" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

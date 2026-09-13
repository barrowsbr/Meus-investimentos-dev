import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth-server";
import { isDemoRequest } from "@/lib/demo";
import { readAlertasConfig, resolveBotToken } from "@/lib/alertas-store";
import { sendTelegramMessage } from "@/lib/telegram";
import { paraTodos, resumoEnvio } from "@/lib/telegram-broadcast";

export const dynamic = "force-dynamic";

// POST — envia uma mensagem de teste agora (fora do cron). Não escreve na
// planilha, mas tem efeito real (chega no Telegram do dono) — bloqueado em
// modo demo para uma visita ao showcase não conseguir disparar notificação real.
export async function POST() {
  const denied = await requireOwner();
  if (denied) return denied;
  if (isDemoRequest()) {
    return NextResponse.json({ error: "Indisponível em modo demonstração" }, { status: 403 });
  }
  try {
    const config = await readAlertasConfig();
    if (!config.chatId) {
      return NextResponse.json({ error: "Configure e salve o chat_id primeiro" }, { status: 400 });
    }
    // Testa a lista INTEIRA (dono + convidados). O teste serve justamente para
    // confirmar que cada destino recebe — testar só o dono esconderia um
    // convidado com id errado, que é o erro mais provável ao adicionar alguém.
    const token = resolveBotToken(config);
    const r = await paraTodos(config, (destino) => sendTelegramMessage(
      token, destino,
      "✅ *Meus Investimentos* — alertas conectados! Você vai receber avisos de DARF, DIRPF e alavancagem por aqui.",
    ));
    if (r.enviados === 0) return NextResponse.json({ error: r.erro ?? "Falha ao enviar" }, { status: 500 });
    return NextResponse.json({ ok: true, ...r, resumo: resumoEnvio(r) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

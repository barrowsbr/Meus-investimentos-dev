import { NextResponse } from "next/server";
import { isDemoRequest } from "@/lib/demo";
import { readAlertasConfig } from "@/lib/alertas-store";
import { buildDigest, buildDigestCaption } from "@/lib/digest";
import { renderDigestImage } from "@/lib/digest-image";
import { sendTelegramPhoto } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Envio manual do resumo do dia (botão em Configurações). Tem efeito real
// (chega no Telegram) → bloqueado em modo demonstração.
export async function POST() {
  if (isDemoRequest()) {
    return NextResponse.json({ error: "Indisponível em modo demonstração" }, { status: 403 });
  }
  try {
    const config = await readAlertasConfig();
    if (!config.chatId) {
      return NextResponse.json({ error: "Configure e salve o chat_id primeiro" }, { status: 400 });
    }
    const data = await buildDigest();
    const png = await renderDigestImage(data).arrayBuffer();
    const res = await sendTelegramPhoto(config.chatId, png, buildDigestCaption(data));
    if (!res.ok) return NextResponse.json({ error: res.error ?? "Falha ao enviar" }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

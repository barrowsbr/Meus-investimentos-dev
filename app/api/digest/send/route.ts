import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth-server";
import { isDemoRequest } from "@/lib/demo";
import { readAlertasConfig, resolveBotToken } from "@/lib/alertas-store";
import { paraTodos, resumoEnvio } from "@/lib/telegram-broadcast";
import { buildDigest, buildDigestCaption, resolveAppUrl } from "@/lib/digest";
import { renderDigestImage } from "@/lib/digest-image";
import { sendTelegramPhoto } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Envio manual do resumo do dia (botão em Configurações). Tem efeito real
// (chega no Telegram) → bloqueado em modo demonstração.
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
    const data = await buildDigest();
    const png = await renderDigestImage(data).arrayBuffer();
    const appUrl = resolveAppUrl();
    // Mesma lista do cron: o envio manual não pode ter alcance diferente do
    // automático, senão "testei e chegou" deixa de provar que o diário chega.
    const token = resolveBotToken(config);
    const r = await paraTodos(config, (destino) => sendTelegramPhoto(token, destino, png, buildDigestCaption(data), {
      parseMode: "HTML",
      buttons: appUrl ? [[
        { text: "📊 Dashboard", url: appUrl },
        { text: "📈 Performance", url: `${appUrl}/performance` },
      ]] : undefined,
    }));
    if (r.enviados === 0) return NextResponse.json({ error: r.erro ?? "Falha ao enviar" }, { status: 500 });
    return NextResponse.json({ ok: true, ...r, resumo: resumoEnvio(r) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

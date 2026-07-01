import { NextResponse } from "next/server";
import { readAlertasConfig, resolveBotToken } from "@/lib/alertas-store";
import { buildDigest, buildDigestCaption, resolveAppUrl } from "@/lib/digest";
import { renderDigestImage } from "@/lib/digest-image";
import { sendTelegramPhoto } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Resumo do dia (imagem + legenda) via Telegram — 1x/dia pelo Vercel Cron.
// Mesmo padrão de auth dos outros crons (Authorization: Bearer CRON_SECRET).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
  }

  try {
    const config = await readAlertasConfig();
    if (!config.ativo || !config.resumoAtivo || !config.chatId) {
      return NextResponse.json({
        ok: true,
        ranAt: new Date().toISOString(),
        skipped: !config.chatId ? "chat_id não configurado" : (!config.ativo ? "alertas desativados" : "resumo diário desativado"),
      });
    }

    const data = await buildDigest();
    const png = await renderDigestImage(data).arrayBuffer();
    const appUrl = resolveAppUrl();
    const res = await sendTelegramPhoto(resolveBotToken(config), config.chatId, png, buildDigestCaption(data), {
      parseMode: "HTML",
      buttons: appUrl ? [[
        { text: "📊 Dashboard", url: appUrl },
        { text: "📈 Performance", url: `${appUrl}/performance` },
      ]] : undefined,
    });

    return NextResponse.json({ ok: res.ok, ranAt: new Date().toISOString(), error: res.ok ? undefined : res.error });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erro desconhecido" }, { status: 500 });
  }
}

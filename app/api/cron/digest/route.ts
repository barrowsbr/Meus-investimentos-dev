import { NextResponse } from "next/server";
import { readAlertasConfig, resolveBotToken } from "@/lib/alertas-store";
import { buildDigest, buildDigestCaption, resolveAppUrl } from "@/lib/digest";
import { renderDigestImage } from "@/lib/digest-image";
import { sendTelegramPhoto } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Hora atual no fuso de Brasília (0–23). hourCycle h23 evita o "24" da meia-noite.
function horaBRT(): number {
  return Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }));
}

// Resumo do dia (imagem + legenda) via Telegram. O Vercel Cron dispara de HORA
// em hora ("0 * * * *"); os horários de envio vêm da config (resumo_horarios,
// fuso de Brasília) — configuráveis pela UI sem precisar de deploy. Mesmo
// padrão de auth dos outros crons (Authorization: Bearer CRON_SECRET).
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

    // Gate de horário: só envia quando a hora atual (BRT) está na lista.
    // `?force=1` pula o gate (útil pra testar o cron manualmente).
    const force = new URL(request.url).searchParams.get("force") === "1";
    const hora = horaBRT();
    if (!force && !config.resumoHorarios.includes(hora)) {
      return NextResponse.json({
        ok: true,
        ranAt: new Date().toISOString(),
        skipped: `fora do horário (agora ${hora}h BRT; configurado: ${config.resumoHorarios.map(h => `${h}h`).join(", ")})`,
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

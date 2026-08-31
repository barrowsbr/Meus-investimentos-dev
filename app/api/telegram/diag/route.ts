import { NextResponse } from "next/server";
import { readAlertasConfig, resolveBotToken } from "@/lib/alertas-store";
import { getDataStore } from "@/lib/data-store";

export const dynamic = "force-dynamic";

// Diagnóstico do bot ("mandei mensagem e nada aconteceu") — responde de onde a
// falha está SEM expor segredo nenhum: token/chatId/segredo viram booleanos, e
// o getWebhookInfo do Telegram traz o que o bot vê (URL registrada, updates
// pendentes e o ÚLTIMO ERRO que o Telegram recebeu ao entregar um update).
// Auth por CRON_SECRET: quem chama é o workflow telegram-diag (runners do
// GitHub alcançam a produção; o dev não). Log do CI é público — só metadados.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
  }

  const cfg = await readAlertasConfig().catch(() => null);
  if (!cfg) return NextResponse.json({ erro: "não consegui ler a config de alertas (planilha)" });

  const token = resolveBotToken(cfg);
  const base: Record<string, unknown> = {
    temToken: Boolean(token),
    temChatId: Boolean(cfg.chatId),
    temWebhookSecret: Boolean((cfg.webhookSecret ?? "").trim()),
  };
  if (!token) return NextResponse.json({ ...base, veredito: "SEM TOKEN — configure o token do bot" });

  // A aba telegram_conversas só ganha linhas no fim do processamento (depois
  // da TENTATIVA de envio — o resultado do envio não condiciona a gravação).
  // Linhas recentes lá + "nada chegou" no chat = o handler processou e a falha
  // foi no envio. Só metadados: contagem e horário, sem texto.
  try {
    const rows = await getDataStore().fetchTab("telegram_conversas");
    base.conversas = {
      linhas: rows.length,
      ultima: rows.length ? String(rows[rows.length - 1]["timestamp"] ?? "") : "",
      ultimoPapel: rows.length ? String(rows[rows.length - 1]["papel"] ?? "") : "",
    };
  } catch {
    base.conversas = { linhas: 0, aviso: "aba ainda não existe — nenhuma resposta completou" };
  }

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const info = (await r.json())?.result ?? {};
    const url = String(info.url ?? "");
    const registradoAqui = url.includes("/api/telegram/webhook");
    return NextResponse.json({
      ...base,
      webhook: {
        url,
        pendentes: info.pending_update_count ?? 0,
        ultimoErro: info.last_error_message ?? "",
        ultimoErroEm: info.last_error_date
          ? new Date(Number(info.last_error_date) * 1000).toISOString()
          : "",
        ipAddress: info.ip_address ?? "",
      },
      veredito: !url
        ? "WEBHOOK NÃO REGISTRADO — falta clicar em Ativar respostas (Configurações → Alertas)"
        : !registradoAqui
          ? "WEBHOOK APONTA PARA OUTRA URL — reativar em Configurações → Alertas"
          : !base.temWebhookSecret
            ? "WEBHOOK REGISTRADO MAS SEGREDO SUMIU DA CONFIG — reativar (todo update leva 401)"
            : info.last_error_message
              ? "WEBHOOK ATIVO, MAS O TELEGRAM REPORTA ERRO NA ENTREGA (ver ultimoErro)"
              : "WEBHOOK ATIVO E SEM ERRO REPORTADO",
    });
  } catch (e) {
    return NextResponse.json({ ...base, erro: e instanceof Error ? e.message : "falha ao consultar o Telegram" });
  }
}

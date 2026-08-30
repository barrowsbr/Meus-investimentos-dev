import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth-server";
import { readAlertasConfig, writeAlertasConfig, resolveBotToken } from "@/lib/alertas-store";

export const dynamic = "force-dynamic";

// Liga/desliga as RESPOSTAS do bot (o webhook), sem trabalho manual: gera o
// segredo, registra no Telegram e salva. GET devolve o estado atual.
// Só o dono (requireOwner) — é aqui que se decide quem pode falar com o bot.

const API = (token: string, m: string) => `https://api.telegram.org/bot${token}/${m}`;

function urlDoWebhook(request: Request): string {
  const base = process.env.APP_URL?.trim()
    || `https://${request.headers.get("host") ?? "meus-investimentos-dev.vercel.app"}`;
  return `${base.replace(/\/$/, "")}/api/telegram/webhook`;
}

export async function GET() {
  const denied = await requireOwner();
  if (denied) return denied;
  const cfg = await readAlertasConfig();
  const token = resolveBotToken(cfg);
  if (!token) return NextResponse.json({ ativo: false, motivo: "bot sem token" });

  let info: Record<string, unknown> | null = null;
  try {
    const r = await fetch(API(token, "getWebhookInfo"), { cache: "no-store", signal: AbortSignal.timeout(10000) });
    info = (await r.json())?.result ?? null;
  } catch { /* rede */ }

  return NextResponse.json({
    ativo: Boolean(cfg.webhookSecret) && Boolean(info?.url),
    url: info?.url ?? "",
    pendentes: info?.pending_update_count ?? 0,
    ultimoErro: info?.last_error_message ?? "",
    temChatId: Boolean(cfg.chatId),
  });
}

export async function POST(request: Request) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { ativar } = await request.json().catch(() => ({ ativar: true }));
  const cfg = await readAlertasConfig();
  const token = resolveBotToken(cfg);
  if (!token) return NextResponse.json({ error: "Configure o token do bot primeiro." }, { status: 422 });

  try {
    if (!ativar) {
      await fetch(API(token, "deleteWebhook"), { method: "POST", signal: AbortSignal.timeout(10000) });
      await writeAlertasConfig({ ...cfg, webhookSecret: "" });
      return NextResponse.json({ ativo: false });
    }

    if (!cfg.chatId) {
      return NextResponse.json({ error: "Salve o chat_id antes — é ele que autoriza quem o bot atende." }, { status: 422 });
    }

    // Segredo forte, gerado aqui (o dono não precisa inventar nem colar nada).
    const segredo = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");

    const url = urlDoWebhook(request);
    const res = await fetch(API(token, "setWebhook"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: segredo,
        allowed_updates: ["message"], // só mensagem: nada de canal, edição, etc.
        drop_pending_updates: true,   // não responde a backlog antigo ao ligar
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return NextResponse.json({ error: data?.description ?? `HTTP ${res.status}` }, { status: 502 });
    }

    await writeAlertasConfig({ ...cfg, webhookSecret: segredo });
    return NextResponse.json({ ativo: true, url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

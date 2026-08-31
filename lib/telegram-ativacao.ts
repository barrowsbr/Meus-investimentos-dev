// Auto-ativação do bot (SERVER-ONLY) — o dono não deve depender de botão.
// O Telegram só ENTREGA mensagem com webhook registrado; se o registro cair
// (troca de token, deleteWebhook acidental, falha na ativação manual), o bot
// fica mudo em silêncio. Esta função roda de carona nos crons diários e
// re-registra sozinha quando: tem token + chat_id e a URL registrada no
// Telegram está vazia ou aponta para outro lugar.
import { readAlertasConfig, writeAlertasConfig, resolveBotToken } from "./alertas-store";

const API = (token: string, m: string) => `https://api.telegram.org/bot${token}/${m}`;
const WEBHOOK_URL = `${(process.env.APP_URL?.trim() || "https://meus-investimentos-dev.vercel.app").replace(/\/$/, "")}/api/telegram/webhook`;

export interface GarantirWebhookResult {
  ok: boolean;
  acao: "ja_ativo" | "reativado" | "sem_config" | "erro";
  detalhe?: string;
}

export async function garantirWebhookTelegram(): Promise<GarantirWebhookResult> {
  try {
    const cfg = await readAlertasConfig();
    const token = resolveBotToken(cfg);
    // Sem token ou sem chat_id não há o que armar (e sem chat_id o webhook
    // recusaria todo mundo) — não é erro, é "bot não configurado".
    if (!token || !cfg.chatId) return { ok: true, acao: "sem_config" };

    const r = await fetch(API(token, "getWebhookInfo"), { cache: "no-store", signal: AbortSignal.timeout(10000) });
    const url = String((await r.json())?.result?.url ?? "");
    if (url === WEBHOOK_URL && (cfg.webhookSecret ?? "").trim()) return { ok: true, acao: "ja_ativo" };

    // Registro caído/errado (ou segredo perdido) → re-registra com segredo novo.
    const segredo = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    const res = await fetch(API(token, "setWebhook"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: WEBHOOK_URL,
        secret_token: segredo,
        allowed_updates: ["message"],
        // NÃO dropa pendentes: se o registro caiu com mensagem na fila, ela
        // ainda deve ser respondida (diferente da ativação manual).
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return { ok: false, acao: "erro", detalhe: String(data?.description ?? `HTTP ${res.status}`).slice(0, 160) };
    }
    await writeAlertasConfig({ ...cfg, webhookSecret: segredo });
    return { ok: true, acao: "reativado" };
  } catch (e) {
    return { ok: false, acao: "erro", detalhe: String(e instanceof Error ? e.message : e).slice(0, 160) };
  }
}

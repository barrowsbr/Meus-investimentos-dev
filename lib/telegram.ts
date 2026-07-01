// Envio via Telegram Bot API. O `token` é resolvido pelo chamador
// (resolveBotToken: env var TELEGRAM_BOT_TOKEN tem prioridade; senão o salvo na
// planilha) e passado explicitamente — este módulo não lê o token de lugar
// nenhum, para o token nunca vazar por acidente.

export interface TelegramSendResult {
  ok: boolean;
  error?: string;
}

export async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<TelegramSendResult> {
  if (!token) return { ok: false, error: "token do bot não configurado" };
  if (!chatId) return { ok: false, error: "chat_id não configurado" };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.description ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro de rede" };
  }
}

// Envia uma FOTO (PNG/JPEG) com legenda opcional (Markdown). Usado pelo digest
// diário — a imagem é gerada com next/og e mandada como multipart/form-data.
export async function sendTelegramPhoto(
  token: string,
  chatId: string,
  photo: ArrayBuffer | Uint8Array,
  caption?: string,
): Promise<TelegramSendResult> {
  if (!token) return { ok: false, error: "token do bot não configurado" };
  if (!chatId) return { ok: false, error: "chat_id não configurado" };

  try {
    const bytes = photo instanceof Uint8Array ? photo : new Uint8Array(photo);
    const form = new FormData();
    form.append("chat_id", chatId);
    if (caption) {
      // Legenda do Telegram: limite de 1024 caracteres.
      form.append("caption", caption.slice(0, 1024));
      form.append("parse_mode", "Markdown");
    }
    form.append("photo", new Blob([bytes as BlobPart], { type: "image/png" }), "digest.png");

    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: form,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.description ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro de rede" };
  }
}

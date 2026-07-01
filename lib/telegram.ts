// Envio de mensagem via Telegram Bot API. O token do bot fica SÓ como env var
// (TELEGRAM_BOT_TOKEN) — nunca na planilha, nunca no cliente. O chat_id (não é
// segredo por si só — sem o token ninguém envia nada com ele) é configurável
// em Configurações e persistido na aba `alertas_config`.

export interface TelegramSendResult {
  ok: boolean;
  error?: string;
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN não configurado" };
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
  chatId: string,
  photo: ArrayBuffer | Uint8Array,
  caption?: string,
): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN não configurado" };
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

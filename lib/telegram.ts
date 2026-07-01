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

// Botão inline (linha × coluna) — só botões de URL, o suficiente pro digest.
export interface TelegramUrlButton { text: string; url: string }

// Envia uma FOTO (PNG/JPEG) com legenda opcional. Usado pelo digest diário —
// a imagem é gerada com next/og e mandada como multipart/form-data. `opts`
// permite HTML (blockquote expansível, links) e botões inline de URL.
export async function sendTelegramPhoto(
  token: string,
  chatId: string,
  photo: ArrayBuffer | Uint8Array,
  caption?: string,
  opts?: { parseMode?: "HTML" | "Markdown"; buttons?: TelegramUrlButton[][] },
): Promise<TelegramSendResult> {
  if (!token) return { ok: false, error: "token do bot não configurado" };
  if (!chatId) return { ok: false, error: "chat_id não configurado" };

  try {
    const bytes = photo instanceof Uint8Array ? photo : new Uint8Array(photo);
    const form = new FormData();
    form.append("chat_id", chatId);
    if (caption) {
      form.append("caption", caption);
      form.append("parse_mode", opts?.parseMode ?? "Markdown");
    }
    if (opts?.buttons?.length) {
      form.append("reply_markup", JSON.stringify({ inline_keyboard: opts.buttons }));
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

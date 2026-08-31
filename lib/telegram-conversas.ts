// Memória do fio de conversa do bot — aba `telegram_conversas` (SERVER-ONLY).
// Append-only, uma linha por mensagem. Persiste de verdade: sobrevive a deploy
// e a cold start da Vercel, então "detalha melhor isso" funciona como
// follow-up mesmo horas depois. Escolha do dono (30/08/2026) em vez de manter
// o histórico só em RAM.

import { getDataStore } from "./data-store";
import { ensureTab, appendRowsTyped } from "./gsheets";

const TAB = "telegram_conversas";
const HEADERS = ["chat_id", "timestamp", "papel", "texto"];
/** Quantas mensagens do fio entram no prompt (3 idas e voltas). */
export const JANELA_PADRAO = 6;
/** Teto por mensagem gravada — evita estourar a célula do Sheets. */
const MAX_TEXTO = 1500;

export type Papel = "user" | "assistant";
export interface MensagemFio { papel: Papel; texto: string; timestamp: string }

/** Últimas mensagens do chat, em ordem cronológica. Uma marca de `/limpar`
 *  corta o fio: só conta o que veio DEPOIS dela. */
export async function lerConversa(chatId: string, limite = JANELA_PADRAO): Promise<MensagemFio[]> {
  try {
    const rows = await getDataStore().fetchTab(TAB);
    const doChat = rows.filter((r) => String(r["chat_id"] ?? "") === String(chatId));
    const corte = doChat.map((r) => String(r["papel"] ?? "")).lastIndexOf("__limpar__");
    const vivos = corte >= 0 ? doChat.slice(corte + 1) : doChat;
    return vivos
      .filter((r) => !String(r["papel"] ?? "").startsWith("__")) // técnicos (ex.: __erro__) fora do prompt
      .slice(-limite)
      .map((r) => ({
        papel: (String(r["papel"] ?? "user") === "assistant" ? "assistant" : "user") as Papel,
        texto: String(r["texto"] ?? ""),
        timestamp: String(r["timestamp"] ?? ""),
      }))
      .filter((m) => m.texto.length > 0);
  } catch {
    return []; // aba ainda não existe → conversa começa do zero
  }
}

/** Grava uma mensagem. Best-effort: falha aqui NUNCA impede a resposta ao dono. */
export async function gravarMensagem(chatId: string, papel: Papel | "__limpar__" | "__erro__", texto: string): Promise<void> {
  await ensureTab(TAB, HEADERS);
  await appendRowsTyped(TAB, [[
    String(chatId),
    new Date().toISOString(),
    papel,
    texto.slice(0, MAX_TEXTO),
  ]]);
}

/** Erro operacional do bot (LLM quebrado, envio recusado pelo Telegram).
 *  Fica na aba (o diag lê o papel da última linha) e NUNCA entra no prompt. */
export async function gravarErro(chatId: string, erro: string): Promise<void> {
  await gravarMensagem(chatId, "__erro__", erro);
}

/** Marca o fim do fio — o histórico antigo continua na aba (auditável), mas
 *  deixa de entrar no prompt. */
export async function limparConversa(chatId: string): Promise<void> {
  await gravarMensagem(chatId, "__limpar__", "(fio reiniciado)");
}

/** Formata o fio para o prompt (PURO — testado). */
export function formatarFio(msgs: MensagemFio[]): string {
  if (msgs.length === 0) return "";
  const linhas = ["## Conversa recente (para dar continuidade)"];
  for (const m of msgs) {
    linhas.push(`${m.papel === "user" ? "Dono" : "Você"}: ${m.texto}`);
  }
  return linhas.join("\n");
}

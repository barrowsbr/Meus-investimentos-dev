import { NextResponse } from "next/server";
import { readAlertasConfig, resolveBotToken } from "@/lib/alertas-store";
import { sendTelegramMessage, sendTelegramChatAction } from "@/lib/telegram";
import { llmComplete } from "@/lib/llm";
import { buildAgentContext } from "@/lib/agent-context";
import { detectarTickers, montarContextoMercado, type AtivoCarteira } from "@/lib/telegram-contexto";
import { lerConversa, gravarMensagem, limparConversa, formatarFio } from "@/lib/telegram-conversas";
import { getDataStore } from "@/lib/data-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Bot do Telegram com IA — o dono pergunta, o bot responde com os dados REAIS
// da carteira (mesmo contexto e mesmo prompt do Agente IA da página).
//
// ⚠️ ESTE ENDPOINT É PÚBLICO. Qualquer um que descubra a URL pode chamá-lo, e
// qualquer um que ache o bot pode escrever para ele. Três travas, nesta ordem:
//   1. SEGREDO — o Telegram devolve, em todo update, o secret_token que
//      registramos no setWebhook. Sem ele (ou errado) → 401, nada é lido.
//   2. ALLOWLIST — só o chat_id salvo em Configurações recebe dados. Outro
//      chat leva uma recusa educada e NADA da carteira.
//   3. SÓ TEXTO, com teto de tamanho.
// E o bot é SOMENTE LEITURA: não grava na planilha (fora o próprio fio da
// conversa) nem executa ordem nenhuma. Endpoint público com poder de escrita
// seria risco desnecessário.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_PERGUNTA = 1000;
/** O Telegram REENVIA o update se não receber 200 rápido. Sem dedup, o dono
 *  receberia a resposta duplicada. Memória do processo basta: o reenvio vem
 *  em segundos. */
const vistos = new Set<number>();

const PROMPT = `Você é o assistente financeiro pessoal do dono deste dashboard, respondendo pelo Telegram.

## Contexto
Você recebe os dados REAIS da carteira dele. Quando a pergunta cita um ativo, recebe também a cotação ao vivo e as manchetes recentes daquele papel.

## Como responder no Telegram
- Seja DIRETO: 2 a 6 frases na maioria das perguntas. É chat, não relatório.
- Markdown simples do Telegram: *negrito*, _itálico_. NADA de tabela, título (#) ou lista longa.
- Números com R$/US$ e %, do jeito brasileiro.
- Cite os dados reais (ticker, valor, %) — nunca responda no genérico.
- Português do Brasil.

## Regras duras
- NUNCA invente número que não esteja no contexto. Se não tem o dado, diga que não tem.
- Ao explicar um movimento de preço, use as MANCHETES fornecidas. Se não houver manchete, diga que não achou notícia que justifique e ofereça a leitura pelos números — não especule causa.
- Nada de ordem de compra/venda como certeza: "vale considerar", "uma opção seria".
- Não repita o contexto inteiro; responda o que foi perguntado.`;

interface TelegramUpdate {
  update_id?: number;
  message?: { chat?: { id?: number | string }; text?: string; from?: { is_bot?: boolean } };
}

export async function POST(request: Request) {
  const cfg = await readAlertasConfig().catch(() => null);
  if (!cfg) return NextResponse.json({ ok: true }); // sem config, ignora em silêncio

  // ── Trava 1: segredo do webhook ──
  const segredo = (cfg.webhookSecret ?? "").trim();
  const recebido = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!segredo || recebido !== segredo) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const msg = update?.message;
  const chatId = msg?.chat?.id != null ? String(msg.chat.id) : "";
  const texto = (msg?.text ?? "").trim();

  // Sempre 200 daqui pra frente: erro nosso não pode fazer o Telegram
  // reenviar o mesmo update para sempre.
  if (!chatId || !texto || msg?.from?.is_bot) return NextResponse.json({ ok: true });

  // ── Dedup de reenvio ──
  if (update?.update_id != null) {
    if (vistos.has(update.update_id)) return NextResponse.json({ ok: true, dedup: true });
    vistos.add(update.update_id);
    if (vistos.size > 500) vistos.clear();
  }

  const token = resolveBotToken(cfg);
  if (!token) return NextResponse.json({ ok: true });

  // ── Trava 2: allowlist do dono ──
  if (!cfg.chatId || chatId !== String(cfg.chatId).trim()) {
    await sendTelegramMessage(token, chatId, "Este assistente é privado e responde apenas ao dono da conta.");
    return NextResponse.json({ ok: true, recusado: true });
  }

  // ── Trava 3: só texto, com teto ──
  if (texto.length > MAX_PERGUNTA) {
    await sendTelegramMessage(token, chatId, `Pergunta muito longa (máx. ${MAX_PERGUNTA} caracteres).`);
    return NextResponse.json({ ok: true });
  }

  try {
    // ── Comandos ──
    if (/^\/(start|ajuda|help)\b/i.test(texto)) {
      await sendTelegramMessage(token, chatId, AJUDA);
      return NextResponse.json({ ok: true });
    }
    if (/^\/limpar\b/i.test(texto)) {
      await limparConversa(chatId).catch(() => {});
      await sendTelegramMessage(token, chatId, "Fio reiniciado. Pode perguntar do zero.");
      return NextResponse.json({ ok: true });
    }

    await sendTelegramChatAction(token, chatId);

    const pergunta = normalizarComando(texto);

    // ── Contexto: carteira (mesmo do Agente IA) + fio + mercado do ativo ──
    const [contexto, fio, tickersMeta] = await Promise.all([
      buildAgentContext(),
      lerConversa(chatId).catch(() => []),
      lerTickersDaCarteira().catch(() => new Map<string, AtivoCarteira>()),
    ]);
    const citados = detectarTickers(pergunta, [...tickersMeta.keys()]);
    const mercado = await montarContextoMercado(citados, tickersMeta).catch(() => "");

    const mensagem = [
      formatarFio(fio),
      mercado,
      "## Dados da carteira",
      contexto,
      "",
      `## Pergunta do dono`,
      pergunta,
    ].filter(Boolean).join("\n\n");

    const { text, model } = await llmComplete(PROMPT, mensagem);
    const resposta = (text ?? "").trim() || "Não consegui formular uma resposta agora. Tente de novo.";
    // Assina com o modelo que respondeu: a cascata pode cair para outro
    // provedor sem avisar, e saber QUEM respondeu explica variação de
    // qualidade sem precisar abrir log.
    const assinada = `${resposta}\n\n_— ${model}_`;

    await sendTelegramMessage(token, chatId, assinada);

    // Memória (best-effort — nunca impede a resposta, que já saiu)
    gravarMensagem(chatId, "user", pergunta).catch(() => {});
    gravarMensagem(chatId, "assistant", resposta).catch(() => {});

    return NextResponse.json({ ok: true, tickers: citados, model });
  } catch (e) {
    const erro = e instanceof Error ? e.message : "erro desconhecido";
    await sendTelegramMessage(token, chatId, `Não consegui responder agora: ${erro}`).catch(() => {});
    return NextResponse.json({ ok: true, erro });
  }
}

const AJUDA = `Sou seu assistente da carteira. Pergunte em português normal, por exemplo:

• _por que a NVDA caiu hoje?_
• _como está meu resultado no mês?_
• _quanto recebi de dividendos este ano?_
• _minha concentração em tech está alta?_

Comandos: /resumo · /posicao TICKER · /limpar (recomeça o fio)`;

/** `/resumo` e `/posicao XXX` viram perguntas em português — o LLM já sabe
 *  responder, não precisa de caminho especial. */
function normalizarComando(texto: string): string {
  const pos = texto.match(/^\/posicao\s+(.+)$/i);
  if (pos) return `Como está minha posição em ${pos[1].trim()}? Quantidade, preço médio, resultado e peso na carteira.`;
  if (/^\/resumo\b/i.test(texto)) {
    return "Me dê o resumo de hoje: patrimônio, resultado do dia, principais altas e baixas da carteira.";
  }
  return texto;
}

/** Tickers da carteira + moeda/corretora (para resolver a grafia Yahoo). */
async function lerTickersDaCarteira(): Promise<Map<string, AtivoCarteira>> {
  const rows = await getDataStore().fetchTab("meus_ativos");
  const map = new Map<string, AtivoCarteira>();
  for (const r of rows) {
    const ticker = String(r["símbolo"] ?? r["simbolo"] ?? r["ticker"] ?? "").toUpperCase().trim();
    if (!ticker || map.has(ticker)) continue;
    map.set(ticker, {
      ticker,
      moeda: String(r["moeda"] ?? "BRL").toUpperCase().trim(),
      corretora: String(r["corretora"] ?? "").trim(),
    });
  }
  return map;
}

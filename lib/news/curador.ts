// Curador LLM — o "editor-chefe" do feed. Classifica manchetes em lote:
// relevância 0-10 para o perfil do dono + flag de briga política (picuinha).
// Usa a cascata lib/llm (Gemini→GPT→…, já configurada). Cache em memória por
// link (lambda quente): cada manchete é julgada UMA vez. Best-effort com
// timeout — se o LLM falhar, o feed segue só com o score de keywords.

import type { NewsItem } from "./types";
import type { Tema } from "./temas";
import { TEMA_LABEL } from "./temas";

export interface Veredito { rel: number; briga: boolean }

const cache = new Map<string, { v: Veredito; ts: number }>();
const TTL_MS = 6 * 3600 * 1000;
const MAX_LOTE = 40;
const TIMEOUT_MS = 9000;

function perfilTexto(interesses: Tema[]): string {
  return interesses.map((t) => TEMA_LABEL[t]).join(", ");
}

export async function curarLote(items: NewsItem[], interesses: Tema[]): Promise<Map<string, Veredito>> {
  const out = new Map<string, Veredito>();
  const agora = Date.now();

  const pendentes: NewsItem[] = [];
  for (const it of items) {
    const hit = cache.get(it.link);
    if (hit && agora - hit.ts < TTL_MS) out.set(it.link, hit.v);
    else if (pendentes.length < MAX_LOTE) pendentes.push(it);
  }
  if (pendentes.length === 0) return out;

  const linhas = pendentes.map((it, i) => `${i}|${it.titulo}`).join("\n");
  const system =
    "Você é o editor-chefe de um feed de notícias pessoal. O leitor se interessa por: " +
    perfilTexto(interesses) +
    ". Ele NÃO quer política de bastidor/picuinha (fulano rebate sicrano, farpas, bate-boca, articulação partidária do dia a dia) — " +
    "mas geopolítica REAL (guerras, sanções, decisões que movem o mundo/mercados) interessa muito. " +
    "Dê REL 0-2 para conteúdo de consumo/entretenimento: listicles ('5 melhores notebooks'), guias de compra, reviews de produto, " +
    "ofertas/cupons, tutoriais, fofoca de celebridade, horóscopo e clickbait — isso NÃO é notícia para este feed.";
  const prompt =
    `Para cada manchete abaixo, responda UMA linha no formato "NÚMERO|REL|BRIGA" onde REL é a relevância 0-10 ` +
    `para o perfil do leitor e BRIGA é 1 se for picuinha/briga política de bastidor, senão 0.\n` +
    `Responda SOMENTE as linhas, sem explicações.\n\n${linhas}`;

  try {
    const { llmComplete } = await import("@/lib/llm");
    const result = await Promise.race([
      llmComplete(system, prompt),
      new Promise<null>((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS)),
    ]);
    if (result) {
      const { text } = result as { text: string };
      for (const line of text.split("\n")) {
        const m = line.trim().match(/^(\d+)\s*\|\s*(\d+(?:\.\d+)?)\s*\|\s*([01])/);
        if (!m) continue;
        const idx = parseInt(m[1], 10);
        if (idx < 0 || idx >= pendentes.length) continue;
        const v: Veredito = { rel: Math.min(10, Math.max(0, parseFloat(m[2]))), briga: m[3] === "1" };
        const link = pendentes[idx].link;
        cache.set(link, { v, ts: agora });
        out.set(link, v);
      }
    }
  } catch { /* LLM indisponível — segue sem curadoria */ }

  return out;
}

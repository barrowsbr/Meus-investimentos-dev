// Contexto EXTRA para o bot do Telegram: quando a pergunta cita um ativo da
// carteira, anexamos o que o LLM precisa para responder "por que caiu?" —
// variação do dia e as manchetes recentes daquele papel.
//
// Caminho DELIBERADAMENTE leve: o motor de notícias completo (lib/news +
// app/api/noticias) faz tradução, imagem, score de impacto e curadoria por LLM
// — tudo irrelevante para 5 manchetes em texto num chat. Aqui é 1 fetch RSS e
// pronto. Não confundir com o feed do app.

import { yahooTicker, fetchQuotes } from "./cotacoes";

// ── Detecção de ticker na pergunta (PURO — testado) ─────────────────────────

/** Tickers da carteira citados na pergunta. Casa a grafia da planilha
 *  (`CMIG4.SA`, `DPM.TO`) e também a base sem sufixo, que é como a pessoa
 *  escreve no chat ("por que a CMIG4 caiu?"). Evita falso positivo em palavra
 *  comum exigindo limite de palavra e no mínimo 3 caracteres. */
export function detectarTickers(pergunta: string, tickersCarteira: string[]): string[] {
  const texto = pergunta.toUpperCase();
  const achados: string[] = [];
  for (const t of tickersCarteira) {
    const tk = t.toUpperCase().trim();
    if (tk.length < 3) continue;
    const base = tk.replace(/\.[A-Z]{1,3}$/, "");
    const alvo = base.length >= 3 ? base : tk;
    // \b não funciona com "." — por isso comparamos a BASE, que é alfanumérica.
    if (new RegExp(`(^|[^A-Z0-9])${alvo}([^A-Z0-9]|$)`).test(texto) && !achados.includes(tk)) {
      achados.push(tk);
    }
  }
  return achados.slice(0, 3); // 3 ativos por pergunta é mais que suficiente
}

// ── Manchetes recentes (Google News RSS) ────────────────────────────────────

export interface Manchete { titulo: string; data: string; fonte: string }

/** Top manchetes do ativo. Silencioso em qualquer falha — contexto é bônus,
 *  nunca pode derrubar a resposta do bot. */
export async function buscarManchetes(termo: string, max = 5): Promise<Manchete[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(termo)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MeusInvestimentos/1.0)" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseManchetes(xml, max);
  } catch {
    return [];
  }
}

/** Parser do RSS (PURO — testado). */
export function parseManchetes(xml: string, max = 5): Manchete[] {
  const out: Manchete[] = [];
  const itens = xml.split(/<item>/).slice(1);
  for (const bloco of itens) {
    const tit = bloco.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim();
    if (!tit) continue;
    const data = bloco.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "";
    const fonte = bloco.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.trim() ?? "";
    out.push({
      titulo: tit.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
      data, fonte,
    });
    if (out.length >= max) break;
  }
  return out;
}

// ── Montagem do bloco de contexto ───────────────────────────────────────────

export interface AtivoCarteira { ticker: string; moeda: string; corretora: string }

/** Bloco markdown com preço/variação do dia + manchetes dos ativos citados.
 *  Devolve "" quando não há ativo citado (o prompt fica sem ruído). */
export async function montarContextoMercado(
  citados: string[],
  meta: Map<string, AtivoCarteira>,
): Promise<string> {
  if (citados.length === 0) return "";

  const yts = citados.map((t) => {
    const m = meta.get(t);
    return yahooTicker(t, m?.moeda ?? "BRL", m?.corretora ?? "");
  });

  const [cotacoes, ...manchetesPorAtivo] = await Promise.all([
    fetchQuotes(yts).catch(() => ({ quotes: {} as Record<string, { price: number; changePercent: number; currency: string; name: string }> })),
    ...citados.map((t) => buscarManchetes(t.replace(/\.[A-Z]{1,3}$/, ""))),
  ]);

  const linhas: string[] = ["## Contexto de mercado dos ativos citados (ao vivo)"];
  citados.forEach((t, i) => {
    const q = cotacoes.quotes[yts[i]];
    linhas.push("");
    linhas.push(`### ${t}${q?.name ? ` — ${q.name}` : ""}`);
    if (q) {
      const sinal = q.changePercent >= 0 ? "+" : "";
      linhas.push(`Preço agora: ${q.currency} ${q.price} · variação do dia: ${sinal}${q.changePercent.toFixed(2)}%`);
    } else {
      linhas.push("Cotação ao vivo indisponível no momento.");
    }
    const ms = manchetesPorAtivo[i] ?? [];
    if (ms.length > 0) {
      linhas.push("Manchetes recentes:");
      for (const m of ms) linhas.push(`- ${m.titulo}${m.fonte ? ` (${m.fonte})` : ""}`);
    } else {
      linhas.push("Sem manchetes recentes encontradas — NÃO invente um motivo para o movimento.");
    }
  });
  return linhas.join("\n");
}

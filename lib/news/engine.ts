// ─────────────────────────────────────────────────────────────────────────────
// Motor único de notícias — a "Fase 2" que estava pendente, agora ligada.
//
// fetchNoticiasGerais(filtro) agrega os providers (RSS direto por tema — fonte
// primária, COM imagem; Marketaux/Finnhub/GNews — gated por chave, com imagem),
// deduplica, classifica tema, aplica o filtro anti-briga, traduz manchetes EN,
// passa o topo pelo curador LLM e ranqueia por interesse+impacto+recência+foto.
// ─────────────────────────────────────────────────────────────────────────────

import type { NewsItem, NewsFilter } from "./types";
import type { Tema } from "./temas";
import { classificarTema, ehBrigaPolitica, DEFAULT_INTERESSES } from "./temas";
import { rankNoticias } from "./score";
import { fetchMarketaux } from "./providers/marketaux";
import { fetchRssDiretos } from "./providers/rss";
import { fetchFinnhub } from "./providers/finnhub";
import { fetchGnews } from "./providers/gnews";

// Dedup por título (prefixo) e link. Preserva a ordem de entrada.
export function dedupeNews(items: NewsItem[], limit?: number): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of items) {
    const k1 = it.titulo.toLowerCase().slice(0, 50);
    const k2 = it.link.slice(0, 80);
    if (seen.has(k1) || seen.has(k2)) continue;
    seen.add(k1);
    seen.add(k2);
    out.push(it);
  }
  return typeof limit === "number" ? out.slice(0, limit) : out;
}

export interface FiltroGerais {
  interesses?: Tema[];   // temas do perfil (default: DEFAULT_INTERESSES)
  semBriga?: boolean;    // filtra picuinha política (default: true)
  curar?: boolean;       // curadoria LLM no topo (default: true)
  limit?: number;        // default 80
}

// Enriquecimento de imagem: nem todo feed direto embute a foto no RSS (G1,
// BBC, Al Jazeera…). Para o TOPO do feed, busca o og:image na página do
// artigo — link canônico (sem redirect do Google), raspagem direta. Deadline
// global: imagem que não chegou a tempo fica pro próximo ciclo de cache.
async function enriquecerImagens(items: NewsItem[], topN = 24, deadlineMs = 6000): Promise<void> {
  const alvo = items
    .slice(0, topN)
    .filter((it) => !it.imagem && /^https?:\/\//.test(it.link) && !/news\.google/.test(it.link));
  if (alvo.length === 0) return;
  const { fetchArticleImage } = await import("@/lib/news-images");
  await Promise.race([
    Promise.allSettled(alvo.map(async (it) => {
      const img = await fetchArticleImage(it.link);
      if (img) it.imagem = img;
    })),
    new Promise((resolve) => setTimeout(resolve, deadlineMs)),
  ]);
}

async function traduzirEN(items: NewsItem[]): Promise<void> {
  const en = items.filter((i) => i.idioma === "en");
  if (en.length === 0) return;
  try {
    const { translateBatch } = await import("@/lib/translate");
    const traduzidos = await translateBatch(en.map((e) => e.titulo), "pt");
    for (let i = 0; i < en.length; i++) {
      const pt = traduzidos[i];
      if (pt && pt.length > 3 && pt !== en[i].titulo) en[i].titulo = pt;
    }
  } catch { /* mantém EN — melhor que atrasar o feed */ }
}

export async function fetchNoticiasGerais(filtro: FiltroGerais = {}): Promise<NewsItem[]> {
  const interesses = (filtro.interesses?.length ? filtro.interesses : DEFAULT_INTERESSES) as Tema[];
  const semBriga = filtro.semBriga !== false;
  const limit = filtro.limit ?? 80;

  // Mercados sempre entra como base (é um app de investimentos).
  const temasBusca = [...new Set<Tema>([...interesses, "mercados"])];

  const settled = await Promise.allSettled([
    fetchRssDiretos(temasBusca),
    fetchMarketaux({ limit: 3, countries: ["br", "us"] }),
    fetchFinnhub(),
    fetchGnews(interesses),
  ]);
  let all: NewsItem[] = [];
  for (const r of settled) if (r.status === "fulfilled") all.push(...r.value);

  // Classificação de tema (para itens de providers que não classificaram).
  for (const it of all) if (!it.tema) it.tema = classificarTema(it.titulo, "outros");

  // Anti-briga por keywords (barato; o curador LLM refina depois).
  if (semBriga) all = all.filter((it) => !ehBrigaPolitica(it.titulo));

  all = dedupeNews(all);

  // Ranking preliminar (sem curadoria) — decide o que merece tradução/curador.
  const interesseSet = new Set<Tema>(interesses);
  all = rankNoticias(all, { interesses: interesseSet });
  const topo = all.slice(0, Math.min(limit, all.length));

  await traduzirEN(topo);
  await enriquecerImagens(topo); // og:image para o topo sem foto embutida

  // Curadoria LLM do topo (cache por link; best-effort).
  if (filtro.curar !== false) {
    try {
      const { curarLote } = await import("./curador");
      const vereditos = await curarLote(topo.slice(0, 40), interesses);
      const filtrados = semBriga ? topo.filter((it) => !vereditos.get(it.link)?.briga) : topo;
      return rankNoticias(filtrados, {
        interesses: interesseSet,
        curadoria: new Map([...vereditos].map(([k, v]) => [k, { rel: v.rel }])),
      }).slice(0, limit);
    } catch { /* sem curador — segue o ranking por keywords */ }
  }

  return topo;
}

// Compat: agregador simples usado por quem quer só os providers com filtro cru.
export async function fetchNews(filter: NewsFilter = {}): Promise<NewsItem[]> {
  const providers = [fetchMarketaux(filter)];
  const settled = await Promise.allSettled(providers);
  const all: NewsItem[] = [];
  for (const r of settled) if (r.status === "fulfilled") all.push(...r.value);
  return dedupeNews(all, filter.limit);
}

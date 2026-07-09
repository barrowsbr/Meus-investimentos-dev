// ─────────────────────────────────────────────────────────────────────────────
// Motor único de notícias (Fase 1). Agrega providers plugáveis num só lugar,
// deduplica e ranqueia. Hoje o único provider ligado é o Marketaux; nas próximas
// fases entram o RSS (feeds diretos + Google News) e o GDELT (regional), e as
// rotas de notícias viram casca fina que chama fetchNews(filter).
// ─────────────────────────────────────────────────────────────────────────────

import type { NewsItem, NewsFilter } from "./types";
import { fetchMarketaux } from "./providers/marketaux";

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

export async function fetchNews(filter: NewsFilter = {}): Promise<NewsItem[]> {
  const providers = [
    fetchMarketaux(filter),
    // Fase 2: fetchRss(filter), fetchGdelt(filter)
  ];
  const settled = await Promise.allSettled(providers);
  const all: NewsItem[] = [];
  for (const r of settled) if (r.status === "fulfilled") all.push(...r.value);
  return dedupeNews(all, filter.limit);
}

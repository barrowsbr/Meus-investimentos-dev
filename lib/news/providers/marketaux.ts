// ─────────────────────────────────────────────────────────────────────────────
// Provider Marketaux — notícias financeiras com ENTIDADES (tickers), SENTIMENTO
// e filtro por PAÍS (regional). Complementa o RSS (que dá volume) com qualidade
// e cobertura regional. Gated no MARKETAUX_API_KEY: sem a chave, no-op (retorna
// []), então nada quebra até a chave existir na Vercel.
//
// Limites do plano FREE (respeitar): ~100 req/dia e 3 artigos por resposta. Por
// isso: limit ≤ 3 e cache agressivo (revalidate 30 min) em quem chamar.
// ─────────────────────────────────────────────────────────────────────────────

import type { NewsItem, NewsFilter } from "../types";

const BASE = "https://api.marketaux.com/v1/news/all";

export function marketauxEnabled(): boolean {
  return !!process.env.MARKETAUX_API_KEY;
}

// Forma da resposta do Marketaux (só os campos que usamos).
interface MxEntity { symbol?: string; sentiment_score?: number; country?: string }
interface MxArticle {
  title?: string; url?: string; published_at?: string; source?: string;
  image_url?: string; language?: string; entities?: MxEntity[];
}

// PURA e testável: resposta do Marketaux → NewsItem[].
export function parseMarketaux(json: unknown): NewsItem[] {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: NewsItem[] = [];
  for (const raw of data as MxArticle[]) {
    if (!raw?.title || !raw?.url) continue;
    const ents = Array.isArray(raw.entities) ? raw.entities : [];
    const symbols = ents.map(e => e.symbol).filter((s): s is string => !!s);
    const sents = ents.map(e => e.sentiment_score).filter((n): n is number => typeof n === "number");
    const sentimento = sents.length ? sents.reduce((s, n) => s + n, 0) / sents.length : undefined;
    const pais = ents.find(e => e.country)?.country;
    out.push({
      titulo: raw.title.trim(),
      link: raw.url,
      data: raw.published_at ?? "",
      fonte: raw.source ?? "Marketaux",
      imagem: raw.image_url || null,
      categoria: "Global",
      impacto: "medio",
      pais: pais || undefined,
      entidades: symbols.length ? symbols : undefined,
      sentimento,
      idioma: raw.language || undefined,
    });
  }
  return out;
}

export async function fetchMarketaux(filter: NewsFilter = {}): Promise<NewsItem[]> {
  const token = process.env.MARKETAUX_API_KEY;
  if (!token) return []; // no-op sem chave

  const params = new URLSearchParams({
    api_token: token,
    language: filter.language ?? "pt,en",
    limit: String(Math.min(filter.limit ?? 3, 3)), // free = 3 artigos/resposta
    filter_entities: "true",
  });
  if (filter.symbols?.length) params.set("symbols", filter.symbols.join(","));
  if (filter.countries?.length) params.set("countries", filter.countries.join(","));

  try {
    const res = await fetch(`${BASE}?${params.toString()}`, {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 1800 }, // 30 min — respeita os 100 req/dia
    });
    if (!res.ok) return [];
    return parseMarketaux(await res.json());
  } catch {
    return [];
  }
}

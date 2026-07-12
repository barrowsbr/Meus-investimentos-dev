// Provider Finnhub (finnhub.io) — market news COM imagem nativa. Free tier:
// 60 req/min. Gated em FINNHUB_API_KEY: sem chave → no-op (o motor segue com
// RSS). category=general cobre macro/mercados/market-moving.

import type { NewsItem } from "../types";
import { classificarTema } from "../temas";
import { scoreImpacto } from "../score";

interface FhArticle {
  category?: string;
  datetime?: number; // unix seconds
  headline?: string;
  image?: string;
  source?: string;
  url?: string;
}

export async function fetchFinnhub(limit = 20): Promise<NewsItem[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${key}`, {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as FhArticle[];
    if (!Array.isArray(data)) return [];
    return data.slice(0, limit).flatMap((a): NewsItem[] => {
      if (!a.headline || !a.url) return [];
      return [{
        titulo: a.headline,
        link: a.url,
        data: a.datetime ? new Date(a.datetime * 1000).toISOString() : "",
        fonte: a.source || "Finnhub",
        imagem: a.image && /^https?:\/\//.test(a.image) ? a.image : null,
        categoria: "mercados",
        tema: classificarTema(a.headline, "mercados"),
        impacto: scoreImpacto(a.headline),
        idioma: "en",
      }];
    });
  } catch {
    return [];
  }
}

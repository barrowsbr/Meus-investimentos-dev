// Provider GNews (gnews.io) — top-headlines por categoria COM imagem nativa.
// Free tier: 100 req/dia, 10 artigos/req → no máx. 2 categorias por chamada
// (mapeadas dos interesses) + cache 30 min. Gated em GNEWS_API_KEY.

import type { NewsItem } from "../types";
import type { Tema } from "../temas";
import { classificarTema } from "../temas";
import { scoreImpacto } from "../score";

const TEMA_TO_CAT: Partial<Record<Tema, string>> = {
  geopolitica: "world",
  tech: "technology",
  ciencia: "science",
  mercados: "business",
  macro: "business",
};

interface GnArticle {
  title?: string;
  url?: string;
  image?: string;
  publishedAt?: string;
  source?: { name?: string };
}

async function fetchCategoria(cat: string, key: string): Promise<NewsItem[]> {
  const url = `https://gnews.io/api/v4/top-headlines?category=${cat}&lang=pt&country=br&max=10&apikey=${key}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 1800 } });
  if (!res.ok) return [];
  const data = (await res.json()) as { articles?: GnArticle[] };
  return (data.articles ?? []).flatMap((a): NewsItem[] => {
    if (!a.title || !a.url) return [];
    return [{
      titulo: a.title,
      link: a.url,
      data: a.publishedAt ?? "",
      fonte: a.source?.name || "GNews",
      imagem: a.image && /^https?:\/\//.test(a.image) ? a.image : null,
      categoria: cat,
      tema: classificarTema(a.title, cat === "world" ? "geopolitica" : cat === "technology" ? "tech" : cat === "science" ? "ciencia" : "mercados"),
      impacto: scoreImpacto(a.title),
      idioma: "pt",
    }];
  });
}

export async function fetchGnews(temas: Tema[]): Promise<NewsItem[]> {
  const key = process.env.GNEWS_API_KEY;
  if (!key) return [];
  // No máx. 2 categorias distintas por rodada (quota do free tier).
  const cats = [...new Set(temas.map((t) => TEMA_TO_CAT[t]).filter(Boolean))].slice(0, 2) as string[];
  if (cats.length === 0) return [];
  try {
    const results = await Promise.allSettled(cats.map((c) => fetchCategoria(c, key)));
    const all: NewsItem[] = [];
    for (const r of results) if (r.status === "fulfilled") all.push(...r.value);
    return all;
  } catch {
    return [];
  }
}

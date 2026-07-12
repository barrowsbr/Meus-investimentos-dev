// Provider RSS direto — a fonte primária do motor: feeds de veículos POR TEMA,
// com IMAGEM real embutida (pickFeedImage: media:content → enclosure → <img>).

import type { NewsItem } from "../types";
import type { Tema } from "../temas";
import { classificarTema } from "../temas";
import { scoreImpacto } from "../score";
import { feedsPorTemas, type FonteFeed } from "../fontes";
import { fetchFeed, extractTag, decodeHtml, pickFeedImage } from "@/lib/news-images";

function parseFeed(xml: string, f: FonteFeed): NewsItem[] {
  const out: NewsItem[] = [];
  const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  for (const m of blocks.slice(0, f.max ?? 6)) {
    const block = m[1];
    const titulo = decodeHtml(extractTag(block, "title"));
    let link = extractTag(block, "link");
    if (!link) {
      const hm = block.match(/<link\s+href="([^"]+)"/i);
      if (hm) link = hm[1];
    }
    if (!titulo || !link) continue;
    out.push({
      titulo,
      link,
      data: extractTag(block, "pubDate"),
      // Feed direto: a fonte É o veículo (dc:creator seria o autor da matéria).
      fonte: f.fonte,
      imagem: pickFeedImage(block, link),
      categoria: f.tema,
      tema: classificarTema(titulo, f.tema),
      impacto: scoreImpacto(titulo),
      idioma: f.lang,
    });
  }
  return out;
}

export async function fetchRssDiretos(temas: Tema[]): Promise<NewsItem[]> {
  const feeds = feedsPorTemas(temas);
  const results = await Promise.allSettled(
    feeds.map(async (f) => parseFeed(await fetchFeed(f.url), f)),
  );
  const all: NewsItem[] = [];
  for (const r of results) if (r.status === "fulfilled") all.push(...r.value);
  return all;
}

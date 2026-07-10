import { NextResponse } from "next/server";
import {
  fetchFeed, extractTag, decodeHtml, stripCdata, extractSource,
  decodeGoogleNewsUrl, resolveAndImage, googleNewsSearchUrl, isGoogleHost,
} from "@/lib/news-images";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Busca RACIONAL de notícias: query livre (ticker, tema, país) → Google News RSS,
// com enriquecimento de imagem (og:image) time-boxed. Alimenta a sub-aba "Busca"
// da página de notícias. Reusa os helpers canônicos de lib/news-images.

interface Item { titulo: string; link: string; data: string; fonte: string; imagem: string | null; _gn: string }

function parseGoogleNews(xml: string): Item[] {
  const items: Item[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const titulo = decodeHtml(stripCdata(extractTag(block, "title")));
    const gn = decodeHtml(stripCdata(extractTag(block, "link")));
    if (!titulo || !gn) continue;
    items.push({
      titulo,
      link: gn,
      data: extractTag(block, "pubDate"),
      fonte: extractSource(block, "Google News"),
      imagem: null,
      _gn: gn,
    });
  }
  return items;
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ articles: [], count: 0 });

  try {
    const lang = /[a-z]/i.test(q) && /\b(stock|shares|fed|inflation|rate|earnings)\b/i.test(q) ? "en" : "pt";
    const xml = await fetchFeed(googleNewsSearchUrl(q, lang));
    let items = parseGoogleNews(xml);

    // Dedup por prefixo de título + ordena por data desc.
    const seen = new Set<string>();
    items = items.filter(i => {
      const k = i.titulo.toLowerCase().slice(0, 50);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    items.sort((a, b) => (new Date(b.data).getTime() || 0) - (new Date(a.data).getTime() || 0));
    items = items.slice(0, 24);

    // Enriquecimento de imagem (top 12) com DEADLINE de 8s — resolve o redirect
    // do Google News e extrai og:image. Nunca deixa estourar o tempo.
    const enrich = Promise.allSettled(items.slice(0, 12).map(async it => {
      const decoded = decodeGoogleNewsUrl(it._gn);
      const target = decoded ?? it._gn;
      const r = await resolveAndImage(target);
      if (r) {
        if (r.realUrl && !isGoogleHost(r.realUrl)) it.link = r.realUrl;
        if (r.img) it.imagem = r.img;
      } else if (decoded) {
        it.link = decoded;
      }
    }));
    await Promise.race([enrich, new Promise(res => setTimeout(res, 8000))]);

    const articles = items.map(({ _gn, ...rest }) => { void _gn; return rest; });
    return NextResponse.json({ articles, count: articles.length }, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=900" },
    });
  } catch (e) {
    return NextResponse.json({ articles: [], count: 0, error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

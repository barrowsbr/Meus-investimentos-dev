import { NextResponse } from "next/server";
import { translateBatch } from "@/lib/translate";
import {
  type Lang,
  decodeHtml,
  extractTag,
  extractSource,
  decodeGoogleNewsUrl,
  fetchArticleImage,
  resolveAndImage,
  fetchFeed,
  googleNewsSearchUrl,
} from "@/lib/news-images";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Notícias relacionadas a UM ativo específico, COM imagem (og:image), no mesmo
// padrão visual da Home. Busca no Google News pelo nome da empresa + ticker,
// decodifica a URL real e extrai a foto da página do veículo (nunca logo Google).

interface AssetNewsItem {
  titulo: string;
  link: string;
  data: string;
  fonte: string;
  imagem: string | null;
}

interface Parsed extends AssetNewsItem {
  _gnLink: string;
  _lang: Lang;
}

function cleanTicker(t: string): string {
  return t.replace(/\.SA$/i, "").replace(/-USD$/i, "").replace(/=X$/i, "").trim();
}

function parseGoogleItems(xml: string, lang: Lang, max: number): Parsed[] {
  const out: Parsed[] = [];
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  for (const m of items.slice(0, max)) {
    const block = m[1];
    const titulo = decodeHtml(extractTag(block, "title"));
    const link = extractTag(block, "link").trim();
    if (!titulo || !link) continue;
    const data = extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "updated");
    const fonte = extractSource(block, "Google News");
    out.push({ titulo, link, data, fonte, imagem: null, _gnLink: link, _lang: lang });
  }
  return out;
}

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const ticker = (searchParams.get("ticker") ?? "").trim();
  const nome = (searchParams.get("nome") ?? "").trim();
  const moeda = (searchParams.get("moeda") ?? "BRL").trim().toUpperCase();

  if (!ticker) return NextResponse.json({ articles: [], count: 0 });

  // Ativos em USD → manchetes em inglês (depois traduzidas); BR → português.
  const lang: Lang = moeda === "USD" ? "en" : "pt";
  const tk = cleanTicker(ticker);

  // Query: prioriza o nome da empresa (quando houver) + ticker, com termo de
  // contexto pra evitar resultados fora do mercado.
  const subject = nome && nome.toLowerCase() !== ticker.toLowerCase() ? `"${nome}" ${tk}` : tk;
  const query = lang === "en" ? `${subject} stock shares` : `${subject} ações`;

  try {
    const xml = await fetchFeed(googleNewsSearchUrl(query, lang));
    const pool = parseGoogleItems(xml, lang, 10);

    // Resolver URL real + imagem (decode base64 primeiro; fallback no redirect).
    await Promise.allSettled(
      pool.map(async (item) => {
        const decoded = decodeGoogleNewsUrl(item._gnLink);
        if (decoded) {
          item.link = decoded;
          item.imagem = await fetchArticleImage(decoded);
          return;
        }
        const r = await resolveAndImage(item._gnLink);
        if (r) {
          item.link = r.realUrl;
          item.imagem = r.img;
        }
      })
    );

    // Traduzir manchetes em inglês.
    if (lang === "en") {
      try {
        const translated = await translateBatch(pool.map((p) => p.titulo), "pt");
        for (let i = 0; i < pool.length; i++) {
          if (translated[i] && translated[i].length > 3) pool[i].titulo = translated[i];
        }
      } catch { /* mantém original */ }
    }

    // Imagens preferenciais: artigos COM imagem sobem; depois mais recentes.
    pool.sort((a, b) => {
      const ai = a.imagem ? 0 : 1;
      const bi = b.imagem ? 0 : 1;
      if (ai !== bi) return ai - bi;
      const da = a.data ? new Date(a.data).getTime() : 0;
      const db = b.data ? new Date(b.data).getTime() : 0;
      return db - da;
    });

    const articles: AssetNewsItem[] = pool
      .slice(0, 6)
      .map(({ _gnLink: _g, _lang: _l, ...rest }) => rest);

    return NextResponse.json({ articles, count: articles.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ articles: [], count: 0, error: msg }, { status: 500 });
  }
}

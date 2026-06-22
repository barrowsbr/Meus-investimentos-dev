import { NextResponse } from "next/server";
import { translateBatch } from "@/lib/translate";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface DestaqueItem {
  titulo: string;
  link: string;
  data: string;
  fonte: string;
  imagem: string | null;
  categoria: string;
  impacto: "alto" | "medio" | "baixo";
}

const HIGH: string[] = [
  "selic", "copom", "fomc", "fed ", "rate cut", "rate hike",
  "corte de juros", "alta de juros", "decisão",
  "inflação", "ipca", "cpi ", "pce ",
  "pib", "gdp", "recessão", "recession",
  "resultados", "earnings", "lucro líquido",
  "dividendos", "ipo", "falência", "bankruptcy",
  "fusão", "merger", "aquisição", "acquisition",
  "default", "moratória", "rebaixamento",
  "guerra", "war ", "sanções", "sanctions",
  "payroll", "urgente", "breaking",
];

const MEDIUM: string[] = [
  "balanço", "guidance", "analista", "analyst",
  "preço-alvo", "price target", "upgrade", "downgrade",
  "volatilidade", "sell-off", "rally",
  "câmbio", "dólar", "petróleo",
  "dividendo", "recompra", "buyback",
  "regulação", "regulation", "lucro", "receita",
];

function scoreImpact(t: string): DestaqueItem["impacto"] {
  const lc = t.toLowerCase();
  if (HIGH.some(k => lc.includes(k))) return "alto";
  if (MEDIUM.some(k => lc.includes(k))) return "medio";
  return "baixo";
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, "").trim();
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m) return "";
  const inner = m[1].trim();
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdata ? cdata[1] : inner;
}

function extractSource(xml: string): string {
  const m = xml.match(/<source[^>]*>([^<]*)<\/source>/i);
  return m ? decodeHtml(m[1].trim()) : "Google News";
}

// Decode the real article URL from a Google News redirect URL.
// The URL path /rss/articles/CBMi... contains a protobuf payload with the article URL.
function decodeGoogleNewsUrl(gnUrl: string): string | null {
  try {
    const m = gnUrl.match(/\/articles\/([A-Za-z0-9_\-]+)/);
    if (!m) return null;
    let b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const buf = Buffer.from(b64, "base64");
    const str = buf.toString("latin1");
    const urlMatch = str.match(/https?:\/\/[^\x00-\x1f\x7f-\x9f"'<>\s]+/);
    return urlMatch?.[0] ?? null;
  } catch {
    return null;
  }
}

interface Feed {
  url: string;
  categoria: string;
  lang: "pt" | "en";
  max: number;
}

function newsUrl(q: string, lang: "pt" | "en" = "pt"): string {
  const e = encodeURIComponent(q);
  return lang === "en"
    ? `https://news.google.com/rss/search?q=${e}&hl=en-US&gl=US&ceid=US:en`
    : `https://news.google.com/rss/search?q=${e}&hl=pt-BR&gl=BR&ceid=BR:pt`;
}

const FEEDS: Feed[] = [
  { url: newsUrl("bolsa brasil ibovespa mercado financeiro"), categoria: "Mercado", lang: "pt", max: 6 },
  { url: newsUrl("economia brasil banco central selic juros"), categoria: "Economia", lang: "pt", max: 5 },
  { url: newsUrl("S&P 500 Nasdaq stock market Wall Street", "en"), categoria: "Global", lang: "en", max: 5 },
  { url: newsUrl("dólar câmbio real cotação moeda"), categoria: "Câmbio", lang: "pt", max: 4 },
  { url: newsUrl("ações dividendos investimentos renda variável"), categoria: "Investimentos", lang: "pt", max: 4 },
  { url: newsUrl("COPOM selic inflação IPCA taxa juros"), categoria: "Macro", lang: "pt", max: 4 },
  { url: newsUrl("petróleo energia petrobras mineração vale"), categoria: "Commodities", lang: "pt", max: 3 },
  { url: newsUrl("nvidia apple microsoft AI tech earnings", "en"), categoria: "Tech", lang: "en", max: 3 },
];

interface Parsed extends DestaqueItem { _lang: "pt" | "en" }

function parseFeed(xml: string, feed: Feed): Parsed[] {
  const items: Parsed[] = [];
  const matches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  for (const m of matches.slice(0, feed.max)) {
    const block = m[1];
    const titulo = decodeHtml(extractTag(block, "title"));
    let link = extractTag(block, "link");
    if (!link) { const hm = block.match(/<link\s+href="([^"]+)"/i); if (hm) link = hm[1]; }
    if (!titulo || !link) continue;

    const data = extractTag(block, "pubDate");
    const fonte = extractSource(block);

    items.push({
      titulo, link, data, fonte,
      imagem: null,
      categoria: feed.categoria,
      impacto: scoreImpact(titulo),
      _lang: feed.lang,
    });
  }
  return items;
}

async function fetchFeed(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "application/rss+xml, application/xml, text/xml, */*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 600 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchArticleImage(articleUrl: string): Promise<string | null> {
  try {
    const res = await fetch(articleUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,*/*",
      },
      signal: AbortSignal.timeout(5000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Try og:image first (most common)
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (og?.[1]) return og[1];

    // Try twitter:image
    const tw = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (tw?.[1]) return tw[1];

    return null;
  } catch { return null; }
}

export async function GET() {
  try {
    const results = await Promise.allSettled(
      FEEDS.map(async f => {
        const xml = await fetchFeed(f.url);
        return parseFeed(xml, f);
      })
    );

    const all: Parsed[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") all.push(...r.value);
    }

    const seen = new Set<string>();
    const deduped: Parsed[] = [];
    for (const item of all) {
      const key = item.titulo.toLowerCase().slice(0, 50);
      const linkKey = item.link.slice(0, 80);
      if (!seen.has(key) && !seen.has(linkKey)) {
        seen.add(key);
        seen.add(linkKey);
        deduped.push(item);
      }
    }

    const impactOrder = { alto: 0, medio: 1, baixo: 2 };
    deduped.sort((a, b) => {
      const i = impactOrder[a.impacto] - impactOrder[b.impacto];
      if (i !== 0) return i;
      const da = a.data ? new Date(a.data).getTime() : 0;
      const db = b.data ? new Date(b.data).getTime() : 0;
      return db - da;
    });

    const top = deduped.slice(0, 12);

    // Translate English headlines
    const english = top.filter(t => t._lang === "en");
    if (english.length > 0) {
      try {
        const translated = await translateBatch(english.map(e => e.titulo), "pt");
        for (let i = 0; i < english.length; i++) {
          if (translated[i] && translated[i].length > 3) english[i].titulo = translated[i];
        }
      } catch { /* keep original */ }
    }

    // Fetch og:image from real article pages for ALL articles.
    // Google News RSS images are unreliable (often just the Google logo).
    // Decode each Google News URL to get the real article URL, then fetch og:image.
    const ogResults = await Promise.allSettled(
      top.map(item => {
        const realUrl = decodeGoogleNewsUrl(item.link);
        if (!realUrl) return Promise.resolve(null);
        return fetchArticleImage(realUrl);
      })
    );
    for (let i = 0; i < top.length; i++) {
      const r = ogResults[i];
      if (r.status === "fulfilled" && r.value) {
        top[i].imagem = r.value;
      }
    }

    const articles: DestaqueItem[] = top.map(({ _lang: _, ...rest }) => rest);

    return NextResponse.json({ articles, count: articles.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ articles: [], count: 0, error: msg }, { status: 500 });
  }
}

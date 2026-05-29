import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NewsItem {
  titulo: string;
  link: string;
  data: string;
  fonte: string;
  ticker: string;
  categoria: "mercado" | "portfolio" | "economia";
}

// ─── RSS helpers ──────────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  const inner = m[1].trim();
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdata ? cdata[1] : inner;
}

function extractSourceName(xml: string): string {
  const m = xml.match(/<source[^>]*>([^<]*)<\/source>/i);
  return m ? decodeHtml(m[1].trim()) : "";
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function newsUrl(query: string, lang: "pt" | "en" = "pt"): string {
  const q = encodeURIComponent(query);
  if (lang === "en") {
    return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  }
  return `https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt`;
}

async function fetchFeed(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "application/rss+xml, application/xml, text/xml, */*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
      "Accept-Encoding": "identity",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseRSS(
  xml: string,
  ticker: string,
  categoria: NewsItem["categoria"],
  maxItems = 6
): NewsItem[] {
  const items: NewsItem[] = [];
  const matches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];

  for (const m of matches.slice(0, maxItems)) {
    const block = m[1];
    const titulo = decodeHtml(extractTag(block, "title"));
    // Google News link is sometimes in <link> (plain text) or <link href="...">
    let link = extractTag(block, "link");
    if (!link) {
      const hm = block.match(/<link\s+href="([^"]+)"/i);
      if (hm) link = hm[1];
    }
    if (!titulo || !link) continue;

    const data = extractTag(block, "pubDate");
    const fonte = extractSourceName(block) || "Google News";

    items.push({ titulo, link, data, fonte, ticker, categoria });
  }

  return items;
}

// ─── Fetch all feeds concurrently ─────────────────────────────────────────────

async function fetchAllNews(tickers: string[]): Promise<NewsItem[]> {
  const feeds: Array<{ url: string; ticker: string; categoria: NewsItem["categoria"]; max: number }> = [
    // General market — Portuguese
    {
      url: newsUrl("bolsa brasil ibovespa mercado financeiro"),
      ticker: "Mercado",
      categoria: "mercado",
      max: 8,
    },
    {
      url: newsUrl("ações dividendos investimentos"),
      ticker: "Investimentos",
      categoria: "mercado",
      max: 6,
    },
    // Economy
    {
      url: newsUrl("economia brasil banco central selic"),
      ticker: "Economia",
      categoria: "economia",
      max: 6,
    },
    {
      url: newsUrl("dólar câmbio moeda taxa"),
      ticker: "Câmbio",
      categoria: "economia",
      max: 4,
    },
  ];

  // Add top portfolio tickers (max 6)
  const topTickers = tickers.slice(0, 6);
  for (const t of topTickers) {
    const query = t.endsWith(".SA") ? `${t} ações bolsa` : `${t} stock market`;
    const lang = t.endsWith(".SA") || !t.includes(".") ? "pt" : "en";
    feeds.push({
      url: newsUrl(query, lang as "pt" | "en"),
      ticker: t.replace(".SA", ""),
      categoria: "portfolio",
      max: 4,
    });
  }

  const results = await Promise.allSettled(
    feeds.map(async f => {
      const xml = await fetchFeed(f.url);
      return parseRSS(xml, f.ticker, f.categoria, f.max);
    })
  );

  const all: NewsItem[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      all.push(...r.value);
    }
  }

  // Deduplicate by link
  const seen = new Set<string>();
  const deduped: NewsItem[] = [];
  for (const item of all) {
    const key = item.link.slice(0, 80);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  // Sort by date descending
  deduped.sort((a, b) => {
    const da = a.data ? new Date(a.data).getTime() : 0;
    const db = b.data ? new Date(b.data).getTime() : 0;
    return db - da;
  });

  return deduped;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tickersParam = searchParams.get("tickers") ?? "";
  const tickers = tickersParam
    ? tickersParam.split(",").map(t => t.trim()).filter(Boolean)
    : [];

  try {
    const articles = await fetchAllNews(tickers);
    return NextResponse.json({ articles, count: articles.length });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message, articles: [] }, { status: 500 });
  }
}

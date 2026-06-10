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
  categoria: "mercado" | "portfolio" | "economia" | "macro" | "setor";
  impacto: "alto" | "medio" | "baixo";
}

// ─── Impact scoring ──────────────────────────────────────────────────────────

const HIGH_IMPACT: string[] = [
  "selic", "copom", "fomc", "fed ", "rate cut", "rate hike",
  "corte de juros", "alta de juros", "decisão de juros",
  "inflação", "ipca", "cpi ", "pce ",
  "pib", "gdp", "recessão", "recession",
  "resultados", "earnings", "lucro líquido", "net income",
  "dividendos extraordinários", "special dividend",
  "ipo", "falência", "bankruptcy", "recuperação judicial",
  "fusão", "merger", "aquisição", "acquisition", "takeover",
  "default", "moratória", "rebaixamento", "downgrade soberano",
  "guerra", "war ", "sanções", "sanctions",
  "payroll", "emprego", "unemployment",
  "breaking", "urgente", "alerta",
];

const MEDIUM_IMPACT: string[] = [
  "balanço", "projeção", "guidance", "analista", "analyst",
  "preço-alvo", "price target", "upgrade", "downgrade", "rating",
  "volatilidade", "volatility", "sell-off", "rally",
  "câmbio", "dólar", "petróleo", "crude oil",
  "desemprego", "treasury", "bond yield",
  "lucro", "profit", "receita", "revenue",
  "dividendo", "dividend", "recompra", "buyback",
  "regulação", "regulation",
];

function scoreImpact(titulo: string): "alto" | "medio" | "baixo" {
  const t = titulo.toLowerCase();
  if (HIGH_IMPACT.some(kw => t.includes(kw))) return "alto";
  if (MEDIUM_IMPACT.some(kw => t.includes(kw))) return "medio";
  return "baixo";
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
    let link = extractTag(block, "link");
    if (!link) {
      const hm = block.match(/<link\s+href="([^"]+)"/i);
      if (hm) link = hm[1];
    }
    if (!titulo || !link) continue;

    const data = extractTag(block, "pubDate");
    const fonte = extractSourceName(block) || "Google News";

    items.push({ titulo, link, data, fonte, ticker, categoria, impacto: scoreImpact(titulo) });
  }

  return items;
}

// ─── Feed definitions ─────────────────────────────────────────────────────────

interface FeedDef {
  url: string;
  ticker: string;
  categoria: NewsItem["categoria"];
  max: number;
}

function buildFeeds(tickers: string[]): FeedDef[] {
  const feeds: FeedDef[] = [];

  // General market
  feeds.push(
    { url: newsUrl("bolsa brasil ibovespa mercado financeiro"), ticker: "Mercado", categoria: "mercado", max: 8 },
    { url: newsUrl("ações dividendos investimentos brasil"), ticker: "Investimentos", categoria: "mercado", max: 5 },
    { url: newsUrl("S&P 500 Nasdaq Dow Jones stock market"), ticker: "Wall Street", categoria: "mercado", max: 5 },
  );

  // Economy
  feeds.push(
    { url: newsUrl("economia brasil banco central selic"), ticker: "Economia", categoria: "economia", max: 5 },
    { url: newsUrl("dólar câmbio moeda taxa real"), ticker: "Câmbio", categoria: "economia", max: 4 },
    { url: newsUrl("renda fixa tesouro direto CDB debêntures"), ticker: "Renda Fixa", categoria: "economia", max: 3 },
  );

  // Macro calendar
  feeds.push(
    { url: newsUrl("COPOM selic decisão taxa juros reunião"), ticker: "COPOM", categoria: "macro", max: 5 },
    { url: newsUrl("FOMC federal reserve interest rate decision meeting", "en"), ticker: "FOMC", categoria: "macro", max: 5 },
    { url: newsUrl("inflação IPCA índice preços consumidor"), ticker: "IPCA", categoria: "macro", max: 4 },
    { url: newsUrl("payroll employment jobs report labor market", "en"), ticker: "Payroll", categoria: "macro", max: 3 },
    { url: newsUrl("CPI inflation consumer prices report", "en"), ticker: "CPI", categoria: "macro", max: 3 },
    { url: newsUrl("PIB produto interno bruto crescimento economia"), ticker: "PIB", categoria: "macro", max: 3 },
  );

  // Sectors
  feeds.push(
    { url: newsUrl("petróleo energia petrobras eletrobras"), ticker: "Energia", categoria: "setor", max: 4 },
    { url: newsUrl("bancos itaú bradesco banco brasil financeiro"), ticker: "Financeiro", categoria: "setor", max: 4 },
    { url: newsUrl("varejo consumo mercado livre magazine luiza"), ticker: "Varejo", categoria: "setor", max: 3 },
    { url: newsUrl("mineração vale minério ferro siderurgia"), ticker: "Mineração", categoria: "setor", max: 3 },
    { url: newsUrl("nvidia apple microsoft google big tech AI", "en"), ticker: "Tech", categoria: "setor", max: 4 },
    { url: newsUrl("saúde hapvida rede d'or farmacêutica SUS"), ticker: "Saúde", categoria: "setor", max: 3 },
  );

  // Portfolio tickers — ALL of them
  for (const t of tickers) {
    const clean = t.replace(".SA", "");
    const isIntl = !t.endsWith(".SA") && !t.match(/^\d/);
    const query = isIntl ? `${clean} stock market news` : `${clean} ações bolsa`;
    const lang = isIntl ? "en" : "pt";
    feeds.push({
      url: newsUrl(query, lang as "pt" | "en"),
      ticker: clean,
      categoria: "portfolio",
      max: 3,
    });
  }

  return feeds;
}

// ─── Fetch all feeds concurrently ─────────────────────────────────────────────

async function fetchAllNews(tickers: string[]): Promise<NewsItem[]> {
  const feeds = buildFeeds(tickers);
  const BATCH = 12;
  const all: NewsItem[] = [];

  for (let i = 0; i < feeds.length; i += BATCH) {
    const batch = feeds.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async f => {
        const xml = await fetchFeed(f.url);
        return parseRSS(xml, f.ticker, f.categoria, f.max);
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled") all.push(...r.value);
    }
  }

  // Deduplicate by link + title
  const seen = new Set<string>();
  const deduped: NewsItem[] = [];
  for (const item of all) {
    const linkKey = item.link.slice(0, 80);
    const titleKey = item.titulo.toLowerCase().slice(0, 60);
    if (!seen.has(linkKey) && !seen.has(titleKey)) {
      seen.add(linkKey);
      seen.add(titleKey);
      deduped.push(item);
    }
  }

  // Sort: high impact first, then by date
  const impactOrder = { alto: 0, medio: 1, baixo: 2 };
  deduped.sort((a, b) => {
    const ia = impactOrder[a.impacto] - impactOrder[b.impacto];
    if (ia !== 0) return ia;
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

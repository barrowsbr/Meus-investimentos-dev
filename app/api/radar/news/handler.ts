import { NextResponse } from "next/server";
import { parseRssItems } from "@/lib/radar/rss";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// ─────────────────────────────────────────────────────────────────────────────
// Country-filtered news — busca notícias via Google News RSS para um país
// específico, retornando as mais relevantes ordenadas por impacto.
// ─────────────────────────────────────────────────────────────────────────────

interface NewsItem {
  titulo: string;
  link: string;
  data: string;
  fonte: string;
  impacto: "alto" | "medio" | "baixo";
}

const COUNTRY_EN: Record<string, string> = {
  "EUA": "United States", "Brasil": "Brazil", "Canadá": "Canada", "México": "Mexico",
  "Argentina": "Argentina", "Chile": "Chile", "Colômbia": "Colombia", "Peru": "Peru",
  "Venezuela": "Venezuela", "Costa Rica": "Costa Rica", "Panamá": "Panama",
  "Europa": "Europe", "Reino Unido": "United Kingdom", "Alemanha": "Germany",
  "França": "France", "Espanha": "Spain", "Itália": "Italy", "Suíça": "Switzerland",
  "Holanda": "Netherlands", "Suécia": "Sweden", "Dinamarca": "Denmark",
  "Noruega": "Norway", "Portugal": "Portugal", "Polônia": "Poland",
  "Turquia": "Turkey", "Rússia": "Russia", "Ucrânia": "Ukraine",
  "Japão": "Japan", "Hong Kong": "Hong Kong", "China": "China",
  "Coreia do Sul": "South Korea", "Taiwan": "Taiwan", "Índia": "India",
  "Singapura": "Singapore", "Indonésia": "Indonesia", "Malásia": "Malaysia",
  "Tailândia": "Thailand", "Filipinas": "Philippines",
  "Israel": "Israel", "Arábia Saudita": "Saudi Arabia", "Emirados": "UAE",
  "África do Sul": "South Africa", "Egito": "Egypt", "Nigéria": "Nigeria",
  "Austrália": "Australia", "Nova Zelândia": "New Zealand",
};

const HIGH_KW = [
  "crisis", "war", "default", "recession", "sanctions", "coup", "impeachment",
  "rate cut", "rate hike", "inflation", "gdp", "election", "downgrade",
  "crise", "guerra", "recessão", "sanções", "golpe", "inflação",
];

const MEDIUM_KW = [
  "trade", "tariff", "bond", "currency", "central bank", "protest",
  "earnings", "commodity", "oil", "growth", "deficit",
  "câmbio", "juros", "protesto", "petróleo", "crescimento",
];

function scoreImpact(title: string): "alto" | "medio" | "baixo" {
  const t = title.toLowerCase();
  if (HIGH_KW.some(kw => t.includes(kw))) return "alto";
  if (MEDIUM_KW.some(kw => t.includes(kw))) return "medio";
  return "baixo";
}

async function fetchCountryNews(country: string): Promise<NewsItem[]> {
  const en = COUNTRY_EN[country] ?? country;

  const queries = [
    `${en} economy market financial`,
    `${en} politics government policy`,
  ];

  const allItems: NewsItem[] = [];
  const seen = new Set<string>();

  const results = await Promise.allSettled(
    queries.map(async (q) => {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 1800 } });
      if (!res.ok) return [];
      const xml = await res.text();
      const rssItems = parseRssItems(xml);
      return rssItems.slice(0, 8).map(item => ({
        titulo: item.title,
        link: item.link,
        data: item.pubDate,
        fonte: item.source,
        impacto: scoreImpact(item.title),
      }));
    })
  );

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const item of r.value) {
      const key = item.titulo.toLowerCase().slice(0, 50);
      if (!seen.has(key)) {
        seen.add(key);
        allItems.push(item);
      }
    }
  }

  const impactOrder = { alto: 0, medio: 1, baixo: 2 };
  allItems.sort((a, b) => {
    const d = impactOrder[a.impacto] - impactOrder[b.impacto];
    if (d !== 0) return d;
    const da = a.data ? new Date(a.data).getTime() : 0;
    const db = b.data ? new Date(b.data).getTime() : 0;
    return db - da;
  });

  return allItems.slice(0, 12);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") ?? "";

  if (!country) {
    return NextResponse.json({ error: "country param required" }, { status: 400 });
  }

  try {
    const articles = await fetchCountryNews(country);
    return NextResponse.json({ country, articles, count: articles.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg, articles: [] }, { status: 500 });
  }
}

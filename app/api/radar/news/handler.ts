import { NextResponse } from "next/server";
import { parseRssItems } from "@/lib/radar/rss";
import { translateBatch } from "@/lib/translate";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Country-filtered news — busca notícias via Google News RSS no IDIOMA LOCAL de
// cada país (japonês p/ Japão, alemão p/ Alemanha, espanhol p/ Argentina…) para
// capturar fontes nativas, e traduz tudo de volta para português via Google
// Translate. Países sem locale mapeado caem no inglês (comportamento anterior).
// ─────────────────────────────────────────────────────────────────────────────

interface NewsItem {
  titulo: string;
  link: string;
  data: string;
  fonte: string;
  impacto: "alto" | "medio" | "baixo";
  original?: string;
  idioma?: string;
}

// País (PT) → locale nativo do Google News. lang é o idioma das manchetes
// (usado para decidir se precisa traduzir e em que idioma montar a busca).
interface Locale { hl: string; gl: string; ceid: string; lang: string }

const LOCALES: Record<string, Locale> = {
  "EUA": { hl: "en-US", gl: "US", ceid: "US:en", lang: "en" },
  "Brasil": { hl: "pt-BR", gl: "BR", ceid: "BR:pt", lang: "pt" },
  "Portugal": { hl: "pt-PT", gl: "PT", ceid: "PT:pt", lang: "pt" },
  "Canadá": { hl: "en-CA", gl: "CA", ceid: "CA:en", lang: "en" },
  "México": { hl: "es-419", gl: "MX", ceid: "MX:es-419", lang: "es" },
  "Argentina": { hl: "es-419", gl: "AR", ceid: "AR:es-419", lang: "es" },
  "Chile": { hl: "es-419", gl: "CL", ceid: "CL:es-419", lang: "es" },
  "Colômbia": { hl: "es-419", gl: "CO", ceid: "CO:es-419", lang: "es" },
  "Peru": { hl: "es-419", gl: "PE", ceid: "PE:es-419", lang: "es" },
  "Venezuela": { hl: "es-419", gl: "VE", ceid: "VE:es-419", lang: "es" },
  "Espanha": { hl: "es", gl: "ES", ceid: "ES:es", lang: "es" },
  "Reino Unido": { hl: "en-GB", gl: "GB", ceid: "GB:en", lang: "en" },
  "Alemanha": { hl: "de", gl: "DE", ceid: "DE:de", lang: "de" },
  "França": { hl: "fr", gl: "FR", ceid: "FR:fr", lang: "fr" },
  "Itália": { hl: "it", gl: "IT", ceid: "IT:it", lang: "it" },
  "Holanda": { hl: "nl", gl: "NL", ceid: "NL:nl", lang: "nl" },
  "Suíça": { hl: "de", gl: "CH", ceid: "CH:de", lang: "de" },
  "Áustria": { hl: "de", gl: "AT", ceid: "AT:de", lang: "de" },
  "Bélgica": { hl: "fr", gl: "BE", ceid: "BE:fr", lang: "fr" },
  "Suécia": { hl: "sv", gl: "SE", ceid: "SE:sv", lang: "sv" },
  "Dinamarca": { hl: "da", gl: "DK", ceid: "DK:da", lang: "da" },
  "Noruega": { hl: "no", gl: "NO", ceid: "NO:no", lang: "no" },
  "Polônia": { hl: "pl", gl: "PL", ceid: "PL:pl", lang: "pl" },
  "Turquia": { hl: "tr", gl: "TR", ceid: "TR:tr", lang: "tr" },
  "Rússia": { hl: "ru", gl: "RU", ceid: "RU:ru", lang: "ru" },
  "Ucrânia": { hl: "uk", gl: "UA", ceid: "UA:uk", lang: "uk" },
  "Grécia": { hl: "el", gl: "GR", ceid: "GR:el", lang: "el" },
  "Japão": { hl: "ja", gl: "JP", ceid: "JP:ja", lang: "ja" },
  "China": { hl: "zh-CN", gl: "CN", ceid: "CN:zh-Hans", lang: "zh-CN" },
  "Hong Kong": { hl: "zh-HK", gl: "HK", ceid: "HK:zh-Hant", lang: "zh-TW" },
  "Taiwan": { hl: "zh-TW", gl: "TW", ceid: "TW:zh-Hant", lang: "zh-TW" },
  "Coreia do Sul": { hl: "ko", gl: "KR", ceid: "KR:ko", lang: "ko" },
  "Índia": { hl: "en-IN", gl: "IN", ceid: "IN:en", lang: "en" },
  "Singapura": { hl: "en-SG", gl: "SG", ceid: "SG:en", lang: "en" },
  "Indonésia": { hl: "id", gl: "ID", ceid: "ID:id", lang: "id" },
  "Malásia": { hl: "ms-MY", gl: "MY", ceid: "MY:ms", lang: "ms" },
  "Tailândia": { hl: "th", gl: "TH", ceid: "TH:th", lang: "th" },
  "Filipinas": { hl: "en-PH", gl: "PH", ceid: "PH:en", lang: "en" },
  "Israel": { hl: "he", gl: "IL", ceid: "IL:he", lang: "he" },
  "Arábia Saudita": { hl: "ar", gl: "SA", ceid: "SA:ar", lang: "ar" },
  "Emirados": { hl: "ar", gl: "AE", ceid: "AE:ar", lang: "ar" },
  "Egito": { hl: "ar", gl: "EG", ceid: "EG:ar", lang: "ar" },
  "África do Sul": { hl: "en-ZA", gl: "ZA", ceid: "ZA:en", lang: "en" },
  "Nigéria": { hl: "en-NG", gl: "NG", ceid: "NG:en", lang: "en" },
  "Austrália": { hl: "en-AU", gl: "AU", ceid: "AU:en", lang: "en" },
  "Nova Zelândia": { hl: "en-NZ", gl: "NZ", ceid: "NZ:en", lang: "en" },
};

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
  "crise", "guerra", "recessão", "sanções", "golpe", "inflação", "eleição",
  "recessão", "calote", "juros",
];

const MEDIUM_KW = [
  "trade", "tariff", "bond", "currency", "central bank", "protest",
  "earnings", "commodity", "oil", "growth", "deficit",
  "câmbio", "juros", "protesto", "petróleo", "crescimento", "tarifa",
  "banco central", "déficit", "moeda",
];

// Pontuação de impacto roda sobre o título JÁ traduzido para PT (as keywords
// cobrem PT + EN; manchetes em outros idiomas só batem após a tradução).
function scoreImpact(title: string): "alto" | "medio" | "baixo" {
  const t = title.toLowerCase();
  if (HIGH_KW.some(kw => t.includes(kw))) return "alto";
  if (MEDIUM_KW.some(kw => t.includes(kw))) return "medio";
  return "baixo";
}

// Termos de busca base (em PT) → traduzidos para o idioma local sob demanda.
const BASE_QUERIES_PT = [
  "economia mercado financeiro",
  "política governo",
];

async function buildQueries(locale: Locale, country: string): Promise<string[]> {
  if (locale.lang === "pt") return BASE_QUERIES_PT;
  if (locale.lang === "en") {
    const en = COUNTRY_EN[country] ?? country;
    return [`${en} economy market financial`, `${en} politics government policy`];
  }
  // Idioma local: traduz os termos base para a língua nativa (cacheado).
  return translateBatch(BASE_QUERIES_PT, locale.lang, 2);
}

async function fetchCountryNews(country: string): Promise<NewsItem[]> {
  const locale: Locale = LOCALES[country] ?? {
    hl: "en-US", gl: "US", ceid: "US:en", lang: "en",
  };

  const queries = await buildQueries(locale, country);

  const allItems: NewsItem[] = [];
  const seen = new Set<string>();

  const results = await Promise.allSettled(
    queries.map(async (q) => {
      const url =
        `https://news.google.com/rss/search?q=${encodeURIComponent(q)}` +
        `&hl=${encodeURIComponent(locale.hl)}&gl=${encodeURIComponent(locale.gl)}` +
        `&ceid=${encodeURIComponent(locale.ceid)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 1800 } });
      if (!res.ok) return [];
      const xml = await res.text();
      return parseRssItems(xml).slice(0, 8);
    })
  );

  const raw: { titulo: string; link: string; data: string; fonte: string }[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const item of r.value) {
      const key = item.title.toLowerCase().slice(0, 50);
      if (seen.has(key)) continue;
      seen.add(key);
      raw.push({ titulo: item.title, link: item.link, data: item.pubDate, fonte: item.source });
    }
  }

  // Traduz manchetes para PT (exceto quando já estão em PT).
  const needsTranslation = locale.lang !== "pt";
  const translated = needsTranslation
    ? await translateBatch(raw.map(r => r.titulo), "pt")
    : raw.map(r => r.titulo);

  for (let i = 0; i < raw.length; i++) {
    const pt = translated[i] || raw[i].titulo;
    allItems.push({
      titulo: pt,
      link: raw[i].link,
      data: raw[i].data,
      fonte: raw[i].fonte,
      impacto: scoreImpact(pt),
      ...(needsTranslation && pt !== raw[i].titulo
        ? { original: raw[i].titulo, idioma: locale.lang }
        : {}),
    });
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

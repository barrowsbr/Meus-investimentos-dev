import { NextResponse } from "next/server";
import { parseRssItems } from "@/lib/radar/rss";
import { translateBatch, translateText } from "@/lib/translate";

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
  local?: boolean;   // veio de um veículo local (não de agência internacional)
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

// Veículos LOCAIS de economia/negócios por país. O Google News, mesmo no locale
// nativo, tende a priorizar grandes agências (Reuters/Bloomberg/SCMP) — então
// para os mercados relevantes miramos explicitamente os jornais locais via
// `site:`, garantindo a visão de dentro do país, não só do exterior reembalado.
const LOCAL_SOURCES: Record<string, string[]> = {
  "China": ["caixin.com", "yicai.com", "finance.sina.com.cn", "eastmoney.com", "stcn.com", "cs.com.cn"],
  "Hong Kong": ["scmp.com", "hkej.com", "hket.com"],
  "Taiwan": ["udn.com", "ctee.com.tw", "money.udn.com"],
  "Japão": ["nikkei.com", "jiji.com", "toyokeizai.net", "diamond.jp", "asahi.com"],
  "Coreia do Sul": ["mk.co.kr", "hankyung.com", "yna.co.kr", "sedaily.com"],
  "Índia": ["economictimes.indiatimes.com", "livemint.com", "moneycontrol.com", "business-standard.com"],
  "Singapura": ["businesstimes.com.sg", "straitstimes.com"],
  "Indonésia": ["bisnis.com", "kontan.co.id", "cnbcindonesia.com"],
  "Tailândia": ["bangkokpost.com", "thansettakij.com"],
  "Malásia": ["theedgemarkets.com", "thestar.com.my"],
  "Alemanha": ["handelsblatt.com", "faz.net", "manager-magazin.de", "wiwo.de"],
  "França": ["lesechos.fr", "latribune.fr", "boursorama.com", "lefigaro.fr"],
  "Itália": ["ilsole24ore.com", "milanofinanza.it", "repubblica.it"],
  "Espanha": ["expansion.com", "eleconomista.es", "cincodias.elpais.com"],
  "Reino Unido": ["ft.com", "telegraph.co.uk", "thisismoney.co.uk", "cityam.com"],
  "Holanda": ["fd.nl", "nu.nl"],
  "Suíça": ["nzz.ch", "finews.ch", "cash.ch"],
  "Suécia": ["di.se", "affarsvarlden.se"],
  "Polônia": ["pb.pl", "bankier.pl", "money.pl"],
  "Portugal": ["jornaldenegocios.pt", "eco.sapo.pt", "dinheirovivo.pt"],
  "Rússia": ["rbc.ru", "vedomosti.ru", "kommersant.ru", "interfax.ru"],
  "Turquia": ["dunya.com", "bloomberght.com", "hurriyet.com.tr"],
  "Brasil": ["valor.globo.com", "infomoney.com.br", "exame.com", "estadao.com.br"],
  "México": ["eleconomista.com.mx", "elfinanciero.com.mx", "expansion.mx"],
  "Argentina": ["ambito.com", "cronista.com", "infobae.com"],
  "Chile": ["df.cl", "latercera.com"],
  "Colômbia": ["larepublica.co", "portafolio.co"],
  "Canadá": ["theglobeandmail.com", "financialpost.com"],
  "Austrália": ["afr.com", "theaustralian.com.au"],
  "Israel": ["globes.co.il", "calcalist.co.il", "themarker.com"],
  "Arábia Saudita": ["argaam.com", "aleqt.com"],
  "Emirados": ["zawya.com", "gulfnews.com"],
  "África do Sul": ["businesslive.co.za", "moneyweb.co.za"],
  "EUA": ["wsj.com", "cnbc.com", "bloomberg.com", "marketwatch.com"],
};

interface QuerySpec { q: string; local: boolean }

// Termo curto de economia no idioma local, para ancorar a busca por veículo.
async function econTerm(locale: Locale): Promise<string> {
  if (locale.lang === "pt") return "economia mercado";
  if (locale.lang === "en") return "economy market finance";
  return translateText("economia mercado", locale.lang);
}

async function buildQueries(locale: Locale, country: string): Promise<QuerySpec[]> {
  const general: QuerySpec[] =
    locale.lang === "pt"
      ? BASE_QUERIES_PT.map(q => ({ q, local: false }))
      : locale.lang === "en"
        ? [
            { q: `${COUNTRY_EN[country] ?? country} economy market financial`, local: false },
            { q: `${COUNTRY_EN[country] ?? country} politics government policy`, local: false },
          ]
        : (await translateBatch(BASE_QUERIES_PT, locale.lang, 2)).map(q => ({ q, local: false }));

  // Query dedicada a veículos locais (quando o país tem fontes mapeadas).
  const sources = LOCAL_SOURCES[country];
  if (sources && sources.length > 0) {
    const term = await econTerm(locale);
    const siteFilter = sources.map(s => `site:${s}`).join(" OR ");
    general.push({ q: `${term} (${siteFilter})`, local: true });
  }

  return general;
}

async function fetchCountryNews(country: string): Promise<NewsItem[]> {
  const locale: Locale = LOCALES[country] ?? {
    hl: "en-US", gl: "US", ceid: "US:en", lang: "en",
  };

  const queries = await buildQueries(locale, country);

  const allItems: NewsItem[] = [];
  const seen = new Set<string>();

  const results = await Promise.allSettled(
    queries.map(async (spec) => {
      const url =
        `https://news.google.com/rss/search?q=${encodeURIComponent(spec.q)}` +
        `&hl=${encodeURIComponent(locale.hl)}&gl=${encodeURIComponent(locale.gl)}` +
        `&ceid=${encodeURIComponent(locale.ceid)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 1800 } });
      if (!res.ok) return [];
      const xml = await res.text();
      // Query local rende mais itens (é o foco do pedido); geral fica em 8.
      return parseRssItems(xml).slice(0, spec.local ? 10 : 8).map(it => ({ ...it, local: spec.local }));
    })
  );

  // Processa a query local primeiro para que, em duplicatas, o item local vença.
  const ordered = results
    .map((r, i) => ({ r, local: queries[i]?.local ?? false }))
    .sort((a, b) => Number(b.local) - Number(a.local));

  const raw: { titulo: string; link: string; data: string; fonte: string; local: boolean }[] = [];
  for (const { r } of ordered) {
    if (r.status !== "fulfilled") continue;
    for (const item of r.value) {
      const key = item.title.toLowerCase().slice(0, 50);
      if (seen.has(key)) continue;
      seen.add(key);
      raw.push({ titulo: item.title, link: item.link, data: item.pubDate, fonte: item.source, local: item.local });
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
      local: raw[i].local,
      ...(needsTranslation && pt !== raw[i].titulo
        ? { original: raw[i].titulo, idioma: locale.lang }
        : {}),
    });
  }

  // Ordena por impacto; dentro de cada faixa, fonte local primeiro, depois recência.
  const impactOrder = { alto: 0, medio: 1, baixo: 2 };
  allItems.sort((a, b) => {
    const d = impactOrder[a.impacto] - impactOrder[b.impacto];
    if (d !== 0) return d;
    if (!!b.local !== !!a.local) return Number(b.local) - Number(a.local);
    const da = a.data ? new Date(a.data).getTime() : 0;
    const db = b.data ? new Date(b.data).getTime() : 0;
    return db - da;
  });

  return allItems.slice(0, 14);
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

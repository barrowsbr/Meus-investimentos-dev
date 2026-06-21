import { NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/cotacoes";
import { COUNTRY_CURRENCY, COUNTRY_RISK_BASE, riskLevel } from "@/lib/radar/geo";
import { INDICES } from "@/lib/radar/indices";
import { parseRssItems } from "@/lib/radar/rss";
import { fetchPolymarket } from "@/lib/polymarket";
import { cacheGet, cacheSet } from "@/lib/radar/disk-cache";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Instability Index — um score 0-100 por país, composto por 4 dimensões:
//   1. Política / Notícias  (news density com palavras-chave de risco)
//   2. Fiscal / Macro        (dívida/PIB, inflação, conta corrente — World Bank)
//   3. Mercado / Volatilidade (|variação| do índice local + moeda)
//   4. Externa / Preditivos   (Polymarket: conflito, eleição, sanções)
//
// O score é determinístico (sem IA) e cacheado em disco 6h.
// ─────────────────────────────────────────────────────────────────────────────

const COUNTRY_ISO: Record<string, string> = {
  "EUA": "US", "Brasil": "BR", "Canadá": "CA", "México": "MX",
  "Argentina": "AR", "Chile": "CL", "Colômbia": "CO", "Peru": "PE",
  "Venezuela": "VE", "Costa Rica": "CR", "Rep. Dominicana": "DO", "Panamá": "PA",
  "Europa": "EU", "Reino Unido": "GB", "Alemanha": "DE", "França": "FR",
  "Espanha": "ES", "Itália": "IT", "Suíça": "CH", "Holanda": "NL",
  "Suécia": "SE", "Dinamarca": "DK", "Finlândia": "FI", "Noruega": "NO",
  "Áustria": "AT", "Bélgica": "BE", "Portugal": "PT", "Polônia": "PL",
  "Turquia": "TR", "Rússia": "RU", "Hungria": "HU", "Tchéquia": "CZ",
  "Romênia": "RO", "Grécia": "GR", "Islândia": "IS", "Ucrânia": "UA",
  "Japão": "JP", "Hong Kong": "HK", "China": "CN", "Coreia do Sul": "KR",
  "Taiwan": "TW", "Índia": "IN", "Singapura": "SG", "Indonésia": "ID",
  "Malásia": "MY", "Tailândia": "TH", "Vietnã": "VN", "Filipinas": "PH",
  "Paquistão": "PK", "Sri Lanka": "LK", "Bangladesh": "BD",
  "Israel": "IL", "Arábia Saudita": "SA", "Emirados": "AE",
  "África do Sul": "ZA", "Egito": "EG", "Marrocos": "MA", "Nigéria": "NG",
  "Austrália": "AU", "Nova Zelândia": "NZ",
};

const COUNTRY_EN: Record<string, string> = {
  "EUA": "United States", "Brasil": "Brazil", "Canadá": "Canada", "México": "Mexico",
  "Argentina": "Argentina", "Chile": "Chile", "Colômbia": "Colombia", "Peru": "Peru",
  "Venezuela": "Venezuela", "Costa Rica": "Costa Rica", "Panamá": "Panama",
  "Europa": "Europe", "Reino Unido": "United Kingdom", "Alemanha": "Germany",
  "França": "France", "Espanha": "Spain", "Itália": "Italy", "Suíça": "Switzerland",
  "Holanda": "Netherlands", "Suécia": "Sweden", "Dinamarca": "Denmark",
  "Finlândia": "Finland", "Noruega": "Norway", "Portugal": "Portugal",
  "Polônia": "Poland", "Turquia": "Turkey", "Rússia": "Russia",
  "Hungria": "Hungary", "Tchéquia": "Czech Republic", "Romênia": "Romania",
  "Grécia": "Greece", "Ucrânia": "Ukraine",
  "Japão": "Japan", "Hong Kong": "Hong Kong", "China": "China",
  "Coreia do Sul": "South Korea", "Taiwan": "Taiwan", "Índia": "India",
  "Singapura": "Singapore", "Indonésia": "Indonesia", "Malásia": "Malaysia",
  "Tailândia": "Thailand", "Vietnã": "Vietnam", "Filipinas": "Philippines",
  "Paquistão": "Pakistan", "Sri Lanka": "Sri Lanka", "Bangladesh": "Bangladesh",
  "Israel": "Israel", "Arábia Saudita": "Saudi Arabia", "Emirados": "UAE",
  "África do Sul": "South Africa", "Egito": "Egypt", "Marrocos": "Morocco",
  "Nigéria": "Nigeria", "Austrália": "Australia", "Nova Zelândia": "New Zealand",
};

interface DimensionScore {
  label: string;
  score: number;
  detail: string;
}

interface InstabilityResult {
  country: string;
  score: number;
  level: "baixo" | "moderado" | "elevado" | "crítico";
  dimensions: DimensionScore[];
  cachedAt: string;
}

const CACHE_TTL = 6 * 60 * 60 * 1000;

// ── 1. News density (Google News RSS count of risk keywords) ────────────────

const RISK_KW = [
  "crise", "crisis", "guerra", "war", "golpe", "coup", "protesto", "protest",
  "sanção", "sanction", "default", "impeachment", "conflito", "conflict",
  "inflação recorde", "hyperinflation", "embargo", "colapso", "collapse",
  "fuga de capital", "capital flight", "desvalorização", "devaluation",
  "rebaixamento", "downgrade", "recessão", "recession", "instabilidade",
];

async function newsScore(country: string): Promise<DimensionScore> {
  const en = COUNTRY_EN[country] ?? country;
  // Query NEUTRA (sem injetar "crisis/risk"): pega uma amostra geral de
  // manchetes do país e mede quantas falam de risco. A query antiga
  // ("… crisis risk") era auto-realizável — quase tudo batia nas keywords.
  const query = `${en} economy politics`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 21600 } });
    if (!res.ok) return { label: "Política / Notícias", score: 0, detail: "Sem dados" };
    const xml = await res.text();
    const items = parseRssItems(xml);
    const total = items.length;
    let riskCount = 0;
    for (const item of items) {
      const title = item.title.toLowerCase();
      if (RISK_KW.some(kw => title.includes(kw))) riskCount++;
    }
    const density = total > 0 ? riskCount / total : 0;
    // Normalização linear sem bônus de saturação: densidade 0→0, ~0.8→100.
    // Discrimina de fato (Suíça ~5-12 vs Argentina ~40-70).
    const raw = Math.min(density * 120, 100);
    const score = Math.round(raw);
    return {
      label: "Política / Notícias",
      score,
      detail: `${riskCount} manchetes de risco em ${total} artigos`,
    };
  } catch {
    return { label: "Política / Notícias", score: 0, detail: "Falha ao buscar notícias" };
  }
}

// ── 2. Fiscal / Macro (World Bank indicators) ───────────────────────────────

async function fetchWBValue(iso: string, indicator: string): Promise<number | null> {
  const year = new Date().getFullYear();
  const url = `https://api.worldbank.org/v2/country/${iso}/indicator/${indicator}?format=json&date=${year - 5}:${year}&per_page=6&source=2`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const json = await res.json();
    const data = json?.[1];
    if (!Array.isArray(data)) return null;
    for (const entry of data) {
      if (entry.value != null) return entry.value;
    }
    return null;
  } catch {
    return null;
  }
}

async function fiscalScore(country: string): Promise<DimensionScore> {
  const iso = COUNTRY_ISO[country];
  if (!iso) return { label: "Fiscal / Macro", score: 0, detail: "ISO não encontrado" };

  const [debt, inflation, currentAccount] = await Promise.all([
    fetchWBValue(iso, "GC.DOD.TOTL.GD.ZS"),
    fetchWBValue(iso, "FP.CPI.TOTL.ZG"),
    fetchWBValue(iso, "BN.CAB.XOKA.GD.ZS"),
  ]);

  let score = 0;
  const parts: string[] = [];

  if (debt !== null) {
    const debtScore = debt > 120 ? 40 : debt > 90 ? 30 : debt > 60 ? 15 : 5;
    score += debtScore;
    parts.push(`Dívida/PIB ${debt.toFixed(0)}%`);
  }
  if (inflation !== null) {
    const infScore = inflation > 50 ? 35 : inflation > 15 ? 25 : inflation > 8 ? 15 : inflation > 4 ? 8 : 3;
    score += infScore;
    parts.push(`Inflação ${inflation.toFixed(1)}%`);
  }
  if (currentAccount !== null) {
    const caScore = currentAccount < -8 ? 25 : currentAccount < -4 ? 15 : currentAccount < 0 ? 5 : 0;
    score += caScore;
    parts.push(`C/C ${currentAccount.toFixed(1)}% PIB`);
  }

  return {
    label: "Fiscal / Macro",
    score: Math.min(Math.round(score), 100),
    detail: parts.join(" · ") || "Sem dados",
  };
}

// ── 3. Market / Volatility (direct fetch via fetchQuotes) ───────────────────

async function marketScore(country: string): Promise<DimensionScore> {
  try {
    const localIndices = INDICES.filter(i => i.country === country && i.symbol !== "^VIX");
    const currencyCode = COUNTRY_CURRENCY[country];
    const fxSymbol = currencyCode && currencyCode !== "USD" ? `${currencyCode}=X` : null;

    const symbols = [
      ...localIndices.map(i => i.symbol),
      ...(fxSymbol ? [fxSymbol] : []),
    ];

    if (symbols.length === 0) {
      return { label: "Mercado / Volatilidade", score: 0, detail: "Sem índices mapeados" };
    }

    const { quotes } = await fetchQuotes(symbols);

    let indexVol = 0;
    let fxVol = 0;
    const parts: string[] = [];

    for (const idx of localIndices) {
      const q = quotes[idx.symbol];
      if (q) {
        const abs = Math.abs(q.changePercent);
        if (abs > indexVol) indexVol = abs;
      }
    }
    if (indexVol > 0) parts.push(`Índice ±${indexVol.toFixed(2)}%`);

    if (fxSymbol) {
      const fxQ = quotes[fxSymbol];
      if (fxQ) {
        fxVol = Math.abs(fxQ.changePercent);
        parts.push(`FX ±${fxVol.toFixed(2)}%`);
      }
    }

    const combined = indexVol * 0.6 + fxVol * 0.4;
    // Resposta suave: um pregão de ±6% (combined ~3.8) lê ~46, não 77 — um dia
    // forte não é "instabilidade crítica". É um nudge, não o motor do score.
    const score = Math.min(Math.round(combined * 12), 100);

    return {
      label: "Mercado / Volatilidade",
      score,
      detail: parts.join(" · ") || "Sem dados",
    };
  } catch {
    return { label: "Mercado / Volatilidade", score: 0, detail: "Falha ao buscar mercados" };
  }
}

// ── 4. External / Predictives (Polymarket geo-events — direct import) ───────

const COUNTRY_GEO_KW: Record<string, string[]> = {
  "EUA": ["united states", "america", "trump", "harris", "biden", "congress", "us election", "federal reserve"],
  "Brasil": ["brazil", "brasil", "lula", "bolsonaro"],
  "China": ["china", "chinese", "xi jinping", "beijing"],
  "Rússia": ["russia", "russian", "putin", "moscow"],
  "Ucrânia": ["ukraine", "ukrainian", "kyiv", "zelensky"],
  "Israel": ["israel", "israeli", "gaza", "hamas", "netanyahu"],
  "Taiwan": ["taiwan", "taiwanese"],
  "Turquia": ["turkey", "turkish", "erdogan"],
  "Argentina": ["argentina", "argentine", "milei"],
  "México": ["mexico", "mexican"],
  "Índia": ["india", "indian", "modi"],
  "Reino Unido": ["united kingdom", "uk ", "britain", "british"],
  "França": ["france", "french", "macron"],
  "Alemanha": ["germany", "german"],
  "Japão": ["japan", "japanese"],
  "Coreia do Sul": ["south korea", "korean"],
  "África do Sul": ["south africa"],
  "Egito": ["egypt", "egyptian"],
  "Nigéria": ["nigeria", "nigerian"],
  "Colômbia": ["colombia", "colombian"],
  "Venezuela": ["venezuela", "venezuelan", "maduro"],
  "Irã": ["iran", "iranian"],
};

async function externalScore(country: string): Promise<DimensionScore> {
  const keywords = COUNTRY_GEO_KW[country];
  if (!keywords || keywords.length === 0) {
    return { label: "Externa / Preditivos", score: 0, detail: "Sem keywords mapeadas" };
  }

  try {
    const data = await fetchPolymarket();
    const allEvents: { title: string; volume: number; odds: { percent: number }[] }[] = [];
    for (const cat of Object.values(data.categories ?? {})) {
      if (Array.isArray(cat)) allEvents.push(...(cat as typeof allEvents));
    }

    let matchCount = 0;
    let riskSignal = 0;
    for (const ev of allEvents) {
      const t = ev.title.toLowerCase();
      if (keywords.some(kw => t.includes(kw))) {
        matchCount++;
        const maxOdds = ev.odds.length > 0 ? Math.max(...ev.odds.map(o => o.percent)) : 50;
        if (t.includes("war") || t.includes("conflict") || t.includes("sanction") || t.includes("crisis") || t.includes("default")) {
          riskSignal += maxOdds / 100 * 30;
        } else {
          riskSignal += 5;
        }
      }
    }

    const score = Math.min(Math.round(riskSignal), 100);
    return {
      label: "Externa / Preditivos",
      score,
      detail: `${matchCount} eventos Polymarket relevantes`,
    };
  } catch {
    return { label: "Externa / Preditivos", score: 0, detail: "Falha ao buscar preditivos" };
  }
}

// ── 0. Estrutural / Soberano (âncora — mesma base do mapa) ──────────────────
// O risco estrutural (rating soberano, instituições, profundidade de mercado)
// é a ÂNCORA do score: domina o composto para que um pregão agitado não
// transforme um país estável em "elevado". É EXATAMENTE a mesma fonte que pinta
// a lente de Risco do mapa (COUNTRY_RISK_BASE) — por isso tag e mapa concordam.
function structuralScore(country: string): DimensionScore {
  const base = COUNTRY_RISK_BASE[country];
  return {
    label: "Estrutural / Soberano",
    score: base ?? 50,
    detail: base != null
      ? "Risco soberano estrutural (rating · instituições · mercado)"
      : "Sem base estrutural — assume risco médio",
  };
}

// ── Compose ─────────────────────────────────────────────────────────────────

async function computeInstability(country: string): Promise<InstabilityResult> {
  const [d1, d2, d3, d4] = await Promise.all([
    newsScore(country),
    fiscalScore(country),
    marketScore(country),
    externalScore(country),
  ]);

  // Estrutural ancora (0.45); notícias/fiscal/mercado/preditivos só AJUSTAM ao
  // redor da base. Pesos somam 1.0. `riskLevel` é o MESMO classificador do mapa
  // (baixo <30 · moderado <50 · elevado <70 · crítico ≥70) — fim da divergência
  // entre o que o mapa pinta e o que a tag do dossiê diz.
  const d0 = structuralScore(country);
  const dimensions = [d0, d1, d2, d3, d4];
  const weights = [0.45, 0.12, 0.18, 0.12, 0.13];
  const composite = Math.round(dimensions.reduce((sum, d, i) => sum + d.score * weights[i], 0));

  return {
    country,
    score: composite,
    level: riskLevel(composite),
    dimensions,
    cachedAt: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") ?? "";

  if (!country) {
    return NextResponse.json({ error: "country param required" }, { status: 400 });
  }

  const cacheKey = `instability_${country}`;
  const cached = cacheGet<InstabilityResult>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "s-maxage=21600, stale-while-revalidate=3600" },
    });
  }

  const result = await computeInstability(country);
  cacheSet(cacheKey, result, CACHE_TTL);

  return NextResponse.json(result, {
    headers: { "X-Cache": "MISS", "Cache-Control": "s-maxage=21600, stale-while-revalidate=3600" },
  });
}

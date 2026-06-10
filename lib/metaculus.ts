export interface MetaculusQuestion {
  id: string;
  source: "metaculus";
  title: string;
  url: string;
  category: string;
  odds: { outcome: string; percent: number }[];
  forecasters: number;
  end_date: string;
  days_left: number | null;
  portfolio_impact: string[];
}

const BASE = "https://www.metaculus.com/api/questions";

const MACRO_KW = [
  "gdp", "inflation", "recession", "interest rate", "fed ", "federal reserve",
  "unemployment", "cpi", "treasury", "s&p", "stock market", "dow jones",
  "nasdaq", "default", "debt", "deficit", "central bank", "imf",
  "tariff", "trade war", "oil price", "commodity",
];

const GEO_KW = [
  "war", "conflict", "election", "president", "trump", "congress",
  "russia", "ukraine", "china", "taiwan", "iran", "israel",
  "nato", "nuclear", "sanctions", "coup", "invasion",
];

const TECH_KW = [
  "ai ", "artificial intelligence", "agi", "openai", "gpt", "llm",
  "autonomous", "robotics", "quantum", "spacex", "tesla",
  "apple", "nvidia", "google", "microsoft", "amazon", "meta",
  "semiconductor", "chip",
];

const TICKER_IMPACT: Record<string, string[]> = {
  "oil": ["PETR4"], "crude": ["PETR4"],
  "s&p": ["VOO", "SPY", "IVVB11"], "stock market": ["BOVA11", "VOO"],
  "recession": ["BOVA11", "VOO", "SPY"], "inflation": ["BOVA11", "VOO"],
  "fed ": ["VOO", "SPY", "QQQ", "IVVB11"],
  "interest rate": ["ITUB4", "BBDC4", "BBAS3"],
  "bitcoin": ["BTC"], "ethereum": ["ETH"],
  "nvidia": ["NVDA"], "apple": ["AAPL"], "tesla": ["TSLA"],
  "microsoft": ["MSFT"], "google": ["GOOGL"], "amazon": ["AMZN"],
  "china": ["VALE3"], "iron ore": ["VALE3"],
  "tariff": ["VALE3", "SUZB3", "JBSS3"],
  "brazil": ["BOVA11", "IVVB11"],
  "ai ": ["NVDA", "MSFT", "GOOGL", "META"],
};

function classify(title: string): string {
  const t = title.toLowerCase();
  if (MACRO_KW.some(kw => t.includes(kw))) return "🏦 Macro & Economia";
  if (GEO_KW.some(kw => t.includes(kw))) return "🌍 Geopolítica";
  if (TECH_KW.some(kw => t.includes(kw))) return "🤖 Tech & IA";
  return "⭐ Outros";
}

function findImpact(title: string): string[] {
  const text = title.toLowerCase();
  const hits = new Set<string>();
  for (const [kw, tickers] of Object.entries(TICKER_IMPACT)) {
    if (text.includes(kw)) tickers.forEach(t => hits.add(t));
  }
  return [...hits];
}

function daysRemaining(endDate: string): number | null {
  if (!endDate) return null;
  try {
    const dt = new Date(endDate);
    const delta = Math.floor((dt.getTime() - Date.now()) / 86400000);
    return delta < 0 ? null : delta;
  } catch {
    return null;
  }
}

export async function fetchMetaculus(): Promise<MetaculusQuestion[]> {
  try {
    const res = await fetch(
      `${BASE}/?limit=80&status=open&order_by=-activity&type=forecast&forecast_type=binary`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; InvestDash/1.0)",
        },
        signal: AbortSignal.timeout(12000),
      }
    );
    if (!res.ok) throw new Error(`Metaculus API ${res.status}`);
    const data = await res.json();
    const results = data.results ?? data ?? [];
    if (!Array.isArray(results)) return [];

    const questions: MetaculusQuestion[] = [];

    for (const q of results) {
      try {
        const title = String(q.title ?? "");
        if (!title) continue;

        const prediction = q.community_prediction?.full?.q2
          ?? q.community_prediction?.q2
          ?? q.forecasts?.community_prediction?.full?.q2
          ?? null;

        if (prediction === null) continue;

        const pct = Math.round(prediction * 1000) / 10;
        const odds = [
          { outcome: "Sim", percent: pct },
          { outcome: "Não", percent: Math.round((1 - prediction) * 1000) / 10 },
        ];

        const endDate = String(q.resolve_time ?? q.scheduled_resolve_time ?? "");
        const forecasters = Number(q.number_of_forecasters ?? q.forecasts_count ?? 0);
        const qId = String(q.id ?? "");

        questions.push({
          id: qId,
          source: "metaculus",
          title,
          url: `https://www.metaculus.com/questions/${qId}/`,
          category: classify(title),
          odds,
          forecasters,
          end_date: endDate,
          days_left: daysRemaining(endDate),
          portfolio_impact: findImpact(title),
        });
      } catch {
        continue;
      }
    }

    questions.sort((a, b) => b.forecasters - a.forecasters);
    return questions;
  } catch {
    return [];
  }
}

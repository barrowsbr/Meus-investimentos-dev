export interface KalshiEvent {
  id: string;
  source: "kalshi";
  title: string;
  url: string;
  category: string;
  odds: { outcome: string; percent: number }[];
  volume: number;
  end_date: string;
  days_left: number | null;
  portfolio_impact: string[];
}

const BASE = "https://api.elections.kalshi.com/trade-api/v2";

const CATEGORY_MAP: Record<string, string> = {
  Economics: "🏦 Macro & Economia",
  "Fed Funds Rate": "🏦 Macro & Economia",
  Financials: "🏦 Macro & Economia",
  Climate: "🌍 Geopolítica",
  Politics: "🌍 Geopolítica",
  World: "🌍 Geopolítica",
  Tech: "🤖 Tech & IA",
  Science: "🤖 Tech & IA",
};

const TICKER_IMPACT: Record<string, string[]> = {
  "fed": ["VOO", "SPY", "QQQ", "IVVB11", "BOVA11"],
  "interest rate": ["ITUB4", "BBDC4", "BBAS3", "B3SA3"],
  "inflation": ["BOVA11", "IVVB11", "VOO"],
  "cpi": ["VOO", "SPY", "QQQ"],
  "gdp": ["BOVA11", "IVVB11", "VOO", "SPY"],
  "recession": ["BOVA11", "IVVB11", "VOO", "SPY"],
  "oil": ["PETR4", "PETR3"],
  "crude": ["PETR4", "PETR3"],
  "s&p": ["VOO", "SPY", "IVVB11"],
  "nasdaq": ["QQQ", "NASD11"],
  "bitcoin": ["BTC"],
  "ethereum": ["ETH"],
  "nvidia": ["NVDA"],
  "apple": ["AAPL"],
  "tesla": ["TSLA"],
  "microsoft": ["MSFT"],
  "google": ["GOOGL"],
  "amazon": ["AMZN"],
  "meta": ["META"],
  "trump": ["VOO", "SPY", "BOVA11"],
  "tariff": ["VALE3", "SUZB3", "JBSS3", "PETR4"],
  "china": ["VALE3"],
  "iron ore": ["VALE3"],
  "brazil": ["BOVA11", "IVVB11"],
  "unemployment": ["BOVA11", "VOO", "SPY"],
};

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

function findImpact(title: string): string[] {
  const text = title.toLowerCase();
  const hits = new Set<string>();
  for (const [kw, tickers] of Object.entries(TICKER_IMPACT)) {
    if (text.includes(kw)) tickers.forEach(t => hits.add(t));
  }
  return [...hits];
}

export async function fetchKalshi(): Promise<KalshiEvent[]> {
  try {
    const res = await fetch(`${BASE}/events?limit=100&status=open&with_nested_markets=true`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; InvestDash/1.0)",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`Kalshi API ${res.status}`);
    const data = await res.json();
    const events: KalshiEvent[] = [];

    const items = data.events ?? data ?? [];
    if (!Array.isArray(items)) return [];

    for (const ev of items) {
      try {
        const markets = ev.markets ?? [];
        if (!markets.length) continue;

        const title = String(ev.title ?? "");
        if (!title) continue;

        const category = CATEGORY_MAP[ev.category ?? ""] ?? "⭐ Outros";
        const endDate = String(ev.close_time ?? ev.expected_expiration_time ?? "");

        const totalVolume = markets.reduce((s: number, m: Record<string, unknown>) => {
          return s + (Number(m.volume) || 0);
        }, 0);

        const odds: { outcome: string; percent: number }[] = [];

        if (markets.length === 1) {
          const m = markets[0];
          const yesP = Number(m.yes_price ?? m.last_price ?? 0);
          if (yesP > 0 && yesP <= 1) {
            odds.push({ outcome: "Sim", percent: Math.round(yesP * 1000) / 10 });
            odds.push({ outcome: "Não", percent: Math.round((1 - yesP) * 1000) / 10 });
          }
        } else {
          for (const m of markets.slice(0, 6)) {
            const label = String(m.title ?? m.subtitle ?? m.ticker ?? "");
            const yesP = Number(m.yes_price ?? m.last_price ?? 0);
            if (!label || yesP <= 0 || yesP > 1) continue;
            odds.push({ outcome: label, percent: Math.round(yesP * 1000) / 10 });
          }
        }

        odds.sort((a, b) => b.percent - a.percent);
        if (!odds.length || odds[0].percent >= 99) continue;

        events.push({
          id: String(ev.event_ticker ?? ev.id ?? ""),
          source: "kalshi",
          title,
          url: `https://kalshi.com/markets/${ev.event_ticker ?? ""}`,
          category,
          odds,
          volume: totalVolume,
          end_date: endDate,
          days_left: daysRemaining(endDate),
          portfolio_impact: findImpact(title),
        });
      } catch {
        continue;
      }
    }

    events.sort((a, b) => b.volume - a.volume);
    return events;
  } catch {
    return [];
  }
}

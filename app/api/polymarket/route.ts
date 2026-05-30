import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// ── Keyword classification lists ──────────────────────────────────────────────

const CRYPTO_KW = [
  "bitcoin", "btc", " eth ", "ethereum", "crypto", "solana", "sol ",
  "binance", "kraken", "coinbase", "dogecoin", "xrp", "ripple",
  "stablecoin", "defi", "nft", "blockchain", "altcoin", "memecoin",
  " bnb ", "polygon", "avalanche", "avax", "litecoin",
];

const MACRO_KW = [
  "fed ", "federal reserve", "interest rate", "rate cut", "rate hike",
  "inflation", "recession", "gdp", "unemployment", "cpi", "pce",
  "treasury", "bond yield", "debt ceiling", "deficit", "imf", "world bank",
  "dollar", "usd", "euro ", "yen ", "brl", "ibovespa", "selic",
  "tariff", "trade war", "sanctions", "opec", "oil price", "crude",
  "fomc", "powell", "ecb", "boe ", "boj ", "central bank",
  "s&p 500", "nasdaq", "dow jones", "stock market", "bear market", "bull market",
  "ipo", "earnings", "revenue", "profit", "layoffs",
];

const GEO_KW = [
  "election", "president", "trump", "harris", "biden", "congress",
  "senate", "war", "conflict", "russia", "ukraine", "china ", "taiwan",
  "israel", "iran", "north korea", "nato", "g7", "g20",
  "nuclear", "ceasefire", "peace deal", "coup", "prime minister",
  "vote", "poll", "referendum", "sanction",
];

const TECH_AI_KW = [
  "openai", "gpt", "chatgpt", "agi", "artificial intelligence", "ai model",
  "llm", "claude", "gemini", "mistral", "anthropic",
  "apple", "nvidia", "meta ", "google", "microsoft", "amazon", "tesla",
  "spacex", "robotics", "autonomous", "self-driving", "quantum",
  "regulation ai", "ai regulation", "deepmind", "sam altman",
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PolyOdds { outcome: string; price: number; percent: number }
export interface PolyEvent {
  id: string;
  title: string;
  url: string;
  volume: number;
  end_date: string;
  days_left: number | null;
  odds: PolyOdds[];
  is_binary: boolean;
}
export interface PolyResponse {
  categories: Record<string, PolyEvent[]>;
  cached_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

const BINARY = new Set(["yes", "no", "sim", "não", "nao"]);

function parseJsonField(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

function labelFromMarket(m: Record<string, unknown>): string {
  const group = ((m.groupItemTitle as string) || "").trim();
  if (group) return group;
  const outcomes = parseJsonField(m.outcomes);
  for (const o of outcomes) {
    if (!BINARY.has(o.trim().toLowerCase())) return o.trim();
  }
  let q = ((m.question as string) || "").trim().replace(/\?$/, "");
  for (const p of ["Will ", "Does ", "Is ", "Can ", "Has ", "Did ", "Do "]) {
    if (q.startsWith(p)) { q = q.slice(p.length); break; }
  }
  return q.slice(0, 50);
}

function yesPrice(m: Record<string, unknown>): number | null {
  const outcomes = parseJsonField(m.outcomes);
  const prices = parseJsonField(m.outcomePrices);
  if (!outcomes.length || !prices.length) return null;
  const yesIdx = outcomes.findIndex(o => ["yes", "sim"].includes(o.trim().toLowerCase()));
  const idx = yesIdx >= 0 ? yesIdx : 0;
  try {
    const pv = parseFloat(prices[idx]);
    return pv > 0 && pv < 1 ? pv : null;
  } catch {
    return null;
  }
}

// ── Fetch + parse ─────────────────────────────────────────────────────────────

async function fetchEvents(): Promise<PolyEvent[]> {
  const url =
    "https://gamma-api.polymarket.com/events?limit=200&active=true&order=volume_24hr&ascending=false";
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; InvestimentosBot/1.0)" },
    signal: AbortSignal.timeout(12000),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Polymarket API ${res.status}`);
  let data = await res.json();
  if (!Array.isArray(data)) data = data?.data ?? data?.events ?? [];

  const processed: PolyEvent[] = [];

  for (const event of data) {
    try {
      const markets: Record<string, unknown>[] = event.markets ?? [];
      if (!markets.length) continue;

      const totalVolume = markets.reduce((s, m) => s + (parseFloat((m.volume as string) || "0") || 0), 0);

      const odds: PolyOdds[] = [];

      if (markets.length === 1) {
        const m = markets[0];
        const outcomes = parseJsonField(m.outcomes);
        const prices = parseJsonField(m.outcomePrices);
        for (let i = 0; i < outcomes.length; i++) {
          const pv = parseFloat(prices[i]);
          if (pv > 0 && pv < 1) {
            odds.push({ outcome: outcomes[i], price: pv, percent: Math.round(pv * 1000) / 10 });
          }
        }
      } else {
        for (const m of markets) {
          const label = labelFromMarket(m);
          if (!label) continue;
          const pv = yesPrice(m);
          if (pv === null) continue;
          odds.push({ outcome: label, price: pv, percent: Math.round(pv * 1000) / 10 });
        }
      }

      odds.sort((a, b) => b.percent - a.percent);
      if (!odds.length || odds[0].percent >= 99) continue;

      processed.push({
        id: String(event.id ?? ""),
        title: String(event.title ?? "Unknown Event"),
        url: `https://polymarket.com/event/${event.slug ?? ""}`,
        volume: totalVolume,
        end_date: String(event.endDate ?? ""),
        days_left: daysRemaining(String(event.endDate ?? "")),
        odds,
        is_binary: odds.length === 2,
      });
    } catch {
      continue;
    }
  }

  processed.sort((a, b) => b.volume - a.volume);
  return processed;
}

function classify(events: PolyEvent[]): Record<string, PolyEvent[]> {
  const cats: Record<string, PolyEvent[]> = {
    "🏦 Macro & Finanças": [],
    "🌍 Geopolítica": [],
    "🤖 Tech & IA": [],
    "⭐ Em Destaque": [],
  };

  for (const ev of events) {
    const text = ev.title.toLowerCase();
    if (CRYPTO_KW.some(kw => text.includes(kw))) continue;

    if (MACRO_KW.some(kw => text.includes(kw))) cats["🏦 Macro & Finanças"].push(ev);
    else if (GEO_KW.some(kw => text.includes(kw))) cats["🌍 Geopolítica"].push(ev);
    else if (TECH_AI_KW.some(kw => text.includes(kw))) cats["🤖 Tech & IA"].push(ev);
    else cats["⭐ Em Destaque"].push(ev);
  }

  for (const k of Object.keys(cats)) cats[k] = cats[k].slice(0, 12);
  return Object.fromEntries(Object.entries(cats).filter(([, v]) => v.length > 0));
}

// ── Ticker-to-keyword mapping for portfolio correlation ──────────────────────

const TICKER_KEYWORDS: Record<string, string[]> = {
  PETR4: ["petrobras", "petróleo", "oil price", "crude", "opec"],
  VALE3: ["vale", "iron ore", "mining", "minério"],
  ITUB4: ["itaú", "itau", "banking", "brazil bank"],
  BBDC4: ["bradesco", "banking", "brazil bank"],
  BBAS3: ["banco do brasil", "banking", "brazil bank"],
  WEGE3: ["weg", "industrial"],
  RENT3: ["localiza", "rental"],
  ABEV3: ["ambev", "beer", "beverage"],
  B3SA3: ["b3", "stock exchange", "bolsa"],
  ELET3: ["eletrobras", "energy", "electricity"],
  SUZB3: ["suzano", "pulp", "paper"],
  JBSS3: ["jbs", "meat", "beef"],
  MGLU3: ["magazine luiza", "e-commerce"],
  HAPV3: ["hapvida", "health"],
  BBSE3: ["bb seguridade", "insurance"],
  IVVB11: ["s&p 500", "s&p500"],
  BOVA11: ["ibovespa"],
  VOO: ["s&p 500", "s&p500", "vanguard"],
  SPY: ["s&p 500", "s&p500"],
  QQQ: ["nasdaq", "tech"],
  AAPL: ["apple"],
  MSFT: ["microsoft"],
  GOOGL: ["google", "alphabet"],
  AMZN: ["amazon"],
  NVDA: ["nvidia"],
  META: ["meta ", "facebook", "instagram"],
  TSLA: ["tesla", "elon musk"],
  BTC: ["bitcoin", "btc"],
  ETH: ["ethereum"],
  VWRA: ["global equity", "world index"],
  ASML: ["asml", "semiconductor", "chip"],
  DPM: ["diversified royalties"],
};

function correlate(events: PolyEvent[], tickers: string[]): PolyEvent[] {
  const keywords: string[] = [];
  for (const t of tickers) {
    const clean = t.replace(".SA", "").replace(".L", "").replace(".DE", "").replace(".TO", "").replace(".AS", "").toUpperCase();
    const mapped = TICKER_KEYWORDS[clean];
    if (mapped) keywords.push(...mapped);
    else keywords.push(clean.toLowerCase());
  }
  if (!keywords.length) return [];

  const matched: PolyEvent[] = [];
  for (const ev of events) {
    const text = ev.title.toLowerCase();
    if (keywords.some(kw => text.includes(kw))) {
      matched.push(ev);
    }
  }
  return matched.slice(0, 12);
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get("tickers");
    const portfolioTickers = tickersParam ? tickersParam.split(",").filter(Boolean) : [];

    const events = await fetchEvents();
    const categories = classify(events);

    if (portfolioTickers.length > 0) {
      const correlated = correlate(events, portfolioTickers);
      if (correlated.length > 0) {
        categories["📊 Correlatos ao Portfólio"] = correlated;
      }
    }

    return NextResponse.json({
      categories,
      cached_at: new Date().toISOString(),
    } satisfies PolyResponse);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message, categories: {} }, { status: 500 });
  }
}

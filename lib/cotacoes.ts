import { identificarSetor } from "./sectors";

const AWESOME_FX_URL = "https://economia.awesomeapi.com.br/last";
const YAHOO_URL = "https://query1.finance.yahoo.com/v7/finance/quote";

export interface Quote {
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  name: string;
}

export interface FxRates {
  USDBRL: number;
  EURBRL: number;
  GBPBRL: number;
  CADBRL: number;
  [key: string]: number;
}

export interface CotacoesData {
  quotes: Record<string, Quote>;
  fx: FxRates;
  timestamp: string;
}

// Tickers internacionais que precisam de sufixo específico no Yahoo Finance
const INTL_SUFFIX_MAP: Record<string, string> = {
  VWRA: "VWRA.L",
  VWCE: "VWCE.DE",
  DPM: "DPM.TO",
  CSPX: "CSPX.L",
  EIMI: "EIMI.L",
  IWDA: "IWDA.L",
};

export function yahooTicker(ticker: string, moeda: string, corretora: string): string {
  const t = ticker.toUpperCase().trim();
  if (t.includes(".")) return t;

  // Tickers cripto
  if (t === "BTC" || t === "BTC-USD") return "BTC-USD";
  if (t === "ETH" || t === "ETH-USD") return "ETH-USD";

  // Mapeamento explícito de tickers internacionais
  const tClean = t.replace(".SA", "").replace(".L", "");
  if (INTL_SUFFIX_MAP[tClean]) return INTL_SUFFIX_MAP[tClean];

  // Identificar setor para decidir sufixo
  const setor = identificarSetor(t);

  // Ações Brasil, ETF BR, FIIs, BDRs → .SA
  if (["Ações Brasil", "ETF", "FIIs", "BDRs"].includes(setor)) {
    return `${t}.SA`;
  }

  // US stocks, ETF USA, Commodities, Renda Fixa USD → sem sufixo
  return t;
}

export async function fetchFxRates(): Promise<FxRates> {
  const pairs = "USD-BRL,EUR-BRL,GBP-BRL,CAD-BRL";
  const res = await fetch(`${AWESOME_FX_URL}/${pairs}`, { next: { revalidate: 900 } });

  const defaults: FxRates = { USDBRL: 5.0, EURBRL: 5.5, GBPBRL: 6.3, CADBRL: 3.6 };
  if (!res.ok) return defaults;

  const data = await res.json();
  return {
    USDBRL: parseFloat(data.USDBRL?.bid) || defaults.USDBRL,
    EURBRL: parseFloat(data.EURBRL?.bid) || defaults.EURBRL,
    GBPBRL: parseFloat(data.GBPBRL?.bid) || defaults.GBPBRL,
    CADBRL: parseFloat(data.CADBRL?.bid) || defaults.CADBRL,
  };
}

export async function fetchQuotesYahoo(yahooTickers: string[]): Promise<Record<string, Quote>> {
  if (yahooTickers.length === 0) return {};

  const symbols = yahooTickers.join(",");
  const url = `${YAHOO_URL}?symbols=${encodeURIComponent(symbols)}`;

  const res = await fetch(url, {
    next: { revalidate: 900 },
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!res.ok) return {};

  const data = await res.json();
  const results: Record<string, Quote> = {};

  for (const item of data.quoteResponse?.result ?? []) {
    if (item.symbol && item.regularMarketPrice != null) {
      results[item.symbol] = {
        price: item.regularMarketPrice,
        change: item.regularMarketChange ?? 0,
        changePercent: item.regularMarketChangePercent ?? 0,
        currency: item.currency ?? "USD",
        name: item.shortName ?? item.longName ?? item.symbol,
      };
    }
  }

  return results;
}

export function fxToBRL(currency: string, fx: FxRates): number {
  const cur = (currency || "BRL").toUpperCase();
  if (cur === "BRL") return 1;
  if (cur === "USD") return fx.USDBRL;
  if (cur === "EUR") return fx.EURBRL;
  if (cur === "GBP") return fx.GBPBRL;
  if (cur === "CAD") return fx.CADBRL;
  const key = `${cur}BRL`;
  return fx[key] ?? 1;
}

export async function fetchCotacoes(
  tickers: { ticker: string; moeda: string; corretora: string }[]
): Promise<CotacoesData> {
  const yahooMap = new Map<string, string>();
  for (const t of tickers) {
    const yt = yahooTicker(t.ticker, t.moeda, t.corretora);
    yahooMap.set(t.ticker, yt);
  }

  const uniqueYahoo = [...new Set(yahooMap.values())];

  const [yahooQuotes, fx] = await Promise.all([
    fetchQuotesYahoo(uniqueYahoo).catch(() => ({} as Record<string, Quote>)),
    fetchFxRates().catch(() => ({ USDBRL: 5.0, EURBRL: 5.5, GBPBRL: 6.3, CADBRL: 3.6 } as FxRates)),
  ]);

  const quotes: Record<string, Quote> = {};
  for (const [originalTicker, yahooTck] of yahooMap) {
    if (yahooQuotes[yahooTck]) {
      quotes[originalTicker] = yahooQuotes[yahooTck];
    }
  }

  return { quotes, fx, timestamp: new Date().toISOString() };
}

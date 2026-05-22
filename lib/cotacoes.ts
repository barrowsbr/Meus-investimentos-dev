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

const INTL_SUFFIX_MAP: Record<string, string> = {
  VWRA: "VWRA.L",
  VWCE: "VWCE.DE",
  DPM: "DPM.TO",
  CSPX: "CSPX.L",
  EIMI: "EIMI.L",
  IWDA: "IWDA.L",
};

export function yahooTicker(ticker: string, moeda: string, corretora: string): string {
  if (ticker.includes(".")) return ticker;

  const upperCorretora = corretora.toUpperCase();
  if (upperCorretora.includes("B3") || (moeda === "BRL" && !upperCorretora.includes("IBKR"))) {
    return `${ticker}.SA`;
  }

  if (INTL_SUFFIX_MAP[ticker]) return INTL_SUFFIX_MAP[ticker];

  return ticker;
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
  const cur = currency.toUpperCase();
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

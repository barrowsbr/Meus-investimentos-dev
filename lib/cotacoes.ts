import { identificarSetor } from "./sectors";

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
  errors: string[];
}

const DEFAULTS_FX: FxRates = { USDBRL: 5.7, EURBRL: 6.4, GBPBRL: 7.6, CADBRL: 4.1 };

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
  if (t === "BTC" || t === "BTC-USD") return "BTC-USD";
  if (t === "ETH" || t === "ETH-USD") return "ETH-USD";
  const tClean = t.replace(".SA", "").replace(".L", "");
  if (INTL_SUFFIX_MAP[tClean]) return INTL_SUFFIX_MAP[tClean];
  const setor = identificarSetor(t);
  if (["Ações Brasil", "ETF", "FIIs", "BDRs"].includes(setor)) return `${t}.SA`;
  return t;
}

// --- FX via AwesomeAPI ---

async function fetchFxAwesome(): Promise<FxRates> {
  const res = await fetch("https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,GBP-BRL,CAD-BRL", {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`AwesomeAPI HTTP ${res.status}`);
  const data = await res.json();
  return {
    USDBRL: parseFloat(data.USDBRL?.bid) || DEFAULTS_FX.USDBRL,
    EURBRL: parseFloat(data.EURBRL?.bid) || DEFAULTS_FX.EURBRL,
    GBPBRL: parseFloat(data.GBPBRL?.bid) || DEFAULTS_FX.GBPBRL,
    CADBRL: parseFloat(data.CADBRL?.bid) || DEFAULTS_FX.CADBRL,
  };
}

export async function fetchFxRates(): Promise<FxRates> {
  try {
    return await fetchFxAwesome();
  } catch {
    return DEFAULTS_FX;
  }
}

// --- Quotes via yahoo-finance2 ---

async function fetchQuotesYF2(yahooTickers: string[]): Promise<Record<string, Quote>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const yahooFinance: any = (await import("yahoo-finance2")).default;

  const results: Record<string, Quote> = {};
  const batchSize = 5;

  for (let i = 0; i < yahooTickers.length; i += batchSize) {
    const batch = yahooTickers.slice(i, i + batchSize);
    const promises = batch.map(async (ticker: string) => {
      try {
        const q = await yahooFinance.quote(ticker);
        if (q && q.regularMarketPrice != null) {
          results[q.symbol ?? ticker] = {
            price: q.regularMarketPrice,
            change: q.regularMarketChange ?? 0,
            changePercent: q.regularMarketChangePercent ?? 0,
            currency: q.currency ?? "USD",
            name: q.shortName ?? q.longName ?? ticker,
          };
        }
      } catch {
        // skip failed ticker
      }
    });
    await Promise.all(promises);
  }

  return results;
}

// --- Fallback: direct Yahoo v8 chart API ---

async function fetchQuotesV8(yahooTickers: string[]): Promise<Record<string, Quote>> {
  const results: Record<string, Quote> = {};

  const promises = yahooTickers.map(async (ticker) => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;
      const data = await res.json();
      const meta = data.chart?.result?.[0]?.meta;
      if (meta?.regularMarketPrice) {
        results[meta.symbol ?? ticker] = {
          price: meta.regularMarketPrice,
          change: (meta.regularMarketPrice - (meta.previousClose ?? meta.regularMarketPrice)),
          changePercent: meta.previousClose
            ? ((meta.regularMarketPrice / meta.previousClose - 1) * 100)
            : 0,
          currency: meta.currency ?? "USD",
          name: ticker,
        };
      }
    } catch {
      // skip
    }
  });

  await Promise.all(promises);
  return results;
}

// --- Main fetch with fallbacks ---

export async function fetchQuotes(yahooTickers: string[]): Promise<{ quotes: Record<string, Quote>; source: string }> {
  if (yahooTickers.length === 0) return { quotes: {}, source: "empty" };

  // Try yahoo-finance2 first
  try {
    const quotes = await fetchQuotesYF2(yahooTickers);
    if (Object.keys(quotes).length > 0) return { quotes, source: "yahoo-finance2" };
  } catch {
    // fall through
  }

  // Fallback: direct Yahoo v8 API
  try {
    const quotes = await fetchQuotesV8(yahooTickers);
    if (Object.keys(quotes).length > 0) return { quotes, source: "yahoo-v8" };
  } catch {
    // fall through
  }

  return { quotes: {}, source: "none" };
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
  const errors: string[] = [];

  const yahooMap = new Map<string, string>();
  for (const t of tickers) {
    const yt = yahooTicker(t.ticker, t.moeda, t.corretora);
    yahooMap.set(t.ticker, yt);
  }
  const uniqueYahoo = [...new Set(yahooMap.values())];

  let fx: FxRates;
  try {
    fx = await fetchFxRates();
  } catch (e) {
    errors.push(`FX error: ${e instanceof Error ? e.message : String(e)}`);
    fx = DEFAULTS_FX;
  }

  let quoteResult: { quotes: Record<string, Quote>; source: string };
  try {
    quoteResult = await fetchQuotes(uniqueYahoo);
    if (quoteResult.source === "none") {
      errors.push("Nenhuma fonte de cotações respondeu");
    }
  } catch (e) {
    errors.push(`Quotes error: ${e instanceof Error ? e.message : String(e)}`);
    quoteResult = { quotes: {}, source: "error" };
  }

  const quotes: Record<string, Quote> = {};
  for (const [originalTicker, yahooTck] of yahooMap) {
    if (quoteResult.quotes[yahooTck]) {
      quotes[originalTicker] = quoteResult.quotes[yahooTck];
    }
  }

  return {
    quotes,
    fx,
    timestamp: new Date().toISOString(),
    errors,
  };
}

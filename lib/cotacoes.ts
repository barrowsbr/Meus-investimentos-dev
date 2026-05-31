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
  fxSource: string;
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
  ASML: "ASML.AS",
};

// Map tickers to their actual currencies (overrides API detection if needed)
const TICKER_CURRENCY_OVERRIDE: Record<string, string> = {
  "VWRA.L": "USD",      // LSE but priced in USD
  "CSPX.L": "GBP",      // LSE in GBP
  "EIMI.L": "GBP",      // LSE in GBP
  "IWDA.L": "USD",      // LSE but priced in USD
  "VWCE.DE": "EUR",     // Xetra/Frankfurt in EUR
  "ASML.AS": "EUR",     // Amsterdam exchange in EUR
  "DPM.TO": "CAD",      // Toronto exchange in CAD
};

export function yahooTicker(ticker: string, _moeda: string, _corretora: string): string {
  const t = ticker.toUpperCase().trim();
  if (t.includes(".")) return t;
  if (t === "BTC" || t === "BTC-USD") return "BTC-USD";
  if (t === "ETH" || t === "ETH-USD") return "ETH-USD";
  const tClean = t.replace(".SA", "").replace(".L", "").replace(".AS", "").replace(".DE", "").replace(".TO", "");
  if (INTL_SUFFIX_MAP[tClean]) return INTL_SUFFIX_MAP[tClean];
  const setor = identificarSetor(t);
  if (["Ações Brasil", "ETF", "FIIs", "BDRs"].includes(setor)) return `${t}.SA`;
  return t;
}

// --- FX rate sources with proper fallback chain ---

const FX_SYMBOL_MAP: Record<string, keyof FxRates> = {
  "BRL=X": "USDBRL",
  "USDBRL=X": "USDBRL",
  "EURBRL=X": "EURBRL",
  "CADBRL=X": "CADBRL",
  "GBPBRL=X": "GBPBRL",
};

async function fetchFxYahoo(): Promise<FxRates> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const yahooFinance: any = (await import("yahoo-finance2")).default;

  const fxTickers = ["BRL=X", "EURBRL=X", "CADBRL=X", "GBPBRL=X"];
  const fx = { ...DEFAULTS_FX };
  let updated = 0;

  const results = await Promise.all(
    fxTickers.map((t) => yahooFinance.quote(t).catch(() => null))
  );

  for (const q of results) {
    if (!q?.symbol || q.regularMarketPrice == null) continue;
    const key = FX_SYMBOL_MAP[q.symbol];
    if (key) {
      fx[key] = q.regularMarketPrice;
      updated++;
    }
  }

  if (updated === 0) throw new Error("Yahoo FX: no rates returned");
  return fx;
}

async function fetchFxAwesome(): Promise<FxRates> {
  const res = await fetch("https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,GBP-BRL,CAD-BRL");
  if (!res.ok) throw new Error(`AwesomeAPI HTTP ${res.status}`);
  const data = await res.json();
  const fx: FxRates = {
    USDBRL: parseFloat(data.USDBRL?.bid) || 0,
    EURBRL: parseFloat(data.EURBRL?.bid) || 0,
    GBPBRL: parseFloat(data.GBPBRL?.bid) || 0,
    CADBRL: parseFloat(data.CADBRL?.bid) || 0,
  };
  if (fx.USDBRL === 0) throw new Error("AwesomeAPI: no USDBRL rate");
  return fx;
}

async function fetchFxOpenExchangeRate(): Promise<FxRates> {
  const res = await fetch("https://open.er-api.com/v6/latest/BRL");
  if (!res.ok) throw new Error(`ExchangeRate-API HTTP ${res.status}`);
  const data = await res.json();
  const r = data.rates;
  if (!r?.USD) throw new Error("ExchangeRate-API: no USD rate");
  return {
    USDBRL: 1 / r.USD,
    EURBRL: 1 / r.EUR,
    GBPBRL: 1 / r.GBP,
    CADBRL: 1 / r.CAD,
  };
}

export async function fetchFxRates(): Promise<{ fx: FxRates; fxSource: string }> {
  const sources: [string, () => Promise<FxRates>][] = [
    ["yahoo", fetchFxYahoo],
    ["awesomeapi", fetchFxAwesome],
    ["exchangerate-api", fetchFxOpenExchangeRate],
  ];

  for (const [name, fn] of sources) {
    try {
      const fx = await fn();
      return { fx, fxSource: name };
    } catch {
      // try next source
    }
  }

  return { fx: DEFAULTS_FX, fxSource: "defaults" };
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
          const price = q.regularMarketPrice;
          const prevClose = q.regularMarketPreviousClose ?? q.previousClose ?? q.chartPreviousClose;

          let change = q.regularMarketChange;
          let changePct = q.regularMarketChangePercent;

          if ((change == null || change === 0) && prevClose && prevClose > 0) {
            change = price - prevClose;
            changePct = ((price / prevClose) - 1) * 100;
          }

          // Store under the requested ticker to guarantee lookup consistency
          results[ticker] = {
            price,
            change: change ?? 0,
            changePercent: changePct ?? 0,
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
      });
      if (!res.ok) return;
      const data = await res.json();
      const meta = data.chart?.result?.[0]?.meta;
      if (meta?.regularMarketPrice) {
        const price = meta.regularMarketPrice;
        const prevClose = meta.previousClose ?? meta.chartPreviousClose;
        results[ticker] = {
          price,
          change: prevClose ? price - prevClose : 0,
          changePercent: prevClose ? ((price / prevClose) - 1) * 100 : 0,
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
  let fxSource = "defaults";
  try {
    const fxResult = await fetchFxRates();
    fx = fxResult.fx;
    fxSource = fxResult.fxSource;
    if (fxSource === "defaults") {
      errors.push("FX: todas as fontes falharam, usando valores padrão");
    }
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
      const quote = quoteResult.quotes[yahooTck];
      // Apply currency override if it exists
      if (TICKER_CURRENCY_OVERRIDE[yahooTck]) {
        quote.currency = TICKER_CURRENCY_OVERRIDE[yahooTck];
      }
      quotes[originalTicker] = quote;
    }
  }

  return {
    quotes,
    fx,
    fxSource,
    timestamp: new Date().toISOString(),
    errors,
  };
}

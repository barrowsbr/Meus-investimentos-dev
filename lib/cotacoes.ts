import { yahooTicker } from "./yahoo-symbol";

// Re-exporta a conversão canônica ticker→Yahoo (movida para yahoo-symbol.ts,
// client-safe). Mantém a FONTE ÚNICA e os imports existentes `from "@/lib/cotacoes"`.
export { yahooTicker };

export type MarketSession = "REGULAR" | "PRE" | "PREPRE" | "POST" | "POSTPOST" | "CLOSED";

export interface Quote {
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  name: string;
  marketState?: MarketSession;
  regularPrice?: number;
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
  const YF: any = (await import("yahoo-finance2")).default;
  const yahooFinance = typeof YF === "function" ? new YF() : YF;

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
  const YF: any = (await import("yahoo-finance2")).default;
  const yahooFinance = typeof YF === "function" ? new YF() : YF;

  const results: Record<string, Quote> = {};
  const batchSize = 5;

  for (let i = 0; i < yahooTickers.length; i += batchSize) {
    const batch = yahooTickers.slice(i, i + batchSize);
    const promises = batch.map(async (ticker: string) => {
      try {
        const q = await yahooFinance.quote(ticker);
        if (q && q.regularMarketPrice != null) {
          const regPrice = q.regularMarketPrice;
          const prevClose = q.regularMarketPreviousClose ?? q.previousClose ?? q.chartPreviousClose;
          const state = (q.marketState ?? "REGULAR") as MarketSession;

          let price = regPrice;
          let change = q.regularMarketChange;
          let changePct = q.regularMarketChangePercent;

          if ((state === "PRE" || state === "PREPRE") && q.preMarketPrice > 0 && prevClose > 0) {
            price = q.preMarketPrice;
            change = q.preMarketChange ?? (price - prevClose);
            changePct = q.preMarketChangePercent ?? ((price / prevClose - 1) * 100);
          } else if ((state === "POST" || state === "POSTPOST") && q.postMarketPrice > 0 && prevClose > 0) {
            price = q.postMarketPrice;
            change = price - prevClose;
            changePct = (price / prevClose - 1) * 100;
          }

          if ((change == null || change === 0) && prevClose && prevClose > 0) {
            change = price - prevClose;
            changePct = ((price / prevClose) - 1) * 100;
          }

          results[ticker] = {
            price,
            change: change ?? 0,
            changePercent: changePct ?? 0,
            currency: q.currency ?? "USD",
            name: q.shortName ?? q.longName ?? ticker,
            marketState: state,
            regularPrice: state !== "REGULAR" ? regPrice : undefined,
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

  // User-Agent de browser real + fallback query1→query2: a mesma receita do
  // fetch de histórico (que funciona). Um User-Agent minguado ("Mozilla/5.0")
  // é rejeitado pelo Yahoo com mais frequência — por isso o fallback às vezes
  // também vinha vazio e o ticker ficava sem preço à vista.
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  async function fetchOne(ticker: string): Promise<Quote | null> {
    for (const host of ["query1", "query2"]) {
      try {
        const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
        const res = await fetch(url, {
          headers: { "User-Agent": UA, Accept: "application/json, */*", "Accept-Language": "en-US,en;q=0.9" },
        });
        if (!res.ok) continue;
        const data = await res.json();
        const meta = data.chart?.result?.[0]?.meta;
        if (meta?.regularMarketPrice) {
          const price = meta.regularMarketPrice;
          const prevClose = meta.previousClose ?? meta.chartPreviousClose;
          return {
            price,
            change: prevClose ? price - prevClose : 0,
            changePercent: prevClose ? ((price / prevClose) - 1) * 100 : 0,
            currency: meta.currency ?? "USD",
            name: ticker,
          };
        }
      } catch {
        // tenta o próximo host
      }
    }
    return null;
  }

  await Promise.all(yahooTickers.map(async (ticker) => {
    const q = await fetchOne(ticker);
    if (q) results[ticker] = q;
  }));
  return results;
}

// --- Main fetch with fallbacks ---

export async function fetchQuotes(yahooTickers: string[]): Promise<{ quotes: Record<string, Quote>; source: string }> {
  if (yahooTickers.length === 0) return { quotes: {}, source: "empty" };

  // Primária: yahoo-finance2 (endpoint `quote`).
  let quotes: Record<string, Quote> = {};
  try {
    quotes = await fetchQuotesYF2(yahooTickers);
  } catch {
    quotes = {};
  }

  // Fallback v8 (chart API) SÓ para os tickers que a primária NÃO trouxe —
  // por-ticker, não tudo-ou-nada. Antes, se o YF2 trouxesse QUALQUER ticker, o
  // fallback nunca rodava; um ativo que o `quote()` do Yahoo falha (ex.: ação
  // B3 quando o "crumb" quebra — ITUB4) ficava sem preço à vista → o motor caía
  // no custo (valor atual = investido, lucro "—"). O v8 nunca sobrescreve um
  // preço que a primária já obteve (só preenche o que faltou).
  const missing = yahooTickers.filter((t) => !quotes[t]);
  const yf2Empty = missing.length === yahooTickers.length;
  let usedV8 = false;
  if (missing.length > 0) {
    try {
      const v8 = await fetchQuotesV8(missing);
      if (Object.keys(v8).length > 0) {
        quotes = { ...quotes, ...v8 };
        usedV8 = true;
      }
    } catch {
      // sem fallback — segue com o que tem
    }
  }

  const source = Object.keys(quotes).length === 0 ? "none"
    : !usedV8 ? "yahoo-finance2"
    : yf2Empty ? "yahoo-v8"
    : "yahoo-finance2+v8";

  return { quotes, source };
}

// --- Historical series via Yahoo v8 chart API (with query1/query2 fallback) ---

export interface HistoryPoint {
  date: string;
  close: number;
}

async function fetchHistoryHost(
  ticker: string,
  range: string,
  interval: string,
  host: string
): Promise<HistoryPoint[]> {
  const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`v8/${host} HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`v8/${host} no result`);

  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] =
    result.indicators?.quote?.[0]?.close ??
    result.indicators?.adjclose?.[0]?.adjclose ??
    [];

  const points: HistoryPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c == null || !isFinite(c)) continue;
    points.push({
      date: new Date(timestamps[i] * 1000).toISOString().split("T")[0],
      close: c,
    });
  }
  return points;
}

export async function fetchHistory(
  ticker: string,
  range = "1y",
  interval = "1d"
): Promise<HistoryPoint[]> {
  for (const host of ["query1", "query2"]) {
    try {
      const rows = await fetchHistoryHost(ticker, range, interval, host);
      if (rows.length > 0) return rows;
    } catch {
      // try next host
    }
  }
  return [];
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

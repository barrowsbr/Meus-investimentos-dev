// eslint-disable-next-line @typescript-eslint/no-require-imports
const yahooFinance = require("yahoo-finance2").default;
import { identificarSetor } from "./sectors";

const AWESOME_FX_URL = "https://economia.awesomeapi.com.br/last";

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
  if (["Ações Brasil", "ETF", "FIIs", "BDRs"].includes(setor)) {
    return `${t}.SA`;
  }

  return t;
}

// --- FX via Yahoo Finance (primary) + AwesomeAPI (fallback) ---

interface YQuote {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  currency?: string;
  shortName?: string;
  longName?: string;
}

async function fetchFxYahoo(): Promise<FxRates> {
  const fxTickers = ["BRL=X", "EURBRL=X", "CADBRL=X", "GBPBRL=X"];
  const raw = await Promise.all(fxTickers.map((t) => yahooFinance.quote(t).catch(() => null)));

  const fx = { ...DEFAULTS_FX };
  for (const q of raw as YQuote[]) {
    if (!q?.symbol || q.regularMarketPrice == null) continue;
    const p = q.regularMarketPrice;
    if (q.symbol === "BRL=X") fx.USDBRL = p;
    if (q.symbol === "EURBRL=X") fx.EURBRL = p;
    if (q.symbol === "CADBRL=X") fx.CADBRL = p;
    if (q.symbol === "GBPBRL=X") fx.GBPBRL = p;
  }
  return fx;
}

async function fetchFxAwesome(): Promise<FxRates> {
  const res = await fetch(`${AWESOME_FX_URL}/USD-BRL,EUR-BRL,GBP-BRL,CAD-BRL`);
  if (!res.ok) return DEFAULTS_FX;
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
    return await fetchFxYahoo();
  } catch {
    try {
      return await fetchFxAwesome();
    } catch {
      return DEFAULTS_FX;
    }
  }
}

// --- Stock quotes via yahoo-finance2 ---

export async function fetchQuotes(yahooTickers: string[]): Promise<Record<string, Quote>> {
  if (yahooTickers.length === 0) return {};

  const results: Record<string, Quote> = {};

  try {
    const raw = await Promise.all(
      yahooTickers.map((t) => yahooFinance.quote(t).catch(() => null))
    );

    for (const q of raw as YQuote[]) {
      if (!q?.symbol || q.regularMarketPrice == null) continue;
      results[q.symbol] = {
        price: q.regularMarketPrice,
        change: q.regularMarketChange ?? 0,
        changePercent: q.regularMarketChangePercent ?? 0,
        currency: q.currency ?? "USD",
        name: q.shortName ?? q.longName ?? q.symbol,
      };
    }
  } catch (e) {
    console.error("Yahoo Finance quote error:", e);
  }

  return results;
}

// --- Conversion helper ---

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

// --- Main fetch ---

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
    fetchQuotes(uniqueYahoo).catch(() => ({} as Record<string, Quote>)),
    fetchFxRates(),
  ]);

  const quotes: Record<string, Quote> = {};
  for (const [originalTicker, yahooTck] of yahooMap) {
    if (yahooQuotes[yahooTck]) {
      quotes[originalTicker] = yahooQuotes[yahooTck];
    }
  }

  return { quotes, fx, timestamp: new Date().toISOString() };
}

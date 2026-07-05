/**
 * Asset Metadata Registry — fonte única de metadados de ativos.
 *
 * Quando um ativo novo entra no sistema (import IBKR, manual, etc.), este módulo
 * consulta o Yahoo Finance API para resolver exchange, moeda, setor, industry e
 * nome. O resultado é cacheado em memória e persistido na aba `ativos_meta` da
 * planilha para reuso entre requests/deploys.
 *
 * Isso elimina os mapas hardcoded (INTL_SUFFIX_MAP, TICKER_CURRENCY_OVERRIDE,
 * EXCHANGE_SUFFIX_CURRENCY) como fonte primária — eles viram fallback para cold
 * start quando a aba ainda não existe.
 *
 * IMPORTANTE: a interface AssetMeta e o cache sync (getAssetMeta) vivem em
 * asset-meta-cache.ts — módulo sem imports server-only, seguro para client
 * bundles. Este módulo (asset-meta.ts) adiciona lógica server-only (Yahoo API,
 * Google Sheets) e re-exporta o que os consumers precisam.
 */

import { getDataStore } from "./data-store";
import { translateYahooSector } from "./gics-sectors";
import {
  type AssetMeta,
  cacheKey,
  EXCHANGE_SUFFIX_RE,
  getAssetMeta,
  setAssetMeta,
  getMetaCacheSize,
  getAllCachedMeta,
} from "./asset-meta-cache";

// Re-export for consumers that already import from asset-meta
export { type AssetMeta, getAssetMeta, getMetaCacheSize, getAllCachedMeta };

// ── Sheet persistence ─────────────────────────────────────────────────────────

let _cacheLoaded = false;
let _cacheLoadPromise: Promise<void> | null = null;

const META_TAB = "ativos_meta";
const META_HEADERS = [
  "ticker", "yahoo_symbol", "exchange", "currency",
  "quote_type", "sector", "industry", "long_name", "last_updated",
];

// ── Load from Google Sheets (call once, idempotent) ────────────────────────────

export async function loadAssetMetaCache(): Promise<void> {
  if (_cacheLoaded) return;
  if (_cacheLoadPromise) return _cacheLoadPromise;

  _cacheLoadPromise = (async () => {
    try {
      const store = getDataStore();
      const rows = await store.fetchTab(META_TAB);
      for (const row of rows) {
        const ticker = String(row["ticker"] ?? "").trim();
        if (!ticker) continue;
        const meta: AssetMeta = {
          ticker,
          yahooSymbol: String(row["yahoo_symbol"] ?? "").trim(),
          exchange: String(row["exchange"] ?? "").trim(),
          currency: String(row["currency"] ?? "").trim().toUpperCase(),
          quoteType: String(row["quote_type"] ?? "").trim(),
          sector: String(row["sector"] ?? "").trim(),
          industry: String(row["industry"] ?? "").trim(),
          longName: String(row["long_name"] ?? "").trim(),
          lastUpdated: String(row["last_updated"] ?? "").trim(),
        };
        if (meta.yahooSymbol) {
          setAssetMeta(cacheKey(ticker), meta);
        }
      }
      _cacheLoaded = true;
    } catch {
      // Tab doesn't exist yet or network error — allow retry on next call
    }
    _cacheLoadPromise = null;
  })();

  return _cacheLoadPromise;
}

// ── Resolve via Yahoo Finance API ──────────────────────────────────────────────

export async function resolveAssetMeta(
  rawTicker: string,
  hints?: { moeda?: string; corretora?: string },
): Promise<AssetMeta | null> {
  const key = cacheKey(rawTicker);
  const cached = getAssetMeta(rawTicker);
  if (cached) return cached;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const YF: any = (await import("yahoo-finance2")).default;
  const yf = typeof YF === "function" ? new YF() : YF;

  let yahooSymbol = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let quoteData: any = null;

  // If ticker already has an exchange suffix, try it directly first
  if (rawTicker.includes(".")) {
    try {
      quoteData = await yf.quote(rawTicker.toUpperCase());
      if (quoteData?.regularMarketPrice != null) {
        yahooSymbol = rawTicker.toUpperCase();
      }
    } catch { /* fall through to search */ }
  }

  // Search Yahoo to find the best match
  if (!yahooSymbol) {
    try {
      const searchResult = await yf.search(
        rawTicker.replace(EXCHANGE_SUFFIX_RE, ""),
        { quotesCount: 8, newsCount: 0 },
        { validateResult: false },
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const candidates: any[] = (searchResult?.quotes ?? []).filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (q: any) => q?.symbol && q?.quoteType &&
          ["EQUITY", "ETF", "MUTUALFUND"].includes(q.quoteType),
      );

      if (candidates.length > 0) {
        const best = pickBestMatch(candidates, rawTicker, hints);
        yahooSymbol = best.symbol;

        // Fetch quote data for the best match
        try {
          quoteData = await yf.quote(yahooSymbol);
        } catch { /* continue without quote data */ }
      }
    } catch { /* search failed */ }
  }

  // Fallback: if Yahoo API is unavailable but the ticker has a valid exchange
  // suffix (e.g. VOW3.DE) or we have a currency hint, infer metadata from that.
  if (!yahooSymbol) {
    const upper = rawTicker.toUpperCase().trim();
    const suffixMatch = upper.match(/\.([A-Z]{1,2})$/);
    const suffix = suffixMatch?.[1];
    const suffixCurrency = suffix ? SUFFIX_CCY_MAP[suffix] : undefined;

    if (suffix && suffixCurrency) {
      const fallbackMeta: AssetMeta = {
        ticker: key,
        yahooSymbol: upper,
        exchange: suffix,
        currency: suffixCurrency,
        quoteType: "EQUITY",
        sector: "",
        industry: "",
        longName: key,
        lastUpdated: new Date().toISOString().split("T")[0],
      };
      setAssetMeta(key, fallbackMeta);
      return fallbackMeta;
    }

    return null;
  }

  // Fetch sector/industry from quoteSummary
  let sector = "";
  let industry = "";
  let longName = quoteData?.longName ?? quoteData?.shortName ?? rawTicker;

  try {
    const summary = await yf.quoteSummary(yahooSymbol, {
      modules: ["assetProfile", "price"],
    });
    const profile = summary?.assetProfile;
    const price = summary?.price;
    if (profile?.sector) sector = translateYahooSector(profile.sector);
    if (profile?.industry) industry = profile.industry;
    if (price?.longName) longName = price.longName;
    else if (price?.shortName) longName = price.shortName;
  } catch { /* skip — sector will remain empty */ }

  const meta: AssetMeta = {
    ticker: key,
    yahooSymbol,
    exchange: quoteData?.fullExchangeName ?? quoteData?.exchange ?? "",
    currency: quoteData?.currency ?? hints?.moeda ?? "USD",
    quoteType: quoteData?.quoteType ?? "EQUITY",
    sector,
    industry,
    longName,
    lastUpdated: new Date().toISOString().split("T")[0],
  };

  setAssetMeta(key, meta);
  return meta;
}

// Pick best search result based on hints (currency, corretora)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickBestMatch(candidates: any[], rawTicker: string, hints?: { moeda?: string; corretora?: string }): any {
  const clean = rawTicker.toUpperCase().replace(EXCHANGE_SUFFIX_RE, "");

  // Score each candidate
  const scored = candidates.map(c => {
    let score = 0;
    const sym = (c.symbol ?? "").toUpperCase();
    const symClean = sym.replace(EXCHANGE_SUFFIX_RE, "");

    // Exact ticker match (most important)
    if (symClean === clean) score += 100;
    else if (symClean.startsWith(clean)) score += 50;

    // Currency hint match
    if (hints?.moeda) {
      const suffixCcy = guessCurrencyFromSuffix(sym);
      if (suffixCcy === hints.moeda.toUpperCase()) score += 30;
    }

    // Corretora hint: B3 → prefer .SA, IBKR → prefer non-.SA
    if (hints?.corretora) {
      const isB3 = hints.corretora.toUpperCase().includes("B3");
      if (isB3 && sym.endsWith(".SA")) score += 20;
      if (!isB3 && !sym.endsWith(".SA")) score += 20;
    }

    // Prefer EQUITY over other types
    if (c.quoteType === "EQUITY") score += 10;

    return { candidate: c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].candidate;
}

const SUFFIX_CCY_MAP: Record<string, string> = {
  SA: "BRL", DE: "EUR", AS: "EUR", PA: "EUR", MI: "EUR", MC: "EUR", LS: "EUR",
  TO: "CAD", V: "CAD", L: "GBP", T: "JPY", HK: "HKD", AX: "AUD",
  SW: "CHF", KS: "KRW", NS: "INR", SI: "SGD", TW: "TWD",
};

function guessCurrencyFromSuffix(symbol: string): string {
  const m = symbol.match(/\.([A-Z]+)$/);
  if (m && SUFFIX_CCY_MAP[m[1]]) return SUFFIX_CCY_MAP[m[1]];
  return "USD";
}

// ── Grafia canônica da planilha (garantia Yahoo) ───────────────────────────────
// Regra do dono: TUDO que entra em meus_ativos/meus_proventos precisa estar na
// grafia EXATA que o Yahoo resolve — inclusive a B3 com .SA (CMIG4.SA, VALE3.SA),
// internacionais com o sufixo da bolsa (DPM.TO, VOW3.DE) e EUA sem sufixo (AAPL).

// IBKR listingExchange → sufixo Yahoo (bolsas mais comuns; EUA = sem sufixo).
const IBKR_EXCHANGE_SUFFIX: Record<string, string> = {
  NYSE: "", NASDAQ: "", ISLAND: "", ARCA: "", AMEX: "", BATS: "", IEX: "", PINK: "",
  TSE: ".TO", TSX: ".TO", VENTURE: ".V", TSXV: ".V",
  AEB: ".AS",                                   // Euronext Amsterdam
  IBIS: ".DE", IBIS2: ".DE", FWB: ".DE", FWB2: ".DE", XETRA: ".DE", SWB: ".DE",
  LSE: ".L", LSEETF: ".L", LSEIOB1: ".L",
  SBF: ".PA",                                   // Euronext Paris
  BVME: ".MI", BVMEETF: ".MI",                  // Borsa Italiana
  BM: ".MC",                                    // Bolsa de Madrid
  EBS: ".SW", VIRTX: ".SW",                     // SIX Swiss
  SFB: ".ST", CPH: ".CO", OSE: ".OL", HEX: ".HE",
  ASX: ".AX", SEHK: ".HK", TSEJ: ".T", SGX: ".SI",
  BOVESPA: ".SA", BVMF: ".SA",
};

/** Candidato Yahoo determinístico a partir da bolsa de listagem (IBKR Flex). */
export function yahooCandidateFromExchange(ticker: string, listingExchange?: string): string | null {
  if (!listingExchange) return null;
  const suffix = IBKR_EXCHANGE_SUFFIX[listingExchange.toUpperCase().trim()];
  if (suffix === undefined) return null;
  const base = ticker.toUpperCase().trim();
  if (!base || base.includes(".")) return base || null; // já tem sufixo → mantém
  return suffix ? `${base}${suffix}` : base;
}

/** Grafia canônica gravada na PLANILHA: o símbolo Yahoo completo (COM .SA). */
export function sheetTickerFromMeta(meta: AssetMeta): string {
  return meta.yahooSymbol.toUpperCase().trim();
}

/**
 * Resolve a grafia Yahoo de cada ticker ANTES da escrita na planilha.
 * Retorna só os que precisam mudar (renames) + os metadados p/ persistir em
 * ativos_meta. Yahoo fora do ar NUNCA bloqueia o sync — o ticker original segue.
 */
export async function canonicalizeTickersForSheet(
  items: { ticker: string; moeda?: string; corretora?: string; exchange?: string }[],
): Promise<{ renames: Map<string, string>; metas: AssetMeta[] }> {
  await loadAssetMetaCache();
  const renames = new Map<string, string>();
  const metas: AssetMeta[] = [];
  const seen = new Set<string>();
  const uniq = items.filter(i => {
    const k = (i.ticker ?? "").toUpperCase().trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const BATCH = 4;
  for (let i = 0; i < uniq.length; i += BATCH) {
    await Promise.all(uniq.slice(i, i + BATCH).map(async (it) => {
      try {
        // 1) Pista determinística: bolsa de listagem → candidato com sufixo,
        //    validado direto no Yahoo (quote).
        const candidate = yahooCandidateFromExchange(it.ticker, it.exchange);
        let meta: AssetMeta | null = null;
        if (candidate && candidate !== it.ticker.toUpperCase().trim()) {
          meta = await resolveAssetMeta(candidate, { moeda: it.moeda, corretora: it.corretora });
        }
        // 2) Caminho normal: cache → quote direto → busca com hints.
        if (!meta?.yahooSymbol) {
          meta = await resolveAssetMeta(it.ticker, { moeda: it.moeda, corretora: it.corretora });
        }
        if (!meta?.yahooSymbol) return;
        metas.push(meta);
        const sheetTk = sheetTickerFromMeta(meta);
        if (sheetTk && sheetTk !== it.ticker.toUpperCase().trim()) {
          renames.set(it.ticker, sheetTk);
        }
      } catch { /* best-effort */ }
    }));
  }
  return { renames, metas };
}

// ── Batch resolve (for import previews) ────────────────────────────────────────

export async function resolveMultipleAssets(
  tickers: { ticker: string; moeda?: string; corretora?: string }[],
): Promise<Map<string, AssetMeta>> {
  // Load cache from sheet first
  await loadAssetMetaCache();

  const results = new Map<string, AssetMeta>();
  const toResolve: typeof tickers = [];

  // Check cache first
  for (const t of tickers) {
    const cached = getAssetMeta(t.ticker);
    if (cached) {
      results.set(t.ticker, cached);
    } else {
      toResolve.push(t);
    }
  }

  // Resolve uncached tickers in batches (avoid Yahoo rate limits)
  const BATCH = 4;
  for (let i = 0; i < toResolve.length; i += BATCH) {
    const batch = toResolve.slice(i, i + BATCH);
    const promises = batch.map(async (t) => {
      const meta = await resolveAssetMeta(t.ticker, { moeda: t.moeda, corretora: t.corretora });
      if (meta) results.set(t.ticker, meta);
    });
    await Promise.all(promises);
  }

  return results;
}

// ── Persist to Google Sheets ───────────────────────────────────────────────────

export async function persistAssetMeta(meta: AssetMeta | AssetMeta[]): Promise<void> {
  const items = Array.isArray(meta) ? meta : [meta];
  if (items.length === 0) return;

  // Update in-memory cache
  for (const m of items) {
    setAssetMeta(cacheKey(m.ticker), m);
  }

  try {
    const store = getDataStore();

    // Ensure tab exists with correct headers
    await store.ensureTab(META_TAB, META_HEADERS);

    // Read existing data to merge (upsert by ticker)
    const existing = await store.fetchTab(META_TAB).catch(() => []);
    const existingMap = new Map<string, Record<string, unknown>>();
    for (const row of existing) {
      const tk = String(row["ticker"] ?? "").trim();
      if (tk) existingMap.set(tk, row);
    }

    // Merge new items
    for (const m of items) {
      existingMap.set(m.ticker, {
        ticker: m.ticker,
        yahoo_symbol: m.yahooSymbol,
        exchange: m.exchange,
        currency: m.currency,
        quote_type: m.quoteType,
        sector: m.sector,
        industry: m.industry,
        long_name: m.longName,
        last_updated: m.lastUpdated,
      });
    }

    // Write back full tab
    const rows = [...existingMap.values()].map(row =>
      META_HEADERS.map(h => String(row[h] ?? "")),
    );

    await store.writeTab(META_TAB, META_HEADERS, rows);
  } catch {
    // Sheet write failed (no credentials or other issue) — cache is still updated
  }
}

/**
 * Shared in-memory asset metadata cache.
 *
 * This module is intentionally free of server-only imports (no data-store,
 * no gsheets, no next/headers) so it can be safely imported by client-bundled
 * modules like sectors.ts and cotacoes.ts.
 *
 * asset-meta.ts populates this cache; consumers read it via getAssetMeta().
 */

export interface AssetMeta {
  ticker: string;
  yahooSymbol: string;
  exchange: string;
  currency: string;
  quoteType: string;
  sector: string;
  industry: string;
  longName: string;
  lastUpdated: string;
}

const EXCHANGE_SUFFIX_RE = /\.(SA|L|DE|TO|AS|PA|MI|MC|LS|KS|T|SW|HK|AX|TW|V|NS|SI)$/i;

export function cacheKey(ticker: string): string {
  return ticker.toUpperCase().replace(EXCHANGE_SUFFIX_RE, "").trim();
}

export { EXCHANGE_SUFFIX_RE };

const _cache = new Map<string, AssetMeta>();

export function getAssetMeta(ticker: string): AssetMeta | undefined {
  return _cache.get(cacheKey(ticker));
}

export function setAssetMeta(key: string, meta: AssetMeta): void {
  _cache.set(key, meta);
}

export function getMetaCacheSize(): number {
  return _cache.size;
}

export function getAllCachedMeta(): AssetMeta[] {
  return [..._cache.values()];
}

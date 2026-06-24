// ─────────────────────────────────────────────────────────────────────────────
// PTAX multi-moeda — fonte primária: API do Banco Central (OLINDA/PTAX).
//
// Busca cotações de venda (PTAX) para qualquer moeda diretamente da API pública
// do BCB, com cache em memória (TTL de 6h). Forward-fill integrado: se uma data
// não tem cotação, usa a última disponível. Fallback: aba `p_tax` da planilha.
//
// Moedas suportadas: USD, EUR, CAD, GBP e qualquer outra que o BCB publique.
// O endpoint CotacaoDolarPeriodo cobre USD; CotacaoMoedaPeriodo cobre o resto.
// ─────────────────────────────────────────────────────────────────────────────

import type { PtaxLookup } from "@/lib/tax/engine";
import { toNumber } from "@/lib/format";

type Row = Record<string, unknown>;

// ─── Cache em memória (por moeda) ────────────────────────────────────────────

interface CacheEntry {
  map: Map<string, number>;  // date ISO → taxa venda
  dates: string[];            // sorted keys for forward-fill
  fetchedAt: number;
}

const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function getCached(moeda: string): CacheEntry | null {
  const entry = cache.get(moeda);
  if (entry && Date.now() - entry.fetchedAt < TTL_MS) return entry;
  return null;
}

function setCache(moeda: string, map: Map<string, number>): CacheEntry {
  const dates = [...map.keys()].sort();
  const entry: CacheEntry = { map, dates, fetchedAt: Date.now() };
  cache.set(moeda, entry);
  return entry;
}

// ─── BCB API ─────────────────────────────────────────────────────────────────

function fmtBcbDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}-${d}-${y}`;
}

interface BcbRecord {
  cotacaoVenda: number;
  dataHoraCotacao: string;
}

async function fetchBcbCurrency(
  moeda: string, startDate: string, endDate: string,
): Promise<Map<string, number>> {
  const di = fmtBcbDate(startDate);
  const df = fmtBcbDate(endDate);

  const url = moeda === "USD"
    ? `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@di,dataFinalCotacao=@df)?@di='${di}'&@df='${df}'&$top=10000&$format=json&$select=cotacaoVenda,dataHoraCotacao`
    : `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@di,dataFinalCotacao=@df)?@moeda='${moeda}'&@di='${di}'&@df='${df}'&$top=10000&$format=json&$select=cotacaoVenda,dataHoraCotacao`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`BCB PTAX API ${res.status} for ${moeda}`);

  const json = await res.json();
  const values: BcbRecord[] = json.value ?? [];

  const map = new Map<string, number>();
  for (const v of values) {
    if (!v.cotacaoVenda || v.cotacaoVenda <= 0) continue;
    const m = v.dataHoraCotacao.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) map.set(m[0], v.cotacaoVenda);
  }
  return map;
}

// ─── Carregar PTAX do BCB com fallback para planilha ─────────────────────────

const SUPPORTED_CURRENCIES = ["USD", "EUR", "CAD", "GBP"] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export async function loadPtaxFromBcb(
  moeda: string, startDate = "2020-01-01",
): Promise<CacheEntry> {
  const key = moeda.toUpperCase();
  const cached = getCached(key);
  if (cached) return cached;

  const today = new Date().toISOString().slice(0, 10);
  try {
    const map = await fetchBcbCurrency(key, startDate, today);
    if (map.size > 0) return setCache(key, map);
  } catch { /* fallback below */ }

  return getCached(key) ?? setCache(key, new Map());
}

// ─── Parse da aba p_tax (fallback / seed) ────────────────────────────────────

function parseSheetDate(v: unknown): string {
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return "";
}

export function seedCacheFromSheet(ptaxRows: Row[]): void {
  const maps = new Map<string, Map<string, number>>();

  for (const row of ptaxRows) {
    const data = parseSheetDate(row["data"] ?? row["date"] ?? row["data cotação"] ?? row["data cotacao"]);
    const moeda = String(row["moeda"] ?? row["currency"] ?? "USD").toUpperCase().trim();
    const venda = toNumber(row["taxa"] ?? row["venda"] ?? row["ptax_venda"] ?? row["cotação"] ?? row["cotacao"] ?? row["valor"] ?? row["ptax"]) ?? 0;
    if (!data || venda <= 0) continue;

    const key = moeda.includes("EUR") ? "EUR" : moeda.includes("CAD") ? "CAD" : moeda.includes("GBP") ? "GBP" : "USD";
    if (!maps.has(key)) maps.set(key, new Map());
    maps.get(key)!.set(data, venda);
  }

  for (const [moeda, map] of maps) {
    if (!getCached(moeda) && map.size > 0) {
      setCache(moeda, map);
    }
  }
}

// ─── Forward-fill lookup ─────────────────────────────────────────────────────

function forwardFill(entry: CacheEntry, dateISO: string): number {
  if (entry.dates.length === 0) return 0;
  let best = entry.dates[0];
  for (const d of entry.dates) {
    if (d <= dateISO) best = d; else break;
  }
  return entry.map.get(best) ?? 0;
}

// ─── Construtor do PtaxLookup multi-moeda ────────────────────────────────────

const DEFAULTS: Record<string, number> = { USD: 5.0, EUR: 6.0, CAD: 4.0, GBP: 7.0 };

/**
 * Constrói um PtaxLookup multi-moeda.
 *
 * 1. Seda o cache com dados da planilha (instantâneo, sem rede)
 * 2. Tenta buscar do BCB para cada moeda encontrada nas transações
 * 3. Forward-fill: para qualquer (moeda, data), retorna a última PTAX ≤ data
 *
 * Uso: `const ptax = await buildMultiCurrencyPtax(ptaxRows, ["USD", "EUR", "CAD"]);`
 */
export async function buildMultiCurrencyPtax(
  ptaxRows: Row[],
  currencies: string[] = ["USD", "EUR", "CAD"],
): Promise<PtaxLookup> {
  seedCacheFromSheet(ptaxRows);

  await Promise.allSettled(
    currencies.map(m => loadPtaxFromBcb(m.toUpperCase())),
  );

  return (moeda: string, dateISO: string): number => {
    const key = (moeda || "BRL").toUpperCase().trim();
    if (key === "BRL") return 1;

    const entry = getCached(key);
    if (entry && entry.dates.length > 0) {
      const rate = forwardFill(entry, dateISO);
      if (rate > 0) return rate;
    }

    return DEFAULTS[key] ?? 5.0;
  };
}

/**
 * Versão síncrona — usa apenas dados já no cache (planilha/BCB anterior).
 * Útil para consumers que não podem ser async (ex: componente de UI).
 */
export function buildPtaxLookupSync(ptaxRows: Row[]): PtaxLookup {
  seedCacheFromSheet(ptaxRows);

  return (moeda: string, dateISO: string): number => {
    const key = (moeda || "BRL").toUpperCase().trim();
    if (key === "BRL") return 1;

    const entry = getCached(key);
    if (entry && entry.dates.length > 0) {
      const rate = forwardFill(entry, dateISO);
      if (rate > 0) return rate;
    }

    return DEFAULTS[key] ?? 5.0;
  };
}

// ─── Utilitários para o update handler ───────────────────────────────────────

export async function fetchPtaxUpdates(
  moeda: string, startDate: string, endDate: string,
): Promise<Map<string, number>> {
  return fetchBcbCurrency(moeda.toUpperCase(), startDate, endDate);
}

export { SUPPORTED_CURRENCIES };

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
// Entrada VAZIA (BCB falhou e planilha sem a moeda) expira rápido: um mapa
// vazio cacheado por 6h bloqueava retry E impedia o seed da planilha — uma
// única falha do BCB forçava os DEFAULTS em cálculo fiscal por 6 horas.
const EMPTY_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function getCached(moeda: string): CacheEntry | null {
  const entry = cache.get(moeda);
  if (!entry) return null;
  const ttl = entry.map.size > 0 ? TTL_MS : EMPTY_TTL_MS;
  if (Date.now() - entry.fetchedAt < ttl) return entry;
  return null;
}

function setCache(moeda: string, map: Map<string, number>): CacheEntry {
  const dates = [...map.keys()].sort();
  const entry: CacheEntry = { map, dates, fetchedAt: Date.now() };
  cache.set(moeda, entry);
  return entry;
}

/** Limpa o cache em memória (para testes). */
export function resetPtaxCache(): void {
  cache.clear();
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

  // 2 tentativas (10s cada) — a OLINDA oscila; uma falha pontual não pode
  // derrubar o cálculo fiscal para os constantes.
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
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
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`BCB PTAX indisponível para ${moeda}`);
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
    const cached = getCached(moeda);
    // Semeia quando não há cache OU quando o cache é um marcador de falha
    // (mapa vazio) — a planilha nunca pode ficar bloqueada por falha do BCB.
    if ((!cached || cached.map.size === 0) && map.size > 0) {
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

export interface PtaxDetalhado {
  ptax: PtaxLookup;
  /** Avisos de corretude fiscal — moedas que caíram no valor FIXO aproximado
   *  (BCB indisponível E aba p_tax sem a moeda). Preenchido no load E em cada
   *  lookup que usar o fallback; dedup por moeda. Se não estiver vazio, os
   *  números de IR calculados com esse lookup NÃO são confiáveis. */
  avisos: string[];
  /** Diagnóstico por moeda solicitada: quantos pontos de dados existem. */
  fontes: Record<string, number>;
}

/**
 * Constrói um PtaxLookup multi-moeda COM relatório de corretude.
 *
 * 1. Seda o cache com dados da planilha (instantâneo, sem rede)
 * 2. Busca do BCB para cada moeda das transações (2 tentativas; falha não
 *    bloqueia a planilha — ver EMPTY_TTL_MS/seedCacheFromSheet)
 * 3. Forward-fill: para qualquer (moeda, data), retorna a última PTAX ≤ data
 * 4. Último recurso: valor FIXO aproximado (DEFAULTS) — registrado em `avisos`,
 *    NUNCA silencioso: número fiscal com taxa chutada precisa aparecer na UI.
 */
export async function buildMultiCurrencyPtaxDetalhado(
  ptaxRows: Row[],
  currencies: string[] = ["USD", "EUR", "CAD"],
): Promise<PtaxDetalhado> {
  seedCacheFromSheet(ptaxRows);

  await Promise.allSettled(
    currencies.map(m => loadPtaxFromBcb(m.toUpperCase())),
  );

  const avisos: string[] = [];
  const avisadas = new Set<string>();
  const fontes: Record<string, number> = {};

  const registrarFallback = (key: string) => {
    if (avisadas.has(key)) return;
    avisadas.add(key);
    avisos.push(
      `PTAX indisponível para ${key} — usando taxa fixa aproximada (${(DEFAULTS[key] ?? 5.0).toFixed(2)}). ` +
      `Os valores de IR nessa moeda NÃO são confiáveis: verifique a conexão com o BCB ou preencha a aba p_tax.`,
    );
  };

  // Aviso proativo: moeda solicitada sem NENHUM dado (nem BCB, nem planilha).
  for (const m of currencies) {
    const key = m.toUpperCase();
    if (key === "BRL") continue;
    const entry = getCached(key);
    fontes[key] = entry?.map.size ?? 0;
    if (!entry || entry.dates.length === 0) registrarFallback(key);
  }

  const ptax: PtaxLookup = (moeda: string, dateISO: string): number => {
    const key = (moeda || "BRL").toUpperCase().trim();
    if (key === "BRL") return 1;

    const entry = getCached(key);
    if (entry && entry.dates.length > 0) {
      const rate = forwardFill(entry, dateISO);
      if (rate > 0) return rate;
    }

    registrarFallback(key);
    return DEFAULTS[key] ?? 5.0;
  };

  return { ptax, avisos, fontes };
}

/** Versão compatível (só o lookup) — preferir a Detalhado em rotas fiscais,
 *  que DEVEM expor os avisos na resposta. */
export async function buildMultiCurrencyPtax(
  ptaxRows: Row[],
  currencies: string[] = ["USD", "EUR", "CAD"],
): Promise<PtaxLookup> {
  const { ptax } = await buildMultiCurrencyPtaxDetalhado(ptaxRows, currencies);
  return ptax;
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

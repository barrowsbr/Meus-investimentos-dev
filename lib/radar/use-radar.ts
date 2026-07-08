"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Hooks de dados do Radar. Reúne as rotas existentes (nenhum cálculo novo):
//   • useMarkets() → /api/bolsas (índices globais)
//   • useCurrencies() → /api/moedas (moedas)
//   • useCountryMacro(country) → /api/bolsas/country (World Bank, sob demanda)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import type {
  BolsasResponse, MoedasResponse, CountryMacro,
  InstabilityData, BriefData, CountryNewsResponse, SignalsResponse,
  TimelineResponse, ExposureResponse, ExposureEntry, CurrencyDetail, ConstituentsResponse,
  SymbolSearchResult, SymbolSearchResponse,
} from "./types";
import { ISO2_TO_RADAR_PT } from "./geo";

export function useMarkets() {
  const [data, setData] = useState<BolsasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bolsas")
      .then((r) => r.json())
      .then((d: BolsasResponse) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}

export function useCurrencies() {
  const [data, setData] = useState<MoedasResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/moedas")
      .then((r) => r.json())
      .then((d: MoedasResponse) => { if (!cancelled && !d.error) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return data;
}

// Cache em memória por país — evita refetch ao reabrir o mesmo dossiê.
const macroCache = new Map<string, CountryMacro>();

export function useCountryMacro(country: string | null, iso2?: string | null) {
  const key = country ? `${country}|${iso2 ?? ""}` : null;
  const [data, setData] = useState<CountryMacro | null>(key ? macroCache.get(key) ?? null : null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!country || !key) { setData(null); return; }
    const cached = macroCache.get(key);
    if (cached) { setData(cached); return; }

    let cancelled = false;
    setLoading(true);
    setData(null);
    const isoParam = iso2 ? `&iso2=${encodeURIComponent(iso2)}` : "";
    fetch(`/api/bolsas/country?country=${encodeURIComponent(country)}${isoParam}`)
      .then((r) => r.json())
      .then((d: CountryMacro) => {
        if (cancelled) return;
        macroCache.set(key, d);
        setData(d);
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [country, key, iso2]);

  return { data, loading };
}

// ── Fase 2: Instability Index ───────────────────────────────────────────────

const instabilityCache = new Map<string, InstabilityData>();

export function useInstability(country: string | null, iso2?: string | null) {
  const key = country ? `${country}|${iso2 ?? ""}` : null;
  const [data, setData] = useState<InstabilityData | null>(key ? instabilityCache.get(key) ?? null : null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!country || !key) { setData(null); return; }
    const cached = instabilityCache.get(key);
    if (cached) { setData(cached); return; }

    let cancelled = false;
    setLoading(true);
    setData(null);
    const isoParam = iso2 ? `&iso2=${encodeURIComponent(iso2)}` : "";
    fetch(`/api/radar/instability?country=${encodeURIComponent(country)}${isoParam}`)
      .then((r) => r.json())
      .then((d: InstabilityData) => {
        if (cancelled) return;
        if (!d.error) { instabilityCache.set(key, d); setData(d); }
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [country, key, iso2]);

  return { data, loading };
}

// ── Fase 2: AI Brief ────────────────────────────────────────────────────────

const briefCache = new Map<string, BriefData>();

export function useBrief(country: string | null) {
  const [data, setData] = useState<BriefData | null>(country ? briefCache.get(country) ?? null : null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!country) { setData(null); return; }
    const cached = briefCache.get(country);
    if (cached) { setData(cached); return; }

    let cancelled = false;
    setLoading(true);
    setData(null);
    fetch(`/api/radar/brief?country=${encodeURIComponent(country)}`)
      .then((r) => r.json())
      .then((d: BriefData) => {
        if (cancelled) return;
        if (!d.error) { briefCache.set(country, d); setData(d); }
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [country]);

  return { data, loading };
}

// ── Fase 2: Country News ────────────────────────────────────────────────────

const newsCache = new Map<string, CountryNewsResponse>();

export function useCountryNews(country: string | null) {
  const [data, setData] = useState<CountryNewsResponse | null>(country ? newsCache.get(country) ?? null : null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!country) { setData(null); return; }
    const cached = newsCache.get(country);
    if (cached) { setData(cached); return; }

    let cancelled = false;
    setLoading(true);
    setData(null);
    fetch(`/api/radar/news?country=${encodeURIComponent(country)}`)
      .then((r) => r.json())
      .then((d: CountryNewsResponse) => {
        if (cancelled) return;
        if (!d.error) { newsCache.set(country, d); setData(d); }
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [country]);

  return { data, loading };
}

// ── Fase 2: Predictive Signals ──────────────────────────────────────────────

const signalsCache = new Map<string, SignalsResponse>();

export function useSignals(country: string | null) {
  const [data, setData] = useState<SignalsResponse | null>(country ? signalsCache.get(country) ?? null : null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!country) { setData(null); return; }
    const cached = signalsCache.get(country);
    if (cached) { setData(cached); return; }

    let cancelled = false;
    setLoading(true);
    setData(null);
    fetch(`/api/radar/signals?country=${encodeURIComponent(country)}`)
      .then((r) => r.json())
      .then((d: SignalsResponse) => {
        if (cancelled) return;
        if (!d.error) { signalsCache.set(country, d); setData(d); }
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [country]);

  return { data, loading };
}

// ── Fase 2: Timeline 7 dias ─────────────────────────────────────────────────

const timelineCache = new Map<string, TimelineResponse>();

export function useTimeline(country: string | null) {
  const [data, setData] = useState<TimelineResponse | null>(country ? timelineCache.get(country) ?? null : null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!country) { setData(null); return; }
    const cached = timelineCache.get(country);
    if (cached) { setData(cached); return; }

    let cancelled = false;
    setLoading(true);
    setData(null);
    fetch(`/api/radar/timeline?country=${encodeURIComponent(country)}`)
      .then((r) => r.json())
      .then((d: TimelineResponse) => {
        if (cancelled) return;
        if (!d.error) { timelineCache.set(country, d); setData(d); }
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [country]);

  return { data, loading };
}

// ── Fase 5: Currency detail (aba Moeda) ─────────────────────────────────────

const currencyDetailCache = new Map<string, CurrencyDetail>();

export function useCurrencyDetail(code: string | null) {
  const [data, setData] = useState<CurrencyDetail | null>(code ? currencyDetailCache.get(code) ?? null : null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!code) { setData(null); return; }
    const cached = currencyDetailCache.get(code);
    if (cached) { setData(cached); return; }

    let cancelled = false;
    setLoading(true);
    setData(null);
    fetch(`/api/radar/currency?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((d: CurrencyDetail) => {
        if (cancelled) return;
        if (!d.error) { currencyDetailCache.set(code, d); setData(d); }
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [code]);

  return { data, loading };
}

// ── Fase 5: Index constituents (top ações) ──────────────────────────────────

const constituentsCache = new Map<string, ConstituentsResponse>();

export function useConstituents(indexSymbol: string | null) {
  const [data, setData] = useState<ConstituentsResponse | null>(indexSymbol ? constituentsCache.get(indexSymbol) ?? null : null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!indexSymbol) { setData(null); return; }
    const cached = constituentsCache.get(indexSymbol);
    if (cached) { setData(cached); return; }

    let cancelled = false;
    setLoading(true);
    setData(null);
    fetch(`/api/bolsas/constituents?symbol=${encodeURIComponent(indexSymbol)}`)
      .then((r) => r.json())
      .then((d: ConstituentsResponse) => {
        if (cancelled) return;
        if (!d.error) { constituentsCache.set(indexSymbol, d); setData(d); }
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [indexSymbol]);

  return { data, loading };
}

// ── Fase 6: Busca livre de ativos (⌘K → Yahoo) ──────────────────────────────

const searchCache = new Map<string, SymbolSearchResult[]>();

export function useSymbolSearch(query: string) {
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setLoading(false); return; }

    const cached = searchCache.get(q.toLowerCase());
    if (cached) { setResults(cached); setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    // Debounce: só dispara o fetch quando o usuário pausa a digitação.
    const t = setTimeout(() => {
      fetch(`/api/radar/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d: SymbolSearchResponse) => {
          if (cancelled) return;
          const list = d.results ?? [];
          searchCache.set(q.toLowerCase(), list);
          setResults(list);
        })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);

    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  return { results, loading };
}

// ── Fase 4: Portfolio Exposure ──────────────────────────────────────────────
// FONTE ÚNICA: consome o MESMO endpoint da página de ETF (/api/composicao/resumo
// → country_allocation), em vez de recalcular. Assim o mapa unificado mostra
// exatamente os mesmos países/valores que a página de Composição ETFs (mesmo
// motor computeCountryAllocation, mesmo look-through de 5 camadas). Só adapta o
// shape (CountryAllocation → ExposureEntry) e traduz ISO-2 → nome do Radar.

interface CountryAllocationDTO {
  country: { code: string; name: string };
  value_brl: number;
  pct: number;
  tickers: string[];
  direct_brl: number;
  etf_brl: number;
  etf_sources: string[];
}

let exposureCache: ExposureResponse | null = null;

export function useExposure() {
  const [data, setData] = useState<ExposureResponse | null>(exposureCache);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (exposureCache) return;

    let cancelled = false;
    setLoading(true);
    fetch("/api/composicao/resumo")
      .then((r) => r.json())
      .then((d: { country_allocation?: CountryAllocationDTO[]; exchange_allocation?: { iso2: string; value_brl: number; tickers?: string[] }[]; look_through?: { supported?: string[] } }) => {
        if (cancelled) return;
        const alloc = d.country_allocation ?? [];
        const supported = d.look_through?.supported ?? [];
        const exposure: ExposureEntry[] = alloc.map((c) => ({
          countryPT: ISO2_TO_RADAR_PT[c.country.code] ?? c.country.name,
          iso2: c.country.code,
          totalBRL: c.value_brl,
          pct: c.pct,
          tickers: c.tickers ?? [],
          directBRL: c.direct_brl ?? 0,
          etfBRL: c.etf_brl ?? 0,
          etfSources: c.etf_sources ?? [],
        }));
        const totalBRL = exposure.reduce((s, e) => s + e.totalBRL, 0);
        // Alocação por BOLSA de listagem (camada "Minhas bolsas"): tudo é direto
        // na praça (directBRL = valor), sem look-through nem reatribuição de ADR.
        const exchAlloc = d.exchange_allocation ?? [];
        const exchTotal = exchAlloc.reduce((s, e) => s + e.value_brl, 0);
        const exchanges: ExposureEntry[] = exchAlloc.map((e) => ({
          countryPT: ISO2_TO_RADAR_PT[e.iso2] ?? e.iso2,
          iso2: e.iso2,
          totalBRL: e.value_brl,
          pct: exchTotal > 0 ? (e.value_brl / exchTotal) * 100 : 0,
          tickers: e.tickers ?? [],
          directBRL: e.value_brl,
          etfBRL: 0,
          etfSources: [],
        }));
        const resp: ExposureResponse = {
          exposure, exchanges, totalBRL,
          etfDecomposed: supported.length > 0,
          etfSupported: supported,
        };
        exposureCache = resp;
        setData(resp);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { data, loading };
}

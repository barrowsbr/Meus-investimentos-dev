"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Hooks de dados do Radar. Reúne as rotas existentes (nenhum cálculo novo):
//   • useMarkets() → /api/bolsas (índices globais)
//   • useCurrencies() → /api/moedas (moedas)
//   • useCountryMacro(country) → /api/bolsas/country (World Bank, sob demanda)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import type { BolsasResponse, MoedasResponse, CountryMacro } from "./types";

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

export function useCountryMacro(country: string | null) {
  const [data, setData] = useState<CountryMacro | null>(country ? macroCache.get(country) ?? null : null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!country) { setData(null); return; }
    const cached = macroCache.get(country);
    if (cached) { setData(cached); return; }

    let cancelled = false;
    setLoading(true);
    setData(null);
    fetch(`/api/bolsas/country?country=${encodeURIComponent(country)}`)
      .then((r) => r.json())
      .then((d: CountryMacro) => {
        if (cancelled) return;
        macroCache.set(country, d);
        setData(d);
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [country]);

  return { data, loading };
}

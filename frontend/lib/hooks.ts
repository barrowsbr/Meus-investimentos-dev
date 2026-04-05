/**
 * hooks.ts
 * ========
 * Hooks React para fetch de dados do backend.
 * Padrão: { data, loading, error, refetch }
 */

"use client";

import { useState, useEffect, useCallback } from "react";

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []): UseApiResult<T> {
  const [data, setData]     = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// ---------------------------------------------------------------------------
// Hooks específicos
// ---------------------------------------------------------------------------

import { portfolio, finance, performance, news, agent } from "./api";
import type {
  PortfolioSnapshot,
  PortfolioSummary,
  Position,
  FinanceOverview,
  Subscription,
  Installment,
  TWRResult,
  NavPoint,
  AdvancedPerformance,
  PatrimonyPoint,
  NewsItem,
  PolymarketEvent,
} from "./api";

export const usePortfolioSnapshot  = () => useApi<PortfolioSnapshot>(portfolio.snapshot);
export const usePortfolioSummary   = () => useApi<PortfolioSummary>(portfolio.summary);
export const usePositions          = () => useApi<Position[]>(portfolio.positions);
export const useFixedIncome        = () => useApi(portfolio.fixedIncome);
export const useDividends          = () => useApi(portfolio.dividends);

export const useFinanceOverview    = (month?: string) =>
  useApi<FinanceOverview>(() => finance.overview(month), [month]);
export const useSubscriptions      = () => useApi<Subscription[]>(finance.subscriptions);
export const useInstallments       = () => useApi<Installment[]>(finance.installments);

export const useTWR                = (period = "all") =>
  useApi<TWRResult>(() => performance.twr(period), [period]);
export const useNavSeries          = () => useApi<NavPoint[]>(performance.navSeries);
export const useAdvancedPerf       = () => useApi<AdvancedPerformance>(performance.advanced);
export const usePatrimonyHistory   = () => useApi<PatrimonyPoint[]>(performance.history);

export const useNews               = (category?: string) =>
  useApi<NewsItem[]>(() => news.list(category), [category]);
export const usePolymarket         = (category?: string) =>
  useApi<PolymarketEvent[]>(() => news.polymarket(category), [category]);

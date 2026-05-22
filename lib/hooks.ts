"use client";

import { useState, useEffect } from "react";
import type { PortfolioSnapshot } from "./portfolio";
import type { FxRates } from "./cotacoes";

export function useSheetData<T = Record<string, unknown>>(tab: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/sheets/${tab}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok || body.error) {
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        if (!Array.isArray(body)) {
          throw new Error("Resposta inesperada da API");
        }
        return body;
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          setData([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab]);

  return { data, loading, error };
}

export interface CambioInfo {
  pmDolar: number;
  pmEuro: number;
  pmCad: number;
  pmGbp: number;
  totalEnviadoBRL: number;
  totalRecebidoUSD: number;
  ganhoCambialUSD_BRL: number;
  operacoes: number;
}

export interface PtaxInfo {
  USDBRL: number;
  EURBRL: number;
  data: string;
}

export interface LbHistoricPoint {
  data: string;
  patrimonio: number;
  rv: number;
  rf: number;
}

export interface PortfolioResponse extends PortfolioSnapshot {
  fx: FxRates;
  fxSource: string;
  fxCusto: FxRates;
  cambio: CambioInfo;
  ptax: PtaxInfo | null;
  lbHistoric: LbHistoricPoint[];
  timestamp: string;
  tickerMap: Record<string, string>;
}

export function usePortfolio() {
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/cotacoes")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok || body.error) {
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return body;
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}

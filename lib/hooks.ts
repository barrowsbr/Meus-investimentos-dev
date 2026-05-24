"use client";

import { useState, useEffect } from "react";
import type { PortfolioSnapshot, Position } from "./portfolio";
import type { FxRates } from "./cotacoes";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export function useSheetData<T = Record<string, unknown>>(tab: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API_URL}/api/sheets/${tab}`)
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

// Maps a snake_case position from Python API to the TypeScript Position interface
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPosition(p: any): Position {
  return {
    ticker: p.ticker,
    setor: p.setor,
    quantidade: p.quantidade,
    moeda: p.moeda,
    corretora: p.corretora,
    custoMedio: p.custo_medio,
    custoTotal: p.custo_total,
    lucroRealizado: p.lucro_realizado,
    precoAtual: p.preco_atual,
    quoteCurrency: p.quote_currency,
    valorAtual: p.valor_atual,
    valorAtualBRL: p.valor_atual_brl,
    custoTotalBRL: p.custo_total_brl,
    lucroBRL: p.lucro_brl,
    lucroPct: p.lucro_pct,
    ganhoAtivoBRL: p.ganho_ativo_brl,
    ganhoCambioBRL: p.ganho_cambio_brl,
    dayChange: p.day_change,
    dayChangePct: p.day_change_pct,
    dayChangeBRL: p.day_change_brl,
    fatorBRL: p.fator_brl,
    fatorCusto: p.fator_custo,
  };
}

// Maps the full Python snake_case portfolio response to the TypeScript interface
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPortfolioResponse(data: any): PortfolioResponse {
  return {
    positions: (data.positions ?? []).map(mapPosition),
    rvPatrimonioBRL: data.rv_patrimonio_brl ?? 0,
    rfPatrimonioBRL: data.rf_patrimonio_brl ?? 0,
    totalPatrimonioBRL: data.total_patrimonio_brl ?? 0,
    totalProventosBRL: data.total_proventos_brl ?? 0,
    proventosMensais: data.proventos_mensais ?? {},
    lucroBRL: data.lucro_brl ?? 0,
    lucroPct: data.lucro_pct ?? 0,
    ganhoAtivoTotalBRL: data.ganho_ativo_total_brl ?? 0,
    ganhoCambioTotalBRL: data.ganho_cambio_total_brl ?? 0,
    usdbrl: data.usdbrl ?? 5.7,
    eurbrl: data.eurbrl ?? 6.4,
    cadbrl: data.cadbrl ?? 4.1,
    exposicaoCambial: data.exposicao_cambial ?? {},
    setorAlocacao: data.setor_alocacao ?? {},
    fx: data.fx ?? { USDBRL: 5.7, EURBRL: 6.4, GBPBRL: 7.6, CADBRL: 4.1 },
    fxSource: data.fx_source ?? "unknown",
    fxCusto: data.fx_custo ?? { USDBRL: 5.7, EURBRL: 6.4, GBPBRL: 7.6, CADBRL: 4.1 },
    cambio: {
      pmDolar: data.cambio?.pm_dolar ?? 0,
      pmEuro: data.cambio?.pm_euro ?? 0,
      pmCad: data.cambio?.pm_cad ?? 0,
      pmGbp: data.cambio?.pm_gbp ?? 0,
      totalEnviadoBRL: data.cambio?.total_enviado_brl ?? 0,
      totalRecebidoUSD: data.cambio?.total_recebido_usd ?? 0,
      ganhoCambialUSD_BRL: data.cambio?.ganho_cambial_usd_brl ?? 0,
      operacoes: data.cambio?.operacoes ?? 0,
    },
    ptax: data.ptax ?? null,
    lbHistoric: data.lb_historic ?? [],
    timestamp: data.timestamp ?? new Date().toISOString(),
    tickerMap: data.ticker_map ?? {},
  };
}

export function usePortfolio() {
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API_URL}/api/portfolio`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok || body.error) {
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return body;
      })
      .then((d) => {
        if (!cancelled) {
          setData(mapPortfolioResponse(d));
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

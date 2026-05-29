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

// Maps a position — handles both camelCase (Next.js API) and snake_case (legacy)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPosition(p: any): Position {
  return {
    ticker: p.ticker,
    setor: p.setor,
    quantidade: p.quantidade,
    moeda: p.moeda,
    corretora: p.corretora,
    custoMedio: p.custoMedio ?? p.custo_medio ?? 0,
    custoTotal: p.custoTotal ?? p.custo_total ?? 0,
    lucroRealizado: p.lucroRealizado ?? p.lucro_realizado ?? 0,
    lucroRealizadoBRL: p.lucroRealizadoBRL ?? p.lucro_realizado_brl ?? 0,
    precoAtual: p.precoAtual ?? p.preco_atual ?? null,
    quoteCurrency: p.quoteCurrency ?? p.quote_currency ?? null,
    valorAtual: p.valorAtual ?? p.valor_atual ?? null,
    valorAtualBRL: p.valorAtualBRL ?? p.valor_atual_brl ?? 0,
    custoTotalBRL: p.custoTotalBRL ?? p.custo_total_brl ?? 0,
    lucroBRL: p.lucroBRL ?? p.lucro_brl ?? null,
    lucroPct: p.lucroPct ?? p.lucro_pct ?? null,
    ganhoAtivoBRL: p.ganhoAtivoBRL ?? p.ganho_ativo_brl ?? null,
    ganhoCambioBRL: p.ganhoCambioBRL ?? p.ganho_cambio_brl ?? null,
    dayChange: p.dayChange ?? p.day_change ?? null,
    dayChangePct: p.dayChangePct ?? p.day_change_pct ?? null,
    dayChangeBRL: p.dayChangeBRL ?? p.day_change_brl ?? null,
    fatorBRL: p.fatorBRL ?? p.fator_brl ?? 1,
    fatorCusto: p.fatorCusto ?? p.fator_custo ?? 1,
  };
}

// Maps portfolio response — handles both camelCase (Next.js) and snake_case (legacy)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPortfolioResponse(data: any): PortfolioResponse {
  const cambio = data.cambio ?? {};
  return {
    positions: (data.positions ?? []).map(mapPosition),
    rvPatrimonioBRL: data.rvPatrimonioBRL ?? data.rv_patrimonio_brl ?? 0,
    rfPatrimonioBRL: data.rfPatrimonioBRL ?? data.rf_patrimonio_brl ?? 0,
    totalPatrimonioBRL: data.totalPatrimonioBRL ?? data.total_patrimonio_brl ?? 0,
    totalProventosBRL: data.totalProventosBRL ?? data.total_proventos_brl ?? 0,
    proventosMensais: data.proventosMensais ?? data.proventos_mensais ?? {},
    proventosPorTicker: data.proventosPorTicker ?? data.proventos_por_ticker ?? {},
    lucroBRL: data.lucroBRL ?? data.lucro_brl ?? 0,
    lucroPct: data.lucroPct ?? data.lucro_pct ?? 0,
    ganhoAtivoTotalBRL: data.ganhoAtivoTotalBRL ?? data.ganho_ativo_total_brl ?? 0,
    ganhoCambioTotalBRL: data.ganhoCambioTotalBRL ?? data.ganho_cambio_total_brl ?? 0,
    dayChangeTotalBRL: data.dayChangeTotalBRL ?? data.day_change_total_brl ?? 0,
    dayChangeTotalPct: data.dayChangeTotalPct ?? data.day_change_total_pct ?? 0,
    usdbrl: data.usdbrl ?? 5.7,
    eurbrl: data.eurbrl ?? 6.4,
    cadbrl: data.cadbrl ?? 4.1,
    exposicaoCambial: data.exposicaoCambial ?? data.exposicao_cambial ?? {},
    setorAlocacao: data.setorAlocacao ?? data.setor_alocacao ?? {},
    fx: data.fx ?? { USDBRL: 5.7, EURBRL: 6.4, GBPBRL: 7.6, CADBRL: 4.1 },
    fxSource: data.fxSource ?? data.fx_source ?? "unknown",
    fxCusto: data.fxCusto ?? data.fx_custo ?? { USDBRL: 5.7, EURBRL: 6.4, GBPBRL: 7.6, CADBRL: 4.1 },
    cambio: {
      pmDolar: cambio.pmDolar ?? cambio.pm_dolar ?? 0,
      pmEuro: cambio.pmEuro ?? cambio.pm_euro ?? 0,
      pmCad: cambio.pmCad ?? cambio.pm_cad ?? 0,
      pmGbp: cambio.pmGbp ?? cambio.pm_gbp ?? 0,
      totalEnviadoBRL: cambio.totalEnviadoBRL ?? cambio.total_enviado_brl ?? 0,
      totalRecebidoUSD: cambio.totalRecebidoUSD ?? cambio.total_recebido_usd ?? 0,
      ganhoCambialUSD_BRL: cambio.ganhoCambialUSD_BRL ?? cambio.ganho_cambial_usd_brl ?? 0,
      operacoes: cambio.operacoes ?? 0,
    },
    ptax: data.ptax ?? null,
    lbHistoric: data.lbHistoric ?? data.lb_historic ?? [],
    timestamp: data.timestamp ?? new Date().toISOString(),
    tickerMap: data.tickerMap ?? data.ticker_map ?? {},
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

    fetch(`${API_URL}/api/cotacoes`)
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

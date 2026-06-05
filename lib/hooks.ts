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

export interface Fx2CurrencyInfo {
  moeda: string;
  qtd: number;
  usdGasto: number;
  pmUSD: number;
  pmBRL: number;
  brlCusto: number;
  cotBRL: number;
  cotUSD: number;
  valBRL: number;
  ganhoBRL: number;
  ganhoPct: number;
  deltaUSD: number;
}

export interface CambioInfo {
  pmDolar: number;
  pmEuro: number;
  pmCad: number;
  pmGbp: number;
  spotUSD: number;
  spotEUR: number;
  spotCAD: number;
  spotGBP: number;
  totalEnviadoBRL: number;
  totalRecebidoUSD: number;
  totalRecebidoEUR: number;
  totalRecebidoCAD: number;
  totalRecebidoGBP: number;
  ganhoCambialUSD_BRL: number;
  ganhoCambialEUR_BRL: number;
  ganhoCambialCAD_BRL: number;
  ganhoCambialGBP_BRL: number;
  ganhoTotal_BRL: number;
  usdComprado: number;
  usdVendido: number;
  usdNet: number;
  brlGastoUSD: number;
  brlCustoUsdNet: number;
  valorUsdHoje: number;
  ganhoUsdBRL: number;
  ganhoUsdPct: number;
  deltaPmUsd: number;
  totalValBRL: number;
  totalCustoBRL: number;
  ganhoTotalPct: number;
  numMoedas: number;
  fx2: Fx2CurrencyInfo[];
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
  fxDayChange: Record<string, { change: number; changePct: number }>;
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
    ganhoAtivoPuroBRL: p.ganhoAtivoPuroBRL ?? p.ganho_ativo_puro_brl ?? null,
    ganhoFXPrincipalBRL: p.ganhoFXPrincipalBRL ?? p.ganho_fx_principal_brl ?? null,
    ganhoCruzadoBRL: p.ganhoCruzadoBRL ?? p.ganho_cruzado_brl ?? null,
    pmFxAquisicao: p.pmFxAquisicao ?? p.pm_fx_aquisicao ?? null,
    fxAtualBRL: p.fxAtualBRL ?? p.fx_atual_brl ?? null,
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
    ganhoAtivoPuroTotalBRL: data.ganhoAtivoPuroTotalBRL ?? data.ganho_ativo_puro_total_brl ?? 0,
    ganhoFXPrincipalTotalBRL: data.ganhoFXPrincipalTotalBRL ?? data.ganho_fx_principal_total_brl ?? 0,
    ganhoCruzadoTotalBRL: data.ganhoCruzadoTotalBRL ?? data.ganho_cruzado_total_brl ?? 0,
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
    fxDayChange: data.fxDayChange ?? {},
    cambio: {
      pmDolar: cambio.pmDolar ?? cambio.pm_dolar ?? 0,
      pmEuro: cambio.pmEuro ?? cambio.pm_euro ?? 0,
      pmCad: cambio.pmCad ?? cambio.pm_cad ?? 0,
      pmGbp: cambio.pmGbp ?? cambio.pm_gbp ?? 0,
      spotUSD: cambio.spotUSD ?? cambio.spot_usd ?? 0,
      spotEUR: cambio.spotEUR ?? cambio.spot_eur ?? 0,
      spotCAD: cambio.spotCAD ?? cambio.spot_cad ?? 0,
      spotGBP: cambio.spotGBP ?? cambio.spot_gbp ?? 0,
      totalEnviadoBRL: cambio.totalEnviadoBRL ?? cambio.total_enviado_brl ?? 0,
      totalRecebidoUSD: cambio.totalRecebidoUSD ?? cambio.total_recebido_usd ?? 0,
      totalRecebidoEUR: cambio.totalRecebidoEUR ?? cambio.total_recebido_eur ?? 0,
      totalRecebidoCAD: cambio.totalRecebidoCAD ?? cambio.total_recebido_cad ?? 0,
      totalRecebidoGBP: cambio.totalRecebidoGBP ?? cambio.total_recebido_gbp ?? 0,
      ganhoCambialUSD_BRL: cambio.ganhoCambialUSD_BRL ?? cambio.ganho_cambial_usd_brl ?? 0,
      ganhoCambialEUR_BRL: cambio.ganhoCambialEUR_BRL ?? cambio.ganho_cambial_eur_brl ?? 0,
      ganhoCambialCAD_BRL: cambio.ganhoCambialCAD_BRL ?? cambio.ganho_cambial_cad_brl ?? 0,
      ganhoCambialGBP_BRL: cambio.ganhoCambialGBP_BRL ?? cambio.ganho_cambial_gbp_brl ?? 0,
      ganhoTotal_BRL: cambio.ganhoTotal_BRL ?? cambio.ganho_total_brl ?? 0,
      usdComprado: cambio.usdComprado ?? cambio.usd_comprado ?? 0,
      usdVendido: cambio.usdVendido ?? cambio.usd_vendido ?? 0,
      usdNet: cambio.usdNet ?? cambio.usd_net ?? 0,
      brlGastoUSD: cambio.brlGastoUSD ?? cambio.brl_gasto_usd ?? 0,
      brlCustoUsdNet: cambio.brlCustoUsdNet ?? cambio.brl_custo_usd_net ?? 0,
      valorUsdHoje: cambio.valorUsdHoje ?? cambio.valor_usd_hoje ?? 0,
      ganhoUsdBRL: cambio.ganhoUsdBRL ?? cambio.ganho_usd_brl ?? 0,
      ganhoUsdPct: cambio.ganhoUsdPct ?? cambio.ganho_usd_pct ?? 0,
      deltaPmUsd: cambio.deltaPmUsd ?? cambio.delta_pm_usd ?? 0,
      totalValBRL: cambio.totalValBRL ?? cambio.total_val_brl ?? 0,
      totalCustoBRL: cambio.totalCustoBRL ?? cambio.total_custo_brl ?? 0,
      ganhoTotalPct: cambio.ganhoTotalPct ?? cambio.ganho_total_pct ?? 0,
      numMoedas: cambio.numMoedas ?? cambio.num_moedas ?? 1,
      fx2: cambio.fx2 ?? [],
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

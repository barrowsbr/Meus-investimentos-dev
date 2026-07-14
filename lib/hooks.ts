"use client";

import { useState, useEffect, useCallback } from "react";
import type { PortfolioSnapshot, Position } from "./portfolio";
import type { FxRates } from "./cotacoes";
import { withDataVersion } from "./data-version";
import { fetchJsonCached, fetchJsonFresh } from "./client-cache";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export function useSheetData<T = Record<string, unknown>>(tab: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Cache de sessão (TTL 5 min): voltar à página não refaz a chamada.
    fetchJsonCached<unknown>(withDataVersion(`${API_URL}/api/sheets/${tab}`), 5 * 60_000)
      .then((body) => {
        const b = body as { error?: string } | unknown[];
        if (b && !Array.isArray(b) && (b as { error?: string }).error) {
          throw new Error((b as { error: string }).error);
        }
        if (!Array.isArray(b)) {
          throw new Error("Resposta inesperada da API");
        }
        return b as T[];
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
  alavancagem: { dividaBRL: number; jurosAcumBRL: number; netBRL: number; alavancagemPct: number; leverageRatio: number };
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
    realizadoAtivoBRL: p.realizadoAtivoBRL ?? p.realizado_ativo_brl ?? 0,
    realizadoCambioBRL: p.realizadoCambioBRL ?? p.realizado_cambio_brl ?? 0,
    precoAtual: p.precoAtual ?? p.preco_atual ?? null,
    quoteCurrency: p.quoteCurrency ?? p.quote_currency ?? null,
    precoFonte: p.precoFonte ?? p.preco_fonte ?? null,
    valorAtual: p.valorAtual ?? p.valor_atual ?? null,
    valorAtualBRL: p.valorAtualBRL ?? p.valor_atual_brl ?? 0,
    custoTotalBRL: p.custoTotalBRL ?? p.custo_total_brl ?? 0,
    lucroBRL: p.lucroBRL ?? p.lucro_brl ?? null,
    lucroPct: p.lucroPct ?? p.lucro_pct ?? null,
    proventosBRL: p.proventosBRL ?? p.proventos_brl ?? 0,
    retornoTotalBRL: p.retornoTotalBRL ?? p.retorno_total_brl ?? null,
    retornoTotalPct: p.retornoTotalPct ?? p.retorno_total_pct ?? null,
    custoVendidoBRL: p.custoVendidoBRL ?? 0,
    resultadoHistBRL: p.resultadoHistBRL ?? null,
    resultadoHistPct: p.resultadoHistPct ?? null,
    ganhoAtivoBRL: p.ganhoAtivoBRL ?? p.ganho_ativo_brl ?? null,
    ganhoCambioBRL: p.ganhoCambioBRL ?? p.ganho_cambio_brl ?? null,
    ganhoAtivoPuroBRL: p.ganhoAtivoPuroBRL ?? p.ganho_ativo_puro_brl ?? null,
    ganhoFXPrincipalBRL: p.ganhoFXPrincipalBRL ?? p.ganho_fx_principal_brl ?? null,
    ganhoCruzadoBRL: p.ganhoCruzadoBRL ?? p.ganho_cruzado_brl ?? null,
    pmFxAquisicao: p.pmFxAquisicao ?? p.pm_fx_aquisicao ?? null,
    fxAtualBRL: p.fxAtualBRL ?? p.fx_atual_brl ?? null,
    dataInicioPos: p.dataInicioPos ?? p.data_inicio_pos ?? null,
    retornoAnualizadoPct: p.retornoAnualizadoPct ?? p.retorno_anualizado_pct ?? null,
    dayChange: p.dayChange ?? p.day_change ?? null,
    dayChangePct: p.dayChangePct ?? p.day_change_pct ?? null,
    dayChangeBRL: p.dayChangeBRL ?? p.day_change_brl ?? null,
    dayChangeFxBRL: p.dayChangeFxBRL ?? p.day_change_fx_brl ?? null,
    marketState: p.marketState ?? p.market_state ?? undefined,
    fatorBRL: p.fatorBRL ?? p.fator_brl ?? 1,
    fatorCusto: p.fatorCusto ?? p.fator_custo ?? 1,
    vendido: p.vendido ?? false,
    dataVenda: p.dataVenda ?? p.data_venda ?? null,
  };
}

// Maps portfolio response — handles both camelCase (Next.js) and snake_case (legacy)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPortfolioResponse(data: any): PortfolioResponse {
  const cambio = data.cambio ?? {};
  return {
    positions: (data.positions ?? []).map(mapPosition),
    closedPositions: (data.closedPositions ?? data.closed_positions ?? []).map(mapPosition),
    rvPatrimonioBRL: data.rvPatrimonioBRL ?? data.rv_patrimonio_brl ?? 0,
    rfPatrimonioBRL: data.rfPatrimonioBRL ?? data.rf_patrimonio_brl ?? 0,
    totalPatrimonioBRL: data.totalPatrimonioBRL ?? data.total_patrimonio_brl ?? 0,
    totalProventosBRL: data.totalProventosBRL ?? data.total_proventos_brl ?? 0,
    proventosMensais: data.proventosMensais ?? data.proventos_mensais ?? {},
    proventosPorTicker: data.proventosPorTicker ?? data.proventos_por_ticker ?? {},
    totalImpostoProventosBRL: data.totalImpostoProventosBRL ?? data.total_imposto_proventos_brl ?? 0,
    impostoProventosPorTicker: data.impostoProventosPorTicker ?? data.imposto_proventos_por_ticker ?? {},
    lucroBRL: data.lucroBRL ?? data.lucro_brl ?? 0,
    lucroPct: data.lucroPct ?? data.lucro_pct ?? 0,
    proventosRVBRL: data.proventosRVBRL ?? data.proventos_rv_brl ?? 0,
    realizadoRVBRL: data.realizadoRVBRL ?? data.realizado_rv_brl ?? 0,
    realizadoAtivoRVBRL: data.realizadoAtivoRVBRL ?? data.realizado_ativo_rv_brl ?? 0,
    realizadoCambioRVBRL: data.realizadoCambioRVBRL ?? data.realizado_cambio_rv_brl ?? 0,
    retornoTotalRVBRL: data.retornoTotalRVBRL ?? data.retorno_total_rv_brl ?? 0,
    retornoTotalRVPct: data.retornoTotalRVPct ?? data.retorno_total_rv_pct ?? 0,
    ganhoAtivoTotalBRL: data.ganhoAtivoTotalBRL ?? data.ganho_ativo_total_brl ?? 0,
    ganhoCambioTotalBRL: data.ganhoCambioTotalBRL ?? data.ganho_cambio_total_brl ?? 0,
    ganhoAtivoPuroTotalBRL: data.ganhoAtivoPuroTotalBRL ?? data.ganho_ativo_puro_total_brl ?? 0,
    ganhoFXPrincipalTotalBRL: data.ganhoFXPrincipalTotalBRL ?? data.ganho_fx_principal_total_brl ?? 0,
    ganhoCruzadoTotalBRL: data.ganhoCruzadoTotalBRL ?? data.ganho_cruzado_total_brl ?? 0,
    dayChangeTotalBRL: data.dayChangeTotalBRL ?? data.day_change_total_brl ?? 0,
    dayChangeTotalPct: data.dayChangeTotalPct ?? data.day_change_total_pct ?? 0,
    dayChangeFxTotalBRL: data.dayChangeFxTotalBRL ?? data.day_change_fx_total_brl ?? 0,
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
    alavancagem: data.alavancagem ?? { dividaBRL: 0, jurosAcumBRL: 0, netBRL: data.totalPatrimonioBRL ?? 0, alavancagemPct: 0, leverageRatio: 0 },
    timestamp: data.timestamp ?? new Date().toISOString(),
    tickerMap: data.tickerMap ?? data.ticker_map ?? {},
  };
}

export function usePortfolio() {
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Cache de sessão (TTL 5 min): navegar entre páginas não refaz o /api/cotacoes
    // (a chamada mais pesada do app). refetch() continua buscando fresco (?_t=)
    // e requenta o cache; escrita de dados troca a URL via ?v= (data-version).
    const base = withDataVersion(`${API_URL}/api/cotacoes`);
    const promessa = fetchKey > 0
      ? fetchJsonFresh<Record<string, unknown>>(`${API_URL}/api/cotacoes?_t=${Date.now()}`, base)
      : fetchJsonCached<Record<string, unknown>>(base, 5 * 60_000);
    promessa
      .then((body) => {
        if (!body || (body as { error?: string }).error) {
          throw new Error((body as { error?: string })?.error || "Falha ao carregar cotações");
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
  }, [fetchKey]);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  return { data, loading, error, refetch };
}

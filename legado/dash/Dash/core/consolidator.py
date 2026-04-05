"""
Consolidador Multi-Currency para Visão Total.
==============================================

Este módulo é usado APENAS quando o usuário quer ver o portfólio completo
com múltiplas moedas convertidas para BRL.

Para ativos individuais ou classes específicas de uma única moeda,
use o resultado direto do CurrencyBucket (sem consolidação).

Versão: 1.0.0
Data: 2026-01-22
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional
import pandas as pd
import numpy as np


@dataclass
class CurrencyBucket:
    """
    Patrimônio e fluxos em uma moeda específica.
    
    Todos os valores são mantidos na MOEDA ORIGINAL, sem conversão.
    """
    currency: str  # 'BRL', 'USD', 'EUR'
    nav_series: pd.Series  # NAV diário NA MOEDA ORIGINAL
    flow_series: pd.Series  # Fluxos NA MOEDA ORIGINAL
    income_series: pd.Series  # Proventos NA MOEDA ORIGINAL
    force_zero_series: pd.Series  # Dias com retorno forçado a zero
    flow_timing_series: pd.Series  # 0=EoD, 1=SoD
    tickers: List[str] = field(default_factory=list)  # Ativos neste bucket
    
    def to_engine_input(self) -> pd.DataFrame:
        """Converte bucket para formato de entrada do TWR engine."""
        return pd.DataFrame({
            'nav': self.nav_series,
            'flow': self.flow_series,
            'income': self.income_series,
            'force_return_zero': self.force_zero_series,
            'flow_timing': self.flow_timing_series
        }).sort_index()
    
    def __repr__(self) -> str:
        nav_last = self.nav_series.iloc[-1] if len(self.nav_series) > 0 else 0
        return f"CurrencyBucket({self.currency}, NAV={nav_last:,.2f}, tickers={len(self.tickers)})"


@dataclass
class MultiCurrencyResult:
    """
    Resultado do Engine com múltiplas moedas.
    
    Cada moeda tem seu próprio bucket com NAV, flows e income
    calculados na moeda original (sem conversão).
    """
    buckets: Dict[str, CurrencyBucket]  # {'USD': CurrencyBucket, 'BRL': ...}
    fx_rates: Dict[str, pd.Series]  # {'USD': s_usd, 'EUR': s_eur}
    prices: pd.DataFrame
    custodia_diaria: pd.DataFrame
    tickers_yahoo: List[str]
    rf_curve: Optional[pd.Series] = None  # RF sempre em BRL
    
    def get_currencies(self) -> List[str]:
        """Retorna lista de moedas presentes."""
        return list(self.buckets.keys())
    
    def has_single_currency(self) -> bool:
        """Retorna True se há apenas uma moeda."""
        return len(self.buckets) == 1
    
    def get_single_bucket(self) -> Optional[CurrencyBucket]:
        """Retorna o único bucket se houver apenas uma moeda."""
        if self.has_single_currency():
            return list(self.buckets.values())[0]
        return None


@dataclass
class ConsolidatedResult:
    """Resultado consolidado em BRL para visão total."""
    nav_brl: pd.Series
    flow_brl: pd.Series
    income_brl: pd.Series
    force_zero_series: pd.Series
    flow_timing_series: pd.Series
    breakdown_by_currency: Dict[str, float]  # {'USD': 150000, 'BRL': 200000}
    # v8.0: Capital tracking for reconciliation
    capital_invested_brl: float = 0.0       # Total BRL spent (remittance cost)
    capital_market_brl: float = 0.0         # Total BRL at market rate (spot)
    fx_pnl_brl: float = 0.0                # FX P&L = market - invested (cambial)
    
    def to_engine_input(self) -> pd.DataFrame:
        """Converte para formato de entrada do TWR engine."""
        return pd.DataFrame({
            'nav': self.nav_brl,
            'flow': self.flow_brl,
            'income': self.income_brl,
            'force_return_zero': self.force_zero_series,
            'flow_timing': self.flow_timing_series
        }).sort_index()


def consolidate_to_brl(
    buckets: Dict[str, CurrencyBucket],
    fx_rates: Dict[str, pd.Series],
    df_cambio: 'pd.DataFrame' = None,  # v6.1: For effective rate on flows
    fx_cost_basis: Dict[str, pd.Series] = None,  # v8.0: For "Meu Custo" view (flows only)
    fx_cost_basis_excluded_tickers: List[str] = None  # v7.1: Tickers that skip cost basis (e.g. BTC)
) -> ConsolidatedResult:
    """
    Consolida todos os buckets de moeda para uma visão unificada em BRL.
    
    v8.0 — CORREÇÃO FUNDAMENTAL:
    ============================
    NAV SEMPRE usa taxa de MERCADO (spot) — valor real de liquidação.
    Em modo "Meu Custo" (fx_cost_basis fornecido):
        - FLOWS usam taxa da REMESSA (custo real em BRL)
        - NAV usa SPOT (valor de mercado real)
    Em modo normal (fx_cost_basis = None):
        - Tudo usa SPOT
    
    Isso separa corretamente "quanto vale" de "quanto custou".
    
    Args:
        buckets: Dicionário de CurrencyBucket por moeda
        fx_rates: Séries de câmbio (USD -> BRL, EUR -> BRL, etc.) — SPOT rates
        df_cambio: DataFrame de remessas para taxa efetiva em flows (opcional)
        fx_cost_basis: Séries de custo médio FX (para "Meu Custo" view).
                       Quando fornecido, FLOWS usam custo pessoal, NAV usa SPOT.
        fx_cost_basis_excluded_tickers: Tickers que usam mercado mesmo em "Meu Custo"
                       (ex: ['BTC-USD'] - comprados direto em BRL)
    
    Returns:
        ConsolidatedResult com tudo convertido para BRL
        
    Notas:
        - NAV SEMPRE usa taxa de MERCADO (fx_rates) — padrão institucional
        - Flows usam taxa da REMESSA (fx_cost_basis) em modo "Meu Custo"
        - Tickers em fx_cost_basis_excluded_tickers sempre usam mercado para tudo
        - RF (Renda Fixa) já vem em BRL, não precisa conversão
    """
    # Default excluded tickers (bought directly in BRL)
    if fx_cost_basis_excluded_tickers is None:
        fx_cost_basis_excluded_tickers = ['BTC-USD', 'BTC']
    if not buckets:
        # Retornar resultado vazio
        empty_series = pd.Series(dtype=float)
        return ConsolidatedResult(
            nav_brl=empty_series,
            flow_brl=empty_series,
            income_brl=empty_series,
            force_zero_series=pd.Series(dtype=bool),
            flow_timing_series=pd.Series(dtype=int),
            breakdown_by_currency={}
        )
    
    # Construir índice unificado de todas as datas
    all_dates = set()
    for bucket in buckets.values():
        if not bucket.nav_series.empty:
            all_dates.update(bucket.nav_series.index)
    
    if not all_dates:
        empty_series = pd.Series(dtype=float)
        return ConsolidatedResult(
            nav_brl=empty_series,
            flow_brl=empty_series,
            income_brl=empty_series,
            force_zero_series=pd.Series(dtype=bool),
            flow_timing_series=pd.Series(dtype=int),
            breakdown_by_currency={}
        )
    
    idx = pd.DatetimeIndex(sorted(all_dates))

    # Inicializar séries consolidadas
    nav_total = pd.Series(0.0, index=idx)
    flow_total = pd.Series(0.0, index=idx)
    income_total = pd.Series(0.0, index=idx)
    force_zero_combined = pd.Series(False, index=idx)
    flow_timing_combined = pd.Series(0, index=idx)  # Default: EoD

    breakdown = {}

    # =========================================================================
    # FIX v12.0: Detectar "entrada" de cada bucket na consolidação
    # Primeiro, determinar a primeira data válida global
    # =========================================================================
    first_valid_dates = {}
    for currency, bucket in buckets.items():
        fv = bucket.nav_series[bucket.nav_series > 0].first_valid_index()
        if fv is not None:
            first_valid_dates[currency] = fv

    # A primeira data global é a mais antiga entre todos os buckets
    global_first_valid = min(first_valid_dates.values()) if first_valid_dates else None

    for currency, bucket in buckets.items():
        # Reindex para datas comuns
        nav_cur = bucket.nav_series.reindex(idx).ffill().fillna(0)
        flow_cur = bucket.flow_series.reindex(idx).fillna(0)
        income_cur = bucket.income_series.reindex(idx).fillna(0)
        force_zero_cur = bucket.force_zero_series.reindex(idx).fillna(False)
        flow_timing_cur = bucket.flow_timing_series.reindex(idx).fillna(0)

        # FIX: Garantir que NAV antes da primeira data válida seja 0 (não forward-filled)
        first_valid_bucket = bucket.nav_series[bucket.nav_series > 0].first_valid_index()
        if first_valid_bucket is not None:
            nav_cur.loc[nav_cur.index < first_valid_bucket] = 0

            # =========================================================================
            # FIX v12.0: Se este bucket começa depois do primeiro bucket global,
            # adicionar seu NAV inicial como fluxo de entrada
            # =========================================================================
            if global_first_valid is not None and first_valid_bucket > global_first_valid:
                initial_nav = nav_cur.loc[first_valid_bucket]
                if initial_nav > 0:
                    flow_cur.loc[first_valid_bucket] = flow_cur.loc[first_valid_bucket] + initial_nav

        # =========================================================================
        # FX RATE SELECTION v8.0: NAV=SPOT always, Flows=cost basis in "Meu Custo"
        # =========================================================================
        
        # Check if this bucket has tickers that should skip cost basis (e.g., BTC)
        bucket_has_excluded_ticker = any(
            ticker.upper() in [t.upper() for t in fx_cost_basis_excluded_tickers]
            for ticker in bucket.tickers
        )
        
        # ── NAV: ALWAYS uses SPOT rate (market value) ──
        if currency == 'BRL':
            fx_for_nav = pd.Series(1.0, index=idx)
        elif currency in fx_rates and not fx_rates[currency].empty:
            fx_for_nav = fx_rates[currency].reindex(idx).ffill().bfill()
            fx_for_nav = fx_for_nav.fillna(fx_for_nav.dropna().iloc[-1] if not fx_for_nav.dropna().empty else 5.5)
        else:
            # Fallback rates
            fallback = {'USD': 5.5, 'EUR': 6.0, 'CAD': 4.0}
            fx_for_nav = pd.Series(fallback.get(currency, 1.0), index=idx)
        
        # ── FLOWS: Uses cost basis (remittance rate) in "Meu Custo" mode ──
        if currency == 'BRL':
            fx_for_flow = pd.Series(1.0, index=idx)
        elif fx_cost_basis is not None and currency in fx_cost_basis and not bucket_has_excluded_ticker:
            # "Meu Custo" mode: Flows use personal remittance cost
            cost_series = fx_cost_basis[currency]
            if not cost_series.empty and not cost_series.isna().all():
                fx_for_flow = cost_series.reindex(idx).ffill().bfill()
                # Fill remaining NaN with spot as fallback
                fx_for_flow = fx_for_flow.fillna(fx_for_nav)
            else:
                fx_for_flow = fx_for_nav.copy()  # Fallback to spot
        else:
            # Standard mode: Flows also use spot
            fx_for_flow = fx_for_nav.copy()

        # Converter para BRL
        nav_brl = nav_cur * fx_for_nav           # Market value (always spot)
        flow_brl = flow_cur * fx_for_flow         # Cost basis in "Meu Custo", spot otherwise
        income_brl = income_cur * fx_for_nav      # Proventos usam spot do dia
        
        # Acumular
        nav_total += nav_brl
        flow_total += flow_brl
        income_total += income_brl
        
        # Para force_zero e timing, usar OR e MAX respectivamente
        force_zero_combined = force_zero_combined | force_zero_cur.astype(bool)
        flow_timing_combined = np.maximum(flow_timing_combined, flow_timing_cur)
        
        # Breakdown (último valor)
        breakdown[currency] = nav_brl.iloc[-1] if len(nav_brl) > 0 else 0.0
    
    # Garantir que flow_timing_combined seja Series (np.maximum pode alterar o tipo)
    if not isinstance(flow_timing_combined, pd.Series):
        flow_timing_combined = pd.Series(flow_timing_combined, index=idx)

    # =========================================================================
    # FIX: Filtrar para começar apenas quando há NAV > 0
    # =========================================================================
    first_valid_total = nav_total[nav_total > 0].first_valid_index()
    if first_valid_total is not None:
        mask_valid = nav_total.index >= first_valid_total
        nav_total = nav_total[mask_valid]
        flow_total = flow_total.reindex(nav_total.index).fillna(0)
        income_total = income_total.reindex(nav_total.index).fillna(0)
        force_zero_combined = force_zero_combined.reindex(nav_total.index).fillna(False)
        flow_timing_combined = flow_timing_combined.reindex(nav_total.index).fillna(0)

    # =========================================================================
    # v8.0: Capital tracking for reconciliation
    # =========================================================================
    total_flow_brl = flow_total.sum() if not flow_total.empty else 0.0
    nav_start = nav_total.iloc[0] if not nav_total.empty else 0.0
    nav_end = nav_total.iloc[-1] if not nav_total.empty else 0.0
    capital_invested = nav_start + total_flow_brl  # Initial + net flows
    fx_pnl = 0.0  # Will be calculated by decomposition engine

    return ConsolidatedResult(
        nav_brl=nav_total,
        flow_brl=flow_total,
        income_brl=income_total,
        force_zero_series=force_zero_combined,
        flow_timing_series=flow_timing_combined,
        breakdown_by_currency=breakdown,
        capital_invested_brl=capital_invested,
        capital_market_brl=nav_end,
    )


def create_empty_bucket(currency: str, index: pd.DatetimeIndex = None) -> CurrencyBucket:
    """
    Cria um bucket vazio para uma moeda.
    
    Útil quando uma moeda não tem ativos mas precisa existir na estrutura.
    """
    if index is None:
        index = pd.DatetimeIndex([])
    
    return CurrencyBucket(
        currency=currency,
        nav_series=pd.Series(0.0, index=index),
        flow_series=pd.Series(0.0, index=index),
        income_series=pd.Series(0.0, index=index),
        force_zero_series=pd.Series(False, index=index),
        flow_timing_series=pd.Series(0, index=index),
        tickers=[]
    )


def merge_buckets(bucket1: CurrencyBucket, bucket2: CurrencyBucket) -> CurrencyBucket:
    """
    Combina dois buckets da mesma moeda.

    Útil para adicionar RF ao bucket BRL existente.

    FIX v12.0: Detecta quando um bucket "entra" depois do outro já estar rodando
    e adiciona o NAV inicial como fluxo para evitar retornos fictícios.
    """
    if bucket1.currency != bucket2.currency:
        raise ValueError(f"Moedas diferentes: {bucket1.currency} vs {bucket2.currency}")

    # Unificar índices
    all_dates = set(bucket1.nav_series.index) | set(bucket2.nav_series.index)
    idx = pd.DatetimeIndex(sorted(all_dates))

    # Reindexar cada bucket
    nav1 = bucket1.nav_series.reindex(idx).fillna(0)
    nav2 = bucket2.nav_series.reindex(idx).fillna(0)
    flow1 = bucket1.flow_series.reindex(idx).fillna(0)
    flow2 = bucket2.flow_series.reindex(idx).fillna(0)

    # =========================================================================
    # FIX v12.0: Detectar "entrada" de cada bucket no merge
    #
    # PROBLEMA ANTERIOR:
    # - Bucket1 começa dia X com NAV = 50.000
    # - Bucket2 já existia desde dia Y (anterior) com NAV = 10.000
    # - No dia X, NAV combinado salta de 10.000 para 60.000
    # - Mas flow combinado = 0 + 0 = 0 (nenhum fluxo detectado)
    # - TWR calculava retorno de (60.000 - 10.000) / 10.000 = 500%!
    #
    # SOLUÇÃO:
    # - Detectar primeira data com NAV > 0 de cada bucket
    # - Se a outra série já tinha NAV > 0 antes, adicionar NAV inicial como fluxo
    # =========================================================================

    # Primeira data válida de cada bucket
    first_valid_1 = nav1[nav1 > 0].first_valid_index()
    first_valid_2 = nav2[nav2 > 0].first_valid_index()

    # Se bucket1 começa depois de bucket2 já ter valores, adicionar NAV inicial como fluxo
    if first_valid_1 is not None and first_valid_2 is not None:
        if first_valid_1 > first_valid_2:
            # Bucket1 entra depois - seu NAV inicial é um "aporte"
            initial_nav_1 = nav1.loc[first_valid_1]
            if initial_nav_1 > 0:
                flow1.loc[first_valid_1] = flow1.loc[first_valid_1] + initial_nav_1

        if first_valid_2 > first_valid_1:
            # Bucket2 entra depois - seu NAV inicial é um "aporte"
            initial_nav_2 = nav2.loc[first_valid_2]
            if initial_nav_2 > 0:
                flow2.loc[first_valid_2] = flow2.loc[first_valid_2] + initial_nav_2

    # Somar séries
    nav = nav1 + nav2
    flow = flow1 + flow2
    income = bucket1.income_series.reindex(idx).fillna(0) + bucket2.income_series.reindex(idx).fillna(0)

    # Combinar flags
    force_zero = (
        bucket1.force_zero_series.reindex(idx).fillna(False).astype(bool) |
        bucket2.force_zero_series.reindex(idx).fillna(False).astype(bool)
    )
    flow_timing = np.maximum(
        bucket1.flow_timing_series.reindex(idx).fillna(0),
        bucket2.flow_timing_series.reindex(idx).fillna(0)
    )

    return CurrencyBucket(
        currency=bucket1.currency,
        nav_series=nav,
        flow_series=flow,
        income_series=income,
        force_zero_series=force_zero,
        flow_timing_series=pd.Series(flow_timing, index=idx),
        tickers=list(set(bucket1.tickers + bucket2.tickers))
    )

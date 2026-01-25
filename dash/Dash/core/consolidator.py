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
    df_cambio: 'pd.DataFrame' = None  # v6.1: For effective rate on flows
) -> ConsolidatedResult:
    """
    Consolida todos os buckets de moeda para uma visão unificada em BRL.
    
    Esta função é usada APENAS na visão "Todos os ativos".
    Para filtros de moeda única, use o bucket diretamente.
    
    Args:
        buckets: Dicionário de CurrencyBucket por moeda
        fx_rates: Séries de câmbio (USD -> BRL, EUR -> BRL, etc.) para NAV
        df_cambio: DataFrame de remessas para taxa efetiva em flows (opcional)
    
    Returns:
        ConsolidatedResult com tudo convertido para BRL
        
    Notas:
        - NAV usa taxa de MERCADO do dia (para valorização atual)
        - Flows usam taxa EFETIVA das remessas (para custo real)
        - RF (Renda Fixa) já vem em BRL, não precisa conversão
    """
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
    
    for currency, bucket in buckets.items():
        # Reindex para datas comuns
        nav_cur = bucket.nav_series.reindex(idx).ffill().fillna(0)
        flow_cur = bucket.flow_series.reindex(idx).fillna(0)
        income_cur = bucket.income_series.reindex(idx).fillna(0)
        force_zero_cur = bucket.force_zero_series.reindex(idx).fillna(False)
        flow_timing_cur = bucket.flow_timing_series.reindex(idx).fillna(0)
        
        # Obter taxa de câmbio de MERCADO (para NAV)
        if currency == 'BRL':
            fx_market = pd.Series(1.0, index=idx)
        elif currency in fx_rates and not fx_rates[currency].empty:
            fx_market = fx_rates[currency].reindex(idx).ffill().fillna(method='bfill')
            fx_market = fx_market.fillna(fx_market.dropna().iloc[-1] if not fx_market.dropna().empty else 5.5)
        else:
            if currency == 'USD':
                fx_market = pd.Series(5.5, index=idx)
            elif currency == 'EUR':
                fx_market = pd.Series(6.0, index=idx)
            else:
                fx_market = pd.Series(1.0, index=idx)
        
        # Obter taxa EFETIVA para FLUXOS (se df_cambio disponível)
        if df_cambio is not None and not df_cambio.empty and currency != 'BRL':
            try:
                from core.cambio_utils import build_effective_rate_series
                rate_series = build_effective_rate_series(df_cambio)
                if not rate_series.empty:
                    # Usar taxa efetiva para cada fluxo
                    fx_effective = pd.Series(index=idx, dtype=float)
                    for d in idx:
                        fx_effective.loc[d] = rate_series.asof(d) if not pd.isna(rate_series.asof(d)) else fx_market.loc[d]
                    fx_effective = fx_effective.fillna(fx_market)
                else:
                    fx_effective = fx_market
            except:
                fx_effective = fx_market
        else:
            fx_effective = fx_market
        
        # Converter para BRL
        # NAV: usa taxa de MERCADO (valor atual da carteira)
        # Flow: usa taxa EFETIVA (quanto realmente pagou em BRL)
        nav_brl = nav_cur * fx_market
        flow_brl = flow_cur * fx_effective
        income_brl = income_cur * fx_market  # Proventos usam taxa de mercado do dia
        
        # Acumular
        nav_total += nav_brl
        flow_total += flow_brl
        income_total += income_brl
        
        # Para force_zero e timing, usar OR e MAX respectivamente
        force_zero_combined = force_zero_combined | force_zero_cur.astype(bool)
        flow_timing_combined = np.maximum(flow_timing_combined, flow_timing_cur)
        
        # Breakdown (último valor)
        breakdown[currency] = nav_brl.iloc[-1] if len(nav_brl) > 0 else 0.0
    
    return ConsolidatedResult(
        nav_brl=nav_total,
        flow_brl=flow_total,
        income_brl=income_total,
        force_zero_series=force_zero_combined,
        flow_timing_series=flow_timing_combined,
        breakdown_by_currency=breakdown
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
    """
    if bucket1.currency != bucket2.currency:
        raise ValueError(f"Moedas diferentes: {bucket1.currency} vs {bucket2.currency}")
    
    # Unificar índices
    all_dates = set(bucket1.nav_series.index) | set(bucket2.nav_series.index)
    idx = pd.DatetimeIndex(sorted(all_dates))
    
    # Somar séries
    nav = bucket1.nav_series.reindex(idx).fillna(0) + bucket2.nav_series.reindex(idx).fillna(0)
    flow = bucket1.flow_series.reindex(idx).fillna(0) + bucket2.flow_series.reindex(idx).fillna(0)
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

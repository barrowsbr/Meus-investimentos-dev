"""
Return Decomposition Engine
============================

Decompõe o retorno total em BRL em duas camadas multiplicativas:

  R_total = (1 + R_ativo) × (1 + R_fx) − 1

Onde:
  R_ativo = TWR do ativo na moeda original (stock picking)
  R_fx    = retorno cambial (efeito da variação do câmbio)

Para ativos em BRL:
  R_fx = 0, R_total = R_ativo

Versão: 1.0.0
Data: 2026-02-11
"""

import pandas as pd
import numpy as np
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from core.performance.calculator import calculate_canonical_twr, DEFAULT_PREMISES, CanonicalTWRResult


# =============================================================================
# RESULT TYPES
# =============================================================================

@dataclass
class DecomposedReturn:
    """Retorno decomposto de um bucket de moeda."""
    currency: str

    # Retornos do período
    twr_asset: float        # TWR do ativo na moeda original
    twr_fx: float           # Retorno cambial acumulado
    twr_total: float        # (1 + R_asset) × (1 + R_fx) − 1
    twr_total_actual: float # TWR real calculado no consolidado BRL
    residual: float         # twr_total − twr_total_actual (erro de decomposição)

    # Séries temporais (diárias, acumuladas)
    cumret_asset: pd.Series   # Retorno acumulado do ativo
    cumret_fx: pd.Series      # Retorno acumulado FX
    cumret_total: pd.Series   # Retorno total multiplicativo

    # Detalhes
    fx_start: float           # Câmbio no início do período
    fx_end: float             # Câmbio no fim do período
    nav_native_start: float   # NAV em moeda original no início
    nav_native_end: float     # NAV em moeda original no fim

    # TWR completo do ativo (para métricas auxiliares)
    twr_result_native: Optional[CanonicalTWRResult] = None


@dataclass
class PortfolioDecomposition:
    """Decomposição completa do portfólio."""
    decompositions: Dict[str, DecomposedReturn]  # Por moeda
    total_twr_asset: float    # TWR ponderado dos ativos (ex-FX)
    total_twr_fx: float       # TWR ponderado do câmbio
    total_twr: float          # TWR total consolidado
    total_residual: float     # Resíduo da decomposição

    cumret_asset_total: pd.Series   # Série acumulada ponderada (asset)
    cumret_fx_total: pd.Series      # Série acumulada ponderada (FX)
    cumret_total: pd.Series         # Série total

    def to_summary_df(self) -> pd.DataFrame:
        """Retorna DataFrame resumo para exibição."""
        rows = []
        for curr, dec in self.decompositions.items():
            rows.append({
                'Moeda': curr,
                'R_ativo': dec.twr_asset,
                'R_fx': dec.twr_fx,
                'R_total_calc': dec.twr_total,
                'R_total_real': dec.twr_total_actual,
                'Residual': dec.residual,
                'FX_inicio': dec.fx_start,
                'FX_fim': dec.fx_end,
            })
        return pd.DataFrame(rows)


# =============================================================================
# CORE CALCULATION
# =============================================================================

def _calculate_fx_return_series(
    fx_series: pd.Series,
    index: pd.DatetimeIndex
) -> pd.Series:
    """
    Calcula retorno FX diário e acumulado.

    Parameters
    ----------
    fx_series : Série de câmbio (ex: USD/BRL)
    index : Índice de datas desejado

    Returns
    -------
    pd.Series : Retorno acumulado FX (base 0, tipo 1+r)
    """
    fx_aligned = fx_series.reindex(index).ffill().bfill()

    if fx_aligned.empty or fx_aligned.iloc[0] == 0:
        return pd.Series(0.0, index=index)

    # Retorno diário FX
    daily_fx_ret = fx_aligned.pct_change().fillna(0)

    # Acumulado
    cumret_fx = (1 + daily_fx_ret).cumprod() - 1

    return cumret_fx


def decompose_bucket_return(
    bucket,  # CurrencyBucket
    fx_series: pd.Series,
    consolidated_twr_result: Optional[CanonicalTWRResult] = None,
    premises=DEFAULT_PREMISES,
) -> DecomposedReturn:
    """
    Decompõe o retorno de um CurrencyBucket em componente ativo + FX.

    Parameters
    ----------
    bucket : CurrencyBucket com NAV/flows na moeda original
    fx_series : Série de câmbio para esta moeda (ex: USD/BRL)
    consolidated_twr_result : TWR já calculado no consolidado BRL (para comparação)
    premises : Premissas de TWR

    Returns
    -------
    DecomposedReturn
    """
    currency = bucket.currency
    is_brl = currency == 'BRL' or currency.endswith('_DIRECT')

    nav = bucket.nav_series
    if nav.empty:
        return _empty_decomposition(currency)

    idx = nav.index

    # ── 1. TWR do ativo na moeda original ─────────────────────────────
    df_engine = bucket.to_engine_input()
    twr_native = calculate_canonical_twr(df_engine, premises)
    twr_asset = twr_native.total_twr
    cumret_asset = twr_native.cumulative_series

    # ── 2. Retorno FX ─────────────────────────────────────────────────
    if is_brl:
        twr_fx = 0.0
        cumret_fx = pd.Series(0.0, index=idx)
        fx_start = 1.0
        fx_end = 1.0
    else:
        fx_aligned = fx_series.reindex(idx).ffill().bfill()
        fx_start = fx_aligned.iloc[0] if not fx_aligned.empty else 1.0
        fx_end = fx_aligned.iloc[-1] if not fx_aligned.empty else 1.0

        if fx_start > 0:
            twr_fx = fx_end / fx_start - 1.0
        else:
            twr_fx = 0.0

        cumret_fx = _calculate_fx_return_series(fx_series, idx)

    # ── 3. Retorno total multiplicativo ───────────────────────────────
    twr_total = (1 + twr_asset) * (1 + twr_fx) - 1

    # Série acumulada total = (1 + cumret_asset) × (1 + cumret_fx) − 1
    cumret_total = (1 + cumret_asset) * (1 + cumret_fx) - 1

    # ── 4. Comparação com TWR real consolidado ────────────────────────
    twr_total_actual = twr_total  # Default: assume equal
    if consolidated_twr_result is not None:
        twr_total_actual = consolidated_twr_result.total_twr

    residual = twr_total - twr_total_actual

    # NAV nativo
    nav_native_start = nav.iloc[0]
    nav_native_end = nav.iloc[-1]

    return DecomposedReturn(
        currency=currency,
        twr_asset=twr_asset,
        twr_fx=twr_fx,
        twr_total=twr_total,
        twr_total_actual=twr_total_actual,
        residual=residual,
        cumret_asset=cumret_asset,
        cumret_fx=cumret_fx,
        cumret_total=cumret_total,
        fx_start=fx_start,
        fx_end=fx_end,
        nav_native_start=nav_native_start,
        nav_native_end=nav_native_end,
        twr_result_native=twr_native,
    )


def decompose_portfolio(
    buckets: Dict,  # Dict[str, CurrencyBucket]
    fx_rates: Dict[str, pd.Series],
    consolidated_result: Optional[CanonicalTWRResult] = None,
    premises=DEFAULT_PREMISES,
) -> PortfolioDecomposition:
    """
    Decompõe o retorno do portfólio inteiro por camadas.

    Parameters
    ----------
    buckets : Dict de CurrencyBucket por moeda
    fx_rates : Dict de séries de câmbio
    consolidated_result : TWR consolidado em BRL (para validação)
    premises : Premissas de TWR

    Returns
    -------
    PortfolioDecomposition
    """
    decompositions = {}

    # Get common index from all buckets
    all_dates = set()
    total_nav_end = 0.0
    nav_end_by_currency = {}

    for currency, bucket in buckets.items():
        if not bucket.nav_series.empty:
            all_dates.update(bucket.nav_series.index)
            nav_last = bucket.nav_series.iloc[-1]
            base_curr = currency.replace('_DIRECT', '')
            if base_curr in fx_rates and base_curr != 'BRL' and not currency.endswith('_DIRECT'):
                fx_last = fx_rates[base_curr].asof(bucket.nav_series.index[-1])
                if pd.isna(fx_last):
                    fx_last = 1.0
                nav_brl = nav_last * fx_last
            elif currency == 'BRL':
                nav_brl = nav_last
            else:
                # DIRECT or unknown → use market FX
                base = currency.replace('_DIRECT', '')
                if base in fx_rates:
                    fx_last = fx_rates[base].asof(bucket.nav_series.index[-1])
                    if pd.isna(fx_last):
                        fx_last = 1.0
                    nav_brl = nav_last * fx_last
                else:
                    nav_brl = nav_last

            nav_end_by_currency[currency] = nav_brl
            total_nav_end += nav_brl

    if not all_dates:
        return _empty_portfolio_decomposition()

    common_idx = pd.DatetimeIndex(sorted(all_dates))

    # Decompose each bucket
    for currency, bucket in buckets.items():
        base_curr = currency.replace('_DIRECT', '')
        fx_series = fx_rates.get(base_curr, pd.Series(1.0, index=common_idx))
        dec = decompose_bucket_return(bucket, fx_series, premises=premises)
        decompositions[currency] = dec

    # ── DAILY CHAIN-LINKED PORTFOLIO DECOMPOSITION ─────────────────────
    # Instead of static end-of-period weighted averages (which diverge
    # badly over long periods), we:
    #   1. Compute each bucket's daily NAV in BRL
    #   2. Compute daily portfolio weights from NAV_BRL
    #   3. Compute weighted daily asset/FX returns
    #   4. Chain-link to get cumulative portfolio asset/FX returns

    # Step 1: Build daily NAV_BRL and daily returns for each bucket
    bucket_nav_brl = {}      # {curr: pd.Series of NAV in BRL}
    bucket_daily_asset = {}  # {curr: pd.Series of daily asset returns}
    bucket_daily_fx = {}     # {curr: pd.Series of daily FX returns}

    for curr, dec in decompositions.items():
        if dec.cumret_asset.empty:
            continue

        # Daily asset returns from cumulative
        cum_a = dec.cumret_asset.reindex(common_idx).ffill().fillna(0)
        daily_a = (1 + cum_a) / (1 + cum_a.shift(1).fillna(0)) - 1
        daily_a.iloc[0] = cum_a.iloc[0]  # first day = first cumret
        bucket_daily_asset[curr] = daily_a

        # Daily FX returns from cumulative
        cum_f = dec.cumret_fx.reindex(common_idx).ffill().fillna(0)
        daily_f = (1 + cum_f) / (1 + cum_f.shift(1).fillna(0)) - 1
        daily_f.iloc[0] = cum_f.iloc[0]
        bucket_daily_fx[curr] = daily_f

        # NAV in BRL = NAV_native × FX
        bucket = buckets[curr]
        nav_native = bucket.nav_series.reindex(common_idx).ffill().fillna(0)
        base_curr = curr.replace('_DIRECT', '')
        if base_curr in fx_rates and base_curr != 'BRL' and not curr.endswith('_DIRECT'):
            fx_s = fx_rates[base_curr].reindex(common_idx).ffill().bfill().fillna(1.0)
        elif curr == 'BRL' or curr.endswith('_DIRECT'):
            fx_s = pd.Series(1.0, index=common_idx)
        else:
            fx_s = pd.Series(1.0, index=common_idx)
        bucket_nav_brl[curr] = nav_native * fx_s

    # Step 2: Compute daily weights (start-of-day = previous day's NAV)
    if not bucket_nav_brl:
        return _empty_portfolio_decomposition()

    total_nav_brl_daily = sum(nav_s for nav_s in bucket_nav_brl.values())
    total_nav_brl_daily = total_nav_brl_daily.replace(0, np.nan).ffill().fillna(1)

    # Step 3: Daily weighted portfolio asset/FX returns
    portfolio_daily_asset = pd.Series(0.0, index=common_idx)
    portfolio_daily_fx = pd.Series(0.0, index=common_idx)

    for curr in bucket_daily_asset:
        # Weight = start of day NAV_BRL / total (use previous day)
        w = (bucket_nav_brl[curr].shift(1) / total_nav_brl_daily.shift(1)).fillna(0)
        # For first day, use current day weight
        if len(w) > 0:
            day0_total = total_nav_brl_daily.iloc[0]
            w.iloc[0] = bucket_nav_brl[curr].iloc[0] / day0_total if day0_total > 0 else 0

        portfolio_daily_asset += w * bucket_daily_asset[curr]
        portfolio_daily_fx += w * bucket_daily_fx[curr]

    # Step 4: Chain-link daily returns to cumulative
    cumret_asset_total = (1 + portfolio_daily_asset).cumprod() - 1
    cumret_fx_total = (1 + portfolio_daily_fx).cumprod() - 1

    # Final period returns
    total_twr_asset = cumret_asset_total.iloc[-1] if not cumret_asset_total.empty else 0.0
    total_twr_fx = cumret_fx_total.iloc[-1] if not cumret_fx_total.empty else 0.0

    # Total TWR from consolidated
    total_twr = consolidated_result.total_twr if consolidated_result else (
        (1 + total_twr_asset) * (1 + total_twr_fx) - 1
    )

    # Residual: difference between multiplicative reconstruction and actual
    total_residual = (1 + total_twr_asset) * (1 + total_twr_fx) - 1 - total_twr

    cumret_total = (1 + cumret_asset_total) * (1 + cumret_fx_total) - 1

    return PortfolioDecomposition(
        decompositions=decompositions,
        total_twr_asset=total_twr_asset,
        total_twr_fx=total_twr_fx,
        total_twr=total_twr,
        total_residual=total_residual,
        cumret_asset_total=cumret_asset_total,
        cumret_fx_total=cumret_fx_total,
        cumret_total=cumret_total,
    )


# =============================================================================
# HELPERS
# =============================================================================

def _empty_decomposition(currency: str) -> DecomposedReturn:
    empty_s = pd.Series(dtype=float)
    return DecomposedReturn(
        currency=currency,
        twr_asset=0.0, twr_fx=0.0, twr_total=0.0,
        twr_total_actual=0.0, residual=0.0,
        cumret_asset=empty_s, cumret_fx=empty_s, cumret_total=empty_s,
        fx_start=1.0, fx_end=1.0,
        nav_native_start=0.0, nav_native_end=0.0,
    )


def _empty_portfolio_decomposition() -> PortfolioDecomposition:
    empty_s = pd.Series(dtype=float)
    return PortfolioDecomposition(
        decompositions={},
        total_twr_asset=0.0, total_twr_fx=0.0,
        total_twr=0.0, total_residual=0.0,
        cumret_asset_total=empty_s,
        cumret_fx_total=empty_s,
        cumret_total=empty_s,
    )

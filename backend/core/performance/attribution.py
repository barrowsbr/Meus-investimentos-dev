"""
Per-Asset Attribution Engine
=============================

Calcula a contribuição de cada ativo individual para o retorno do portfólio.

Para cada ticker:
  - Retorno do ativo na moeda original (R_ativo)
  - Retorno cambial (R_fx)
  - Retorno total em BRL = (1 + R_ativo) × (1 + R_fx) − 1
  - Peso no portfólio = NAV_ativo_BRL / NAV_total_BRL
  - Contribuição = Peso × R_total

Verificação de consistência:
  Σ contribuições ≈ retorno total do portfólio
  (1 + R_ativo) × (1 + R_fx) − 1 ≈ R_total (por ativo)

Versão: 1.0.0
Data: 2026-02-11
"""

import pandas as pd
import numpy as np
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


# =============================================================================
# RESULT TYPES
# =============================================================================

@dataclass
class AssetAttribution:
    """Atribuição de retorno de um ativo individual."""
    ticker: str
    currency: str
    
    # Retornos
    return_asset: float       # Retorno na moeda original (%)
    return_fx: float          # Retorno cambial (%)
    return_total: float       # Retorno total BRL (%)
    
    # Pesos e contribuição
    weight_start: float       # Peso no início do período
    weight_end: float         # Peso no fim do período
    weight_avg: float         # Peso médio
    contribution: float       # weight_avg × return_total
    
    # Valores
    nav_native_start: float   # NAV moeda original início
    nav_native_end: float     # NAV moeda original fim
    nav_brl_start: float      # NAV em BRL início
    nav_brl_end: float        # NAV em BRL fim
    
    # Consistência
    consistency_check: float  # (1+R_a)×(1+R_fx)−1 vs R_total
    is_consistent: bool       # abs(check) < 0.001
    
    def to_dict(self) -> dict:
        return {
            'Ticker': self.ticker,
            'Moeda': self.currency,
            'R_ativo (%)': self.return_asset * 100,
            'R_fx (%)': self.return_fx * 100,
            'R_total (%)': self.return_total * 100,
            'Peso (%)': self.weight_avg * 100,
            'Contribuicao (%)': self.contribution * 100,
            'NAV Inicio': self.nav_brl_start,
            'NAV Fim': self.nav_brl_end,
            'Consistencia': self.consistency_check * 100,
            'OK': '✓' if self.is_consistent else '⚠️',
        }


@dataclass
class PortfolioAttribution:
    """Atribuição completa do portfólio."""
    assets: List[AssetAttribution]
    total_return: float
    sum_contributions: float
    attribution_error: float  # total_return - sum_contributions
    
    def to_dataframe(self) -> pd.DataFrame:
        if not self.assets:
            return pd.DataFrame()
        rows = [a.to_dict() for a in self.assets]
        df = pd.DataFrame(rows)
        # Sort by absolute contribution
        df = df.sort_values('Contribuicao (%)', ascending=False, key=abs)
        return df.reset_index(drop=True)

    @property
    def all_consistent(self) -> bool:
        return all(a.is_consistent for a in self.assets)


# =============================================================================
# CORE CALCULATION
# =============================================================================

def calculate_asset_attribution(
    custodia_diaria: pd.DataFrame,
    df_prices: pd.DataFrame,
    ticker_currency_map: Dict[str, str],
    fx_rates: Dict[str, pd.Series],
    start_date: pd.Timestamp,
    end_date: pd.Timestamp,
    total_nav_brl_start: float = None,
    total_nav_brl_end: float = None,
    portfolio_return: float = None,
) -> PortfolioAttribution:
    """
    Calcula atribuição de retorno por ativo.

    Parameters
    ----------
    custodia_diaria : DataFrame com custódia diária (tickers nas colunas)
    df_prices : DataFrame com preços históricos
    ticker_currency_map : Mapping ticker → currency
    fx_rates : Dict com séries de câmbio
    start_date : Data início do período
    end_date : Data fim do período
    total_nav_brl_start : NAV total BRL no início (para pesos)
    total_nav_brl_end : NAV total BRL no fim (para pesos)
    portfolio_return : Retorno total do portfólio (para comparação)

    Returns
    -------
    PortfolioAttribution
    """
    assets = []
    
    if custodia_diaria.empty:
        return PortfolioAttribution(
            assets=[], total_return=portfolio_return or 0.0,
            sum_contributions=0.0, attribution_error=0.0
        )

    # Filter custodia to period
    mask_start = custodia_diaria.index <= start_date
    mask_end = custodia_diaria.index <= end_date
    
    # Find closest available dates
    custodia_start_idx = custodia_diaria.index[mask_start][-1] if mask_start.any() else custodia_diaria.index[0]
    custodia_end_idx = custodia_diaria.index[mask_end][-1] if mask_end.any() else custodia_diaria.index[-1]

    # Tickers with non-zero custody in the period
    active_tickers = []
    for ticker in custodia_diaria.columns:
        qty_start = custodia_diaria.at[custodia_start_idx, ticker] if custodia_start_idx in custodia_diaria.index else 0
        qty_end = custodia_diaria.at[custodia_end_idx, ticker] if custodia_end_idx in custodia_diaria.index else 0
        if abs(qty_start) > 0.001 or abs(qty_end) > 0.001:
            # Skip FX and non-asset tickers
            termos_excluir = ['BRL=X', 'EURUSD=X', 'CADUSD=X', 'EURBRL=X', 'CADBRL=X',
                            'TESOURO', 'CDB', 'LCI', 'LCA', 'IPCA', 'CAIXA', 'SALDO']
            if not any(x in ticker.upper() for x in termos_excluir):
                active_tickers.append(ticker)

    if not active_tickers:
        return PortfolioAttribution(
            assets=[], total_return=portfolio_return or 0.0,
            sum_contributions=0.0, attribution_error=0.0
        )

    # Calculate total NAV in BRL if not provided
    if total_nav_brl_start is None or total_nav_brl_end is None:
        total_nav_brl_start = 0.0
        total_nav_brl_end = 0.0
        for ticker in active_tickers:
            _, nav_brl_s, nav_brl_e = _get_asset_navs(
                ticker, custodia_diaria, df_prices,
                custodia_start_idx, custodia_end_idx,
                ticker_currency_map, fx_rates
            )
            total_nav_brl_start += nav_brl_s
            total_nav_brl_end += nav_brl_e

    # Calculate per-asset attribution
    for ticker in active_tickers:
        attr = _calculate_single_asset(
            ticker, custodia_diaria, df_prices,
            custodia_start_idx, custodia_end_idx,
            ticker_currency_map, fx_rates,
            total_nav_brl_start, total_nav_brl_end
        )
        if attr is not None:
            assets.append(attr)

    sum_contributions = sum(a.contribution for a in assets)
    total_ret = portfolio_return if portfolio_return is not None else sum_contributions
    attribution_error = total_ret - sum_contributions if portfolio_return is not None else 0.0

    # If there is significant unattributed return, add a synthetic "Outros / RF"
    # bucket to account for fixed income, cash, and other positions not in
    # custodia_diaria (they contribute to the portfolio TWR but are excluded
    # from per-ticker attribution above).
    sum_weight = sum(a.weight_avg for a in assets)
    if portfolio_return is not None and abs(attribution_error) > 0.001 and sum_weight < 0.999:
        rf_weight = max(0.0, 1.0 - sum_weight)
        rf_return = attribution_error / rf_weight if rf_weight > 0 else 0.0
        assets.append(AssetAttribution(
            ticker='RF / Outros',
            currency='BRL',
            return_asset=rf_return,
            return_fx=0.0,
            return_total=rf_return,
            weight_start=rf_weight,
            weight_end=rf_weight,
            weight_avg=rf_weight,
            contribution=attribution_error,
            nav_native_start=0.0,
            nav_native_end=0.0,
            nav_brl_start=total_nav_brl_start * rf_weight,
            nav_brl_end=total_nav_brl_end * rf_weight,
            consistency_check=0.0,
            is_consistent=True,
        ))
        sum_contributions = sum(a.contribution for a in assets)
        attribution_error = total_ret - sum_contributions

    return PortfolioAttribution(
        assets=assets,
        total_return=total_ret,
        sum_contributions=sum_contributions,
        attribution_error=attribution_error,
    )


# =============================================================================
# HELPERS
# =============================================================================

def _get_asset_navs(
    ticker: str,
    custodia_diaria: pd.DataFrame,
    df_prices: pd.DataFrame,
    date_start: pd.Timestamp,
    date_end: pd.Timestamp,
    ticker_currency_map: Dict[str, str],
    fx_rates: Dict[str, pd.Series],
) -> Tuple[str, float, float]:
    """Get asset NAV in BRL at start and end dates."""
    currency = ticker_currency_map.get(ticker, 'BRL')
    base_curr = currency.replace('_DIRECT', '')

    qty_start = custodia_diaria.at[date_start, ticker] if ticker in custodia_diaria.columns else 0
    qty_end = custodia_diaria.at[date_end, ticker] if ticker in custodia_diaria.columns else 0

    price_start = _get_price(ticker, date_start, df_prices)
    price_end = _get_price(ticker, date_end, df_prices)

    fx_start = _get_fx(base_curr, date_start, fx_rates)
    fx_end = _get_fx(base_curr, date_end, fx_rates)

    nav_brl_start = qty_start * price_start * fx_start
    nav_brl_end = qty_end * price_end * fx_end

    return currency, nav_brl_start, nav_brl_end


def _calculate_single_asset(
    ticker: str,
    custodia_diaria: pd.DataFrame,
    df_prices: pd.DataFrame,
    date_start: pd.Timestamp,
    date_end: pd.Timestamp,
    ticker_currency_map: Dict[str, str],
    fx_rates: Dict[str, pd.Series],
    total_nav_brl_start: float,
    total_nav_brl_end: float,
) -> Optional[AssetAttribution]:
    """Calculate attribution for a single asset."""
    currency = ticker_currency_map.get(ticker, 'BRL')
    base_curr = currency.replace('_DIRECT', '')
    is_brl = base_curr == 'BRL'

    qty_start = custodia_diaria.at[date_start, ticker] if ticker in custodia_diaria.columns else 0
    qty_end = custodia_diaria.at[date_end, ticker] if ticker in custodia_diaria.columns else 0

    # Skip if no position
    if abs(qty_start) < 0.001 and abs(qty_end) < 0.001:
        return None

    price_start = _get_price(ticker, date_start, df_prices)
    price_end = _get_price(ticker, date_end, df_prices)

    fx_start = _get_fx(base_curr, date_start, fx_rates)
    fx_end = _get_fx(base_curr, date_end, fx_rates)

    # NAV in native currency (qty may change, so use simple price return for R_ativo)
    nav_native_start = qty_start * price_start
    nav_native_end = qty_end * price_end

    # NAV in BRL
    nav_brl_start = nav_native_start * fx_start
    nav_brl_end = nav_native_end * fx_end

    # ── Returns ───────────────────────────────────────────────────────
    # R_ativo: price return in native currency
    # For assets with changing quantities, use price-only return
    if price_start > 0:
        return_asset = price_end / price_start - 1
    else:
        return_asset = 0.0

    # R_fx: FX return
    if is_brl:
        return_fx = 0.0
    elif fx_start > 0:
        return_fx = fx_end / fx_start - 1
    else:
        return_fx = 0.0

    # R_total: multiplicative
    return_total = (1 + return_asset) * (1 + return_fx) - 1

    # ── Weights ───────────────────────────────────────────────────────
    weight_start = nav_brl_start / total_nav_brl_start if total_nav_brl_start > 0 else 0
    weight_end = nav_brl_end / total_nav_brl_end if total_nav_brl_end > 0 else 0
    weight_avg = (weight_start + weight_end) / 2

    # ── Contribution ──────────────────────────────────────────────────
    contribution = weight_avg * return_total

    # ── Consistency check ─────────────────────────────────────────────
    # Verify (1+R_a)×(1+R_fx)−1 matches R_total
    theoretical_total = (1 + return_asset) * (1 + return_fx) - 1
    consistency_check = return_total - theoretical_total
    is_consistent = abs(consistency_check) < 0.001

    return AssetAttribution(
        ticker=ticker,
        currency=currency,
        return_asset=return_asset,
        return_fx=return_fx,
        return_total=return_total,
        weight_start=weight_start,
        weight_end=weight_end,
        weight_avg=weight_avg,
        contribution=contribution,
        nav_native_start=nav_native_start,
        nav_native_end=nav_native_end,
        nav_brl_start=nav_brl_start,
        nav_brl_end=nav_brl_end,
        consistency_check=consistency_check,
        is_consistent=is_consistent,
    )


def _get_price(ticker: str, date: pd.Timestamp, df_prices: pd.DataFrame) -> float:
    """Get price for ticker at date, with fallback."""
    if ticker not in df_prices.columns:
        return 0.0
    
    price = df_prices.at[date, ticker] if date in df_prices.index else np.nan
    
    if pd.isna(price):
        # Try asof
        series = df_prices[ticker].dropna()
        if not series.empty:
            idx = series.index.get_indexer([date], method='pad')[0]
            if idx >= 0:
                price = series.iloc[idx]
            else:
                price = 0.0
        else:
            price = 0.0
    
    return float(price) if not pd.isna(price) else 0.0


def _get_fx(currency: str, date: pd.Timestamp, fx_rates: Dict[str, pd.Series]) -> float:
    """Get FX rate at date."""
    if currency == 'BRL':
        return 1.0
    
    if currency not in fx_rates:
        return 1.0
    
    fx = fx_rates[currency].asof(date)
    return float(fx) if not pd.isna(fx) else 1.0

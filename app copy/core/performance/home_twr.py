"""
home_twr.py
===========
Cached TWR computation for the Home page chart.
Reuses the exact same engine pipeline as Performance Advanced.
"""
from __future__ import annotations

import streamlit as st
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional, Tuple


@st.cache_data(ttl=3600, show_spinner=False)
def get_home_twr_series() -> Tuple[Optional[pd.Series], float, float]:
    """
    Returns (cumulative_series, total_twr, annualized_twr).
    cumulative_series: DatetimeIndex → decimal return (0.52 = +52%)
    Returns (None, 0.0, 0.0) on any failure.
    """
    try:
        from core.data.loader import (
            load_assets, load_proventos, load_fixed_income,
            load_cambio, load_fixed_income_manual,
        )
        from core.data.market import fetch_historical_data
        from core.engine import reconstruct_history_multicurrency
        from core.consolidator import consolidate_to_brl
        from core.performance.calculator import calculate_canonical_twr, DEFAULT_PREMISES

        df_assets = load_assets()
        if df_assets.empty:
            return None, 0.0, 0.0

        df_proventos    = load_proventos()
        df_rf_raw       = load_fixed_income()
        df_cambio       = load_cambio()
        df_rf_manual    = load_fixed_income_manual()

        # Process manual RF — same logic as Performance Advanced _load_all_data()
        manual_rf_values: dict = {}
        df_rf_no_cash = pd.DataFrame()
        CASH_TICKERS = ['CAIXA', 'SALDO', 'CASH']
        if not df_rf_manual.empty:
            df_rf_manual['Atual'] = pd.to_numeric(df_rf_manual['Atual'], errors='coerce').fillna(0)
            df_rf_manual = df_rf_manual[df_rf_manual['Atual'] > 0]
            df_rf_no_cash = df_rf_manual[
                ~df_rf_manual['Ticker'].astype(str).str.strip().str.upper().isin(CASH_TICKERS)
            ]
            manual_rf_values = (
                df_rf_no_cash
                .groupby(df_rf_no_cash['Ticker'].astype(str).str.strip().str.upper())['Atual']
                .sum()
                .to_dict()
            )

        # Filter CAIXA from RF raw transactions
        df_rf_filtered = df_rf_raw.copy()
        if not df_rf_filtered.empty and 'Ticker' in df_rf_filtered.columns:
            mask = df_rf_filtered['Ticker'].astype(str).str.strip().str.upper().isin(CASH_TICKERS)
            df_rf_filtered = df_rf_filtered[~mask]

        # Tickers to download for historical prices
        exclude_terms = ['TESOURO', 'CDB', 'LCI', 'LCA', 'IPCA', 'CAIXA', 'SALDO', 'CDI']
        tickers_dl = [
            t for t in df_assets['ticker'].unique()
            if not any(x in str(t).upper() for x in exclude_terms)
        ]
        tickers_dl = list(set(tickers_dl + ['BRL=X', 'EURUSD=X', 'CADUSD=X']))

        min_date = datetime.now() - timedelta(days=365 * 5)
        asset_dates = pd.to_datetime(df_assets['data'], errors='coerce').dropna()
        if not asset_dates.empty:
            min_date = min(min_date, asset_dates.min().to_pydatetime())

        df_hist_prices = fetch_historical_data(tickers_dl, min_date)
        if df_hist_prices.empty:
            return None, 0.0, 0.0

        days_lookback = (datetime.now() - min_date).days + 10

        multi_result = reconstruct_history_multicurrency(
            df_bruto=df_assets.copy(),
            df_proventos=df_proventos,
            days_lookback=days_lookback,
            df_prices_external=df_hist_prices,
            df_rf_raw=df_rf_filtered,
            df_cambio=df_cambio,
            manual_rf_values=manual_rf_values,
        )

        consolidated = consolidate_to_brl(
            multi_result.buckets,
            multi_result.fx_rates,
            df_cambio=df_cambio,
        )
        df_engine = consolidated.to_engine_input()

        # Clean: start from first positive NAV, forward-fill zeros
        first_valid = (
            df_engine[df_engine['nav'] > 0].first_valid_index()
            if 'nav' in df_engine.columns else None
        )
        if first_valid is not None:
            df_engine = df_engine.loc[first_valid:]
        if 'nav' in df_engine.columns:
            df_engine['nav'] = df_engine['nav'].replace(0, float('nan')).ffill().fillna(0)

        if df_engine.empty or len(df_engine) < 2:
            return None, 0.0, 0.0

        twr_result = calculate_canonical_twr(df_engine, DEFAULT_PREMISES)
        return (
            twr_result.cumulative_series,
            float(twr_result.total_twr),
            float(getattr(twr_result, 'annualized_twr', 0.0)),
        )

    except Exception:
        return None, 0.0, 0.0

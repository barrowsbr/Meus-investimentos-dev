"""
FX Cost Basis Calculator
========================
Calculates rolling weighted-average FX cost from remittance history.

This module enables the "My Money" view in Performance, which shows
returns based on actual BRL spent (not market FX rates at purchase time).
"""

import pandas as pd
import numpy as np
from typing import Dict, Optional
from datetime import datetime


def build_fx_cost_series(
    df_cambio: pd.DataFrame,
    idx_dates: pd.DatetimeIndex,
    target_currencies: Optional[list] = None
) -> Dict[str, pd.Series]:
    """
    Build time series of cumulative weighted-average FX cost basis.
    
    For each day in idx_dates, calculates the weighted average cost of 
    converting BRL to each foreign currency based on all remittances up to that date.
    
    Parameters
    ----------
    df_cambio : pd.DataFrame
        Remittance history with columns: data, moeda_origem, moeda_destino, 
        valor_origem (BRL), valor_destino (foreign), taxa (optional)
    idx_dates : pd.DatetimeIndex
        Date range to build the series for
    target_currencies : list, optional
        Currencies to calculate (default: ['USD', 'EUR', 'CAD'])
        
    Returns
    -------
    Dict[str, pd.Series]
        {currency: cost_basis_series} where each series has the weighted avg
        FX cost for that currency over time
        
    Example
    -------
    If you sent R$50,000 to get $10,000 (rate 5.00) on Jan 1,
    and R$30,000 to get $5,500 (rate 5.45) on Feb 1,
    your weighted avg on Feb 1 is: 80,000 / 15,500 = 5.16
    """
    if target_currencies is None:
        target_currencies = ['USD', 'EUR', 'CAD']
    
    result = {}
    
    if df_cambio.empty:
        # Return empty series for each currency
        for curr in target_currencies:
            result[curr] = pd.Series(dtype=float, index=idx_dates)
        return result
    
    # Normalize date column
    df = df_cambio.copy()
    if 'data' not in df.columns:
        for curr in target_currencies:
            result[curr] = pd.Series(dtype=float, index=idx_dates)
        return result
    
    df['data'] = pd.to_datetime(df['data'])
    df = df.sort_values('data')
    
    # Normalize currency columns
    if 'moeda_destino' in df.columns:
        df['moeda_destino'] = df['moeda_destino'].astype(str).str.strip().str.upper()
    else:
        for curr in target_currencies:
            result[curr] = pd.Series(dtype=float, index=idx_dates)
        return result
    
    # Process each currency
    for currency in target_currencies:
        # Filter remittances for this currency (BRL -> CURRENCY)
        mask = (df['moeda_destino'] == currency)
        if 'moeda_origem' in df.columns:
            mask &= (df['moeda_origem'].astype(str).str.strip().str.upper() == 'BRL')
        
        df_curr = df[mask].copy()
        
        if df_curr.empty:
            result[currency] = pd.Series(np.nan, index=idx_dates)
            continue
        
        # Ensure numeric columns
        for col in ['valor_origem', 'valor_destino']:
            if col in df_curr.columns:
                df_curr[col] = pd.to_numeric(df_curr[col], errors='coerce').fillna(0)
        
        if 'valor_origem' not in df_curr.columns or 'valor_destino' not in df_curr.columns:
            result[currency] = pd.Series(np.nan, index=idx_dates)
            continue
        
        # Build cumulative cost basis
        cost_series = pd.Series(dtype=float, index=idx_dates)
        
        # Running totals
        total_brl = 0.0
        total_foreign = 0.0
        
        for dt in idx_dates:
            # Add remittances up to this date (inclusive)
            remittances_until_dt = df_curr[df_curr['data'] <= dt]
            
            if not remittances_until_dt.empty:
                total_brl = remittances_until_dt['valor_origem'].sum()
                total_foreign = remittances_until_dt['valor_destino'].sum()
            
            # Calculate weighted average cost
            if total_foreign > 0:
                cost_series[dt] = total_brl / total_foreign
            else:
                cost_series[dt] = np.nan
        
        result[currency] = cost_series
    
    return result


def get_latest_cost_basis(df_cambio: pd.DataFrame) -> Dict[str, float]:
    """
    Get the current (latest) weighted-average FX cost for each currency.
    
    Simpler function for quick access to current cost basis.
    
    Returns
    -------
    Dict[str, float]
        {currency: current_weighted_avg_cost}
    """
    if df_cambio.empty:
        return {'USD': np.nan, 'EUR': np.nan, 'CAD': np.nan}
    
    today = pd.Timestamp(datetime.now().date())
    idx = pd.DatetimeIndex([today])
    
    series_dict = build_fx_cost_series(df_cambio, idx)
    
    result = {}
    for curr, series in series_dict.items():
        if not series.empty and not pd.isna(series.iloc[0]):
            result[curr] = series.iloc[0]
        else:
            result[curr] = np.nan
    
    return result


def get_cost_basis_summary(df_cambio: pd.DataFrame) -> pd.DataFrame:
    """
    Get summary of FX remittance history with totals and averages.
    
    Returns
    -------
    pd.DataFrame
        Summary with columns: Currency, Total BRL, Total Foreign, Avg Rate
    """
    if df_cambio.empty:
        return pd.DataFrame()
    
    df = df_cambio.copy()
    if 'moeda_destino' not in df.columns:
        return pd.DataFrame()
    
    df['moeda_destino'] = df['moeda_destino'].astype(str).str.strip().str.upper()
    
    for col in ['valor_origem', 'valor_destino']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    # Group by destination currency
    summary = df.groupby('moeda_destino').agg({
        'valor_origem': 'sum',
        'valor_destino': 'sum'
    }).reset_index()
    
    summary.columns = ['Currency', 'Total BRL', 'Total Foreign']
    summary['Avg Rate'] = summary['Total BRL'] / summary['Total Foreign']
    summary['Avg Rate'] = summary['Avg Rate'].round(4)
    
    return summary

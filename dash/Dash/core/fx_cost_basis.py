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


def calculate_period_costs(
    df_cambio: pd.DataFrame,
    start_date: pd.Timestamp,
    end_date: pd.Timestamp,
    target_currencies: Optional[list] = None
) -> Dict[str, Dict[str, float]]:
    """
    Calculate FX cost basis split by:
    1. Initial Stock (Weighted Avg of all remittances BEFORE start_date)
    2. Period Flow (Weighted Avg of remittances BETWEEN start_date and end_date)
    
    Returns
    -------
    Dict[str, Dict[str, float]]
        {
            'USD': {'initial_cost': 5.00, 'period_cost': 5.20},
            'EUR': ...
        }
    """
    if target_currencies is None:
        target_currencies = ['USD', 'EUR', 'CAD']
        
    result = {}
    
    if df_cambio.empty:
        for curr in target_currencies:
            result[curr] = {'initial_cost': 0.0, 'period_cost': 0.0}
        return result
        
    df = df_cambio.copy()
    if 'data' not in df.columns:
        return {}
        
    df['data'] = pd.to_datetime(df['data'])
    
    # Normalize currency
    if 'moeda_destino' in df.columns:
        df['moeda_destino'] = df['moeda_destino'].astype(str).str.strip().str.upper()
    
    for col in ['valor_origem', 'valor_destino']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
            
    for curr in target_currencies:
        # Filter for this currency (BRL -> CURRENCY only)
        mask_curr = df['moeda_destino'] == curr
        if 'moeda_origem' in df.columns:
            mask_curr &= (df['moeda_origem'].astype(str).str.strip().str.upper() == 'BRL')
        df_curr = df[mask_curr]
        
        # 1. Initial Stock (Before Start Date)
        mask_initial = df_curr['data'] < start_date
        df_initial = df_curr[mask_initial]
        
        initial_cost = 0.0
        if not df_initial.empty:
            tot_brl = df_initial['valor_origem'].sum()
            tot_foreign = df_initial['valor_destino'].sum()
            if tot_foreign > 0:
                initial_cost = tot_brl / tot_foreign
                
        # 2. Period Flow (Start Date <= data <= End Date)
        mask_period = (df_curr['data'] >= start_date) & (df_curr['data'] <= end_date)
        df_period = df_curr[mask_period]
        
        period_cost = 0.0
        if not df_period.empty:
            tot_brl = df_period['valor_origem'].sum()
            tot_foreign = df_period['valor_destino'].sum()
            if tot_foreign > 0:
                period_cost = tot_brl / tot_foreign
                
        result[curr] = {
            'initial_cost': initial_cost,
            'period_cost': period_cost
        }
        
    return result


def calculate_chained_costs(
    df_cambio: pd.DataFrame,
    start_date: pd.Timestamp,
    end_date: pd.Timestamp,
    target_currencies: Optional[list] = None
) -> Dict[str, Dict[str, float]]:
    """
    Calculate FX cost basis with CHAINED conversions.
    
    Handles scenarios like BRL -> USD -> EUR by tracking the implicit
    BRL cost through intermediate currencies.
    
    For each currency pool, we track:
    - total_brl: Total BRL spent to acquire this currency (directly or indirectly)
    - total_units: Total units of this currency acquired
    
    When converting X -> Y:
    - BRL cost transferred = units_X_spent × (pool_X_brl / pool_X_units)
    - X pool decreases, Y pool increases with inherited BRL cost
    
    Returns
    -------
    Dict[str, Dict[str, float]]
        {
            'USD': {'initial_cost': 5.50, 'period_cost': 5.60},
            'EUR': {'initial_cost': 6.10, 'period_cost': 6.20},  # Inherited from USD
            'CAD': ...
        }
    """
    if target_currencies is None:
        target_currencies = ['USD', 'EUR', 'CAD']
    
    # Initialize pools
    pools = {curr: {'total_brl': 0.0, 'total_units': 0.0} for curr in target_currencies}
    
    if df_cambio.empty:
        return {curr: {'initial_cost': 0.0, 'period_cost': 0.0} for curr in target_currencies}
    
    df = df_cambio.copy()
    if 'data' not in df.columns:
        return {curr: {'initial_cost': 0.0, 'period_cost': 0.0} for curr in target_currencies}
    
    df['data'] = pd.to_datetime(df['data'])
    df = df.sort_values('data')
    
    # Normalize columns
    for col in ['moeda_origem', 'moeda_destino']:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip().str.upper()
    
    for col in ['valor_origem', 'valor_destino']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    def get_avg_cost(curr):
        """Get current average BRL cost per unit for a currency."""
        if pools[curr]['total_units'] > 0:
            return pools[curr]['total_brl'] / pools[curr]['total_units']
        return 0.0
    
    def process_conversion(row):
        """Process a single FX conversion and update pools."""
        origem = row.get('moeda_origem', '')
        destino = row.get('moeda_destino', '')
        val_origem = row.get('valor_origem', 0)
        val_destino = row.get('valor_destino', 0)
        
        if val_destino <= 0:
            return
        
        if destino not in target_currencies:
            return
        
        if origem == 'BRL':
            # Direct BRL -> Currency: Add directly
            pools[destino]['total_brl'] += val_origem
            pools[destino]['total_units'] += val_destino
            
        elif origem in target_currencies:
            # Currency -> Currency: Inherit BRL cost from source
            # Calculate BRL cost of the source currency being spent
            src_avg_cost = get_avg_cost(origem)
            brl_transferred = val_origem * src_avg_cost
            
            # Reduce source pool
            if pools[origem]['total_units'] > 0:
                fraction_used = min(val_origem / pools[origem]['total_units'], 1.0)
                pools[origem]['total_brl'] -= pools[origem]['total_brl'] * fraction_used
                pools[origem]['total_units'] -= val_origem
                
                # Prevent negative values due to floating point
                pools[origem]['total_brl'] = max(0, pools[origem]['total_brl'])
                pools[origem]['total_units'] = max(0, pools[origem]['total_units'])
            
            # Add to destination pool with inherited BRL cost
            pools[destino]['total_brl'] += brl_transferred
            pools[destino]['total_units'] += val_destino
    
    # Snapshot pools at different points
    initial_pools = {curr: {'total_brl': 0.0, 'total_units': 0.0} for curr in target_currencies}
    period_pools = {curr: {'total_brl': 0.0, 'total_units': 0.0} for curr in target_currencies}
    
    # Process all conversions BEFORE start_date for initial cost
    df_before = df[df['data'] < start_date]
    for _, row in df_before.iterrows():
        process_conversion(row)
    
    # Snapshot initial pools
    for curr in target_currencies:
        initial_pools[curr] = pools[curr].copy()
    
    # Reset pools for period calculation (start fresh for period-only view)
    period_pools_start = {curr: pools[curr].copy() for curr in target_currencies}
    
    # Process conversions DURING the period
    df_period = df[(df['data'] >= start_date) & (df['data'] <= end_date)]
    for _, row in df_period.iterrows():
        process_conversion(row)
    
    # Calculate period-only contributions
    for curr in target_currencies:
        period_pools[curr]['total_brl'] = pools[curr]['total_brl'] - period_pools_start[curr]['total_brl']
        period_pools[curr]['total_units'] = pools[curr]['total_units'] - period_pools_start[curr]['total_units']
    
    # Build result
    result = {}
    for curr in target_currencies:
        # Initial cost (from beginning of time to start_date)
        initial_cost = 0.0
        if initial_pools[curr]['total_units'] > 0:
            initial_cost = initial_pools[curr]['total_brl'] / initial_pools[curr]['total_units']
        
        # Period cost (only from period contributions)
        period_cost = 0.0
        if period_pools[curr]['total_units'] > 0:
            period_cost = period_pools[curr]['total_brl'] / period_pools[curr]['total_units']
        
        result[curr] = {
            'initial_cost': initial_cost,
            'period_cost': period_cost
        }
    
    return result

"""
FX Cost Basis Calculator
========================
Calculates rolling weighted-average FX cost from remittance history.

This module enables the "My Money" view in Performance, which shows
returns based on actual BRL spent (not market FX rates at purchase time).
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from dataclasses import dataclass, field


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


def calculate_period_pm_with_reset(
    df_cambio: pd.DataFrame,
    df_assets: pd.DataFrame,
    start_date: pd.Timestamp,
    end_date: pd.Timestamp,
    market_fx_first_day: Dict[str, float],
    target_currencies: Optional[list] = None
) -> Dict[str, Dict[str, float]]:
    """
    Calculate FX cost basis with PERIOD RESET logic.

    This is different from the cumulative PM approach:
    - Initial position (assets held before start_date) uses MARKET FX rate of first day
    - New remittances during period use actual weighted average
    - Asset purchases without FX remittance use first day market rate
    - Asset sales crystallize at the sale day's FX rate (reduces base)

    Parameters
    ----------
    df_cambio : pd.DataFrame
        Remittance history
    df_assets : pd.DataFrame
        Asset transaction history (to detect buys/sells in foreign currency)
    start_date : pd.Timestamp
        Period start date
    end_date : pd.Timestamp
        Period end date
    market_fx_first_day : Dict[str, float]
        Market FX rates on the first day of period {'USD': 5.50, 'EUR': 6.10, ...}
    target_currencies : list, optional
        Currencies to calculate (default: ['USD', 'EUR', 'CAD'])

    Returns
    -------
    Dict[str, Dict[str, float]]
        {
            'USD': {
                'pm_periodo': 5.25,           # Weighted avg for period analysis
                'posicao_inicial_qtd': 10000, # Foreign units held at start
                'aportes_periodo_qtd': 2000,  # Foreign units added in period
                'vendas_periodo_qtd': 500,    # Foreign units sold in period
            },
            ...
        }
    """
    if target_currencies is None:
        target_currencies = ['USD', 'EUR', 'CAD']

    result = {}

    # Normalize dataframes
    df_c = df_cambio.copy() if not df_cambio.empty else pd.DataFrame()
    df_a = df_assets.copy() if not df_assets.empty else pd.DataFrame()

    if not df_c.empty and 'data' in df_c.columns:
        df_c['data'] = pd.to_datetime(df_c['data'])
        df_c = df_c.sort_values('data')
        for col in ['moeda_origem', 'moeda_destino']:
            if col in df_c.columns:
                df_c[col] = df_c[col].astype(str).str.strip().str.upper()
        for col in ['valor_origem', 'valor_destino']:
            if col in df_c.columns:
                df_c[col] = pd.to_numeric(df_c[col], errors='coerce').fillna(0)

    if not df_a.empty and 'data' in df_a.columns:
        df_a['data'] = pd.to_datetime(df_a['data'])
        df_a = df_a.sort_values('data')
        if 'moeda' in df_a.columns:
            df_a['moeda'] = df_a['moeda'].astype(str).str.strip().str.upper()
        if 'tipo' in df_a.columns:
            df_a['tipo'] = df_a['tipo'].astype(str).str.strip().str.lower()
        for col in ['quantidade', 'preco', 'total']:
            if col in df_a.columns:
                df_a[col] = pd.to_numeric(df_a[col], errors='coerce').fillna(0)

    for currency in target_currencies:
        market_rate_1st = market_fx_first_day.get(currency, 0.0)

        # 1. Calculate initial position = VALUE OF ASSETS in foreign currency (before start_date)
        # This is the net position in assets (buys - sells), NOT cash
        initial_fx_qty = 0.0
        if not df_a.empty and 'moeda' in df_a.columns:
            mask_assets_before = (df_a['data'] < start_date) & (df_a['moeda'] == currency)
            df_assets_before = df_a[mask_assets_before]

            for _, row in df_assets_before.iterrows():
                tipo = row.get('tipo', '')
                total_op = row.get('total', 0)
                if total_op <= 0:
                    total_op = row.get('quantidade', 0) * row.get('preco', 0)

                # Compra adiciona à posição, Venda reduz
                if 'compra' in tipo or 'buy' in tipo:
                    initial_fx_qty += total_op
                elif 'venda' in tipo or 'sell' in tipo:
                    initial_fx_qty -= total_op

        initial_fx_qty = max(0, initial_fx_qty)  # Can't be negative

        # 2. Remittances DURING period
        period_remit_brl = 0.0
        period_remit_fx = 0.0
        if not df_c.empty and 'moeda_destino' in df_c.columns:
            mask_period = (df_c['data'] >= start_date) & (df_c['data'] <= end_date) & (df_c['moeda_destino'] == currency)
            if 'moeda_origem' in df_c.columns:
                mask_period &= (df_c['moeda_origem'] == 'BRL')
            period_remit_brl = df_c.loc[mask_period, 'valor_origem'].sum()
            period_remit_fx = df_c.loc[mask_period, 'valor_destino'].sum()

        # 3. Asset transactions DURING period (affects position but uses 1st day rate if no remittance)
        period_buys_fx = 0.0  # Foreign currency used for purchases
        period_sales_fx = 0.0  # Foreign currency received from sales
        period_sales_brl_crystallized = 0.0  # BRL value crystallized at sale time

        if not df_a.empty and 'moeda' in df_a.columns:
            mask_assets_period = (df_a['data'] >= start_date) & (df_a['data'] <= end_date) & (df_a['moeda'] == currency)
            df_assets_period = df_a[mask_assets_period]

            for _, row in df_assets_period.iterrows():
                tipo = row.get('tipo', '')
                total_op = row.get('total', 0)
                if total_op <= 0:
                    total_op = row.get('quantidade', 0) * row.get('preco', 0)

                if 'compra' in tipo or 'buy' in tipo:
                    period_buys_fx += total_op
                elif 'venda' in tipo or 'sell' in tipo:
                    period_sales_fx += total_op
                    # Crystallize at market rate (ideally would use rate of sale day)
                    # For simplicity, use first day rate here
                    period_sales_brl_crystallized += total_op * market_rate_1st

        # 4. Calculate weighted average PM for the period
        # Formula: (Initial_qty * Market_1st_day + Period_remit_BRL) / (Initial_qty + Period_remit_FX)

        # Numerator: BRL "invested" in the period view
        brl_initial = initial_fx_qty * market_rate_1st  # Reset: use market rate
        brl_period_remit = period_remit_brl             # Actual BRL spent on remittances
        # Purchases without new remittance use 1st day rate
        brl_period_buys_no_remit = max(0, period_buys_fx - period_remit_fx) * market_rate_1st

        total_brl_base = brl_initial + brl_period_remit + brl_period_buys_no_remit

        # Adjust for sales (reduce base proportionally)
        # When you sell, you crystallize that portion at the sale rate
        # The remaining base continues with the PM
        total_fx_base = initial_fx_qty + period_remit_fx + max(0, period_buys_fx - period_remit_fx) - period_sales_fx

        # Calculate PM
        pm_periodo = 0.0
        if total_fx_base > 0:
            # Adjust BRL base for sales (remove proportional BRL)
            if (initial_fx_qty + period_remit_fx + max(0, period_buys_fx - period_remit_fx)) > 0:
                sale_fraction = period_sales_fx / (initial_fx_qty + period_remit_fx + max(0, period_buys_fx - period_remit_fx))
                brl_removed_by_sales = total_brl_base * min(sale_fraction, 1.0)
                total_brl_base -= brl_removed_by_sales

            pm_periodo = total_brl_base / total_fx_base if total_fx_base > 0 else market_rate_1st
        else:
            pm_periodo = market_rate_1st  # Fallback

        # Calculate purchases without corresponding remittance (use 1st day rate)
        compras_sem_remessa_fx = max(0, period_buys_fx - period_remit_fx)
        compras_sem_remessa_brl = compras_sem_remessa_fx * market_rate_1st

        result[currency] = {
            'pm_periodo': round(pm_periodo, 4),
            'posicao_inicial_qtd': round(initial_fx_qty, 2),
            'aportes_periodo_qtd': round(period_remit_fx, 2),
            'aportes_periodo_brl': round(period_remit_brl, 2),
            'compras_periodo_fx': round(period_buys_fx, 2),
            'vendas_periodo_fx': round(period_sales_fx, 2),
            'market_rate_1st_day': market_rate_1st,
            'posicao_final_fx': round(total_fx_base, 2),
            'compras_sem_remessa_fx': round(compras_sem_remessa_fx, 2),
            'compras_sem_remessa_brl': round(compras_sem_remessa_brl, 2),
        }

    return result


def build_period_fx_series(
    df_cambio: pd.DataFrame,
    df_assets: pd.DataFrame,
    idx_dates: pd.DatetimeIndex,
    start_date: pd.Timestamp,
    market_fx_first_day: Dict[str, float],
    target_currencies: Optional[list] = None
) -> Dict[str, pd.Series]:
    """
    Build time series of FX cost basis using PERIOD RESET logic.

    For each day in idx_dates (within the period), calculates the running
    weighted average PM considering:
    - Initial position valued at market rate of first day
    - Remittances up to that day valued at actual cost

    This is used for "Meu Dinheiro" view with period filters.

    Parameters
    ----------
    df_cambio, df_assets, idx_dates, start_date, market_fx_first_day, target_currencies

    Returns
    -------
    Dict[str, pd.Series]
        {currency: pm_series} where each series has the PM for that currency over time
    """
    if target_currencies is None:
        target_currencies = ['USD', 'EUR', 'CAD']

    result = {}

    for currency in target_currencies:
        # Get period PM calculation for each date in the series
        pm_series = pd.Series(dtype=float, index=idx_dates)

        for dt in idx_dates:
            if dt < start_date:
                # Before period start, use market rate
                pm_series[dt] = market_fx_first_day.get(currency, np.nan)
            else:
                # Calculate PM up to this date
                period_result = calculate_period_pm_with_reset(
                    df_cambio, df_assets, start_date, dt,
                    market_fx_first_day, [currency]
                )
                pm_series[dt] = period_result.get(currency, {}).get('pm_periodo', np.nan)

        result[currency] = pm_series

    return result


# =============================================================================
# FIFO Cross-Currency Accounting
# =============================================================================

@dataclass
class FXLot:
    """Um lote individual de moeda estrangeira adquirido."""
    date: pd.Timestamp
    qty: float           # Quantidade em moeda estrangeira
    brl_cost: float      # Custo total em BRL deste lote
    origin: str = 'BRL'  # De onde veio ('BRL', 'USD', 'EUR', etc.)

    @property
    def pm(self) -> float:
        """Preço médio em BRL por unidade desta moeda."""
        return self.brl_cost / self.qty if self.qty > 0 else 0.0


@dataclass
class FIFOPool:
    """Pool de lotes de uma moeda, gerenciado por FIFO."""
    currency: str
    lots: List[FXLot] = field(default_factory=list)

    @property
    def total_qty(self) -> float:
        return sum(lot.qty for lot in self.lots)

    @property
    def total_brl(self) -> float:
        return sum(lot.brl_cost for lot in self.lots)

    @property
    def pm(self) -> float:
        """PM ponderado atual (R$/unidade)."""
        q = self.total_qty
        return self.total_brl / q if q > 0 else 0.0

    def add_lot(self, lot: FXLot):
        self.lots.append(lot)

    def consume_fifo(self, qty: float) -> Tuple[float, float]:
        """
        Remove `qty` unidades pelo método FIFO.

        Retorna (brl_cost_consumed, qty_actually_consumed).
        Se o pool não tiver estoque suficiente, consome tudo o que houver.
        """
        remaining = qty
        brl_consumed = 0.0

        new_lots = []
        for lot in self.lots:
            if remaining <= 0:
                new_lots.append(lot)
                continue

            if lot.qty <= remaining:
                brl_consumed += lot.brl_cost
                remaining -= lot.qty
                # Lote totalmente consumido — descartado
            else:
                # Lote parcialmente consumido
                fraction = remaining / lot.qty
                brl_consumed += lot.brl_cost * fraction
                new_lot = FXLot(
                    date=lot.date,
                    qty=lot.qty - remaining,
                    brl_cost=lot.brl_cost * (1 - fraction),
                    origin=lot.origin,
                )
                new_lots.append(new_lot)
                remaining = 0

        self.lots = new_lots
        qty_consumed = qty - remaining
        return brl_consumed, qty_consumed


def calculate_cross_currency_fifo(
    df_cambio: pd.DataFrame,
    df_market_rates: Optional[pd.DataFrame] = None,
    target_currencies: Optional[List[str]] = None,
) -> Dict:
    """
    Calcula o custo de câmbio usando FIFO para conversões cross-currency.

    Regras aplicadas:
    1. BRL → Moeda: cria novo lote com PM = BRL_gasto / qtd_recebida.
    2. Moeda A → Moeda B (cross-currency):
       - Baixa de A via FIFO (quantidade consumida de A).
       - PM da A não se altera (apenas lotes antigos são consumidos).
       - Ganho/Perda realizado = valor de mercado de A no dia − custo BRL FIFO de A.
       - PM de B (adquirida) = custo BRL herdado de A / qtd de B recebida.
         Se não houver taxa de mercado disponível, usa o custo herdado diretamente.

    Parâmetros
    ----------
    df_cambio : pd.DataFrame
        Histórico de câmbio com colunas normalizadas (data, moeda_origem,
        moeda_destino, valor_origem, valor_destino, taxa).
    df_market_rates : pd.DataFrame, opcional
        Cotações históricas diárias do USD/BRL. Deve ter index DatetimeIndex e
        colunas como 'USD', 'EUR', 'CAD' (valor em BRL). Usado para calcular
        o ganho/perda realizado a mercado quando a origem é cross-currency.
    target_currencies : list, opcional
        Moedas a rastrear (padrão: ['USD', 'EUR', 'CAD']).

    Retorna
    -------
    dict com:
      'pools'       : Dict[str, FIFOPool] — pools finais de cada moeda
      'pm_history'  : Dict[str, List[dict]] — histórico de PM por moeda
      'transactions': List[dict] — log de todas as operações com ganho/perda
      'summary'     : pd.DataFrame — resumo por moeda
    """
    if target_currencies is None:
        target_currencies = ['USD', 'EUR', 'CAD']

    pools: Dict[str, FIFOPool] = {c: FIFOPool(currency=c) for c in target_currencies}
    pm_history: Dict[str, List[dict]] = {c: [] for c in target_currencies}
    transactions: List[dict] = []

    if df_cambio.empty or 'data' not in df_cambio.columns:
        return _empty_fifo_result(target_currencies, pools, pm_history, transactions)

    df = df_cambio.copy()
    df['data'] = pd.to_datetime(df['data'])
    df = df.sort_values('data')

    for col in ['moeda_origem', 'moeda_destino']:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip().str.upper()

    for col in ['valor_origem', 'valor_destino', 'taxa']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    def _market_rate_on(currency: str, date: pd.Timestamp) -> Optional[float]:
        """Retorna cotação BRL da moeda na data, se disponível."""
        if df_market_rates is None or df_market_rates.empty:
            return None
        if currency not in df_market_rates.columns:
            return None
        idx = df_market_rates.index
        # Busca mais próxima ≤ data
        valid = idx[idx <= date]
        if valid.empty:
            return None
        return float(df_market_rates.loc[valid[-1], currency])

    for _, row in df.iterrows():
        date = row['data']
        origem = str(row.get('moeda_origem', '')).strip().upper()
        destino = str(row.get('moeda_destino', '')).strip().upper()
        val_in = float(row.get('valor_origem', 0))
        val_out = float(row.get('valor_destino', 0))

        if val_in <= 0 or val_out <= 0:
            continue

        if destino not in target_currencies:
            continue

        tx: Dict = {
            'data': date,
            'moeda_origem': origem,
            'moeda_destino': destino,
            'qtd_origem': val_in,
            'qtd_destino': val_out,
            'ganho_perda_brl': 0.0,
            'pm_antes': pools[destino].pm,
            'pm_depois': 0.0,
            'brl_custo_lote': 0.0,
            'tipo': '',
        }

        if origem == 'BRL':
            # ─── Remessa direta BRL → Moeda ───────────────────────────────
            lot = FXLot(date=date, qty=val_out, brl_cost=val_in, origin='BRL')
            pools[destino].add_lot(lot)
            tx['tipo'] = 'BRL→FX'
            tx['brl_custo_lote'] = val_in

        elif origem in target_currencies:
            # ─── Conversão cross-currency: Moeda A → Moeda B ──────────────
            src_pool = pools[origem]
            pm_src_antes = src_pool.pm

            # 1. FIFO: baixa da moeda de origem
            brl_custo_fifo, qty_consumed = src_pool.consume_fifo(val_in)

            # 2. Ganho/Perda realizado
            #    Se temos cotação de mercado: G/P = valor_mercado − custo_fifo
            mkt_rate_src = _market_rate_on(origem, date)
            if mkt_rate_src is not None and mkt_rate_src > 0:
                valor_mercado_src = qty_consumed * mkt_rate_src
                ganho_perda = valor_mercado_src - brl_custo_fifo
            else:
                ganho_perda = 0.0  # sem cotação histórica, não calculamos

            # 3. Custo do novo lote de destino
            #    PM de B = custo BRL herdado (FIFO) / qtd de B recebida
            #    (equivale à cotação de B em BRL no momento, se taxas forem consistentes)
            lot = FXLot(
                date=date,
                qty=val_out,
                brl_cost=brl_custo_fifo,
                origin=origem,
            )
            pools[destino].add_lot(lot)

            tx['tipo'] = f'{origem}→{destino}'
            tx['ganho_perda_brl'] = round(ganho_perda, 2)
            tx['brl_custo_fifo_origem'] = round(brl_custo_fifo, 2)
            tx['pm_origem_antes'] = round(pm_src_antes, 4)
            tx['pm_origem_depois'] = round(src_pool.pm, 4)
            tx['brl_custo_lote'] = round(brl_custo_fifo, 2)

            # Registra PM da origem também
            if origem in pm_history:
                pm_history[origem].append({
                    'data': date,
                    'pm': src_pool.pm,
                    'total_qty': src_pool.total_qty,
                    'total_brl': src_pool.total_brl,
                    'evento': tx['tipo'],
                })

        else:
            # Origem desconhecida — ignora
            continue

        tx['pm_depois'] = pools[destino].pm
        transactions.append(tx)

        # Salva snapshot de PM da moeda destino
        pm_history[destino].append({
            'data': date,
            'pm': pools[destino].pm,
            'total_qty': pools[destino].total_qty,
            'total_brl': pools[destino].total_brl,
            'evento': tx['tipo'],
        })

    # ── Resumo por moeda ───────────────────────────────────────────────────
    rows_summary = []
    for curr in target_currencies:
        pool = pools[curr]
        ganhos_totais = sum(
            t.get('ganho_perda_brl', 0.0)
            for t in transactions
            if t.get('moeda_origem') == curr and t.get('tipo', '').startswith(curr)
        )
        rows_summary.append({
            'Moeda': curr,
            'Qtd Atual': round(pool.total_qty, 2),
            'Custo BRL': round(pool.total_brl, 2),
            'PM Atual (R$)': round(pool.pm, 4),
            'Lotes': len(pool.lots),
            'Ganho/Perda Realizado (R$)': round(ganhos_totais, 2),
        })

    summary = pd.DataFrame(rows_summary)

    return {
        'pools': pools,
        'pm_history': pm_history,
        'transactions': transactions,
        'summary': summary,
    }


def _empty_fifo_result(
    target_currencies: List[str],
    pools: Dict[str, FIFOPool],
    pm_history: Dict,
    transactions: List,
) -> Dict:
    summary = pd.DataFrame([
        {'Moeda': c, 'Qtd Atual': 0, 'Custo BRL': 0, 'PM Atual (R$)': 0,
         'Lotes': 0, 'Ganho/Perda Realizado (R$)': 0}
        for c in target_currencies
    ])
    return {
        'pools': pools,
        'pm_history': pm_history,
        'transactions': transactions,
        'summary': summary,
    }


def get_fifo_pm_series(
    df_cambio: pd.DataFrame,
    idx_dates: pd.DatetimeIndex,
    df_market_rates: Optional[pd.DataFrame] = None,
    target_currencies: Optional[List[str]] = None,
) -> Dict[str, pd.Series]:
    """
    Constrói séries temporais do PM FIFO para cada moeda.

    Reprocessa o FIFO até cada data em `idx_dates` — útil para gráficos.

    Retorna
    -------
    Dict[str, pd.Series]
        {moeda: série de PM ao longo do tempo}
    """
    if target_currencies is None:
        target_currencies = ['USD', 'EUR', 'CAD']

    result: Dict[str, pd.Series] = {}

    if df_cambio.empty:
        for c in target_currencies:
            result[c] = pd.Series(np.nan, index=idx_dates)
        return result

    df = df_cambio.copy()
    df['data'] = pd.to_datetime(df['data'])

    for currency in target_currencies:
        pm_vals = pd.Series(np.nan, index=idx_dates)
        last_pm = np.nan

        for dt in idx_dates:
            df_until = df[df['data'] <= dt]
            if df_until.empty:
                pm_vals[dt] = np.nan
                continue

            fifo_res = calculate_cross_currency_fifo(
                df_until, df_market_rates, [currency]
            )
            pool_pm = fifo_res['pools'][currency].pm
            last_pm = pool_pm if pool_pm > 0 else last_pm
            pm_vals[dt] = last_pm if last_pm > 0 else np.nan

        result[currency] = pm_vals

    return result

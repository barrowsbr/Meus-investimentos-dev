
import pandas as pd
import numpy as np
import yfinance as yf
from datetime import datetime, timedelta
import streamlit as st

# Import existing core functions
from core.market_data import fetch_market_data

def reconstruct_history(df_bruto: pd.DataFrame, df_proventos: pd.DataFrame, days_lookback: int):
    """
    Reconstructs the portfolio history (NAV, Flow, Income) based on transactions.
    
    Args:
        df_bruto: Dataframe of transactions (Assets).
        df_proventos: Dataframe of dividends (Income).
        days_lookback: Number of days to return in the final sliced series (Visual Window).
        
    Returns:
        tuple: (v_pat, v_flux, v_income, v_cus, full_series_dict)
        
    Logic:
        1. Identifies tickers and downloads prices.
        2. Reconstructs daily holdings (Custodia).
        3. Calculates Daily NAV (Price * Qty) + Cash Flow + Income.
        4. Applies "Gap Handling" (for the known 2023 data gap).
        5. Applies "Windowed Suppression" flag (for large inflows).
    """

    # 1. Setup & Downloads
    if df_bruto.empty:
        return pd.Series(), pd.Series(), pd.Series(), pd.Series(), {}
    
    tickers_carteira = df_bruto['ticker'].unique().tolist()
    # Filter out Fixed Income keywords just in case
    termos_excluir = ['TESOURO', 'CDB', 'LCI', 'LCA', 'IPCA', 'CAIXA', 'SALDO']
    tickers_yahoo = [t for t in tickers_carteira if not any(x in t.upper() for x in termos_excluir)]
    
    # Ensure Currencies
    tickers_download = list(set(tickers_yahoo + ['BRL=X', 'EURBRL=X', 'CADBRL=X']))
    
    # Download Prices (Using the cache-wrapped fetcher if available, or direct YF)
    # Since this is "Engine", we rely on input or internal logic. 
    # Let's use direct YF or the one from market_data if robust.
    # Note: app.py used a custom outlier filter. We should preserve it.
    
    data_primeira_transacao = df_bruto['data'].min()
    
    try:
        # We can re-use fetch_market_data if it supports the date range, 
        # but app.py had specific "Outlier Cleaning" logic inline.
        # Let's reproduce the robust logic here.
        df_prices = yf.download(tickers_download, start=data_primeira_transacao, progress=False)['Close']
        if isinstance(df_prices, pd.Series): df_prices = df_prices.to_frame()
        
        # --- OUTLIER CLEANING ---
        pct_change = df_prices.pct_change()
        mask_noise = (pct_change > 2.0) | (pct_change < -0.9)
        df_prices = df_prices.mask(mask_noise, np.nan).ffill()
        df_prices = df_prices.ffill().bfill().fillna(0.0)
    except:
        return pd.Series(), pd.Series(), pd.Series(), pd.Series(), {}
        
    if df_prices.empty:
        return pd.Series(), pd.Series(), pd.Series(), pd.Series(), {}

    # 2. Reconstruction Loop
    idx_dates = df_prices.index
    serie_patrimonio = pd.Series(0.0, index=idx_dates)
    serie_fluxos_mkt = pd.Series(0.0, index=idx_dates)
    serie_fluxos_income = pd.Series(0.0, index=idx_dates)
    
    # Currencies
    s_usd = df_prices['BRL=X'] if 'BRL=X' in df_prices.columns else pd.Series(5.5, index=idx_dates)
    s_eur = df_prices['EURBRL=X'] if 'EURBRL=X' in df_prices.columns else pd.Series(6.0, index=idx_dates)
    
    custodia_diaria = pd.DataFrame(0.0, index=idx_dates, columns=tickers_yahoo)
    df_ops = df_bruto.sort_values('data')
    
    # Process Transactions
    for _, row in df_ops.iterrows():
        t = row['ticker']
        if t in custodia_diaria.columns:
            sinal = 1 if 'compra' in str(row['tipo']).lower() else -1
            try:
                # Cumulative Sum of Quantity
                custodia_diaria.loc[row['data']:, t] += (row['quantidade'] * sinal)
                
                # Register Cash Flow
                # Find exact date index
                idx_fluxo = serie_fluxos_mkt.index.get_indexer([row['data']], method='pad')[0]
                data_valida = serie_fluxos_mkt.index[idx_fluxo]
                
                p_op = float(row['preco'])
                q_op = float(row['quantidade'])
                m_op = str(row['moeda']).upper().strip()
                
                fx = 1.0
                if m_op == 'USD': fx = s_usd.asof(row['data'])
                elif m_op == 'EUR': fx = s_eur.asof(row['data'])
                
                fin_brl = p_op * q_op * fx
                if sinal == 1: serie_fluxos_mkt.loc[data_valida] += fin_brl
                else: serie_fluxos_mkt.loc[data_valida] -= fin_brl
            except: pass

    # Process Income
    if not df_proventos.empty:
        # Don't modify the input in place
        df_p = df_proventos.copy()
        df_p['data'] = pd.to_datetime(df_p['data'], dayfirst=True, errors='coerce')
        df_p = df_p.dropna(subset=['data'])
        
        for _, row in df_p.iterrows():
            try:
                d_idx = serie_fluxos_income.index.get_indexer([row['data']], method='pad')[0]
                d_val = serie_fluxos_income.index[d_idx]
                
                val = float(row['valor'])
                moeda_prov = str(row.get('moeda', 'BRL')).upper().strip()
                rate = 1.0
                if moeda_prov == 'USD': rate = s_usd.asof(row['data'])
                elif moeda_prov == 'EUR': rate = s_eur.asof(row['data'])
                
                val_brl = val * rate
                serie_fluxos_income.loc[d_val] += val_brl
            except: pass

    # Calculate Daily NAV
    for t in tickers_yahoo:
        if t in df_prices.columns:
            cotacao = df_prices[t]
            # Currency Check
            # Note: Need 'moeda' map. We can get it from df_bruto last entry for that ticker.
            # Optimization: Pre-map currencies to dict
            m_ativo = 'BRL'
            last_op = df_bruto[df_bruto['ticker']==t]
            if not last_op.empty:
                m_ativo = last_op['moeda'].iloc[-1]
            
            if m_ativo == 'USD': cotacao = cotacao * s_usd
            
            val_diario = custodia_diaria[t] * cotacao
            serie_patrimonio = serie_patrimonio.add(val_diario.fillna(0), fill_value=0)

    # 3. Gap Handling (The "Black Hole" Fix)
    mask_dummy_range = (serie_patrimonio.index >= '2023-01-20') & (serie_patrimonio.index <= '2023-02-03')
    fluxo_ghost = serie_fluxos_mkt[mask_dummy_range].sum()
    income_ghost = serie_fluxos_income[mask_dummy_range].sum()
    
    mask_keep = ~mask_dummy_range
    serie_patrimonio = serie_patrimonio[mask_keep]
    serie_fluxos_mkt = serie_fluxos_mkt[mask_keep]
    serie_fluxos_income = serie_fluxos_income[mask_keep]
    
    # Re-inject Ghost Flow
    idx_reentry = serie_patrimonio.index[serie_patrimonio.index > '2023-02-03']
    if not idx_reentry.empty and (fluxo_ghost != 0 or income_ghost != 0):
        first_day = idx_reentry[0]
        serie_fluxos_mkt.loc[first_day] += fluxo_ghost
        serie_fluxos_income.loc[first_day] += income_ghost

    # 4. Slicing (Visual Window)
    data_corte = datetime.now() - timedelta(days=days_lookback)
    mask = serie_patrimonio.index >= data_corte
    
    v_pat = serie_patrimonio[mask]
    v_flux = serie_fluxos_mkt[mask]
    v_income = serie_fluxos_income[mask]
    
    if v_pat.empty:
        return v_pat, v_flux, v_income, pd.Series(), {}
        
    v_flux = v_flux.reindex(v_pat.index).fillna(0)
    v_income = v_income.reindex(v_pat.index).fillna(0)
    
    # 5. Windowed Suppression Logic (The Fix)
    # Detect Large Inflows and Suppress TWR
    nav_arr = v_pat.values
    flow_arr = v_flux.values
    
    force_zero_arr = np.array([False] * len(nav_arr))
    nav_start_arr = np.roll(nav_arr, 1); nav_start_arr[0] = 0.0
    
    suppress_counter = 0
    for i in range(len(nav_arr)):
        nav_s = nav_start_arr[i]
        flow = flow_arr[i]
        
        ratio = 0.0
        if nav_s > 1e-6: ratio = flow / nav_s
        
        if ratio > 0.15: suppress_counter = 10
        
        if suppress_counter > 0:
            force_zero_arr[i] = True
            suppress_counter -= 1
            
    # Return everything needed for engine input
    # We return the flag array separately or as a Series
    v_force_zero = pd.Series(force_zero_arr, index=v_pat.index)
    
    return v_pat, v_flux, v_income, v_force_zero, {
        "prices": df_prices,
        "usd": s_usd,
        "eur": s_eur,
        "full_patrimonio": serie_patrimonio,
        "tickers_yahoo": tickers_yahoo,
        "custodia_diaria": custodia_diaria
    }


import pandas as pd
import numpy as np
import yfinance as yf
from datetime import datetime, timedelta
import streamlit as st

# Import existing core functions
from core.market_data import fetch_market_data

def reconstruct_history(df_bruto: pd.DataFrame, df_proventos: pd.DataFrame, days_lookback: int, df_prices_external: pd.DataFrame = None):
    """
    Reconstructs the portfolio history (NAV, Flow, Income) based on transactions.
    
    Args:
        df_bruto: Dataframe of transactions (Assets).
        df_proventos: Dataframe of dividends (Income).
        days_lookback: Number of days to return in the final sliced series (Visual Window).
        df_prices_external: Optional pre-fetched market data (Cached).
        
    Returns:
        tuple: (v_pat, v_flux, v_income, v_cus, full_series_dict)
    """

    # 1. Setup & Downloads
    if df_bruto.empty:
        return pd.Series(), pd.Series(), pd.Series(), pd.Series(), {}
    
    tickers_carteira = df_bruto['ticker'].unique().tolist()
    
    # Filter out Fixed Income keywords just in case
    termos_excluir = ['TESOURO', 'CDB', 'LCI', 'LCA', 'IPCA', 'CAIXA', 'SALDO']
    tickers_yahoo = [t for t in tickers_carteira if not any(x in t.upper() for x in termos_excluir)]
    
    # We rely on external prices if provided
    if df_prices_external is not None and not df_prices_external.empty:
        df_prices = df_prices_external.copy()
    else:
        # Fallback (Should be avoided in optimized flow)
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
    
    s_eur = df_prices['EURBRL=X'] if 'EURBRL=X' in df_prices.columns else pd.Series(6.0, index=idx_dates)
    
    # KEY FIX: Custody must include ALL assets, not just those found in Yahoo.
    # Otherwise, Fixed Income/Manual assets generate Flow (Cost) but Zero NAV (Value), causing -100% drops.
    tickers_in_ops = df_bruto['ticker'].unique().tolist()
    tickers_yahoo_cols = df_prices.columns.tolist()
    all_tickers = list(set(tickers_in_ops + tickers_yahoo_cols))
    
    custodia_diaria = pd.DataFrame(0.0, index=idx_dates, columns=all_tickers)
    df_ops = df_bruto.sort_values('data').copy()
    # Normalize entire column at once for speed and matching
    df_ops['data'] = pd.to_datetime(df_ops['data']).dt.normalize()
    
    # Filter Future Dates (Data Error Protection)
    today_norm = pd.Timestamp.now().normalize()
    df_ops = df_ops[df_ops['data'] <= today_norm]
    
    # Process Transactions - Step 1: Alignment & Custody Building
    # We add an 'effective_date' column to df_ops to track where we mapped it
    # This is crucial for the Price Fallback loop later
    df_ops['effective_date'] = pd.NaT 
    
    for idx, row in df_ops.iterrows():
        t = row['ticker']
        if t in custodia_diaria.columns:
            sinal = 1 if 'compra' in str(row['tipo']).lower() else -1
            try:
                dt_op = row['data'] # Already normalized
                
                # 1. Align Dates to Market Calendar
                idx_fluxo = serie_fluxos_mkt.index.get_indexer([dt_op], method='pad')[0]
                if idx_fluxo == -1:
                    idx_fluxo = serie_fluxos_mkt.index.get_indexer([dt_op], method='bfill')[0]
                
                data_valida = serie_fluxos_mkt.index[idx_fluxo]
                df_ops.at[idx, 'effective_date'] = data_valida # Store mapping
                
                # 2. Update Custody
                custodia_diaria.loc[data_valida:, t] += (row['quantidade'] * sinal)
                
                # 3. Register Cash Flow
                p_op = float(row['preco'])
                q_op = float(row['quantidade'])
                m_op = str(row['moeda']).upper().strip()
                
                fx = 1.0
                if m_op == 'USD': fx = s_usd.asof(data_valida)
                elif m_op == 'EUR': fx = s_eur.asof(data_valida)
                
                fin_brl = p_op * q_op * fx
                if sinal == 1: serie_fluxos_mkt.loc[data_valida] += fin_brl
                else: serie_fluxos_mkt.loc[data_valida] -= fin_brl
            except: pass

    # Process Income (Standard)
    if not df_proventos.empty:
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

    # Calculate Daily NAV with Price Fallback
    # Optimization: Pre-compute currency map
    ticker_currency_map = {}
    last_prices = {} # Fallback store
    
    for t_curr in tickers_yahoo:
        cur_subset = df_bruto[df_bruto['ticker'] == t_curr]
        if not cur_subset.empty:
             ticker_currency_map[t_curr] = cur_subset['moeda'].iloc[-1]
             # Initialize fallback with first price found (cost basis)
             # But keep it zero if logic requires strict timeline
             pass

    for d_idx in idx_dates:
        # Update Last Known Prices from Transactions on this day
        # KEY FIX: Use 'effective_date' (Market Aligned) instead of raw 'data'
        daily_ops = df_ops[df_ops['effective_date'] == d_idx]
        
        # Create a map of "Transaction Prices" for this day to override Yahoo
        # This handles the "Paid 20, Yahoo says 10" gap (Splits or Data mismatches)
        # We assume the Transaction Price is the truth for the Moment of Entry
        tx_price_map = {}
        
        for _, op in daily_ops.iterrows():
            p_tx = float(op['preco'])
            last_prices[op['ticker']] = p_tx
            tx_price_map[op['ticker']] = p_tx

        for _, op in daily_ops.iterrows():
            p_tx = float(op['preco'])
            last_prices[op['ticker']] = p_tx
            tx_price_map[op['ticker']] = p_tx

        # Iterate over ALL tickers in custody (including those without Yahoo price)
        # Using custodia_diaria.columns ensures we cover everything
        for t in custodia_diaria.columns:
            # Get Quantity
            q = custodia_diaria.at[d_idx, t]
            if q == 0: continue
            
            # Get Price
            price = 0.0
            
            # PRIORITY 1: Transaction Price Override
            if t in tx_price_map:
                price = tx_price_map[t]
            
            # PRIORITY 2: Market Price (Yahoo)
            elif t in df_prices.columns:
                price = df_prices.at[d_idx, t]
            
            # PRIORITY 3: Fallback (Last Known)
            if price <= 0 or np.isnan(price):
                price = last_prices.get(t, 0.0)
                
            # Currency Conversion
            m_ativo = ticker_currency_map.get(t, 'BRL')
            fx_rate = 1.0
            if m_ativo == 'USD': fx_rate = s_usd.at[d_idx]
            elif m_ativo == 'EUR': fx_rate = s_eur.at[d_idx]
            
            val_ativo_brl = q * price * fx_rate
            serie_patrimonio.at[d_idx] += val_ativo_brl

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
    
    # 5. Smart Flow Timing & Safeguards
    # Logic:
    # 1. Small Base Protection: If NAV is too small (< R$ 1000), any noise becomes % explosion. Force Return=0.
    # 2. Large Inflow Protection: If Flow > 5% of NAV, assume Start-of-Day (SoD) to inflate denominator and smooth TWR.
    
    nav_arr = v_pat.values
    flow_arr = v_flux.values
    
    flow_timing_arr = np.array([0] * len(nav_arr)) # Default: End-of-Day (0)
    force_zero_arr = np.array([False] * len(nav_arr))
    
    # Needs aligned arrays
    nav_start_arr = np.roll(nav_arr, 1); nav_start_arr[0] = 0.0
    
    for i in range(len(nav_arr)):
        n_s = nav_start_arr[i]
        flw = flow_arr[i]
        
        # Guard 1: Small Base (Avoids division by ~zero noise)
        if n_s < 500.0:  # Threshold: 500 BRL
            force_zero_arr[i] = True
            
        # Guard 2: Large Inflow (Switch to SoD)
        # If we insert cash, better to add it to denominator to prevent spurious gains
        if n_s > 0:
            ratio_inflow = flw / n_s
            if ratio_inflow > 0.02: # > 2% inflow (Lowered to catch more cases)
                flow_timing_arr[i] = 1 # Treat as SoD
    
    v_force_zero = pd.Series(force_zero_arr, index=v_pat.index)
    v_flow_timing = pd.Series(flow_timing_arr, index=v_pat.index)
    
    return v_pat, v_flux, v_income, v_force_zero, {
        "prices": df_prices,
        "usd": s_usd,
        "eur": s_eur,
        "full_patrimonio": serie_patrimonio,
        "tickers_yahoo": tickers_yahoo,
        "custodia_diaria": custodia_diaria,
        "flow_timing": v_flow_timing
    }

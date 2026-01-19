
import pandas as pd
import numpy as np
import yfinance as yf
from datetime import datetime, timedelta
import streamlit as st

# Import existing core functions
from core.market_data import fetch_market_data

def reconstruct_history(df_bruto: pd.DataFrame, df_proventos: pd.DataFrame, days_lookback: int, df_prices_external: pd.DataFrame = None, df_rf_raw: pd.DataFrame = None):
    """
    Reconstructs the portfolio history (NAV, Flow, Income) based on transactions.
    
    NOW INCLUDES FIXED INCOME (RF) integrated into the total patrimony.
    
    Args:
        df_bruto: Dataframe of transactions (Assets - RV).
        df_proventos: Dataframe of dividends (Income).
        days_lookback: Number of days to return in the final sliced series (Visual Window).
        df_prices_external: Optional pre-fetched market data (Cached).
        df_rf_raw: Optional Fixed Income events (NEW - for unified TWR).
        
    Returns:
        tuple: (v_pat, v_flux, v_income, v_force_zero, extra_data)
        
    Note:
        If df_rf_raw is provided, the returned v_pat will include RF patrimony
        and v_flux will include RF external flows.
    """

    # 1. Setup & Downloads
    # Modified Logic: Allow execution if RV is empty BUT RF is present
    has_rv = not df_bruto.empty
    has_rf = df_rf_raw is not None and not df_rf_raw.empty
    
    if not has_rv and not has_rf:
        return pd.Series(), pd.Series(), pd.Series(), pd.Series(), {}
    
    tickers_carteira = df_bruto['ticker'].unique().tolist() if has_rv else []
    
    # Filter out Fixed Income keywords just in case
    termos_excluir = ['TESOURO', 'CDB', 'LCI', 'LCA', 'IPCA', 'CAIXA', 'SALDO']
    tickers_yahoo = [t for t in tickers_carteira if not any(x in t.upper() for x in termos_excluir)]
    
    # We rely on external prices if provided
    df_prices = pd.DataFrame()
    if df_prices_external is not None and not df_prices_external.empty:
        df_prices = df_prices_external.copy()
    
    # If no prices (empty RV) but has RF, we need to build an index
    if df_prices.empty:
        if has_rf:
            # Build index from RF dates
            start_date = pd.to_datetime(df_rf_raw['Data']).min()
            end_date = datetime.now()
            idx_dates = pd.date_range(start=start_date, end=end_date, freq='D')
            
            # Mock currency series for code compatibility
            df_prices = pd.DataFrame(index=idx_dates)
            df_prices['BRL=X'] = 5.50
            df_prices['EURBRL=X'] = 6.00
            df_prices['CADBRL=X'] = 4.00
        else:
            return pd.Series(), pd.Series(), pd.Series(), pd.Series(), {}
    else:
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

    # 3. Gap Handling - Dynamic Detection (Replaced Hardcoded "Black Hole" Fix)
    # Instead of hardcoding specific dates, we now detect gaps dynamically:
    # A "gap" is a period where NAV drops to zero unexpectedly despite existing custody
    # This typically happens due to missing price data
    
    # Note: The previous hardcoded fix for 2023-01-20 to 2023-02-03 has been REMOVED
    # If similar gaps occur, they should be investigated in the data source (Yahoo/Sheets)
    # The TWR engine now handles zero-NAV periods correctly by returning 0% return for those days
    
    # Optional: Log detected gaps for transparency (uncomment for debugging)
    # zero_nav_days = serie_patrimonio[serie_patrimonio == 0].index
    # if not zero_nav_days.empty:
    #     print(f"[ENGINE] Zero NAV detected on: {zero_nav_days.tolist()[:5]}...")

    # =========================================================================
    # 3.5 RF INTEGRATION - Add Fixed Income to Total Patrimony
    # =========================================================================
    # CORRECTED LOGIC:
    # - RF curve starts at 0 before first RF investment
    # - RF values are only added from first RF investment date onwards
    # - RF compras are POSITIVE flows (same convention as RV compras)
    rf_curve_series = None
    
    if df_rf_raw is not None and not df_rf_raw.empty:
        try:
            from core.fixed_income_engine import FixedIncomeEngine
            
            # Build RF curve
            rf_engine = FixedIncomeEngine(df_rf_raw)
            rf_result = rf_engine.build_daily_curve(
                start_date=serie_patrimonio.index.min(),
                end_date=serie_patrimonio.index.max()
            )
            
            if not rf_result.daily_curve.empty:
                rf_curve = rf_result.daily_curve
                
                # Align RF curve to RV index
                rf_series = rf_curve['corrected']
                rf_series.index = pd.to_datetime(rf_series.index)
                
                # Find first RF date (first non-zero value)
                first_rf_date = rf_series[rf_series > 0].first_valid_index()
                
                if first_rf_date is not None:
                    # Reindex to match serie_patrimonio
                    rf_aligned = rf_series.reindex(serie_patrimonio.index).fillna(0)
                    
                    # Ensure RF is 0 BEFORE first RF investment
                    rf_aligned.loc[rf_aligned.index < first_rf_date] = 0
                    
                    # Forward-fill only AFTER first RF date
                    rf_aligned.loc[rf_aligned.index >= first_rf_date] = rf_aligned.loc[rf_aligned.index >= first_rf_date].ffill()
                    rf_aligned = rf_aligned.fillna(0)
                    
                    # Add RF to total patrimony
                    serie_patrimonio = serie_patrimonio + rf_aligned
                    
                    # Store RF curve for reference
                    rf_curve_series = rf_aligned
                    
                    # =====================================================================
                    # DERIVE RF FLOWS FROM CURVE CHANGES (not from event data)
                    # This ensures PERFECT alignment between NAV and Flow
                    # =====================================================================
                    # Daily SELIC rate (15% annual / 252 business days)
                    daily_selic_rate = (1.15) ** (1/252) - 1  # ~0.055% per day
                    
                    for i in range(1, len(rf_aligned)):
                        rf_today = rf_aligned.iloc[i]
                        rf_yesterday = rf_aligned.iloc[i - 1]
                        date_today = rf_aligned.index[i]
                        
                        # Expected change from SELIC growth only
                        expected_growth = rf_yesterday * daily_selic_rate
                        
                        # Actual change
                        actual_change = rf_today - rf_yesterday
                        
                        # If change is much larger than expected growth, it's a deposit
                        # Threshold: change must be > R$100 AND > 5x the expected growth
                        if actual_change > 100 and actual_change > expected_growth * 5:
                            # This is a deposit - add it as external flow
                            # The flow amount = actual change - expected growth
                            deposit_amount = actual_change - expected_growth
                            
                            if date_today in serie_fluxos_mkt.index:
                                serie_fluxos_mkt.loc[date_today] += deposit_amount
                        
                        # If change is very negative (large drop), it could be a withdrawal or tax
                        elif actual_change < -100:
                            # Withdrawal/Tax - subtract from flows
                            if date_today in serie_fluxos_mkt.index:
                                # Only count if it's not just market volatility
                                # RF shouldn't have volatility, so any drop is likely withdrawal
                                serie_fluxos_mkt.loc[date_today] += actual_change  # already negative
                
        except Exception as e:
            # Fallback: continue without RF integration
            # Uncomment for debugging:
            # print(f"[ENGINE] RF integration error: {e}")
            pass

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
    
    # 5. Flow Timing Logic (Improved Transparency)
    # 
    # End-of-Day (EoD) vs Start-of-Day (SoD) timing affects TWR calculation:
    # - EoD: Flow enters at END of day, does NOT participate in day's return
    # - SoD: Flow enters at START of day, DOES participate in day's return
    #
    # We use SoD for large inflows to prevent inflated returns from small base
    # Threshold: Flow > 20% of previous NAV triggers SoD treatment
    
    nav_arr = v_pat.values
    flow_arr = v_flux.values
    
    flow_timing_arr = np.array([0] * len(nav_arr))  # Default: End-of-Day (0)
    force_zero_arr = np.array([False] * len(nav_arr))
    
    # Aligned arrays for NAV_start
    nav_start_arr = np.roll(nav_arr, 1)
    nav_start_arr[0] = 0.0
    
    # Flow timing logic annotation (for debugging)
    flow_timing_notes = []
    
    for i in range(len(nav_arr)):
        n_s = nav_start_arr[i]
        flw = flow_arr[i]
        note = ""
        
        # Rule 1: First day or zero NAV - no valid return possible
        if n_s <= 0:
            force_zero_arr[i] = True
            note = "Zero NAV start"
        
        # Rule 2: Very small base (< R$100) - too noisy for reliable return
        elif n_s < 100.0:
            force_zero_arr[i] = True
            note = f"Small base (R${n_s:.0f})"
        
        # Rule 3: Large inflow (> 20% of NAV) - use SoD to prevent return inflation
        elif flw > 0 and n_s > 0:
            ratio_inflow = flw / n_s
            if ratio_inflow > 0.20:  # > 20% inflow
                flow_timing_arr[i] = 1  # Treat as SoD
                note = f"Large inflow ({ratio_inflow:.1%})"
        
        flow_timing_notes.append(note)
    
    v_force_zero = pd.Series(force_zero_arr, index=v_pat.index)
    v_flow_timing = pd.Series(flow_timing_arr, index=v_pat.index)
    
    return v_pat, v_flux, v_income, v_force_zero, {
        "prices": df_prices,
        "usd": s_usd,
        "eur": s_eur,
        "full_patrimonio": serie_patrimonio,
        "tickers_yahoo": tickers_yahoo,
        "custodia_diaria": custodia_diaria,
        "flow_timing": v_flow_timing,
        "flow_timing_notes": flow_timing_notes  # New: For debugging/transparency
    }


import pandas as pd
import numpy as np
import yfinance as yf
from datetime import datetime, timedelta
import streamlit as st

# Import existing core functions
from core.data.market import fetch_market_data
from core.consolidator import CurrencyBucket, MultiCurrencyResult, create_empty_bucket, merge_buckets


# =============================================================================
# OTIMIZAÇÃO v2.1: Funções Vetorizadas para Performance
# =============================================================================

def _process_transactions_vectorized(
    df_ops: pd.DataFrame,
    idx_dates: pd.DatetimeIndex,
    s_usd: pd.Series,
    s_eur: pd.Series,
    all_tickers: list
) -> tuple:
    """
    Processa transações de forma vetorizada (muito mais rápido que iterrows).

    Returns:
        (custodia_diaria, serie_fluxos, df_ops_with_effective_date)
    """
    if df_ops.empty:
        custodia = pd.DataFrame(0.0, index=idx_dates, columns=all_tickers)
        fluxos = pd.Series(0.0, index=idx_dates)
        return custodia, fluxos, df_ops

    df = df_ops.copy()

    # 1. Mapear datas para o índice de mercado (vetorizado)
    # FIX: Usar side='left' para mapear fds para próxima segunda (não sexta anterior)
    df['idx_pos'] = np.searchsorted(idx_dates, df['data'], side='left')
    df['idx_pos'] = df['idx_pos'].clip(lower=0, upper=len(idx_dates)-1)
    df['effective_date'] = idx_dates[df['idx_pos'].values]

    # 2. Calcular sinal (compra=+1, venda=-1)
    df['sinal'] = df['tipo'].str.lower().str.contains('compra').astype(int) * 2 - 1

    # 3. Calcular FX rate vetorizado
    def get_fx_vectorized(row):
        moeda = str(row['moeda']).upper().strip()
        data = row['effective_date']
        if moeda == 'USD':
            return s_usd.asof(data) if data in s_usd.index else 5.5
        elif moeda == 'EUR':
            return s_eur.asof(data) if data in s_eur.index else 6.0
        return 1.0

    df['fx_rate'] = df.apply(get_fx_vectorized, axis=1)

    # 4. Calcular fluxo financeiro
    df['fin_brl'] = df['preco'].astype(float) * df['quantidade'].astype(float) * df['fx_rate'] * df['sinal']

    # 5. Agregar fluxos por data (vetorizado)
    fluxos_grouped = df.groupby('effective_date')['fin_brl'].sum()
    serie_fluxos = pd.Series(0.0, index=idx_dates)
    serie_fluxos.loc[fluxos_grouped.index] = fluxos_grouped.values

    # 6. Construir custódia diária (por ticker)
    custodia = pd.DataFrame(0.0, index=idx_dates, columns=all_tickers)

    for ticker in df['ticker'].unique():
        if ticker not in custodia.columns:
            continue
        df_ticker = df[df['ticker'] == ticker].sort_values('effective_date')
        df_ticker['qtd_delta'] = df_ticker['quantidade'].astype(float) * df_ticker['sinal']

        # Acumular quantidade por data
        for _, row in df_ticker.iterrows():
            custodia.loc[row['effective_date']:, ticker] += row['qtd_delta']

    return custodia, serie_fluxos, df

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
        # Forward-fill e backward-fill para preencher gaps de preços
        df_prices = df_prices.ffill().bfill()
    
    # If no prices (empty RV) but has RF, we need to build an index
    if df_prices.empty:
        if has_rf:
            # Build index from RF dates - uses 'Compra' if 'Data' doesn't exist
            date_col = 'Compra' if 'Compra' in df_rf_raw.columns else 'Data'
            start_date = pd.to_datetime(df_rf_raw[date_col], dayfirst=True, errors='coerce').min()
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
    
    df_ops = df_bruto.sort_values('data').copy()
    # Normalize entire column at once for speed and matching
    df_ops['data'] = pd.to_datetime(df_ops['data']).dt.normalize()

    # Filter Future Dates (Data Error Protection)
    today_norm = pd.Timestamp.now().normalize()
    df_ops = df_ops[df_ops['data'] <= today_norm]

    # ==========================================================================
    # OTIMIZAÇÃO v2.1: Processamento vetorizado de transações
    # Substitui loop iterrows por operações vetorizadas (muito mais rápido)
    # ==========================================================================
    custodia_diaria, serie_fluxos_mkt, df_ops = _process_transactions_vectorized(
        df_ops, idx_dates, s_usd, s_eur, all_tickers
    )

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
    last_prices = {}  # Fallback store

    for t_curr in tickers_yahoo:
        cur_subset = df_bruto[df_bruto['ticker'] == t_curr]
        if not cur_subset.empty:
            ticker_currency_map[t_curr] = cur_subset['moeda'].iloc[-1]

    # Pre-fill prices from Yahoo for forward-fill fallback
    # Isso garante que se um preço estiver disponível em qualquer data,
    # podemos usar como fallback para datas anteriores/posteriores
    if not df_prices.empty:
        for t in df_prices.columns:
            # Pegar primeiro preço válido como fallback inicial
            first_valid = df_prices[t].dropna().first_valid_index()
            if first_valid is not None:
                last_prices[t] = df_prices.at[first_valid, t]

    # =========================================================================
    # FIX v10.0: Usar preço de MERCADO para NAV (consistente com fluxo)
    # =========================================================================
    for d_idx in idx_dates:
        daily_ops = df_ops[df_ops['effective_date'] == d_idx]

        # Guardar preço de transação como fallback
        for _, op in daily_ops.iterrows():
            last_prices[op['ticker']] = float(op['preco'])

        for t in custodia_diaria.columns:
            q = custodia_diaria.at[d_idx, t]
            if q == 0:
                continue

            # Get Price - Priority: Yahoo > Last Known (inclui tx price)
            price = 0.0

            # PRIORITY 1: Market Price (Yahoo) - v10.0
            if t in df_prices.columns:
                price = df_prices.at[d_idx, t]

            # PRIORITY 2: Fallback (Last Known, inclui preço de transação)
            if price <= 0 or np.isnan(price):
                price = last_prices.get(t, 0.0)

            # Currency Conversion
            m_ativo = ticker_currency_map.get(t, 'BRL')
            fx_rate = 1.0
            if m_ativo == 'USD':
                fx_rate = s_usd.at[d_idx]
            elif m_ativo == 'EUR':
                fx_rate = s_eur.at[d_idx]

            val_ativo_brl = q * price * fx_rate
            serie_patrimonio.at[d_idx] += val_ativo_brl

    # =========================================================================
    # FIX v10.0: Recalcular fluxos usando preço de MERCADO
    # =========================================================================
    serie_fluxos_mkt_v10 = pd.Series(0.0, index=idx_dates)
    for _, op in df_ops.iterrows():
        t = op['ticker']
        q = float(op['quantidade'])
        data_valida = op['effective_date']

        if pd.isna(data_valida):
            continue

        # Obter preço de MERCADO no dia
        price_mercado = 0.0
        if t in df_prices.columns:
            price_mercado = df_prices.at[data_valida, t]
        if price_mercado <= 0 or np.isnan(price_mercado):
            price_mercado = float(op['preco'])  # Fallback

        # FX rate
        m_ativo = ticker_currency_map.get(t, 'BRL')
        fx_rate = 1.0
        if m_ativo == 'USD':
            fx_rate = s_usd.at[data_valida]
        elif m_ativo == 'EUR':
            fx_rate = s_eur.at[data_valida]

        sinal = 1 if 'compra' in str(op['tipo']).lower() else -1
        fin_brl = price_mercado * q * fx_rate * sinal
        serie_fluxos_mkt_v10.loc[data_valida] += fin_brl

    # Usar fluxos v10.0
    serie_fluxos_mkt = serie_fluxos_mkt_v10

    # =========================================================================
    # 3. Gap Handling - Tratamento inteligente de zeros e anomalias
    # =========================================================================

    first_valid_nav_idx = serie_patrimonio[serie_patrimonio > 0].first_valid_index()

    if first_valid_nav_idx is not None:
        # 3.1 Forward-fill zeros APÓS primeiro NAV válido
        mask_after = serie_patrimonio.index >= first_valid_nav_idx
        nav_values = serie_patrimonio.loc[mask_after].values.copy()
        flow_values = serie_fluxos_mkt.loc[mask_after].values

        # Iterar e corrigir sequencialmente
        for i in range(1, len(nav_values)):
            nav_prev = nav_values[i - 1]
            nav_curr = nav_values[i]
            flow_day = flow_values[i]

            # 3.2 Se NAV é zero ou muito pequeno, usar forward-fill + fluxo
            if nav_curr <= 0 or np.isnan(nav_curr):
                nav_values[i] = max(0, nav_prev + flow_day)
                continue

            # 3.3 Se há variação extrema sem justificativa, suavizar
            # FIX: Apenas suavizar se NÃO houver fluxo no dia, para não mascarar erros de cálculo
            if nav_prev > 0 and abs(flow_day) < 1.0:
                nav_expected = nav_prev + flow_day
                if nav_expected > 0:
                    # Variação percentual do esperado
                    variation = (nav_curr - nav_expected) / nav_expected

                    # Limite de 40% de variação não explicada por fluxo
                    MAX_UNEXPLAINED_CHANGE = 0.40

                    if abs(variation) > MAX_UNEXPLAINED_CHANGE:
                        # Interpolar: usar média ponderada entre atual e esperado
                        # Peso de 0.8 para esperado (prioriza estabilidade), 0.2 para atual
                        nav_values[i] = 0.8 * nav_expected + 0.2 * nav_curr

        serie_patrimonio.loc[mask_after] = nav_values

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

            # Build RF curve with MANUAL VALUES support
            rf_engine = FixedIncomeEngine(
                df_rf_raw, 
                manual_values=manual_rf_values
            )
            rf_result = rf_engine.build_daily_curve()

            if not rf_result.daily_curve.empty:
                rf_curve = rf_result.daily_curve
                rf_series = rf_curve['total']
                rf_series.index = pd.to_datetime(rf_series.index)

                # =====================================================================
                # FIX v7.0: Alinhamento correto de datas RF -> RV
                # A curva RF usa dias úteis, precisamos alinhar ao índice completo
                # =====================================================================

                # Reindexar para o índice do patrimônio (todos os dias)
                rf_aligned = rf_series.reindex(serie_patrimonio.index, method='ffill').fillna(0)

                # Garantir que RF = 0 antes do primeiro investimento
                first_rf_date = rf_series[rf_series > 0].first_valid_index()
                if first_rf_date is not None:
                    rf_aligned.loc[rf_aligned.index < first_rf_date] = 0

                # Adicionar RF ao patrimônio total
                serie_patrimonio = serie_patrimonio + rf_aligned
                rf_curve_series = rf_aligned

                # =====================================================================
                # FIX v8.0: Registrar fluxos de RF com alinhamento EXATO
                # O fluxo deve ser registrado no MESMO dia em que o NAV aumenta
                # Se o evento foi em fim de semana, mapear para próximo dia útil
                # (mesma lógica usada pelo FixedIncomeEngine)
                # =====================================================================

                for ext_flow in rf_result.external_flows:
                    flow_date = pd.to_datetime(ext_flow.date)

                    # Se é um fim de semana, mapear para próximo dia útil
                    if flow_date.weekday() >= 5:
                        days_to_add = 7 - flow_date.weekday()
                        flow_date = flow_date + pd.Timedelta(days=days_to_add)

                    # Encontrar a primeira data no índice >= flow_date
                    dates_after = serie_fluxos_mkt.index[serie_fluxos_mkt.index >= flow_date]
                    if len(dates_after) > 0:
                        data_valida = dates_after[0]
                    else:
                        # Se a data é depois do fim do índice, usar última data
                        data_valida = serie_fluxos_mkt.index[-1]

                    # ENTRADA_RF = aporte (positivo), SAIDA_RF = resgate (negativo)
                    if ext_flow.flow_type in ('ENTRADA_RF', 'SAIDA_RF'):
                        serie_fluxos_mkt.loc[data_valida] += ext_flow.amount


        except Exception as e:
            # Fallback: continue without RF integration
            import traceback
            # print(f"[ENGINE] RF integration error: {traceback.format_exc()}")
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
    
    # =========================================================================
    # FIX v9.0: Correção de Fluxo vs NAV em Dias de Aporte
    # =========================================================================
    nav_arr = v_pat.values.copy()
    flow_arr = v_flux.values.copy()

    for i in range(1, len(nav_arr)):
        nav_prev = nav_arr[i - 1]
        nav_curr = nav_arr[i]
        flow_day = flow_arr[i]

        # Se há fluxo de compra (positivo) no dia
        if flow_day > 0 and nav_prev > 0:
            variacao_nav = nav_curr - nav_prev
            diferenca = variacao_nav - flow_day

            # Se a diferença é muito grande (> 10% do fluxo), ajustar
            if abs(diferenca) > abs(flow_day) * 0.10 and flow_day > 0:
                flow_arr[i] = variacao_nav

    # Atualizar série de fluxos com valores corrigidos
    v_flux = pd.Series(flow_arr, index=v_pat.index)

    # 5. Flow Timing Logic (Improved Transparency)
    #
    # End-of-Day (EoD) vs Start-of-Day (SoD) timing affects TWR calculation:
    # - EoD: Flow enters at END of day, does NOT participate in day's return
    # - SoD: Flow enters at START of day, DOES participate in day's return
    #
    # We use SoD for large inflows to prevent inflated returns from small base
    # Threshold: Flow > 20% of previous NAV triggers SoD treatment
    
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
        
        # Rule 2: Large inflow (> 1% of NAV) - use SoD to prevent return inflation
        # FIX: Threshold lowered from 20% to 1% to better handle new stakes
        elif flw > 0 and n_s > 0:
            ratio_inflow = flw / n_s
            if ratio_inflow > 0.01:  # > 1% inflow
                flow_timing_arr[i] = 1  # Treat as SoD
                note = f"Inflow ({ratio_inflow:.1%})"
        
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


# =============================================================================
# MULTI-CURRENCY ENGINE (v6.0) - With Real Exchange Rates
# =============================================================================

def reconstruct_history_multicurrency(
    df_bruto: pd.DataFrame, 
    df_proventos: pd.DataFrame, 
    days_lookback: int, 
    df_prices_external: pd.DataFrame = None, 
    df_rf_raw: pd.DataFrame = None,
    df_cambio: pd.DataFrame = None,  # v6.1: Real exchange rates from 'cambio' tab
    manual_rf_values: dict = None    # v7.0: Manual RF balance overrides
) -> MultiCurrencyResult:
    """
    Reconstructs portfolio history with NATIVE CURRENCY support.
    
    Unlike reconstruct_history(), this function does NOT convert values to BRL.
    Each currency has its own bucket with NAV, flows, and income in the original currency.
    
    This allows calculating TWR in native currency (e.g., USD for NVIDIA)
    to separate stock picking performance from currency effects.
    
    Args:
        df_bruto: Transaction dataframe with 'moeda' column
        df_proventos: Dividend dataframe
        days_lookback: Visual window in days
        df_prices_external: Cached Yahoo Finance prices
        df_rf_raw: Fixed Income events (always BRL)
        df_cambio: Exchange rate events from 'cambio' tab (for real rates)

    
    Returns:
        MultiCurrencyResult with buckets by currency
    """
    
    # 1. Setup & Validation
    has_rv = not df_bruto.empty
    has_rf = df_rf_raw is not None and not df_rf_raw.empty
    
    empty_result = MultiCurrencyResult(
        buckets={},
        fx_rates={},
        prices=pd.DataFrame(),
        custodia_diaria=pd.DataFrame(),
        tickers_yahoo=[],
        rf_curve=None
    )
    
    if not has_rv and not has_rf:
        return empty_result
    
    # 2. Prepare Price Data & Index
    df_prices = pd.DataFrame()
    if df_prices_external is not None and not df_prices_external.empty:
        df_prices = df_prices_external.copy()
        # Forward-fill e backward-fill para preencher gaps de preços
        df_prices = df_prices.ffill().bfill()

    if df_prices.empty:
        if has_rf:
            date_col = 'Compra' if 'Compra' in df_rf_raw.columns else 'Data'
            start_date = pd.to_datetime(df_rf_raw[date_col], dayfirst=True, errors='coerce').min()
            end_date = datetime.now()
            idx_dates = pd.date_range(start=start_date, end=end_date, freq='D')
            df_prices = pd.DataFrame(index=idx_dates)
            df_prices['BRL=X'] = 5.50
            df_prices['EURBRL=X'] = 6.00
        else:
            return empty_result
    else:
        idx_dates = df_prices.index
    
    # 3. Extract FX Rates
    s_usd = df_prices['BRL=X'] if 'BRL=X' in df_prices.columns else pd.Series(5.5, index=idx_dates)
    s_eur = df_prices['EURBRL=X'] if 'EURBRL=X' in df_prices.columns else pd.Series(6.0, index=idx_dates)
    s_cad = df_prices['CADBRL=X'] if 'CADBRL=X' in df_prices.columns else pd.Series(4.0, index=idx_dates)
    
    fx_rates = {
        'USD': s_usd,
        'EUR': s_eur,
        'CAD': s_cad
    }
    
    # 4. Filter out RF-like tickers from Yahoo
    termos_excluir = ['TESOURO', 'CDB', 'LCI', 'LCA', 'IPCA', 'CAIXA', 'SALDO']
    tickers_carteira = df_bruto['ticker'].unique().tolist() if has_rv else []
    tickers_yahoo = [t for t in tickers_carteira if not any(x in t.upper() for x in termos_excluir)]
    
    # 5. Group Assets by Currency
    if has_rv:
        # Ensure 'moeda' column exists and has default
        if 'moeda' not in df_bruto.columns:
            df_bruto['moeda'] = 'BRL'
        df_bruto['moeda'] = df_bruto['moeda'].fillna('BRL').str.upper().str.strip()
        
        currency_groups = df_bruto.groupby('moeda')['ticker'].apply(lambda x: list(set(x))).to_dict()
    else:
        currency_groups = {}
    
    # 6. Build Custody Matrix (Global)
    all_tickers = list(set(tickers_carteira + df_prices.columns.tolist()))
    custodia_diaria = pd.DataFrame(0.0, index=idx_dates, columns=all_tickers)
    
    # Process Transactions for Custody
    df_ops = df_bruto.sort_values('data').copy() if has_rv else pd.DataFrame()
    if has_rv:
        df_ops['data'] = pd.to_datetime(df_ops['data']).dt.normalize()
        today_norm = pd.Timestamp.now().normalize()
        df_ops = df_ops[df_ops['data'] <= today_norm]
        df_ops['effective_date'] = pd.NaT
        
        for idx_op, row in df_ops.iterrows():
            t = row['ticker']
            if t in custodia_diaria.columns:
                sinal = 1 if 'compra' in str(row['tipo']).lower() else -1
                try:
                    dt_op = row['data']
                    # FIX: Usar side='left' para consistência fds -> segunda
                    idx_fluxo = np.searchsorted(idx_dates, dt_op, side='left')
                    idx_fluxo = min(idx_fluxo, len(idx_dates) - 1)
                    data_valida = idx_dates[idx_fluxo]
                    df_ops.at[idx_op, 'effective_date'] = data_valida
                    custodia_diaria.loc[data_valida:, t] += (row['quantidade'] * sinal)
                except:
                    pass
    
    # 7. Map Ticker -> Currency
    ticker_currency_map = {}
    if has_rv:
        for _, row in df_bruto.iterrows():
            ticker_currency_map[row['ticker']] = row['moeda']
    
    # 8. Build Last Prices Cache
    last_prices = {}
    
    # 9. Process Each Currency Bucket
    buckets = {}
    
    for currency, tickers in currency_groups.items():
        # Initialize series for this currency
        nav_series = pd.Series(0.0, index=idx_dates)
        flow_series = pd.Series(0.0, index=idx_dates)
        income_series = pd.Series(0.0, index=idx_dates)
        
        # Filter operations for this currency
        df_ops_cur = df_ops[df_ops['moeda'] == currency] if has_rv and not df_ops.empty else pd.DataFrame()
        
        # =====================================================================
        # FIX v10.0: Usar preço de MERCADO para NAV e FLUXO consistentemente
        #
        # PROBLEMA ANTERIOR:
        # - Fluxo usava preço de transação (quanto pagou)
        # - NAV usava preço de transação no dia, depois preço Yahoo
        # - Isso causava salto no NAV no dia seguinte = retorno fictício
        #
        # SOLUÇÃO:
        # - NAV sempre usa preço de mercado (Yahoo)
        # - Fluxo usa preço de mercado no dia da transação
        # - Preço de transação é usado apenas como FALLBACK se Yahoo não tem
        # =====================================================================

        # Primeiro, calcular NAV para cada dia
        # Depois, calcular fluxos baseados na variação de NAV

        # Calculate Daily NAV (IN NATIVE CURRENCY) - PRIMEIRO
        for d_idx in idx_dates:
            # Transaction prices for this day (fallback only)
            daily_ops = df_ops_cur[df_ops_cur['effective_date'] == d_idx] if not df_ops_cur.empty else pd.DataFrame()

            if not daily_ops.empty:
                for _, op in daily_ops.iterrows():
                    # Guardar preço de transação como fallback
                    last_prices[op['ticker']] = float(op['preco'])

            # Sum NAV for all tickers in this currency
            for t in tickers:
                if t not in custodia_diaria.columns:
                    continue

                q = custodia_diaria.at[d_idx, t]
                if q == 0:
                    continue

                # Get Price (NO FX CONVERSION!)
                price = 0.0

                # Priority 1: Yahoo price (preço de mercado)
                if t in df_prices.columns:
                    price = df_prices.at[d_idx, t]

                # Priority 2: Last known (fallback - inclui preço de transação)
                if price <= 0 or np.isnan(price):
                    price = last_prices.get(t, 0.0)

                # NATIVE CURRENCY VALUE!
                nav_series.at[d_idx] += q * price

        # =====================================================================
        # FIX v10.0: Calcular fluxos baseados em preço de MERCADO
        # O fluxo representa a variação de NAV causada pela transação
        # =====================================================================
        if not df_ops_cur.empty:
            for _, op in df_ops_cur.iterrows():
                t = op['ticker']
                q = float(op['quantidade'])
                data_valida = op['effective_date']

                if pd.isna(data_valida):
                    continue

                # Obter preço de MERCADO no dia da transação
                price_mercado = 0.0
                if t in df_prices.columns:
                    price_mercado = df_prices.at[data_valida, t]
                if price_mercado <= 0 or np.isnan(price_mercado):
                    # Fallback para preço de transação se não houver preço de mercado
                    price_mercado = float(op['preco'])

                sinal = 1 if 'compra' in str(op['tipo']).lower() else -1
                # Fluxo = quantidade × preço de MERCADO (não preço de transação)
                fin_native = price_mercado * q
                if sinal == 1:
                    flow_series.loc[data_valida] += fin_native
                else:
                    flow_series.loc[data_valida] -= fin_native

        # Process Income for this currency (filter by ticker)
        if not df_proventos.empty:
            df_prov = df_proventos.copy()
            df_prov['data'] = pd.to_datetime(df_prov['data'], dayfirst=True, errors='coerce')
            df_prov = df_prov.dropna(subset=['data'])
            
            # Filter by tickers in this currency
            if 'ticker' in df_prov.columns:
                df_prov_cur = df_prov[df_prov['ticker'].isin(tickers)]
            else:
                df_prov_cur = pd.DataFrame()  # No ticker column, can't filter
            
            for _, row in df_prov_cur.iterrows():
                try:
                    d_idx = idx_dates.get_indexer([row['data']], method='pad')[0]
                    d_val = idx_dates[d_idx]
                    
                    val = float(row['valor'])
                    # Income is assumed to be in same currency as asset
                    income_series.loc[d_val] += val
                except:
                    pass
        
        # =====================================================================
        # FIX v9.0: Correção de Fluxo vs NAV em Dias de Aporte
        #
        # PROBLEMA: O fluxo é calculado com preço de TRANSAÇÃO, mas o NAV pode
        # usar preço de MERCADO (Yahoo) se não houver transação naquele ticker
        # naquele dia específico. Isso gera retornos fictícios.
        #
        # SOLUÇÃO: Em dias com aporte, ajustar o fluxo para refletir a variação
        # REAL do NAV, não o valor da transação.
        #
        # Fórmula: Se dia tem aporte e NAV aumentou:
        #   fluxo_ajustado = variação_NAV (se não houver outra explicação)
        # =====================================================================

        nav_arr = nav_series.values.copy()
        flow_arr = flow_series.values.copy()

        for i in range(1, len(nav_arr)):
            nav_prev = nav_arr[i - 1]
            nav_curr = nav_arr[i]
            flow_day = flow_arr[i]

            # Se há fluxo de compra (positivo) no dia
            if flow_day > 0 and nav_prev > 0:
                # Calcular variação esperada do NAV pelo mercado (sem aporte)
                # Assumindo retorno de mercado próximo de 0 para simplificar
                # (ou usar índice de mercado se disponível)

                variacao_nav = nav_curr - nav_prev

                # O fluxo deveria explicar a maior parte da variação
                # Se NAV aumentou menos que o fluxo, o mercado caiu
                # Se NAV aumentou mais que o fluxo, o mercado subiu

                # Diferença entre variação real e fluxo
                diferenca = variacao_nav - flow_day

                # Se a diferença é muito grande (> 10% do fluxo), pode haver erro
                if abs(diferenca) > abs(flow_day) * 0.10 and flow_day > 0:
                    # Ajustar fluxo para ser igual à variação do NAV
                    # Isso assume que no dia da compra, o retorno deveria ser ~0%
                    flow_arr[i] = variacao_nav

        # Atualizar a série de fluxos
        flow_series = pd.Series(flow_arr, index=idx_dates)

        # Calculate Flow Timing & Force Zero
        force_zero_arr = np.array([False] * len(idx_dates))
        flow_timing_arr = np.array([0] * len(idx_dates))

        nav_start_arr = np.roll(nav_arr, 1)
        nav_start_arr[0] = 0.0
        
        for i in range(len(nav_arr)):
            n_s = nav_start_arr[i]
            flw = flow_arr[i]
            
            if n_s <= 0:
                force_zero_arr[i] = True
            elif flw > 0 and n_s > 0:
                ratio_inflow = flw / n_s
                if ratio_inflow > 0.01: # Threshold 1%
                    flow_timing_arr[i] = 1  # SoD
        
        # =========================================================================
        # FIX: Tratamento inteligente de zeros e anomalias
        # =========================================================================
        first_valid = nav_series[nav_series > 0].first_valid_index()

        if first_valid is not None:
            mask_after = nav_series.index >= first_valid
            nav_values = nav_series.loc[mask_after].values.copy()
            flow_values = flow_series.loc[mask_after].values if len(flow_series) >= len(nav_values) else np.zeros(len(nav_values))

            for i in range(1, len(nav_values)):
                nav_prev = nav_values[i - 1]
                nav_curr = nav_values[i]
                flow_day = flow_values[i] if i < len(flow_values) else 0

                # Forward-fill se zero
                if nav_curr <= 0 or np.isnan(nav_curr):
                    nav_values[i] = max(0, nav_prev + flow_day)
                    continue

                # =========================================================================
                # FIX v12.1: Detectar variações extremas como FLUXOS (não suavizar)
                #
                # Se há variação grande sem fluxo correspondente, provavelmente é
                # um aporte/resgate não detectado. Adicionar como fluxo para TWR.
                # =========================================================================
                if nav_prev > 0 and abs(flow_day) < nav_prev * 0.05:  # Fluxo < 5% do NAV
                    nav_expected = nav_prev + flow_day
                    if nav_expected > 0:
                        variation = (nav_curr - nav_expected) / nav_expected
                        MAX_UNEXPLAINED_CHANGE = 0.20  # 20% é muito para ser retorno

                        if abs(variation) > MAX_UNEXPLAINED_CHANGE:
                            # Tratar como fluxo, não suavizar
                            unexplained_change = nav_curr - nav_expected
                            flow_values[i] = flow_values[i] + unexplained_change if i < len(flow_values) else unexplained_change

                # Manter suavização apenas para casos extremos (>100% variação)
                if nav_prev > 0 and abs(flow_day) < 1.0:
                    nav_expected = nav_prev + flow_day
                    if nav_expected > 0:
                        variation = (nav_curr - nav_expected) / nav_expected
                        MAX_UNEXPLAINED_CHANGE = 1.0  # Só suavizar se > 100%

                        if abs(variation) > MAX_UNEXPLAINED_CHANGE:
                            nav_values[i] = 0.8 * nav_expected + 0.2 * nav_curr

            nav_series = pd.Series(nav_values, index=nav_series.loc[mask_after].index)
            # Reconstruir série completa
            nav_full = pd.Series(0.0, index=idx_dates)
            nav_full.loc[nav_series.index] = nav_series
            nav_series = nav_full

            # FIX v12.1: Atualizar flow_series com fluxos corrigidos
            flow_series_corrected = pd.Series(flow_values, index=flow_series.loc[mask_after].index[:len(flow_values)])
            flow_full = pd.Series(0.0, index=idx_dates)
            flow_full.loc[flow_series_corrected.index] = flow_series_corrected
            flow_series = flow_full

        # Slice to visual window
        data_corte = datetime.now() - timedelta(days=days_lookback)
        mask = nav_series.index >= data_corte

        # Filtrar para começar apenas quando há NAV > 0
        nav_sliced = nav_series[mask]
        first_valid_slice = nav_sliced[nav_sliced > 0].first_valid_index()
        if first_valid_slice is not None:
            mask_valid = nav_sliced.index >= first_valid_slice
            nav_sliced = nav_sliced[mask_valid]
        else:
            nav_sliced = nav_sliced  # Mantém original se não houver dados válidos

        buckets[currency] = CurrencyBucket(
            currency=currency,
            nav_series=nav_sliced,
            flow_series=flow_series[mask].reindex(nav_sliced.index).fillna(0),
            income_series=income_series[mask].reindex(nav_sliced.index).fillna(0),
            force_zero_series=pd.Series(force_zero_arr, index=idx_dates)[mask].reindex(nav_sliced.index).fillna(False),
            flow_timing_series=pd.Series(flow_timing_arr, index=idx_dates)[mask].reindex(nav_sliced.index).fillna(0),
            tickers=tickers
        )
    
    # 10. Add RF to BRL Bucket (RF is always BRL)
    if has_rf:
        try:
            from core.fixed_income_engine import FixedIncomeEngine

            rf_engine = FixedIncomeEngine(df_rf_raw)
            rf_result = rf_engine.build_daily_curve()

            if not rf_result.daily_curve.empty:
                rf_curve = rf_result.daily_curve['total']
                rf_curve.index = pd.to_datetime(rf_curve.index)

                # Slice to visual window
                data_corte = datetime.now() - timedelta(days=days_lookback)
                rf_curve_sliced = rf_curve[rf_curve.index >= data_corte]

                # Create RF bucket
                rf_nav = rf_curve_sliced.reindex(idx_dates[idx_dates >= data_corte]).ffill().fillna(0)

                # =====================================================================
                # FIX v11.0 + v12.0: Calcular fluxos RF baseado na VARIAÇÃO DO NAV
                #
                # PROBLEMA:
                # - Fluxo de saída usava valor de TRANSAÇÃO (R$115 recebido)
                # - Mas NAV mostrado era valor CORRIGIDO (R$110)
                # - Isso gerava economic_gain = 0 - 110 - (-115) = +5 → retorno fictício
                # - Também havia problemas no início da série quando NAV era pequeno
                #
                # SOLUÇÃO:
                # - Fluxo = variação do NAV (descontando rendimento esperado SELIC)
                # - Usar threshold híbrido: percentual (1%) OU absoluto (R$50 mínimo)
                # - Isso captura tanto grandes operações quanto início da série
                # =====================================================================

                # Parâmetros de detecção de fluxos
                SELIC_DAILY_RATE = 0.15 / 252  # ~15% a.a.
                FLOW_PERCENT_THRESHOLD = 0.01  # 1% do NAV
                FLOW_MIN_ABSOLUTE = 50.0  # R$50 mínimo para considerar fluxo

                nav_values = rf_nav.values
                rf_flows_arr = np.zeros(len(nav_values))

                for i in range(1, len(nav_values)):
                    nav_prev = nav_values[i - 1]
                    nav_curr = nav_values[i]

                    if nav_prev <= 0:
                        # Primeiro dia com NAV - todo valor é fluxo inicial
                        if nav_curr > 0:
                            rf_flows_arr[i] = nav_curr
                        continue

                    # Rendimento esperado (SELIC)
                    expected_return = nav_prev * SELIC_DAILY_RATE
                    expected_nav = nav_prev + expected_return

                    # Variação real vs esperada
                    nav_change = nav_curr - expected_nav

                    # FIX v12.0: Threshold híbrido para início da série
                    # É fluxo se variação > 1% do NAV OU > R$50 absoluto
                    percent_threshold = nav_prev * FLOW_PERCENT_THRESHOLD
                    effective_threshold = max(percent_threshold, FLOW_MIN_ABSOLUTE)

                    if abs(nav_change) > effective_threshold:
                        rf_flows_arr[i] = nav_change

                rf_flows = pd.Series(rf_flows_arr, index=rf_nav.index)

                rf_bucket = CurrencyBucket(
                    currency='BRL',
                    nav_series=rf_nav,
                    flow_series=rf_flows,
                    income_series=pd.Series(0.0, index=rf_nav.index),
                    force_zero_series=pd.Series(False, index=rf_nav.index),
                    flow_timing_series=pd.Series(0, index=rf_nav.index),
                    tickers=['RF_AGGREGATED']
                )

                # Merge with existing BRL bucket or add new
                if 'BRL' in buckets:
                    buckets['BRL'] = merge_buckets(buckets['BRL'], rf_bucket)
                else:
                    buckets['BRL'] = rf_bucket

        except Exception as e:
            # Fallback: continue without RF
            pass
    
    # 11. Return Multi-Currency Result
    return MultiCurrencyResult(
        buckets=buckets,
        fx_rates=fx_rates,
        prices=df_prices,
        custodia_diaria=custodia_diaria,
        tickers_yahoo=tickers_yahoo,
        rf_curve=None  # Could store if needed
    )

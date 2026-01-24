import streamlit as st
from core.auth import require_auth

# --- AUTH CHECK ---
require_auth()

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, date, timedelta
import numpy as np

# --- CORE IMPORTS ---
from core.data_loader import load_assets, load_proventos, load_fixed_income, load_cambio
from core.market_data import fetch_historical_data
from core.engine import reconstruct_history_multicurrency
from core.twr_canonical import calculate_canonical_twr, DEFAULT_PREMISES
from config import BASE_DIR

# --- CONFIG ---
st.set_page_config(
    page_title="Performance (GIPS)",
    page_icon="🚀",
    layout="wide",
    initial_sidebar_state="expanded" 
)

# --- CSS / THEME ---
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'Outfit', sans-serif;
    }
    
    /* Custom Card container */
    .perf-card {
        background: rgba(255, 255, 255, 0.05); /* Light glass */
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 20px;
        backdrop-filter: blur(10px);
    }
    
    h1, h2, h3 { color: #f1f5f9; }
</style>
""", unsafe_allow_html=True)

# --- HELPER FUNCTIONS ---
def run_performance_engine_compat(df_input_frozen):
    """
    Wrapper de alto nivel para o motor GIPS (Canonical).
    """
    from dataclasses import dataclass, field
    from typing import List
    
    if not isinstance(df_input_frozen, pd.DataFrame):
        df = pd.DataFrame(df_input_frozen)
    else:
        df = df_input_frozen.copy()
    
    if not isinstance(df.index, pd.DatetimeIndex):
        df.index = pd.to_datetime(df.index)
    
    canonical_result = calculate_canonical_twr(df, DEFAULT_PREMISES)
    
    @dataclass
    class CompatibleResult:
        total_twr: float
        annualized_twr: float
        daily_returns: pd.Series
        cumulative_series: pd.Series
        drawdown_series: pd.Series
        max_drawdown: float
        nav_series: pd.Series
        volatility: float
        total_flow: float
        total_pnl: float
        simple_return_series: pd.Series = None
        validation: object = None
        flow_dates: List[str] = field(default_factory=list)
        period_breakdown: List = field(default_factory=list)
        currency: str = 'BRL'
        is_consolidated: bool = False
    
    # nav_series logic: use true NAV from input
    return CompatibleResult(
        total_twr=canonical_result.total_twr,
        annualized_twr=canonical_result.annualized_twr,
        daily_returns=canonical_result.daily_returns,
        cumulative_series=canonical_result.cumulative_series,
        drawdown_series=canonical_result.drawdown_series,
        max_drawdown=canonical_result.max_drawdown,
        nav_series=df['nav'],
        volatility=canonical_result.volatility,
        total_flow=canonical_result.total_flow,
        total_pnl=canonical_result.total_pnl,
        simple_return_series=None,
        validation=canonical_result.validation,
        flow_dates=[sp.date for sp in canonical_result.sub_periods if abs(sp.flow) > 0.01],
        period_breakdown=canonical_result.sub_periods
    )

# --- MAIN PAGE LOGIC ---

def main():
    col_h1, col_h2 = st.columns([3,1])
    with col_h1:
        st.title("🚀 Análise de Performance")
        st.caption("Rentabilidade Time-Weighted Return (GIPS Compliant)")
    with col_h2:
        if st.button("🏠 Voltar para Home", use_container_width=True):
            st.switch_page("app.py")

    # 1. LOAD DATA (SMART PIPELINE)
    with st.spinner("Carregando e Higienizando Dados..."):
        df_assets = load_assets()
        df_proventos = load_proventos()
        df_rf_raw = load_fixed_income()
    
    # -------------------------------------------------------------------------
    # PASSO ZERO: HIGIENIZAÇÃO E AGREGAÇÃO DE RENDA FIXA (CRÍTICO)
    # -------------------------------------------------------------------------
    if not df_rf_raw.empty:
        # A. Normalização de Data
        date_col = next((c for c in ['Compra', 'Data'] if c in df_rf_raw.columns), None)
        
        if date_col:
            df_rf_raw[date_col] = pd.to_datetime(df_rf_raw[date_col], dayfirst=True, errors='coerce')
            df_rf_raw = df_rf_raw.dropna(subset=[date_col]) 
            
            # B. Agregação Inteligente (Ao invés de remover, SOMA duplicatas do mesmo dia/ativo)
            cols_group = ['Ticker', date_col, 'Tipo'] 
            # First values for others
            agg_dict = {c: 'first' for c in df_rf_raw.columns if c not in cols_group + ['Valor', 'Atual', 'Investido']}
            
            # Sum numerics
            for num_col in ['Valor', 'Atual', 'Investido']:
                if num_col in df_rf_raw.columns:
                    agg_dict[num_col] = 'sum'
            
            df_rf_raw = df_rf_raw.groupby(cols_group, as_index=False).agg(agg_dict)
        else:
            df_rf_raw = df_rf_raw.drop_duplicates()

    if df_assets.empty and df_rf_raw.empty:
        st.warning("Sem dados de transações para calcular performance.")
        st.stop()

    # 2. SEPARATE FILTERS (UX & Logic)
    with st.sidebar:
        st.header("Filtros de Portfolio")
        
        # A. Renda Variável (RV)
        tickers_rv = []
        if not df_assets.empty:
            tickers_rv = sorted(df_assets['ticker'].unique().tolist())
        sel_rv = st.multiselect("Renda Variável:", tickers_rv, default=tickers_rv)

        # B. Renda Fixa (RF)
        tickers_rf = []
        regex_cash_sacred = 'CAIXA|SALDO|CASH|DISPONIVEL|CORRENTE|CC|LIQUIDEZ|PROVIS|TESOURARIA'
        regex_inv_protect = 'CDB|LCI|LCA|TESOURO|IPCA|PREFIXADO|DEBENTURE|FUNDO|FIC|FIA|RDB|LC|CRI|CRA'
        
        if not df_rf_raw.empty and 'Ticker' in df_rf_raw.columns:
            raw_rf = df_rf_raw['Ticker'].unique().tolist()
            
            def is_pure_cash(t):
                t_u = str(t).upper()
                import re
                is_cash = bool(re.search(regex_cash_sacred, t_u))
                is_inv = bool(re.search(regex_inv_protect, t_u))
                return is_cash and not is_inv

            tickers_rf = sorted([t for t in raw_rf if not is_pure_cash(t)])
            
        sel_rf = st.multiselect("Renda Fixa (Títulos):", tickers_rf, default=tickers_rf)
        
        st.markdown("---")
        if st.button("🔄 Recalcular", use_container_width=True):
            st.cache_data.clear()
            st.rerun()

    # 3. ENGINE IMPLEMENTATION
    
    # 3.1 Filtro RV
    df_rv_final = df_assets.copy()
    if sel_rv:
        df_rv_final = df_rv_final[df_rv_final['ticker'].isin(sel_rv)]
    else:
        df_rv_final = df_rv_final[0:0]

    # 3.2 Filtro RF (Lógica do "Caixa Sagrado")
    df_rf_final = df_rf_raw.copy()
    if not df_rf_final.empty:
        # Mapeamento do que é caixa real
        mask_true_cash = (
            df_rf_final['Ticker'].str.contains(regex_cash_sacred, case=False, na=False) & 
            ~df_rf_final['Ticker'].str.contains(regex_inv_protect, case=False, na=False)
        )
        
        df_sacred_cash = df_rf_final[mask_true_cash].copy()
        df_investments = df_rf_final[~mask_true_cash].copy()
        
        # Filtro User
        if sel_rf:
            df_investments = df_investments[df_investments['Ticker'].isin(sel_rf)]
        elif tickers_rf: # Se existem opções mas user desmarcou tudo
            df_investments = df_investments[0:0]

        # Reintegra: Caixa Sagrado + Investimentos Selecionados
        df_rf_final = pd.concat([df_sacred_cash, df_investments], ignore_index=True)

    # 3.3 Proventos Sync
    if not df_proventos.empty:
        if not df_rv_final.empty:
             active_tickers = set(df_rv_final['ticker'].unique())
             df_proventos = df_proventos[df_proventos['ticker'].isin(active_tickers)]
        else:
             df_proventos = df_proventos[0:0]

    # 3.4 Fetch History
    with st.spinner("Sincronizando mercado..."):
        tickers_download = []
        if not df_rv_final.empty:
            tickers_carteira = df_rv_final['ticker'].unique().tolist()
            termos_excluir = ['TESOURO', 'CDB', 'LCI', 'LCA', 'IPCA', 'CAIXA', 'SALDO', 'CDI']
            tickers_download = [t for t in tickers_carteira if not any(x in str(t).upper() for x in termos_excluir)]
            tickers_download += ['BRL=X', 'EURBRL=X', 'CADBRL=X'] 
        
        min_date = datetime.now() - timedelta(days=365*5)
        if not df_rv_final.empty and 'data' in df_rv_final.columns:
             # Ensure data is datetime
             df_rv_final['data'] = pd.to_datetime(df_rv_final['data'], dayfirst=True, errors='coerce')
             min_date = min(min_date, df_rv_final['data'].min())
        
        df_hist_prices = pd.DataFrame()
        if tickers_download:
            try:
                df_hist_prices = fetch_historical_data(list(set(tickers_download)), min_date)
                # Garante continuidade
                df_hist_prices = df_hist_prices.ffill().fillna(0)
            except:
                pass

    # --- DEBUG VITAL ---
    with st.expander("🕵️ Debug: Rastreio de Patrimônio", expanded=False):
        c_dbg1, c_dbg2, c_dbg3 = st.columns(3)
        with c_dbg1:
            st.markdown("###### 📊 Total RF + Caixa (Consolidado)")
            if not df_rf_final.empty:
                col_val = next((c for c in df_rf_final.columns if c in ['Valor', 'Atual', 'Saldo', 'Investido']), None)
                if col_val:
                     df_chk = df_rf_final.groupby('Ticker')[col_val].sum().reset_index().sort_values(col_val, ascending=False)
                     st.dataframe(df_chk.style.format({col_val: 'R$ {:,.2f}'}), use_container_width=True, height=200)
                     st.caption(f"**Soma Bruta dos Eventos:** R$ {df_chk[col_val].sum():,.2f}")

        with c_dbg2:
            st.markdown("###### 🏦 Classificação")
            if not df_rf_final.empty:
                n_cash = len(df_rf_final[df_rf_final['Ticker'].str.contains(regex_cash_sacred, case=False) & ~df_rf_final['Ticker'].str.contains(regex_inv_protect, case=False)])
                n_inv = len(df_rf_final) - n_cash
                st.metric("Registros Caixa", n_cash)
                st.metric("Registros Invest.", n_inv)

        with c_dbg3:
            st.markdown("###### 📉 Checagem de Cotações")
            if not df_hist_prices.empty:
                last = df_hist_prices.iloc[-1]
                zeros = last[last == 0].index.tolist()
                if zeros: st.error(f"Zeros no último dia: {zeros}")
                else: st.success("Nenhum ativo zerado hoje.")

    # 4. RUN ENGINE
    try:
        df_cambio = load_cambio()
        days_lookback = (datetime.now() - min_date).days + 10
        
        multi_result = reconstruct_history_multicurrency(
            df_bruto=df_rv_final,
            df_proventos=df_proventos,
            days_lookback=days_lookback,
            df_prices_external=df_hist_prices,
            df_rf_raw=df_rf_final,
            df_cambio=df_cambio
        )
        
        from core.consolidator import consolidate_to_brl
        
        if not multi_result.buckets:
            st.warning("Dados insuficientes.")
            st.stop()
            
        consolidated = consolidate_to_brl(multi_result.buckets, multi_result.fx_rates)
        df_engine_input = consolidated.to_engine_input()
        
        # Calculate TWR
        resultado = run_performance_engine_compat(df_engine_input)
        
    except Exception as e:
        st.error(f"Erro Crítico no Motor: {e}")
        st.stop()

    # 5. VISUALIZATION (ROBUST PLOTTING)
    st.markdown("---")
    
    # Date Filtering Logic
    if df_engine_input.empty:
         st.error("Engine retornou dados vazios.")
         st.stop()
         
    data_max = df_engine_input.index.max()
    data_min = df_engine_input.index.min()
    
    cols_filt = st.columns([3, 1])
    with cols_filt[0]:
        sel_per = st.radio("Período:", ["1M", "3M", "6M", "YTD", "1Y", "2Y", "MAX"], index=6, horizontal=True)
    with cols_filt[1]:
        years = sorted(df_engine_input.index.year.unique(), reverse=True)
        sel_year = st.selectbox("Ano:", ["Todos"] + [str(y) for y in years])

    if sel_year != "Todos":
        d_start = pd.Timestamp(int(sel_year), 1, 1)
        d_end = pd.Timestamp(int(sel_year), 12, 31)
    else:
        d_end = data_max
        offset_map = {"1M": 30, "3M": 90, "6M": 180, "1Y": 365, "2Y": 730}
        if sel_per == "YTD": d_start = pd.Timestamp(data_max.year, 1, 1)
        elif sel_per == "MAX": d_start = data_min
        else: d_start = data_max - timedelta(days=offset_map.get(sel_per, 30))

    # Slice & Clean (Cure Graph Breaks)
    mask_time = (df_engine_input.index >= d_start) & (df_engine_input.index <= d_end)
    df_slice = df_engine_input[mask_time].copy()
    
    if df_slice.empty:
        st.error("Período vazio.")
        st.stop()
        
    res = run_performance_engine_compat(df_slice)
    
    # Imports for formatting
    from core.utils import format_decimal_br

    # --- METRICS ---
    m1, m2, m3, m4 = st.columns(4)
    with m1: st.metric("TWR Período", f"{format_decimal_br(res.total_twr * 100)}%")
    with m2: st.metric("Patrimônio", f"R$ {format_decimal_br(res.nav_series.iloc[-1])}")
    with m3: st.metric("Drawdown", f"{format_decimal_br(res.max_drawdown * 100)}%")
    with m4: st.metric("Volatilidade", f"{format_decimal_br(res.volatility * 100)}%")
    
    st.markdown("---")
    
    # PLOTS
    s_twr = (res.cumulative_series * 100).fillna(method='ffill')
    s_nav = res.nav_series.fillna(method='ffill')
    
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=s_twr.index, y=s_twr, name="Rentabilidade %", line=dict(color='#4f46e5', width=3)))
    fig.add_trace(go.Scatter(x=s_nav.index, y=s_nav, name="Patrimônio R$", yaxis="y2", line=dict(color='#94a3b8', dash='dot', width=1)))
    
    fig.update_layout(
        title="Evolução", template="plotly_dark", hovermode="x unified",
        yaxis=dict(title="%", ticksuffix="%"),
        yaxis2=dict(title="R$", overlaying="y", side="right"),
        legend=dict(orientation="h", y=1.1)
    )
    st.plotly_chart(fig, use_container_width=True)
    
    # Drawdown
    s_dd = (res.drawdown_series * 100).fillna(0)
    fig_dd = go.Figure()
    fig_dd.add_trace(go.Scatter(x=s_dd.index, y=s_dd, fill='tozeroy', line=dict(color='#ef4444'), name='Drawdown'))
    fig_dd.update_layout(title="Drawdown", template="plotly_dark", yaxis_ticksuffix="%")
    st.plotly_chart(fig_dd, use_container_width=True)

if __name__ == "__main__":
    main()

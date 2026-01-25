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
# Imports global theme from .streamlit/config.toml implicitly, 
# but we add specific overrides here if needed.
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
# Reusing the compatibility wrapper from Investimentos to allow smooth migration
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
            st.switch_page("Home.py")

    # 1. LOAD DATA
    with st.spinner("Carregando dados..."):
        df_assets = load_assets()
        df_proventos = load_proventos()
        df_rf_raw = load_fixed_income()
    
    if df_assets.empty and df_rf_raw.empty:
        st.warning("Sem dados de transações para calcular performance.")
        st.stop()

    # 2. FILTERS (SimplifiedSidebar for Performance)
    with st.sidebar:
        st.header("Filtros de Portfolio")
        
        # Filtros de Ativos
        all_tickers = []
        if not df_assets.empty:
            all_tickers += df_assets['ticker'].unique().tolist()
        if not df_rf_raw.empty:
            if 'Ticker' in df_rf_raw.columns:
                all_tickers += df_rf_raw['Ticker'].unique().tolist()
        
        all_tickers = sorted(list(set(all_tickers)))
        
        sel_tickers = st.multiselect("Filtrar Ativos:", all_tickers)
        
        if st.button("🔄 Recalcular", use_container_width=True):
            st.cache_data.clear()
            st.rerun()

    # 3. ENGINE EXECUTION
    # Apply filters
    df_rv_final = df_assets.copy()
    df_rf_final = df_rf_raw.copy()
    
    if sel_tickers:
        if not df_rv_final.empty:
            df_rv_final = df_rv_final[df_rv_final['ticker'].isin(sel_tickers)]
        if not df_rf_final.empty:
            df_rf_final = df_rf_final[df_rf_final['Ticker'].isin(sel_tickers)]

    # Fetch History
    with st.spinner("Sincronizando mercado..."):
        tickers_download = []
        if not df_rv_final.empty:
            tickers_carteira = df_rv_final['ticker'].unique().tolist()
            termos_excluir = ['TESOURO', 'CDB', 'LCI', 'LCA', 'IPCA', 'CAIXA', 'SALDO','CDI']
            tickers_download = [t for t in tickers_carteira if not any(x in t.upper() for x in termos_excluir)]
            tickers_download += ['BRL=X', 'EURBRL=X', 'CADBRL=X'] # Currencies
        
        min_date = datetime.now() - timedelta(days=365*5) # 5 years default
        if not df_rv_final.empty:
            min_date = min(min_date, df_rv_final['data'].min())
        
        df_hist_prices = pd.DataFrame()
        if tickers_download:
            df_hist_prices = fetch_historical_data(list(set(tickers_download)), min_date)

    # Run Engine
    try:
        df_cambio = load_cambio()
        
        # Days lookback: Use max available
        days_lookback = (datetime.now() - min_date).days + 10
        
        multi_result = reconstruct_history_multicurrency(
            df_bruto=df_rv_final,
            df_proventos=df_proventos,
            days_lookback=days_lookback,
            df_prices_external=df_hist_prices,
            df_rf_raw=df_rf_final,
            df_cambio=df_cambio
        )
        
        # Consolidation Logic
        # For simplicity in this v1 of separate page, we default to Consolidated BRL view
        # unless user drills down (future feature)
        from core.consolidator import consolidate_to_brl
        
        if not multi_result.buckets:
            st.warning("Não foi possível reconstruir o histórico com os filtros atuais.")
            st.stop()
            
        consolidated = consolidate_to_brl(multi_result.buckets, multi_result.fx_rates)
        df_engine_input = consolidated.to_engine_input()
        
        # Calculate TWR
        resultado = run_performance_engine_compat(df_engine_input)
        resultado.currency = 'BRL'
        resultado.is_consolidated = True
        
    except Exception as e:
        st.error(f"Erro no motor de cálculo: {e}")
        st.stop()

    # 4. VISUALIZATION
    # Time Selection
    st.markdown("---")
    
    # Calculate Date Range
    data_max = df_engine_input.index.max()
    data_min_global = df_engine_input.index.min()
    
    c_per, c_ano = st.columns([3, 1])
    with c_per:
        periodos = ["1M", "3M", "6M", "YTD", "1Y", "2Y", "MAX"]
        sel_periodo = st.radio("Período:", periodos, index=6, horizontal=True)
    
    with c_ano:
        anos = sorted(df_engine_input.index.year.unique(), reverse=True)
        sel_ano = st.selectbox("Ano:", ["Todos"] + [str(a) for a in anos])

    # Filter Logic (Date Slicing)
    if sel_ano != "Todos":
        start_date = pd.Timestamp(int(sel_ano), 1, 1)
        end_date = pd.Timestamp(int(sel_ano), 12, 31)
    else:
        end_date = data_max
        if sel_periodo == "1M": start_date = data_max - pd.DateOffset(months=1)
        elif sel_periodo == "3M": start_date = data_max - pd.DateOffset(months=3)
        elif sel_periodo == "6M": start_date = data_max - pd.DateOffset(months=6)
        elif sel_periodo == "YTD": start_date = pd.Timestamp(data_max.year, 1, 1)
        elif sel_periodo == "1Y": start_date = data_max - pd.DateOffset(years=1)
        elif sel_periodo == "2Y": start_date = data_max - pd.DateOffset(years=2)
        else: start_date = data_min_global

    # Apply Slice
    mask = (df_engine_input.index >= start_date) & (df_engine_input.index <= end_date)
    df_slice = df_engine_input[mask]
    
    if df_slice.empty:
        st.error("Período vazio.")
        st.stop()
        
    # Re-run TWR on slice
    res_period = run_performance_engine_compat(df_slice)
    
    # --- METRICS ---
    k1, k2, k3, k4 = st.columns(4)
    with k1: st.metric("TWR Período", f"{res_period.total_twr:.2%}")
    with k2: st.metric("Patrimônio Final", f"R$ {res_period.nav_series.iloc[-1]:,.2f}")
    with k3: st.metric("Drawdown Max", f"{res_period.max_drawdown:.2%}")
    with k4: st.metric("Volatilidade", f"{res_period.volatility:.2%}")
    
    st.markdown("---")
    
    # --- CHARTS ---
    # 1. Evolution (Dual Axis)
    fig_evol = go.Figure()
    
    # TWR
    fig_evol.add_trace(go.Scatter(
        x=res_period.cumulative_series.index,
        y=res_period.cumulative_series * 100,
        name="Rentabilidade (%)",
        line=dict(color='#4f46e5', width=3)
    ))
    
    # NAV (Secondary)
    fig_evol.add_trace(go.Scatter(
        x=res_period.nav_series.index,
        y=res_period.nav_series,
        name="Patrimônio (R$)",
        yaxis="y2",
        line=dict(color='#94a3b8', width=1, dash='dot')
    ))
    
    fig_evol.update_layout(
        title="Evolução Patrimonial vs Rentabilidade",
        template="plotly_dark",
        yaxis=dict(title="Rentabilidade (%)", ticksuffix="%"),
        yaxis2=dict(title="Patrimônio (R$)", overlaying="y", side="right", tickprefix="R$ "),
        hovermode="x unified",
        legend=dict(orientation="h", y=1.1)
    )
    st.plotly_chart(fig_evol, use_container_width=True)
    
    # 2. Drawdown
    fig_dd = go.Figure()
    fig_dd.add_trace(go.Scatter(
        x=res_period.drawdown_series.index,
        y=res_period.drawdown_series * 100,
        fill='tozeroy',
        line=dict(color='#ef4444'),
        name='Drawdown'
    ))
    fig_dd.update_layout(title="Underwater Plot (Drawdown)", template="plotly_dark", yaxis_ticksuffix="%")
    st.plotly_chart(fig_dd, use_container_width=True)

if __name__ == "__main__":
    main()

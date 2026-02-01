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
from core.data.loader import load_assets, load_proventos, load_fixed_income, load_cambio
from core.data.market import fetch_historical_data
from core.engine import reconstruct_history_multicurrency
from core.performance.calculator import calculate_canonical_twr, DEFAULT_PREMISES


# --- NOVOS IMPORTS (v2.1) - Visualizações e Validações Otimizadas ---
from core.performance.corrections import validate_twr_continuity
from core.performance.visualizations import (
    plot_nav_vs_twr,
    plot_drawdown_volatility,
    create_attribution_table,
    create_status_badge
)
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
from core.ui import get_card_css, render_metric_card

st.markdown(get_card_css(), unsafe_allow_html=True)

st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');

    html, body, [class*="css"] {
        font-family: 'Outfit', sans-serif;
    }

    /* ===== SECTION HEADERS ===== */
    .section-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 32px 0 20px 0;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .section-icon {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(99, 102, 241, 0.1) 100%);
    }

    .section-title {
        font-size: 1.1rem;
        font-weight: 600;
        color: #f1f5f9;
        margin: 0;
    }

    .section-subtitle {
        font-size: 0.8rem;
        color: #64748b;
        margin: 0;
    }

    /* ===== PERIOD SELECTOR ===== */
    .period-btn {
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 0.85rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.03);
        color: #94a3b8;
    }

    .period-btn:hover {
        background: rgba(99, 102, 241, 0.15);
        border-color: rgba(99, 102, 241, 0.3);
        color: #e2e8f0;
    }

    .period-btn.active {
        background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
        border-color: transparent;
        color: white;
    }

    /* HERO TITLE (BARROOTS) */
    .hero-container {
        text-align: center;
        padding-top: 2vh;
        padding-bottom: 2vh;
        animation: fadeIn 1.2s ease-out;
    }
    
    .hero-title {
        font-size: 3.5rem;
        font-weight: 800;
        background: linear-gradient(to right, #ffffff, #a5b4fc);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 0px;
        letter-spacing: -2px;
        text-shadow: 0 0 40px rgba(165, 180, 252, 0.2);
    }
    
    .hero-subtitle {
        color: #94a3b8;
        font-size: 1.1rem;
        font-weight: 300;
        margin-top: 5px;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 10px;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .badge {
        padding: 4px 10px;
        border-radius: 20px;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .badge-gips {
        background: rgba(16, 185, 129, 0.15);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.3);
    }

    /* ===== CHART CONTAINER ===== */
    .chart-container {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 16px;
        padding: 20px;
        margin: 16px 0;
    }

    /* ===== SIDEBAR IMPROVEMENTS ===== */
    .sidebar-section {
        background: rgba(255, 255, 255, 0.03);
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 16px;
    }

    .sidebar-title {
        font-size: 0.75rem;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 12px;
    }

    /* ===== DIVIDERS ===== */
    .divider {
        height: 1px;
        background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%);
        margin: 24px 0;
    }

    /* ===== HIDE DEFAULT METRICS STYLING ===== */
    [data-testid="stMetric"] {
        background: transparent !important;
    }

    /* ===== RESPONSIVE ADJUSTMENTS ===== */
    @media (max-width: 768px) {
        .metric-card { padding: 16px; }
        .metric-value { font-size: 1.4rem; }
        .page-title { font-size: 1.5rem; }
    }

    h1, h2, h3 { color: #f1f5f9; }
</style>
""", unsafe_allow_html=True)

# --- 3. HELPER FUNCTIONS ---
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
    # --- PAGE HEADER ---
    # --- PAGE HEADER ---
    st.markdown("""
    <div class="hero-container">
        <div class="hero-title">Análise de Performance</div>
        <div class="hero-subtitle">
            Rentabilidade Time-Weighted Return
            <span class="badge badge-gips">GIPS Compliant</span>
        </div>
    </div>
    """, unsafe_allow_html=True)

    # Navigation button
    col_nav = st.columns([4, 1])
    with col_nav[1]:
        if st.button("← Voltar", use_container_width=True, type="secondary"):
            st.switch_page("Home.py")

    # 1. LOAD DATA
    with st.spinner("Carregando dados..."):
        df_assets = load_assets()
        df_proventos = load_proventos()
        df_rf_raw = load_fixed_income()
    
    if df_assets.empty and df_rf_raw.empty:
        st.warning("Sem dados de transações para calcular performance.")
        st.stop()

    # 2. FILTERS (Enhanced Sidebar)
    with st.sidebar:
        st.markdown("""
        <div style="padding: 8px 0 16px 0;">
            <div style="font-size: 1.1rem; font-weight: 700; color: #f1f5f9;">⚙️ Configurações</div>
            <div style="font-size: 0.75rem; color: #64748b;">Personalize sua análise</div>
        </div>
        """, unsafe_allow_html=True)

        # Filtros de Ativos
        st.markdown('<div class="sidebar-title">📊 Filtros de Ativos</div>', unsafe_allow_html=True)

        all_tickers = []
        if not df_assets.empty:
            all_tickers += df_assets['ticker'].unique().tolist()
        if not df_rf_raw.empty:
            if 'Ticker' in df_rf_raw.columns:
                all_tickers += df_rf_raw['Ticker'].unique().tolist()

        all_tickers = sorted(list(set(all_tickers)))

        # Contagem de ativos
        total_rv = len(df_assets['ticker'].unique()) if not df_assets.empty else 0
        total_rf = len(df_rf_raw['Ticker'].unique()) if not df_rf_raw.empty and 'Ticker' in df_rf_raw.columns else 0

        st.caption(f"📈 {total_rv} ativos RV • 💰 {total_rf} posições RF")

        sel_tickers = st.multiselect(
            "Selecione ativos específicos:",
            all_tickers,
            placeholder="Todos os ativos",
            help="Deixe vazio para incluir todos os ativos"
        )

        st.markdown('<div class="divider"></div>', unsafe_allow_html=True)

        # Ações
        st.markdown('<div class="sidebar-title">🔧 Ações</div>', unsafe_allow_html=True)

        if st.button("🔄 Recalcular Dados", use_container_width=True, type="primary"):
            st.cache_data.clear()
            st.rerun()

        st.caption("Limpa cache e recarrega dados do mercado")

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
        
        # Load Manual RF Values for accurate valuation
        from core.data.loader import load_fixed_income_manual
        df_rf_manual = load_fixed_income_manual()
        
        manual_rf_values = {}
        if not df_rf_manual.empty:
            # Create dictionary {Ticker: Valor Atual}
            # Cleaning Data
            df_rf_manual['Atual'] = pd.to_numeric(df_rf_manual['Atual'], errors='coerce').fillna(0)
            df_rf_manual = df_rf_manual[df_rf_manual['Atual'] > 0]
            manual_rf_values = dict(zip(df_rf_manual['Ticker'].str.strip(), df_rf_manual['Atual']))
        
        multi_result = reconstruct_history_multicurrency(
            df_bruto=df_rv_final,
            df_proventos=df_proventos,
            days_lookback=days_lookback,
            df_prices_external=df_hist_prices,
            df_rf_raw=df_rf_final,
            df_cambio=df_cambio,
            manual_rf_values=manual_rf_values
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

        # =====================================================================
        # FIX: Filtrar período para começar apenas quando há patrimônio real
        # Isso evita que o gráfico comece antes das primeiras transações
        # =====================================================================

        # Encontrar primeira data com NAV > 0
        if 'nav' in df_engine_input.columns:
            first_valid_nav = df_engine_input[df_engine_input['nav'] > 0].first_valid_index()
            if first_valid_nav is not None:
                df_engine_input = df_engine_input.loc[first_valid_nav:]

        # Forward-fill NAV para evitar gaps de zero no meio da série
        if 'nav' in df_engine_input.columns:
            # Substituir zeros no meio por forward-fill (mantém último valor conhecido)
            df_engine_input['nav'] = df_engine_input['nav'].replace(0, np.nan).ffill().fillna(0)

        # Calculate TWR
        resultado = run_performance_engine_compat(df_engine_input)
        resultado.currency = 'BRL'
        resultado.is_consolidated = True
        
    except Exception as e:
        st.error(f"Erro no motor de cálculo: {e}")
        st.stop()

    # 4. VISUALIZATION
    # Time Selection Section
    st.markdown('<div class="divider"></div>', unsafe_allow_html=True)

    st.markdown("""
    <div class="section-header">
        <div class="section-icon">📅</div>
        <div>
            <div class="section-title">Período de Análise</div>
            <div class="section-subtitle">Selecione o intervalo de tempo para análise</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    # Calculate Date Range
    data_max = df_engine_input.index.max()
    data_min_global = df_engine_input.index.min()

    c_per, c_ano = st.columns([3, 1])
    with c_per:
        periodos = ["1M", "3M", "6M", "YTD", "1Y", "2Y", "MAX"]
        sel_periodo = st.radio(
            "Período:",
            periodos,
            index=6,
            horizontal=True,
            help="Selecione o período de análise"
        )

    with c_ano:
        anos = sorted(df_engine_input.index.year.unique(), reverse=True)
        sel_ano = st.selectbox(
            "Filtrar por Ano:",
            ["Todos"] + [str(a) for a in anos],
            help="Filtre por um ano específico"
        )

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

    # Calculate MTM Return (Simple ROI)
    nav_inicial = res_period.nav_series.iloc[0] if not res_period.nav_series.empty else 0.0
    nav_final = res_period.nav_series.iloc[-1] if not res_period.nav_series.empty else 0.0
    total_flow = res_period.total_flow
    total_pnl = res_period.total_pnl

    # "Invested Capital" proxy: Initial Capital + Net Flows
    invested_capital = nav_inicial + total_flow

    retorno_mtm = 0.0
    if invested_capital > 0:
        retorno_mtm = total_pnl / invested_capital

    # Section header for metrics
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">📊</div>
        <div>
            <div class="section-title">Métricas de Performance</div>
            <div class="section-subtitle">Indicadores chave do período selecionado</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    # Render styled metric cards
    k1, k2, k3, k4, k5 = st.columns(5)

    with k1:
        twr_positive = res_period.total_twr >= 0
        st.markdown(render_metric_card(
            label="TWR Período",
            value=f"{res_period.total_twr:.2%}",
            delta=f"{res_period.annualized_twr:.2%} a.a." if res_period.annualized_twr != 0 else None,
            delta_positive=twr_positive,
            subtitle="Retorno ponderado pelo tempo",
            icon="📈" if twr_positive else "📉"
        ), unsafe_allow_html=True)

    with k2:
        roi_positive = retorno_mtm >= 0
        st.markdown(render_metric_card(
            label="Retorno MTM",
            value=f"{retorno_mtm:.2%}",
            delta=f"R$ {total_pnl:,.0f}" if total_pnl != 0 else None,
            delta_positive=roi_positive,
            subtitle="ROI sobre capital investido",
            icon="💰" if roi_positive else "💸"
        ), unsafe_allow_html=True)

    with k3:
        patrimonio_delta = nav_final - nav_inicial
        patrimonio_positive = patrimonio_delta >= 0
        st.markdown(render_metric_card(
            label="Patrimônio",
            value=f"R$ {nav_final:,.0f}",
            delta=f"R$ {patrimonio_delta:+,.0f}" if patrimonio_delta != 0 else None,
            delta_positive=patrimonio_positive,
            subtitle="Valor atual do portfólio",
            icon="🏦"
        ), unsafe_allow_html=True)

    with k4:
        st.markdown(render_metric_card(
            label="Drawdown Máx",
            value=f"{res_period.max_drawdown:.2%}",
            delta_positive=False if res_period.max_drawdown < -0.05 else True,
            subtitle="Maior queda do pico",
            icon="📉"
        ), unsafe_allow_html=True)

    with k5:
        vol_status = res_period.volatility < 0.20  # Less than 20% is considered moderate
        st.markdown(render_metric_card(
            label="Volatilidade",
            value=f"{res_period.volatility:.2%}",
            delta_positive=vol_status,
            subtitle="Risco anualizado",
            icon="🎯" if vol_status else "⚡"
        ), unsafe_allow_html=True)

    st.markdown('<div class="divider"></div>', unsafe_allow_html=True)
    
    # --- CHARTS ---
    # Section header for evolution chart
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">📈</div>
        <div>
            <div class="section-title">Evolução Patrimonial</div>
            <div class="section-subtitle">Patrimônio (R$) vs Rentabilidade Acumulada (%)</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    # 1. Evolution (Dual Axis) - VERSÃO OTIMIZADA v2.1
    fig_evol = plot_nav_vs_twr(
        df_slice,
        res_period.cumulative_series,
        df_slice['flow'],
        title=""  # Title handled by section header
    )
    st.plotly_chart(
        fig_evol,
        use_container_width=True,
        config={'displayModeBar': False}
    )

    # --- STATUS DE VALIDAÇÃO v2.1 ---
    val_result = validate_twr_continuity(df_slice)

    # Enhanced validation badge (val_result é um dicionário)
    if val_result.get('is_valid', False):
        st.success("✅ Dados validados — Série contínua sem gaps significativos", icon="✅")
    # 2. Drawdown + Volatilidade Section
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">⚠️</div>
        <div>
            <div class="section-title">Análise de Risco</div>
            <div class="section-subtitle">Drawdown e Volatilidade Rolling (20 dias)</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    if len(df_slice) > 20:  # Mínimo para rolling window
        fig_risk = plot_drawdown_volatility(
            df_slice,
            res_period.drawdown_series,
            res_period.daily_returns,
            rolling_window=20
        )
        st.plotly_chart(
            fig_risk,
            use_container_width=True,
            config={'displayModeBar': False}
        )
    else:
        # Fallback para períodos curtos
        st.info("📊 Período curto — mostrando apenas drawdown")
        fig_dd = go.Figure()
        fig_dd.add_trace(go.Scatter(
            x=res_period.drawdown_series.index,
            y=res_period.drawdown_series * 100,
            fill='tozeroy',
            line=dict(color='#f43f5e', width=1.5),
            fillcolor='rgba(244, 63, 94, 0.12)',
            name='Drawdown',
            hovertemplate='%{x|%d/%m/%Y}<br>%{y:.1f}%<extra></extra>'
        ))
        fig_dd.update_layout(
            yaxis_ticksuffix='%',
            margin=dict(t=20, b=40, l=50, r=50),
            showlegend=False,
            plot_bgcolor='rgba(0,0,0,0)',
            paper_bgcolor='rgba(0,0,0,0)',
            font=dict(color='#64748b', size=10),
            xaxis=dict(showgrid=False, zeroline=False, showline=False),
            yaxis=dict(
                gridcolor='rgba(148, 163, 184, 0.1)',
                zeroline=False,
                showline=False
            ),
            hoverlabel=dict(bgcolor='#1e293b', font_color='#f1f5f9'),
            height=250
        )
        st.plotly_chart(fig_dd, use_container_width=True, config={'displayModeBar': False})
    st.markdown('<div class="divider"></div>', unsafe_allow_html=True)

    with st.expander("💰 Diagnóstico de Renda Fixa", expanded=False, icon="📊"):
        st.markdown("""
        <div style="padding: 12px 0; color: #94a3b8; font-size: 0.85rem;">
            Verificação da integração e cálculos de Renda Fixa no portfólio.
        </div>
        """, unsafe_allow_html=True)

        if df_rf_raw.empty:
            st.warning("❌ Sem dados de Renda Fixa carregados. Verifique a aba 'Renda_Fixa' na planilha.")
        else:
            st.success(f"✅ {len(df_rf_raw)} eventos de RF carregados")

            # Mostrar eventos brutos
            st.write("**Eventos RF brutos:**")
            st.dataframe(df_rf_raw.head(10), use_container_width=True)

            # Tentar calcular curva RF
            try:
                from core.fixed_income_engine import FixedIncomeEngine

                rf_engine = FixedIncomeEngine(df_rf_raw)
                rf_result = rf_engine.build_daily_curve()

                col1, col2, col3 = st.columns(3)
                with col1:
                    st.metric("Eventos Processados", len(rf_engine.events))
                with col2:
                    st.metric("Posições Fechadas", len(rf_engine.closed_positions))
                with col3:
                    st.metric("Posições Abertas", len(rf_engine.open_positions_data))

                st.write(f"**Fluxos Externos (para TWR):** {len(rf_result.external_flows)}")

                if rf_result.external_flows:
                    flows_data = []
                    for f in rf_result.external_flows:
                        flows_data.append({
                            'Data': f.date.strftime('%Y-%m-%d') if hasattr(f.date, 'strftime') else str(f.date),
                            'Tipo': f.flow_type,
                            'Valor': f"R$ {f.amount:,.2f}",
                            'Ticker': f.ticker
                        })
                    st.dataframe(pd.DataFrame(flows_data), use_container_width=True)

                if not rf_result.daily_curve.empty:
                    st.write("**Curva RF (últimos 10 dias):**")
                    st.dataframe(rf_result.daily_curve.tail(10), use_container_width=True)

                    st.write(f"**Valor Atual RF:** R$ {rf_result.current_value:,.2f}")
                    st.write(f"**Retorno RF:** {rf_result.total_return_pct:.2f}%")
                    st.write(f"**Hipótese:** {rf_result.hypothesis_note}")

                    # Plotar curva RF
                    fig_rf = go.Figure()
                    fig_rf.add_trace(go.Scatter(
                        x=rf_result.daily_curve.index,
                        y=rf_result.daily_curve['total'],
                        name="Patrimônio RF",
                        line=dict(color='#10b981', width=2)
                    ))
                    fig_rf.update_layout(
                        title="Evolução Patrimônio Renda Fixa",
                        template="plotly_dark",
                        yaxis_tickprefix="R$ "
                    )
                    st.plotly_chart(fig_rf, use_container_width=True)
                else:
                    st.warning("Curva RF vazia após processamento")

            except Exception as e:
                st.error(f"Erro ao processar RF: {e}")
                import traceback
                st.code(traceback.format_exc())

        # Verificar se RF foi integrado ao consolidado
        st.markdown("---")
        st.subheader("Verificação de Integração no Consolidado")

        if 'BRL' in multi_result.buckets:
            brl_bucket = multi_result.buckets['BRL']
            st.write(f"**Tickers no bucket BRL:** {brl_bucket.tickers}")

            if 'RF_AGGREGATED' in brl_bucket.tickers:
                st.success("✅ RF está integrado ao bucket BRL")
            else:
                st.warning("⚠️ RF_AGGREGATED não encontrado no bucket BRL")

            st.write(f"**NAV final BRL:** R$ {brl_bucket.nav_series.iloc[-1]:,.2f}")
            st.write(f"**Total flows BRL:** R$ {brl_bucket.flow_series.sum():,.2f}")
        else:
            st.warning("❌ Bucket BRL não encontrado")

if __name__ == "__main__":
    main()

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
from core.data.market import fetch_historical_data, fetch_market_data
from core.finance import calcular_carteira_fechada
from core.logic import normalize_ticker
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
    initial_sidebar_state="collapsed" 
)

# --- CSS / THEME ---
# Imports global theme from .streamlit/config.toml implicitly,
# but we add specific overrides here if needed.
from core.ui import get_card_css, render_metric_card, render_fab

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

    /* ===== VIEW MODE RADIO STYLING ===== */
    div[data-testid="stRadio"][data-baseweb="radio"] > label {
        padding: 8px 16px !important;
        border-radius: 10px !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        background: rgba(255, 255, 255, 0.03) !important;
        transition: all 0.3s ease !important;
        margin-right: 8px !important;
    }
    
    div[data-testid="stRadio"] label[data-checked="true"] {
        background: rgba(167, 139, 250, 0.15) !important;
        border-color: rgba(167, 139, 250, 0.5) !important;
        color: #a78bfa !important;
        box-shadow: 0 0 15px rgba(167, 139, 250, 0.2) !important;
    }
    
    div[data-testid="stRadio"] label:hover {
        background: rgba(255, 255, 255, 0.08) !important;
        border-color: rgba(255, 255, 255, 0.2) !important;
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
    render_fab()
    st.markdown("""
    <div class="hero-container">
        <div class="hero-title">Análise de Performance</div>
        <div class="hero-subtitle">
            Rentabilidade Time-Weighted Return
            <span class="badge badge-gips">GIPS Compliant</span>
        </div>
    </div>
    """, unsafe_allow_html=True)

    # Navigation buttons - Styled with glassmorphism
    st.markdown("""
    <style>
        .action-btn-container {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-bottom: 20px;
        }
        .action-btn {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 10px 20px;
            color: #94a3b8;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .action-btn:hover {
            background: rgba(99, 102, 241, 0.15);
            border-color: rgba(99, 102, 241, 0.4);
            color: #e2e8f0;
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(99, 102, 241, 0.2);
        }
        .action-btn.primary {
            background: rgba(99, 102, 241, 0.2);
            border-color: rgba(99, 102, 241, 0.3);
            color: #c4b5fd;
        }
        .action-btn.primary:hover {
            background: rgba(99, 102, 241, 0.3);
            border-color: rgba(99, 102, 241, 0.5);
            color: #e2e8f0;
        }
    </style>
    """, unsafe_allow_html=True)
    
    col_btns = st.columns([4, 1, 1])
    with col_btns[1]:
        if st.button("🔄 Recarregar", key="btn_reload_perf", use_container_width=True):
            st.cache_data.clear()
            st.rerun()
    with col_btns[2]:
        if st.button("🏠 Home", key="btn_home_perf", use_container_width=True):
            st.switch_page("Home.py")

    # Hide default button styling and apply custom
    st.markdown("""
    <style>
        div[data-testid="stButton"] button {
            background: rgba(255, 255, 255, 0.05) !important;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.15) !important;
            border-radius: 12px !important;
            color: #94a3b8 !important;
            font-weight: 500 !important;
            transition: all 0.3s ease !important;
        }
        div[data-testid="stButton"] button:hover {
            background: rgba(99, 102, 241, 0.2) !important;
            border-color: rgba(99, 102, 241, 0.4) !important;
            color: #e2e8f0 !important;
            transform: translateY(-1px);
            box-shadow: 0 4px 15px rgba(99, 102, 241, 0.15);
        }
    </style>
    """, unsafe_allow_html=True)

    # ═══════════════════════════════════════════════════════════════════════════
    # VIEW MODE SELECTOR: Simple Toggle
    # ═══════════════════════════════════════════════════════════════════════════
    col_mode1, col_mode2, col_mode_info = st.columns([2, 2, 4])
    with col_mode1:
        view_mode = st.radio(
            "Visão",
            options=["📈 Visão Mercado", "💰 Meu Custo"],
            label_visibility="collapsed",
            index=1,  # Default to "My Money"
            horizontal=True,
            key="perf_view_mode"
        )
    with col_mode_info:
        if view_mode == "📈 Visão Mercado":
            st.caption("💡 Usa câmbio de **mercado** do dia — ideal para comparar com benchmarks")
        else:
            st.caption("💡 Usa **seu preço médio** de remessas — mostra retorno real do seu capital em BRL")


    # 1. LOAD DATA
    with st.spinner("Carregando dados..."):
        df_assets = load_assets()
        df_proventos = load_proventos()
        df_rf_raw = load_fixed_income()
    
    if df_assets.empty and df_rf_raw.empty:
        st.warning("Sem dados de transações para calcular performance.")
        st.stop()

    # 2. PREPARE DATA (sem filtros de sidebar)
    df_rv_final = df_assets.copy()
    df_rf_final = df_rf_raw.copy()

    # Fetch History
    with st.spinner("Sincronizando mercado..."):
        tickers_download = []
        if not df_rv_final.empty:
            tickers_carteira = df_rv_final['ticker'].unique().tolist()
            termos_excluir = ['TESOURO', 'CDB', 'LCI', 'LCA', 'IPCA', 'CAIXA', 'SALDO','CDI']
            tickers_download = [t for t in tickers_carteira if not any(x in t.upper() for x in termos_excluir)]
            # FX: Yahoo uses BRL=X for USD/BRL. For EUR and CAD we need cross rates
            # EURUSD=X * BRL=X = EURBRL, CADUSD=X * BRL=X = CADBRL
            tickers_download += ['BRL=X', 'EURUSD=X', 'CADUSD=X']
        
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
            # Cleaning Data - UPPERCASE para matching com FixedIncomeEngine (linha 212)
            df_rf_manual['Atual'] = pd.to_numeric(df_rf_manual['Atual'], errors='coerce').fillna(0)
            df_rf_manual = df_rf_manual[df_rf_manual['Atual'] > 0]

            # FIX v18.0: Excluir CAIXA/SALDO dos valores manuais para cálculo de performance
            # Caixa é tratado separadamente e não deve ser incluído no NAV do portfólio
            CASH_TICKERS = ['CAIXA', 'SALDO', 'CASH']
            df_rf_manual = df_rf_manual[
                ~df_rf_manual['Ticker'].astype(str).str.strip().str.upper().isin(CASH_TICKERS)
            ]

            # groupby().sum() para agregar corretamente tickers duplicados
            # (dict(zip()) perdia entradas quando o mesmo ticker aparecia mais de uma vez)
            manual_rf_values = (
                df_rf_manual
                .groupby(df_rf_manual['Ticker'].astype(str).str.strip().str.upper())['Atual']
                .sum()
                .to_dict()
            )
        
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
        # Uses market FX rates or personal cost basis depending on view mode
        from core.consolidator import consolidate_to_brl
        
        if not multi_result.buckets:
            st.warning("Não foi possível reconstruir o histórico com os filtros atuais.")
            st.stop()
        
        # Build FX cost basis if "My Money" mode is selected
        # NOTE: For period filters (not MAX), we use a RESET logic where:
        # - Initial position uses market FX of first day of period
        # - New remittances use actual weighted average
        # This is stored in session_state and recalculated when period changes

        fx_cost_basis = None
        if view_mode == "💰 Meu Custo":
            from core.fx_cost_basis import build_fx_cost_series, build_period_fx_series, get_latest_cost_basis

            # Build date index from all buckets
            all_dates = set()
            for bucket in multi_result.buckets.values():
                if not bucket.nav_series.empty:
                    all_dates.update(bucket.nav_series.index)

            if all_dates:
                idx_dates = pd.DatetimeIndex(sorted(all_dates))

                # For now, build standard fx_cost_basis (historical PM)
                # Period-specific logic will be applied later in the slice section
                fx_cost_basis = build_fx_cost_series(df_cambio, idx_dates)

                # Store for later period-specific calculations
                st.session_state['_fx_idx_dates'] = idx_dates
                st.session_state['_fx_df_cambio'] = df_cambio
                st.session_state['_fx_df_assets'] = df_rv_final
        
        # Consolidate with appropriate FX mode
        consolidated = consolidate_to_brl(
            multi_result.buckets, 
            multi_result.fx_rates,
            df_cambio=df_cambio,
            fx_cost_basis=fx_cost_basis
        )
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

        # =================================================================
        # PATRIMÔNIO SPOT: Mesmo cálculo da aba Investimentos
        # Garante que o card "Patrimônio" exibe o mesmo valor.
        # =================================================================
        patrimonio_spot = 0.0
        caixa_spot = 0.0
        CASH_TICKERS_SPOT = {'CAIXA', 'SALDO', 'CASH', 'DISPONIVEL', 'LIQUIDEZ'}
        try:
            # FX defaults — always defined so RF loop below never NameErrors
            usd_spot = 5.50
            eur_spot = 6.00
            cad_spot = 4.00

            # 1. RV — posições × preço spot × FX spot (idêntico a Investimentos)
            df_pos_spot, _ = calcular_carteira_fechada(df_assets)
            if not df_pos_spot.empty:
                tickers_spot = df_pos_spot['Ticker'].unique().tolist()
                tickers_spot += ['BRL=X', 'EURBRL=X', 'CADBRL=X']
                mapa_precos_spot, _ = fetch_market_data(list(set(tickers_spot)))
                usd_spot = mapa_precos_spot.get('BRL=X', usd_spot)
                eur_spot = mapa_precos_spot.get('EURBRL=X', eur_spot)
                cad_spot = mapa_precos_spot.get('CADBRL=X', cad_spot)

                for _, row in df_pos_spot.iterrows():
                    t = row['Ticker']
                    qtd = row['Qtd']
                    m = row['Moeda']
                    if qtd <= 0:
                        continue
                    preco = mapa_precos_spot.get(t, 0.0)
                    if preco <= 0 or 'TESOURO' in t or 'CDB' in t:
                        preco = row['PM_Origem']
                    fx = 1.0
                    if m == 'USD': fx = usd_spot
                    elif m == 'EUR': fx = eur_spot
                    elif m == 'CAD': fx = cad_spot
                    patrimonio_spot += qtd * preco * fx

            # 2. RF — valores manuais (mesma fonte da Investimentos)
            # IMPORTANT: Apply the SAME CASH_TICKERS filter used by the engine so
            # patrimônio_spot and the engine's NAV are on the same basis (both ex-cash).
            # Caixa is captured separately and shown in its own metric card.
            from core.data.loader import load_fixed_income_manual
            from core.finance import summarize_fixed_income_hybrid
            df_rf_manual_spot = load_fixed_income_manual()
            df_rf_raw_spot = load_fixed_income()
            df_prov_spot = load_proventos()

            if not df_rf_manual_spot.empty:
                df_rf_manual_spot['Atual'] = pd.to_numeric(
                    df_rf_manual_spot['Atual'], errors='coerce'
                ).fillna(0)
                # Extract caixa BEFORE filtering
                mask_cash = df_rf_manual_spot['Ticker'].astype(str).str.strip().str.upper().isin(CASH_TICKERS_SPOT)
                caixa_spot = float(df_rf_manual_spot.loc[mask_cash & (df_rf_manual_spot['Atual'] > 0), 'Atual'].sum())
                # Filter out cash — align with engine's manual_rf_values
                df_rf_manual_spot = df_rf_manual_spot[~mask_cash]

            if not df_rf_raw_spot.empty:
                if df_rf_manual_spot.empty:
                    from core.finance import summarize_fixed_income
                    df_rf_spot = summarize_fixed_income(df_rf_raw_spot)
                else:
                    df_rf_spot = summarize_fixed_income_hybrid(
                        df_rf_manual_spot, df_rf_raw_spot, df_prov_spot
                    )
                if not df_rf_spot.empty:
                    df_rf_ativos = df_rf_spot[df_rf_spot['Status'] == 'Ativo']
                    if not df_rf_ativos.empty:
                        for _, rf_row in df_rf_ativos.iterrows():
                            val_rf = float(rf_row['Atual'])
                            m_rf = str(rf_row.get('Moeda', 'BRL')).upper().strip()
                            if m_rf == 'USD':
                                val_rf *= usd_spot
                            elif m_rf == 'EUR':
                                val_rf *= eur_spot
                            elif m_rf == 'CAD':
                                val_rf *= cad_spot
                            patrimonio_spot += val_rf
        except Exception as e:
            print(f"[PATRIMÔNIO SPOT] Erro: {e}")
            patrimonio_spot = 0.0  # Fallback: usar engine

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
            index=3,  # YTD como padrão
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
        else: 
            start_date = data_min_global
            # Para MAX, considerar data mais antiga do câmbio para garantir que Estoque Inicial seja 0 e tudo entre no Fluxo
            if 'data' in df_cambio.columns and not df_cambio.empty:
                min_cambio = pd.to_datetime(df_cambio['data']).min()
                if min_cambio < start_date:
                    start_date = min_cambio

    # Apply Slice
    mask = (df_engine_input.index >= start_date) & (df_engine_input.index <= end_date)
    df_slice = df_engine_input[mask]

    if df_slice.empty:
        st.error("Período vazio.")
        st.stop()

    # Re-run TWR on slice
    res_period = run_performance_engine_compat(df_slice)

    # =====================================================================
    # PERIOD-SPECIFIC PM CALCULATION (Meu Custo mode with period filter)
    # When not MAX, use RESET logic: initial position at market rate of 1st day
    # =====================================================================
    is_period_filtered = sel_periodo != "MAX" or sel_ano != "Todos"
    pm_periodo_info = {}

    if view_mode == "💰 Meu Custo" and is_period_filtered:
        from core.fx_cost_basis import calculate_period_pm_with_reset

        # Get market FX rate for first day of period
        # Try to get from historical data or use current as fallback
        market_fx_first_day = {}

        try:
            # Try to get historical rate from df_hist_prices
            if 'df_hist_prices' in dir() and not df_hist_prices.empty:
                first_day_data = start_date

                # USD/BRL (BRL=X)
                if 'BRL=X' in df_hist_prices.columns:
                    usd_series = df_hist_prices['BRL=X'].dropna()
                    if not usd_series.empty:
                        # Find closest date >= start_date
                        valid_dates = usd_series[usd_series.index >= first_day_data]
                        if not valid_dates.empty:
                            market_fx_first_day['USD'] = float(valid_dates.iloc[0])
                        else:
                            # Fallback to last known before start
                            before_dates = usd_series[usd_series.index < first_day_data]
                            if not before_dates.empty:
                                market_fx_first_day['USD'] = float(before_dates.iloc[-1])

                # EUR/BRL (calculate from EURUSD * USDBRL)
                if 'EURUSD=X' in df_hist_prices.columns and 'USD' in market_fx_first_day:
                    eur_series = df_hist_prices['EURUSD=X'].dropna()
                    if not eur_series.empty:
                        valid_dates = eur_series[eur_series.index >= first_day_data]
                        if not valid_dates.empty:
                            market_fx_first_day['EUR'] = float(valid_dates.iloc[0]) * market_fx_first_day['USD']
                        else:
                            before_dates = eur_series[eur_series.index < first_day_data]
                            if not before_dates.empty:
                                market_fx_first_day['EUR'] = float(before_dates.iloc[-1]) * market_fx_first_day['USD']

                # CAD/BRL (calculate from CADUSD * USDBRL)
                if 'CADUSD=X' in df_hist_prices.columns and 'USD' in market_fx_first_day:
                    cad_series = df_hist_prices['CADUSD=X'].dropna()
                    if not cad_series.empty:
                        valid_dates = cad_series[cad_series.index >= first_day_data]
                        if not valid_dates.empty:
                            market_fx_first_day['CAD'] = float(valid_dates.iloc[0]) * market_fx_first_day['USD']
                        else:
                            before_dates = cad_series[cad_series.index < first_day_data]
                            if not before_dates.empty:
                                market_fx_first_day['CAD'] = float(before_dates.iloc[-1]) * market_fx_first_day['USD']
        except Exception as e:
            pass  # Will use fallback below

        # Fallback to current rates if historical not available
        if 'USD' not in market_fx_first_day:
            _tmp_mapa, _ = fetch_market_data(['BRL=X', 'EURBRL=X', 'CADBRL=X'])
            market_fx_first_day['USD'] = _tmp_mapa.get('BRL=X', 5.50)
            market_fx_first_day['EUR'] = _tmp_mapa.get('EURBRL=X', 6.00)
            market_fx_first_day['CAD'] = _tmp_mapa.get('CADBRL=X', 4.00)

        # Calculate PM with reset for period
        df_cambio_calc = st.session_state.get('_fx_df_cambio', df_cambio)
        df_assets_calc = st.session_state.get('_fx_df_assets', df_assets)

        pm_periodo_info = calculate_period_pm_with_reset(
            df_cambio_calc,
            df_assets_calc,
            pd.Timestamp(start_date),
            pd.Timestamp(end_date),
            market_fx_first_day
        )

    # =====================================================================
    # COTAÇÃO DO ÚLTIMO DIA DO PERÍODO (para períodos fechados)
    # =====================================================================
    # Se o período está fechado (end_date < hoje), usar cotação histórica
    today = pd.Timestamp.now().normalize()
    is_period_closed = end_date < today

    market_fx_last_day = {}

    if is_period_closed and is_period_filtered:
        try:
            if 'df_hist_prices' in dir() and not df_hist_prices.empty:
                last_day_data = end_date

                # USD/BRL (BRL=X)
                if 'BRL=X' in df_hist_prices.columns:
                    usd_series = df_hist_prices['BRL=X'].dropna()
                    if not usd_series.empty:
                        # Find closest date <= end_date
                        valid_dates = usd_series[usd_series.index <= last_day_data]
                        if not valid_dates.empty:
                            market_fx_last_day['USD'] = float(valid_dates.iloc[-1])

                # EUR/BRL (calculate from EURUSD * USDBRL)
                if 'EURUSD=X' in df_hist_prices.columns and 'USD' in market_fx_last_day:
                    eur_series = df_hist_prices['EURUSD=X'].dropna()
                    if not eur_series.empty:
                        valid_dates = eur_series[eur_series.index <= last_day_data]
                        if not valid_dates.empty:
                            market_fx_last_day['EUR'] = float(valid_dates.iloc[-1]) * market_fx_last_day['USD']

                # CAD/BRL (calculate from CADUSD * USDBRL)
                if 'CADUSD=X' in df_hist_prices.columns and 'USD' in market_fx_last_day:
                    cad_series = df_hist_prices['CADUSD=X'].dropna()
                    if not cad_series.empty:
                        valid_dates = cad_series[cad_series.index <= last_day_data]
                        if not valid_dates.empty:
                            market_fx_last_day['CAD'] = float(valid_dates.iloc[-1]) * market_fx_last_day['USD']
        except Exception as e:
            pass  # Will use current rates as fallback

    # =====================================================================
    # DEBUG: Análise de Câmbio - Focado na lógica de PM por período
    # =====================================================================

    # Buscar cotações de mercado atuais (fallback ou para períodos abertos)
    _fx_mapa, _ = fetch_market_data(['BRL=X', 'EURBRL=X', 'CADBRL=X'])
    _fx_usd_current = _fx_mapa.get('BRL=X', 5.50)
    _fx_eur_current = _fx_mapa.get('EURBRL=X', 6.00)
    _fx_cad_current = _fx_mapa.get('CADBRL=X', 4.00)

    # Usar cotação do último dia do período se fechado, senão cotação atual
    if is_period_closed and market_fx_last_day:
        _fx_usd = market_fx_last_day.get('USD', _fx_usd_current)
        _fx_eur = market_fx_last_day.get('EUR', _fx_eur_current)
        _fx_cad = market_fx_last_day.get('CAD', _fx_cad_current)
    else:
        _fx_usd = _fx_usd_current
        _fx_eur = _fx_eur_current
        _fx_cad = _fx_cad_current

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
    k1, k2, k3, k4, k5, k6 = st.columns(6)

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
        # Patrimônio investido (ex-caixa) — same basis as engine NAV
        # patrimônio_spot already has caixa filtered out (aligned with engine)
        nav_display = nav_final
        if patrimonio_spot > 0 and end_date >= data_max:
            nav_display = patrimonio_spot
        # Delta: compare against engine's first NAV (same ex-caixa basis)
        patrimonio_delta = nav_display - nav_inicial
        patrimonio_positive = patrimonio_delta >= 0
        st.markdown(render_metric_card(
            label="Patrimônio Investido",
            value=f"R$ {nav_display:,.0f}",
            delta=f"R$ {patrimonio_delta:+,.0f}" if patrimonio_delta != 0 else None,
            delta_positive=patrimonio_positive,
            subtitle="RV + RF excluindo caixa livre",
            icon="🏦"
        ), unsafe_allow_html=True)

    with k4:
        # Caixa & liquidez — shown separately from investment performance
        aum_total = nav_display + caixa_spot
        caixa_pct = (caixa_spot / aum_total * 100) if aum_total > 0 else 0.0
        st.markdown(render_metric_card(
            label="Caixa & Liquidez",
            value=f"R$ {caixa_spot:,.0f}",
            delta=f"{caixa_pct:.1f}% do AUM" if caixa_spot > 0 else None,
            delta_positive=True,
            subtitle="Saldo disponível / não alocado",
            icon="💵"
        ), unsafe_allow_html=True)

    with k5:
        st.markdown(render_metric_card(
            label="Drawdown Máx",
            value=f"{res_period.max_drawdown:.2%}",
            delta_positive=False if res_period.max_drawdown < -0.05 else True,
            subtitle="Maior queda do pico",
            icon="📉"
        ), unsafe_allow_html=True)

    with k6:
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
            <div class="section-subtitle">Patrimônio investido (RV + RF) em BRL — caixa exibido separadamente</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    df_slice_chart = df_slice.copy()

    # 1. Evolution (Dual Axis) - VERSÃO OTIMIZADA v2.1
    fig_evol = plot_nav_vs_twr(
        df_slice_chart,
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

    st.markdown('</div class="divider"></div>', unsafe_allow_html=True)

    # ═══════════════════════════════════════════════════════════════════════════════
    # ATRIBUIÇÃO DE RETORNO: Ativo vs Câmbio
    # R_total = (1 + R_ativo) × (1 + R_câmbio) − 1
    # ═══════════════════════════════════════════════════════════════════════════════

    _foreign_currencies = [
        k for k, b in multi_result.buckets.items()
        if k not in ('BRL',) and not k.endswith('_DIRECT')
        and not b.nav_series.empty
    ]

    if _foreign_currencies:
        try:
            from core.consolidator import CurrencyBucket
            from core.performance.decomposition import decompose_portfolio

            def _slice_s(s, s_date, e_date):
                if s is None or (hasattr(s, 'empty') and s.empty):
                    return pd.Series(dtype=float)
                return s[(s.index >= s_date) & (s.index <= e_date)]

            _sliced_buckets = {}
            for _curr, _bucket in multi_result.buckets.items():
                if _bucket.nav_series.empty:
                    continue
                _nav_s = _slice_s(_bucket.nav_series, start_date, end_date)
                if _nav_s.empty or _nav_s.max() <= 0:
                    continue
                _sliced_buckets[_curr] = CurrencyBucket(
                    currency=_curr,
                    nav_series=_nav_s,
                    flow_series=_slice_s(_bucket.flow_series, start_date, end_date),
                    income_series=_slice_s(_bucket.income_series, start_date, end_date),
                    force_zero_series=_slice_s(_bucket.force_zero_series, start_date, end_date),
                    flow_timing_series=_slice_s(_bucket.flow_timing_series, start_date, end_date),
                    tickers=_bucket.tickers
                )

            if _sliced_buckets:
                _decomp = decompose_portfolio(
                    _sliced_buckets,
                    multi_result.fx_rates,
                    consolidated_result=res_period,
                    fx_cost_basis=fx_cost_basis if view_mode == "💰 Meu Custo" else None
                )

                st.markdown("""
                <div class="section-header">
                    <div class="section-icon">🔬</div>
                    <div>
                        <div class="section-title">Atribuição de Retorno</div>
                        <div class="section-subtitle">Quanto veio do ativo (moeda original) e quanto veio do câmbio</div>
                    </div>
                </div>
                """, unsafe_allow_html=True)

                _a1, _a2, _a3 = st.columns(3)

                with _a1:
                    st.markdown(render_metric_card(
                        label="Retorno do Ativo",
                        value=f"{_decomp.total_twr_asset:.2%}",
                        delta="Performance na moeda original",
                        delta_positive=_decomp.total_twr_asset >= 0,
                        subtitle="Seleção de ativos (ex-câmbio)",
                        icon="📊"
                    ), unsafe_allow_html=True)

                with _a2:
                    st.markdown(render_metric_card(
                        label="Efeito Câmbio",
                        value=f"{_decomp.total_twr_fx:.2%}",
                        delta="Variação da taxa de câmbio",
                        delta_positive=_decomp.total_twr_fx >= 0,
                        subtitle="PM câmbio" if view_mode == "💰 Meu Custo" else "Cotação spot",
                        icon="💱"
                    ), unsafe_allow_html=True)

                with _a3:
                    st.markdown(render_metric_card(
                        label="Total em BRL",
                        value=f"{_decomp.total_twr:.2%}",
                        delta=f"(1+{_decomp.total_twr_asset:.1%}) × (1+{_decomp.total_twr_fx:.1%}) − 1",
                        delta_positive=_decomp.total_twr >= 0,
                        subtitle="Produto multiplicativo dos dois efeitos",
                        icon="🎯"
                    ), unsafe_allow_html=True)

                if not _decomp.cumret_asset_total.empty and len(_decomp.cumret_asset_total) > 1:
                    _fig_attr = go.Figure()

                    _fig_attr.add_trace(go.Scatter(
                        x=_decomp.cumret_asset_total.index,
                        y=_decomp.cumret_asset_total * 100,
                        name="Ativo (moeda original)",
                        line=dict(color='#6366f1', width=2),
                        hovertemplate='%{x|%d/%m/%Y}<br>%{y:.2f}%<extra>Ativo</extra>'
                    ))

                    _fig_attr.add_trace(go.Scatter(
                        x=_decomp.cumret_fx_total.index,
                        y=_decomp.cumret_fx_total * 100,
                        name="Câmbio",
                        line=dict(color='#f59e0b', width=2, dash='dot'),
                        hovertemplate='%{x|%d/%m/%Y}<br>%{y:.2f}%<extra>Câmbio</extra>'
                    ))

                    _fig_attr.add_trace(go.Scatter(
                        x=_decomp.cumret_total.index,
                        y=_decomp.cumret_total * 100,
                        name="Total BRL",
                        line=dict(color='#10b981', width=2.5),
                        hovertemplate='%{x|%d/%m/%Y}<br>%{y:.2f}%<extra>Total</extra>'
                    ))

                    _fig_attr.add_hline(
                        y=0, line_dash="dash",
                        line_color="rgba(255,255,255,0.15)",
                        line_width=1
                    )

                    _fig_attr.update_layout(
                        height=300,
                        margin=dict(t=20, b=40, l=60, r=20),
                        legend=dict(
                            orientation="h",
                            yanchor="bottom", y=1.02,
                            xanchor="right", x=1,
                            font=dict(color='#94a3b8', size=11),
                            bgcolor='rgba(0,0,0,0)'
                        ),
                        plot_bgcolor='rgba(0,0,0,0)',
                        paper_bgcolor='rgba(0,0,0,0)',
                        font=dict(color='#64748b', size=10),
                        xaxis=dict(
                            showgrid=False, zeroline=False, showline=False,
                            tickformat='%b/%Y'
                        ),
                        yaxis=dict(
                            gridcolor='rgba(148, 163, 184, 0.1)',
                            zeroline=False, showline=False,
                            ticksuffix='%', tickformat='.1f'
                        ),
                        hoverlabel=dict(
                            bgcolor='#1e293b', font_color='#f1f5f9', font_size=12
                        )
                    )

                    st.plotly_chart(_fig_attr, use_container_width=True, config={'displayModeBar': False})

                    _ref_label = "PM câmbio (seu VET)" if view_mode == "💰 Meu Custo" else "cotação spot de mercado"
                    st.caption(
                        f"Fórmula: R_total = (1 + R_ativo) × (1 + R_câmbio) − 1  |  "
                        f"Referência cambial: {_ref_label}"
                    )

                st.markdown('<div class="divider"></div>', unsafe_allow_html=True)

        except Exception:
            pass  # Seção de atribuição é opcional; erros não bloqueiam a página

    # ═══════════════════════════════════════════════════════════════════════════════
    # ANÁLISE DE CÂMBIO (Debug Discreto)
    # ═══════════════════════════════════════════════════════════════════════════════

    if view_mode == "💰 Meu Custo":
        from core.fx_cost_basis import get_latest_cost_basis

        with st.expander("💱 Detalhes do Câmbio", expanded=False):
            # Cotações de referência
            if is_period_closed and market_fx_last_day:
                st.caption(f"📅 Período fechado: cotações de {end_date.strftime('%d/%m/%Y')}")

            cols = st.columns(3)
            cols[0].metric("USD", f"R$ {_fx_usd:.4f}", help="Cotação de referência")
            cols[1].metric("EUR", f"R$ {_fx_eur:.4f}", help="Cotação de referência")
            cols[2].metric("CAD", f"R$ {_fx_cad:.4f}", help="Cotação de referência")

            # PM por período (se filtrado)
            if is_period_filtered and pm_periodo_info:
                st.markdown("---")
                st.caption(f"**PM do Período** ({start_date.strftime('%d/%m/%Y')} → {end_date.strftime('%d/%m/%Y')})")

                for curr in ['USD', 'EUR', 'CAD']:
                    info = pm_periodo_info.get(curr, {})
                    pm = info.get('pm_periodo', 0)
                    mkt_1st = info.get('market_rate_1st_day', 0)
                    pos_ini = info.get('posicao_inicial_qtd', 0)
                    aportes_qtd = info.get('aportes_periodo_qtd', 0)
                    aportes_brl = info.get('aportes_periodo_brl', 0)
                    compras_sem_remessa_fx = info.get('compras_sem_remessa_fx', 0)
                    mkt = _fx_usd if curr == 'USD' else (_fx_eur if curr == 'EUR' else _fx_cad)

                    if pm > 0:
                        rent = ((mkt / pm) - 1) * 100
                        c1, c2, c3 = st.columns([1, 1, 1])
                        c1.metric(f"{curr} PM", f"R$ {pm:.4f}")
                        c2.metric("1º Dia", f"R$ {mkt_1st:.4f}")
                        c3.metric("Rent.", f"{rent:+.1f}%")

                        # Composição compacta
                        parts = []
                        if pos_ini > 0:
                            parts.append(f"Pos.Ini: {curr} {pos_ini:,.0f}")
                        if aportes_qtd > 0:
                            parts.append(f"Aportes: {curr} {aportes_qtd:,.0f}")
                        if compras_sem_remessa_fx > 0:
                            parts.append(f"Compras s/Rem: {curr} {compras_sem_remessa_fx:,.0f}")
                        if parts:
                            st.caption(" · ".join(parts))

            # Histórico de remessas (compacto)
            if not df_cambio.empty:
                st.markdown("---")
                _cambio_display = df_cambio.copy()
                _cambio_display['data'] = pd.to_datetime(_cambio_display['data'])
                _cambio_display = _cambio_display.sort_values('data', ascending=False)
                _cambio_display['taxa'] = _cambio_display.apply(
                    lambda r: r['valor_origem'] / r['valor_destino'] if r['valor_destino'] > 0 else 0, axis=1
                )

                # Mostrar apenas período selecionado ou últimas 5
                if is_period_filtered:
                    mask = (_cambio_display['data'] >= start_date) & (_cambio_display['data'] <= end_date)
                    df_show = _cambio_display[mask].head(10)
                    label = f"Remessas no período ({len(df_show)})"
                else:
                    df_show = _cambio_display.head(5)
                    label = "Últimas remessas"

                if not df_show.empty:
                    st.caption(f"**{label}**")
                    st.dataframe(
                        df_show[['data', 'moeda_destino', 'valor_destino', 'taxa']],
                        column_config={
                            'data': st.column_config.DateColumn("Data", format="DD/MM/YY"),
                            'moeda_destino': st.column_config.TextColumn("Moeda", width="small"),
                            'valor_destino': st.column_config.NumberColumn("Valor", format="%.0f"),
                            'taxa': st.column_config.NumberColumn("Taxa", format="%.4f"),
                        },
                        hide_index=True, use_container_width=True, height=150
                    )

    # ═══════════════════════════════════════════════════════════════════════════════
    # SECRET FOOTER - X-RAY ENTRY POINT
    # ═══════════════════════════════════════════════════════════════════════════════
    st.markdown("<br><br><br>", unsafe_allow_html=True)
    col_spacer, col_xray = st.columns([10, 1])
    with col_xray:
        if st.button("🧬", key="btn_xray_entry", help="Visualizar X-Ray"):
            st.switch_page("pages/9_XRay.py")

if __name__ == "__main__":
    main()

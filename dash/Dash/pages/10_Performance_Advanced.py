"""
Performance Advanced — Dashboard de Auditoria Avançada
====================================================

Decompõe o retorno total em:
  R_total = (1 + R_ativo) × (1 + R_fx) − 1

Calcula TWR e MWR/IRR, com tabelas de consistência e flow ledger.
"""

import streamlit as st
from core.auth import require_auth

# --- AUTH CHECK ---
require_auth()

import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from datetime import datetime, date, timedelta
import numpy as np

# --- CORE IMPORTS ---
from core.data.loader import load_assets, load_proventos, load_fixed_income, load_cambio, load_fixed_income_manual
from core.data.market import fetch_historical_data
from core.engine import reconstruct_history_multicurrency
from core.consolidator import consolidate_to_brl, CurrencyBucket
from core.performance.calculator import calculate_canonical_twr, DEFAULT_PREMISES
from core.performance.decomposition import decompose_portfolio
from core.performance.mwr import calculate_mwr_from_nav_flows
from core.performance.attribution import calculate_asset_attribution
from core.performance.flow_ledger import build_flow_ledger
from core.fx_cost_basis import build_fx_cost_series
from core.ui import get_card_css, render_metric_card, render_fab
from config import BASE_DIR

# --- CONFIG ---
st.set_page_config(
    page_title="Performance Advanced",
    page_icon="◇",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- CSS: Institutional Scientific Design ---
st.markdown(get_card_css(), unsafe_allow_html=True)
st.markdown("""
<style>
    /* ═══════════════════════════════════════════════════════════════════
       INSTITUTIONAL SCIENTIFIC DESIGN SYSTEM
       Terminal + Academic Paper + Scientific Instrument
       ═══════════════════════════════════════════════════════════════════ */

    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

    /* ─── BASE TYPOGRAPHY ─── */
    html, body, [class*="css"] {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        -webkit-font-smoothing: antialiased;
    }

    /* ─── BACKGROUND: Deep analytical space ─── */
    [data-testid="stAppViewContainer"] {
        background: linear-gradient(180deg, #0a0e17 0%, #0d1321 100%) !important;
        background-image: none !important;
    }

    /* ─── SECTION HEADERS: Understated authority ─── */
    .section-header {
        display: flex;
        align-items: center;
        gap: 14px;
        margin: 40px 0 24px 0;
        padding-bottom: 16px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.08);
    }
    .section-icon {
        width: 32px;
        height: 32px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.95rem;
        background: rgba(148, 163, 184, 0.06);
        border: 1px solid rgba(148, 163, 184, 0.1);
    }
    .section-title {
        font-size: 0.92rem;
        font-weight: 500;
        color: #cbd5e1;
        margin: 0;
        letter-spacing: 0.02em;
        text-transform: uppercase;
    }
    .section-subtitle {
        font-size: 0.78rem;
        color: #64748b;
        margin: 2px 0 0 0;
        font-weight: 400;
        text-transform: none;
    }

    /* ─── PAGE HEADER: Stable, not loud ─── */
    .hero-container {
        text-align: left;
        padding: 24px 0 16px 0;
        border-bottom: 1px solid rgba(148, 163, 184, 0.06);
        margin-bottom: 8px;
    }
    .hero-title {
        font-size: 1.5rem;
        font-weight: 500;
        color: #e2e8f0;
        letter-spacing: -0.02em;
        margin: 0;
    }
    .hero-subtitle {
        color: #64748b;
        font-size: 0.82rem;
        font-weight: 400;
        margin-top: 6px;
        display: flex;
        align-items: center;
        gap: 12px;
    }

    /* ─── BADGE: Institutional label ─── */
    .badge {
        padding: 3px 8px;
        border-radius: 3px;
        font-size: 0.65rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-family: 'JetBrains Mono', monospace;
    }
    .badge-secondary {
        background: rgba(148, 163, 184, 0.08);
        color: #94a3b8;
        border: 1px solid rgba(148, 163, 184, 0.15);
    }

    /* ─── FORMULA BOX: Academic paper style ─── */
    .formula-box {
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(148, 163, 184, 0.1);
        border-left: 3px solid rgba(148, 163, 184, 0.25);
        border-radius: 0 6px 6px 0;
        padding: 18px 20px;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 0.88rem;
        color: #e2e8f0;
        margin: 16px 0;
        line-height: 1.7;
    }
    .formula-box .label {
        color: #64748b;
        font-size: 0.68rem;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-family: 'Inter', sans-serif;
    }
    .formula-box b {
        color: #f1f5f9;
        font-weight: 500;
    }
    .formula-box sub {
        font-size: 0.75em;
        color: #94a3b8;
    }

    /* ─── DIVIDER: Subtle separation ─── */
    .divider {
        height: 1px;
        background: rgba(148, 163, 184, 0.06);
        margin: 32px 0;
    }

    /* ─── HEADINGS: Quiet hierarchy ─── */
    h1, h2, h3, h4, h5, h6 {
        color: #cbd5e1;
        font-weight: 500;
    }
    h4 {
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #94a3b8;
        margin: 24px 0 12px 0;
    }
    h5 {
        font-size: 0.82rem;
        color: #94a3b8;
        font-weight: 500;
        margin: 20px 0 8px 0;
    }

    /* ─── METRIC CARDS: Elevated data panels ─── */
    .metric-card {
        background: rgba(15, 23, 42, 0.5) !important;
        border: 1px solid rgba(148, 163, 184, 0.08) !important;
        border-radius: 8px !important;
        padding: 18px 16px !important;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2) !important;
        transition: border-color 180ms ease !important;
    }
    .metric-card:hover {
        border-color: rgba(148, 163, 184, 0.15) !important;
    }
    .metric-label {
        font-size: 0.72rem !important;
        text-transform: uppercase !important;
        letter-spacing: 0.06em !important;
        color: #64748b !important;
        font-weight: 500 !important;
    }
    .metric-value {
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 1.4rem !important;
        font-weight: 500 !important;
        color: #f1f5f9 !important;
        letter-spacing: -0.02em !important;
    }
    .metric-subtitle {
        font-size: 0.7rem !important;
        color: #475569 !important;
    }

    /* Semantic colors for metric values */
    .metric-card[data-positive="true"] .metric-value {
        color: #6ee7b7 !important;
        text-shadow: 0 0 20px rgba(110, 231, 183, 0.1);
    }
    .metric-card[data-negative="true"] .metric-value {
        color: #fca5a5 !important;
        opacity: 0.9;
    }

    /* ─── DATAFRAMES: Terminal aesthetic ─── */
    [data-testid="stDataFrame"] {
        background: rgba(10, 14, 23, 0.7) !important;
        border: 1px solid rgba(148, 163, 184, 0.08) !important;
        border-radius: 6px !important;
    }
    [data-testid="stDataFrame"] table {
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 0.78rem !important;
    }
    [data-testid="stDataFrame"] th {
        background: rgba(30, 41, 59, 0.5) !important;
        color: #94a3b8 !important;
        font-weight: 500 !important;
        text-transform: uppercase !important;
        font-size: 0.68rem !important;
        letter-spacing: 0.05em !important;
    }
    [data-testid="stDataFrame"] td {
        color: #cbd5e1 !important;
        border-color: rgba(148, 163, 184, 0.05) !important;
    }
    [data-testid="stDataFrame"] tr:hover td {
        background: rgba(148, 163, 184, 0.03) !important;
    }

    /* ─── EXPANDERS: Layered depth ─── */
    [data-testid="stExpander"] {
        background: rgba(15, 23, 42, 0.3) !important;
        border: 1px solid rgba(148, 163, 184, 0.06) !important;
        border-radius: 6px !important;
    }
    [data-testid="stExpander"] summary {
        font-size: 0.82rem !important;
        color: #94a3b8 !important;
        font-weight: 500 !important;
    }
    [data-testid="stExpander"] summary:hover {
        color: #cbd5e1 !important;
    }

    /* Nested expanders: deeper layer */
    [data-testid="stExpander"] [data-testid="stExpander"] {
        background: rgba(10, 14, 23, 0.5) !important;
        border-color: rgba(148, 163, 184, 0.04) !important;
    }

    /* ─── RADIO BUTTONS: Clean selectors ─── */
    [data-testid="stRadio"] > div {
        gap: 4px !important;
    }
    [data-testid="stRadio"] label {
        font-size: 0.78rem !important;
        padding: 6px 14px !important;
        border-radius: 4px !important;
        background: rgba(148, 163, 184, 0.04) !important;
        border: 1px solid rgba(148, 163, 184, 0.08) !important;
        color: #94a3b8 !important;
        transition: all 150ms ease !important;
    }
    [data-testid="stRadio"] label:hover {
        background: rgba(148, 163, 184, 0.08) !important;
        color: #cbd5e1 !important;
    }
    [data-testid="stRadio"] label[data-checked="true"] {
        background: rgba(148, 163, 184, 0.1) !important;
        border-color: rgba(148, 163, 184, 0.2) !important;
        color: #e2e8f0 !important;
    }

    /* ─── CODE BLOCKS: Monospace precision ─── */
    code {
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 0.8rem !important;
        background: rgba(30, 41, 59, 0.5) !important;
        padding: 2px 6px !important;
        border-radius: 3px !important;
        color: #94a3b8 !important;
    }

    /* ─── TABLES IN MARKDOWN ─── */
    table {
        font-size: 0.8rem !important;
        border-collapse: collapse !important;
    }
    th, td {
        padding: 8px 12px !important;
        border: 1px solid rgba(148, 163, 184, 0.08) !important;
    }
    th {
        background: rgba(30, 41, 59, 0.3) !important;
        color: #94a3b8 !important;
        font-weight: 500 !important;
    }
    td {
        color: #cbd5e1 !important;
    }

    /* ─── SPINNERS: Minimal loading ─── */
    [data-testid="stSpinner"] {
        color: #64748b !important;
    }

    /* ─── HIDE STREAMLIT CHROME ─── */
    #MainMenu, footer, header,
    [data-testid="stToolbar"],
    [data-testid="stHeader"],
    [data-testid="stStatusWidget"],
    section[data-testid="stSidebar"],
    [data-testid="collapsedControl"] {
        display: none !important;
    }

    /* ─── RESPONSIVE ─── */
    @media (max-width: 768px) {
        .hero-title { font-size: 1.2rem; }
        .metric-value { font-size: 1.1rem !important; }
        .metric-card { padding: 14px 12px !important; }
    }
</style>
""", unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════════════════
# PLOTLY THEME — Semantic Color System
# ═══════════════════════════════════════════════════════════════════════
# Color meanings (never decorative):
#   Green  → Asset return (performance in original currency)
#   Blue   → FX effect (currency impact)
#   White  → Neutral monetary values
#   Amber  → TWR vs MWR difference (timing impact)
#   Red    → Loss / Drawdown
#   Gray   → Structure / Guides / Math

COLORS = {
    'bg': 'rgba(0,0,0,0)',
    'grid': 'rgba(148, 163, 184, 0.05)',
    'grid_major': 'rgba(148, 163, 184, 0.1)',
    'text': '#cbd5e1',
    'text_muted': '#64748b',
    # Semantic colors
    'asset': '#6ee7b7',       # Green — asset return
    'fx': '#7dd3fc',          # Blue — FX effect
    'total': '#e2e8f0',       # White — total/neutral
    'twr': '#cbd5e1',         # Light gray — TWR (neutral metric)
    'mwr': '#fcd34d',         # Amber — MWR (timing-dependent)
    'negative': '#fca5a5',    # Red — loss
    'positive': '#6ee7b7',    # Green — gain
    'structure': '#475569',   # Dark gray — guides
}

def _apply_chart_layout(fig, title="", height=400):
    """Apply institutional scientific chart styling."""
    fig.update_layout(
        title=dict(
            text=title.upper() if title else "",
            font=dict(size=11, color=COLORS['text_muted'], family='Inter, sans-serif'),
            x=0.0,
            xanchor='left',
        ),
        height=height,
        plot_bgcolor=COLORS['bg'],
        paper_bgcolor=COLORS['bg'],
        font=dict(family='JetBrains Mono, monospace', color=COLORS['text_muted'], size=10),
        margin=dict(l=50, r=20, t=55, b=30),
        legend=dict(
            orientation='h',
            yanchor='bottom',
            y=1.02,
            xanchor='right',
            x=1,
            bgcolor='rgba(0,0,0,0)',
            font=dict(size=10, color=COLORS['text_muted']),
            itemsizing='constant',
        ),
        xaxis=dict(
            gridcolor=COLORS['grid'],
            showline=True,
            linecolor=COLORS['grid'],
            linewidth=1,
            tickfont=dict(size=9, color=COLORS['text_muted']),
            dtick='M1',
            tickformat='%b/%y',
            showgrid=False,
        ),
        yaxis=dict(
            gridcolor=COLORS['grid'],
            showline=False,
            tickfont=dict(size=9, color=COLORS['text_muted']),
            tickformat='.1%',
            zeroline=True,
            zerolinecolor=COLORS['grid_major'],
            zerolinewidth=1,
            showgrid=True,
            gridwidth=1,
        ),
        hovermode='x unified',
        hoverlabel=dict(
            bgcolor='rgba(15, 23, 42, 0.95)',
            bordercolor='rgba(148, 163, 184, 0.2)',
            font=dict(size=11, family='JetBrains Mono, monospace', color='#e2e8f0'),
        ),
    )
    return fig


# ═══════════════════════════════════════════════════════════════════════
# DATA LOADING (cached)
# ═══════════════════════════════════════════════════════════════════════

@st.cache_data(ttl=900, show_spinner=False)
def _load_all_data():
    df_assets = load_assets()
    df_proventos = load_proventos()
    df_rf_raw = load_fixed_income()
    df_cambio = load_cambio()
    df_rf_manual = load_fixed_income_manual()

    manual_rf_values = {}
    cash_balance = 0.0  # Valor de caixa separado para exibição no Patrimônio

    if not df_rf_manual.empty:
        df_rf_manual['Atual'] = pd.to_numeric(df_rf_manual['Atual'], errors='coerce').fillna(0)
        df_rf_manual = df_rf_manual[df_rf_manual['Atual'] > 0]

        # Separar CAIXA/SALDO para exibição no Patrimônio
        # Caixa NÃO entra no cálculo de performance (TWR/MWR), apenas no valor total
        CASH_TICKERS = ['CAIXA', 'SALDO', 'CASH']
        df_cash = df_rf_manual[
            df_rf_manual['Ticker'].astype(str).str.strip().str.upper().isin(CASH_TICKERS)
        ]
        cash_balance = df_cash['Atual'].sum() if not df_cash.empty else 0.0

        # Filtrar caixa dos valores para performance
        df_rf_no_cash = df_rf_manual[
            ~df_rf_manual['Ticker'].astype(str).str.strip().str.upper().isin(CASH_TICKERS)
        ]

        # Aggregate duplicates by summing
        manual_rf_values = df_rf_no_cash.groupby(
            df_rf_no_cash['Ticker'].astype(str).str.strip().str.upper()
        )['Atual'].sum().to_dict()

    return df_assets, df_proventos, df_rf_raw, df_cambio, manual_rf_values, cash_balance


@st.cache_data(ttl=900, show_spinner=False)
def _fetch_prices(tickers, min_date):
    return fetch_historical_data(tickers, min_date)


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════

def main():
    render_fab()

    # Header — Institutional, understated
    st.markdown("""
    <div class="hero-container">
        <div class="hero-title">Performance Audit</div>
        <div class="hero-subtitle">
            Decomposição matemática auditável
            <span class="badge badge-secondary">v2.0</span>
        </div>
    </div>
    """, unsafe_allow_html=True)

    # ── DATA LOADING ──────────────────────────────────────────────────
    with st.spinner("Carregando dados..."):
        df_assets, df_proventos, df_rf_raw, df_cambio, manual_rf_values, cash_balance = _load_all_data()

    if df_assets.empty:
        st.warning("Nenhum ativo encontrado.")
        return

    # Prepare tickers
    tickers_carteira = df_assets['ticker'].unique().tolist()
    termos_excluir = ['TESOURO', 'CDB', 'LCI', 'LCA', 'IPCA', 'CAIXA', 'SALDO', 'CDI']
    tickers_download = [t for t in tickers_carteira if not any(x in t.upper() for x in termos_excluir)]
    tickers_download += ['BRL=X', 'EURUSD=X', 'CADUSD=X']

    min_date = datetime.now() - timedelta(days=365 * 5)
    if not df_assets.empty:
        min_date = min(min_date, pd.to_datetime(df_assets['data']).min())

    with st.spinner("Baixando preços..."):
        df_hist_prices = _fetch_prices(list(set(tickers_download)), min_date)

    if df_hist_prices.empty:
        st.error("Falha ao baixar preços.")
        return

    days_lookback = (datetime.now() - min_date).days + 10

    # ── ENGINE ────────────────────────────────────────────────────────
    # Filtrar CAIXA de df_rf_raw antes de passar ao engine
    CASH_TICKERS_RF = ['CAIXA', 'SALDO', 'CASH']
    df_rf_filtered = df_rf_raw.copy()
    if not df_rf_filtered.empty and 'Ticker' in df_rf_filtered.columns:
        mask = df_rf_filtered['Ticker'].astype(str).str.strip().str.upper().isin(CASH_TICKERS_RF)
        df_rf_filtered = df_rf_filtered[~mask]

    with st.spinner("Rodando engine multi-currency..."):
        multi_result = reconstruct_history_multicurrency(
            df_bruto=df_assets.copy(),
            df_proventos=df_proventos,
            days_lookback=days_lookback,
            df_prices_external=df_hist_prices,
            df_rf_raw=df_rf_filtered,  # Usar df filtrado
            df_cambio=df_cambio,
            manual_rf_values=manual_rf_values
        )

    # ── PERIOD SELECTOR ───────────────────────────────────────────────
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">§</div>
        <div>
            <div class="section-title">Período</div>
            <div class="section-subtitle">Intervalo para decomposição</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    col_period, col_mode = st.columns([3, 1])

    with col_period:
        period = st.radio(
            "Período", ["1M", "3M", "6M", "YTD", "1Y", "MAX", "Custom"],
            horizontal=True, index=3, label_visibility="collapsed"
        )

    with col_mode:
        view_mode = st.radio(
            "Visão", ["Mercado", "Meu Custo"],
            horizontal=True, index=1, label_visibility="collapsed",
            help="**Mercado**: tudo a câmbio spot. **Meu Custo**: NAV a spot, fluxos ao câmbio da remessa (custo real em BRL)."
        )

    # Calculate dates
    all_dates = set()
    for bucket in multi_result.buckets.values():
        if not bucket.nav_series.empty:
            all_dates.update(bucket.nav_series.index)

    if not all_dates:
        st.error("Sem dados de NAV disponíveis.")
        return

    idx_dates = pd.DatetimeIndex(sorted(all_dates))
    data_max = idx_dates.max()

    if period == "1M":
        start_date = data_max - timedelta(days=30)
    elif period == "3M":
        start_date = data_max - timedelta(days=90)
    elif period == "6M":
        start_date = data_max - timedelta(days=180)
    elif period == "YTD":
        start_date = pd.Timestamp(data_max.year, 1, 1)
    elif period == "1Y":
        start_date = data_max - timedelta(days=365)
    elif period == "MAX":
        start_date = idx_dates.min()
    else:  # Custom
        col_s, col_e = st.columns(2)
        with col_s:
            start_date = pd.Timestamp(st.date_input("Início", value=data_max - timedelta(days=90)))
        with col_e:
            end_date_custom = pd.Timestamp(st.date_input("Fim", value=data_max.date()))
            data_max = end_date_custom

    end_date = data_max

    # ── CONSOLIDATE ───────────────────────────────────────────────────
    with st.spinner("Consolidando..."):
        # FX cost basis for "Meu Custo" — used for FLOWS only (NAV always spot)
        fx_cost_basis = None
        if view_mode == "Meu Custo":
            fx_cost_basis = build_fx_cost_series(df_cambio, idx_dates)

        consolidated = consolidate_to_brl(
            multi_result.buckets,
            multi_result.fx_rates,
            df_cambio=df_cambio,
            fx_cost_basis=fx_cost_basis,  # v8.0: flows use remittance cost, NAV uses spot
        )
        df_engine = consolidated.to_engine_input()

        # Filter to period
        df_engine = df_engine[(df_engine.index >= start_date) & (df_engine.index <= end_date)]

        # Clean: start from first NAV > 0
        first_valid = df_engine[df_engine['nav'] > 0].first_valid_index() if 'nav' in df_engine.columns else None
        if first_valid is not None:
            df_engine = df_engine.loc[first_valid:]

        # Forward-fill zeros
        if 'nav' in df_engine.columns:
            df_engine['nav'] = df_engine['nav'].replace(0, np.nan).ffill().fillna(0)

    if df_engine.empty or len(df_engine) < 2:
        st.warning("Dados insuficientes para o período selecionado.")
        return

    # ── CALCULATIONS ──────────────────────────────────────────────────
    with st.spinner("Calculando métricas..."):
        # 1. TWR Consolidado
        twr_result = calculate_canonical_twr(df_engine, DEFAULT_PREMISES)

        # 2. MWR/IRR
        mwr_result = calculate_mwr_from_nav_flows(
            df_engine['nav'],
            df_engine['flow'],
            df_engine.get('income', None)
        )

        # 3. Decomposição (Asset vs FX)
        # CRITICAL: Slice buckets to the selected period BEFORE decomposing.
        # Otherwise decomposition uses full-history returns while TWR uses
        # the period slice, causing huge residuals.
        sliced_buckets = {}
        for curr, bucket in multi_result.buckets.items():
            nav_s = bucket.nav_series
            # Slice to [start_date, end_date]
            nav_s = nav_s[(nav_s.index >= start_date) & (nav_s.index <= end_date)]
            flow_s = bucket.flow_series.reindex(nav_s.index).fillna(0)
            income_s = bucket.income_series.reindex(nav_s.index).fillna(0)
            fz = bucket.force_zero_series.reindex(nav_s.index).fillna(False)
            ft = bucket.flow_timing_series.reindex(nav_s.index).fillna(0)

            # Start from first positive NAV
            fv = nav_s[nav_s > 0].first_valid_index()
            if fv is not None:
                nav_s = nav_s.loc[fv:]
                flow_s = flow_s.loc[fv:]
                income_s = income_s.loc[fv:]
                fz = fz.loc[fv:]
                ft = ft.loc[fv:]

            if not nav_s.empty and len(nav_s) >= 2:
                sliced_buckets[curr] = CurrencyBucket(
                    currency=curr,
                    nav_series=nav_s,
                    flow_series=flow_s,
                    income_series=income_s,
                    force_zero_series=fz,
                    flow_timing_series=ft,
                    tickers=bucket.tickers,
                )

        decomposition = decompose_portfolio(
            sliced_buckets,
            multi_result.fx_rates,
            consolidated_result=twr_result,
            premises=DEFAULT_PREMISES,
            fx_cost_basis=fx_cost_basis,  # Pass cost basis for "Meu Dinheiro" mode
        )

        # 4. Atribuição por ativo
        # Build ticker→currency map
        ticker_currency_map = {}
        for currency, bucket in multi_result.buckets.items():
            for ticker in bucket.tickers:
                ticker_currency_map[ticker] = currency

        attribution = calculate_asset_attribution(
            custodia_diaria=multi_result.custodia_diaria if hasattr(multi_result, 'custodia_diaria') else pd.DataFrame(),
            df_prices=df_hist_prices,
            ticker_currency_map=ticker_currency_map,
            fx_rates=multi_result.fx_rates,
            start_date=start_date,
            end_date=end_date,
            portfolio_return=twr_result.total_twr,
        )

        # 5. MTM Return
        nav_inicial = df_engine['nav'].iloc[0]
        nav_final = df_engine['nav'].iloc[-1]
        total_flow = twr_result.total_flow
        total_pnl = twr_result.total_pnl
        invested_capital = nav_inicial + total_flow
        retorno_mtm = total_pnl / invested_capital if invested_capital > 0 else 0.0

        # 6. Flow Ledger
        flow_ledger = build_flow_ledger(
            df_assets, df_proventos, df_cambio,
            multi_result.fx_rates, df_rf_raw
        )
        ledger_period = flow_ledger.filter_by_period(start_date, end_date)

    # ═══════════════════════════════════════════════════════════════════
    # DISPLAY — Cognitive Audit Flow
    # ═══════════════════════════════════════════════════════════════════
    diff_twr_mwr = twr_result.total_twr - mwr_result.irr_period

    # ═══════════════════════════════════════════════════════════════════
    # BLOCK 1: RESULTADO FINAL — "Ganhei dinheiro ou não?"
    # ═══════════════════════════════════════════════════════════════════
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">1</div>
        <div>
            <div class="section-title">Resultado Final</div>
            <div class="section-subtitle">{start} → {end} ({days} dias)</div>
        </div>
    </div>
    """.format(
        start=start_date.strftime('%d/%m/%Y'),
        end=end_date.strftime('%d/%m/%Y'),
        days=(end_date - start_date).days
    ), unsafe_allow_html=True)

    k1, k2, k3, k4, k5 = st.columns(5)

    with k1:
        # Patrimônio = NAV dos ativos + Caixa (valor total real)
        patrimonio_total = nav_final + cash_balance
        # Mostrar composição no subtitle
        subtitle_text = f"Ativos R$ {nav_final:,.0f} + Caixa R$ {cash_balance:,.0f}" if cash_balance > 0 else "Valor atual do portfólio"
        st.markdown(render_metric_card(
            label="Patrimônio",
            value=f"R$ {patrimonio_total:,.0f}",
            delta=None,
            delta_positive=True,
            subtitle=subtitle_text,
        ), unsafe_allow_html=True)

    with k2:
        mtm_positive = retorno_mtm >= 0
        st.markdown(render_metric_card(
            label="Retorno MTM",
            value=f"{retorno_mtm:.2%}",
            delta=f"R$ {total_pnl:,.0f}" if total_pnl != 0 else None,
            delta_positive=mtm_positive,
            subtitle="ROI sobre capital investido",
        ), unsafe_allow_html=True)

    with k3:
        twr_positive = twr_result.total_twr >= 0
        st.markdown(render_metric_card(
            label="TWR Período",
            value=f"{twr_result.total_twr:.2%}",
            delta=f"{twr_result.annualized_twr:.2%} a.a." if twr_result.annualized_twr != 0 else None,
            delta_positive=twr_positive,
            subtitle="Retorno ponderado pelo tempo",
        ), unsafe_allow_html=True)

    with k4:
        mwr_positive = mwr_result.irr_period >= 0
        st.markdown(render_metric_card(
            label="MWR (IRR)",
            value=f"{mwr_result.irr_period:.2%}",
            delta=f"{mwr_result.irr_annual:.2%} a.a.",
            delta_positive=mwr_positive,
            subtitle="Retorno do investidor",
        ), unsafe_allow_html=True)

    with k5:
        st.markdown(render_metric_card(
            label="Capital Investido",
            value=f"R$ {invested_capital:,.0f}",
            delta=f"NAV₀: R$ {nav_inicial:,.0f}",
            delta_positive=True,
            subtitle="NAV inicial + aportes líquidos",
        ), unsafe_allow_html=True)

    # ═══════════════════════════════════════════════════════════════════
    # FX RECONCILIATION PANEL (only in "Meu Custo" mode)
    # ═══════════════════════════════════════════════════════════════════
    if view_mode == "Meu Custo":
        from core.fx_cost_basis import get_cost_basis_summary, get_latest_cost_basis

        st.markdown("""
        <div style="
            background: rgba(125, 211, 252, 0.06);
            border: 1px solid rgba(125, 211, 252, 0.15);
            border-radius: 6px;
            padding: 14px 18px;
            margin: 16px 0 8px 0;
            display: flex;
            align-items: center;
            gap: 12px;
        ">
            <span style="font-size: 1.1rem;">💱</span>
            <div>
                <div style="font-size: 0.82rem; font-weight: 500; color: #7dd3fc;">
                    Modo Meu Custo Ativo
                </div>
                <div style="font-size: 0.72rem; color: #64748b;">
                    NAV valorizado a câmbio spot (mercado) · Fluxos ao câmbio da remessa (custo real em BRL)
                </div>
            </div>
        </div>
        """, unsafe_allow_html=True)

        # Get cost basis summary
        cost_basis = get_latest_cost_basis(df_cambio)
        
        # Get latest spot rates
        spot_rates = {}
        for curr, fx_s in multi_result.fx_rates.items():
            if not fx_s.empty:
                spot_rates[curr] = fx_s.iloc[-1]

        # Show reconciliation per currency
        fx_currencies = [c for c in multi_result.buckets.keys() if c != 'BRL' and not c.endswith('_DIRECT')]
        
        if fx_currencies:
            fx_cols = st.columns(len(fx_currencies))
            for i, curr in enumerate(fx_currencies):
                with fx_cols[i]:
                    pm = cost_basis.get(curr, 0)
                    spot = spot_rates.get(curr, 0)
                    
                    if pm > 0 and spot > 0:
                        fx_gain_pct = (spot / pm - 1)
                        fx_label = f"{'▲' if fx_gain_pct >= 0 else '▼'} {fx_gain_pct:+.2%}"
                        
                        st.markdown(render_metric_card(
                            label=f"FX {curr}",
                            value=f"R$ {spot:.4f}",
                            delta=f"PM: R$ {pm:.4f} → {fx_label}",
                            delta_positive=fx_gain_pct >= 0,
                            subtitle=f"Spot vs Custo Remessa",
                        ), unsafe_allow_html=True)
                    else:
                        st.markdown(render_metric_card(
                            label=f"FX {curr}",
                            value=f"R$ {spot:.4f}" if spot > 0 else "—",
                            delta="Sem remessas registradas",
                            delta_positive=True,
                            subtitle="Spot atual",
                        ), unsafe_allow_html=True)

    st.markdown('<div class="divider"></div>', unsafe_allow_html=True)

    # ═══════════════════════════════════════════════════════════════════
    # BLOCK 2: O MERCADO OU EU? — "Quem foi responsável?"
    # ═══════════════════════════════════════════════════════════════════
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">2</div>
        <div>
            <div class="section-title">O Mercado ou Eu?</div>
            <div class="section-subtitle">TWR = performance da estratégia | MWR = performance do investidor</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    cum = twr_result.cumulative_series

    fig_twr_mwr = go.Figure()
    if not cum.empty:
        # TWR line — primary, thicker
        fig_twr_mwr.add_trace(go.Scatter(
            x=cum.index, y=cum.values,
            mode='lines', name=f'TWR  {twr_result.total_twr:+.2%}',
            line=dict(color=COLORS['twr'], width=2),
            hovertemplate='%{y:.2%}<extra>TWR</extra>',
        ))
        # Last point marker for TWR
        fig_twr_mwr.add_trace(go.Scatter(
            x=[cum.index[-1]], y=[cum.values[-1]],
            mode='markers',
            marker=dict(color=COLORS['twr'], size=6, symbol='circle'),
            showlegend=False,
            hoverinfo='skip',
        ))
        if mwr_result.converged:
            mwr_daily = (1 + mwr_result.irr_annual) ** (1 / 365.25) - 1
            mwr_cum = pd.Series(
                [(1 + mwr_daily) ** ((d - cum.index[0]).days) - 1 for d in cum.index],
                index=cum.index
            )
            # MWR line — secondary, thinner, dashed
            fig_twr_mwr.add_trace(go.Scatter(
                x=mwr_cum.index, y=mwr_cum.values,
                mode='lines', name=f'MWR  {mwr_result.irr_period:+.2%}',
                line=dict(color=COLORS['mwr'], width=1.5, dash='dot'),
                hovertemplate='%{y:.2%}<extra>MWR</extra>',
            ))

    _apply_chart_layout(fig_twr_mwr, "TWR vs MWR", height=350)

    # Interpretation annotation — subtle, informative
    if abs(diff_twr_mwr) > 0.005:
        if diff_twr_mwr > 0:
            interpretation = "Δ > 0 → timing prejudicou"
        else:
            interpretation = "Δ < 0 → timing beneficiou"
    else:
        interpretation = "Δ ≈ 0 → timing neutro"

    fig_twr_mwr.add_annotation(
        text=interpretation,
        xref="paper", yref="paper", x=1.0, y=-0.08,
        xanchor='right',
        showarrow=False,
        font=dict(size=9, color=COLORS['text_muted'], family='JetBrains Mono'),
    )
    st.plotly_chart(fig_twr_mwr, use_container_width=True)

    # Timing impact card
    diff_positive = diff_twr_mwr <= 0
    st.markdown(render_metric_card(
        label="TWR − MWR",
        value=f"{diff_twr_mwr:+.2%}",
        delta="Timing neutro" if abs(diff_twr_mwr) < 0.005 else ("Timing prejudicou" if diff_twr_mwr > 0 else "Timing beneficiou"),
        delta_positive=diff_positive,
        subtitle="Impacto do timing dos aportes",
    ), unsafe_allow_html=True)

    with st.expander("Detalhes MWR/IRR", expanded=False):
        col_m1, col_m2 = st.columns(2)
        with col_m1:
            st.markdown(f"""
            | Métrica | Valor |
            |---------|-------|
            | IRR Anual | `{mwr_result.irr_annual:.4%}` |
            | IRR Período | `{mwr_result.irr_period:.4%}` |
            | VPL Residual | `{mwr_result.npv_at_irr:.4f}` |
            | Fluxos Usados | `{mwr_result.cashflows_used}` |
            | Dias no Período | `{mwr_result.period_days}` |
            | Convergiu | `{'Sim' if mwr_result.converged else 'Não'}` |
            | Método | `{mwr_result.method}` |
            """)
        with col_m2:
            st.markdown(f"""
            **Interpretação:**

            - **TWR = {twr_result.total_twr:.2%}** mede quão bem a *estratégia* performou
            - **MWR = {mwr_result.irr_period:.2%}** mede quão bem o *investidor* performou
            - Diferença = **{diff_twr_mwr:+.2%}**

            {"Se TWR > MWR, o timing dos seus aportes prejudicou o resultado." if diff_twr_mwr > 0.005
             else "Se MWR > TWR, o timing dos seus aportes beneficiou o resultado." if diff_twr_mwr < -0.005
             else "Timing dos aportes teve impacto negligível."}
            """)

    st.markdown('<div class="divider"></div>', unsafe_allow_html=True)

    # ═══════════════════════════════════════════════════════════════════
    # BLOCK 3: DE ONDE VEIO O RETORNO — "Foi o ativo ou o dólar?"
    # ═══════════════════════════════════════════════════════════════════
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">3</div>
        <div>
            <div class="section-title">De Onde Veio o Retorno</div>
            <div class="section-subtitle">R<sub>total</sub> = (1 + R<sub>ativo</sub>) × (1 + R<sub>fx</sub>) − 1</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    fig_decomp = go.Figure()
    if not decomposition.cumret_asset_total.empty:
        asset_series = decomposition.cumret_asset_total.reindex(cum.index).ffill().fillna(0)
        fx_series = decomposition.cumret_fx_total.reindex(cum.index).ffill().fillna(0)

        # Asset return — Green (semantic: asset performance)
        fig_decomp.add_trace(go.Scatter(
            x=asset_series.index, y=asset_series.values,
            mode='lines', name=f'R_ativo  {decomposition.total_twr_asset:+.2%}',
            line=dict(color=COLORS['asset'], width=1.5),
            stackgroup='decomp',
            fillcolor='rgba(110, 231, 183, 0.06)',  # Low transparency ~6%
            hovertemplate='%{y:.2%}<extra>Ativo</extra>',
        ))
        # FX effect — Blue (semantic: currency impact)
        fig_decomp.add_trace(go.Scatter(
            x=fx_series.index, y=fx_series.values,
            mode='lines', name=f'R_fx  {decomposition.total_twr_fx:+.2%}',
            line=dict(color=COLORS['fx'], width=1.5),
            stackgroup='decomp',
            fillcolor='rgba(125, 211, 252, 0.06)',  # Low transparency ~6%
            hovertemplate='%{y:.2%}<extra>Câmbio</extra>',
        ))
        # Last points markers
        fig_decomp.add_trace(go.Scatter(
            x=[asset_series.index[-1]], y=[asset_series.values[-1]],
            mode='markers', marker=dict(color=COLORS['asset'], size=5),
            showlegend=False, hoverinfo='skip',
        ))

    _apply_chart_layout(fig_decomp, "Decomposição Ativo + Câmbio", height=350)
    st.plotly_chart(fig_decomp, use_container_width=True)

    # Decomposition summary cards
    col_d1, col_d2, col_d3 = st.columns(3)
    with col_d1:
        asset_pos = decomposition.total_twr_asset >= 0
        st.markdown(render_metric_card(
            label="R_ativo (ponderado)", value=f"{decomposition.total_twr_asset:.2%}",
            delta="Moeda original", delta_positive=asset_pos,
            subtitle="Performance do ativo",
        ), unsafe_allow_html=True)
    with col_d2:
        fx_pos = decomposition.total_twr_fx >= 0
        st.markdown(render_metric_card(
            label="R_fx (ponderado)", value=f"{decomposition.total_twr_fx:.2%}",
            delta="Efeito cambial", delta_positive=fx_pos,
            subtitle="Impacto da variação cambial",
        ), unsafe_allow_html=True)
    with col_d3:
        theoretical = (1 + decomposition.total_twr_asset) * (1 + decomposition.total_twr_fx) - 1
        st.markdown(render_metric_card(
            label="R_total (teórico)", value=f"{theoretical:.2%}",
            delta="Multiplicativo", delta_positive=theoretical >= 0,
            subtitle="(1+R_a)×(1+R_fx)−1",
        ), unsafe_allow_html=True)

    # Attribution table directly below decomposition chart
    st.markdown("#### Atribuição por Ativo")

    if attribution.assets:
        df_attr = attribution.to_dataframe()

        st.dataframe(
            df_attr.style.format({
                'R_ativo (%)': '{:+.2f}%',
                'R_fx (%)': '{:+.2f}%',
                'R_total (%)': '{:+.2f}%',
                'Peso (%)': '{:.1f}%',
                'Contribuicao (%)': '{:+.3f}%',
                'NAV Inicio': 'R$ {:,.0f}',
                'NAV Fim': 'R$ {:,.0f}',
                'Consistencia': '{:+.4f}%',
            }).applymap(
                lambda v: 'color: #6ee7b7' if v == '✓' else 'color: #fcd34d' if v == '⚠️' else '',
                subset=['OK']
            ),
            use_container_width=True,
            height=min(400, 35 * len(df_attr) + 50)
        )
    else:
        st.info("Sem dados de custódia para atribuição por ativo.")

    st.markdown('<div class="divider"></div>', unsafe_allow_html=True)

    # ═══════════════════════════════════════════════════════════════════
    # BLOCK 4: RISCO — "Qual foi o custo psicológico?"
    # ═══════════════════════════════════════════════════════════════════
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">4</div>
        <div>
            <div class="section-title">Risco Assumido</div>
            <div class="section-subtitle">Custo psicológico do retorno obtido</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    r1, r2 = st.columns(2)
    with r1:
        st.markdown(render_metric_card(
            label="Volatilidade",
            value=f"{twr_result.volatility:.2%}",
            delta_positive=twr_result.volatility < 0.20,
            subtitle="Risco anualizado",
        ), unsafe_allow_html=True)
    with r2:
        st.markdown(render_metric_card(
            label="Drawdown Máx",
            value=f"{twr_result.max_drawdown:.2%}",
            delta_positive=False if twr_result.max_drawdown < -0.05 else True,
            subtitle="Maior queda do pico",
        ), unsafe_allow_html=True)

    st.markdown('<div class="divider"></div>', unsafe_allow_html=True)

    # ═══════════════════════════════════════════════════════════════════
    # BLOCK 5: PROVA MATEMÁTICA — "Como sabemos?"
    # ═══════════════════════════════════════════════════════════════════
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">5</div>
        <div>
            <div class="section-title">Prova Matemática</div>
            <div class="section-subtitle">Fórmulas auditáveis com dados reais</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    # TWR Cumulative Chart — Clean, scientific
    fig_cum = go.Figure()
    if not cum.empty:
        # Determine color based on final return
        final_return = cum.values[-1]
        line_color = COLORS['positive'] if final_return >= 0 else COLORS['negative']
        fill_color = 'rgba(110, 231, 183, 0.05)' if final_return >= 0 else 'rgba(252, 165, 165, 0.05)'

        fig_cum.add_trace(go.Scatter(
            x=cum.index, y=cum.values,
            mode='lines', name=f'TWR Acumulado  {final_return:+.2%}',
            line=dict(color=line_color, width=2),
            fill='tozeroy',
            fillcolor=fill_color,
            hovertemplate='%{y:.2%}<extra></extra>',
        ))
        # Last point emphasis
        fig_cum.add_trace(go.Scatter(
            x=[cum.index[-1]], y=[cum.values[-1]],
            mode='markers+text',
            marker=dict(color=line_color, size=7),
            text=[f'{final_return:+.2%}'],
            textposition='top center',
            textfont=dict(size=10, color=line_color, family='JetBrains Mono'),
            showlegend=False,
            hoverinfo='skip',
        ))
    _apply_chart_layout(fig_cum, "Retorno Acumulado TWR", height=320)
    st.plotly_chart(fig_cum, use_container_width=True)

    # --- TWR: 3-level expandable proof ---
    st.markdown("##### TWR — Time-Weighted Return")
    st.markdown(f"""
    <div class="formula-box">
        <div class="label">NÍVEL 1 — Fórmula</div>
        <b>TWR</b> = ∏(1 + r<sub>i</sub>) − 1 = <b>{twr_result.total_twr:.4%}</b>
    </div>
    """, unsafe_allow_html=True)

    with st.expander("Nível 2 — Aplicada aos seus dados", expanded=False):
        # Build sub-period returns from the daily series
        daily_returns = twr_result.daily_returns if hasattr(twr_result, 'daily_returns') and twr_result.daily_returns is not None else pd.Series(dtype=float)

        if not daily_returns.empty:
            # Show monthly aggregated sub-periods for readability
            monthly = daily_returns.resample('ME').apply(lambda x: (1 + x).prod() - 1).dropna()
            if not monthly.empty:
                parts = []
                for dt, r in monthly.items():
                    parts.append(f"(1 + {r:+.4f})")
                formula_str = " × ".join(parts[:12])  # Max 12 months shown
                if len(monthly) > 12:
                    formula_str += f" × ... ({len(monthly)} sub-períodos)"
                st.markdown(f"**Produto dos sub-períodos mensais:**")
                st.code(f"TWR = {formula_str} − 1 = {twr_result.total_twr:.4%}", language=None)
            else:
                st.info("Sub-períodos mensais não disponíveis.")
        else:
            n_days = len(df_engine) - 1
            st.markdown(f"TWR calculado sobre **{n_days} dias** de retornos diários encadeados.")
            st.code(f"TWR = ∏(1 + rᵢ) − 1 = {twr_result.total_twr:.4%}", language=None)

        with st.expander("Nível 3 — Série temporal completa", expanded=False):
            if not daily_returns.empty:
                df_daily = pd.DataFrame({
                    'Data': daily_returns.index.strftime('%d/%m/%Y'),
                    'Retorno Diário': daily_returns.values,
                    'Acumulado': (1 + daily_returns).cumprod().values - 1,
                })
                df_daily['Retorno Diário'] = df_daily['Retorno Diário'].apply(lambda x: f"{x:+.6%}")
                df_daily['Acumulado'] = df_daily['Acumulado'].apply(lambda x: f"{x:+.4%}")
                st.dataframe(df_daily, use_container_width=True, height=300)
            else:
                st.info("Série de retornos diários não disponível no resultado.")

    # --- MWR: 3-level expandable proof ---
    st.markdown("##### MWR — Money-Weighted Return (IRR)")
    st.markdown(f"""
    <div class="formula-box">
        <div class="label">NÍVEL 1 — Fórmula</div>
        <b>MWR</b>: Σ CF<sub>t</sub> / (1+r)<sup>Δt</sup> = 0 → r = <b>{mwr_result.irr_period:.4%}</b> (período) | <b>{mwr_result.irr_annual:.4%}</b> (anual)
    </div>
    """, unsafe_allow_html=True)

    with st.expander("Nível 2 — Fluxos descontados", expanded=False):
        st.markdown(f"""
        | Parâmetro | Valor |
        |-----------|-------|
        | Taxa encontrada (período) | `{mwr_result.irr_period:.6%}` |
        | Taxa encontrada (anual) | `{mwr_result.irr_annual:.6%}` |
        | VPL residual na IRR | `{mwr_result.npv_at_irr:.6f}` |
        | Fluxos utilizados | `{mwr_result.cashflows_used}` |
        | Método | `{mwr_result.method}` |
        | Convergiu | `{'Sim' if mwr_result.converged else 'Não'}` |
        """)

        with st.expander("Nível 3 — Fluxos de caixa detalhados", expanded=False):
            # Show the actual cashflows used
            nav_s = df_engine['nav']
            flow_s = df_engine['flow']
            cf_data = []
            # Initial: -NAV₀
            cf_data.append({'Data': nav_s.index[0].strftime('%d/%m/%Y'), 'Tipo': 'NAV Inicial', 'Valor': f"R$ {-nav_s.iloc[0]:,.2f}", 'Δt (dias)': 0})
            # Intermediate flows
            for dt, fl in flow_s.items():
                if fl != 0:
                    days_from_start = (dt - nav_s.index[0]).days
                    cf_data.append({'Data': dt.strftime('%d/%m/%Y'), 'Tipo': 'Fluxo', 'Valor': f"R$ {-fl:,.2f}", 'Δt (dias)': days_from_start})
            # Final: +NAV_final
            cf_data.append({'Data': nav_s.index[-1].strftime('%d/%m/%Y'), 'Tipo': 'NAV Final', 'Valor': f"R$ {nav_s.iloc[-1]:,.2f}", 'Δt (dias)': (nav_s.index[-1] - nav_s.index[0]).days})
            df_cf = pd.DataFrame(cf_data)
            st.dataframe(df_cf, use_container_width=True, height=300)

    # --- Decomposition formula ---
    st.markdown("##### Decomposição Multiplicativa")
    st.markdown(f"""
    <div class="formula-box">
        <div class="label">NÍVEL 1 — Fórmula</div>
        <b>R<sub>total</sub></b> = (1 + R<sub>ativo</sub>) × (1 + R<sub>fx</sub>) − 1
        = (1 + {decomposition.total_twr_asset:.4f}) × (1 + {decomposition.total_twr_fx:.4f}) − 1
        = <b>{theoretical:.4%}</b>
    </div>
    """, unsafe_allow_html=True)

    st.markdown('<div class="divider"></div>', unsafe_allow_html=True)

    # ═══════════════════════════════════════════════════════════════════
    # BLOCK 6: VERIFICAÇÃO — "Confio nisso?"
    # ═══════════════════════════════════════════════════════════════════
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">6</div>
        <div>
            <div class="section-title">Verificação de Consistência</div>
            <div class="section-subtitle">Resíduos e checkmarks de validação</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    # Consistency checks summary
    v1, v2, v3 = st.columns(3)
    with v1:
        residual_ok = abs(decomposition.total_residual) < 0.02
        st.markdown(render_metric_card(
            label="Resíduo Decomposição", value=f"{decomposition.total_residual:.4%}",
            delta="OK" if residual_ok else "Verificar",
            delta_positive=residual_ok, subtitle="Erro de decomposição",
        ), unsafe_allow_html=True)
    with v2:
        if attribution.assets:
            attr_ok = abs(attribution.attribution_error) < 0.02
            st.markdown(render_metric_card(
                label="Erro de Atribuição", value=f"{attribution.attribution_error:+.4%}",
                delta="OK" if attr_ok else "Verificar",
                delta_positive=attr_ok, subtitle="Σ contrib − R_total",
            ), unsafe_allow_html=True)
    with v3:
        if attribution.assets:
            st.markdown(render_metric_card(
                label="Σ Contribuições", value=f"{attribution.sum_contributions:.2%}",
                delta=f"TWR ref: {attribution.total_return:.2%}", delta_positive=True,
                subtitle="Soma das contribuições",
            ), unsafe_allow_html=True)

    # Currency consistency table
    st.markdown("#### Consistência por Moeda")
    df_decomp = decomposition.to_summary_df()
    if not df_decomp.empty:
        df_display = df_decomp.copy()
        df_display['R_ativo'] = df_display['R_ativo'].apply(lambda x: f"{x:+.4%}")
        df_display['R_fx'] = df_display['R_fx'].apply(lambda x: f"{x:+.4%}")
        df_display['R_total_calc'] = df_display['R_total_calc'].apply(lambda x: f"{x:+.4%}")
        df_display['R_total_real'] = df_display['R_total_real'].apply(lambda x: f"{x:+.4%}")
        df_display['Residual'] = df_decomp['Residual'].apply(
            lambda x: f"[OK] {x:+.6%}" if abs(x) < 0.001 else f"[!] {x:+.6%}"
        )
        df_display['FX_inicio'] = df_decomp['FX_inicio'].apply(lambda x: f"R$ {x:.4f}")
        df_display['FX_fim'] = df_decomp['FX_fim'].apply(lambda x: f"R$ {x:.4f}")

        st.dataframe(df_display, use_container_width=True, height=min(300, 35 * len(df_display) + 50))

    st.markdown('<div class="divider"></div>', unsafe_allow_html=True)

    # ═══════════════════════════════════════════════════════════════════
    # BLOCK 7: EVIDÊNCIA BRUTA — "Dados originais"
    # ═══════════════════════════════════════════════════════════════════
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">7</div>
        <div>
            <div class="section-title">Evidência Bruta</div>
            <div class="section-subtitle">Flow Ledger e dados de entrada do engine</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    with st.expander(f"Flow Ledger — {len(ledger_period)} fluxos no período", expanded=False):
        df_ledger = ledger_period.to_dataframe()
        if not df_ledger.empty:
            df_ledger['date'] = df_ledger['date'].dt.strftime('%d/%m/%Y')
            df_ledger['amount'] = df_ledger['amount'].apply(lambda x: f"{x:,.2f}")
            df_ledger['amount_brl'] = df_ledger['amount_brl'].apply(
                lambda x: f"R$ {x:,.2f}" if x is not None else ""
            )
            df_ledger['fx_rate'] = df_ledger['fx_rate'].apply(
                lambda x: f"{x:.4f}" if x is not None else ""
            )
            st.dataframe(df_ledger, use_container_width=True, height=400)
        else:
            st.info("Nenhum fluxo registrado no período.")

    with st.expander("Dados Brutos", expanded=False):
        st.markdown("**NAV + Flows (input do TWR engine)**")
        st.dataframe(df_engine.head(30), use_container_width=True)

        st.markdown("**Buckets Multi-Currency**")
        for curr, bucket in multi_result.buckets.items():
            nav_last = bucket.nav_series.iloc[-1] if not bucket.nav_series.empty else 0
            st.write(f"**{curr}**: NAV = {nav_last:,.2f}, Tickers = {bucket.tickers}")


# --- RUN ---
main()

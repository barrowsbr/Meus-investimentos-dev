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
from core.data.market import fetch_historical_data, fetch_market_data
from core.finance import calcular_carteira_fechada
from core.engine import reconstruct_history_multicurrency
from core.consolidator import consolidate_to_brl, CurrencyBucket
from core.performance.calculator import calculate_canonical_twr, DEFAULT_PREMISES
from core.performance.decomposition import decompose_portfolio
from core.performance.mwr import calculate_mwr_from_nav_flows
from core.performance.attribution import calculate_asset_attribution
from core.performance.flow_ledger import build_flow_ledger
from core.fx_cost_basis import build_fx_cost_series
from core.ui import get_card_css, render_metric_card, render_fab
from core.performance.visualizations import plot_nav_vs_twr, plot_drawdown_volatility
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
       APP DESIGN SYSTEM — Outfit + Glassmorphism + Dark Slate + Bege
       ═══════════════════════════════════════════════════════════════════ */

    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');

    /* ─── BASE TYPOGRAPHY ─── */
    html, body, [class*="css"] {
        font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
        -webkit-font-smoothing: antialiased;
    }

    /* ─── BACKGROUND ─── */
    [data-testid="stAppViewContainer"] {
        background: rgba(15, 23, 42, 0.95) !important;
        background-image: none !important;
    }

    /* ─── SECTION HEADERS: Borde esquerda índigo, glassmorphism ─── */
    .section-header {
        display: flex;
        align-items: center;
        gap: 14px;
        margin: 32px 0 20px 0;
        padding: 10px 0 14px 16px;
        border-bottom: 1px solid rgba(99, 102, 241, 0.1);
        border-left: 3px solid rgba(99, 102, 241, 0.55);
        background: linear-gradient(90deg, rgba(99, 102, 241, 0.05) 0%, transparent 60%);
    }
    .section-icon {
        width: 34px;
        height: 34px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.1rem;
        background: rgba(99, 102, 241, 0.08);
        border: 1px solid rgba(99, 102, 241, 0.2);
        color: rgba(165, 180, 252, 0.9);
    }
    .section-title {
        font-size: 0.95rem;
        font-weight: 600;
        color: #f1f5f9;
        margin: 0;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        font-family: 'Outfit', sans-serif;
    }
    .section-subtitle {
        font-size: 0.78rem;
        color: #64748b;
        margin: 2px 0 0 0;
        font-weight: 400;
        text-transform: none;
    }

    /* ─── PAGE HEADER ─── */
    .hero-container {
        text-align: left;
        padding: 16px 0 14px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.07);
        margin-bottom: 16px;
    }
    .hero-title {
        font-size: 2.2rem;
        font-weight: 800;
        background: linear-gradient(to right, #ffffff, #a5b4fc);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        letter-spacing: -0.03em;
        margin: 0;
        font-family: 'Outfit', sans-serif;
    }
    .hero-subtitle {
        color: #94a3b8;
        font-size: 0.85rem;
        font-weight: 400;
        margin-top: 8px;
        display: flex;
        align-items: center;
        gap: 12px;
    }

    /* ─── BADGE ─── */
    .badge {
        padding: 3px 8px;
        border-radius: 5px;
        font-size: 0.65rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-family: 'Outfit', sans-serif;
    }
    .badge-secondary {
        background: rgba(245, 222, 179, 0.08);
        color: rgba(245, 222, 179, 0.7);
        border: 1px solid rgba(245, 222, 179, 0.15);
    }

    /* ─── FORMULA BOX: Glassmorphism com acento bege ─── */
    .formula-box {
        background: rgba(15, 23, 42, 0.5);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(245, 222, 179, 0.1);
        border-left: 3px solid rgba(245, 222, 179, 0.5);
        border-radius: 0 12px 12px 0;
        padding: 18px 20px;
        font-family: 'Outfit', sans-serif;
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
        font-family: 'Outfit', sans-serif;
    }
    .formula-box b {
        color: #f1f5f9;
        font-weight: 600;
    }
    .formula-box sub {
        font-size: 0.75em;
        color: #94a3b8;
    }

    /* ─── DIVIDER ─── */
    .divider {
        height: 1px;
        background: rgba(245, 222, 179, 0.06);
        margin: 32px 0;
    }

    /* ─── HEADINGS ─── */
    h1, h2, h3, h4, h5, h6 {
        color: #f1f5f9;
        font-weight: 600;
        font-family: 'Outfit', sans-serif;
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

    /* ─── METRIC CARDS: Glassmorphism padrao do app ─── */
    .metric-card {
        background: rgba(15, 23, 42, 0.6) !important;
        backdrop-filter: blur(16px) !important;
        -webkit-backdrop-filter: blur(16px) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        border-radius: 20px !important;
        padding: 18px 16px !important;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3) !important;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }
    .metric-card:hover {
        background: rgba(15, 23, 42, 0.75) !important;
        border-color: rgba(245, 222, 179, 0.2) !important;
        box-shadow: 0 20px 50px -10px rgba(245, 222, 179, 0.2) !important;
        transform: translateY(-2px) !important;
    }
    .metric-label {
        font-size: 0.72rem !important;
        text-transform: uppercase !important;
        letter-spacing: 0.06em !important;
        color: #64748b !important;
        font-weight: 500 !important;
        font-family: 'Outfit', sans-serif !important;
    }
    .metric-value {
        font-family: 'Outfit', sans-serif !important;
        font-size: 1.4rem !important;
        font-weight: 700 !important;
        color: #f1f5f9 !important;
        letter-spacing: -0.02em !important;
    }
    .metric-subtitle {
        font-size: 0.7rem !important;
        color: #475569 !important;
        font-family: 'Outfit', sans-serif !important;
    }

    /* Semantic colors for metric values */
    .metric-card[data-positive="true"] .metric-value {
        color: #34d399 !important;
        text-shadow: 0 0 20px rgba(52, 211, 153, 0.15);
    }
    .metric-card[data-negative="true"] .metric-value {
        color: #f87171 !important;
        opacity: 0.9;
    }

    /* ─── DATAFRAMES ─── */
    [data-testid="stDataFrame"] {
        background: rgba(15, 23, 42, 0.6) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        border-radius: 12px !important;
    }
    [data-testid="stDataFrame"] table {
        font-family: 'Outfit', sans-serif !important;
        font-size: 0.78rem !important;
    }
    [data-testid="stDataFrame"] th {
        background: rgba(15, 23, 42, 0.8) !important;
        color: #94a3b8 !important;
        font-weight: 600 !important;
        text-transform: uppercase !important;
        font-size: 0.68rem !important;
        letter-spacing: 0.05em !important;
    }
    [data-testid="stDataFrame"] td {
        color: #cbd5e1 !important;
        border-color: rgba(255, 255, 255, 0.05) !important;
    }
    [data-testid="stDataFrame"] tr:hover td {
        background: rgba(245, 222, 179, 0.03) !important;
    }

    /* ─── EXPANDERS: Glassmorphism padrao do app ─── */
    [data-testid="stExpander"] {
        background: rgba(10, 18, 35, 0.4) !important;
        backdrop-filter: blur(18px) !important;
        -webkit-backdrop-filter: blur(18px) !important;
        border: 1px solid rgba(99, 102, 241, 0.08) !important;
        border-radius: 16px !important;
    }
    [data-testid="stExpander"] summary {
        font-size: 0.82rem !important;
        color: #94a3b8 !important;
        font-weight: 500 !important;
        font-family: 'Outfit', sans-serif !important;
    }
    [data-testid="stExpander"] summary:hover {
        color: #f1f5f9 !important;
    }

    /* Nested expanders: deeper layer */
    [data-testid="stExpander"] [data-testid="stExpander"] {
        background: rgba(15, 23, 42, 0.5) !important;
        border-color: rgba(99, 102, 241, 0.04) !important;
    }

    /* ─── RADIO BUTTONS ─── */
    [data-testid="stRadio"] > div {
        gap: 4px !important;
    }
    [data-testid="stRadio"] label {
        font-size: 0.78rem !important;
        padding: 6px 14px !important;
        border-radius: 8px !important;
        background: rgba(15, 23, 42, 0.5) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        color: #94a3b8 !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        font-family: 'Outfit', sans-serif !important;
    }
    [data-testid="stRadio"] label:hover {
        background: rgba(245, 222, 179, 0.06) !important;
        border-color: rgba(245, 222, 179, 0.2) !important;
        color: #f1f5f9 !important;
    }
    [data-testid="stRadio"] label[data-checked="true"] {
        background: rgba(245, 222, 179, 0.1) !important;
        border-color: rgba(245, 222, 179, 0.3) !important;
        color: #f5deb3 !important;
    }

    /* ─── CODE BLOCKS ─── */
    code {
        font-family: 'Outfit', sans-serif !important;
        font-size: 0.8rem !important;
        background: rgba(15, 23, 42, 0.6) !important;
        padding: 2px 8px !important;
        border-radius: 5px !important;
        color: rgba(245, 222, 179, 0.8) !important;
        border: 1px solid rgba(245, 222, 179, 0.1) !important;
    }

    /* ─── TABLES IN MARKDOWN ─── */
    table {
        font-size: 0.8rem !important;
        border-collapse: collapse !important;
        font-family: 'Outfit', sans-serif !important;
    }
    th, td {
        padding: 8px 12px !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
    }
    th {
        background: rgba(15, 23, 42, 0.6) !important;
        color: #94a3b8 !important;
        font-weight: 600 !important;
    }
    td {
        color: #cbd5e1 !important;
    }

    /* ─── SPINNERS ─── */
    [data-testid="stSpinner"] {
        color: rgba(245, 222, 179, 0.6) !important;
    }

    /* ─── HIDE STREAMLIT CHROME ─── */
    #MainMenu, footer, header,
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
# FINANCIAL CONSTANTS
# ═══════════════════════════════════════════════════════════════════════
# CDI/SELIC approximation used as risk-free rate for Sharpe calculation.
# Update annually or fetch dynamically from a data source.
CDI_ANNUAL = 0.1065  # ~10.65% a.a. (SELIC vigente em 2025)

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
    'asset': '#34d399',       # Green — asset return (positivo)
    'fx': '#06b6d4',          # Cyan — FX effect (ao vivo/ativo)
    'total': '#f1f5f9',       # White — total/neutral
    'twr': '#cbd5e1',         # Light gray — TWR (neutral metric)
    'mwr': '#fcd34d',         # Amber — MWR (timing-dependent)
    'negative': '#f87171',    # Red — loss (negativo)
    'positive': '#34d399',    # Green — gain (positivo)
    'structure': '#475569',   # Dark gray — guides
}

def _apply_chart_layout(fig, title="", height=400):
    """Apply institutional scientific chart styling."""
    fig.update_layout(
        title=dict(
            text=title.upper() if title else "",
            font=dict(size=11, color=COLORS['text_muted'], family='Outfit, sans-serif'),
            x=0.0,
            xanchor='left',
        ),
        height=height,
        plot_bgcolor=COLORS['bg'],
        paper_bgcolor=COLORS['bg'],
        font=dict(family='Outfit, sans-serif', color=COLORS['text_muted'], size=10),
        margin=dict(l=50, r=20, t=55, b=30),
        legend=dict(
            orientation='h',
            yanchor='bottom',
            y=1.02,
            xanchor='right',
            x=1,
            bgcolor='rgba(0,0,0,0)',
            font=dict(size=10, color=COLORS['text_muted'], family='Outfit, sans-serif'),
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
            font=dict(size=11, family='Outfit, sans-serif', color='#e2e8f0'),
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
    df_rf_no_cash = pd.DataFrame()

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

    return df_assets, df_proventos, df_rf_raw, df_cambio, manual_rf_values, cash_balance, df_rf_no_cash


@st.cache_data(ttl=900, show_spinner=False)
def _fetch_prices(tickers, min_date):
    return fetch_historical_data(tickers, min_date)


@st.cache_data(ttl=300, show_spinner=False)
def _compute_realtime_patrimonio(df_assets, df_rf_no_cash, cash_balance):
    """Calcula patrimônio com preços em tempo real (igual à Home e Investimentos).
    Independente do modo Mercado/Meu Custo — sempre usa cotação spot atual.
    """
    rv_patrimonio = 0.0
    rf_patrimonio = 0.0
    usd_rt = 5.5
    eur_rt = 6.0
    cad_rt = 4.0
    map_prices_rt = {}

    # ── RV: posições atuais × preços em tempo real ──────────────────────
    if not df_assets.empty:
        df_pos, _ = calcular_carteira_fechada(df_assets)
        if not df_pos.empty:
            tickers_rt = df_pos[df_pos['Qtd'] > 0]['Ticker'].tolist()
            for fx_ticker in ['BRL=X', 'EURBRL=X', 'CADBRL=X']:
                if fx_ticker not in tickers_rt:
                    tickers_rt.append(fx_ticker)

            map_prices_rt, _ = fetch_market_data(tickers_rt)
            usd_rt = map_prices_rt.get('BRL=X', 5.5)
            eur_rt = map_prices_rt.get('EURBRL=X', 6.0)
            cad_rt = map_prices_rt.get('CADBRL=X', 4.0)

            for _, row in df_pos.iterrows():
                if row['Qtd'] <= 0:
                    continue
                t = row['Ticker']
                m = row.get('Moeda', 'BRL')
                price = map_prices_rt.get(t, 0.0)
                if price <= 0:
                    price = row.get('PM_Origem', 0.0)
                fx_rate = {'USD': usd_rt, 'EUR': eur_rt, 'CAD': cad_rt}.get(m, 1.0)
                rv_patrimonio += row['Qtd'] * price * fx_rate

    # ── RF: valores manuais com conversão USD → BRL ──────────────────────
    if not df_rf_no_cash.empty:
        df_rf = df_rf_no_cash.copy()
        df_rf['Atual'] = pd.to_numeric(df_rf['Atual'], errors='coerce').fillna(0)
        df_rf = df_rf[df_rf['Atual'] > 0]
        if 'Moeda' in df_rf.columns:
            mask_usd = df_rf['Moeda'].astype(str).str.upper() == 'USD'
            if mask_usd.any():
                if not map_prices_rt:
                    _p, _ = fetch_market_data(['BRL=X'])
                    usd_rt = _p.get('BRL=X', 5.5)
                df_rf.loc[mask_usd, 'Atual'] = df_rf.loc[mask_usd, 'Atual'] * usd_rt
        rf_patrimonio = df_rf['Atual'].sum()

    patrimonio_total = rv_patrimonio + rf_patrimonio + cash_balance
    return rv_patrimonio, rf_patrimonio, patrimonio_total


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
        df_assets, df_proventos, df_rf_raw, df_cambio, manual_rf_values, cash_balance, df_rf_no_cash = _load_all_data()

    # ── PATRIMÔNIO EM TEMPO REAL (independente do modo/engine) ────────
    _rv_rt, _rf_rt, patrimonio_realtime = _compute_realtime_patrimonio(
        df_assets, df_rf_no_cash, cash_balance
    )
    _ativos_rt = _rv_rt + _rf_rt

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
        <div class="section-icon">◇</div>
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
        start_date = data_max - pd.DateOffset(months=1)
    elif period == "3M":
        start_date = data_max - pd.DateOffset(months=3)
    elif period == "6M":
        start_date = data_max - pd.DateOffset(months=6)
    elif period == "YTD":
        start_date = pd.Timestamp(data_max.year, 1, 1)
    elif period == "1Y":
        start_date = data_max - pd.DateOffset(years=1)
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
            fx_cost_basis=fx_cost_basis,  # Pass cost basis for "Meu Custo" mode
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
        # Use time-weighted average NAV as denominator (Modified Dietz approach).
        # The simple nav_inicial + total_flow is fragile when there are large
        # withdrawals — it can be near-zero or negative, inflating the percentage.
        avg_nav = df_engine['nav'].mean()
        retorno_mtm = total_pnl / avg_nav if avg_nav > 0 else 0.0
        _mtm_denominator_fragile = invested_capital <= 0 or (avg_nav > 0 and abs(invested_capital / avg_nav) < 0.3)

        # 6. Flow Ledger
        flow_ledger = build_flow_ledger(
            df_assets, df_proventos, df_cambio,
            multi_result.fx_rates, df_rf_raw
        )
        ledger_period = flow_ledger.filter_by_period(start_date, end_date)

    # ═══════════════════════════════════════════════════════════════════
    # DISPLAY
    # ═══════════════════════════════════════════════════════════════════
    diff_twr_mwr = twr_result.total_twr - mwr_result.irr_period
    _period_label = f"{start_date.strftime('%d/%m/%Y')} → {end_date.strftime('%d/%m/%Y')} ({(end_date - start_date).days}d)"

    # ═══════════════════════════════════════════════════════════════════
    # BLOCO 1 — 4 KPIs PRINCIPAIS
    # ═══════════════════════════════════════════════════════════════════
    st.markdown(f"""
    <div class="section-header">
        <div class="section-icon">◈</div>
        <div>
            <div class="section-title">Resultado do Período</div>
            <div class="section-subtitle">{_period_label}</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    k1, k2, k3, k4 = st.columns(4)

    with k1:
        subtitle_text = f"Ativos R$ {_ativos_rt:,.0f} + Caixa R$ {cash_balance:,.0f}" if cash_balance > 0 else "Valor atual de mercado"
        st.markdown(render_metric_card(
            label="Patrimônio Total",
            value=f"R$ {patrimonio_realtime:,.0f}",
            delta=None,
            delta_positive=True,
            subtitle=subtitle_text,
        ), unsafe_allow_html=True)

    with k2:
        twr_positive = twr_result.total_twr >= 0
        st.markdown(render_metric_card(
            label="TWR",
            value=f"{twr_result.total_twr:.2%}",
            delta=f"{twr_result.annualized_twr:.2%} a.a." if twr_result.annualized_twr != 0 else None,
            delta_positive=twr_positive,
            subtitle="Retorno ponderado pelo tempo",
        ), unsafe_allow_html=True)

    with k3:
        mwr_positive = mwr_result.irr_period >= 0
        st.markdown(render_metric_card(
            label="MWR (IRR)",
            value=f"{mwr_result.irr_period:.2%}",
            delta=f"{mwr_result.irr_annual:.2%} a.a.",
            delta_positive=mwr_positive,
            subtitle="Retorno do investidor",
        ), unsafe_allow_html=True)

    with k4:
        mtm_positive = retorno_mtm >= 0
        mtm_subtitle = "P&L ÷ NAV médio"
        if _mtm_denominator_fragile:
            mtm_subtitle += " ⚠"
        st.markdown(render_metric_card(
            label="MTM P&L",
            value=f"R$ {total_pnl:,.0f}",
            delta=f"{retorno_mtm:.2%}",
            delta_positive=mtm_positive,
            subtitle=mtm_subtitle,
        ), unsafe_allow_html=True)

    # ═══════════════════════════════════════════════════════════════════
    # BLOCO 2 — EVOLUÇÃO PATRIMONIAL (gráfico principal)
    # ═══════════════════════════════════════════════════════════════════
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">◆</div>
        <div>
            <div class="section-title">Evolução Patrimonial</div>
            <div class="section-subtitle">NAV em R$ e retorno TWR acumulado</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    _fig_nav = plot_nav_vs_twr(
        df_engine,
        twr_result.cumulative_series,
        df_engine['flow'],
        title=""
    )
    st.plotly_chart(_fig_nav, use_container_width=True, config={'displayModeBar': False})

    # ═══════════════════════════════════════════════════════════════════
    # BLOCO 3 — EXPANDERS: ANÁLISE DETALHADA
    # ═══════════════════════════════════════════════════════════════════

    # ── Timing dos Aportes ────────────────────────────────────────────
    cum = twr_result.cumulative_series
    timing_label = "neutro"
    if abs(diff_twr_mwr) > 0.005:
        timing_label = "prejudicou" if diff_twr_mwr > 0 else "beneficiou"
    with st.expander(f"▶  Timing dos Aportes — TWR vs MWR  ·  {diff_twr_mwr:+.2%} ({timing_label})", expanded=False):
        col_t1, col_t2 = st.columns([2, 1])
        with col_t1:
            fig_twr_mwr = go.Figure()
            if not cum.empty:
                fig_twr_mwr.add_trace(go.Scatter(
                    x=cum.index, y=cum.values,
                    mode='lines', name=f'TWR  {twr_result.total_twr:+.2%}',
                    line=dict(color=COLORS['twr'], width=2),
                    hovertemplate='%{y:.2%}<extra>TWR</extra>',
                ))
                if mwr_result.converged:
                    mwr_daily = (1 + mwr_result.irr_annual) ** (1 / 365.25) - 1
                    mwr_cum = pd.Series(
                        [(1 + mwr_daily) ** ((d - cum.index[0]).days) - 1 for d in cum.index],
                        index=cum.index
                    )
                    fig_twr_mwr.add_trace(go.Scatter(
                        x=mwr_cum.index, y=mwr_cum.values,
                        mode='lines', name=f'MWR  {mwr_result.irr_period:+.2%}',
                        line=dict(color=COLORS['mwr'], width=1.5, dash='dot'),
                        hovertemplate='IRR projetado: %{y:.2%}<extra>MWR</extra>',
                    ))
            _apply_chart_layout(fig_twr_mwr, "", height=300)
            st.plotly_chart(fig_twr_mwr, use_container_width=True, config={'displayModeBar': False})
        with col_t2:
            st.markdown(f"""
**O que significa?**

- **TWR {twr_result.total_twr:+.2%}** — performance da estratégia (independe do tamanho dos aportes)
- **MWR {mwr_result.irr_period:+.2%}** — performance do investidor (ponderada pelo capital em risco)
- **Δ {diff_twr_mwr:+.2%}** — impacto do timing

{"Você aportou mais nos momentos certos — timing beneficiou." if diff_twr_mwr < -0.005
 else "Você aportou mais nos momentos ruins — timing prejudicou." if diff_twr_mwr > 0.005
 else "Seus aportes não tiveram impacto significativo no retorno."}

| Métrica | Valor |
|---------|-------|
| IRR Anual | {mwr_result.irr_annual:.2%} |
| Convergiu | {"Sim" if mwr_result.converged else "Não"} |
| Fluxos | {mwr_result.cashflows_used} |
""")

    # ── Decomposição do Retorno ───────────────────────────────────────
    theoretical = (1 + decomposition.total_twr_asset) * (1 + decomposition.total_twr_fx) - 1
    with st.expander(f"▶  Decomposição — Ativo {decomposition.total_twr_asset:+.2%} · Câmbio {decomposition.total_twr_fx:+.2%}", expanded=False):
        col_d1, col_d2, col_d3 = st.columns(3)
        with col_d1:
            asset_pos = decomposition.total_twr_asset >= 0
            st.markdown(render_metric_card(
                label="Ativo (moeda orig.)", value=f"{decomposition.total_twr_asset:.2%}",
                delta="Ex-câmbio", delta_positive=asset_pos,
                subtitle="Seleção de ativos",
            ), unsafe_allow_html=True)
        with col_d2:
            fx_pos = decomposition.total_twr_fx >= 0
            st.markdown(render_metric_card(
                label="Câmbio (FX)", value=f"{decomposition.total_twr_fx:.2%}",
                delta="Efeito cambial", delta_positive=fx_pos,
                subtitle="Impacto da variação cambial",
            ), unsafe_allow_html=True)
        with col_d3:
            st.markdown(render_metric_card(
                label="Total BRL", value=f"{theoretical:.2%}",
                delta="(1+R_a)×(1+R_fx)−1", delta_positive=theoretical >= 0,
                subtitle="Resultado combinado",
            ), unsafe_allow_html=True)

        if not decomposition.cumret_asset_total.empty:
            fig_decomp = go.Figure()
            asset_series = decomposition.cumret_asset_total.reindex(cum.index).ffill().fillna(0)
            fx_series_d = decomposition.cumret_fx_total.reindex(cum.index).ffill().fillna(0)
            total_series = decomposition.cumret_total.reindex(cum.index).ffill().fillna(0)
            fig_decomp.add_trace(go.Scatter(
                x=asset_series.index, y=asset_series.values,
                mode='lines', name=f'Ativo  {decomposition.total_twr_asset:+.2%}',
                line=dict(color=COLORS['asset'], width=1.8),
                fill='tozeroy', fillcolor='rgba(110, 231, 183, 0.05)',
                hovertemplate='%{y:.2%}<extra>Ativo</extra>',
            ))
            fig_decomp.add_trace(go.Scatter(
                x=fx_series_d.index, y=fx_series_d.values,
                mode='lines', name=f'Câmbio  {decomposition.total_twr_fx:+.2%}',
                line=dict(color=COLORS['fx'], width=1.8, dash='dot'),
                hovertemplate='%{y:.2%}<extra>Câmbio</extra>',
            ))
            fig_decomp.add_trace(go.Scatter(
                x=total_series.index, y=total_series.values,
                mode='lines', name=f'Total BRL  {decomposition.total_twr:+.2%}',
                line=dict(color=COLORS['total'], width=2.5),
                hovertemplate='%{y:.2%}<extra>Total</extra>',
            ))
            _apply_chart_layout(fig_decomp, "", height=300)
            st.plotly_chart(fig_decomp, use_container_width=True, config={'displayModeBar': False})

    # ── Atribuição por Ativo ──────────────────────────────────────────
    n_assets = len(attribution.assets) if attribution.assets else 0
    with st.expander(f"▶  Atribuição por Ativo  ·  {n_assets} posições", expanded=False):
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
                }).map(
                    lambda v: 'color: #6ee7b7' if v == '✓' else 'color: #fcd34d' if v == '⚠️' else '',
                    subset=['OK']
                ),
                use_container_width=True,
                height=min(400, 35 * len(df_attr) + 50)
            )
        else:
            st.info("Sem dados de custódia para atribuição por ativo.")

    # ── Risco ─────────────────────────────────────────────────────────
    excess_return = twr_result.annualized_twr - CDI_ANNUAL
    sharpe = (excess_return / twr_result.volatility) if twr_result.volatility > 0 else 0.0
    with st.expander(f"▶  Risco — Volatilidade {twr_result.volatility:.1%} · Drawdown {twr_result.max_drawdown:.1%} · Sharpe {sharpe:.2f}", expanded=False):
        r1, r2, r3 = st.columns(3)
        with r1:
            st.markdown(render_metric_card(
                label="Volatilidade",
                value=f"{twr_result.volatility:.2%}",
                delta_positive=twr_result.volatility < 0.20,
                subtitle="Risco anualizado (diário × √252)",
            ), unsafe_allow_html=True)
        with r2:
            st.markdown(render_metric_card(
                label="Drawdown Máx",
                value=f"{twr_result.max_drawdown:.2%}",
                delta_positive=False if twr_result.max_drawdown < -0.05 else True,
                subtitle="Maior queda do pico ao vale",
            ), unsafe_allow_html=True)
        with r3:
            st.markdown(render_metric_card(
                label="Sharpe Ratio",
                value=f"{sharpe:.2f}",
                delta_positive=sharpe >= 1.0,
                subtitle=f"(TWR a.a. − CDI {CDI_ANNUAL:.1%}) ÷ Volatilidade",
            ), unsafe_allow_html=True)
        if len(twr_result.daily_returns) > 21:
            _fig_risk = plot_drawdown_volatility(
                df_engine,
                twr_result.drawdown_series,
                twr_result.daily_returns,
                rolling_window=21
            )
            st.plotly_chart(_fig_risk, use_container_width=True, config={'displayModeBar': False})

    # ── Auditoria Técnica ─────────────────────────────────────────────
    residual_ok = abs(decomposition.total_residual) < 0.02
    with st.expander("▶  Auditoria Técnica — Consistência e Prova Matemática", expanded=False):
        # Consistency checks
        v1, v2, v3 = st.columns(3)
        with v1:
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

        # Consistência por Moeda
        df_decomp = decomposition.to_summary_df()
        if not df_decomp.empty:
            st.markdown("**Consistência por Moeda**")
            df_display = df_decomp.copy()
            for col in ['R_ativo', 'R_fx', 'R_total_calc', 'R_total_real']:
                if col in df_display.columns:
                    df_display[col] = df_display[col].apply(lambda x: f"{x:+.4%}")
            if 'Residual' in df_display.columns:
                df_display['Residual'] = df_decomp['Residual'].apply(
                    lambda x: f"[OK] {x:+.6%}" if abs(x) < 0.001 else f"[!] {x:+.6%}"
                )
            for col in ['FX_inicio', 'FX_fim']:
                if col in df_display.columns:
                    df_display[col] = df_decomp[col].apply(lambda x: f"R$ {x:.4f}")
            st.dataframe(df_display, use_container_width=True, height=min(300, 35 * len(df_display) + 50))

        # Flow Ledger
        st.markdown(f"**Flow Ledger — {len(ledger_period)} fluxos no período**")
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
            st.dataframe(df_ledger, use_container_width=True, height=300)

        # Daily TWR series
        daily_returns = twr_result.daily_returns if hasattr(twr_result, 'daily_returns') and twr_result.daily_returns is not None else pd.Series(dtype=float)
        if not daily_returns.empty:
            st.markdown("**Série Diária TWR**")
            df_daily = pd.DataFrame({
                'Data': daily_returns.index.strftime('%d/%m/%Y'),
                'Retorno Diário': daily_returns.apply(lambda x: f"{x:+.4%}").values,
                'Acumulado': ((1 + daily_returns).cumprod() - 1).apply(lambda x: f"{x:+.2%}").values,
            })
            st.dataframe(df_daily, use_container_width=True, height=260)

        # Raw engine data
        st.markdown("**NAV + Flows (input engine)**")
        st.dataframe(df_engine.head(30), use_container_width=True)


# --- RUN ---
main()

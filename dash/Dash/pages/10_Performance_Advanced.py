"""
Debug Performance — Dashboard de Auditoria Avançada
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
    page_title="Debug Performance",
    page_icon="🔬",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- CSS ---
st.markdown(get_card_css(), unsafe_allow_html=True)
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
    html, body, [class*="css"] { font-family: 'Outfit', sans-serif; }

    .section-header {
        display: flex; align-items: center; gap: 12px;
        margin: 32px 0 20px 0; padding-bottom: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .section-icon {
        width: 40px; height: 40px; border-radius: 10px;
        display: flex; align-items: center; justify-content: center;
        font-size: 1.2rem;
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(99, 102, 241, 0.1) 100%);
    }
    .section-title {
        font-size: 1.1rem; font-weight: 600; color: #f1f5f9; margin: 0;
    }
    .section-subtitle { font-size: 0.8rem; color: #64748b; margin: 0; }

    .hero-container { text-align: center; padding: 2vh 0; animation: fadeIn 1.2s ease-out; }
    .hero-title {
        font-size: 3rem; font-weight: 800;
        background: linear-gradient(to right, #ffffff, #a78bfa);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        letter-spacing: -2px;
    }
    .hero-subtitle {
        color: #94a3b8; font-size: 1rem; font-weight: 300; margin-top: 5px;
        display: flex; justify-content: center; align-items: center; gap: 10px;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }

    .badge {
        padding: 4px 10px; border-radius: 20px; font-size: 0.7rem;
        font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .badge-debug {
        background: rgba(245, 158, 11, 0.15); color: #fbbf24;
        border: 1px solid rgba(245, 158, 11, 0.3);
    }

    .chart-container {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 16px; padding: 20px; margin: 16px 0;
    }

    .formula-box {
        background: rgba(99, 102, 241, 0.08);
        border: 1px solid rgba(99, 102, 241, 0.2);
        border-radius: 12px; padding: 16px;
        font-family: 'Fira Code', monospace; font-size: 0.9rem;
        color: #c4b5fd; margin: 12px 0;
    }
    .formula-box .label { color: #94a3b8; font-size: 0.75rem; margin-bottom: 4px; }

    .consistency-ok { color: #34d399; font-weight: 600; }
    .consistency-warn { color: #f59e0b; font-weight: 600; }

    .divider {
        height: 1px;
        background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%);
        margin: 24px 0;
    }

    h1, h2, h3 { color: #f1f5f9; }

    @media (max-width: 768px) {
        .metric-card { padding: 16px; }
        .metric-value { font-size: 1.4rem; }
    }
</style>
""", unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════════════════
# PLOTLY THEME
# ═══════════════════════════════════════════════════════════════════════
COLORS = {
    'bg': 'rgba(0,0,0,0)',
    'grid': 'rgba(148, 163, 184, 0.08)',
    'grid_major': 'rgba(148, 163, 184, 0.15)',
    'text': '#e2e8f0',
    'text_muted': '#94a3b8',
    'asset': '#34d399',       # Green
    'fx': '#60a5fa',          # Blue
    'total': '#a78bfa',       # Purple
    'twr': '#a78bfa',
    'mwr': '#f59e0b',         # Amber
    'negative': '#f87171',    # Red
    'positive': '#34d399',    # Green
}

def _apply_chart_layout(fig, title="", height=400):
    fig.update_layout(
        title=dict(text=title, font=dict(size=14, color=COLORS['text']), x=0.02),
        height=height,
        plot_bgcolor=COLORS['bg'],
        paper_bgcolor=COLORS['bg'],
        font=dict(family='Outfit, sans-serif', color=COLORS['text_muted'], size=11),
        margin=dict(l=20, r=20, t=50, b=20),
        legend=dict(
            orientation='h', yanchor='bottom', y=1.02, xanchor='right', x=1,
            bgcolor='rgba(0,0,0,0)', font=dict(size=11)
        ),
        xaxis=dict(
            gridcolor=COLORS['grid'], showline=False,
            tickfont=dict(size=10), dtick='M1', tickformat='%b/%y',
        ),
        yaxis=dict(
            gridcolor=COLORS['grid'], showline=False,
            tickfont=dict(size=10), tickformat='.1%',
            zeroline=True, zerolinecolor=COLORS['grid_major'],
        ),
        hovermode='x unified',
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
    if not df_rf_manual.empty:
        df_rf_manual['Atual'] = pd.to_numeric(df_rf_manual['Atual'], errors='coerce').fillna(0)
        df_rf_manual = df_rf_manual[df_rf_manual['Atual'] > 0]
        manual_rf_values = dict(zip(
            df_rf_manual['Ticker'].astype(str).str.strip().str.upper(),
            df_rf_manual['Atual']
        ))

    return df_assets, df_proventos, df_rf_raw, df_cambio, manual_rf_values


@st.cache_data(ttl=900, show_spinner=False)
def _fetch_prices(tickers, min_date):
    return fetch_historical_data(tickers, min_date)


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════

def main():
    render_fab()

    # Header
    st.markdown("""
    <div class="hero-container">
        <div class="hero-title">Debug Performance</div>
        <div class="hero-subtitle">
            Decomposição Matemática Auditável
            <span class="badge badge-debug">ADVANCED</span>
        </div>
    </div>
    """, unsafe_allow_html=True)

    # ── DATA LOADING ──────────────────────────────────────────────────
    with st.spinner("Carregando dados..."):
        df_assets, df_proventos, df_rf_raw, df_cambio, manual_rf_values = _load_all_data()

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
    with st.spinner("Rodando engine multi-currency..."):
        multi_result = reconstruct_history_multicurrency(
            df_bruto=df_assets.copy(),
            df_proventos=df_proventos,
            days_lookback=days_lookback,
            df_prices_external=df_hist_prices,
            df_rf_raw=df_rf_raw,
            df_cambio=df_cambio,
            manual_rf_values=manual_rf_values
        )

    # ── PERIOD SELECTOR ───────────────────────────────────────────────
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">📅</div>
        <div>
            <div class="section-title">Período de Análise</div>
            <div class="section-subtitle">Selecione o intervalo para decomposição</div>
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
            "Visão", ["Mercado", "Meu Dinheiro"],
            horizontal=True, index=0, label_visibility="collapsed"
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
        # FX cost basis for "Meu Dinheiro"
        fx_cost_basis = None
        if view_mode == "Meu Dinheiro":
            fx_cost_basis = build_fx_cost_series(df_cambio, idx_dates)

        consolidated = consolidate_to_brl(
            multi_result.buckets,
            multi_result.fx_rates,
            df_cambio=df_cambio,
            fx_cost_basis=fx_cost_basis,
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
    # DISPLAY
    # ═══════════════════════════════════════════════════════════════════

    # ── KPI ROW ───────────────────────────────────────────────────────
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">📊</div>
        <div>
            <div class="section-title">Métricas do Período</div>
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
        twr_positive = twr_result.total_twr >= 0
        st.markdown(render_metric_card(
            label="TWR Período",
            value=f"{twr_result.total_twr:.2%}",
            delta=f"{twr_result.annualized_twr:.2%} a.a." if twr_result.annualized_twr != 0 else None,
            delta_positive=twr_positive,
            subtitle="Retorno ponderado pelo tempo",
            icon="📈" if twr_positive else "📉"
        ), unsafe_allow_html=True)

    with k2:
        mtm_positive = retorno_mtm >= 0
        st.markdown(render_metric_card(
            label="Retorno MTM",
            value=f"{retorno_mtm:.2%}",
            delta=f"R$ {total_pnl:,.0f}" if total_pnl != 0 else None,
            delta_positive=mtm_positive,
            subtitle="ROI sobre capital investido",
            icon="💰" if mtm_positive else "💸"
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
            value=f"{twr_result.max_drawdown:.2%}",
            delta_positive=False if twr_result.max_drawdown < -0.05 else True,
            subtitle="Maior queda do pico",
            icon="📉"
        ), unsafe_allow_html=True)

    with k5:
        vol_status = twr_result.volatility < 0.20
        st.markdown(render_metric_card(
            label="Volatilidade",
            value=f"{twr_result.volatility:.2%}",
            delta_positive=vol_status,
            subtitle="Risco anualizado",
            icon="🎯" if vol_status else "⚡"
        ), unsafe_allow_html=True)

    # ── MWR/IRR ROW ───────────────────────────────────────────────────
    diff_twr_mwr = twr_result.total_twr - mwr_result.irr_period
    m1, m2, m3 = st.columns(3)
    with m1:
        mwr_positive = mwr_result.irr_period >= 0
        st.markdown(render_metric_card(
            label="MWR (IRR)",
            value=f"{mwr_result.irr_period:.2%}",
            delta=f"{mwr_result.irr_annual:.2%} a.a.",
            delta_positive=mwr_positive,
            subtitle="Retorno do investidor (timing-dependent)",
            icon="🎲"
        ), unsafe_allow_html=True)
    with m2:
        diff_positive = diff_twr_mwr <= 0  # Negative diff = timing helped
        st.markdown(render_metric_card(
            label="TWR − MWR",
            value=f"{diff_twr_mwr:+.2%}",
            delta="Timing neutro" if abs(diff_twr_mwr) < 0.005 else ("Timing prejudicou" if diff_twr_mwr > 0 else "Timing beneficiou"),
            delta_positive=diff_positive,
            subtitle="Impacto do timing dos aportes",
            icon="⚖️"
        ), unsafe_allow_html=True)
    with m3:
        st.markdown(render_metric_card(
            label="Capital Investido",
            value=f"R$ {invested_capital:,.0f}",
            delta=f"NAV₀: R$ {nav_inicial:,.0f}",
            delta_positive=True,
            subtitle="NAV inicial + aportes líquidos",
            icon="💵"
        ), unsafe_allow_html=True)

    # ── FORMULAS BOX ──────────────────────────────────────────────────
    st.markdown(f"""
    <div class="formula-box">
        <div class="label">PREMISSAS MATEMÁTICAS</div>
        <b>TWR</b> = ∏(1 + r<sub>i</sub>) − 1 &nbsp;|&nbsp;
        <b>MWR</b>: Σ CF<sub>t</sub> / (1+r)<sup>Δt</sup> = 0 &nbsp;|&nbsp;
        <b>R<sub>total</sub></b> = (1 + R<sub>ativo</sub>) × (1 + R<sub>fx</sub>) − 1
        <br><br>
        <span style="color: #94a3b8; font-size: 0.8rem;">
        TWR mede a <b>estratégia</b> (timing-neutral) |
        MWR mede o <b>investidor</b> (timing-dependent) |
        Decomposição é <b>multiplicativa</b>, não aditiva
        </span>
    </div>
    """, unsafe_allow_html=True)

    st.markdown('<div class="divider"></div>', unsafe_allow_html=True)

    # ═══════════════════════════════════════════════════════════════════
    # CHART 1: Retorno Acumulado Total em BRL
    # ═══════════════════════════════════════════════════════════════════
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">📈</div>
        <div>
            <div class="section-title">1. Retorno Acumulado Total (BRL)</div>
            <div class="section-subtitle">TWR acumulado consolidado em BRL</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    fig1 = go.Figure()
    cum = twr_result.cumulative_series
    if not cum.empty:
        # Fill: green when positive, red when negative
        fig1.add_trace(go.Scatter(
            x=cum.index, y=cum.values,
            mode='lines', name='Retorno Acumulado',
            line=dict(color=COLORS['total'], width=2.5),
            fill='tozeroy',
            fillcolor='rgba(167, 139, 250, 0.1)',
        ))
    _apply_chart_layout(fig1, "Retorno Acumulado TWR", height=350)
    st.plotly_chart(fig1, use_container_width=True)

    # ═══════════════════════════════════════════════════════════════════
    # CHART 2: Decomposição Empilhada (Asset vs FX)
    # ═══════════════════════════════════════════════════════════════════
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">🧩</div>
        <div>
            <div class="section-title">2. Decomposição: Retorno Ativo vs Câmbio</div>
            <div class="section-subtitle">R<sub>total</sub> = (1 + R<sub>ativo</sub>) × (1 + R<sub>fx</sub>) − 1</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    fig2 = go.Figure()

    if not decomposition.cumret_asset_total.empty:
        asset_series = decomposition.cumret_asset_total.reindex(cum.index).ffill().fillna(0)
        fx_series = decomposition.cumret_fx_total.reindex(cum.index).ffill().fillna(0)

        fig2.add_trace(go.Scatter(
            x=asset_series.index, y=asset_series.values,
            mode='lines', name=f'R_ativo ({decomposition.total_twr_asset:.2%})',
            line=dict(color=COLORS['asset'], width=2),
            stackgroup='decomp',
            fillcolor='rgba(52, 211, 153, 0.15)',
        ))
        fig2.add_trace(go.Scatter(
            x=fx_series.index, y=fx_series.values,
            mode='lines', name=f'R_fx ({decomposition.total_twr_fx:.2%})',
            line=dict(color=COLORS['fx'], width=2),
            stackgroup='decomp',
            fillcolor='rgba(96, 165, 250, 0.15)',
        ))

    _apply_chart_layout(fig2, "Decomposição Ativo + Câmbio", height=350)
    st.plotly_chart(fig2, use_container_width=True)

    # Decomposition summary
    col_d1, col_d2, col_d3, col_d4 = st.columns(4)
    with col_d1:
        asset_pos = decomposition.total_twr_asset >= 0
        st.markdown(render_metric_card(
            label="R_ativo (ponderado)", value=f"{decomposition.total_twr_asset:.2%}",
            delta="Moeda original", delta_positive=asset_pos,
            subtitle="Performance do ativo", icon="🏢"
        ), unsafe_allow_html=True)
    with col_d2:
        fx_pos = decomposition.total_twr_fx >= 0
        st.markdown(render_metric_card(
            label="R_fx (ponderado)", value=f"{decomposition.total_twr_fx:.2%}",
            delta="Efeito cambial", delta_positive=fx_pos,
            subtitle="Impacto da variação cambial", icon="💱"
        ), unsafe_allow_html=True)
    with col_d3:
        theoretical = (1 + decomposition.total_twr_asset) * (1 + decomposition.total_twr_fx) - 1
        st.markdown(render_metric_card(
            label="R_total (teórico)", value=f"{theoretical:.2%}",
            delta="Multiplicativo", delta_positive=theoretical >= 0,
            subtitle="(1+R_a)×(1+R_fx)−1", icon="🧮"
        ), unsafe_allow_html=True)
    with col_d4:
        # Weighted-average of multiplicative returns has inherent approximation
        # error (~1-2% for diversified multi-currency portfolios). This is a
        # known mathematical limitation of Brinson-style attribution.
        residual_ok = abs(decomposition.total_residual) < 0.02
        st.markdown(render_metric_card(
            label="Resíduo", value=f"{decomposition.total_residual:.4%}",
            delta="✓ OK" if residual_ok else "⚠️ Verificar",
            delta_positive=residual_ok, subtitle="Erro de decomposição", icon="🔬"
        ), unsafe_allow_html=True)

    st.markdown('<div class="divider"></div>', unsafe_allow_html=True)

    # ═══════════════════════════════════════════════════════════════════
    # CHART 3: TWR vs MWR
    # ═══════════════════════════════════════════════════════════════════
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">⚖️</div>
        <div>
            <div class="section-title">3. TWR vs MWR (IRR)</div>
            <div class="section-subtitle">TWR = performance da estratégia | MWR = performance do investidor</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    fig3 = go.Figure()

    if not cum.empty:
        fig3.add_trace(go.Scatter(
            x=cum.index, y=cum.values,
            mode='lines', name=f'TWR ({twr_result.total_twr:.2%})',
            line=dict(color=COLORS['twr'], width=2.5),
        ))

        # MWR as flat line (period return)
        if mwr_result.converged:
            mwr_daily = (1 + mwr_result.irr_annual) ** (1 / 365.25) - 1
            mwr_cum = pd.Series(
                [(1 + mwr_daily) ** ((d - cum.index[0]).days) - 1 for d in cum.index],
                index=cum.index
            )
            fig3.add_trace(go.Scatter(
                x=mwr_cum.index, y=mwr_cum.values,
                mode='lines', name=f'MWR ({mwr_result.irr_period:.2%})',
                line=dict(color=COLORS['mwr'], width=2, dash='dash'),
            ))

    _apply_chart_layout(fig3, "TWR vs MWR", height=350)

    # Add annotation explaining difference
    if abs(diff_twr_mwr) > 0.005:
        if diff_twr_mwr > 0:
            interpretation = "TWR > MWR: timing dos aportes prejudicou o resultado"
        else:
            interpretation = "MWR > TWR: timing dos aportes beneficiou o resultado"
    else:
        interpretation = "TWR ≈ MWR: timing dos aportes teve impacto negligível"

    fig3.add_annotation(
        text=interpretation,
        xref="paper", yref="paper", x=0.5, y=-0.12,
        showarrow=False, font=dict(size=11, color=COLORS['text_muted']),
    )

    st.plotly_chart(fig3, use_container_width=True)

    st.markdown('<div class="divider"></div>', unsafe_allow_html=True)

    # ═══════════════════════════════════════════════════════════════════
    # TABLE: Per-Asset Attribution (Debug Table)
    # ═══════════════════════════════════════════════════════════════════
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">🔍</div>
        <div>
            <div class="section-title">4. Atribuição por Ativo</div>
            <div class="section-subtitle">Decomposição e contribuição de cada posição</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    if attribution.assets:
        df_attr = attribution.to_dataframe()

        # Format display
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
                lambda v: 'color: #34d399' if v == '✓' else 'color: #f59e0b' if v == '⚠️' else '',
                subset=['OK']
            ),
            use_container_width=True,
            height=min(400, 35 * len(df_attr) + 50)
        )

        # Summary
        col_a1, col_a2, col_a3 = st.columns(3)
        with col_a1:
            st.markdown(render_metric_card(
                label="Σ Contribuições", value=f"{attribution.sum_contributions:.2%}",
                delta=f"Ativos: {len(attribution.assets)}", delta_positive=True,
                subtitle="Soma das contribuições", icon="📊"
            ), unsafe_allow_html=True)
        with col_a2:
            st.markdown(render_metric_card(
                label="Retorno Total", value=f"{attribution.total_return:.2%}",
                delta="Referência", delta_positive=attribution.total_return >= 0,
                subtitle="TWR consolidado", icon="🎯"
            ), unsafe_allow_html=True)
        with col_a3:
            attr_ok = abs(attribution.attribution_error) < 0.02
            st.markdown(render_metric_card(
                label="Erro de Atribuição", value=f"{attribution.attribution_error:+.4%}",
                delta="✓ OK" if attr_ok else "⚠️",
                delta_positive=attr_ok, subtitle="Σ contrib − R_total", icon="🔬"
            ), unsafe_allow_html=True)
    else:
        st.info("Sem dados de custódia para atribuição por ativo.")

    st.markdown('<div class="divider"></div>', unsafe_allow_html=True)

    # ═══════════════════════════════════════════════════════════════════
    # TABLE: Decomposição por Moeda (Consistency)
    # ═══════════════════════════════════════════════════════════════════
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">🧪</div>
        <div>
            <div class="section-title">5. Consistência por Moeda</div>
            <div class="section-subtitle">Verificação: (1 + R_ativo) × (1 + R_fx) − 1 ≈ R_total</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    df_decomp = decomposition.to_summary_df()
    if not df_decomp.empty:
        df_display = df_decomp.copy()
        df_display['R_ativo'] = df_display['R_ativo'].apply(lambda x: f"{x:+.4%}")
        df_display['R_fx'] = df_display['R_fx'].apply(lambda x: f"{x:+.4%}")
        df_display['R_total_calc'] = df_display['R_total_calc'].apply(lambda x: f"{x:+.4%}")
        df_display['R_total_real'] = df_display['R_total_real'].apply(lambda x: f"{x:+.4%}")
        df_display['Residual'] = df_decomp['Residual'].apply(
            lambda x: f"✓ {x:+.6%}" if abs(x) < 0.001 else f"⚠️ {x:+.6%}"
        )
        df_display['FX_inicio'] = df_decomp['FX_inicio'].apply(lambda x: f"R$ {x:.4f}")
        df_display['FX_fim'] = df_decomp['FX_fim'].apply(lambda x: f"R$ {x:.4f}")

        st.dataframe(df_display, use_container_width=True, height=min(300, 35 * len(df_display) + 50))

    st.markdown('<div class="divider"></div>', unsafe_allow_html=True)

    # ═══════════════════════════════════════════════════════════════════
    # FLOW LEDGER (Collapsible)
    # ═══════════════════════════════════════════════════════════════════
    st.markdown("""
    <div class="section-header">
        <div class="section-icon">📋</div>
        <div>
            <div class="section-title">6. Flow Ledger</div>
            <div class="section-subtitle">Todos os fluxos de caixa tipados — {n} eventos no período</div>
        </div>
    </div>
    """.format(n=len(ledger_period)), unsafe_allow_html=True)

    with st.expander(f"📋 Expandir Flow Ledger ({len(ledger_period)} fluxos)", expanded=False):
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

    # ═══════════════════════════════════════════════════════════════════
    # MWR DETAILS (Collapsible)
    # ═══════════════════════════════════════════════════════════════════
    with st.expander("⚙️ Detalhes MWR/IRR", expanded=False):
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
            | Convergiu | `{'✓ Sim' if mwr_result.converged else '✗ Não'}` |
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

    # ═══════════════════════════════════════════════════════════════════
    # RAW DATA (Collapsible)
    # ═══════════════════════════════════════════════════════════════════
    with st.expander("🗂️ Dados Brutos (Debug)", expanded=False):
        st.markdown("**NAV + Flows (input do TWR engine)**")
        st.dataframe(df_engine.head(30), use_container_width=True)

        st.markdown("**Buckets Multi-Currency**")
        for curr, bucket in multi_result.buckets.items():
            nav_last = bucket.nav_series.iloc[-1] if not bucket.nav_series.empty else 0
            st.write(f"**{curr}**: NAV = {nav_last:,.2f}, Tickers = {bucket.tickers}")


# --- RUN ---
main()

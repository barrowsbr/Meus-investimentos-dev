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
    # VIEW MODE SELECTOR: Market vs My Money
    # ═══════════════════════════════════════════════════════════════════════════
    st.markdown("""
    <div class="section-header" style="margin-top: 10px;">
        <div class="section-icon">🔍</div>
        <div>
            <div class="section-title">Modo de Visualização</div>
            <div class="section-subtitle">Escolha como calcular a rentabilidade</div>
        </div>
    </div>
    """, unsafe_allow_html=True)
    
    col_mode1, col_mode2, col_mode_info = st.columns([2, 2, 4])
    with col_mode1:
        view_mode = st.radio(
            "Modo",
            options=["📈 Visão Mercado", "💰 Meu Dinheiro"],
            label_visibility="collapsed",
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
            manual_rf_values = dict(zip(
                df_rf_manual['Ticker'].astype(str).str.strip().str.upper(),
                df_rf_manual['Atual']
            ))
        
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
        fx_cost_basis = None
        if view_mode == "💰 Meu Dinheiro":
            from core.fx_cost_basis import build_fx_cost_series
            # Build date index from all buckets
            all_dates = set()
            for bucket in multi_result.buckets.values():
                if not bucket.nav_series.empty:
                    all_dates.update(bucket.nav_series.index)
            if all_dates:
                idx_dates = pd.DatetimeIndex(sorted(all_dates))
                fx_cost_basis = build_fx_cost_series(df_cambio, idx_dates)
        
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
        try:
            # 1. RV — posições × preço spot × FX spot (idêntico a Investimentos)
            df_pos_spot, _ = calcular_carteira_fechada(df_assets)
            if not df_pos_spot.empty:
                tickers_spot = df_pos_spot['Ticker'].unique().tolist()
                tickers_spot += ['BRL=X', 'EURBRL=X', 'CADBRL=X']
                mapa_precos_spot, _ = fetch_market_data(list(set(tickers_spot)))
                usd_spot = mapa_precos_spot.get('BRL=X', 5.50)
                eur_spot = mapa_precos_spot.get('EURBRL=X', 6.00)
                cad_spot = mapa_precos_spot.get('CADBRL=X', 4.00)

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
            from core.data.loader import load_fixed_income_manual
            from core.finance import summarize_fixed_income_hybrid
            df_rf_manual_spot = load_fixed_income_manual()
            df_rf_raw_spot = load_fixed_income()
            df_prov_spot = load_proventos()
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
                        moeda_rf = df_rf_ativos.get('Moeda', pd.Series('BRL'))
                        for _, rf_row in df_rf_ativos.iterrows():
                            val_rf = float(rf_row['Atual'])
                            m_rf = rf_row.get('Moeda', 'BRL')
                            if m_rf == 'USD':
                                val_rf *= usd_spot if 'usd_spot' in dir() else 5.50
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

    # =====================================================================
    # DEBUG: Verificação Manual — Filtrado pelo Período Selecionado
    # =====================================================================

    # --- Preparar dados para debug ---
    _dbg_pos, _dbg_lucro_moeda = calcular_carteira_fechada(df_assets)

    # FIFO completo: lucro realizado por ticker (inclui ativos 100% vendidos)
    _dbg_lucro_por_ticker = {}
    _dbg_moeda_por_ticker = {}
    if not df_assets.empty:
        _fifo = {}
        _local = df_assets.copy()
        _local['tipo'] = _local['tipo'].astype(str).str.lower().str.strip()
        _local['moeda'] = _local.get('moeda', 'BRL').astype(str).str.upper().str.strip()
        if 'data' in _local.columns:
            _local = _local.sort_values('data')
        for _, row in _local.iterrows():
            t = row['ticker']
            moeda = row['moeda']
            qtd = float(abs(row['quantidade']))
            preco = float(row['preco'])
            taxas = float(row.get('taxas', 0) or 0)
            if t not in _fifo:
                _fifo[t] = {"lotes": [], "lucro": 0.0, "moeda": moeda}
            _dbg_moeda_por_ticker[t] = moeda
            tipo_op = row['tipo']
            if any(x in tipo_op for x in ['compra', 'entrada', 'aporte']):
                pm_lote = ((qtd * preco) + taxas) / qtd if qtd > 0 else 0
                _fifo[t]["lotes"].append({"qtd": qtd, "pm": pm_lote})
            elif any(x in tipo_op for x in ['venda', 'saida', 'resgate']):
                qtd_vender = qtd
                lucro_op = 0.0
                while qtd_vender > 0 and _fifo[t]["lotes"]:
                    lote = _fifo[t]["lotes"][0]
                    qtd_consumida = min(lote["qtd"], qtd_vender)
                    if lote["qtd"] <= qtd_vender:
                        _fifo[t]["lotes"].pop(0)
                    else:
                        lote["qtd"] -= qtd_consumida
                    lucro_op += (preco - lote["pm"]) * qtd_consumida
                    qtd_vender -= qtd_consumida
                _fifo[t]["lucro"] += lucro_op
        for t, d in _fifo.items():
            _dbg_lucro_por_ticker[t] = d["lucro"]

    _dbg_tickers_all = _dbg_pos['Ticker'].unique().tolist() if not _dbg_pos.empty else []
    _dbg_tickers_all += ['BRL=X', 'EURBRL=X', 'CADBRL=X']
    _dbg_mapa, _ = fetch_market_data(list(set(_dbg_tickers_all)))
    _dbg_usd = _dbg_mapa.get('BRL=X', 5.50)
    _dbg_eur = _dbg_mapa.get('EURBRL=X', 6.00)
    _dbg_cad = _dbg_mapa.get('CADBRL=X', 4.00)

    # RF
    from core.data.loader import load_fixed_income_manual
    from core.finance import summarize_fixed_income_hybrid
    _dbg_rf_manual = load_fixed_income_manual()
    _dbg_rf_raw = load_fixed_income()
    _dbg_prov = load_proventos()
    _dbg_rf = pd.DataFrame()
    if not _dbg_rf_raw.empty:
        if _dbg_rf_manual.empty:
            from core.finance import summarize_fixed_income
            _dbg_rf = summarize_fixed_income(_dbg_rf_raw)
        else:
            _dbg_rf = summarize_fixed_income_hybrid(_dbg_rf_manual, _dbg_rf_raw, _dbg_prov)
            # Complementar com encerrados das transações (hybrid não detecta)
            from core.finance import summarize_fixed_income as _sf
            _dbg_rf_full = _sf(_dbg_rf_raw)
            if not _dbg_rf_full.empty:
                _dbg_rf_encerrados = _dbg_rf_full[_dbg_rf_full['Status'] == 'Encerrado']
                if not _dbg_rf_encerrados.empty:
                    # Só adicionar encerrados que não estão nos saldos manuais
                    tickers_hybrid = set(_dbg_rf['Ticker'].values) if not _dbg_rf.empty else set()
                    _dbg_rf_novos = _dbg_rf_encerrados[~_dbg_rf_encerrados['Ticker'].isin(tickers_hybrid)]
                    if not _dbg_rf_novos.empty:
                        _dbg_rf = pd.concat([_dbg_rf, _dbg_rf_novos], ignore_index=True)

    # Proventos: SEM filtro de período (all-time, = Investimentos)
    _dbg_prov_periodo = _dbg_prov.copy() if not _dbg_prov.empty else pd.DataFrame()

    # Filtrar vendas RV pelo período para lucro realizado do período
    _dbg_vendas_periodo = df_assets[
        (df_assets['tipo'].str.lower().str.contains('venda|saida|resgate', na=False))
    ] if not df_assets.empty else pd.DataFrame()

    # Proventos por ticker (all-time) — usa normalize_ticker para match com posições
    _dbg_prov_ticker = {}
    if not _dbg_prov_periodo.empty:
        for _, r in _dbg_prov_periodo.iterrows():
            t_p = normalize_ticker(str(r.get('ticker', '')).strip().upper())
            m_p = str(r.get('moeda', 'BRL')).strip().upper()
            v_p = float(r.get('valor', 0))
            fx_p = 1.0
            if m_p == 'USD': fx_p = _dbg_usd
            elif m_p == 'EUR': fx_p = _dbg_eur
            elif m_p == 'CAD': fx_p = _dbg_cad
            _dbg_prov_ticker[t_p] = _dbg_prov_ticker.get(t_p, 0.0) + (v_p * fx_p)

    CRIPTO_LIST = ['BTC', 'ETH', 'SOL', 'USDT', 'USDC', 'BTC-USD', 'HBAR', 'ADA', 'XRP']

    with st.expander(f"🔍 DEBUG — Verificação ({sel_ano if sel_ano != 'Todos' else sel_periodo}): {start_date.strftime('%d/%m/%Y')} → {end_date.strftime('%d/%m/%Y')}", expanded=True):

        # =================================================================
        # 1. ATIVOS RV — Posições atuais
        # =================================================================
        st.markdown("### 1. Renda Variável — Posições Atuais")
        _dbg_rows = []
        _dbg_total_valor = 0.0
        _dbg_total_custo = 0.0
        _dbg_total_lucro_aberto = 0.0
        _dbg_total_prov_rv = 0.0

        if not _dbg_pos.empty:
            for _, row in _dbg_pos.iterrows():
                t = row['Ticker']
                qtd = row['Qtd']
                m = row['Moeda']
                pm = row['PM_Origem']

                preco = _dbg_mapa.get(t, 0.0)
                if preco <= 0 or 'TESOURO' in t or 'CDB' in t:
                    preco = pm

                fx = 1.0
                if m == 'USD': fx = _dbg_usd
                elif m == 'EUR': fx = _dbg_eur
                elif m == 'CAD': fx = _dbg_cad

                valor_brl = qtd * preco * fx
                custo_brl = qtd * pm * fx
                lucro_aberto = valor_brl - custo_brl
                prov = _dbg_prov_ticker.get(t, 0.0)
                rent_pct = ((preco - pm) / pm * 100) if pm > 0 else 0.0

                is_cripto = t.upper() in [c.upper() for c in CRIPTO_LIST]
                classe = "Cripto" if is_cripto else "RV"

                _dbg_rows.append({
                    'Ticker': t, 'Classe': classe, 'Moeda': m,
                    'Qtd': qtd, 'PM': pm, 'Preço': preco, 'FX': fx,
                    'Valor (R$)': valor_brl, 'Custo (R$)': custo_brl,
                    'L. Aberto (R$)': lucro_aberto,
                    'Proventos (R$)': prov,
                    'Rent. %': rent_pct
                })
                if qtd > 0:
                    _dbg_total_valor += valor_brl
                    _dbg_total_custo += custo_brl
                    _dbg_total_lucro_aberto += lucro_aberto
                _dbg_total_prov_rv += prov

        if _dbg_rows:
            _dbg_df = pd.DataFrame(_dbg_rows)
            _dbg_carteira = _dbg_df[_dbg_df['Qtd'] > 0].sort_values('Valor (R$)', ascending=False)
            st.dataframe(
                _dbg_carteira[['Ticker', 'Classe', 'Moeda', 'Qtd', 'PM', 'Preço', 'FX',
                               'Valor (R$)', 'Custo (R$)', 'L. Aberto (R$)',
                               'Proventos (R$)', 'Rent. %']],
                column_config={
                    'Qtd': st.column_config.NumberColumn(format="%.4f"),
                    'PM': st.column_config.NumberColumn(format="%.2f"),
                    'Preço': st.column_config.NumberColumn(format="%.2f"),
                    'FX': st.column_config.NumberColumn(format="%.4f"),
                    'Valor (R$)': st.column_config.NumberColumn(format="R$ %.2f"),
                    'Custo (R$)': st.column_config.NumberColumn(format="R$ %.2f"),
                    'L. Aberto (R$)': st.column_config.NumberColumn(format="R$ %.2f"),
                    'Proventos (R$)': st.column_config.NumberColumn(format="R$ %.2f"),
                    'Rent. %': st.column_config.NumberColumn(format="%.2f%%"),
                },
                use_container_width=True, hide_index=True
            )

        c1, c2, c3 = st.columns(3)
        c1.metric("Valor RV", f"R$ {_dbg_total_valor:,.0f}")
        c2.metric("Lucro Aberto", f"R$ {_dbg_total_lucro_aberto:,.0f}")
        c3.metric("Proventos RV (All-Time)", f"R$ {_dbg_total_prov_rv:,.0f}")

        # =================================================================
        # 2. LUCRO REALIZADO RV — FIFO correto por ticker
        # =================================================================
        st.markdown("---")
        st.markdown("### 2. Lucro Realizado RV (FIFO)")

        # Calcular lucro realizado filtrado pelo período usando FIFO incremental
        _dbg_total_lucro_realiz = 0.0
        if not df_assets.empty:
            _fifo_period = {}
            _local_sorted = df_assets.copy()
            _local_sorted['tipo'] = _local_sorted['tipo'].astype(str).str.lower().str.strip()
            _local_sorted['moeda'] = _local_sorted.get('moeda', 'BRL').astype(str).str.upper().str.strip()
            if 'data' in _local_sorted.columns:
                _local_sorted = _local_sorted.sort_values('data')

            _lucro_por_ticker_periodo = {}
            _vendas_detalhe = []

            for _, row in _local_sorted.iterrows():
                t = row['ticker']
                moeda = row['moeda']
                qtd = float(abs(row['quantidade']))
                preco = float(row['preco'])
                taxas = float(row.get('taxas', 0) or 0)
                data_op = row['data']

                if t not in _fifo_period:
                    _fifo_period[t] = {"lotes": [], "moeda": moeda}

                tipo_op = row['tipo']
                if any(x in tipo_op for x in ['compra', 'entrada', 'aporte']):
                    pm_lote = ((qtd * preco) + taxas) / qtd if qtd > 0 else 0
                    _fifo_period[t]["lotes"].append({"qtd": qtd, "pm": pm_lote})
                elif any(x in tipo_op for x in ['venda', 'saida', 'resgate']):
                    qtd_vender = qtd
                    lucro_op = 0.0
                    pm_medio_venda = 0.0
                    qtd_consumida_total = 0.0
                    while qtd_vender > 0 and _fifo_period[t]["lotes"]:
                        lote = _fifo_period[t]["lotes"][0]
                        qtd_consumida = min(lote["qtd"], qtd_vender)
                        pm_medio_venda += lote["pm"] * qtd_consumida
                        qtd_consumida_total += qtd_consumida
                        if lote["qtd"] <= qtd_vender:
                            _fifo_period[t]["lotes"].pop(0)
                        else:
                            lote["qtd"] -= qtd_consumida
                        lucro_op += (preco - lote["pm"]) * qtd_consumida
                        qtd_vender -= qtd_consumida

                    pm_medio_venda = pm_medio_venda / qtd_consumida_total if qtd_consumida_total > 0 else 0

                    # Registra todas as vendas (all-time)
                    if True:
                        fx_v = 1.0
                        if moeda == 'USD': fx_v = _dbg_usd
                        elif moeda == 'EUR': fx_v = _dbg_eur
                        elif moeda == 'CAD': fx_v = _dbg_cad

                        lucro_brl = lucro_op * fx_v
                        _lucro_por_ticker_periodo[t] = _lucro_por_ticker_periodo.get(t, 0.0) + lucro_brl
                        _vendas_detalhe.append({
                            'ticker': t, 'data': data_op, 'qtd': qtd,
                            'preco_venda': preco, 'pm_fifo': pm_medio_venda,
                            'moeda': moeda, 'fx': fx_v,
                            'lucro_nativo': lucro_op, 'lucro_brl': lucro_brl
                        })
                        _dbg_total_lucro_realiz += lucro_brl

            if _vendas_detalhe:
                for v in _vendas_detalhe:
                    data_v = v['data'].strftime('%d/%m/%Y') if hasattr(v['data'], 'strftime') else str(v['data'])
                    st.write(f"- **{v['ticker']}** {data_v}: {v['qtd']:.4f} × ({v['moeda']} {v['preco_venda']:.2f} - PM {v['pm_fifo']:.2f}) × FX {v['fx']:.4f} = R$ {v['lucro_brl']:,.2f}")

                st.markdown("**Por ticker:**")
                for t_r, l_r in sorted(_lucro_por_ticker_periodo.items(), key=lambda x: x[1], reverse=True):
                    st.write(f"- **{t_r}**: R$ {l_r:,.2f}")
            else:
                st.write("Nenhuma venda registrada.")

            st.metric("Total Realizado RV (All-Time)", f"R$ {_dbg_total_lucro_realiz:,.0f}")
        else:
            st.write("Sem dados de transações.")

        # =================================================================
        # 3. CRIPTO — Separado
        # =================================================================
        st.markdown("---")
        st.markdown("### 3. Cripto")
        if _dbg_rows:
            _dbg_cripto = _dbg_df[(_dbg_df['Classe'] == 'Cripto') & (_dbg_df['Qtd'] > 0)]
            if not _dbg_cripto.empty:
                total_cripto_val = _dbg_cripto['Valor (R$)'].sum()
                total_cripto_aberto = _dbg_cripto['L. Aberto (R$)'].sum()
                for _, cr in _dbg_cripto.iterrows():
                    st.write(f"- **{cr['Ticker']}** ({cr['Moeda']}): {cr['Qtd']:.6f} × {cr['Preço']:.2f} × FX {cr['FX']:.4f} = R$ {cr['Valor (R$)']:,.2f} | Lucro: R$ {cr['L. Aberto (R$)']:,.2f} ({cr['Rent. %']:.1f}%)")
                st.write(f"**TOTAL Cripto**: R$ {total_cripto_val:,.2f} | Lucro Aberto: R$ {total_cripto_aberto:,.2f}")
            else:
                st.write("Nenhuma posição cripto ativa.")

        # =================================================================
        # 4. CÂMBIO
        # =================================================================
        st.markdown("---")
        st.markdown("### 4. Câmbio")
        st.write(f"- **USD/BRL**: {_dbg_usd:.4f} | **EUR/BRL**: {_dbg_eur:.4f} | **CAD/BRL**: {_dbg_cad:.4f}")
        if _dbg_rows:
            for moeda_fx in ['USD', 'EUR', 'CAD']:
                _dbg_fx_ativos = _dbg_df[(_dbg_df['Moeda'] == moeda_fx) & (_dbg_df['Qtd'] > 0)]
                if not _dbg_fx_ativos.empty:
                    total_native = (_dbg_fx_ativos['Qtd'] * _dbg_fx_ativos['PM']).sum()
                    total_native_atual = (_dbg_fx_ativos['Qtd'] * _dbg_fx_ativos['Preço']).sum()
                    st.write(f"**{moeda_fx}**: PM {total_native:,.2f} | Atual {total_native_atual:,.2f} | Tickers: {', '.join(_dbg_fx_ativos['Ticker'].tolist())}")

        # =================================================================
        # 5. RENDA FIXA (Ativos + Encerrados)
        # =================================================================
        st.markdown("---")
        st.markdown("### 5. Renda Fixa")
        _dbg_total_rf = 0.0
        _dbg_total_rf_investido = 0.0
        _dbg_total_rf_lucro = 0.0
        _dbg_total_rf_juros = 0.0
        _dbg_total_rf_realiz = 0.0

        if not _dbg_rf.empty:
            _dbg_rf_ativos = _dbg_rf[_dbg_rf['Status'] == 'Ativo']
            if not _dbg_rf_ativos.empty:
                st.markdown("**Ativos (em carteira):**")
                for _, rf_r in _dbg_rf_ativos.iterrows():
                    m_rf = rf_r.get('Moeda', 'BRL')
                    fx_rf = 1.0
                    if m_rf == 'USD': fx_rf = _dbg_usd
                    elif m_rf == 'EUR': fx_rf = _dbg_eur
                    val_atual = float(rf_r['Atual']) * fx_rf
                    val_invest = float(rf_r['Investido']) * fx_rf
                    val_lucro = float(rf_r['Lucro']) * fx_rf
                    val_juros = float(rf_r.get('Proventos_RF', 0)) * fx_rf
                    _dbg_total_rf += val_atual
                    _dbg_total_rf_investido += val_invest
                    _dbg_total_rf_lucro += val_lucro
                    _dbg_total_rf_juros += val_juros
                    st.write(f"- **{rf_r['Ticker']}** ({m_rf}): Invest R$ {val_invest:,.2f} | Atual R$ {val_atual:,.2f} | Lucro R$ {val_lucro:,.2f} | Juros R$ {val_juros:,.2f} | Rent. {rf_r['Rent. %']:.1f}%")

            _dbg_rf_enc = _dbg_rf[_dbg_rf['Status'] == 'Encerrado']
            if not _dbg_rf_enc.empty:
                st.markdown("**Encerrados (realizado):**")
                for _, rf_r in _dbg_rf_enc.iterrows():
                    m_rf = rf_r.get('Moeda', 'BRL')
                    fx_rf = 1.0
                    if m_rf == 'USD': fx_rf = _dbg_usd
                    elif m_rf == 'EUR': fx_rf = _dbg_eur
                    val_invest = float(rf_r['Investido']) * fx_rf
                    val_lucro = float(rf_r['Lucro']) * fx_rf
                    _dbg_total_rf_realiz += val_lucro
                    st.write(f"- **{rf_r['Ticker']}** ({m_rf}): Invest R$ {val_invest:,.2f} | Lucro Realiz R$ {val_lucro:,.2f} | Rent. {rf_r['Rent. %']:.1f}%")

            c1, c2, c3, c4 = st.columns(4)
            c1.metric("RF Atual", f"R$ {_dbg_total_rf:,.0f}")
            c2.metric("RF Lucro Aberto", f"R$ {_dbg_total_rf_lucro:,.0f}")
            c3.metric("RF Realizado", f"R$ {_dbg_total_rf_realiz:,.0f}")
            c4.metric("RF Juros", f"R$ {_dbg_total_rf_juros:,.0f}")
        else:
            st.write("Sem dados de Renda Fixa.")

        # =================================================================
        # 6. PROVENTOS — All-Time (sem filtro de período)
        # =================================================================
        st.markdown("---")
        st.markdown("### 6. Proventos (All-Time)")
        _dbg_prov_bruto_total = 0.0
        _dbg_prov_imposto_total = 0.0
        _dbg_prov_liq_total = 0.0

        if not _dbg_prov_periodo.empty:
            def _conv_brl_prov(row):
                m = str(row.get('moeda', 'BRL')).strip().upper()
                v = float(row.get('valor', 0))
                if m == 'USD': return v * _dbg_usd
                if m == 'EUR': return v * _dbg_eur
                if m == 'CAD': return v * _dbg_cad
                return v
            _dbg_prov_periodo_calc = _dbg_prov_periodo.copy()
            _dbg_prov_periodo_calc['valor_brl'] = _dbg_prov_periodo_calc.apply(_conv_brl_prov, axis=1)

            _dbg_prov_bruto_total = _dbg_prov_periodo_calc[_dbg_prov_periodo_calc['valor_brl'] > 0]['valor_brl'].sum()
            _dbg_prov_imposto_total = abs(_dbg_prov_periodo_calc[_dbg_prov_periodo_calc['valor_brl'] < 0]['valor_brl'].sum())
            _dbg_prov_liq_total = _dbg_prov_periodo_calc['valor_brl'].sum()

            if 'lancamento' in _dbg_prov_periodo_calc.columns:
                _dbg_prov_tipo = _dbg_prov_periodo_calc.groupby('lancamento')['valor_brl'].sum().sort_values(ascending=False)
                st.markdown("**Por Tipo:**")
                for tipo, val in _dbg_prov_tipo.items():
                    st.write(f"- {tipo}: R$ {val:,.2f}")

            _dbg_prov_resumo = _dbg_prov_periodo_calc.groupby('ticker')['valor_brl'].sum().sort_values(ascending=False)
            st.markdown("**Por Ticker:**")
            for tkr, val in _dbg_prov_resumo.items():
                if abs(val) > 0.01:
                    st.write(f"- **{tkr}**: R$ {val:,.2f}")

            c1, c2, c3 = st.columns(3)
            c1.metric("Bruto", f"R$ {_dbg_prov_bruto_total:,.0f}")
            c2.metric("Impostos", f"R$ {_dbg_prov_imposto_total:,.0f}")
            c3.metric("Líquido", f"R$ {_dbg_prov_liq_total:,.0f}")
        else:
            st.write("Sem proventos registrados.")

        # =================================================================
        # 7. RESUMO DO PERÍODO
        # =================================================================
        st.markdown("---")
        st.markdown("### 7. Resumo Geral")
        _nav_ini_dbg = res_period.nav_series.iloc[0] if not res_period.nav_series.empty else 0
        _nav_fin_dbg = res_period.nav_series.iloc[-1] if not res_period.nav_series.empty else 0
        st.write(f"- **NAV Início período**: R$ {_nav_ini_dbg:,.2f}")
        st.write(f"- **NAV Fim período**: R$ {_nav_fin_dbg:,.2f}")
        st.write(f"- **Patrimônio Spot**: R$ {patrimonio_spot:,.2f}")
        st.write(f"- **Fluxos no período**: R$ {res_period.total_flow:,.2f}")
        st.write(f"- **PnL (NAV)**: R$ {res_period.total_pnl:,.2f}")
        st.markdown("---")
        st.write(f"- **Lucro Aberto RV**: R$ {_dbg_total_lucro_aberto:,.2f}")
        st.write(f"- **Lucro Realiz. RV (All-Time)**: R$ {_dbg_total_lucro_realiz:,.2f}")
        st.write(f"- **Proventos (All-Time)**: R$ {_dbg_prov_liq_total:,.2f}")
        st.write(f"- **Lucro RF Aberto**: R$ {_dbg_total_rf_lucro:,.2f}")
        st.write(f"- **Lucro RF Realizado**: R$ {_dbg_total_rf_realiz:,.2f}")
        _resultado_periodo = _dbg_total_lucro_aberto + _dbg_total_lucro_realiz + _dbg_prov_liq_total + _dbg_total_rf_lucro + _dbg_total_rf_realiz
        st.write(f"- **Resultado Total**: R$ {_resultado_periodo:,.2f}")

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
        # Usar patrimônio spot (= Investimentos) quando o slice inclui "hoje"
        nav_display = nav_final
        if patrimonio_spot > 0 and end_date >= data_max:
            nav_display = patrimonio_spot
        patrimonio_delta = nav_display - nav_inicial
        patrimonio_positive = patrimonio_delta >= 0
        st.markdown(render_metric_card(
            label="Patrimônio",
            value=f"R$ {nav_display:,.0f}",
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

    # ═══════════════════════════════════════════════════════════════════════
    # TECHNICAL INFO FOOTER - Subtle debug info for advanced users
    # ═══════════════════════════════════════════════════════════════════════
    with st.expander("ℹ️ Informações Técnicas", expanded=False):
        st.markdown("""
        <style>
            .tech-info-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 16px;
                margin: 10px 0;
            }
            .tech-info-card {
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 10px;
                padding: 12px 16px;
            }
            .tech-info-label {
                font-size: 0.75rem;
                color: #64748b;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 4px;
            }
            .tech-info-value {
                font-size: 0.95rem;
                color: #e2e8f0;
                font-weight: 500;
            }
        </style>
        """, unsafe_allow_html=True)

        # FX Rates Section
        st.markdown("**Taxas de Câmbio (última cotação)**")
        fx_cols = st.columns(len(multi_result.fx_rates) if multi_result.fx_rates else 1)
        for i, (currency, fx_series) in enumerate(multi_result.fx_rates.items()):
            if not fx_series.empty:
                with fx_cols[i]:
                    rate = fx_series.iloc[-1]
                    st.metric(f"{currency}/BRL", f"{rate:.4f}")

        st.markdown("---")
        st.markdown("**NAV por Moeda (valores locais)**")
        nav_cols = st.columns(len(multi_result.buckets) if multi_result.buckets else 1)
        for i, (currency, bucket) in enumerate(multi_result.buckets.items()):
            if not bucket.nav_series.empty:
                with nav_cols[i]:
                    nav_val = bucket.nav_series.iloc[-1]
                    base_curr = currency.replace('_DIRECT', '')
                    display_name = f"{base_curr} (Direto)" if '_DIRECT' in currency else currency
                    symbol = "R$" if currency == "BRL" else base_curr
                    st.metric(display_name, f"{symbol} {nav_val:,.2f}")

        st.markdown("---")
        st.markdown(f"**NAV Consolidado:** R$ {consolidated.nav_brl.iloc[-1]:,.2f}" if not consolidated.nav_brl.empty else "")
        st.caption(f"Motor: TWR Canonical | Atualizado: {datetime.now().strftime('%d/%m/%Y %H:%M')}")




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

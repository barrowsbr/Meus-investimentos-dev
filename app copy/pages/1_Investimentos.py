import streamlit as st
from core.auth import require_auth

# --- AUTH CHECK ---
require_auth()

import pandas as pd
import yfinance as yf
import plotly.express as px
import plotly.graph_objects as go
import os
import numpy as np
import datetime as dt
import shutil
from datetime import datetime, date, timedelta
from typing import Optional

# --- CORE IMPORTS ---
from core.data.loader import load_assets, load_proventos, load_fixed_income, load_cambio
from core.data.market import fetch_market_data

# New Modules
from core.logic import identificar_setor_ativo, normalize_ticker
from core.finance import calcular_carteira_fechada, summarize_fixed_income
from core.utils import parse_decimal_br

from config import BASE_DIR, TAB_ASSETS, TAB_COMPOSICAO, TAB_CAMBIO, TAB_PTAX

# --- 1. CONFIGURAÇÃO DA PÁGINA ---
st.set_page_config(
    page_title="Carteira de Investimentos",
    layout="wide",
    initial_sidebar_state="collapsed",
    page_icon="💎"
)

# --- CSS PERSONALIZADO ---
# --- CSS PERSONALIZADO (GLOBAL THEME) ---
from core.ui import get_card_css, render_metric_card, render_fab

st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;800&display=swap');

    html, body, [class*="css"] {
        font-family: 'Outfit', sans-serif;
        color: #e2e8f0;
    }

    .stApp {
        background: linear-gradient(-45deg, #0e1217, #171c26, #0f1724, #000000);
        background-size: 400% 400%;
        animation: gradient 15s ease infinite;
    }
    @keyframes gradient {
        0%   { background-position: 0% 50%; }
        50%  { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
    }

    /* ── SIDEBAR ── */
    section[data-testid="stSidebar"] {
        background: rgba(8, 13, 26, 0.92);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-right: 1px solid rgba(255,255,255,0.04);
    }
    [data-testid="stSidebarNav"] { display: none !important; }

    /* ── SIDEBAR TOGGLE BUTTONS ── */
    /* Fechar (dentro do sidebar) */
    [data-testid="stSidebarCollapseButton"] button,
    /* Abrir (fora do sidebar, quando está recolhido) */
    [data-testid="stExpandSidebarButton"] button {
        background: rgba(245, 222, 179, 0.08) !important;
        border: 1px solid rgba(245, 222, 179, 0.18) !important;
        border-radius: 8px !important;
        color: rgba(245, 222, 179, 0.8) !important;
        transition: all 0.2s ease !important;
        opacity: 1 !important;
        visibility: visible !important;
    }
    [data-testid="stSidebarCollapseButton"] button:hover,
    [data-testid="stExpandSidebarButton"] button:hover {
        background: rgba(245, 222, 179, 0.18) !important;
        border-color: rgba(245, 222, 179, 0.35) !important;
        color: #fbbf24 !important;
        box-shadow: 0 0 12px rgba(245, 222, 179, 0.15) !important;
    }
    /* Garante visibilidade mesmo com tema escuro sobrepondo */
    [data-testid="stExpandSidebarButton"] {
        opacity: 1 !important;
        visibility: visible !important;
        display: flex !important;
    }

    /* ── TABS ── */
    .stTabs [data-baseweb="tab-list"] {
        gap: 6px;
        background-color: transparent;
        flex-wrap: nowrap;
        overflow-x: auto;
        padding-bottom: 4px;
        scrollbar-width: none;
        scroll-behavior: smooth;
        -webkit-overflow-scrolling: touch;
    }
    .stTabs [data-baseweb="tab-list"]::-webkit-scrollbar { display: none; }

    /* Setas de scroll — :not([data-baseweb="tab"]) exclui os botões de aba reais */
    .stTabs [data-baseweb="tab-list"] > button:not([data-baseweb="tab"]) {
        background: rgba(15, 23, 42, 0.75) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
        border: 1px solid rgba(245, 222, 179, 0.15) !important;
        border-radius: 10px !important;
        color: #64748b !important;
        min-width: 32px !important;
        width: 32px !important;
        height: 44px !important;
        flex-shrink: 0 !important;
        cursor: pointer !important;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
        padding: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
    }
    .stTabs [data-baseweb="tab-list"] > button:not([data-baseweb="tab"]):hover {
        background: rgba(15, 23, 42, 0.95) !important;
        border-color: rgba(245, 222, 179, 0.4) !important;
        color: #f5deb3 !important;
        transform: scale(1.05) !important;
    }

    /* Underline padrão do Streamlit na tab ativa */
    .stTabs [data-baseweb="tab-highlight"] {
        display: none !important;
    }

    .stTabs [data-baseweb="tab"] {
        height: 44px;
        white-space: nowrap;
        background: rgba(15, 23, 42, 0.5);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-radius: 12px;
        padding: 8px 20px;
        color: #64748b;
        border: 1px solid rgba(255,255,255,0.06);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        font-size: 0.84rem;
        font-weight: 500;
        letter-spacing: 0.2px;
    }
    .stTabs [data-baseweb="tab"]:hover {
        border-color: rgba(245, 222, 179, 0.3);
        color: #f5deb3;
        background: rgba(15, 23, 42, 0.7);
        transform: translateY(-1px);
    }
    .stTabs [aria-selected="true"] {
        background: rgba(245, 222, 179, 0.07);
        border: 1px solid rgba(245, 222, 179, 0.4);
        color: #f5deb3;
        text-shadow: 0 0 20px rgba(245, 222, 179, 0.25);
        box-shadow: 0 0 18px rgba(245, 222, 179, 0.06);
    }

    /* ── TABS: MOBILE ── */
    @media (max-width: 640px) {
        .stTabs [data-baseweb="tab-list"] {
            gap: 4px !important;
        }
        .stTabs [data-baseweb="tab"] {
            padding: 7px 12px !important;
            font-size: 0.78rem !important;
            border-radius: 10px !important;
            height: 38px !important;
        }
        .stTabs [data-baseweb="tab-list"] > button:not([data-baseweb="tab"]) {
            width: 28px !important;
            min-width: 28px !important;
            height: 38px !important;
        }
    }

    /* ── BARRA DE FILTROS ── */
    .filter-bar {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        padding: 0 0 10px 0;
    }
    .filter-pill {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        background: rgba(15, 23, 42, 0.6);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(245, 222, 179, 0.18);
        border-radius: 20px;
        color: #94a3b8;
        font-family: 'Outfit', sans-serif;
        font-size: 0.82rem;
        font-weight: 500;
        padding: 8px 18px 8px 14px;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        letter-spacing: 0.3px;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
    }
    .filter-pill:hover {
        background: rgba(15, 23, 42, 0.88);
        border-color: rgba(245, 222, 179, 0.45);
        color: #f5deb3;
        transform: translateY(-1px);
        box-shadow: 0 8px 24px rgba(245, 222, 179, 0.08);
    }
    .filter-pill:active {
        transform: scale(0.97);
    }
    .filter-pill-icon {
        font-size: 0.95rem;
        line-height: 1;
    }

    /* ── GLASS CARDS ── */
    .glass-card {
        background: rgba(15, 23, 42, 0.6);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.06);
        padding: 24px;
        border-radius: 20px;
        color: #ffffff;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        margin-bottom: 20px;
    }

    /* ── DATAFRAME ── */
    .stDataFrame {
        border: 1px solid rgba(255, 255, 255, 0.06) !important;
        background-color: rgba(15, 23, 42, 0.6) !important;
        border-radius: 12px !important;
    }

    /* ── HERO ── */
    .hero-container {
        text-align: center;
        padding: 0 0 1vh;
        animation: fadeIn 1.2s ease-out;
    }
    .hero-title {
        font-size: 2.4rem;
        font-weight: 800;
        background: linear-gradient(135deg, #ffffff 0%, #f5deb3 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin-bottom: 0;
        letter-spacing: -1px;
    }
    .hero-subtitle {
        color: #64748b;
        font-size: 0.88rem;
        font-weight: 400;
        margin-top: 4px;
        letter-spacing: 0.8px;
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-20px); }
        to   { opacity: 1; transform: translateY(0); }
    }

    h1, h2, h3 { color: #f1f5f9; }

    /* ── KPI CARDS (lote-card) ── */
    .lote-card {
        background: rgba(15, 23, 42, 0.8);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 16px;
        padding: 18px 22px;
        text-align: center;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        margin-bottom: 8px;
    }
    .lote-card:hover {
        transform: translateY(-3px);
        background: rgba(15, 23, 42, 0.95);
        box-shadow: 0 25px 50px -12px rgba(99, 102, 241, 0.2),
                    inset 0 0 30px rgba(255,255,255,0.02);
        border-color: rgba(99, 102, 241, 0.25);
    }
    .lote-card .lote-label {
        color: #475569;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        font-weight: 600;
        margin-bottom: 6px;
    }
    .lote-card .lote-value {
        color: #f1f5f9;
        font-size: 1.35rem;
        font-weight: 700;
        letter-spacing: -0.5px;
    }
    .lote-card .lote-sub {
        font-size: 0.84rem;
        font-weight: 500;
        margin-top: 4px;
    }
    .lote-pos { color: #34d399; }
    .lote-neg { color: #f87171; }

    /* ── GLASS ALERTS ── */
    .glass-alert {
        border-radius: 12px;
        padding: 14px 18px;
        margin: 10px 0;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        font-size: 0.88rem;
        line-height: 1.6;
    }
    .glass-info {
        background: rgba(99, 102, 241, 0.08);
        border: 1px solid rgba(99, 102, 241, 0.2);
        color: #c7d2fe;
    }
    .glass-warn {
        background: rgba(245, 158, 11, 0.08);
        border: 1px solid rgba(245, 158, 11, 0.2);
        color: #fde68a;
    }
    .glass-success {
        background: rgba(52, 211, 153, 0.08);
        border: 1px solid rgba(52, 211, 153, 0.2);
        color: #6ee7b7;
    }

    /* ── TAB SECTION HEADERS ── */
    .tab-header {
        font-size: 1.05rem;
        font-weight: 700;
        color: #f1f5f9;
        margin: 8px 0 18px 0;
        padding: 10px 16px;
        border-left: 3px solid rgba(245, 222, 179, 0.55);
        background: rgba(245, 222, 179, 0.03);
        border-radius: 0 10px 10px 0;
        letter-spacing: 0.3px;
    }
    .tab-header-sm {
        font-size: 0.9rem;
        font-weight: 600;
        color: #94a3b8;
        margin: 10px 0 10px 0;
        padding-left: 10px;
        border-left: 2px solid rgba(245, 222, 179, 0.3);
        letter-spacing: 0.2px;
    }

    /* ── INPUTS / SELECTBOX (sidebar) ── */
    .stSelectbox > div > div,
    .stMultiSelect > div > div {
        background: rgba(15, 23, 42, 0.5) !important;
        border: 1px solid rgba(255,255,255,0.08) !important;
        border-radius: 10px !important;
    }

    /* ── CHART SECTION SUB-HEADERS (variante índigo) ── */
    .chart-header {
        font-size: 0.95rem;
        font-weight: 700;
        color: #f1f5f9;
        margin: 28px 0 6px 0;
        padding: 8px 14px;
        border-left: 3px solid rgba(99, 102, 241, 0.6);
        background: rgba(99, 102, 241, 0.04);
        border-radius: 0 8px 8px 0;
        letter-spacing: 0.2px;
    }
    .chart-caption {
        font-size: 0.78rem;
        color: #64748b;
        margin: 0 0 14px 4px;
        letter-spacing: 0.1px;
    }

    /* ── LOOK-THROUGH PILLS ── */
    .lt-pills { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 14px; }
    .lt-pill {
        display: inline-flex; align-items: center; gap: 4px;
        border-radius: 20px; padding: 4px 12px;
        font-size: 0.75rem; font-weight: 600;
        letter-spacing: 0.3px;
    }
    .lt-pill-ok {
        background: rgba(52, 211, 153, 0.1);
        border: 1px solid rgba(52, 211, 153, 0.35);
        color: #34d399;
    }
    .lt-pill-warn {
        background: rgba(148, 163, 184, 0.08);
        border: 1px solid rgba(148, 163, 184, 0.18);
        color: #94a3b8;
    }
    /* ── KPI ROW LABEL ── */
    .kpi-section-label {
        font-size: 0.68rem;
        font-weight: 600;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: 1.8px;
        margin-bottom: 10px;
        padding-left: 2px;
    }
</style>
""", unsafe_allow_html=True)

# --- TAB SELECTION FROM QUERY PARAMS ---
import streamlit.components.v1 as components

# Read query parameter for tab selection
tab_param = st.query_params.get("tab", "0")
try:
    tab_index = int(tab_param)
except:
    tab_index = 0

# Redirect for external pages (Performance = tab 1, Legado = tab 9)
if tab_index == 1:
    st.switch_page("pages/10_Performance_Advanced.py")
elif tab_index == 9:
    st.switch_page("pages/6_Historico_Patrimonial.py")

# Inject JavaScript to click the correct tab after page loads
if tab_index > 0:
    components.html(f"""
    <script>
        function selectTab() {{
            const tabs = window.parent.document.querySelectorAll('[data-baseweb="tab"]');
            if (tabs && tabs.length > {tab_index}) {{
                tabs[{tab_index}].click();
            }} else {{
                // Retry if tabs not loaded yet
                setTimeout(selectTab, 100);
            }}
        }}
        // Wait for DOM to be ready
        setTimeout(selectTab, 300);
    </script>
    """, height=0)

# --- 2. LOCALIZAÇÃO E CARREGAMENTO (MODULARIZADO) ---

# Funções Auxiliares de Carga
@st.cache_data(show_spinner=False)
def carregar_composicao_extra():
    from core.data.provider import DataProvider
    return DataProvider.get_composicao()

@st.cache_data(show_spinner=False)
def carregar_cambio():
    from core.data.provider import DataProvider
    return DataProvider.get_cambio()
    
# ==============================================================================
# MOTOR DE CALCULO DE PERFORMANCE (GIPS COMPLIANT) 
# Refatorado para usar twr_canonical como FONTE UNICA DA VERDADE
# ==============================================================================


st.markdown(get_card_css(), unsafe_allow_html=True)

# --- PAGE HEADER ---
render_fab()
st.markdown("""
<div class="hero-container">
    <div class="hero-title">Composição & Alocação</div>
    <div class="hero-subtitle">Gestão Estratégica de Ativos e Acompanhamento de Carteira</div>
</div>
""", unsafe_allow_html=True)

with st.sidebar:
    st.header("◈ Filtros Globais")
    st.caption("Estes filtros afetam **todas** as abas do dashboard, incluindo Performance e Risco.")
    
    if st.button("🔄 Recalcular Dashboard", key="btn_sidebar_refresh_master", use_container_width=True):
        st.cache_data.clear()
        st.rerun()
    
    # 1. CARREGAMENTO DE DADOS BRUTOS
    df_bruto = load_assets()
    df_proventos_bruto = load_proventos()
    df_rf_raw = load_fixed_income()

    # 2. DEFINIÇÃO DE VARIÁVEIS TEMPORAIS (Correção 'data_primeira_transacao')
    if not df_bruto.empty:
        df_bruto['setor_calc'] = df_bruto['ticker'].apply(identificar_setor_ativo)
        if 'moeda' not in df_bruto.columns: df_bruto['moeda'] = 'BRL'
        df_bruto['moeda'] = df_bruto['moeda'].str.upper().str.strip()
        df_bruto['ticker'] = df_bruto['ticker'].str.upper().str.strip()

    # Garantir coluna moeda em proventos
    if not df_proventos_bruto.empty:
        if 'moeda' not in df_proventos_bruto.columns:
            df_proventos_bruto['moeda'] = 'BRL'
        df_proventos_bruto['moeda'] = df_proventos_bruto['moeda'].fillna('BRL').astype(str).str.upper().str.strip()
        df_proventos_bruto['moeda'] = df_proventos_bruto['moeda'].replace({'': 'BRL', 'NAN': 'BRL', 'NONE': 'BRL'})
        
        data_primeira_transacao = df_bruto['data'].min()
    else:
        data_primeira_transacao = datetime.now() - timedelta(days=365)

    # 3. FILTROS LATERAIS (CASCATA)
    df_rv_cascata = df_bruto.copy() if not df_bruto.empty else pd.DataFrame(columns=['ticker', 'moeda', 'setor_calc'])
    df_rf_cascata = df_rf_raw.copy() if not df_rf_raw.empty else pd.DataFrame(columns=['Ticker', 'Moeda'])

    st.markdown("### 🎚️ Macro Filtros")
    filtro_macro = st.selectbox(
        "Classe de Ativo:", 
        ["Todas", "Renda Variável", "Renda Fixa"],
        index=0,
        key="sidebar_macro_class"
    )
    
    # Aplica Macro Filtro
    if filtro_macro != "Todas":
        if filtro_macro == "Renda Variável":
            df_rf_cascata = df_rf_cascata[0:0] 
        elif filtro_macro == "Renda Fixa":
            df_rv_cascata = df_rv_cascata[0:0]

    opcoes_moeda = ['Todas'] + sorted(df_rv_cascata['moeda'].unique())
    filtro_moeda = st.selectbox("Moeda (RV):", opcoes_moeda, key="sidebar_moeda")
    if filtro_moeda != 'Todas': df_rv_cascata = df_rv_cascata[df_rv_cascata['moeda'] == filtro_moeda]

    opcoes_setor = sorted(df_rv_cascata['setor_calc'].unique())
    filtro_setor = st.multiselect("Filtrar por Tipo (RV):", opcoes_setor, key="sidebar_setor")
    if filtro_setor: df_rv_cascata = df_rv_cascata[df_rv_cascata['setor_calc'].isin(filtro_setor)]

    # Filtro de Ticker Unificado
    tickers_rv_disp = df_rv_cascata['ticker'].unique().tolist()
    tickers_rf_disp = df_rf_cascata['Ticker'].unique().tolist() if 'Ticker' in df_rf_cascata.columns else []
    opcoes_ticker = sorted(list(set(tickers_rv_disp + tickers_rf_disp)))
    
    filtro_ticker = st.multiselect("Filtrar Ativos Específicos:", opcoes_ticker, key="sidebar_filtro_ticker")

    lista_rf_permitidos = tickers_rf_disp # Padrão: todos
    if filtro_ticker:
        df_rv_cascata = df_rv_cascata[df_rv_cascata['ticker'].isin(filtro_ticker)]
        lista_rf_permitidos = [t for t in filtro_ticker if t in tickers_rf_disp]

    opcao_ativo = st.selectbox("Ativo na carteira?", ["Todos", "Sim", "Não"], index=0, key="sidebar_ativo_status")

    # Preparação final de RV
    df_aux = df_rv_cascata.copy()
    df_posicao, _ = calcular_carteira_fechada(df_bruto)
    ativos_vivos = set(df_posicao[df_posicao['Qtd'] > 0]['Ticker'])
    
    if opcao_ativo == "Sim": df_aux = df_aux[df_aux['ticker'].isin(ativos_vivos)]
    elif opcao_ativo == "Não": df_aux = df_aux[~df_aux['ticker'].isin(ativos_vivos)]
        
    lista_tickers_final = df_aux['ticker'].unique().tolist()
    
    st.markdown("---")
    
    # 4. SELETOR DE PERÍODO (Removido filtro, usa todo o período)
    dias = (datetime.now() - data_primeira_transacao).days + 10  # Todo o período
    


# --- FIM DO SIDEBAR / INÍCIO DO CORPO PRINCIPAL ---

# --- TABS (Moved to top to prevent reset on re-run) ---
# Ordem segue a estrutura da Home:
# 0: Composição | 1: Performance (redirect) | 2: Renda Variável | 3: Renda Fixa
# 4: Proventos | 5: Cripto | 6: Câmbio | 7: Alavancagem | 8: Imposto | 9: Legado (redirect)

tab1, tab_perf, tab2, tab3, tab4, tab5, tab6, tab_alav, tab7, tab_legado = st.tabs([
    "◈ Resumo",
    "◆ Performance",
    "▣ Renda Variável",
    "◇ Renda Fixa",
    "○ Proventos",
    "◉ Cripto",
    "△ Câmbio",
    "▽ Alavancagem",
    "□ Imposto",
    "▢ Legado"
])

# --- REDIRECT TABS (Performance e Legado) ---
with tab_perf:
    st.markdown("""
    <div style="text-align: center; padding: 60px 20px;">
        <div style="font-size: 3rem; margin-bottom: 16px;">🚀</div>
        <h2 style="color: #f1f5f9; margin-bottom: 8px;">Performance Advanced</h2>
        <p style="color: #64748b; margin-bottom: 24px;">MWR · IRR · Decomposição · Benchmarks</p>
    </div>
    """, unsafe_allow_html=True)
    if st.button("Acessar Performance Advanced", key="btn_goto_perf", use_container_width=True, type="primary"):
        st.switch_page("pages/10_Performance_Advanced.py")

with tab_legado:
    st.markdown("""
    <style>
    .leg-dash {
        background: linear-gradient(135deg, rgba(15,23,42,0.92) 0%, rgba(26,20,60,0.88) 100%);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(251,191,36,0.22);
        border-radius: 20px;
        padding: 28px 32px;
        margin-bottom: 20px;
        position: relative;
        overflow: hidden;
    }
    .leg-dash::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 3px;
        background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 50%, #f59e0b 100%);
    }
    .leg-hero-label {
        font-size: 0.72rem;
        font-weight: 700;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        margin-bottom: 8px;
    }
    .leg-hero-val {
        font-size: 2.8rem;
        font-weight: 800;
        color: #fbbf24;
        line-height: 1;
        margin-bottom: 6px;
        letter-spacing: -1px;
    }
    .leg-hero-sub {
        font-size: 0.8rem;
        color: #64748b;
        margin-bottom: 0;
    }
    .leg-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin-top: 22px;
    }
    .leg-gi {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 12px;
        padding: 12px 16px;
        transition: background 0.2s;
    }
    .leg-gl {
        font-size: 0.68rem;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        margin-bottom: 5px;
        font-weight: 600;
    }
    .leg-gv { font-size: 1.15rem; font-weight: 800; color: #f1f5f9; }
    .leg-gv.pos { color: #34d399; }
    .leg-gv.neg { color: #f87171; }
    .leg-gv.acc { color: #a78bfa; }
    .leg-gv.gold { color: #fbbf24; }

    .leg-section-title {
        font-size: 0.72rem;
        font-weight: 700;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        margin: 24px 0 12px 2px;
    }

    .leg-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        background: rgba(15,23,42,0.65);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 14px;
        overflow: hidden;
        margin-top: 4px;
        font-family: 'Outfit', sans-serif;
    }
    .leg-table thead { background: rgba(251,191,36,0.07); }
    .leg-table th {
        padding: 11px 14px;
        font-size: 0.68rem;
        font-weight: 700;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        border-bottom: 1px solid rgba(255,255,255,0.07);
        white-space: nowrap;
    }
    .leg-table th.yr { text-align: right; }
    .leg-table td {
        padding: 10px 14px;
        font-size: 0.8rem;
        color: #e2e8f0;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        white-space: nowrap;
    }
    .leg-table tr:last-child td { border-bottom: none; }
    .leg-table tbody tr:hover td { background: rgba(251,191,36,0.05); }
    .leg-table td.val {
        text-align: right;
        font-family: 'JetBrains Mono', 'Courier New', monospace;
        font-size: 0.77rem;
        color: #cbd5e1;
    }
    .leg-table td.val.zero { color: #334155; }
    .leg-table tr.tot-row td {
        font-weight: 700;
        color: #fbbf24;
        background: rgba(251,191,36,0.06);
        border-top: 1px solid rgba(251,191,36,0.18);
    }
    .owner-badge {
        display: inline-block;
        padding: 2px 7px;
        border-radius: 10px;
        font-size: 0.6rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        margin-right: 7px;
        vertical-align: middle;
    }
    .ob-lucas { background: rgba(129,140,248,0.18); color: #a5b4fc; border: 1px solid rgba(129,140,248,0.25); }
    .ob-maria { background: rgba(244,114,182,0.18); color: #f9a8d4; border: 1px solid rgba(244,114,182,0.25); }
    .ob-conjunto { background: rgba(45,212,191,0.18); color: #5eead4; border: 1px solid rgba(45,212,191,0.25); }
    .yoy-pos { color: #34d399; font-weight: 700; }
    .yoy-neg { color: #f87171; font-weight: 700; }
    .yoy-neu { color: #64748b; }
    </style>
    """, unsafe_allow_html=True)

    # --- DATA ---
    try:
        from core.data.provider import DataProvider
        _df_leg_raw = DataProvider.fetch_data('lb_historic')
    except Exception:
        _df_leg_raw = pd.DataFrame()

    def _fmt_brl_leg(v):
        try:
            v = float(v)
        except (TypeError, ValueError):
            return "—"
        if pd.isna(v) or v == 0:
            return "—"
        if abs(v) >= 1_000_000:
            return ("R$ " + f"{v/1_000_000:.2f}").replace(".", ",") + "M"
        return f"R$ {v:,.0f}".replace(",", "X").replace(".", ",").replace("X", ".")

    def _owner_leg(name):
        n = str(name).lower()
        if 'lucas' in n: return 'lucas'
        if 'maria' in n: return 'maria'
        return 'conjunto'

    def _norm_col(c):
        s = str(c).strip()
        try:
            f = float(s)
            if f == int(f) and 1900 <= int(f) <= 2100:
                return str(int(f))
        except (ValueError, TypeError):
            pass
        return s

    if _df_leg_raw.empty:
        st.markdown("""
        <div style="text-align:center;padding:60px 20px;color:#64748b;">
            <div style="font-size:3rem;margin-bottom:16px;opacity:0.4">🏛️</div>
            <p style="font-size:0.9rem">Nenhum dado histórico encontrado.<br>Verifique a aba <code>lb_historic</code> na planilha.</p>
        </div>
        """, unsafe_allow_html=True)
    else:
        df_leg = _df_leg_raw.copy()
        df_leg.columns = [_norm_col(c) for c in df_leg.columns]

        first_col = df_leg.columns[0]
        year_cols = sorted(
            [c for c in df_leg.columns if c.isdigit() and 1900 <= int(c) <= 2100],
            key=int
        )

        df_leg = df_leg[
            df_leg[first_col].notna() &
            (df_leg[first_col].astype(str).str.strip() != '')
        ].copy()
        for yc in year_cols:
            df_leg[yc] = df_leg[yc].apply(parse_decimal_br)

        df_leg_data = df_leg[
            ~df_leg[first_col].astype(str).str.lower().str.strip().isin(['total', 'total geral'])
        ].copy()

        if df_leg_data.empty or len(year_cols) < 1:
            st.info("Dados insuficientes no histórico. Verifique a aba lb_historic na planilha.", icon="ℹ️")
        else:
            min_y, max_y = year_cols[0], year_cols[-1]
            prev_y = year_cols[-2] if len(year_cols) >= 2 else None
            totals_by_yr = {yc: float(df_leg_data[yc].sum()) for yc in year_cols}
            total_ini = totals_by_yr[min_y]
            total_cur = totals_by_yr[max_y]
            years_span = int(max_y) - int(min_y)

            growth_pct = ((total_cur / total_ini) - 1) * 100 if total_ini > 0 else 0
            cagr = ((total_cur / total_ini) ** (1 / years_span) - 1) * 100 if (total_ini > 0 and years_span > 0) else 0
            multiplier = total_cur / total_ini if total_ini > 0 else 1.0
            yoy_last = ((total_cur / totals_by_yr[prev_y]) - 1) * 100 if (prev_y and totals_by_yr.get(prev_y, 0) > 0) else None

            def _sign(v): return "+" if v >= 0 else ""
            def _cls(v): return "pos" if v >= 0 else "neg"
            yoy_display = (
                f'<div class="leg-gv {_cls(yoy_last)}">{_sign(yoy_last)}{yoy_last:.1f}%</div>'
                if yoy_last is not None else
                '<div class="leg-gv acc">—</div>'
            )

            # --- HERO CARD ---
            st.markdown(f"""
            <div class="leg-dash">
                <div class="leg-hero-label">Patrimônio Histórico &middot; {min_y}–{max_y}</div>
                <div class="leg-hero-val">{_fmt_brl_leg(total_cur)}</div>
                <div class="leg-hero-sub">Consolidado em {max_y} &middot; {len(df_leg_data)} instituições</div>
                <div class="leg-grid">
                    <div class="leg-gi">
                        <div class="leg-gl">CAGR</div>
                        <div class="leg-gv pos">+{cagr:.1f}% a.a.</div>
                    </div>
                    <div class="leg-gi">
                        <div class="leg-gl">Crescimento Total</div>
                        <div class="leg-gv {_cls(growth_pct)}">{_sign(growth_pct)}{growth_pct:.0f}%</div>
                    </div>
                    <div class="leg-gi">
                        <div class="leg-gl">Variação {prev_y or '—'}→{max_y}</div>
                        {yoy_display}
                    </div>
                    <div class="leg-gi">
                        <div class="leg-gl">Multiplicador</div>
                        <div class="leg-gv gold">{multiplier:.1f}×</div>
                    </div>
                    <div class="leg-gi">
                        <div class="leg-gl">Período</div>
                        <div class="leg-gv acc">{years_span} anos</div>
                    </div>
                    <div class="leg-gi">
                        <div class="leg-gl">Inicial ({min_y})</div>
                        <div class="leg-gv">{_fmt_brl_leg(total_ini)}</div>
                    </div>
                </div>
            </div>
            """, unsafe_allow_html=True)

            # --- EVOLUTION CHART ---
            totals_list = [totals_by_yr[yc] for yc in year_cols]
            yoy_pcts = [0.0] + [
                ((totals_by_yr[year_cols[i]] / totals_by_yr[year_cols[i-1]]) - 1) * 100
                if totals_by_yr.get(year_cols[i-1], 0) > 0 else 0.0
                for i in range(1, len(year_cols))
            ]

            fig_leg = go.Figure()
            fig_leg.add_trace(go.Scatter(
                x=year_cols,
                y=totals_list,
                mode='lines+markers',
                name='Patrimônio',
                line=dict(color='#f59e0b', width=3),
                marker=dict(size=9, color='#fbbf24', line=dict(color='#1e1b4b', width=2)),
                fill='tozeroy',
                fillcolor='rgba(245,158,11,0.09)',
                hovertemplate='<b>%{x}</b><br>%{y:,.0f}<extra></extra>',
                yaxis='y',
            ))
            if len(year_cols) >= 2:
                bar_colors = [
                    'rgba(52,211,153,0.55)' if v >= 0 else 'rgba(248,113,113,0.55)'
                    for v in yoy_pcts[1:]
                ]
                fig_leg.add_trace(go.Bar(
                    x=year_cols[1:],
                    y=yoy_pcts[1:],
                    name='YoY %',
                    marker_color=bar_colors,
                    marker_line_width=0,
                    hovertemplate='<b>%{x}</b><br>%{y:+.1f}%<extra></extra>',
                    yaxis='y2',
                    width=0.35,
                    opacity=0.85,
                ))
            fig_leg.update_layout(
                template='plotly_dark',
                paper_bgcolor='rgba(0,0,0,0)',
                plot_bgcolor='rgba(0,0,0,0)',
                margin=dict(l=0, r=55, t=10, b=0),
                height=290,
                xaxis=dict(showgrid=False, tickfont=dict(size=11, color='#94a3b8'), dtick=1),
                yaxis=dict(
                    showgrid=True, gridcolor='rgba(255,255,255,0.05)',
                    tickformat=',.0f', tickprefix='R$ ',
                    tickfont=dict(size=10, color='#94a3b8'),
                    side='left',
                ),
                yaxis2=dict(
                    showgrid=False,
                    tickformat='+.0f', ticksuffix='%',
                    tickfont=dict(size=9, color='#64748b'),
                    side='right', overlaying='y',
                    zeroline=True, zerolinecolor='rgba(255,255,255,0.08)',
                ),
                showlegend=False,
                hovermode='x unified',
                bargap=0.25,
            )
            st.plotly_chart(fig_leg, use_container_width=True, config={'displayModeBar': False})

            # --- HISTORY TABLE ---
            with st.expander("📊 Detalhamento por Instituição", expanded=True):
                tbl = '<table class="leg-table"><thead><tr>'
                tbl += '<th style="min-width:200px">Instituição</th>'
                for yc in year_cols:
                    tbl += f'<th class="yr">{yc}</th>'
                if prev_y:
                    tbl += f'<th class="yr">YoY</th>'
                tbl += '</tr></thead><tbody>'

                for _, row in df_leg_data.iterrows():
                    inst = str(row[first_col]).strip()
                    owner = _owner_leg(inst)
                    tbl += f'<tr><td><span class="owner-badge ob-{owner}">{owner}</span>{inst}</td>'
                    for yc in year_cols:
                        v = float(row[yc]) if row[yc] else 0.0
                        cls = ' zero' if v == 0 else ''
                        tbl += f'<td class="val{cls}">{_fmt_brl_leg(v)}</td>'
                    if prev_y:
                        last_v = float(row[max_y]) if row[max_y] else 0.0
                        prev_v = float(row[prev_y]) if row[prev_y] else 0.0
                        if prev_v > 0 and last_v > 0:
                            inst_yoy = ((last_v / prev_v) - 1) * 100
                            yoy_cls = 'yoy-pos' if inst_yoy >= 0 else 'yoy-neg'
                            yoy_str = f'<span class="{yoy_cls}">{"+" if inst_yoy >= 0 else ""}{inst_yoy:.1f}%</span>'
                        elif last_v == 0 and prev_v > 0:
                            yoy_str = '<span class="yoy-neu">—</span>'
                        elif prev_v == 0 and last_v > 0:
                            yoy_str = '<span class="yoy-pos">novo</span>'
                        else:
                            yoy_str = '<span class="yoy-neu">—</span>'
                        tbl += f'<td class="val">{yoy_str}</td>'
                    tbl += '</tr>'

                tbl += '<tr class="tot-row"><td>TOTAL GERAL</td>'
                for yc in year_cols:
                    tbl += f'<td class="val">{_fmt_brl_leg(totals_by_yr[yc])}</td>'
                if prev_y and totals_by_yr.get(prev_y, 0) > 0:
                    tot_yoy = ((total_cur / totals_by_yr[prev_y]) - 1) * 100
                    tot_yoy_cls = 'yoy-pos' if tot_yoy >= 0 else 'yoy-neg'
                    tbl += f'<td class="val"><span class="{tot_yoy_cls}">{"+" if tot_yoy >= 0 else ""}{tot_yoy:.1f}%</span></td>'
                elif prev_y:
                    tbl += '<td class="val">—</td>'
                tbl += '</tr>'
                tbl += '</tbody></table>'
                st.markdown(tbl, unsafe_allow_html=True)

    st.markdown("<div style='height:16px'></div>", unsafe_allow_html=True)
    if st.button("Acessar Legado Completo", key="btn_goto_legado", use_container_width=False, type="secondary"):
        st.switch_page("pages/6_Historico_Patrimonial.py")

# 5. PROCESSAMENTO DE RENDA FIXA (Corrigido: 'Data' e 'Rent. %' restaurados)
df_rf_completo = pd.DataFrame()
df_rf_filtrado = pd.DataFrame() # Inicialização segura

from core.data.loader import load_fixed_income_manual
from core.finance import summarize_fixed_income_hybrid

df_rf_manual = load_fixed_income_manual()

if not df_rf_raw.empty:
    # Use simple summary if no manual data, else hybrid
    if df_rf_manual.empty:
         df_rf_completo = summarize_fixed_income(df_rf_raw)
    else:
         df_rf_completo = summarize_fixed_income_hybrid(df_rf_manual, df_rf_raw, df_proventos_bruto)
else:
    df_rf_completo = pd.DataFrame(columns=['Ticker', 'Ativo', 'Status', 'Data', 'Investido', 'Atual', 'Lucro', 'Rent. %', 'Moeda'])
    
# Aplica filtros em df_rf_filtrado
df_rf_filtrado = df_rf_completo.copy()

if filtro_ticker: 
    df_rf_filtrado = df_rf_filtrado[df_rf_filtrado['Ativo'].isin(lista_rf_permitidos)]

if filtro_macro == "Renda Variável": 
    df_rf_filtrado = df_rf_filtrado[0:0]

# Filtro de ativo (Ativo/Encerrado) para RF
if opcao_ativo == "Sim": 
    df_rf_filtrado = df_rf_filtrado[df_rf_filtrado['Status'] == 'Ativo']
elif opcao_ativo == "Não": 
    df_rf_filtrado = df_rf_filtrado[df_rf_filtrado['Status'] == 'Encerrado']        


# 6. DADOS PARA O RESTANTE DO CÓDIGO (Precos e Proventos)
if 'mapa_precos' not in locals():
    # Se tiver dados, baixa. Se não, dicionário vazio.
    if not df_bruto.empty:
        # Lista base de tickers da carteira
        lista_tickers = df_bruto['ticker'].unique().tolist()
        
        # ADIÇÃO EXPLÍCITA: Tickers de Câmbio (Monitoramento)
        # Garante que as cotações do cabeçalho da aba Câmbio não fiquem zeradas
        tickers_cambio = ['BRL=X', 'EURBRL=X', 'CADBRL=X', 'CHFUSD=X']
        lista_tickers.extend(tickers_cambio)
        
        mapa_precos, mapa_variacao = fetch_market_data(lista_tickers)
    else:
        # Mesmo se não tiver carteira, tenta buscar os câmbios
        tickers_cambio = ['BRL=X', 'EURBRL=X', 'CADBRL=X', 'CHFUSD=X']
        mapa_precos, mapa_variacao = fetch_market_data(tickers_cambio)
        
usd = mapa_precos.get('BRL=X', 5.50)
cad = mapa_precos.get('CADBRL=X', 4.00)
eur = mapa_precos.get('EURBRL=X', 6.00)
prov_por_ticker = {}
if not df_proventos_bruto.empty:
    for _, r in df_proventos_bruto.iterrows():
        t_prov_raw = str(r['ticker']).strip().upper()
        t_prov = normalize_ticker(t_prov_raw) # <--- APLICA PADRONIZAÇÃO

        m_prov = str(r.get('moeda', 'BRL')).strip().upper()
        if m_prov in ['NAN', 'NONE', '']: m_prov = 'BRL'
        val_prov = r['valor'] if pd.notna(r['valor']) else 0.0

        fator_prov = 1.0
        if m_prov == 'USD': fator_prov = usd
        elif m_prov == 'CAD': fator_prov = cad
        elif m_prov == 'EUR': fator_prov = eur
        
        prov_por_ticker[t_prov] = prov_por_ticker.get(t_prov, 0.0) + (val_prov * fator_prov)



# ==============================================================================
# 8. CONSOLIDAÇÃO DA VISÃO ATUAL (Recuperando df_view)
# ==============================================================================
df_view = pd.DataFrame()      # Inicializa vazio para evitar o erro
df_detalhes = pd.DataFrame()  # Pré-inicializa para uso em tab1 e tab2
df_kpi = pd.DataFrame()       # Pré-inicializa para uso em tab1 e tab2
total_valor = 0.0              # Pré-inicializa para uso em tab1 e tab2
df_grafico = pd.DataFrame()   # Pré-inicializa para uso em tab2

if not df_bruto.empty:
    # Recupera posição de custódia (Qtd)
    df_posicao, _ = calcular_carteira_fechada(df_bruto)
    
    if 'lista_tickers_final' not in locals(): 
        lista_tickers_final = df_posicao['Ticker'].unique().tolist()
    
    lista_final = []
    
    # Preparação de auxiliares de venda e proventos
    vendas_por_ticker = {}
    for _, row in df_bruto.iterrows():
        if 'venda' in str(row['tipo']).lower():
            t_v = str(row['ticker']).strip().upper()
            val_v = row['quantidade'] * row['preco']
            vendas_por_ticker[t_v] = vendas_por_ticker.get(t_v, 0.0) + val_v

    # Loop Principal de Precificação Atual
    for _, row in df_posicao.iterrows():
        t = row['Ticker']
        if t not in lista_tickers_final: continue
        
        m = row['Moeda']
        qtd = row['Qtd']
        pm = row['PM_Origem']
        
        # Recupera Preço Atual (Yahoo ou PM se não tiver)
        preco_atual = mapa_precos.get(t, 0.0)
        
        # Regras de precificação para RF ou Ativos sem cotação
        if preco_atual <= 0 or 'TESOURO' in t or 'CDB' in t:
            preco_atual = pm
        
        # Câmbio para conversão
        fator_conversao = 1.0
        if m == 'USD': fator_conversao = usd
        elif m == 'EUR': fator_conversao = eur
        elif m == 'CAD': fator_conversao = cad
        
        # Cálculos Financeiros
        valor_hoje_brl = qtd * preco_atual * fator_conversao
        custo_hoje_brl = qtd * pm * fator_conversao
        lucro_aberto_brl = valor_hoje_brl - custo_hoje_brl
        
        prov_val = prov_por_ticker.get(t, 0.0)
        
        vol_vendas = vendas_por_ticker.get(t, 0.0)
        lucro_realizado_brl = row['Lucro_Realizado_Nativo'] * fator_conversao
        
        # Rentabilidade Simples (%) - DECIMAL
        rent_pct = ((preco_atual - pm) / pm) if pm > 0 else 0.0
        
        status_ativo = "🟢 Carteira" if qtd > 0 else "🏁 Encerrado"
        
        lista_final.append({
            'Ticker': t, 
            'Status': status_ativo, 
            'Setor': row['Setor'],
            'Qtd': qtd, 
            'Moeda': m, 
            'Preço Atual': preco_atual,
            'PM Compra': pm, 
            'Valor Hoje (R$)': valor_hoje_brl,
            'Volume Vendas (R$)': vol_vendas * fator_conversao, 
            'Lucro Realiz. (R$)': lucro_realizado_brl,
            'Lucro Aberto (R$)': lucro_aberto_brl, 
            'Proventos (R$)': prov_val,
            'Rent. (%)': rent_pct
        })
        
    df_view = pd.DataFrame(lista_final)

    # -----------------------------------------------------------------------
    # PRÉ-CÁLCULO: df_detalhes com todos os campos necessários
    # Disponível tanto em tab1 (Composição) quanto em tab2 (Renda Variável)
    # -----------------------------------------------------------------------
    if not df_view.empty:
        _setores_rv = ['Ações Brasil', 'Ações Internacional', 'ETF', 'FIIs',
                       'Cripto', 'Commodities', 'REITs']
        df_detalhes = df_view[df_view['Setor'].isin(_setores_rv)].copy()
        if not df_detalhes.empty:
            _fx_map = {"USD": usd, "CAD": cad, "EUR": eur, "BRL": 1}
            mapa_var_local = mapa_variacao
            for col in ['PM Compra', 'Preço Atual', 'Qtd']:
                df_detalhes[col] = pd.to_numeric(df_detalhes[col], errors='coerce').fillna(0)
            df_detalhes['FX'] = df_detalhes['Moeda'].map(_fx_map).fillna(1)
            df_detalhes['Valor Atual BRL'] = df_detalhes['Qtd'] * df_detalhes['Preço Atual'] * df_detalhes['FX']
            df_detalhes['Custo BRL'] = df_detalhes['Qtd'] * df_detalhes['PM Compra'] * df_detalhes['FX']

            def calc_daily_profit(row):
                tkr = row['Ticker']
                moeda = row['Moeda']
                qtd = row['Qtd']
                price_today = row['Preço Atual']
                fx_today = row['FX']
                var_asset = mapa_var_local.get(tkr, 0.0)
                price_yesterday = price_today - var_asset
                fx_ticker_map = {'USD': 'BRL=X', 'CAD': 'CADBRL=X', 'EUR': 'EURBRL=X'}
                fx_ticker = fx_ticker_map.get(moeda)
                var_fx = 0.0
                if fx_ticker:
                    var_fx = mapa_var_local.get(fx_ticker, 0.0)
                fx_yesterday = fx_today - var_fx
                val_today_brl = qtd * price_today * fx_today
                val_yesterday_brl = qtd * price_yesterday * fx_yesterday
                return val_today_brl - val_yesterday_brl

            df_detalhes['Lucro Diário (R$)'] = df_detalhes.apply(calc_daily_profit, axis=1)
            df_detalhes['Lucro Não Realizado (BRL)'] = df_detalhes['Valor Atual BRL'] - df_detalhes['Custo BRL']
            if 'Lucro Realiz. (R$)' in df_detalhes.columns:
                df_detalhes['Lucro Realizado (BRL)'] = df_detalhes['Lucro Realiz. (R$)']
            else:
                df_detalhes['Lucro Realizado (BRL)'] = 0
            df_kpi = df_detalhes[df_detalhes['Qtd'] > 0]
            total_valor = df_kpi['Valor Atual BRL'].sum()
            df_detalhes['Resultado Total (R$)'] = (
                df_detalhes['Lucro Não Realizado (BRL)'].fillna(0) +
                df_detalhes['Lucro Realizado (BRL)'].fillna(0) +
                df_detalhes['Proventos (R$)'].fillna(0)
            )

            def calcular_rentabilidade_total(row):
                custo = row['Custo BRL']
                if custo <= 0:
                    custo = row['Volume Vendas (R$)'] - row['Lucro Realizado (BRL)']
                if custo > 0:
                    return (row['Resultado Total (R$)'] / custo)
                return 0.0

            df_detalhes['Rent. BRL (%)'] = df_detalhes.apply(calcular_rentabilidade_total, axis=1)

    with tab1:
            st.markdown('<div class="tab-header">💎 Visão do Gestor (Portfólio Global)</div>', unsafe_allow_html=True)

            lista_global_graficos = []

            if not df_view.empty:
                df_rv_g = df_view[df_view['Valor Hoje (R$)'] > 1.0].copy()
                commodities_list = ['IAU', 'SIVR', 'SLV', 'GLD', 'DBC', 'SIVIR']
                cripto_list = ['BTC', 'ETH', 'SOL', 'USDT', 'USDC', 'BTC-USD', 'HBAR']
                
                df_rv_g.loc[df_rv_g['Ticker'].isin(commodities_list), 'Setor'] = 'Commodities'
                df_rv_g.loc[df_rv_g['Ticker'].isin(cripto_list), 'Setor'] = 'Cripto'
                
                lista_global_graficos.append(df_rv_g[['Ticker', 'Setor', 'Moeda', 'Valor Hoje (R$)', 'Rent. (%)']])

            if 'df_rf_filtrado' in locals() and not df_rf_filtrado.empty:
                df_rf_g = df_rf_filtrado[df_rf_filtrado['Status'] == 'Ativo'].copy()
                
                if not df_rf_g.empty:
                    df_rf_g['Ticker'] = df_rf_g['Ativo']
                    
                    # Garantir que temos a coluna Moeda
                    if 'Moeda' not in df_rf_g.columns:
                        df_rf_g['Moeda'] = 'BRL'
                    
                    # Converte valores em USD para BRL para o gráfico
                    # Usa 'usd' (definido anteriormente no script, ~5.80)
                    mask_usd = df_rf_g['Moeda'] == 'USD'
                    
                    # Cria coluna valor ajustado
                    df_rf_g['Valor Hoje (R$)'] = df_rf_g['Atual']
                    if mask_usd.any():
                        df_rf_g.loc[mask_usd, 'Valor Hoje (R$)'] = df_rf_g.loc[mask_usd, 'Atual'] * usd
                    
                    df_rf_g['Rent. (%)'] = df_rf_g['Rent. %'] / 100
                    
                    mask_cx = df_rf_g['Ativo'].str.contains('Caixa|Cash|Disponivel|Saldo', case=False, na=False)
                    df_rf_g.loc[mask_cx, 'Setor'] = 'Caixa/Liquidez'
                    df_rf_g.loc[~mask_cx, 'Setor'] = 'Renda Fixa'
                    
                    lista_global_graficos.append(df_rf_g[['Ticker', 'Setor', 'Moeda', 'Valor Hoje (R$)', 'Rent. (%)']])

            if lista_global_graficos:
                df_grafico = pd.concat(lista_global_graficos, ignore_index=True)
            else:
                df_grafico = pd.DataFrame()

            if not df_grafico.empty:
                total_view = df_grafico['Valor Hoje (R$)'].sum()
                
                k1, k2, k3 = st.columns(3)
                ativo_top = df_grafico.loc[df_grafico['Rent. (%)'].idxmax()]
                ativo_low = df_grafico.loc[df_grafico['Rent. (%)'].idxmin()]
                
                with k1:
                    st.markdown(render_metric_card(
                        label="Maior Rentabilidade", 
                        value=ativo_top['Ticker'], 
                        delta=f"{ativo_top['Rent. (%)']:.1%}", 
                        delta_positive=ativo_top['Rent. (%)'] >= 0,
                        icon="🚀"
                    ), unsafe_allow_html=True)
                with k2:
                    st.markdown(render_metric_card(
                        label="Menor Rentabilidade", 
                        value=ativo_low['Ticker'], 
                        delta=f"{ativo_low['Rent. (%)']:.1%}", 
                        delta_positive=ativo_low['Rent. (%)'] >= 0,
                        icon="🐢"
                    ), unsafe_allow_html=True)
                with k3:
                    st.markdown(render_metric_card(
                        label="Patrimônio Gráfico", 
                        value=f"R$ {total_view:,.2f}", 
                        icon="📊"
                    ), unsafe_allow_html=True)

                st.markdown('<div class="chart-header">🗺️ Mapa de Calor Global — Risco & Retorno</div>', unsafe_allow_html=True)
                st.markdown('<div class="chart-caption">Tamanho = valor investido · Cor = rentabilidade acumulada</div>', unsafe_allow_html=True)
                max_rent = df_grafico['Rent. (%)'].max()
                min_rent = df_grafico['Rent. (%)'].min()
                scale_range = max(abs(max_rent), abs(min_rent), 0.15)

                fig_tree = px.treemap(
                    df_grafico, 
                    path=[px.Constant("Portfólio Global"), 'Setor', 'Ticker'], 
                    values='Valor Hoje (R$)',
                    color='Rent. (%)', 
                    color_continuous_scale='RdYlGn', 
                    range_color=[-scale_range, scale_range],
                    hover_data={'Valor Hoje (R$)':':.2f', 'Rent. (%)':':.2%'}
                )
                fig_tree.update_layout(margin=dict(t=30, l=0, r=0, b=0), height=500, paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
                st.plotly_chart(fig_tree, use_container_width=True)

                col_esq, col_dir = st.columns([1, 1])
                with col_esq:
                    st.markdown('<div class="tab-header-sm">◈ Distribuição Estratégica</div>', unsafe_allow_html=True)
                    
                    def classificar_camadas(row):
                        macro = 'Renda Variável'
                        if row['Setor'] in ['Renda Fixa', 'Renda Fixa USD', 'Caixa/Liquidez']:
                            macro = 'Renda Fixa'

                        sub = row['Setor']
                        tkr = str(row['Ticker']).upper()

                        # 0a. Renda Fixa USD (T-Bills e ETFs de renda fixa em dólar)
                        renda_fixa_usd_list = ['SHV', 'BIL']
                        if any(x == tkr or tkr.startswith(x) for x in renda_fixa_usd_list) or sub == 'Renda Fixa USD':
                            macro = 'Renda Fixa'
                            sub = 'Renda Fixa USD'

                        # 0b. Reclassificação Prioritária de ETFs de Renda Variável
                        # Lista explícita de ETFs que devem ser agrupados, independente do setor original
                        elif any(x in tkr for x in ['VWRA', 'WRLD', 'ACWI', 'VT', 'URTH', 'SPY', 'QQQ', 'IVV', 'VOO', 'VNQ', 'BND', 'AGG']) or sub in ['ETF USA', 'ETF']:
                             sub = 'ETFs'

                        elif macro == 'Renda Fixa':
                            if 'CAIXA' in tkr or 'SALDO' in tkr or 'CASH' in tkr or row['Setor'] == 'Caixa/Liquidez': 
                                sub = 'Caixa'
                            elif 'CDB' in tkr: sub = 'CDBs'
                            elif 'LCI' in tkr or 'LCA' in tkr: sub = 'LCI/LCA'
                            elif 'DEBENTURE' in tkr: sub = 'Debêntures'
                            else: 
                                sub = 'Tesouro Direto'
                            
                        elif sub == 'Ações Internacional':
                            # VWRA removed from here as it is caught above
                            ativos_mundo = ['ASML', 'DPM', 'TSM', 'BABA', 'JD', 'TCEHY'] 
                            
                            if any(x in tkr for x in ativos_mundo) or '.TO' in tkr: 
                                sub = 'Ações Mundo'
                            else:
                                sub = 'Ações EUA' 
                        
                        return pd.Series([macro, sub])

                    df_grafico[['Layer1', 'Layer2']] = df_grafico.apply(classificar_camadas, axis=1)
                    

                    # --- SUNBURST COM CORES HIERÁRQUICAS E GRADIENTE (MANUAL BUILD) ---
                    # Para ter controle total da cor da camada 3 (Ticker) sendo um gradiente da camada 2 (Setor),
                    # precisamos construir os arrays de labels, parents, ids e colors manualmente.

                    import plotly.graph_objects as go
                    import matplotlib.colors as mcolors
                    import colorsys

                    # 1. Definição do Mapa de Cores Base (Nível 2)
                    color_map_base = {
                        # --- RENDA FIXA (Theme: Ocean & Stability) ---
                        'Renda Fixa': '#0f766e',       # Teal-700 (Root)
                        'Tesouro Direto': '#10b981',   # Emerald-500
                        'CDBs': '#0ea5e9',             # Sky-500
                        'LCI/LCA': '#06b6d4',          # Cyan-500
                        'Debêntures': '#3b82f6',       # Blue-500
                        'Renda Fixa USD': '#1d4ed8',   # Blue-700 (USD Fixed Income)
                        'Caixa': '#64748b',            # Slate-500
                        'Caixa/Liquidez': '#94a3b8',   # Slate-400
                        
                        # --- RENDA VARIÁVEL (Theme: Galaxy & Future) ---
                        'Renda Variável': '#6d28d9', # Violet-700 (Root)
                        'ETFs': '#6366f1',           # Indigo-500 (Primary for ETFs)
                        'ETF': '#6366f1',            # Indigo-500 (Legacy)
                        'Ações': '#ec4899',          # Pink-500 (Brasil Default)
                        'Ações Brasil': '#db2777',   # Pink-600
                        'Ações EUA': '#8b5cf6',      # Violet-500
                        'Ações Mundo': '#d946ef',    # Fuchsia-500
                        'FII': '#f97316',            # Orange-500
                        'FIIs': '#f97316',           # Orange-500
                        'BDR': '#a855f7',            # Purple-500
                        'Cripto': '#eab308',         # Yellow-500 (Gold)
                        'Commodities': '#84cc16'     # Lime-500
                    }

                    # Helper: Gerador de Gradiente
                    def generate_gradient_colors(base_hex, n_steps):
                        try:
                            rgb = mcolors.to_rgb(base_hex)
                            h, l, s = colorsys.rgb_to_hls(*rgb)
                            
                            colors_hex = []
                            # Varia a luminosidade (Lightness) de 0.3 a 0.8 (ou range seguro ao redor do base)
                            # Se for muitos passos, estica o range.
                            
                            # Estratégia: manter o Hue e Saturation, variar Lightness
                            # Começa um pouco mais escuro e vai clareando
                            
                            start_l = max(0.2, l - 0.2)
                            end_l = min(0.9, l + 0.3)
                            
                            for i in range(n_steps):
                                # Se só tem 1, usa o base
                                if n_steps <= 1:
                                    li = l
                                else:
                                    li = start_l + (i * (end_l - start_l) / (n_steps - 1))
                                
                                r, g, b = colorsys.hls_to_rgb(h, li, s)
                                colors_hex.append(mcolors.to_hex((r, g, b)))
                                
                            return colors_hex
                        except:
                            return [base_hex] * n_steps

                    # 2. Construção dos Arrays para o Plotly
                    ids = []
                    labels = []
                    parents = []
                    values = []
                    marker_colors = []
                    customdata = [] # <--- NEW: Dados explícitos para garantir ID na seleção

                    # A. Nível 0 - Raízes (Macro)
                    macros = df_grafico.groupby('Layer1')['Valor Hoje (R$)'].sum().reset_index()
                    for _, row in macros.iterrows():
                        m = row['Layer1']
                        val = row['Valor Hoje (R$)']
                        ids.append(m)
                        labels.append(m)
                        parents.append("")
                        values.append(val)
                        marker_colors.append(color_map_base.get(m, '#9ca3af'))
                        customdata.append(m)

                    # B. Nível 1 - Setores (Sub)
                    # Agrupa por (Layer1, Layer2) para garantir unicidade do ID
                    setores = df_grafico.groupby(['Layer1', 'Layer2'])['Valor Hoje (R$)'].sum().reset_index()
                    
                    for _, row in setores.iterrows():
                        pai = row['Layer1']
                        filho = row['Layer2']
                        val = row['Valor Hoje (R$)']
                        
                        id_node = f"{pai} - {filho}"
                        ids.append(id_node)
                        labels.append(filho)
                        parents.append(pai)
                        values.append(val)
                        marker_colors.append(color_map_base.get(filho, '#9ca3af'))
                        customdata.append(id_node)

                    # C. Nível 2 - Tickers (Folhas)
                    # Aqui aplicamos o gradiente. Agrupamos os tickers DENTRO de cada setor.
                    
                    structure = df_grafico.groupby(['Layer1', 'Layer2'])
                    
                    for (pai, setor), group in structure:
                        # Ordena por valor para o gradiente ficar bonito (maior = mais escuro ou vice versa)
                        # Vamos ordenar decrescente
                        group_sorted = group.sort_values('Valor Hoje (R$)', ascending=False)
                        
                        tickers_list = group_sorted['Ticker'].tolist()
                        vals_list = group_sorted['Valor Hoje (R$)'].tolist()
                        
                        base_color_sector = color_map_base.get(setor, '#9ca3af')
                        gradient_palette = generate_gradient_colors(base_color_sector, len(tickers_list))
                        
                        for idx, tkr in enumerate(tickers_list):
                            id_node = f"{pai} - {setor} - {tkr}"
                            ids.append(id_node)
                            labels.append(tkr)
                            parents.append(f"{pai} - {setor}")
                            values.append(vals_list[idx])
                            marker_colors.append(gradient_palette[idx])
                            customdata.append(id_node)

                    # 3. Plotagem
                    fig_sun = go.Figure(go.Sunburst(
                        ids=ids,
                        labels=labels,
                        parents=parents,
                        values=values,
                        marker=dict(colors=marker_colors),
                        branchvalues="total",
                        hoverinfo="label+value+percent entry",
                        customdata=customdata # <--- NEW: Passando dados extras
                    ))
                    
                    fig_sun.update_layout(
                        margin=dict(t=10, l=10, r=10, b=10), 
                        height=700, 
                        paper_bgcolor='rgba(0,0,0,0)', 
                        plot_bgcolor='rgba(0,0,0,0)'
                    )
                    fig_sun.update_traces(textinfo="label+percent entry", insidetextorientation='radial') 
                    
                    # --- MASTER FILTER UI ---
                    # Interface robusta para filtrar os gráficos laterais
                    
                    # Opções de Filtro
                    opcoes_macro = sorted(df_grafico['Layer1'].unique())
                    opcoes_setor = sorted(df_grafico['Layer2'].unique())
                    
                    options_list = ["🌎 Visão Global"] + \
                                   [f"📦 Macro: {m}" for m in opcoes_macro] + \
                                   [f"🏷️ Setor: {s}" for s in opcoes_setor]
                    
                    col_filter, _ = st.columns([2, 1])
                    with col_filter:
                        selected_filter = st.selectbox("🔎 Filtrar Análise Detalhada (Gráficos Laterais):", options_list)
                    
                    # Renderiza o Sunburst (Sempre Completo para visualização/zoom)
                    st.plotly_chart(fig_sun, use_container_width=True)
                    
                    # Lógica de Filtro para Gráficos Laterais
                    df_view_charts = df_grafico.copy()
                    
                    if selected_filter != "🌎 Visão Global":
                        if "Macro:" in selected_filter:
                            val = selected_filter.split(": ")[1]
                            df_view_charts = df_grafico[df_grafico['Layer1'] == val]
                        elif "Setor:" in selected_filter:
                            val = selected_filter.split(": ")[1]
                            df_view_charts = df_grafico[df_grafico['Layer2'] == val]

                with col_dir:
                    st.markdown('<div class="tab-header-sm">💱 Exposição Cambial</div>', unsafe_allow_html=True)
                    
                    # Gráfico 2: Moeda (Usa df_view_charts filtrado)
                    if not df_view_charts.empty:
                        fig_moeda = px.pie(
                            df_view_charts, 
                            values='Valor Hoje (R$)', 
                            names='Moeda', 
                            hole=0.5, 
                            color_discrete_sequence=['#2E7D32', '#1565C0', '#F9A825', '#757575']
                        )
                    else:
                        fig_moeda = go.Figure()
                        
                    fig_moeda.update_layout(margin=dict(t=10, l=10, r=10, b=10), height=300, showlegend=True, paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
                    st.plotly_chart(fig_moeda, use_container_width=True)
                    
                    st.markdown('<div class="tab-header-sm" style="margin-top:18px;">🏦 Custódia (Brasil vs Exterior)</div>', unsafe_allow_html=True)
                    # Garante coluna Local no filtered
                    df_view_charts['Local'] = df_view_charts['Moeda'].apply(lambda x: 'Exterior' if x != 'BRL' else 'Brasil')
                    
                    # Gráfico 3: Local (Usa df_view_charts filtrado)
                    if not df_view_charts.empty:
                        fig_local = px.pie(
                            df_view_charts, 
                            values='Valor Hoje (R$)', 
                            names='Local', 
                            hole=0.5, 
                            color_discrete_sequence=px.colors.qualitative.Safe
                        )
                    else:
                        fig_local = go.Figure()
                        
                    fig_local.update_layout(margin=dict(t=10, l=10, r=10, b=10), height=300, showlegend=True, paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
                    st.plotly_chart(fig_local, use_container_width=True)

                st.markdown('<div class="chart-header">🧬 Rentabilidade Total por Ativo</div>', unsafe_allow_html=True)
                st.markdown('<div class="chart-caption">Barra sólida = valorização não realizada  ·  Barra clara = lucro realizado + proventos</div>', unsafe_allow_html=True)

                if not df_detalhes.empty:
                    df_chart = df_detalhes.sort_values('Rent. BRL (%)', ascending=True).copy()

                    df_chart['Resultado_Bolso_Abs'] = df_chart['Proventos (R$)'].fillna(0) + df_chart['Lucro Realizado (BRL)'].fillna(0)
                    df_chart['Resultado_NaoRealizado_Abs'] = df_chart['Resultado Total (R$)'] - df_chart['Resultado_Bolso_Abs']

                    df_chart['Custo_Estimado'] = df_chart.apply(
                        lambda x: x['Resultado Total (R$)'] / (x['Rent. BRL (%)']) if x['Rent. BRL (%)'] != 0 else 0,
                        axis=1
                    )
                    df_chart['Pct_Nao_Realizado'] = df_chart.apply(
                        lambda x: (x['Resultado_NaoRealizado_Abs'] / x['Custo_Estimado']) if x['Custo_Estimado'] != 0 else 0,
                        axis=1
                    )
                    df_chart['Pct_Bolso'] = df_chart.apply(
                        lambda x: (x['Resultado_Bolso_Abs'] / x['Custo_Estimado']) if x['Custo_Estimado'] != 0 else 0,
                        axis=1
                    )

                    cores_base_comp = [
                        '#34d399' if x > 0 else '#f87171' if x < 0 else '#94a3b8'
                        for x in df_chart['Rent. BRL (%)']
                    ]
                    altura_grafico_comp = max(600, len(df_chart) * 25)

                    fig_perf_comp = go.Figure()
                    fig_perf_comp.add_trace(go.Bar(
                        y=df_chart['Ticker'],
                        x=df_chart['Pct_Nao_Realizado'],
                        name='Não Realizado (Valorização)',
                        orientation='h',
                        marker_color=cores_base_comp,
                        marker_opacity=1.0,
                        customdata=np.stack((
                            df_chart['Resultado_NaoRealizado_Abs'],
                            df_chart['Rent. BRL (%)']
                        ), axis=-1),
                        hovertemplate="<b>Não Realizado:</b> %{x:.1%}<br>R$ %{customdata[0]:.2f}<extra></extra>"
                    ))
                    fig_perf_comp.add_trace(go.Bar(
                        y=df_chart['Ticker'],
                        x=df_chart['Pct_Bolso'],
                        name='Realizado + Proventos',
                        orientation='h',
                        marker_color=cores_base_comp,
                        marker_opacity=0.3,
                        text=df_chart['Rent. BRL (%)'],
                        texttemplate='%{text:.1%}',
                        textposition='outside',
                        customdata=np.stack((
                            df_chart['Resultado_Bolso_Abs'],
                            df_chart['Proventos (R$)'],
                            df_chart['Lucro Realizado (BRL)']
                        ), axis=-1),
                        hovertemplate=(
                            "<b>Bolso (Realizado + Prov):</b> %{x:.1%}<br>"
                            "Total Bolso: R$ %{customdata[0]:.2f}<br>"
                            "<i>(Div: %{customdata[1]:.2f} + Realiz: %{customdata[2]:.2f})</i><extra></extra>"
                        )
                    ))
                    fig_perf_comp.update_layout(
                        barmode='relative',
                        height=altura_grafico_comp,
                        xaxis_title="Rentabilidade Total",
                        yaxis_title=None,
                        showlegend=True,
                        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
                        margin=dict(l=0, r=40, t=30, b=30),
                        yaxis=dict(type='category'),
                        paper_bgcolor='rgba(0,0,0,0)',
                        plot_bgcolor='rgba(0,0,0,0)'
                    )
                    fig_perf_comp.add_vline(x=0, line_width=1, line_color="gray", line_dash="dot")
                    st.plotly_chart(fig_perf_comp, use_container_width=True)
                else:
                    st.markdown('<div class="glass-alert glass-info">ℹ️ Nenhum ativo de Renda Variável encontrado para exibir o gráfico.</div>', unsafe_allow_html=True)


                st.markdown('<div class="chart-header">🎯 Risco × Retorno</div>', unsafe_allow_html=True)
                st.markdown('<div class="chart-caption">Tamanho da bolha = volume financeiro · cada ponto = um ativo</div>', unsafe_allow_html=True)
                fig_scat = px.scatter(
                    df_grafico,
                    x='Valor Hoje (R$)',
                    y='Rent. (%)',
                    size='Valor Hoje (R$)',
                    color='Setor',
                    hover_name='Ticker',
                    size_max=40,
                    color_discrete_sequence=px.colors.qualitative.Vivid,
                )
                fig_scat.add_hline(y=0, line_dash="dot", line_color="rgba(148,163,184,0.35)", line_width=1)
                fig_scat.update_layout(
                    height=450, showlegend=True,
                    legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0, font=dict(size=11)),
                    xaxis_title="Volume Financeiro (R$)", yaxis_title="Rentabilidade Acumulada",
                    paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)',
                    xaxis=dict(gridcolor='rgba(255,255,255,0.04)'),
                    yaxis=dict(gridcolor='rgba(255,255,255,0.04)', tickformat='.0%'),
                )
                st.plotly_chart(fig_scat, use_container_width=True)

                with st.expander("🐋 Análise de Concentração (Pareto Global)", expanded=True):
                    df_pareto = df_grafico.sort_values('Valor Hoje (R$)', ascending=False).copy()
                    total_pareto = df_pareto['Valor Hoje (R$)'].sum()
                    df_pareto['Acumulado (%)'] = (df_pareto['Valor Hoje (R$)'].cumsum() / total_pareto) * 100
                    
                    df_pareto_view = df_pareto.head(25)
                    
                    fig_pareto = go.Figure()
                    fig_pareto.add_trace(go.Bar(
                        x=df_pareto_view['Ticker'], y=df_pareto_view['Valor Hoje (R$)'],
                        name='Valor (R$)', marker_color='#6366f1',
                        marker_line_width=0,
                    ))
                    fig_pareto.add_trace(go.Scatter(
                        x=df_pareto_view['Ticker'], y=df_pareto_view['Acumulado (%)'],
                        name='Acumulado %', yaxis='y2',
                        mode='lines+markers', line=dict(color='#f5deb3', width=2),
                        marker=dict(size=5, color='#f5deb3'),
                    ))
                    fig_pareto.update_layout(
                        title=dict(text="Concentração de Ativos (Top 25)", font=dict(size=13, color='#94a3b8')),
                        yaxis=dict(title="Valor Investido (R$)", gridcolor='rgba(255,255,255,0.04)'),
                        yaxis2=dict(title="Acumulado (%)", overlaying='y', side='right', range=[0, 110], showgrid=False),
                        height=480, legend=dict(x=0.5, y=1.08, orientation='h', font=dict(size=11)),
                        paper_bgcolor='rgba(0,0,0,0)',
                        plot_bgcolor='rgba(0,0,0,0)',
                        xaxis=dict(gridcolor='rgba(255,255,255,0.04)'),
                    )
                    st.plotly_chart(fig_pareto, use_container_width=True)

                st.markdown('<div class="chart-header">🔬 Composição Look-Through · ETFs</div>', unsafe_allow_html=True)
                st.markdown('<div class="chart-caption">Abre automaticamente os ETFs da carteira e calcula a exposição ponderada em cada ativo subjacente</div>', unsafe_allow_html=True)

                # ── Look-Through: botão de cálculo ────────────────────────
                _lt_etfs_eligiveis = []
                if not df_view.empty:
                    from core.etf_holdings import _LOOKTHROUGH_SECTORS, _ETF_CONFIG, load_from_gsheets, compute_from_stored, compute_lookthrough, save_to_gsheets
                    _lt_mask = (
                        df_view['Setor'].isin(_LOOKTHROUGH_SECTORS) &
                        (df_view['Qtd'] > 0)
                    )
                    _lt_etfs_eligiveis = df_view.loc[_lt_mask, 'Ticker'].tolist()

                if not _lt_etfs_eligiveis:
                    st.markdown('<div class="glass-alert glass-info">ℹ️ Nenhum ETF elegível para look-through encontrado na carteira.</div>', unsafe_allow_html=True)
                else:
                    # Always load from GSheets fresh (no cache)
                    try:
                        _df_stored, _stored_at = load_from_gsheets()
                    except Exception as _gs_err:
                        st.error(f"Erro ao ler composição da planilha: {_gs_err}")
                        _df_stored, _stored_at = None, ''
                    _has_stored = _df_stored is not None and not _df_stored.empty

                    # Compute with live prices every render (fast — no network)
                    _lt_per_etf   = {}
                    _lt_combined  = pd.DataFrame()
                    _lt_rv        = pd.DataFrame()
                    _lt_err_msg   = ''
                    if _has_stored:
                        try:
                            _lt_per_etf, _lt_combined, _lt_rv = compute_from_stored(_df_stored, df_view, usd)
                        except Exception as _ce:
                            _lt_err_msg = str(_ce)

                    _lt_supported   = [t for t in _lt_etfs_eligiveis if t.upper() in _ETF_CONFIG]
                    _lt_unsupported = [t for t in _lt_etfs_eligiveis if t.upper() not in _ETF_CONFIG]

                    _pills_html = '<div class="lt-pills">'
                    for _t in _lt_supported:
                        _pills_html += f'<span class="lt-pill lt-pill-ok">✓ {_t}</span>'
                    for _t in _lt_unsupported:
                        _pills_html += f'<span class="lt-pill lt-pill-warn">~ {_t}</span>'
                    _pills_html += '</div>'
                    st.markdown(_pills_html, unsafe_allow_html=True)

                    # Button only triggers fresh internet fetch + save to GSheets
                    if st.button("🔄 Atualizar Composição", type="secondary", key="btn_etf_lookthrough"):
                        with st.spinner("Buscando composição dos ETFs... (pode levar até 30 s)"):
                            try:
                                _new_pe, _new_lt, _new_rv = compute_lookthrough(df_view, mapa_precos, usd)
                                _saved_ok = save_to_gsheets(_new_pe)
                                _now_str  = datetime.now().strftime('%d/%m/%Y %H:%M')
                                st.session_state['etf_lt_saved_at'] = (
                                    f"atualizado {_now_str}" + (" · salvo ✓" if _saved_ok else " · erro ao salvar")
                                )
                                st.rerun()
                            except Exception as _lt_err:
                                st.error(f"Erro ao atualizar: {_lt_err}")

                    # Caption
                    _saved_label = st.session_state.get('etf_lt_saved_at', '')
                    if _saved_label:
                        st.caption(f"🔄 {_saved_label}")
                    elif _stored_at:
                        st.caption(f"📄 Composição da planilha · {_stored_at} · valores recalculados com preços atuais")

                    # ── Resultados: sempre mostra as abas se tem dados no GSheets ──
                    if _has_stored:
                        if _lt_err_msg:
                            st.warning(f"Erro ao calcular valores: {_lt_err_msg}")

                        lt1, lt2, lt3 = st.tabs(["📊 Por ETF", "🌐 Visão Combinada", "🏦 RV Completa"])

                        with lt1:
                            if not _lt_per_etf:
                                st.caption("Nenhum dado de composição para exibir. Clique em Atualizar para buscar da internet.")
                            for _etf_t, _etf_data in _lt_per_etf.items():
                                _status   = _etf_data['status']
                                _source   = _etf_data.get('source', 'none')
                                _val_usd  = _etf_data.get('value_usd', 0.0)
                                _val_brl  = _val_usd * usd
                                _holdings = _etf_data.get('holdings')

                                _src_badge = (
                                    '⚡ ao vivo' if _source == 'live'
                                    else '📡 yahoo' if _source == 'yahoo'
                                    else '📋 embutido Q1-2025' if _source == 'embedded'
                                    else ''
                                )

                                if _status == 'not_supported':
                                    st.info(f"**{_etf_t}** · US$ {_val_usd:,.0f} · provider não configurado")
                                    continue
                                if _status in ('empty', 'error'):
                                    st.warning(f"**{_etf_t}** · holdings não disponíveis")
                                    continue

                                with st.expander(
                                    f"**{_etf_t}** · US$ {_val_usd:,.0f}  ·  R$ {_val_brl:,.0f}  ·  {_src_badge}",
                                    expanded=True,
                                ):
                                    if _holdings is not None and not _holdings.empty:
                                        _named = _holdings[~_holdings['ticker'].str.startswith('OUTROS.')].copy()
                                        _tail  = _holdings[_holdings['ticker'].str.startswith('OUTROS.')]
                                        _covered_pct = _etf_data.get('covered_pct', _named['weight_pct'].sum())
                                        _tail_usd    = _tail['value_usd'].sum() if not _tail.empty else 0.0

                                        _disp = _named[['ticker', 'name', 'weight_pct', 'value_usd', 'value_brl']].copy()
                                        _disp.columns = ['Ticker', 'Nome', 'Peso (%)', 'Valor (USD)', 'Valor (R$)']
                                        st.caption(
                                            f"{len(_named)} holdings nominados · {_covered_pct:.1f}% do fundo"
                                            + (f" · US$ {_tail_usd:,.0f} em ativos não detalhados ({100-_covered_pct:.1f}%)" if _tail_usd > 0 else "")
                                        )
                                        st.dataframe(
                                            _disp.style.format({
                                                'Peso (%)':    '{:.2f}%',
                                                'Valor (USD)': 'US$ {:,.0f}',
                                                'Valor (R$)':  'R$ {:,.0f}',
                                            }),
                                            use_container_width=True,
                                            height=min(len(_disp) * 35 + 40, 700),
                                        )

                        with lt2:
                            if not _lt_combined.empty:
                                _total_usd_lt = _lt_combined['value_usd'].sum()
                                _total_brl_lt = _total_usd_lt * usd
                                _lt_tail_usd  = _lt_combined[_lt_combined['ticker'].str.startswith('OUTROS.')]['value_usd'].sum()
                                _lt_named_pct = 100 * (1 - _lt_tail_usd / _total_usd_lt) if _total_usd_lt > 0 else 100
                                st.markdown(
                                    f"**Total look-through (ETFs):** US$ {_total_usd_lt:,.0f}  ·  R$ {_total_brl_lt:,.0f}"
                                    + (f"  ·  _{_lt_named_pct:.0f}% detalhado_" if _lt_tail_usd > 0 else "")
                                )

                                # Exclude tail buckets from pie — they'd dominate and aren't real assets
                                _pie_df = _lt_combined[~_lt_combined['ticker'].str.startswith('OUTROS.')].head(20).copy()
                                fig_lt = px.pie(
                                    _pie_df,
                                    values='value_usd',
                                    names='ticker',
                                    hole=0.45,
                                    color_discrete_sequence=px.colors.qualitative.Vivid,
                                    title='Top 20 · por valor (USD)',
                                )
                                fig_lt.update_traces(textinfo='percent+label', textfont_size=11)
                                fig_lt.update_layout(
                                    margin=dict(t=40, l=10, r=10, b=10),
                                    height=460,
                                    paper_bgcolor='rgba(0,0,0,0)',
                                    plot_bgcolor='rgba(0,0,0,0)',
                                    showlegend=False,
                                )
                                st.plotly_chart(fig_lt, use_container_width=True)

                                # Table shows named holdings only (tail accounted for in total above)
                                _lt_named_df = _lt_combined[~_lt_combined['ticker'].str.startswith('OUTROS.')]
                                _tbl = _lt_named_df[['ticker', 'name', 'pct', 'value_usd', 'value_brl', 'via']].copy()
                                _tbl.columns = ['Ticker', 'Nome', 'Peso (%)', 'Valor (USD)', 'Valor (R$)', 'Via']
                                st.dataframe(
                                    _tbl.style.format({
                                        'Peso (%)':    '{:.2f}%',
                                        'Valor (USD)': 'US$ {:,.0f}',
                                        'Valor (R$)':  'R$ {:,.0f}',
                                    }),
                                    use_container_width=True,
                                    height=min(len(_tbl) * 35 + 40, 900),
                                )
                            else:
                                st.info("Nenhum dado de look-through disponível.")

                        with lt3:
                            if not _lt_rv.empty:
                                _total_rv_usd  = _lt_rv['value_usd'].sum()
                                _total_rv_brl  = _total_rv_usd * usd
                                # Named assets only (exclude tail buckets from counts/charts)
                                _rv_named = _lt_rv[~_lt_rv['ticker'].str.startswith('OUTROS.')].copy()
                                _rv_tail  = _lt_rv[_lt_rv['ticker'].str.startswith('OUTROS.')]
                                _rv_tail_usd = _rv_tail['value_usd'].sum()
                                _n_direto  = (_rv_named['direct_usd'] > 0).sum()
                                _n_via_etf = (_rv_named['etf_usd'] > 0).sum()
                                _n_ambos   = ((_rv_named['direct_usd'] > 0) & (_rv_named['etf_usd'] > 0)).sum()

                                _c1rv, _c2rv, _c3rv = st.columns(3)
                                _c1rv.metric("Total RV Completa", f"R$ {_total_rv_brl:,.0f}")
                                _c2rv.metric("Ativos nominados", str(len(_rv_named)))
                                _c3rv.metric("Direta + via ETF", str(_n_ambos))
                                st.markdown(
                                    '<div class="chart-caption">Posições diretas (ações, FIIs, cripto…) '
                                    'somadas com a exposição via ETFs — sem dupla contagem dos próprios ETFs.</div>',
                                    unsafe_allow_html=True,
                                )
                                if _rv_tail_usd > 0:
                                    st.caption(f"⚠️ US$ {_rv_tail_usd:,.0f} (R$ {_rv_tail_usd*usd:,.0f}) em ativos não detalhados nos ETFs — incluídos no total acima, não no gráfico.")

                                # Bar chart top 30 (named assets only)
                                _rv_top = _rv_named.head(30).copy()
                                _rv_top['cor'] = _rv_top.apply(
                                    lambda r: '#6366f1' if r['direct_usd'] > 0 and r['etf_usd'] > 0
                                    else ('#34d399' if r['direct_usd'] > 0 else '#94a3b8'),
                                    axis=1,
                                )
                                fig_rv = go.Figure()
                                fig_rv.add_trace(go.Bar(
                                    x=_rv_top['ticker'],
                                    y=_rv_top['direct_usd'],
                                    name='Direta',
                                    marker_color='#34d399',
                                    marker_line_width=0,
                                ))
                                fig_rv.add_trace(go.Bar(
                                    x=_rv_top['ticker'],
                                    y=_rv_top['etf_usd'],
                                    name='Via ETF',
                                    marker_color='#6366f1',
                                    marker_line_width=0,
                                ))
                                fig_rv.update_layout(
                                    barmode='stack',
                                    height=420,
                                    paper_bgcolor='rgba(0,0,0,0)',
                                    plot_bgcolor='rgba(0,0,0,0)',
                                    xaxis=dict(gridcolor='rgba(255,255,255,0.04)'),
                                    yaxis=dict(title='US$', gridcolor='rgba(255,255,255,0.04)'),
                                    legend=dict(orientation='h', y=1.08, x=0),
                                    margin=dict(t=40, b=40, l=0, r=0),
                                )
                                st.plotly_chart(fig_rv, use_container_width=True)

                                # Full table — named assets only (tail already noted above)
                                _tbl_rv = _rv_named[['ticker', 'name', 'pct', 'value_usd', 'value_brl', 'direct_usd', 'etf_usd', 'via']].copy()
                                _tbl_rv.columns = ['Ticker', 'Nome', 'Peso (%)', 'Total (USD)', 'Total (R$)', 'Direta (USD)', 'Via ETF (USD)', 'Fontes']
                                st.dataframe(
                                    _tbl_rv.style.format({
                                        'Peso (%)':      '{:.2f}%',
                                        'Total (USD)':   'US$ {:,.0f}',
                                        'Total (R$)':    'R$ {:,.0f}',
                                        'Direta (USD)':  'US$ {:,.0f}',
                                        'Via ETF (USD)': 'US$ {:,.0f}',
                                    }),
                                    use_container_width=True,
                                    height=min(len(_tbl_rv) * 35 + 40, 900),
                                )
                            else:
                                st.info("Nenhuma posição de RV encontrada para combinar.")
                    else:
                        st.caption("Nenhuma composição salva ainda. Clique em 🔄 Atualizar para buscar da internet.")
            else:
                st.markdown('<div class="glass-alert glass-info">ℹ️ Nenhum ativo com saldo positivo para gerar gráficos globais.</div>', unsafe_allow_html=True)
with tab2:
    st.markdown('<div class="tab-header">🌍 Renda Variável — Detalhamento</div>', unsafe_allow_html=True)
    if not df_view.empty:
        if not df_detalhes.empty:
            st.markdown("---")
            st.markdown("### 🏅 Destaques — Lucro NÃO Realizado (BRL)")
            df_rank = df_kpi.sort_values('Lucro Não Realizado (BRL)', ascending=False)
            col_top, col_bottom = st.columns(2)
            with col_top:
                st.write("**Top 5 (Aberto)**")
                st.dataframe(df_rank[['Ticker', 'Moeda', 'Lucro Não Realizado (BRL)']].head(5).style.format({'Lucro Não Realizado (BRL)': 'R$ {:,.2f}'}), use_container_width=True)
            with col_bottom:
                st.write("**Bottom 5 (Aberto)**")
                st.dataframe(df_rank[['Ticker', 'Moeda', 'Lucro Não Realizado (BRL)']].tail(5).style.format({'Lucro Não Realizado (BRL)': 'R$ {:,.2f}'}), use_container_width=True)

            st.markdown("---")

            st.markdown("### 📊 Tabela Consolidada — Ativos Atuais + Encerrados")

            tabela = df_detalhes.rename(columns={'Valor Atual BRL': 'Valor Mercado (R$)'})[[
                'Ticker', 'Setor', 'Moeda', 'Qtd', 'PM Compra', 'Preço Atual',
                'Lucro Diário (R$)',
                'Custo BRL', 'Valor Mercado (R$)', 'Volume Vendas (R$)',
                'Lucro Não Realizado (BRL)', 'Lucro Realizado (BRL)', 'Proventos (R$)',
                'Resultado Total (R$)', 'Rent. BRL (%)'
            ]].copy()

            tabela = tabela.sort_values('Valor Mercado (R$)', ascending=False)
            tabela = tabela.set_index('Ticker')  # índice → coluna fixada no scroll horizontal

            def color_diario(val):
                color = '#2E7D32' if val >= 0 else '#C62828'
                return f'color: {color}; font-weight: bold'

            st.dataframe(
                tabela.style.format({
                    'Qtd': '{:,.2f}',
                    'PM Compra': '{:,.2f}',
                    'Preço Atual': '{:,.2f}',
                    'Lucro Diário (R$)': 'R$ {:,.2f}',
                    'Custo BRL': 'R$ {:,.2f}',
                    'Valor Mercado (R$)': 'R$ {:,.2f}',
                    'Volume Vendas (R$)': 'R$ {:,.2f}',
                    'Lucro Não Realizado (BRL)': 'R$ {:,.2f}',
                    'Lucro Realizado (BRL)': 'R$ {:,.2f}',
                    'Proventos (R$)': 'R$ {:,.2f}',
                    'Resultado Total (R$)': 'R$ {:,.2f}',
                    'Rent. BRL (%)': '{:.2%}'
                })
                .map(color_diario, subset=['Lucro Diário (R$)'])
                .background_gradient(subset=['Resultado Total (R$)'], cmap='RdYlGn', vmin=-total_valor*0.1, vmax=total_valor*0.1)
                .apply(lambda x: ['font-weight: bold; background-color: #f0f2f6' if x.name == 'TOTAL 💰' else '' for i in x], axis=1),

                column_config={
                    "Rent. BRL (%)": st.column_config.NumberColumn(
                        "Rentabilidade",
                        format="%.2f %%"
                    ),
                },
                use_container_width=True,
                height=600,
                hide_index=False  # exibe o índice (Ticker) como coluna fixada
            )

            st.markdown("---")
            st.markdown("#### 🏆 Ranking de Rentabilidade (Não Realizado — Carteira Completa)")

            if not df_grafico.empty:
                df_podium = df_grafico.sort_values('Rent. (%)', ascending=True).copy()
                df_podium['Cor'] = df_podium['Rent. (%)'].apply(lambda x: '#4CAF50' if x >= 0 else '#FF5252')
                altura_dinamica = max(450, len(df_podium) * 30)
                fig_bar = px.bar(
                    df_podium,
                    x='Rent. (%)',
                    y='Ticker',
                    orientation='h',
                    text='Rent. (%)',
                    hover_data=['Valor Hoje (R$)', 'Setor']
                )
                fig_bar.update_traces(
                    marker_color=df_podium['Cor'],
                    texttemplate='%{text:.1%}',
                    textposition='outside'
                )
                fig_bar.update_layout(
                    yaxis={'categoryorder': 'total ascending'},
                    height=altura_dinamica,
                    margin=dict(r=50),
                    xaxis_title="Rentabilidade",
                    yaxis_title=None,
                    paper_bgcolor='rgba(0,0,0,0)',
                    plot_bgcolor='rgba(0,0,0,0)'
                )
                st.plotly_chart(fig_bar, use_container_width=True)
            else:
                st.markdown('<div class="glass-alert glass-info">ℹ️ Nenhum ativo encontrado para exibir o ranking.</div>', unsafe_allow_html=True)
            st.markdown("---")

            # ======================================================================
            # 🔬 DECOMPOSIÇÃO DE PREÇO MÉDIO POR LOTE
            # ======================================================================
            st.markdown("### 🔬 Decomposição de Preço Médio por Lote")
            st.caption("Selecione um ativo para ver cada aporte individual e a rentabilidade de cada lote que compõe seu preço médio.")

            tickers_rv_disponiveis = sorted(df_bruto[df_bruto['ticker'].isin(df_detalhes['Ticker'].tolist())]['ticker'].unique().tolist())

            if tickers_rv_disponiveis:
                col_sel1, col_sel2 = st.columns([2, 5])
                with col_sel1:
                    ticker_decomp = st.selectbox(
                        "Ativo para decompor:",
                        tickers_rv_disponiveis,
                        key="selectbox_decomp_pm"
                    )

                # --- Filtra lotes de compra do ativo selecionado ---
                df_lotes = df_bruto[
                    (df_bruto['ticker'] == ticker_decomp) &
                    (df_bruto['tipo'].str.lower().str.contains('compra'))
                ].copy()

                if not df_lotes.empty:
                    # Dados do ativo selecionado
                    moeda_ativo = df_lotes['moeda'].iloc[0] if 'moeda' in df_lotes.columns else 'BRL'
                    preco_atual_decomp = mapa_precos.get(ticker_decomp, 0.0)

                    # Câmbio
                    fx_decomp = 1.0
                    if moeda_ativo == 'USD': fx_decomp = usd
                    elif moeda_ativo == 'CAD': fx_decomp = cad
                    elif moeda_ativo == 'EUR': fx_decomp = eur

                    # Posição atual (para verificar PM e Qtd real)
                    df_pos_ativo = df_posicao[df_posicao['Ticker'] == ticker_decomp]
                    pm_real = df_pos_ativo['PM_Origem'].values[0] if not df_pos_ativo.empty else 0.0
                    qtd_real = df_pos_ativo['Qtd'].values[0] if not df_pos_ativo.empty else 0.0

                    # Monta tabela de lotes
                    df_lotes['data'] = pd.to_datetime(df_lotes['data'], errors='coerce')
                    df_lotes = df_lotes.sort_values('data').reset_index(drop=True)
                    df_lotes['Lote'] = range(1, len(df_lotes) + 1)
                    df_lotes['Qtd Comprada'] = pd.to_numeric(df_lotes['quantidade'], errors='coerce').fillna(0)
                    df_lotes['Preço de Compra'] = pd.to_numeric(df_lotes['preco'], errors='coerce').fillna(0)
                    df_lotes['Valor Investido'] = df_lotes['Qtd Comprada'] * df_lotes['Preço de Compra']
                    df_lotes['Preço Atual'] = preco_atual_decomp if preco_atual_decomp > 0 else pm_real
                    df_lotes['Rent. Lote (%)'] = df_lotes.apply(
                        lambda r: (df_lotes['Preço Atual'].iloc[0] / r['Preço de Compra'] - 1) if r['Preço de Compra'] > 0 else 0.0,
                        axis=1
                    )
                    df_lotes['Lucro do Lote'] = df_lotes['Qtd Comprada'] * (df_lotes['Preço Atual'] - df_lotes['Preço de Compra'])
                    df_lotes['Lucro do Lote (R$)'] = df_lotes['Lucro do Lote'] * fx_decomp
                    df_lotes['Valor Investido (R$)'] = df_lotes['Valor Investido'] * fx_decomp

                    total_investido = df_lotes['Valor Investido'].sum()
                    total_aportes = len(df_lotes)
                    qtd_total_comprada = df_lotes['Qtd Comprada'].sum()
                    rent_total_pm = (preco_atual_decomp / pm_real - 1) if pm_real > 0 and preco_atual_decomp > 0 else 0.0

                    # --- KPI Cards ---
                    k1, k2, k3, k4, k5 = st.columns(5)
                    with k1:
                        st.markdown(f"""<div class="lote-card">
                            <div class="lote-label">Preço Médio</div>
                            <div class="lote-value">{pm_real:,.2f}</div>
                            <div class="lote-sub" style="color:#94a3b8;">{moeda_ativo}</div>
                        </div>""", unsafe_allow_html=True)
                    with k2:
                        st.markdown(f"""<div class="lote-card">
                            <div class="lote-label">Preço Atual</div>
                            <div class="lote-value">{preco_atual_decomp:,.2f}</div>
                            <div class="lote-sub" style="color:#94a3b8;">{moeda_ativo}</div>
                        </div>""", unsafe_allow_html=True)
                    with k3:
                        cor_rent = "lote-pos" if rent_total_pm >= 0 else "lote-neg"
                        sinal = "▲" if rent_total_pm >= 0 else "▼"
                        st.markdown(f"""<div class="lote-card">
                            <div class="lote-label">Rent. s/ PM</div>
                            <div class="lote-value {cor_rent}">{rent_total_pm:+.2%}</div>
                            <div class="lote-sub {cor_rent}">{sinal} desde o 1º aporte</div>
                        </div>""", unsafe_allow_html=True)
                    with k4:
                        st.markdown(f"""<div class="lote-card">
                            <div class="lote-label">Nº de Aportes</div>
                            <div class="lote-value">{total_aportes}</div>
                            <div class="lote-sub" style="color:#94a3b8;">lotes de compra</div>
                        </div>""", unsafe_allow_html=True)
                    with k5:
                        st.markdown(f"""<div class="lote-card">
                            <div class="lote-label">Qtd em Custódia</div>
                            <div class="lote-value">{qtd_real:,.2f}</div>
                            <div class="lote-sub" style="color:#94a3b8;">de {qtd_total_comprada:,.2f} compradas</div>
                        </div>""", unsafe_allow_html=True)

                    st.markdown("<br>", unsafe_allow_html=True)

                    # --- Tabela de Lotes ---
                    tabela_lotes = df_lotes[['Lote', 'data', 'Qtd Comprada', 'Preço de Compra', 'Valor Investido', 'Preço Atual', 'Rent. Lote (%)', 'Lucro do Lote (R$)']].copy()
                    tabela_lotes.rename(columns={'data': 'Data'}, inplace=True)
                    tabela_lotes['Data'] = tabela_lotes['Data'].dt.strftime('%d/%m/%Y')

                    def _cor_rent_lote(val):
                        cor = '#4ade80' if val >= 0 else '#f87171'
                        return f'color: {cor}; font-weight: bold'

                    def _cor_lucro_lote(val):
                        cor = '#4ade80' if val >= 0 else '#f87171'
                        return f'color: {cor}'

                    moeda_fmt = 'R$' if moeda_ativo == 'BRL' else moeda_ativo
                    fmt_preco = f'{{:,.2f}}'
                    fmt_valor_brl = 'R$ {:,.2f}'

                    st.dataframe(
                        tabela_lotes.style
                            .format({
                                'Qtd Comprada': '{:,.4f}',
                                'Preço de Compra': fmt_preco,
                                'Valor Investido': fmt_preco,
                                'Preço Atual': fmt_preco,
                                'Rent. Lote (%)': '{:+.2%}',
                                'Lucro do Lote (R$)': fmt_valor_brl,
                            })
                            .map(_cor_rent_lote, subset=['Rent. Lote (%)'])
                            .map(_cor_lucro_lote, subset=['Lucro do Lote (R$)']),
                        use_container_width=True,
                        hide_index=True,
                        height=min(400, (len(tabela_lotes) + 1) * 38 + 38),
                        column_config={
                            "Lote": st.column_config.NumberColumn("Lote #", width="small"),
                            "Data": st.column_config.TextColumn("Data", width="small"),
                            "Rent. Lote (%)": st.column_config.TextColumn("Rentab.", width="small"),
                        }
                    )

                    st.caption(f"💡 Preço Atual: {preco_atual_decomp:,.2f} {moeda_ativo} · PM Ponderado: {pm_real:,.2f} {moeda_ativo} · Lucro do Lote em R$ considera câmbio atual.")

                    # --- Gráfico de barras por lote ---
                    if len(df_lotes) > 1:
                        st.markdown("<br>", unsafe_allow_html=True)
                        cores_lotes = ['#4ade80' if x >= 0 else '#f87171' for x in df_lotes['Rent. Lote (%)']]
                        labels_lotes = df_lotes.apply(
                            lambda r: f"Lote {int(r['Lote'])}<br>{r['data'].strftime('%m/%Y') if pd.notna(r['data']) else ''}", axis=1
                        )

                        fig_lotes = go.Figure()
                        fig_lotes.add_trace(go.Bar(
                            x=labels_lotes,
                            y=df_lotes['Rent. Lote (%)'],
                            marker_color=cores_lotes,
                            text=[f"{v:+.1%}" for v in df_lotes['Rent. Lote (%)']],
                            textposition='outside',
                            customdata=np.stack((
                                df_lotes['Preço de Compra'],
                                df_lotes['Qtd Comprada'],
                                df_lotes['Lucro do Lote (R$)'],
                            ), axis=-1),
                            hovertemplate=(
                                "<b>%{x}</b><br>"
                                "Preço de Compra: %{customdata[0]:,.2f}<br>"
                                "Quantidade: %{customdata[1]:,.4f}<br>"
                                "Rentab. Lote: %{y:+.2%}<br>"
                                "Lucro (R$): R$ %{customdata[2]:,.2f}<extra></extra>"
                            )
                        ))

                        fig_lotes.add_hline(
                            y=0,
                            line_width=1,
                            line_color="rgba(255,255,255,0.3)",
                            line_dash="dot"
                        )

                        # Linha do PM (rent = 0 já é o PM, mas adiciona referência visual)
                        fig_lotes.update_layout(
                            title=dict(text=f"Rentabilidade Individual dos Lotes — {ticker_decomp}", font=dict(size=14, color='#94a3b8')),
                            height=380,
                            margin=dict(t=55, b=10, l=0, r=0),
                            yaxis=dict(tickformat='+.1%', title=None, gridcolor='rgba(255,255,255,0.06)'),
                            xaxis=dict(title=None),
                            paper_bgcolor='rgba(0,0,0,0)',
                            plot_bgcolor='rgba(0,0,0,0)',
                            showlegend=False,
                        )

                        st.plotly_chart(fig_lotes, use_container_width=True)

                else:
                    st.markdown(f'<div class="glass-alert glass-info">ℹ️ Nenhum registro de compra encontrado para {ticker_decomp}.</div>', unsafe_allow_html=True)
            else:
                st.markdown('<div class="glass-alert glass-info">ℹ️ Selecione um ativo de Renda Variável nos filtros laterais para decompor.</div>', unsafe_allow_html=True)

            st.markdown("---")

        else:
            st.markdown('<div class="glass-alert glass-info">ℹ️ Nenhuma posição de Renda Variável encontrada.</div>', unsafe_allow_html=True)
    else:
        st.markdown('<div class="glass-alert glass-info">ℹ️ Nenhum dado disponível para visualização.</div>', unsafe_allow_html=True)


with tab5:
    col_head, _ = st.columns([5, 1])
    with col_head:
        st.markdown('<div class="tab-header">₿ Cripto Command Center</div>', unsafe_allow_html=True)
        st.caption("Performance real, preços médios e histórico de acumulação.")

    # ── CSS exclusivo do tab Cripto ──
    st.markdown("""
    <style>
    .c-dash {
        background: rgba(10,18,35,0.45);
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(234,179,8,0.18);
        border-radius: 20px; padding: 22px 24px;
        margin-bottom: 20px; position: relative; overflow: hidden;
        box-shadow: 0 0 30px rgba(234,179,8,0.06), 0 8px 32px rgba(0,0,0,0.35);
    }
    .c-dash::before {
        content:''; position:absolute; inset:0; border-radius:20px; padding:1px;
        background: linear-gradient(135deg, rgba(234,179,8,0.2) 0%, transparent 50%, rgba(234,179,8,0.06) 100%);
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor; mask-composite: exclude; pointer-events:none;
    }
    .c-saldo-lbl { font-size:0.62rem; color:#64748b; text-transform:uppercase; letter-spacing:1.8px; font-weight:600; text-align:center; margin-bottom:4px; }
    .c-saldo-val { font-size:clamp(1.5rem,4vw,2.2rem); font-weight:800; letter-spacing:-1.5px; text-align:center; margin-bottom:18px; }
    .c-saldo-val.g { color:#34d399; text-shadow:0 0 28px rgba(52,211,153,0.3); }
    .c-saldo-val.r { color:#f87171; text-shadow:0 0 28px rgba(248,113,113,0.3); }
    .c-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; border-top:1px solid rgba(255,255,255,0.05); padding-top:16px; }
    .c-gi { text-align:center; padding:6px 4px; }
    .c-gl { font-size:0.58rem; color:#475569; text-transform:uppercase; letter-spacing:0.5px; font-weight:500; margin-bottom:3px; }
    .c-gv { font-size:0.9rem; font-weight:700; }
    .c-gp { font-size:0.62rem; font-weight:500; margin-top:1px; }
    .c-sep { width:1px; background:rgba(255,255,255,0.05); }
    @media(max-width:600px) { .c-grid { grid-template-columns:repeat(2,1fr); } }
    </style>
    """, unsafe_allow_html=True)

    COIN_COLORS = {
        'BTC': '#F7931A', 'ETH': '#627EEA', 'SOL': '#9945FF',
        'HBAR': '#00BFFF', 'USDT': '#26A17B', 'USDC': '#2775CA',
        'ADA': '#0033AD', 'DOT': '#E6007A', 'AVAX': '#E84142',
        'BNB': '#F3BA2F', 'XRP': '#00AAE4', 'MATIC': '#8247E5',
    }

    def coin_color(ticker):
        base = ticker.replace('-USD', '').replace('-BRL', '').upper()
        return COIN_COLORS.get(base, '#6366f1')

    if not df_view.empty:
        df_cripto = df_view[df_view['Setor'] == 'Cripto'].copy()

        if not df_cripto.empty:
            df_cripto['Custo BRL'] = df_cripto['Valor Hoje (R$)'] - df_cripto['Lucro Aberto (R$)']

            total_cripto   = df_cripto['Valor Hoje (R$)'].sum()
            custo_cripto   = df_cripto['Custo BRL'].sum()
            pnl_cripto     = df_cripto['Lucro Aberto (R$)'].sum()
            pnl_pct_cripto = (pnl_cripto / custo_cripto) if custo_cripto > 0 else 0

            top_row   = df_cripto.loc[df_cripto['Rent. (%)'].idxmax()]
            worst_row = df_cripto.loc[df_cripto['Rent. (%)'].idxmin()]

            pnl_cls  = 'g' if pnl_cripto >= 0 else 'r'
            pnl_sign = '+' if pnl_cripto >= 0 else ''
            pnl_color = '#34d399' if pnl_cripto >= 0 else '#f87171'

            # ── 1. HERO CARD ──
            st.markdown(f"""
            <div class="c-dash">
              <div class="c-saldo-lbl">₿ PATRIMÔNIO CRIPTO</div>
              <div class="c-saldo-val {pnl_cls}">R$ {total_cripto:,.0f}</div>
              <div class="c-grid">
                <div class="c-gi">
                  <div class="c-gl">Investido</div>
                  <div class="c-gv" style="color:#94a3b8">R$ {custo_cripto:,.0f}</div>
                </div>
                <div class="c-gi">
                  <div class="c-gl">P&L Total</div>
                  <div class="c-gv" style="color:{pnl_color}">{pnl_sign}R$ {abs(pnl_cripto):,.0f}</div>
                  <div class="c-gp" style="color:{pnl_color}">{pnl_sign}{pnl_pct_cripto:.1%}</div>
                </div>
                <div class="c-gi">
                  <div class="c-gl">🏆 Melhor</div>
                  <div class="c-gv" style="color:#34d399">{top_row['Ticker']}</div>
                  <div class="c-gp" style="color:#34d399">{top_row['Rent. (%)']:+.1%}</div>
                </div>
                <div class="c-gi">
                  <div class="c-gl">📉 Pior</div>
                  <div class="c-gv" style="color:#f87171">{worst_row['Ticker']}</div>
                  <div class="c-gp" style="color:#f87171">{worst_row['Rent. (%)']:+.1%}</div>
                </div>
              </div>
            </div>
            """, unsafe_allow_html=True)

            # ── 2. POSITION CARDS ──
            st.markdown('<div class="tab-header-sm">🪙 Posições Abertas</div>', unsafe_allow_html=True)

            df_sorted = df_cripto.sort_values('Valor Hoje (R$)', ascending=False)
            n      = len(df_sorted)
            ncols  = min(n, 4)
            pcols  = st.columns(ncols)

            for i, (_, row) in enumerate(df_sorted.iterrows()):
                ticker  = row['Ticker']
                qtd     = row['Qtd']
                pm      = row['PM Compra']
                preco   = row['Preço Atual']
                saldo   = row['Valor Hoje (R$)']
                pnl     = row['Lucro Aberto (R$)']
                rent    = row['Rent. (%)']
                custo   = row['Custo BRL']

                c       = coin_color(ticker)
                vc      = '#34d399' if rent >= 0 else '#f87171'
                sgn     = '+' if rent >= 0 else ''
                ratio   = ((preco - pm) / pm) if pm > 0 else 0
                fill    = min(max((ratio + 1) / 2 * 100, 1), 99)

                # Number of buys for this asset
                n_buys = 0
                if not df_bruto.empty and 'ticker' in df_bruto.columns:
                    tickers_match = [ticker, f"{ticker}-USD"]
                    mask = (
                        df_bruto['ticker'].isin(tickers_match) &
                        df_bruto['tipo'].str.lower().str.contains('compra', na=False)
                    )
                    n_buys = int(mask.sum())

                card = f"""
                <div style="background:rgba(15,23,42,0.7);border:1px solid rgba(255,255,255,0.07);
                     border-radius:16px;padding:16px 16px 14px;border-top:3px solid {c};">
                  <!-- Header -->
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                    <span style="font-size:1rem;font-weight:700;color:#f1f5f9;">{ticker}</span>
                    <span style="font-size:0.72rem;font-weight:700;color:{vc};
                          background:rgba(0,0,0,0.4);padding:3px 9px;border-radius:8px;">{sgn}{rent:.1%}</span>
                  </div>
                  <!-- Qtd + n compras -->
                  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px;">
                    <div>
                      <div style="font-size:0.57rem;color:#475569;text-transform:uppercase;letter-spacing:0.4px;">Quantidade</div>
                      <div style="font-size:0.82rem;font-weight:600;color:#94a3b8;">{qtd:.6f}</div>
                    </div>
                    <div style="text-align:right;">
                      <div style="font-size:0.57rem;color:#475569;text-transform:uppercase;letter-spacing:0.4px;">Compras</div>
                      <div style="font-size:0.82rem;font-weight:600;color:#94a3b8;">{n_buys}x</div>
                    </div>
                  </div>
                  <!-- PM vs Cotação -->
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
                    <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:8px 10px;">
                      <div style="font-size:0.55rem;color:#475569;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:2px;">PM Compra</div>
                      <div style="font-size:0.85rem;font-weight:700;color:#94a3b8;">${pm:,.2f}</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:8px 10px;border:1px solid rgba(255,255,255,0.05);">
                      <div style="font-size:0.55rem;color:#475569;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:2px;">Cotação</div>
                      <div style="font-size:0.85rem;font-weight:700;color:#f1f5f9;">${preco:,.2f}</div>
                    </div>
                  </div>
                  <!-- Barra PM → Preço -->
                  <div style="margin-bottom:13px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                      <span style="font-size:0.57rem;color:#374151;">PM&nbsp;→&nbsp;Cotação</span>
                      <span style="font-size:0.57rem;font-weight:600;color:{vc};">{sgn}{ratio*100:.1f}%</span>
                    </div>
                    <div style="height:5px;background:rgba(255,255,255,0.05);border-radius:3px;position:relative;overflow:hidden;">
                      <div style="position:absolute;top:0;left:0;height:100%;width:{fill}%;background:{vc};border-radius:3px;opacity:0.85;transition:width .4s;"></div>
                      <div style="position:absolute;top:0;left:50%;height:100%;width:1.5px;background:rgba(255,255,255,0.18);"></div>
                    </div>
                  </div>
                  <!-- Saldo + PnL -->
                  <div style="display:flex;justify-content:space-between;align-items:center;
                       border-top:1px solid rgba(255,255,255,0.05);padding-top:10px;">
                    <div>
                      <div style="font-size:0.57rem;color:#475569;text-transform:uppercase;letter-spacing:0.3px;">Saldo Atual</div>
                      <div style="font-size:0.95rem;font-weight:700;color:#f1f5f9;">R$ {saldo:,.0f}</div>
                      <div style="font-size:0.58rem;color:#475569;">investido R$ {custo:,.0f}</div>
                    </div>
                    <div style="text-align:right;">
                      <div style="font-size:0.57rem;color:#475569;text-transform:uppercase;letter-spacing:0.3px;">P&L</div>
                      <div style="font-size:0.95rem;font-weight:700;color:{vc};">{sgn}R$ {abs(pnl):,.0f}</div>
                    </div>
                  </div>
                </div>"""

                with pcols[i % ncols]:
                    st.markdown(card, unsafe_allow_html=True)

            st.divider()

            # ── 3. CHART + ALLOCATION ──
            col_chart, col_dist = st.columns([2, 1])

            with col_chart:
                lista_ativos  = df_cripto['Ticker'].unique().tolist()
                index_def     = next((i for i, x in enumerate(lista_ativos) if 'BTC' in x), 0)
                st.markdown("##### 🔎 Análise de Preço")
                ativo_sel = st.selectbox(
                    "Ativo:", lista_ativos, index=index_def,
                    label_visibility="collapsed", key="cripto_sel_v2"
                )

                row_ativo  = df_cripto[df_cripto['Ticker'] == ativo_sel].iloc[0]
                pm_ativo   = row_ativo['PM Compra']
                rent_ativo = row_ativo['Rent. (%)']
                pnl_ativo  = row_ativo['Lucro Aberto (R$)']

                @st.cache_data(ttl=3600)
                def get_crypto_chart(tkr):
                    try:
                        symbol = tkr if '-' in tkr else f"{tkr}-USD"
                        d = yf.download(symbol, period="1y", interval="1d", progress=False)
                        if isinstance(d.columns, pd.MultiIndex):
                            d.columns = d.columns.get_level_values(0)
                        return d[['Close']]
                    except:
                        return pd.DataFrame()

                df_chart = get_crypto_chart(ativo_sel)

                if not df_chart.empty:
                    current_price = float(df_chart['Close'].iloc[-1])
                    sgn_r = '+' if rent_ativo >= 0 else ''

                    # Mini metrics row
                    ma1, ma2, ma3 = st.columns(3)
                    with ma1:
                        st.markdown(render_metric_card(f"Preço {ativo_sel}", f"${current_price:,.2f}", icon="💹"), unsafe_allow_html=True)
                    with ma2:
                        st.markdown(render_metric_card("PM Compra", f"${pm_ativo:,.2f}", icon="📌"), unsafe_allow_html=True)
                    with ma3:
                        st.markdown(render_metric_card(
                            "Resultado", f"{sgn_r}{rent_ativo:.1%}",
                            f"{sgn_r}R$ {abs(pnl_ativo):,.0f}",
                            rent_ativo >= 0, icon="📊"
                        ), unsafe_allow_html=True)

                    df_chart['SMA21'] = df_chart['Close'].rolling(21).mean()
                    y_min  = float(df_chart['Close'].min())
                    y_max  = float(df_chart['Close'].max())
                    margin = (y_max - y_min) * 0.1
                    lc     = coin_color(ativo_sel)
                    try:
                        r_, g_, b_ = int(lc[1:3], 16), int(lc[3:5], 16), int(lc[5:7], 16)
                        fill_c = f"rgba({r_},{g_},{b_},0.1)"
                    except:
                        fill_c = "rgba(99,102,241,0.1)"

                    fig_c = go.Figure()

                    # Price area
                    fig_c.add_trace(go.Scatter(
                        x=df_chart.index, y=df_chart['Close'],
                        mode='lines', name='Preço',
                        fill='tozeroy',
                        line=dict(color=lc, width=2),
                        fillcolor=fill_c
                    ))
                    # SMA21
                    fig_c.add_trace(go.Scatter(
                        x=df_chart.index, y=df_chart['SMA21'],
                        mode='lines', name='MM21',
                        line=dict(color='rgba(255,255,255,0.25)', width=1, dash='dot')
                    ))
                    # PM line
                    if pm_ativo > 0 and abs(pm_ativo - current_price) / current_price < 50:
                        pm_c = "#34d399" if current_price >= pm_ativo else "#f87171"
                        fig_c.add_hline(
                            y=pm_ativo, line_dash="dash", line_color=pm_c, line_width=1.5,
                            annotation_text=f"PM ${pm_ativo:,.2f}",
                            annotation_position="top right",
                            annotation_font_color=pm_c, annotation_font_size=11
                        )
                    # Buy markers
                    if not df_bruto.empty:
                        tickers_match = [ativo_sel, f"{ativo_sel}-USD"]
                        df_compras = df_bruto[
                            df_bruto['ticker'].isin(tickers_match) &
                            df_bruto['tipo'].str.lower().str.contains('compra', na=False)
                        ].copy()
                        if not df_compras.empty and 'data' in df_compras.columns:
                            df_compras['data'] = pd.to_datetime(df_compras['data'], errors='coerce')
                            df_compras = df_compras.dropna(subset=['data'])
                            df_in_range = df_compras[df_compras['data'] >= df_chart.index[0]]
                            if not df_in_range.empty:
                                buy_y = []
                                for bd in df_in_range['data']:
                                    idx = min(df_chart.index.searchsorted(bd), len(df_chart) - 1)
                                    buy_y.append(float(df_chart['Close'].iloc[idx]))
                                fig_c.add_trace(go.Scatter(
                                    x=df_in_range['data'].tolist(), y=buy_y,
                                    mode='markers', name='Compras',
                                    marker=dict(
                                        symbol='triangle-up', size=11,
                                        color='#34d399',
                                        line=dict(color='rgba(255,255,255,0.4)', width=1)
                                    ),
                                    hovertemplate='<b>Compra</b><br>%{x|%d/%m/%Y}<br>$%{y:,.2f}<extra></extra>'
                                ))

                    fig_c.update_layout(
                        height=340, hovermode="x unified",
                        margin=dict(l=0, r=0, t=10, b=0),
                        template="plotly_dark",
                        showlegend=True,
                        legend=dict(orientation="h", y=1.06, x=0, font=dict(size=10)),
                        yaxis=dict(range=[y_min - margin, y_max + margin]),
                        paper_bgcolor='rgba(0,0,0,0)',
                        plot_bgcolor='rgba(0,0,0,0)'
                    )
                    st.plotly_chart(fig_c, use_container_width=True)
                else:
                    st.markdown('<div class="glass-alert glass-warn">⚠️ Não foi possível obter dados de preço.</div>', unsafe_allow_html=True)

            with col_dist:
                st.markdown("##### 🍩 Alocação")
                pie_colors = [coin_color(t) for t in df_cripto['Ticker'].tolist()]
                fig_pie = px.pie(
                    df_cripto, values='Valor Hoje (R$)', names='Ticker',
                    hole=0.6, color_discrete_sequence=pie_colors
                )
                fig_pie.update_layout(
                    showlegend=True,
                    legend=dict(orientation="h", y=-0.15, font=dict(size=10)),
                    margin=dict(t=10, b=10, l=0, r=0), height=420,
                    paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)'
                )
                fig_pie.update_traces(
                    textinfo='percent+label', textposition='inside', textfont_size=11
                )
                st.plotly_chart(fig_pie, use_container_width=True)

            # ── 4. TRANSACTION HISTORY ──
            with st.expander("📜 Histórico de Operações", expanded=False):
                tickers_cripto = df_cripto['Ticker'].unique().tolist()
                if not df_bruto.empty:
                    tickers_all    = tickers_cripto + [f"{t}-USD" for t in tickers_cripto if '-' not in t]
                    df_ops_cripto  = df_bruto[df_bruto['ticker'].isin(tickers_all)].copy()

                    if not df_ops_cripto.empty:
                        df_ops_cripto = df_ops_cripto.sort_values('data', ascending=False)
                        cols_ops  = ['data', 'ticker', 'tipo', 'quantidade', 'preco', 'taxas', 'total']
                        cols_disp = [c for c in cols_ops if c in df_ops_cripto.columns]
                        st.dataframe(
                            df_ops_cripto[cols_disp],
                            column_config={
                                "data":       st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
                                "ticker":     st.column_config.TextColumn("Ativo"),
                                "tipo":       st.column_config.TextColumn("Operação"),
                                "quantidade": st.column_config.NumberColumn("Qtd", format="%.6f"),
                                "preco":      st.column_config.NumberColumn("Preço", format="$ %.2f"),
                                "taxas":      st.column_config.NumberColumn("Taxas", format="$ %.4f"),
                                "total":      st.column_config.NumberColumn("Total", format="$ %.2f"),
                            },
                            use_container_width=True,
                            height=max(200, len(df_ops_cripto) * 35 + 38)
                        )
                    else:
                        st.markdown('<div class="glass-alert glass-info">ℹ️ Nenhuma operação encontrada para os ativos cripto.</div>', unsafe_allow_html=True)

        else:
            st.markdown('<div class="glass-alert glass-info">ℹ️ Nenhuma criptomoeda encontrada na sua carteira. Adicione transações com setor \'Cripto\'.</div>', unsafe_allow_html=True)
    else:
        st.markdown('<div class="glass-alert glass-info">⏳ Carregando dados...</div>', unsafe_allow_html=True)


with tab6:
    st.markdown('<div class="tab-header">△ Câmbio</div>', unsafe_allow_html=True)

    # ── CSS ──────────────────────────────────────────────────────────────────
    st.markdown("""
    <style>
    /* Legacy fx-dash kept for any remaining refs */
    .fx-dash {
        background: rgba(10,18,35,0.45);
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(0,176,255,0.18);
        border-radius: 20px; padding: 22px 24px;
        margin-bottom: 20px; position: relative; overflow: hidden;
        box-shadow: 0 0 30px rgba(0,176,255,0.06), 0 8px 32px rgba(0,0,0,0.35);
    }
    .fx-dash::before {
        content:''; position:absolute; inset:0; border-radius:20px; padding:1px;
        background: linear-gradient(135deg, rgba(0,176,255,0.18) 0%, transparent 50%, rgba(0,176,255,0.06) 100%);
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor; mask-composite: exclude; pointer-events:none;
    }
    </style>
    """, unsafe_allow_html=True)

    # ── Metadata ──────────────────────────────────────────────────────────────
    FX_META = {
        'USD': {'flag': '🇺🇸', 'color': '#00B0FF'},
        'EUR': {'flag': '🇪🇺', 'color': '#6366f1'},
        'CAD': {'flag': '🇨🇦', 'color': '#f97316'},
        'GBP': {'flag': '🇬🇧', 'color': '#ec4899'},
        'CHF': {'flag': '🇨🇭', 'color': '#22d3ee'},
        'JPY': {'flag': '🇯🇵', 'color': '#eab308'},
        'AUD': {'flag': '🇦🇺', 'color': '#84cc16'},
    }

    def fx_color(m): return FX_META.get(m, {}).get('color', '#6366f1')
    def fx_flag(m):  return FX_META.get(m, {}).get('flag', '🌐')

    # ── Cotações ao vivo ───────────────────────────────────────────────────
    cot_usd_brl = mapa_precos.get('BRL=X', 5.50)
    cot_eur_brl = mapa_precos.get('EURBRL=X', 6.00)
    cot_cad_brl = mapa_precos.get('CADBRL=X', 4.00)
    cot_eur_usd = cot_eur_brl / cot_usd_brl if cot_usd_brl > 0 else 0.0
    cot_cad_usd = cot_cad_brl / cot_usd_brl if cot_usd_brl > 0 else 0.0
    var_usd = mapa_variacao.get('BRL=X', 0.0)
    var_eur = mapa_variacao.get('EURBRL=X', 0.0)
    var_cad = mapa_variacao.get('CADBRL=X', 0.0)

    # ── Barra de cotações ─────────────────────────────────────────────────
    r1, r2, r3, r4, r5 = st.columns(5)
    for col, label, val, var, sym in [
        (r1, '🇺🇸 USD/BRL',  cot_usd_brl, var_usd, 'R$'),
        (r2, '🇪🇺 EUR/BRL',  cot_eur_brl, var_eur, 'R$'),
        (r3, '🇪🇺 EUR/USD',  cot_eur_usd, 0.0,    'US$'),
        (r4, '🇨🇦 CAD/BRL',  cot_cad_brl, var_cad, 'R$'),
        (r5, '🇨🇦 CAD/USD',  cot_cad_usd, 0.0,    'US$'),
    ]:
        with col:
            st.markdown(render_metric_card(
                label=label, value=f"{sym} {val:.4f}",
                delta=f"{var:+.4f}" if var else None,
                delta_positive=var >= 0, icon="💱"
            ), unsafe_allow_html=True)

    # ── SEÇÃO: Exposição Cambial do Portfólio ────────────────────────────────
    st.markdown(
        "<div class='tab-header-sm' style='margin-top:28px;'>◆ Exposição Cambial do Portfólio</div>",
        unsafe_allow_html=True,
    )
    st.caption("Valor real dos seus ativos em cada moeda hoje, com o impacto cambial do dia sobre as posições")

    _df_exp_active = df_view[df_view['Qtd'] > 0].copy() if not df_view.empty else pd.DataFrame()
    # Exclude crypto: BTC-USD etc. are priced in USD but are NOT dollar holdings.
    # Their FX sensitivity is real mathematically but they're a separate asset class.
    if not _df_exp_active.empty and 'Setor' in _df_exp_active.columns:
        _df_exp_active = _df_exp_active[_df_exp_active['Setor'] != 'Cripto']
        # ETF USA sector is always USD-denominated regardless of listing exchange.
        # VWRA.L trades in London but is the USD share class — not GBP/EUR.
        _df_exp_active.loc[_df_exp_active['Setor'] == 'ETF USA', 'Moeda'] = 'USD'
    _fx_rate_map  = {'USD': cot_usd_brl, 'EUR': cot_eur_brl, 'CAD': cot_cad_brl}
    _fx_var_map   = {'USD': var_usd,      'EUR': var_eur,      'CAD': var_cad}

    if _df_exp_active.empty:
        st.info("Sem posições ativas.")
    else:
        _total_portfolio_brl = _df_exp_active['Valor Hoje (R$)'].sum()
        _exp_data: dict = {}

        for _em, _egrp in _df_exp_active[_df_exp_active['Moeda'] != 'BRL'].groupby('Moeda'):
            if _em not in _fx_rate_map:
                continue
            _efx      = _fx_rate_map[_em]
            _efx_var  = _fx_var_map.get(_em, 0.0)
            _efx_prev = _efx - _efx_var

            _etotal_brl = _egrp['Valor Hoje (R$)'].sum()
            _etotal_nat = _etotal_brl / _efx if _efx > 0 else 0.0
            # FX impact = how much BRL value changed from FX alone (stock prices held at today's value)
            _efx_impact = float((_egrp['Qtd'] * _egrp['Preço Atual'] * _efx_var).sum())
            _efx_pct    = (_efx_var / _efx_prev * 100) if _efx_prev > 0 else 0.0
            _epct_port  = (_etotal_brl / _total_portfolio_brl * 100) if _total_portfolio_brl > 0 else 0.0

            _exp_data[_em] = dict(
                total_brl=_etotal_brl, total_nat=_etotal_nat,
                fx_rate=_efx, fx_pct=_efx_pct, fx_impact=_efx_impact,
                pct_portfolio=_epct_port, n_assets=len(_egrp),
                top=_egrp.nlargest(4, 'Valor Hoje (R$)')[['Ticker','Valor Hoje (R$)']].to_dict('records'),
            )

        if not _exp_data:
            st.info("Todos os ativos ativos estão em BRL — sem exposição cambial.")
        else:
            # ── Hero totais ─────────────────────────────────────────────────
            _etot_fx_brl    = sum(v['total_brl']  for v in _exp_data.values())
            _etot_fx_impact = sum(v['fx_impact']  for v in _exp_data.values())
            _epct_fx        = (_etot_fx_brl / _total_portfolio_brl * 100) if _total_portfolio_brl > 0 else 0.0
            _etot_fx_imp_pct = (_etot_fx_impact / (_etot_fx_brl - _etot_fx_impact) * 100) if (_etot_fx_brl - _etot_fx_impact) != 0 else 0.0
            _ehc = '#34d399' if _etot_fx_impact >= 0 else '#f87171'
            _ehs = '+' if _etot_fx_impact >= 0 else ''

            st.markdown(
                f'<div style="background:rgba(15,23,42,0.5);border:1px solid rgba(255,255,255,0.07);'
                f'border-radius:16px;padding:16px 22px;margin-bottom:20px;'
                f'display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">'
                f'<div>'
                f'<div style="font-size:0.6rem;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">Total em Moeda Estrangeira</div>'
                f'<div style="font-size:1.55rem;font-weight:800;color:#f1f5f9;">R$ {_etot_fx_brl:,.0f}</div>'
                f'<div style="font-size:0.7rem;color:#94a3b8;margin-top:2px;">{_epct_fx:.1f}% do portfólio · {len(_exp_data)} moeda{"s" if len(_exp_data)!=1 else ""}</div>'
                f'</div>'
                f'<div style="text-align:right;">'
                f'<div style="font-size:0.6rem;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">Impacto FX Hoje (estimado)</div>'
                f'<div style="font-size:1.3rem;font-weight:800;color:{_ehc};">{_ehs}R$ {abs(_etot_fx_impact):,.0f}</div>'
                f'<div style="font-size:0.78rem;font-weight:700;color:{_ehc};margin-top:2px;">{_ehs}{abs(_etot_fx_imp_pct):.2f}% sobre a exposição</div>'
                f'<div style="font-size:0.62rem;color:#64748b;margin-top:1px;">efeito cambial sobre as posições</div>'
                f'</div>'
                f'</div>',
                unsafe_allow_html=True,
            )

            # ── Cards por moeda ─────────────────────────────────────────────
            _encols  = min(len(_exp_data), 3)
            _excols  = st.columns(_encols)
            _sym_map = {'USD': 'US$', 'EUR': '€', 'CAD': 'C$'}

            for _ei, (_em, _ed) in enumerate(_exp_data.items()):
                _ecol = fx_color(_em);  _efl = fx_flag(_em)
                _evc  = '#34d399' if _ed['fx_impact'] >= 0 else '#f87171'
                _esg  = '+' if _ed['fx_impact'] >= 0 else ''
                _evcp = '#34d399' if _ed['fx_pct'] >= 0 else '#f87171'
                _esgp = '+' if _ed['fx_pct'] >= 0 else ''
                _esym = _sym_map.get(_em, _em)
                _ebar = min(max(int(_ed['pct_portfolio']), 2), 100)
                _etags = ''.join(
                    f'<span style="font-size:0.63rem;color:#94a3b8;background:rgba(255,255,255,0.05);'
                    f'padding:2px 8px;border-radius:6px;">{a["Ticker"].replace(".SA","")}</span>'
                    for a in _ed['top']
                )
                with _excols[_ei % _encols]:
                    st.markdown(f"""
                    <div style="background:rgba(15,23,42,0.65);border:1px solid rgba(255,255,255,0.07);
                         border-top:3px solid {_ecol};border-radius:20px;padding:20px;margin-bottom:12px;
                         box-shadow:0 8px 32px rgba(0,0,0,0.2);">
                      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                        <div style="display:flex;align-items:center;gap:10px;">
                          <span style="font-size:1.6rem;">{_efl}</span>
                          <div>
                            <div style="font-size:1rem;font-weight:700;color:#f1f5f9;">{_em}</div>
                            <div style="font-size:0.58rem;color:#64748b;text-transform:uppercase;
                                 letter-spacing:0.8px;">{_ed['n_assets']} ativo{'s' if _ed['n_assets']!=1 else ''}</div>
                          </div>
                        </div>
                        <div style="text-align:right;">
                          <div style="font-size:0.58rem;color:#64748b;">Câmbio hoje</div>
                          <div style="font-size:1rem;font-weight:800;color:{_evcp};">{_esgp}{_ed['fx_pct']:.2f}%</div>
                          <div style="font-size:0.65rem;color:{_evcp};">R$ {_ed['fx_rate']:.4f}</div>
                        </div>
                      </div>
                      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
                        <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:12px;">
                          <div style="font-size:0.55rem;color:#64748b;text-transform:uppercase;
                               letter-spacing:0.5px;margin-bottom:4px;">Valor em BRL</div>
                          <div style="font-size:0.9rem;font-weight:700;color:#f1f5f9;">
                            R$ {_ed['total_brl']:,.0f}</div>
                          <div style="font-size:0.6rem;color:#94a3b8;">{_ed['pct_portfolio']:.1f}% portfólio</div>
                        </div>
                        <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:12px;">
                          <div style="font-size:0.55rem;color:#64748b;text-transform:uppercase;
                               letter-spacing:0.5px;margin-bottom:4px;">Posição em {_em}</div>
                          <div style="font-size:0.9rem;font-weight:700;color:#f1f5f9;">
                            {_esym} {_ed['total_nat']:,.0f}</div>
                          <div style="font-size:0.6rem;color:#94a3b8;">a R$ {_ed['fx_rate']:.4f}</div>
                        </div>
                        <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:12px;">
                          <div style="font-size:0.55rem;color:#64748b;text-transform:uppercase;
                               letter-spacing:0.5px;margin-bottom:4px;">Impacto FX Hoje</div>
                          <div style="font-size:0.9rem;font-weight:700;color:{_evc};">
                            {_esg}R$ {abs(_ed['fx_impact']):,.0f}</div>
                          <div style="font-size:0.6rem;color:{_evc};">efeito câmbio nas posições</div>
                        </div>
                        <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:12px;">
                          <div style="font-size:0.55rem;color:#64748b;text-transform:uppercase;
                               letter-spacing:0.5px;margin-bottom:4px;">% do Portfólio</div>
                          <div style="font-size:0.9rem;font-weight:700;color:#f1f5f9;">
                            {_ed['pct_portfolio']:.1f}%</div>
                          <div style="height:4px;background:rgba(255,255,255,0.06);border-radius:3px;
                               margin-top:6px;overflow:hidden;">
                            <div style="height:100%;width:{_ebar}%;background:{_ecol};border-radius:3px;"></div>
                          </div>
                        </div>
                      </div>
                      <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:10px;">
                        <div style="font-size:0.55rem;color:#64748b;text-transform:uppercase;
                             letter-spacing:0.5px;margin-bottom:7px;">Principais ativos</div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">{_etags}</div>
                      </div>
                    </div>
                    """, unsafe_allow_html=True)

            # ── TESTE DE ESTRESSE CAMBIAL ────────────────────────────────────
            st.markdown(
                "<div class='tab-header-sm' style='margin-top:28px;'>⚡ Teste de Estresse Cambial</div>",
                unsafe_allow_html=True,
            )
            st.caption("Impacto no valor em R$ das posições estrangeiras para diferentes choques no câmbio")

            _stress_shocks = [-0.20, -0.10, -0.05, -0.02, +0.02, +0.05, +0.10, +0.20]
            _shock_labels  = ["-20%", "-10%", "-5%", "-2%", "+2%", "+5%", "+10%", "+20%"]

            for _sem, _sed in _exp_data.items():
                _sc    = fx_color(_sem)
                _sfl   = fx_flag(_sem)
                _ssym  = _sym_map.get(_sem, _sem)
                _s_nat = _sed['total_nat']
                _s_brl = _sed['total_brl']
                _s_fx  = _sed['fx_rate']

                # Build rows as single-line strings (no leading spaces → won't be
                # treated as Markdown code blocks by Streamlit's markdown parser)
                _stress_rows = []
                for _shock, _lbl in zip(_stress_shocks, _shock_labels):
                    _new_fx    = _s_fx * (1 + _shock)
                    _new_brl   = _s_nat * _new_fx
                    _delta     = _new_brl - _s_brl
                    _dpct_port = (_delta / _total_portfolio_brl * 100) if _total_portfolio_brl > 0 else 0.0
                    _row_c     = '#34d399' if _delta >= 0 else '#f87171'
                    _row_bg    = 'rgba(52,211,153,0.06)' if _delta >= 0 else 'rgba(248,113,113,0.06)'
                    _dsign     = '+' if _delta >= 0 else ''
                    _bar_w     = min(abs(int(_shock * 100 * 2.5)), 100)
                    _ml        = 'margin-left:auto;' if _delta < 0 else ''
                    _stress_rows.append(
                        f'<div style="display:grid;grid-template-columns:60px 90px 1fr 110px 100px;align-items:center;gap:8px;padding:7px 14px;border-radius:10px;background:{_row_bg};margin-bottom:4px;">'
                        f'<div style="font-size:0.78rem;font-weight:700;color:{_row_c};">{_lbl}</div>'
                        f'<div style="font-size:0.72rem;color:#94a3b8;">R$ {_new_fx:.4f}</div>'
                        f'<div style="flex:1;"><div style="height:3px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;"><div style="height:100%;width:{_bar_w}%;background:{_row_c};border-radius:2px;opacity:0.7;{_ml}"></div></div></div>'
                        f'<div style="font-size:0.78rem;font-weight:700;color:{_row_c};text-align:right;">{_dsign}R$ {abs(_delta):,.0f}</div>'
                        f'<div style="font-size:0.68rem;color:{_row_c};text-align:right;">{_dsign}{_dpct_port:.2f}% portfólio</div>'
                        f'</div>'
                    )
                _stress_rows_html = "".join(_stress_rows)

                st.markdown(
                    f'<div style="background:rgba(15,23,42,0.6);border:1px solid rgba(255,255,255,0.07);border-top:3px solid {_sc};border-radius:20px;padding:20px;margin-bottom:16px;box-shadow:0 8px 32px rgba(0,0,0,0.2);">'
                    f'<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">'
                    f'<span style="font-size:1.4rem;">{_sfl}</span>'
                    f'<div><div style="font-size:0.9rem;font-weight:700;color:#f1f5f9;">{_sem} · Choque de Câmbio</div>'
                    f'<div style="font-size:0.6rem;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;">Posição: {_ssym} {_s_nat:,.0f} · Câmbio base: R$ {_s_fx:.4f}</div></div></div>'
                    f'<div style="display:grid;grid-template-columns:60px 90px 1fr 110px 100px;gap:8px;padding:4px 14px 8px;border-bottom:1px solid rgba(255,255,255,0.05);margin-bottom:8px;">'
                    f'<div style="font-size:0.55rem;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Choque</div>'
                    f'<div style="font-size:0.55rem;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Câmbio</div>'
                    f'<div></div>'
                    f'<div style="font-size:0.55rem;color:#475569;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">Δ R$</div>'
                    f'<div style="font-size:0.55rem;color:#475569;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">Δ Portfólio</div></div>'
                    f'{_stress_rows_html}'
                    f'</div>',
                    unsafe_allow_html=True,
                )

    st.divider()
    st.markdown(
        "<div class='tab-header-sm' style='margin-bottom:8px;'>△ Histórico de Operações de Câmbio</div>",
        unsafe_allow_html=True,
    )
    st.caption("Conversões registradas na planilha (BRL → USD → outras moedas)")

    # ── Dados de câmbio ───────────────────────────────────────────────────
    df_cambio = load_cambio()

    if df_cambio.empty:
        st.info("Nenhum dado de câmbio. Preencha a aba 'cambio' na planilha.")
    else:
        df_cambio = df_cambio.copy()
        for _c in ['moeda_origem', 'moeda_destino']:
            df_cambio[_c] = df_cambio[_c].astype(str).str.upper().str.strip()
        for _c in ['valor_origem', 'valor_destino']:
            df_cambio[_c] = pd.to_numeric(df_cambio[_c], errors='coerce').fillna(0)


        # ── CAMADA 1: BRL → USD ───────────────────────────────────────────
        _brl_usd = df_cambio[
            (df_cambio.moeda_origem == 'BRL') & (df_cambio.moeda_destino == 'USD')
        ]
        usd_comprado   = _brl_usd.valor_destino.sum()
        brl_gasto_usd  = _brl_usd.valor_origem.sum()
        pm_usd_brl     = brl_gasto_usd / usd_comprado if usd_comprado > 0 else 0.0

        # USD líquido (descontando o que foi convertido para outras moedas)
        usd_vendido    = df_cambio[df_cambio.moeda_origem == 'USD'].valor_origem.sum()
        usd_net        = max(0.0, usd_comprado - usd_vendido)
        brl_custo_usd_net = usd_net * pm_usd_brl
        valor_usd_hoje    = usd_net * cot_usd_brl
        ganho_usd_brl     = valor_usd_hoje - brl_custo_usd_net
        ganho_usd_pct     = (ganho_usd_brl / brl_custo_usd_net * 100) if brl_custo_usd_net > 0 else 0.0
        delta_pm_usd      = ((cot_usd_brl - pm_usd_brl) / pm_usd_brl * 100) if pm_usd_brl > 0 else 0.0

        # ── CAMADA 2: USD → outras moedas ────────────────────────────────
        _fx2_moedas = [
            m for m in df_cambio.moeda_destino.unique()
            if m not in ('BRL', 'USD', '', 'NAN', 'NONE')
            and not df_cambio[(df_cambio.moeda_origem == 'USD') & (df_cambio.moeda_destino == m)].empty
        ]

        fx2_data = {}
        for _m in _fx2_moedas:
            _rows       = df_cambio[(df_cambio.moeda_origem == 'USD') & (df_cambio.moeda_destino == _m)].copy()
            # taxa_impl per row = USD sent / currency received
            _rows['_taxa_impl'] = (
                _rows['valor_origem'] / _rows['valor_destino'].replace(0, float('nan'))
            )
            _qtd        = _rows.valor_destino.sum()
            _usd_gasto  = _rows.valor_origem.sum()
            _pm_usd     = _usd_gasto / _qtd if _qtd > 0 else 0.0
            _brl_custo  = _usd_gasto * pm_usd_brl
            _pm_brl     = _brl_custo / _qtd if _qtd > 0 else 0.0
            # Cotação atual em BRL
            _cot_brl    = mapa_precos.get(f'{_m}BRL=X', 0.0)
            if _cot_brl <= 0:
                _cot_brl = mapa_precos.get(f'EUR BRL=X', 0.0)  # fallback genérico
            if _cot_brl <= 0 and _m == 'EUR': _cot_brl = cot_eur_brl
            if _cot_brl <= 0 and _m == 'CAD': _cot_brl = cot_cad_brl
            _cot_usd    = _cot_brl / cot_usd_brl if cot_usd_brl > 0 else 0.0
            _val_brl    = _qtd * _cot_brl
            _ganho_brl  = _val_brl - _brl_custo
            _ganho_pct  = (_ganho_brl / _brl_custo * 100) if _brl_custo > 0 else 0.0
            _delta_usd  = ((_cot_usd - _pm_usd) / _pm_usd * 100) if _pm_usd > 0 else 0.0
            fx2_data[_m] = dict(
                qtd=_qtd, usd_gasto=_usd_gasto,
                pm_usd=_pm_usd, pm_brl=_pm_brl, brl_custo=_brl_custo,
                cot_usd=_cot_usd, cot_brl=_cot_brl,
                val_brl=_val_brl, ganho_brl=_ganho_brl, ganho_pct=_ganho_pct,
                delta_usd=_delta_usd,
                rows=_rows,
            )

        # ── HERO: totais em BRL ───────────────────────────────────────────
        total_val_brl   = valor_usd_hoje + sum(v['val_brl'] for v in fx2_data.values())
        total_custo_brl = brl_gasto_usd
        total_ganho_brl = total_val_brl - total_custo_brl
        total_ganho_pct = (total_ganho_brl / total_custo_brl * 100) if total_custo_brl > 0 else 0.0
        _hc = '#34d399' if total_ganho_brl >= 0 else '#f87171'
        _hs = '+' if total_ganho_brl >= 0 else ''

        st.markdown(f"""
        <div class="fx-dash" style="margin-top:20px;">
          <div class="c-saldo-lbl">💱 TOTAL EM REAIS (moeda de consumo)</div>
          <div class="c-saldo-val" style="color:{_hc};">R$ {total_val_brl:,.2f}</div>
          <div class="c-grid">
            <div class="c-gi">
              <div class="c-gl">BRL Investido</div>
              <div class="c-gv" style="color:#94a3b8;">R$ {total_custo_brl:,.2f}</div>
            </div>
            <div class="c-gi">
              <div class="c-gl">Ganho Cambial</div>
              <div class="c-gv" style="color:{_hc};">{_hs}R$ {abs(total_ganho_brl):,.2f}</div>
              <div class="c-gp" style="color:{_hc};">{_hs}{total_ganho_pct:.1f}%</div>
            </div>
            <div class="c-gi">
              <div class="c-gl">Saldo USD</div>
              <div class="c-gv" style="color:#94a3b8;">US$ {usd_net:,.2f}</div>
              {"" if usd_vendido <= 0 else f'<div style="font-size:0.62rem;color:#475569;">−US$ {usd_vendido:,.0f} usados</div>'}
            </div>
            <div class="c-gi">
              <div class="c-gl">Moedas</div>
              <div class="c-gv" style="color:#94a3b8;">{1 + len(fx2_data)}</div>
            </div>
          </div>
        </div>
        """, unsafe_allow_html=True)

        st.markdown('<div class="tab-header-sm" style="margin-top:28px;">◈ Cadeia de Conversão</div>',
                    unsafe_allow_html=True)
        st.caption("USD é a moeda intermediária: recebe de BRL e distribui para outras moedas. O saldo USD = comprado − convertido.")

        # ── CARD USD (Camada 1) ───────────────────────────────────────────
        _vc_usd = '#34d399' if ganho_usd_brl >= 0 else '#f87171'
        _sg_usd = '+' if ganho_usd_brl >= 0 else ''
        _dc_usd = '#34d399' if delta_pm_usd >= 0 else '#f87171'
        _fill_usd = min(max(int((delta_pm_usd / 20 + 0.5) * 100), 2), 98)

        _ledger_rows = ''
        for _mx, _dx in (fx2_data or {}).items():
            _ledger_rows += (
                '<div style="display:flex;align-items:center;justify-content:space-between;'
                'padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);">'
                f'<span style="font-size:0.72rem;color:#64748b;">− Convertido → {_mx}</span>'
                f'<span style="font-size:0.82rem;font-weight:700;color:#f87171;">US$ {_dx["usd_gasto"]:,.2f}</span>'
                '</div>'
            )

        st.markdown(f"""
        <div style="background:rgba(15,23,42,0.65);border:1px solid rgba(0,176,255,0.15);
             border-radius:20px;padding:22px 26px;margin-bottom:16px;position:relative;overflow:hidden;
             box-shadow:0 10px 40px rgba(0,0,0,0.3);">
          <div style="position:absolute;inset:0;border-radius:20px;padding:1px;pointer-events:none;
               background:linear-gradient(135deg,rgba(0,176,255,0.2) 0%,transparent 60%,rgba(0,176,255,0.05) 100%);
               -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
               mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
               -webkit-mask-composite:xor;mask-composite:exclude;"></div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:1.8rem;">🇺🇸</span>
              <div>
                <div style="font-size:1rem;font-weight:700;color:#f1f5f9;">USD</div>
                <div style="font-size:0.65rem;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Conta intermediária · recebe BRL · distribui</div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:0.65rem;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Ganho cambial (BRL)</div>
              <div style="font-size:1.5rem;font-weight:800;color:{_vc_usd};">{_sg_usd}R$ {abs(ganho_usd_brl):,.0f}</div>
              <div style="font-size:0.75rem;color:{_vc_usd};">{_sg_usd}{ganho_usd_pct:.1f}%</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">
            <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:12px;">
              <div style="font-size:0.58rem;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">PM compra (R$/USD)</div>
              <div style="font-size:0.95rem;font-weight:700;color:#94a3b8;">R$ {pm_usd_brl:.4f}</div>
            </div>
            <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:12px;">
              <div style="font-size:0.58rem;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Cotação hoje</div>
              <div style="font-size:0.95rem;font-weight:700;color:#f1f5f9;">R$ {cot_usd_brl:.4f}</div>
              <div style="font-size:0.65rem;color:{_dc_usd};">{'+' if delta_pm_usd>=0 else ''}{delta_pm_usd:.1f}% vs PM</div>
            </div>
            <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:12px;">
              <div style="font-size:0.58rem;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Valor em BRL</div>
              <div style="font-size:0.95rem;font-weight:700;color:#f1f5f9;">R$ {valor_usd_hoje:,.0f}</div>
              <div style="font-size:0.65rem;color:#475569;">custo R$ {brl_custo_usd_net:,.0f}</div>
            </div>
          </div>
          <!-- Ledger USD: saldo corrente como conta intermediária -->
          <div style="background:rgba(0,0,0,0.25);border-radius:12px;padding:14px 16px;margin-bottom:16px;border:1px solid rgba(255,255,255,0.05);">
            <div style="font-size:0.55rem;color:#475569;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Saldo USD — conta intermediária</div>
            <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
              <span style="font-size:0.72rem;color:#64748b;">＋ Comprado com BRL</span>
              <span style="font-size:0.82rem;font-weight:700;color:#34d399;">US$ {usd_comprado:,.2f}</span>
            </div>
            {_ledger_rows}
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0 2px 0;">
              <span style="font-size:0.75rem;font-weight:700;color:#f1f5f9;">= Saldo disponível</span>
              <span style="font-size:1.0rem;font-weight:800;color:#f1f5f9;">US$ {usd_net:,.2f}</span>
            </div>
          </div>
          <div style="margin-bottom:4px;display:flex;justify-content:space-between;">
            <span style="font-size:0.6rem;color:#374151;">PM R$ {pm_usd_brl:.4f} → Cotação R$ {cot_usd_brl:.4f}</span>
            <span style="font-size:0.6rem;font-weight:600;color:{_dc_usd};">{'+' if delta_pm_usd>=0 else ''}{delta_pm_usd:.2f}%</span>
          </div>
          <div style="height:4px;background:rgba(255,255,255,0.05);border-radius:3px;position:relative;overflow:hidden;">
            <div style="position:absolute;top:0;left:0;height:100%;width:{_fill_usd}%;background:{_dc_usd};border-radius:3px;opacity:0.8;"></div>
            <div style="position:absolute;top:0;left:50%;height:100%;width:1.5px;background:rgba(255,255,255,0.2);"></div>
          </div>
        </div>
        """, unsafe_allow_html=True)

        # ── CARDS Camada 2 (USD → outras moedas) ─────────────────────────
        if fx2_data:
            ncols2 = min(len(fx2_data), 3)
            fx2_cols = st.columns(ncols2)
            for _i, (_m, _d) in enumerate(fx2_data.items()):
                _c   = fx_color(_m)
                _fl  = fx_flag(_m)
                _vc  = '#34d399' if _d['ganho_brl'] >= 0 else '#f87171'
                _sg  = '+' if _d['ganho_brl'] >= 0 else ''
                _du  = '#34d399' if _d['delta_usd'] >= 0 else '#f87171'
                _fu  = min(max(int((_d['delta_usd'] / 20 + 0.5) * 100), 2), 98)
                with fx2_cols[_i % ncols2]:
                    st.markdown(f"""
                    <div style="background:rgba(15,23,42,0.65);border:1px solid rgba(255,255,255,0.07);
                         border-radius:20px;padding:20px;margin-bottom:12px;border-top:3px solid {_c};">
                      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                        <div style="display:flex;align-items:center;gap:8px;">
                          <span style="font-size:1.5rem;">{_fl}</span>
                          <div>
                            <div style="font-size:0.95rem;font-weight:700;color:#f1f5f9;">{_m}</div>
                            <div style="font-size:0.6rem;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;">Camada 2 · USD → {_m}</div>
                          </div>
                        </div>
                        <div style="text-align:right;">
                          <div style="font-size:0.6rem;color:#64748b;">Ganho (BRL)</div>
                          <div style="font-size:1.1rem;font-weight:800;color:{_vc};">{_sg}R$ {abs(_d['ganho_brl']):,.0f}</div>
                          <div style="font-size:0.7rem;color:{_vc};">{_sg}{_d['ganho_pct']:.1f}%</div>
                        </div>
                      </div>
                      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
                        <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:10px;">
                          <div style="font-size:0.55rem;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">PM (US$/{_m})</div>
                          <div style="font-size:0.85rem;font-weight:700;color:#94a3b8;">US$ {_d['pm_usd']:.4f}</div>
                        </div>
                        <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:10px;">
                          <div style="font-size:0.55rem;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Cotação US$/{_m}</div>
                          <div style="font-size:0.85rem;font-weight:700;color:#f1f5f9;">US$ {_d['cot_usd']:.4f}</div>
                          <div style="font-size:0.6rem;color:{_du};">{'+' if _d['delta_usd']>=0 else ''}{_d['delta_usd']:.1f}% vs PM</div>
                        </div>
                        <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:10px;">
                          <div style="font-size:0.55rem;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">PM efetivo (R$/{_m})</div>
                          <div style="font-size:0.85rem;font-weight:700;color:#94a3b8;">R$ {_d['pm_brl']:.4f}</div>
                          <div style="font-size:0.6rem;color:#475569;">via PM USD</div>
                        </div>
                        <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:10px;">
                          <div style="font-size:0.55rem;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Cotação R$/{_m}</div>
                          <div style="font-size:0.85rem;font-weight:700;color:#f1f5f9;">R$ {_d['cot_brl']:.4f}</div>
                        </div>
                      </div>
                      <div style="display:flex;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.05);padding-top:12px;">
                        <div>
                          <div style="font-size:0.55rem;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;">Posição</div>
                          <div style="font-size:0.85rem;font-weight:700;color:#f1f5f9;">{_m} {_d['qtd']:,.2f}</div>
                          <div style="font-size:0.6rem;color:#475569;">US$ {_d['usd_gasto']:,.2f} gastos</div>
                        </div>
                        <div style="text-align:right;">
                          <div style="font-size:0.55rem;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;">Valor em BRL</div>
                          <div style="font-size:0.85rem;font-weight:700;color:#f1f5f9;">R$ {_d['val_brl']:,.0f}</div>
                          <div style="font-size:0.6rem;color:#475569;">custo R$ {_d['brl_custo']:,.0f}</div>
                        </div>
                      </div>
                      <div style="margin-top:10px;">
                        <div style="height:3px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden;">
                          <div style="height:100%;width:{_fu}%;background:{_du};border-radius:3px;opacity:0.8;"></div>
                        </div>
                      </div>
                    </div>
                    """, unsafe_allow_html=True)

                    # Detalhamento por transação para diagnóstico do PM
                    _rws = _d.get('rows', pd.DataFrame())
                    if not _rws.empty:
                        _cols_show = [c for c in ['data', 'valor_origem', 'valor_destino', '_taxa_impl'] if c in _rws.columns]
                        _rws_disp = _rws[_cols_show].copy()
                        _rws_disp.rename(columns={
                            'data': 'Data',
                            'valor_origem': f'USD enviado',
                            'valor_destino': f'{_m} recebido',
                            '_taxa_impl': f'Taxa US$/{_m}',
                        }, inplace=True)
                        with st.expander(f"🔍 Transações usadas no PM de {_m} ({len(_rws_disp)} registro{'s' if len(_rws_disp)!=1 else ''})", expanded=False):
                            st.caption(f"PM = total USD enviado ÷ total {_m} recebido = {_d['usd_gasto']:,.4f} ÷ {_d['qtd']:,.4f} = **{_d['pm_usd']:.4f}**")
                            _col_cfg = {
                                'Data': st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
                                f'USD enviado': st.column_config.NumberColumn("USD enviado", format="%.4f"),
                                f'{_m} recebido': st.column_config.NumberColumn(f"{_m} recebido", format="%.4f"),
                                f'Taxa US$/{_m}': st.column_config.NumberColumn(f"Taxa US$/{_m}", format="%.4f"),
                            }
                            st.dataframe(_rws_disp, column_config=_col_cfg, hide_index=True, use_container_width=True)

        # ── GRÁFICO HISTÓRICO ─────────────────────────────────────────────
        st.divider()
        st.markdown('<div class="tab-header-sm">◉ Histórico de Cotação</div>', unsafe_allow_html=True)

        @st.cache_data(ttl=3600, show_spinner=False)
        def _hist_fx(ticker):
            try:
                _d = yf.download(ticker, period="2y", interval="1d", progress=False, auto_adjust=True)
                if isinstance(_d.columns, pd.MultiIndex):
                    _d.columns = _d.columns.get_level_values(0)
                return _d['Close'].dropna() if 'Close' in _d.columns else pd.Series(dtype=float)
            except Exception:
                return pd.Series(dtype=float)

        _all_moedas = ['USD'] + list(fx2_data.keys())
        _sel_col, _ = st.columns([2, 6])
        with _sel_col:
            _m_graf = st.selectbox("Ver histórico de:", _all_moedas, key="fx_hist_sel")

        if _m_graf == 'USD':
            _ticker_h = 'BRL=X'
            _pm_line  = pm_usd_brl
            _pm_label = f"PM R$ {pm_usd_brl:.4f}"
            _cot_h    = cot_usd_brl
            _lbl_y    = "R$/USD"
        else:
            _ticker_h = f'{_m_graf}BRL=X' if _m_graf in ('EUR', 'GBP') else f'{_m_graf}BRL=X'
            _pm_line  = fx2_data[_m_graf]['pm_brl']
            _pm_label = f"PM BRL R$ {_pm_line:.4f}"
            _cot_h    = fx2_data[_m_graf]['cot_brl']
            _lbl_y    = f"R$/{_m_graf}"

        _serie = _hist_fx(_ticker_h)
        if not isinstance(_serie, pd.Series) or _serie.empty:
            st.caption("Dados históricos indisponíveis para este par.")
        else:
            _sma21 = _serie.rolling(21).mean()
            _color = fx_color(_m_graf)
            try:
                _r, _g, _b = int(_color[1:3], 16), int(_color[3:5], 16), int(_color[5:7], 16)
                _fill = f"rgba({_r},{_g},{_b},0.10)"
            except Exception:
                _fill = "rgba(99,102,241,0.10)"

            _fig = go.Figure()
            _fig.add_trace(go.Scatter(
                x=_serie.index, y=_serie.values, name='Cotação',
                fill='tozeroy', fillcolor=_fill,
                line=dict(color=_color, width=2),
                hovertemplate='%{x|%d/%m/%Y}<br>%{y:.4f}<extra>Cotação</extra>',
            ))
            _fig.add_trace(go.Scatter(
                x=_sma21.index, y=_sma21.values, name='MM21',
                line=dict(color='rgba(255,255,255,0.2)', width=1, dash='dot'),
                hovertemplate='%{x|%d/%m/%Y}<br>%{y:.4f}<extra>MM21</extra>',
            ))
            if _pm_line > 0:
                _pm_c = '#34d399' if _cot_h >= _pm_line else '#f87171'
                _fig.add_hline(
                    y=_pm_line, line_dash="dash", line_color=_pm_c, line_width=1.5,
                    annotation_text=_pm_label,
                    annotation_position="top right",
                    annotation_font_color=_pm_c, annotation_font_size=11,
                )
            # Marcadores de compra
            _df_compras = df_cambio[df_cambio.moeda_destino == _m_graf].copy()
            if not _df_compras.empty and 'data' in _df_compras.columns:
                _df_compras['data'] = pd.to_datetime(_df_compras['data'], errors='coerce')
                _df_compras = _df_compras.dropna(subset=['data'])
                _in_range = _df_compras[_df_compras['data'] >= _serie.index[0]]
                if not _in_range.empty:
                    _by = [
                        float(_serie.iloc[min(_serie.index.searchsorted(_d), len(_serie) - 1)])
                        for _d in _in_range['data']
                    ]
                    _fig.add_trace(go.Scatter(
                        x=_in_range['data'].tolist(), y=_by, name='Compras',
                        mode='markers',
                        marker=dict(symbol='triangle-up', size=11, color='#34d399',
                                    line=dict(color='rgba(255,255,255,0.4)', width=1)),
                        hovertemplate='<b>Compra</b><br>%{x|%d/%m/%Y}<br>%{y:.4f}<extra></extra>',
                    ))
            _y_min, _y_max = float(_serie.min()), float(_serie.max())
            _mg = (_y_max - _y_min) * 0.08
            _fig.update_layout(
                height=340, hovermode="x unified", template="plotly_dark",
                showlegend=True,
                legend=dict(orientation="h", y=1.06, x=0, font=dict(size=10)),
                margin=dict(l=0, r=0, t=10, b=0),
                yaxis=dict(title=dict(text=_lbl_y, font=dict(size=10, color='#64748b')),
                           range=[_y_min - _mg, _y_max + _mg]),
                paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)',
            )
            st.plotly_chart(_fig, use_container_width=True)

        # ── HISTÓRICO DE TRANSAÇÕES ───────────────────────────────────────
        with st.expander("📋 Histórico de transações", expanded=False):
            _df_hist = df_cambio.copy()
            if 'data' in _df_hist.columns:
                _df_hist['data'] = pd.to_datetime(_df_hist['data'], errors='coerce')
                _df_hist = _df_hist.sort_values('data', ascending=False)

            # Calcula taxa implícita
            _df_hist['taxa_impl'] = (
                _df_hist['valor_origem'] / _df_hist['valor_destino']
            ).where(_df_hist['valor_destino'] > 0)

            _cols_show = [c for c in ['data', 'moeda_origem', 'valor_origem',
                                       'moeda_destino', 'valor_destino', 'taxa_impl',
                                       'corretora destino'] if c in _df_hist.columns]
            st.dataframe(
                _df_hist[_cols_show],
                column_config={
                    'data':             st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
                    'moeda_origem':     st.column_config.TextColumn("De", width="small"),
                    'valor_origem':     st.column_config.NumberColumn("Valor enviado", format="%.2f"),
                    'moeda_destino':    st.column_config.TextColumn("Para", width="small"),
                    'valor_destino':    st.column_config.NumberColumn("Valor recebido", format="%.2f"),
                    'taxa_impl':        st.column_config.NumberColumn("Taxa", format="%.4f"),
                    'corretora destino': st.column_config.TextColumn("Corretora"),
                },
                hide_index=True, use_container_width=True,
            )

with tab_alav:
    st.markdown('<div class="tab-header">🎚️ Alavancagem</div>', unsafe_allow_html=True)
    st.caption("Exposição alavancada, margem utilizada e custo de funding.")

    # ── CSS exclusivo da aba Alavancagem (bege dourado + glass) ──
    st.markdown("""
    <style>
    .lev-dash {
        background: rgba(15, 23, 42, 0.6);
        backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        border: 1px solid transparent;
        border-radius: 20px;
        padding: 25px 40px;
        margin-bottom: 20px;
        position: relative; overflow: hidden;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    }
    .lev-dash::before {
        content:''; position:absolute; inset:0; border-radius:20px; padding:1px;
        background: linear-gradient(135deg,
            rgba(245, 222, 179, 0.25) 0%,
            rgba(245, 222, 179, 0.08) 50%,
            rgba(245, 222, 179, 0.25) 100%
        );
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor; mask-composite: exclude; pointer-events:none;
    }
    .lev-hero-label {
        font-size: 0.75rem; font-weight: 600;
        color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;
        margin-bottom: 6px;
    }
    .lev-hero-val {
        font-size: 2.6rem; font-weight: 800;
        color: #f5deb3; line-height: 1; margin-bottom: 4px;
    }
    .lev-hero-sub { font-size: 0.8rem; color: #64748b; }

    .lev-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin-top: 20px;
    }
    .lev-gi {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        padding: 14px 18px;
    }
    .lev-gl {
        font-size: 0.7rem; color: #94a3b8;
        text-transform: uppercase; letter-spacing: 0.5px;
        margin-bottom: 4px;
    }
    .lev-gv { font-size: 1.1rem; font-weight: 700; color: #f1f5f9; }
    .lev-gv.warm { color: #f5deb3; }
    .lev-gv.pos  { color: #34d399; }
    .lev-gv.neg  { color: #f87171; }
    </style>
    """, unsafe_allow_html=True)

    # ── Hero placeholder (estrutura inicial — dados virão nos próximos passos) ──
    st.markdown("""
    <div class="lev-dash">
        <div class="lev-hero-label">Exposição Alavancada</div>
        <div class="lev-hero-val">—</div>
        <div class="lev-hero-sub">Aguardando integração com dados de margem</div>
        <div class="lev-grid">
            <div class="lev-gi">
                <div class="lev-gl">Margem Utilizada</div>
                <div class="lev-gv warm">—</div>
            </div>
            <div class="lev-gi">
                <div class="lev-gl">Margem Disponível</div>
                <div class="lev-gv warm">—</div>
            </div>
            <div class="lev-gi">
                <div class="lev-gl">Fator de Alavancagem</div>
                <div class="lev-gv warm">—x</div>
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    st.markdown(
        '<div class="glass-alert glass-info">'
        'ℹ️ Aba criada. Os indicadores de alavancagem serão conectados às fontes '
        'de dados (posições margeadas, custo de funding e garantias) nas próximas entregas.'
        '</div>',
        unsafe_allow_html=True
    )

with tab4:
    try:
        if not df_proventos_bruto.empty:
            df_p = df_proventos_bruto.copy()

            if filtro_moeda != 'Todas':
                df_p = df_p[df_p['moeda'] == filtro_moeda]

            df_p['setor_calc'] = df_p['ticker'].apply(identificar_setor_ativo)

            if filtro_setor:
                df_p = df_p[df_p['setor_calc'].isin(filtro_setor)]

            if lista_tickers_final:
                def limpar_sufixo_prov(t): return str(t).replace('.SA','').replace('.TO','').replace('.L','').strip().upper()
                tickers_permitidos = {limpar_sufixo_prov(t) for t in lista_tickers_final}
                df_p = df_p[df_p['ticker'].apply(limpar_sufixo_prov).isin(tickers_permitidos)]
            else:
                df_p = df_p[0:0]

            def conv_brl(row):
                m = str(row.get('moeda', 'BRL')).strip().upper()
                if m in ['NAN','NONE','']: m = 'BRL'
                v = row['valor'] if pd.notna(row['valor']) else 0.0
                if m == 'USD': return v * usd
                if m == 'CAD': return v * cad
                if m == 'EUR': return v * eur
                return v

            if not df_p.empty:
                df_p['valor_brl'] = df_p.apply(conv_brl, axis=1)

            st.markdown('<div class="tab-header">💰 Proventos Recebidos</div>', unsafe_allow_html=True)

            if not df_p.empty:
                df_p['ano_real'] = df_p['data'].dt.year
                df_p['mes_real'] = df_p['data'].dt.month
                anos_disponiveis = sorted(
                    [int(a) for a in df_p['ano_real'].dropna().unique().tolist()], reverse=True
                )
                meses_map = {1:'Jan',2:'Fev',3:'Mar',4:'Abr',5:'Mai',6:'Jun',
                             7:'Jul',8:'Ago',9:'Set',10:'Out',11:'Nov',12:'Dez'}

                col_ano, col_mes, _ = st.columns([2, 2, 1])
                with col_ano:
                    anos_sel = st.multiselect("Ano", anos_disponiveis, placeholder="Todos os anos", key="prov_ano")
                with col_mes:
                    meses_sel_nomes = st.multiselect("Mês", list(meses_map.values()), placeholder="Todos os meses", key="prov_mes")
                    meses_sel = [k for k, v in meses_map.items() if v in meses_sel_nomes]

                df_filter = df_p.dropna(subset=['data']).copy()
                if anos_sel: df_filter = df_filter[df_filter['ano_real'].isin(anos_sel)].copy()
                if meses_sel: df_filter = df_filter[df_filter['mes_real'].isin(meses_sel)].copy()

                if not df_filter.empty:
                    # ── KPIs ──────────────────────────────────────────────────────
                    bruto       = df_filter[df_filter['valor_brl'] > 0]['valor_brl'].sum()
                    imposto_val = abs(df_filter[df_filter['valor_brl'] < 0]['valor_brl'].sum())
                    liq         = df_filter['valor_brl'].sum()
                    qtd_meses   = len(df_filter['data'].dt.to_period('M').unique())
                    media       = liq / qtd_meses if qtd_meses > 0 else 0

                    df_filter['sort_mes']  = df_filter['data'].dt.strftime('%Y-%m')
                    df_filter['label_mes'] = df_filter['data'].dt.strftime('%b/%Y')
                    df_mensal = df_filter.groupby(['sort_mes','label_mes'])['valor_brl'].sum().reset_index()
                    df_mensal_pos = df_mensal[df_mensal['valor_brl'] > 0]
                    if not df_mensal_pos.empty:
                        bi = df_mensal_pos['valor_brl'].idxmax()
                        best_mes_label = df_mensal_pos.loc[bi, 'label_mes']
                        best_mes_val   = df_mensal_pos.loc[bi, 'valor_brl']
                    else:
                        best_mes_label, best_mes_val = "—", 0.0

                    k1, k2, k3, k4, k5 = st.columns(5)
                    with k1:
                        st.markdown(render_metric_card("Total Bruto", f"R$ {bruto:,.0f}", icon="💰"), unsafe_allow_html=True)
                    with k2:
                        st.markdown(render_metric_card("Líquido Caixa", f"R$ {liq:,.0f}", icon="🏁"), unsafe_allow_html=True)
                    with k3:
                        imp_pct = f"{imposto_val/bruto*100:.1f}% do bruto" if bruto > 0 else None
                        st.markdown(render_metric_card("Impostos Retidos", f"R$ {imposto_val:,.0f}",
                                                       delta=imp_pct, delta_positive=False, icon="🧾"), unsafe_allow_html=True)
                    with k4:
                        st.markdown(render_metric_card("Média Mensal", f"R$ {media:,.0f}",
                                                       subtitle=f"{qtd_meses} meses no período", icon="📊"), unsafe_allow_html=True)
                    with k5:
                        st.markdown(render_metric_card("Melhor Mês", f"R$ {best_mes_val:,.0f}",
                                                       subtitle=best_mes_label, icon="🏆"), unsafe_allow_html=True)

                    st.markdown('<div style="height:4px"></div>', unsafe_allow_html=True)

                    # ── EVOLUÇÃO MENSAL (barras empilhadas + linha acumulada) ─────
                    df_filter['bruto_m']   = df_filter['valor_brl'].apply(lambda x: x if x > 0 else 0)
                    df_filter['imposto_m'] = df_filter['valor_brl'].apply(lambda x: abs(x) if x < 0 else 0)
                    df_time = (
                        df_filter.groupby(['sort_mes','label_mes'])
                        .agg(bruto_m=('bruto_m','sum'), imposto_m=('imposto_m','sum'), liq_m=('valor_brl','sum'))
                        .reset_index().sort_values('sort_mes')
                    )
                    if not df_time.empty:
                        df_time['acum'] = df_time['liq_m'].cumsum()
                        fig_evo = go.Figure()
                        fig_evo.add_trace(go.Bar(
                            name='Bruto recebido', x=df_time['label_mes'], y=df_time['bruto_m'],
                            marker_color='rgba(52,211,153,0.75)',
                            hovertemplate='<b>%{x}</b><br>Bruto: R$ %{y:,.2f}<extra></extra>'
                        ))
                        fig_evo.add_trace(go.Bar(
                            name='Impostos', x=df_time['label_mes'], y=-df_time['imposto_m'],
                            marker_color='rgba(248,113,113,0.60)',
                            hovertemplate='<b>%{x}</b><br>Impostos: R$ %{y:,.2f}<extra></extra>'
                        ))
                        fig_evo.add_trace(go.Scatter(
                            name='Acumulado', x=df_time['label_mes'], y=df_time['acum'],
                            mode='lines+markers',
                            line=dict(color='#a5b4fc', width=2, dash='dot'),
                            marker=dict(size=5, color='#a5b4fc'),
                            yaxis='y2',
                            hovertemplate='<b>%{x}</b><br>Acumulado: R$ %{y:,.2f}<extra></extra>'
                        ))
                        fig_evo.update_layout(
                            title=dict(text='Evolução Mensal · Bruto × Impostos × Acumulado',
                                       font=dict(size=13, color='#94a3b8')),
                            barmode='relative',
                            xaxis=dict(type='category', tickfont=dict(size=11), gridcolor='rgba(255,255,255,0.04)'),
                            yaxis=dict(title='R$ / mês', gridcolor='rgba(255,255,255,0.05)', zeroline=True,
                                       zerolinecolor='rgba(255,255,255,0.1)'),
                            yaxis2=dict(title='Acumulado (R$)', overlaying='y', side='right',
                                        showgrid=False),
                            legend=dict(orientation='h', yanchor='bottom', y=1.02, xanchor='right', x=1,
                                        font=dict(size=11)),
                            height=340, hovermode='x unified',
                            margin=dict(t=50, b=30, l=10, r=10),
                            paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)',
                            font=dict(color='#94a3b8')
                        )
                        st.plotly_chart(fig_evo, use_container_width=True)

                    # ── DONUT + RANKING ───────────────────────────────────────────
                    col_donut, col_rank = st.columns([1, 1])

                    with col_donut:
                        st.markdown('<div class="tab-header-sm">🎯 Distribuição</div>', unsafe_allow_html=True)
                        grp = st.radio("Agrupar por:", ["Ativo", "Setor", "Tipo"],
                                       horizontal=True, key="radio_prov_grp")
                        col_grp = 'ticker'
                        if grp == "Setor": col_grp = 'setor_calc'
                        elif grp == "Tipo" and 'lancamento' in df_filter.columns: col_grp = 'lancamento'

                        df_pie = (df_filter.groupby(col_grp)['valor_brl']
                                  .apply(lambda x: x[x > 0].sum()).reset_index())
                        df_pie = df_pie[df_pie['valor_brl'] > 0].sort_values('valor_brl', ascending=False)

                        if not df_pie.empty:
                            _PAL = ['#6366f1','#8b5cf6','#a78bfa','#34d399','#10b981',
                                     '#60a5fa','#f59e0b','#f87171','#22d3ee','#fb923c']
                            fig_donut = go.Figure(go.Pie(
                                labels=df_pie[col_grp], values=df_pie['valor_brl'],
                                hole=0.55, marker_colors=_PAL[:len(df_pie)],
                                textinfo='percent',
                                hovertemplate='<b>%{label}</b><br>R$ %{value:,.2f} · %{percent}<extra></extra>'
                            ))
                            fig_donut.add_annotation(
                                text=f"R$ {bruto:,.0f}", x=0.5, y=0.5, showarrow=False,
                                font=dict(size=13, color='#f1f5f9', family='Outfit'), align='center'
                            )
                            fig_donut.update_layout(
                                showlegend=True,
                                legend=dict(font=dict(size=10), orientation='v', x=1.02, y=0.5),
                                margin=dict(t=10, b=10, l=0, r=70),
                                height=290,
                                paper_bgcolor='rgba(0,0,0,0)', font=dict(color='#94a3b8')
                            )
                            st.plotly_chart(fig_donut, use_container_width=True)
                        else:
                            st.markdown('<div class="glass-alert glass-info">ℹ️ Sem valores para o gráfico.</div>', unsafe_allow_html=True)

                    with col_rank:
                        st.markdown('<div class="tab-header-sm">🏆 Ranking por Ativo</div>', unsafe_allow_html=True)
                        df_rank = (df_filter[df_filter['valor_brl'] > 0]
                                   .groupby('ticker')['valor_brl'].sum().reset_index()
                                   .sort_values('valor_brl', ascending=False).head(10))
                        df_rank['pct'] = df_rank['valor_brl'] / df_rank['valor_brl'].sum() * 100
                        df_rank = df_rank.reset_index(drop=True)

                        if not df_rank.empty:
                            max_val = df_rank['valor_brl'].max()
                            rows_html = ""
                            for i, row in df_rank.iterrows():
                                bar_w  = row['valor_brl'] / max_val * 100
                                medal  = {0:'🥇', 1:'🥈', 2:'🥉'}.get(i, f"#{i+1}")
                                rows_html += f"""
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:11px;">
      <span style="font-size:0.88rem;min-width:26px;text-align:center;">{medal}</span>
      <div style="flex:1;">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <span style="font-size:0.82rem;font-weight:600;color:#e2e8f0;">{row['ticker']}</span>
          <span style="font-size:0.75rem;color:#94a3b8;">R$ {row['valor_brl']:,.0f} · {row['pct']:.1f}%</span>
        </div>
        <div style="height:5px;background:rgba(255,255,255,0.06);border-radius:3px;">
          <div style="height:100%;width:{bar_w:.1f}%;background:linear-gradient(90deg,#6366f1,#34d399);border-radius:3px;"></div>
        </div>
      </div>
    </div>"""
                            st.markdown(f'<div style="padding:6px 0">{rows_html}</div>', unsafe_allow_html=True)

                    # ── SANKEY ────────────────────────────────────────────────────
                    st.markdown('<div class="tab-header-sm" style="margin-top:20px;">🌊 Fluxo de Capital · Ativo → Setor → Moeda</div>',
                                unsafe_allow_html=True)

                    if 'moeda' not in df_filter.columns:
                        df_filter['moeda'] = 'BRL'

                    df_L1 = df_filter.groupby(['ticker','setor_calc'])['valor_brl'].sum().reset_index()
                    df_L1.columns = ['source','target','value']
                    df_L2 = df_filter.groupby(['setor_calc','moeda'])['valor_brl'].sum().reset_index()
                    df_L2.columns = ['source','target','value']
                    df_L1 = df_L1[df_L1['value'] > 0]
                    df_L2 = df_L2[df_L2['value'] > 0]

                    if not df_L1.empty and not df_L2.empty:
                        labels_tickers = sorted(df_L1['source'].unique().tolist())
                        labels_sectors = sorted(df_L1['target'].unique().tolist())
                        labels_moedas  = sorted(df_L2['target'].unique().tolist())
                        all_labels = labels_tickers + labels_sectors + labels_moedas
                        id_map = {l: i for i, l in enumerate(all_labels)}

                        sources, targets, values, link_colors = [], [], [], []
                        for _, row in df_L1.iterrows():
                            sources.append(id_map[row['source']]); targets.append(id_map[row['target']])
                            values.append(row['value']); link_colors.append('rgba(99,102,241,0.35)')
                        for _, row in df_L2.iterrows():
                            sources.append(id_map[row['source']]); targets.append(id_map[row['target']])
                            values.append(row['value']); link_colors.append('rgba(52,211,153,0.35)')

                        node_colors = []
                        for lbl in all_labels:
                            if lbl in labels_tickers: node_colors.append('#6366f1')
                            elif lbl in labels_sectors: node_colors.append('#34d399')
                            else: node_colors.append('#f59e0b')

                        fig_sk = go.Figure(go.Sankey(
                            node=dict(pad=20, thickness=18,
                                      line=dict(color='rgba(255,255,255,0.08)', width=0.5),
                                      label=all_labels, color=node_colors,
                                      hovertemplate='%{label}<br>R$ %{value:,.2f}<extra></extra>'),
                            link=dict(source=sources, target=targets, value=values,
                                      color=link_colors,
                                      hovertemplate='R$ %{value:,.2f}<extra></extra>')
                        ))
                        fig_sk.update_layout(
                            height=520, font=dict(size=12, color='#cbd5e1'),
                            margin=dict(l=10, r=10, t=10, b=10),
                            paper_bgcolor='rgba(0,0,0,0)'
                        )
                        st.plotly_chart(fig_sk, use_container_width=True)
                    else:
                        st.markdown('<div class="glass-alert glass-info">ℹ️ Dados insuficientes para o diagrama de fluxo.</div>', unsafe_allow_html=True)

                    # ── EXTRATO COMPLETO ──────────────────────────────────────────
                    with st.expander("📋 Extrato completo", expanded=False):
                        def _st_neg(v): return 'color:#f87171' if v < 0 else 'color:#34d399'
                        cols_det = ['data','ticker','lancamento','valor','moeda','valor_brl']
                        cols_det = [c for c in cols_det if c in df_filter.columns]
                        df_display = df_filter[cols_det].dropna(subset=['data']).sort_values('data', ascending=False)
                        st.dataframe(
                            df_display.style
                            .format({'valor':'{:,.2f}', 'valor_brl':'R$ {:,.2f}', 'data':'{:%d/%m/%Y}'})
                            .map(_st_neg, subset=['valor','valor_brl']),
                            use_container_width=True, height=300
                        )

                else:
                    st.markdown('<div class="glass-alert glass-warn">⚠️ Sem dados para o período selecionado.</div>', unsafe_allow_html=True)
            else:
                st.markdown('<div class="glass-alert glass-warn">⚠️ Nenhum provento encontrado para os ativos filtrados.</div>', unsafe_allow_html=True)
        else:
            st.markdown('<div class="glass-alert glass-info">ℹ️ Arquivo de proventos vazio.</div>', unsafe_allow_html=True)
        
    except Exception as _e4:
        import traceback as _tb4
        st.warning(f"Proventos indisponíveis: {_e4}")
        with st.expander("Detalhes técnicos", expanded=False):
            st.code(_tb4.format_exc())
with tab7:
    st.markdown('<div class="tab-header">🦁 Central Fiscal Inteligente</div>', unsafe_allow_html=True)
    st.caption("Regime de Competência | Cesta Swing Unificada | FIIs Isolados")
    
    # Configuração fixa: Regra dos 20k sempre ativa
    FORCAR_COMPENSACAO_20K = True

    @st.cache_data(ttl=3600)
    def carregar_ptax_oficial():
        """Carrega histórico de PTAX oficial do BCB (aba 'p_tax' no Google Sheets)."""
        try:
            from core.data.provider import DataProvider
            from core.utils import parse_decimal_br, parse_date_br
            
            df = DataProvider.get_ptax()
            
            if df.empty:
                return pd.DataFrame()
            
            # Normaliza colunas
            df.columns = df.columns.str.strip().str.lower()
            
            # Identifica colunas de data e taxa
            col_data = None
            col_taxa = None
            
            for c in df.columns:
                c_lower = str(c).lower().strip()
                if 'data' in c_lower and col_data is None: 
                    col_data = c
                elif any(x in c_lower for x in ['taxa', 'ptax', 'cotacao', 'valor', 'usd', 'rate']) and col_taxa is None: 
                    col_taxa = c
            
            if not col_data or not col_taxa:
                # Fallback: assume primeira coluna é data, segunda é taxa
                if len(df.columns) >= 2:
                    col_data = df.columns[0]
                    col_taxa = df.columns[1]
                else:
                    return pd.DataFrame()
            
            # Processa dados
            df_ptax = df[[col_data, col_taxa]].copy()
            df_ptax.columns = ['Data', 'Taxa']
            
            # Parse de data - TRATA SERIAL DATES DO EXCEL/SHEETS
            def safe_parse_date(v):
                if pd.isna(v) or v is None:
                    return pd.NaT
                # Se for número (serial date do Excel: dias desde 1899-12-30)
                if isinstance(v, (int, float)):
                    try:
                        # Origem do Excel: 1899-12-30 (com ajuste do bug de 1900)
                        return pd.Timestamp('1899-12-30') + pd.Timedelta(days=int(v))
                    except:
                        return pd.NaT
                # Se for string, tentar parse normal
                try:
                    return pd.to_datetime(v, dayfirst=True, errors='coerce')
                except:
                    return pd.NaT
            
            df_ptax['Data'] = df_ptax['Data'].apply(safe_parse_date)
            
            # Parse de taxa - trata valores que já são numéricos ou strings
            def safe_parse_taxa(v):
                if pd.isna(v) or v is None:
                    return None
                if isinstance(v, (int, float)):
                    return float(v) if not pd.isna(v) else None
                return parse_decimal_br(v)
            
            df_ptax['Taxa'] = df_ptax['Taxa'].apply(safe_parse_taxa)
            
            # Remove inválidos e define índice
            df_ptax = df_ptax.dropna(subset=['Data', 'Taxa'])
            
            # Filtra taxas inválidas (zero ou negativas)
            df_ptax = df_ptax[df_ptax['Taxa'] > 0]
            
            if df_ptax.empty:
                return pd.DataFrame()
            
            df_ptax = df_ptax.set_index('Data').sort_index()
            
            return df_ptax
            
        except Exception:
            return pd.DataFrame()

    # 1. PRIORIDADE: Dados oficiais da aba 'ptax'
    df_ptax_index = carregar_ptax_oficial()
    
    # 2. FALLBACK: Yahoo Finance se não tiver dados oficiais
    if df_ptax_index.empty:
        st.markdown('<div class="glass-alert glass-info">ℹ️ Dados oficiais de PTAX não encontrados. Usando cotação do mercado (Yahoo Finance).</div>', unsafe_allow_html=True)
        if 'df_prices' in locals() and not df_prices.empty and 'BRL=X' in df_prices.columns:
            df_ptax_index = df_prices[['BRL=X']].copy()
            df_ptax_index.columns = ['Taxa']
            df_ptax_index = df_ptax_index.dropna()

    def obter_ptax(data_op):
        """Retorna a taxa PTAX oficial (USD/BRL) para uma data específica."""
        if df_ptax_index.empty: 
            # Fallback para cotação atual
            return mapa_precos.get('BRL=X', 5.50) if 'mapa_precos' in locals() else 5.50
        try:
            # Normaliza a data
            data_norm = pd.Timestamp(data_op).normalize()
            idx = df_ptax_index.index.asof(data_norm)
            if pd.isna(idx):
                # Data anterior ao histórico disponível
                return mapa_precos.get('BRL=X', 5.50) if 'mapa_precos' in locals() else 5.50
            return float(df_ptax_index.loc[idx]['Taxa'])
        except: 
            return mapa_precos.get('BRL=X', 5.50) if 'mapa_precos' in locals() else 5.50

    df_tax = df_bruto.sort_values('data').copy() if 'df_bruto' in locals() and not df_bruto.empty else pd.DataFrame()
    
    if not df_tax.empty and 'data' in df_tax.columns:
        df_tax = df_tax.dropna(subset=['data'])

    dt_map = set()
    if not df_tax.empty:
        for (d, t), g in df_tax.groupby(['data', 'ticker']):
            if pd.isna(d): continue
            ops = set(g['tipo'].str.lower().str.strip())
            if any('compra' in x for x in ops) and any('venda' in x for x in ops): 
                dt_map.add((d, t))

    def classificar_ativo(tkr, mercado):
        t = str(tkr).upper().strip().replace('.SA', '')
        if len(t) > 4 and t.endswith('F') and t[-2].isdigit(): t = t[:-1]
        if mercado == 'BR':
            lista_etfs = ['IVVB11', 'BOVA11', 'SMAL11', 'HASH11', 'WRLD11', 'XINA11', 'NASD11', 'GOLD11', 'EURP11', 'B5P211', 'ETH11', 'BIT11', 'HETE11', 'IMAB11', 'IBOB11', 'SPXI11', 'GOVE11', 'MATB11', 'USTK11', 'TECK11', 'BBSD11', 'XFIX11', 'ALUG11', 'FIND11', 'BRAX11', 'ECOO11', 'DIVO11']
            if t in lista_etfs: return 'ETF'
            if t.endswith(('32','33','34')): return 'BDR'
            if t.endswith('11'):
                units = ['KLBN11', 'SAPR11', 'TAEE11', 'ALUP11', 'SANB11', 'BPAC11', 'ITUB11', 'BBAS11', 'SANB11', 'TIET11', 'CPFE11', 'EGIE11', 'ENGI11']
                return 'Ações BR' if t in units else 'FII'
            return 'Ações BR'
        return 'Ativos Financeiros Exterior'

    carteira_pm = {} 
    transacoes = []  
    dolar_hoje = mapa_precos.get('BRL=X', 5.50) if 'mapa_precos' in locals() else 5.50

    if not df_tax.empty:
        for _, row in df_tax.iterrows():
            data = row['data']
            if pd.isna(data): continue 

            tkr = row['ticker']
            tipo = str(row['tipo']).lower()
            qtd = float(row['quantidade'])
            preco = float(row['preco'])
            
            eh_exterior = False
            if '.SA' not in str(tkr) and (len(str(tkr)) <= 5 or tkr in ['VT', 'VNQ', 'VOO', 'DPM', 'ASML', 'TSM']): 
                eh_exterior = True
            mercado = 'EX' if eh_exterior else 'BR'
            
            ptax_op = obter_ptax(data) if mercado == 'EX' else 1.0
            classe_orig = classificar_ativo(tkr, mercado)
            is_dt = (mercado == 'BR' and (data, tkr) in dt_map)
            classe_final = 'FII' if (is_dt and classe_orig == 'FII') else ('Day Trade' if is_dt else classe_orig)
        


            key = f"{mercado}_{tkr}"
            if key not in carteira_pm: carteira_pm[key] = {'qtd': 0.0, 'custo_brl': 0.0, 'custo_usd': 0.0}

            val_op_brl = (qtd * preco) * ptax_op
            val_op_usd = (qtd * preco)
            taxas = float(row.get('taxas', 0))

            if 'compra' in tipo:
                carteira_pm[key]['qtd'] += qtd
                carteira_pm[key]['custo_brl'] += (val_op_brl + taxas)
                carteira_pm[key]['custo_usd'] += val_op_usd
            
            elif 'venda' in tipo:
                dados = carteira_pm[key]
                pm_brl = (dados['custo_brl'] / dados['qtd']) if dados['qtd'] > 0 else 0
                pm_usd = (dados['custo_usd'] / dados['qtd']) if dados['qtd'] > 0 else 0
                ptax_compra_avg = (pm_brl / pm_usd) if pm_usd > 0 else 0.0

                custo_venda_brl = qtd * pm_brl
                val_liq_venda_brl = val_op_brl - taxas
                lucro_brl = val_liq_venda_brl - custo_venda_brl
                lucro_ativo_usd = (preco - pm_usd) * qtd
                lucro_hoje_brl = ((qtd * preco) * dolar_hoje) - custo_venda_brl

                carteira_pm[key]['qtd'] -= qtd
                carteira_pm[key]['custo_brl'] -= custo_venda_brl
                carteira_pm[key]['custo_usd'] -= (qtd * pm_usd)
                
                transacoes.append({
                    'data': data,
                    'mes_ref': data.strftime('%Y-%m'),
                    'ano': data.year,
                    'ticker': tkr,
                    'mercado': mercado,
                    'classe': classe_final,
                    'venda_total': val_liq_venda_brl,
                    'resultado': lucro_brl,
                    'ptax': ptax_op,                
                    'ptax_compra': ptax_compra_avg, 
                    'lucro_ativo_usd': lucro_ativo_usd,
                    'lucro_hoje_sim': lucro_hoje_brl
                })

    df_fisc = pd.DataFrame(transacoes)

    if not df_fisc.empty:
        anos = sorted(df_fisc['ano'].unique(), reverse=True)
        col_sel, _ = st.columns([1, 5])
        ano_view = col_sel.selectbox("📅 Selecione o Ano Fiscal:", anos, key="sel_ano_fiscal_surgical")
        
        df_view = df_fisc[df_fisc['ano'] == ano_view].copy()
        
        t1, t2 = st.tabs(["🇧🇷 Brasil", "🇺🇸 Exterior"])
        
        with t1:
            df_br = df_view[df_view['mercado'] == 'BR'].copy()
            if not df_br.empty:
                meses = sorted(df_br['mes_ref'].unique())
                t_swing, t_fii, t_dt = [], [], []
                loss_swing, loss_fii, loss_dt = 0.0, 0.0, 0.0
                
                tot_vendas_ano, tot_prej_usado, tot_darf_ano = 0.0, 0.0, 0.0

                for mes in meses:
                    df_m = df_br[df_br['mes_ref'] == mes]
                    
                    acoes = df_m[df_m['classe'] == 'Ações BR']
                    v_ac, r_ac = acoes['venda_total'].sum(), acoes['resultado'].sum()
                    outros = df_m[df_m['classe'].isin(['ETF', 'BDR'])]
                    v_out, r_out = outros['venda_total'].sum(), outros['resultado'].sum()
                    
                    r_ac_valido, st_ac = 0.0, "Isento"
                    if v_ac >= 20000: r_ac_valido, st_ac = r_ac, "Tributável"
                    else:
                        if r_ac < 0 and FORCAR_COMPENSACAO_20K: r_ac_valido, st_ac = r_ac, "Prej. Compensável"
                        elif r_ac > 0: st_ac = "Lucro Isento (<20k)"
                        else: st_ac = "Prej. Ignorado"
                    
                    lucro_bruto = r_ac_valido + r_out
                    uso_prej = min(lucro_bruto, abs(loss_swing)) if lucro_bruto > 0 and loss_swing < 0 else 0.0
                    
                    base_sw = lucro_bruto + loss_swing
                    imp_sw = base_sw * 0.15 if base_sw > 0 else 0.0
                    loss_swing = 0.0 if base_sw > 0 else base_sw
                    
                    t_swing.append({'Mês': mes, 'Venda Ações': v_ac, 'Res. Ações': r_ac, 'Status': st_ac, 'Res. ETF/BDR': r_out, 'Base Calc': base_sw, 'Prejuízo Acum': loss_swing, 'DARF': imp_sw})

                    fiis = df_m[df_m['classe'] == 'FII']
                    r_fii, v_fii = fiis['resultado'].sum(), fiis['venda_total'].sum()
                    uso_prej_fii = min(r_fii, abs(loss_fii)) if r_fii > 0 and loss_fii < 0 else 0.0
                    
                    base_f = r_fii + loss_fii
                    imp_f = base_f * 0.20 if base_f > 0 else 0.0
                    loss_fii = 0.0 if base_f > 0 else base_f
                    
                    t_fii.append({'Mês': mes, 'Venda FII': v_fii, 'Res. FII': r_fii, 'Base Calc': base_f, 'Prejuízo Acum': loss_fii, 'DARF': imp_f})

                    dts = df_m[df_m['classe'] == 'Day Trade']
                    r_dt, v_dt = dts['resultado'].sum(), dts['venda_total'].sum()
                    uso_prej_dt = min(r_dt, abs(loss_dt)) if r_dt > 0 and loss_dt < 0 else 0.0
                    base_d = r_dt + loss_dt
                    imp_d = base_d * 0.20 if base_d > 0 else 0.0
                    loss_dt = 0.0 if base_d > 0 else base_d
                    
                    if v_dt > 0 or loss_dt < 0 or imp_d > 0:
                        t_dt.append({'Mês': mes, 'Vendas DT': v_dt, 'Res. DT': r_dt, 'Base Calc': base_d, 'Prejuízo Acum': loss_dt, 'DARF': imp_d})

                    tot_vendas_ano += (v_ac + v_out + v_fii + v_dt)
                    tot_prej_usado += (uso_prej + uso_prej_fii + uso_prej_dt)
                    tot_darf_ano += (imp_sw + imp_f + imp_d)

                df_ts, df_tf, df_td = pd.DataFrame(t_swing), pd.DataFrame(t_fii), pd.DataFrame(t_dt)

                st.markdown(f"### 📊 Resumo Executivo - {ano_view}")
                with st.container(border=True):
                    m1, m2, m3, m4 = st.columns(4)
                    with m1:
                        st.markdown(render_metric_card("Total Vendas", f"R$ {tot_vendas_ano:,.0f}", icon="📉"), unsafe_allow_html=True)
                    with m2:
                        st.markdown(render_metric_card("Prejuízo Usado", f"R$ {tot_prej_usado:,.0f}", icon="🧾"), unsafe_allow_html=True)
                    with m3:
                        saldo_restante = min(0, loss_swing + loss_fii + loss_dt)  # Só mostra prejuízos
                        st.markdown(render_metric_card("Saldo Restante", f"R$ {saldo_restante:,.0f}", icon="🛡️"), unsafe_allow_html=True)
                    with m4:
                        st.markdown(render_metric_card("DARF Total", f"R$ {tot_darf_ano:,.0f}", icon="💸"), unsafe_allow_html=True)

                st.write("")

                with st.expander("🔎 Filtros de Visualização", expanded=False):
                    sel_meses = st.multiselect("Filtrar Meses:", options=df_ts['Mês'].unique(), default=df_ts['Mês'].unique(), key="f_mes_br")
                
                df_ts_v = df_ts[df_ts['Mês'].isin(sel_meses)]
                df_tf_v = df_tf[df_tf['Mês'].isin(sel_meses)]
                df_td_v = df_td[df_td['Mês'].isin(sel_meses)] if not df_td.empty else pd.DataFrame()

                col_main, col_guide = st.columns([2.5, 1], gap="medium")
                with col_main:
                    st.markdown("##### 📉 Swing Trade")
                    st.dataframe(
                        df_ts_v.style.map(lambda x: 'color: #ef5350' if x<0 else 'color: #66bb6a', subset=['Res. Ações', 'Res. ETF/BDR', 'Prejuízo Acum']).map(lambda x: 'background-color: #ffcdd2; color: #b71c1c; font-weight: bold' if x>0.01 else '', subset=['DARF']),
                        use_container_width=True, column_config={"Mês": st.column_config.TextColumn("Mês"), "Venda Ações": st.column_config.NumberColumn(format="R$ %.2f"), "Res. Ações": st.column_config.NumberColumn(format="R$ %.2f"), "Res. ETF/BDR": st.column_config.NumberColumn(format="R$ %.2f"), "Base Calc": st.column_config.NumberColumn(format="R$ %.2f"), "Prejuízo Acum": st.column_config.NumberColumn(format="R$ %.2f"), "DARF": st.column_config.NumberColumn(format="R$ %.2f")}
                    )
                    st.divider()
                    st.markdown("##### 🏢 Fundos Imobiliários")
                    st.dataframe(
                        df_tf_v.style.map(lambda x: 'color: #ef5350' if x<0 else 'color: #66bb6a', subset=['Res. FII', 'Prejuízo Acum']).map(lambda x: 'background-color: #ffcdd2; color: #b71c1c; font-weight: bold' if x>0.01 else '', subset=['DARF']),
                                use_container_width=True
, column_config={"Mês": st.column_config.TextColumn("Mês"), "Venda FII": st.column_config.NumberColumn(format="R$ %.2f"), "Res. FII": st.column_config.NumberColumn(format="R$ %.2f"), "Base Calc": st.column_config.NumberColumn(format="R$ %.2f"), "Prejuízo Acum": st.column_config.NumberColumn(format="R$ %.2f"), "DARF": st.column_config.NumberColumn(format="R$ %.2f")}
                    )
                    if not df_td_v.empty:
                        st.divider()
                        st.markdown("##### ⚡ Day Trade")
                        st.dataframe(df_td_v.style.format("{:.2f}"), use_container_width=True)

                with col_guide:
                    st.markdown("### 📚 Guia Fiscal")
                    with st.expander("📉 Swing Trade", expanded=True):
                        st.markdown("**Cesta Única:** Ações + ETFs + BDRs. Lucro de um paga prejuízo de outro.\n\n**Isenção 20k:** Apenas p/ LUCRO de Ações BR. Prejuízo sempre compensa (se ativado).")
                    with st.expander("🏢 FIIs"):
                        st.markdown("**Cesta Isolada:** Não mistura.\n**Alíquota:** 20%.\n**Isenção:** Nenhuma.")
                    with st.expander("⚡ Day Trade"):
                        st.markdown("**Cesta Isolada:** Compra/Venda no mesmo dia.\n**Alíquota:** 20%.")
                    st.link_button("🌐 SicalcWeb", "https://sicalc.receita.economia.gov.br/sicalc/principal", type="primary")
            else:
                st.markdown('<div class="glass-alert glass-info">ℹ️ Sem operações BR no período selecionado.</div>', unsafe_allow_html=True)

        with t2:
            col_ex_main, col_ex_side = st.columns([3, 1], gap="medium")
            
            col_mercado = 'mercado' if 'mercado' in df_view.columns else 'Mercado'
            df_ex = df_view[df_view[col_mercado] == 'EX'].copy()
            
            with col_ex_main:
                st.markdown('<div class="glass-alert glass-info">ℹ️ <b>Análise Cambial:</b> Compara a Taxa PTAX do dia da liquidação (Venda) com a Taxa PTAX do dia da aquisição.</div>', unsafe_allow_html=True)
                
                if not df_ex.empty:
                    st.markdown("##### 🌎 Detalhamento da Composição do Lucro")
                    
                    mapa_cols = {
                        'Data': 'data' if 'data' in df_ex.columns else 'Data',
                        'Ticker': 'ticker' if 'ticker' in df_ex.columns else 'Ticker',
                        'PTAX Aquisição': 'PTAX Compra' if 'PTAX Compra' in df_ex.columns else 'ptax_compra',
                        'PTAX Venda': 'PTAX Venda' if 'PTAX Venda' in df_ex.columns else 'ptax',
                        'Venda Total (R$)': 'Venda Total (R$)' if 'Venda Total (R$)' in df_ex.columns else 'venda_total',
                        'Lucro (R$)': 'Lucro (R$)' if 'Lucro (R$)' in df_ex.columns else 'resultado',
                        'Lucro USD': 'Lucro USD' if 'Lucro USD' in df_ex.columns else 'lucro_ativo_usd',
                        'Lucro Hoje Sim': 'Lucro Hoje Sim' if 'Lucro Hoje Sim' in df_ex.columns else 'lucro_hoje_sim'
                    }

                    df_ex_show = pd.DataFrame()
                    for nome_visual, nome_real in mapa_cols.items():
                        if nome_real in df_ex.columns:
                            df_ex_show[nome_visual] = df_ex[nome_real]
                    
                    if 'Lucro (R$)' in df_ex_show.columns and 'Lucro USD' in df_ex_show.columns and 'PTAX Venda' in df_ex_show.columns:
                        df_ex_show['Impacto Câmbio'] = df_ex_show['Lucro (R$)'] - (df_ex_show['Lucro USD'] * df_ex_show['PTAX Venda'])
                    
                    st.dataframe(
                        df_ex_show,
                                use_container_width=True
,
                        column_config={
                            "Data": st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
                            "Ticker": "Ativo",
                            "PTAX Aquisição": st.column_config.NumberColumn("PTAX Aquisição", format="%.4f", help="Taxa do dia da compra (Custo Histórico)."),
                            "PTAX Venda": st.column_config.NumberColumn("PTAX Venda", format="%.4f", help="Taxa do dia da venda."),
                            "Venda Total (R$)": st.column_config.NumberColumn("Venda Total (R$)", format="R$ %.2f"),
                            "Lucro (R$)": st.column_config.NumberColumn("Lucro Fiscal (R$)", format="R$ %.2f", help="Base para imposto."),
                            "Lucro USD": st.column_config.NumberColumn("Ganho Ativo ($)", format="$ %.2f"),
                            "Impacto Câmbio": st.column_config.NumberColumn("Efeito Câmbio (R$)", format="R$ %.2f"),
                            "Lucro Hoje Sim": st.column_config.NumberColumn("Lucro (Dólar Hoje)", format="R$ %.2f")
                        }
                    )
                    
                    st.markdown("---")
                    st.markdown("##### 🌊 Decomposição Financeira")
                    c1, c2, c3 = st.columns(3)
                    
                    col_res = mapa_cols['Lucro (R$)']
                    col_hoje = mapa_cols['Lucro Hoje Sim']
                    
                    total_fiscal = df_ex[col_res].sum() if col_res in df_ex.columns else 0
                    total_gerencial = df_ex[col_hoje].sum() if col_hoje in df_ex.columns else 0
                    diff_timing = total_gerencial - total_fiscal
                    
                    with c1:
                        st.markdown(render_metric_card("Lucro Fiscal", f"R$ {total_fiscal:,.0f}", icon="🧾"), unsafe_allow_html=True)
                    with c2:
                        st.markdown(render_metric_card("Lucro Gerencial", f"R$ {total_gerencial:,.0f}", icon="📊"), unsafe_allow_html=True)
                    with c3:
                        st.markdown(render_metric_card("Diferença Timing", f"R$ {diff_timing:,.0f}", icon="⏳"), unsafe_allow_html=True)
                    
                else:
                    st.markdown('<div class="glass-alert glass-warn">⚠️ Sem operações no Exterior neste ano.</div>', unsafe_allow_html=True)

            with col_ex_side:
                col_res = 'resultado' if 'resultado' in df_ex.columns else 'Lucro (R$)'
                if not df_ex.empty and col_res in df_ex.columns:
                    lucro_total = df_ex[col_res].sum()
                    imposto = max(0, lucro_total * 0.15) 
                    
                    st.markdown("### 🧾 Tributação")
                    with st.container(border=True):
                        st.markdown(render_metric_card("Base Cálculo", f"R$ {lucro_total:,.0f}", icon="💰"), unsafe_allow_html=True)
                        st.divider()
                        st.markdown(render_metric_card("Imposto (15%)", f"R$ {imposto:,.0f}", "DARF 8528", False, icon="💸"), unsafe_allow_html=True)
                else:
                    st.markdown('<div class="glass-alert glass-info">ℹ️ Sem dados de lucro disponíveis.</div>', unsafe_allow_html=True)

                st.markdown("### 📚 Guia Fiscal")
                
                with st.expander("🌎 Regra Geral (2024+)", expanded=True):
                    st.markdown("""
                    **Alíquota Única:** 15% sobre o lucro anual.
                    **Isenção:** ❌ **Não existe mais** a isenção de R$ 35k. Todo lucro é tributável.
                    **Apuração:** Anual (na Declaração de Ajuste), mas recomenda-se reservar o valor.
                    """)
                
                with st.expander("💱 Variação Cambial"):
                    st.markdown("""
                    A variação do dólar agora compõe o lucro.
                    **Custo:** PTAX do dia da compra.
                    **Venda:** PTAX do dia da venda.
                    Se o dólar subiu, você paga imposto sobre essa valorização também.
                    """)

                with st.expander("📉 Compensação"):
                    st.markdown("""
                    Prejuízos em ativos no exterior podem abater lucros de outros ativos no exterior dentro do **mesmo ano**.
                    """)
                
                st.link_button("🌐 SicalcWeb", "https://sicalc.receita.economia.gov.br/sicalc/principal", type="primary")                                      
                                    
with tab3:
    st.markdown('<div class="tab-header">🏦 Gestão de Renda Fixa & Liquidez</div>', unsafe_allow_html=True)
    
    mask_caixa = df_rf_filtrado['Ticker'].str.contains('Caixa|Cash|Disponivel|Saldo', case=False, na=False)
    
    df_liquidez = df_rf_filtrado[mask_caixa].copy()
    df_alocacao = df_rf_filtrado[~mask_caixa].copy()

    df_custodia = df_alocacao[df_alocacao['Status'] == 'Ativo']
    df_realizado = df_alocacao[df_alocacao['Status'] == 'Encerrado']

    # Processamento de Caixa Multi-moeda
    if not df_liquidez.empty:
        # Separa BRL e USD
        df_liq_brl = df_liquidez[df_liquidez['Moeda'] != 'USD']
        df_liq_usd = df_liquidez[df_liquidez['Moeda'] == 'USD']
        
        caixa_brl = df_liq_brl['Atual'].sum()
        caixa_usd = df_liq_usd['Atual'].sum()
        
        # Converte USD para BRL para totalização
        taxa_usd = mapa_precos.get('BRL=X', 5.50)
        caixa_total_em_brl = caixa_brl + (caixa_usd * taxa_usd)
        
        if caixa_total_em_brl > 0:
            c1, c2, c3 = st.columns(3)
            with c1:
                st.markdown(render_metric_card("Liquidez Total (BRL)", f"R$ {caixa_total_em_brl:,.2f}", icon="💵"), unsafe_allow_html=True)
            with c2:
                if caixa_brl > 0:
                    st.markdown(render_metric_card("Caixa BRL 🇧🇷", f"R$ {caixa_brl:,.2f}", icon="🏦"), unsafe_allow_html=True)
                else:
                    st.markdown(render_metric_card("Caixa BRL 🇧🇷", "R$ 0,00", icon="🏦"), unsafe_allow_html=True)
            with c3:
                if caixa_usd > 0:
                    st.markdown(render_metric_card("Caixa USD 🇺🇸", f"$ {caixa_usd:,.2f}", f"~R$ {caixa_usd * taxa_usd:,.2f}", True, icon="💱"), unsafe_allow_html=True)
                else:
                    st.markdown(render_metric_card("Caixa USD 🇺🇸", "$ 0,00", icon="💱"), unsafe_allow_html=True)
            st.write("")

    if not df_custodia.empty:
        st.markdown("### 🟢 Custódia de Títulos (Posição Atual)")
        
        principal = df_custodia['Investido'].sum()
        valor_mercado = df_custodia['Atual'].sum()
        resultado_latente = df_custodia['Lucro'].sum()
        
        retorno_medio = (resultado_latente / principal * 100) if principal > 0 else 0
        
        df_custodia_view = df_custodia.copy()
        
        data_hoje = datetime.now()

        def calcular_anualizado(row):
            try:
                investido = float(row['Investido'])
                atual = float(row['Atual'])
                data_ini = pd.to_datetime(row['Data'], dayfirst=True)
                
                if investido <= 0 or atual <= 0: return 0.0

                dias = (data_hoje - data_ini).days
                if dias < 1: dias = 1 
                
                rent_anual = ((atual / investido) ** (365 / dias)) - 1
                return rent_anual * 100
            except:
                return 0.0

        df_custodia_view['Rent. Anual (%)'] = df_custodia_view.apply(calcular_anualizado, axis=1)

        # Cálculo do TWR ponderado
        if not df_custodia_view.empty and df_custodia['Investido'].sum() > 0:
            twr_ponderado = (df_custodia['Investido'] * df_custodia_view['Rent. Anual (%)']).sum() / df_custodia['Investido'].sum()
        else:
            twr_ponderado = 0.0

        m1, m2, m3, m4 = st.columns(4)
        with m1:
            st.markdown(render_metric_card("Principal", f"R$ {principal:,.0f}", icon="💰"), unsafe_allow_html=True)
        with m2:
            st.markdown(render_metric_card("Marcação (MtM)", f"R$ {valor_mercado:,.0f}", icon="📈"), unsafe_allow_html=True)
        with m3:
            st.markdown(render_metric_card("Resultado Latente", f"R$ {resultado_latente:,.0f}", icon="⚡"), unsafe_allow_html=True)
        with m4:
            st.markdown(render_metric_card("TWR Ponderado", f"{twr_ponderado:.2f}%", icon="📊"), unsafe_allow_html=True)

        # Handle NaT values in 'Data' column before display
        df_display = df_custodia_view[['Ativo', 'Data', 'Investido', 'Atual', 'Lucro', 'Rent. %', 'Rent. Anual (%)']].copy()
        df_display['Data'] = df_display['Data'].apply(lambda x: x.strftime('%d/%m/%Y') if pd.notna(x) else '-')
        
        st.dataframe(
            df_display
            .rename(columns={'Data': 'Data Aplicação', 'Investido': 'Principal', 'Atual': 'Valor Líquido', 'Lucro': 'Resultado R$'})
            .style.format({
                'Principal': 'R$ {:,.2f}', 
                'Valor Líquido': 'R$ {:,.2f}',
                'Resultado R$': 'R$ {:,.2f}', 
                'Rent. %': '{:.2f}%', 
                'Rent. Anual (%)': '{:.2f}%'
            })
            .background_gradient(subset=['Resultado R$'], cmap='Greens')
            .background_gradient(subset=['Rent. Anual (%)'], cmap='Blues'),
                    use_container_width=True

        )                   

            
    elif opcao_ativo == "Sim":
        st.markdown('<div class="glass-alert glass-warn">⚠️ Nenhuma custódia de Títulos de Renda Fixa encontrada. (Verifique se há apenas Caixa)</div>', unsafe_allow_html=True)

    if not df_realizado.empty:
        st.markdown("---")
        st.markdown("### 🏁 Histórico de Realizações (Vencimentos & Resgates)")
        
        lucro_bolso = df_realizado['Lucro'].sum()
        volume_movimentado = df_realizado['Atual'].sum() 
        
        c_h1, c_h2 = st.columns(2)
        with c_h1:
            st.markdown(render_metric_card("Resultado Realizado", f"R$ {lucro_bolso:,.0f}", icon="🏁"), unsafe_allow_html=True)
        with c_h2:
            st.markdown(render_metric_card("Volume Resgatado", f"R$ {volume_movimentado:,.0f}", icon="📉"), unsafe_allow_html=True)
        
        # Handle NaT values in 'Data' column before display
        df_realizado_display = df_realizado[['Ativo', 'Data', 'Investido', 'Atual', 'Lucro', 'Rent. %']].copy()
        df_realizado_display['Data'] = df_realizado_display['Data'].apply(lambda x: x.strftime('%d/%m/%Y') if pd.notna(x) else '-')
        
        st.dataframe(
            df_realizado_display
            .rename(columns={'Data': 'Data Baixa', 'Investido': 'Aplicação Original', 'Atual': 'Valor Resgate', 'Lucro': 'Resultado Final'})
            .style.format({
                'Aplicação Original': 'R$ {:,.2f}', 
                'Valor Resgate': 'R$ {:,.2f}',
                'Resultado Final': 'R$ {:,.2f}', 
                'Rent. %': '{:.2f}%'
            })
            .map(lambda x: 'color: #D32F2F; font-weight: bold' if isinstance(x, (int, float)) and x < 0 else 'color: #388E3C; font-weight: bold', subset=['Resultado Final']),
                    use_container_width=True

        )
    elif opcao_ativo == "Não" and df_realizado.empty:
        st.markdown('<div class="glass-alert glass-info">ℹ️ Nenhum histórico de operações finalizadas encontrado.</div>', unsafe_allow_html=True)

    st.markdown("---") 
    st.markdown('<div class="tab-header-sm">📊 Curva de Evolução Patrimonial (RF)</div>', unsafe_allow_html=True)
    
    # Integra o motor de curva RF
    # Custom CSS for this section
    st.markdown("""
    <style>
        .stPlotlyChart {
            background-color: rgba(0,0,0,0);
        }
    </style>
    """, unsafe_allow_html=True)
    
    # Integrates RF Engine with TWR Canonico
    try:
        from core.fixed_income_engine import FixedIncomeEngine
        from core.performance.calculator import calculate_canonical_twr
        from core.performance.visualizations import plot_nav_vs_twr
        
        # Use raw RF data
        if not df_rf_raw.empty:
            # Extrai valores manuais de fixa_aberta (FONTE DE VERDADE)
            manual_vals = {}

            # PRIORIDADE 1: Usar df_rf_manual (fixa_aberta) como fonte principal
            if not df_rf_manual.empty:
                # Identifica coluna de valor atual (pode ser 'Atual', 'Valor Atual', etc)
                val_col = None
                for col in ['Atual', 'Valor Atual', 'atual', 'valor_atual']:
                    if col in df_rf_manual.columns:
                        val_col = col
                        break

                ticker_col = None
                for col in ['Ticker', 'ticker', 'Ativo', 'ativo']:
                    if col in df_rf_manual.columns:
                        ticker_col = col
                        break

                if val_col and ticker_col:
                    for _, row in df_rf_manual.iterrows():
                        t = str(row[ticker_col]).strip().upper()  # Normaliza para UPPERCASE
                        v = pd.to_numeric(row[val_col], errors='coerce')
                        if pd.notnull(v) and v > 0 and t:
                            manual_vals[t] = v

            # PRIORIDADE 2: Fallback para Valor Atual em df_rf_raw (se não tiver fixa_aberta)
            if not manual_vals and 'Valor Atual' in df_rf_raw.columns and 'Ticker' in df_rf_raw.columns:
                for t, g in df_rf_raw.groupby('Ticker'):
                    v_max = pd.to_numeric(g['Valor Atual'], errors='coerce').max()
                    if pd.notnull(v_max) and v_max > 0:
                        manual_vals[t] = v_max

            engine_rf = FixedIncomeEngine(df_rf_raw, manual_values=manual_vals)
            curve_result = engine_rf.build_daily_curve()
            
            if not curve_result.daily_curve.empty:
                df_curve = curve_result.daily_curve
                
                # 1. Prepare Data for TWR Calculation
                # We need a DataFrame with index, 'nav', and 'flow'
                
                # NAV is the total corrected value (including cash)
                nav_series = df_curve['total']
                
                # Flows need to be mapped from external_flows list to daily series
                flow_series = pd.Series(0.0, index=nav_series.index)
                
                for ef in curve_result.external_flows:
                    # Normalize date
                    d_flow = pd.to_datetime(ef.date)
                    if d_flow.weekday() >= 5: # Adjust weekend flows same as engine
                        days_to_add = 7 - d_flow.weekday()
                        d_flow = d_flow + pd.Timedelta(days=days_to_add)
                        
                    # Find closest valid date in index
                    if d_flow in flow_series.index:
                        flow_series.loc[d_flow] += ef.amount
                    else:
                        # Try simple mapping if date matches
                         # This handles potential mismatched timestamps if index has times
                        try:
                            d_idx = flow_series.index[flow_series.index.date == d_flow.date()]
                            if not d_idx.empty:
                                flow_series.loc[d_idx[0]] += ef.amount
                        except:
                            pass

                df_twr_input = pd.DataFrame({
                    'nav': nav_series,
                    'flow': flow_series
                }).fillna(0)
                
                # 2. Calculate TWR
                twr_result = calculate_canonical_twr(df_twr_input)
                
                # 3. Metrics Display
                c1, c2, c3, c4 = st.columns(4)
                
                # Invested = Final Invested from curve
                val_invested = curve_result.total_invested
                
                # Current = Final Total from curve
                val_atual = curve_result.current_value # + cash if needed, but current_value usually includes it if configured
                # Actually FixedIncomeEngine.current_value is usually 'corrected', let's use the curve's last total
                val_total = df_curve['total'].iloc[-1]
                
                with c1:
                    st.markdown(render_metric_card("Total Investido", f"R$ {val_invested:,.2f}", icon="💰"), unsafe_allow_html=True)
                with c2:
                    st.markdown(render_metric_card("Patrimônio Atual (RF)", f"R$ {val_total:,.2f}", icon="📈"), unsafe_allow_html=True)
                with c3:
                    st.markdown(render_metric_card("TWR Acumulado", f"{twr_result.total_twr:.2%}", icon="📊"), unsafe_allow_html=True)
                with c4:
                    st.markdown(render_metric_card("TWR Anualizado", f"{twr_result.annualized_twr:.2%}", icon="📅"), unsafe_allow_html=True)

                # 4. Plot using New Logic (plot_nav_vs_twr)
                # We pass the full slice for visualization
                fig_evol = plot_nav_vs_twr(
                    df_twr_input,
                    twr_result.cumulative_series,
                    df_twr_input['flow'],
                    title=""
                )
                
                # Add "Invested Capital" line (missing in standard TWR plot)
                # This is valuable for RF to see the 'floor'
                fig_evol.add_trace(go.Scatter(
                    x=df_curve.index,
                    y=df_curve['invested'],
                    name='Capital Investido',
                    mode='lines',
                    line=dict(color='#94a3b8', width=2, dash='dot'),
                    hovertemplate='Investido: R$ %{y:,.2f}<extra></extra>',
                    yaxis='y' # Use left axis
                ))
                
                st.plotly_chart(fig_evol, use_container_width=True)
                
                # 5. Validation/Hypothesis
                if curve_result.hypothesis_note:
                    st.caption(f"📝 **Nota:** {curve_result.hypothesis_note}")
                    
                if not twr_result.validation.is_valid:
                    st.markdown(f'<div class="glass-alert glass-warn">⚠️ Atenção na métrica TWR: {twr_result.validation.explanation}</div>', unsafe_allow_html=True)

            else:
                st.caption("Sem dados suficientes para construir curva de evolução.")
        else:
            st.caption("Nenhum evento de renda fixa encontrado.")
    except Exception as e:
        import traceback as _tb_rf
        with st.expander("⚠️ Curva RF indisponível — ver detalhes", expanded=False):
            st.caption(str(e))
            st.code(_tb_rf.format_exc())
    
    st.markdown("---")
    st.markdown('<div class="tab-header-sm">📊 Alocação de Recursos (RF + Caixa)</div>', unsafe_allow_html=True)
    
    df_grafico_rf = pd.concat([df_custodia, df_liquidez[df_liquidez['Status']=='Ativo']])
    
    if not df_grafico_rf.empty:
        fig_rf = px.pie(
            df_grafico_rf, 
            values='Atual', 
            names='Ativo', 
            hole=0.4, 
            color_discrete_sequence=px.colors.qualitative.Pastel
        )
        fig_rf.update_traces(textposition='outside', textinfo='percent+label')
        fig_rf.update_layout(margin=dict(t=20, b=20, l=20, r=20), height=500, showlegend=False, paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
        st.plotly_chart(fig_rf, use_container_width=True)
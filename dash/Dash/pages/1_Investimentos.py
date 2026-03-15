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
    initial_sidebar_state="expanded",
    page_icon="💎"
)

# --- CSS PERSONALIZADO ---
# --- CSS PERSONALIZADO (GLOBAL THEME) ---
from core.ui import get_card_css, render_metric_card, render_fab

st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');

    /* Reset & Base */
    html, body, [class*="css"] {
        font-family: 'Outfit', sans-serif;
        color: #e2e8f0;
    }
    
    /* Background Gradient Animation */
    .stApp {
        background: linear-gradient(-45deg, #0e1217, #171c26, #0f1724, #000000);
        background-size: 400% 400%;
        animation: gradient 15s ease infinite;
    }
    
    @keyframes gradient {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
    }

    /* GLASS CARDS */
    .glass-card {
        background: rgba(30, 41, 59, 0.4);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.05);
        padding: 24px;
        border-radius: 16px;
        color: #ffffff;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        margin-bottom: 20px;
    }

    /* Tabs */
    .stTabs [data-baseweb="tab-list"] {
        gap: 8px;
        background-color: transparent;
        flex-wrap: nowrap;
        overflow-x: auto;
        padding-bottom: 5px;
    }
    
    .stTabs [data-baseweb="tab"] {
        height: 60px; /* Increased height */
        white-space: nowrap;
        background-color: rgba(255,255,255,0.05);
        border-radius: 8px;
        padding: 10px 24px;
        color: #cbd5e1;
        border: 1px solid transparent;
        transition: all 0.3s;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .stTabs [data-baseweb="tab"]:hover {
        border-color: rgba(251, 191, 36, 0.4);
        color: #fbbf24;
    }

    .stTabs [aria-selected="true"] {
        background-color: rgba(251, 191, 36, 0.1);
        border: 1px solid rgba(251, 191, 36, 0.6);
        color: #fbbf24;
        text-shadow: 0 0 10px rgba(251, 191, 36, 0.3);
        box-shadow: 0 0 15px rgba(251, 191, 36, 0.1);
    }
    
    /* Table Styling */
    .stDataFrame {
         border: 1px solid rgba(255, 255, 255, 0.1);
         background-color: rgba(15, 23, 42, 0.6);
         border-radius: 8px;
    }
    
    /* Sidebar */
    section[data-testid="stSidebar"] {
        background-color: #0f1724;
        border-right: 1px solid rgba(255,255,255,0.05);
    }
    
    /* Hide Default Sidebar Navigation */
    [data-testid="stSidebarNav"] {
        display: none !important;
    }
    
    /* HERO TITLE (BARROOTS) */
    .hero-container {
        text-align: center;
        padding-top: 0vh; /* Moved up */
        padding-bottom: 1vh;
        animation: fadeIn 1.2s ease-out;
    }
    
    .hero-title {
        font-size: 2.2rem; /* Decreased size */
        font-weight: 800;
        background: linear-gradient(to right, #ffffff, #a5b4fc);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 0px;
        letter-spacing: -1.5px;
        text-shadow: 0 0 30px rgba(165, 180, 252, 0.2);
    }
    
    .hero-subtitle {
        color: #94a3b8;
        font-size: 0.95rem; /* Decreased size */
        font-weight: 300;
        margin-top: 2px;
    }

    /* Animation provided by Home.py styles usually, but ensuring here */
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
    }

    h1, h2, h3 { color: #f1f5f9; }

    /* ===== SISTEMA DE KPI CARDS (lote-card) ===== */
    .lote-card {
        background: rgba(30, 41, 59, 0.5);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 12px;
        padding: 16px 20px;
        text-align: center;
        transition: transform 0.2s ease, border-color 0.2s ease;
        margin-bottom: 8px;
    }
    .lote-card:hover {
        transform: translateY(-2px);
        border-color: rgba(255,255,255,0.14);
    }
    .lote-card .lote-label {
        color: #94a3b8;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 4px;
    }
    .lote-card .lote-value {
        color: #f1f5f9;
        font-size: 1.4rem;
        font-weight: 700;
    }
    .lote-card .lote-sub {
        font-size: 0.85rem;
        font-weight: 500;
        margin-top: 2px;
    }
    .lote-pos { color: #4ade80; }
    .lote-neg { color: #f87171; }

    /* ===== GLASS ALERTS (substituem st.info/warning/success) ===== */
    .glass-alert {
        border-radius: 10px;
        padding: 12px 16px;
        margin: 8px 0;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        font-size: 0.9rem;
        line-height: 1.5;
    }
    .glass-info {
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.25);
        color: #bfdbfe;
    }
    .glass-warn {
        background: rgba(245, 158, 11, 0.1);
        border: 1px solid rgba(245, 158, 11, 0.25);
        color: #fde68a;
    }
    .glass-success {
        background: rgba(74, 222, 128, 0.1);
        border: 1px solid rgba(74, 222, 128, 0.25);
        color: #bbf7d0;
    }

    /* ===== TAB SECTION HEADERS ===== */
    .tab-header {
        font-size: 1.25rem;
        font-weight: 700;
        color: #f1f5f9;
        margin: 8px 0 14px 0;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255,255,255,0.07);
    }
    .tab-header-sm {
        font-size: 1.05rem;
        font-weight: 600;
        color: #cbd5e1;
        margin: 6px 0 10px 0;
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

# Redirect for external pages (Performance = tab 1, Legado = tab 8)
if tab_index == 1:
    st.switch_page("pages/3_Performance.py")
elif tab_index == 8:
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

# Navigation button
col_nav_top = st.columns([5, 1])
with col_nav_top[1]:
    if st.button("🏠 Home", use_container_width=True, type="secondary", key="btn_top_home"):
        st.switch_page("Home.py")

with st.sidebar:
    st.header("🔍 Filtros Globais")
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
# 4: Proventos | 5: Cripto | 6: Câmbio | 7: Imposto | 8: Legado (redirect)

tab1, tab_perf, tab2, tab3, tab4, tab5, tab6, tab7, tab_legado = st.tabs([
    "💎 Resumo",
    "🚀 Performance",
    "📊 Renda Variável",
    "🏦 Renda Fixa",
    "💰 Proventos",
    "₿ Cripto",
    "💱 Câmbio",
    "🦁 Imposto",
    "🏛️ Legado"
])

# --- REDIRECT TABS (Performance e Legado) ---
with tab_perf:
    st.markdown("""
    <div style="text-align: center; padding: 60px 20px;">
        <div style="font-size: 3rem; margin-bottom: 16px;">🚀</div>
        <h2 style="color: #f1f5f9; margin-bottom: 8px;">Performance GIPS</h2>
        <p style="color: #64748b; margin-bottom: 24px;">Análise detalhada de rentabilidade e risco</p>
    </div>
    """, unsafe_allow_html=True)
    if st.button("Acessar Performance Completa", key="btn_goto_perf", use_container_width=True, type="primary"):
        st.switch_page("pages/3_Performance.py")

with tab_legado:
    st.markdown("""
    <div style="text-align: center; padding: 60px 20px;">
        <div style="font-size: 3rem; margin-bottom: 16px;">🏛️</div>
        <h2 style="color: #f1f5f9; margin-bottom: 8px;">Histórico Patrimonial</h2>
        <p style="color: #64748b; margin-bottom: 24px;">Evolução do patrimônio ao longo do tempo</p>
    </div>
    """, unsafe_allow_html=True)
    if st.button("Acessar Legado Completo", key="btn_goto_legado", use_container_width=True, type="primary"):
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

                st.markdown("### 🗺️ Mapa de Calor Global (Risco & Retorno)")
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

                st.markdown("---")

                col_esq, col_dir = st.columns([1, 1])
                with col_esq:
                    st.markdown("#### 🍩 Distribuição Estratégica (Geo & Classe)")
                    
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
                    st.markdown("#### 💱 Exposição Cambial Global")
                    
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
                    
                    st.markdown("---")
                    
                    st.markdown("#### 🏦 Custódia (Brasil vs Exterior)")
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

                st.markdown("---")


                st.markdown("### 🧬 Rentabilidade Total por Ativo")
                st.caption("Barra Sólida: Valorização Não Realizada | Barra Clara: Lucro Realizado + Proventos")

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
                        '#4CAF50' if x > 0 else '#FF5252' if x < 0 else '#FFEB3B'
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


                st.markdown("#### 🎯 Risco x Retorno (Scatter)")
                fig_scat = px.scatter(
                    df_grafico, 
                    x='Valor Hoje (R$)', 
                    y='Rent. (%)', 
                    size='Valor Hoje (R$)', 
                    color='Setor', 
                    hover_name='Ticker', 
                    size_max=40
                )
                fig_scat.add_hline(y=0, line_dash="dash", line_color="gray")
                fig_scat.update_layout(height=450, showlegend=False, xaxis_title="Volume Financeiro", yaxis_title="Rentabilidade %", paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
                st.plotly_chart(fig_scat, use_container_width=True)

                with st.expander("🐋 Análise de Concentração (Pareto Global)", expanded=True):
                    df_pareto = df_grafico.sort_values('Valor Hoje (R$)', ascending=False).copy()
                    total_pareto = df_pareto['Valor Hoje (R$)'].sum()
                    df_pareto['Acumulado (%)'] = (df_pareto['Valor Hoje (R$)'].cumsum() / total_pareto) * 100
                    
                    df_pareto_view = df_pareto.head(25)
                    
                    fig_pareto = go.Figure()
                    fig_pareto.add_trace(go.Bar(
                        x=df_pareto_view['Ticker'], y=df_pareto_view['Valor Hoje (R$)'], 
                        name='Valor (R$)', marker_color='#2196F3'
                    ))
                    fig_pareto.add_trace(go.Scatter(
                        x=df_pareto_view['Ticker'], y=df_pareto_view['Acumulado (%)'], 
                        name='Acumulado %', yaxis='y2', 
                        mode='lines+markers', line=dict(color='#FF5252', width=3)
                    ))
                    fig_pareto.update_layout(
                        title="Concentração de Ativos (Top 25)",
                        yaxis=dict(title="Valor Investido (R$)"),
                        yaxis2=dict(title="Acumulado (%)", overlaying='y', side='right', range=[0, 110], showgrid=False),
                        height=500, legend=dict(x=0.5, y=1.1, orientation='h'),
                        paper_bgcolor='rgba(0,0,0,0)',
                        plot_bgcolor='rgba(0,0,0,0)'
                    )
                    st.plotly_chart(fig_pareto, use_container_width=True)

                st.markdown("---")
                st.markdown('<div class="tab-header">📂 Composição Detalhada (Extra — USD)</div>', unsafe_allow_html=True)
                df_comp = carregar_composicao_extra()
                if not df_comp.empty:
                    # Normalização de Colunas Essenciais
                    col_mapping = {
                        'Símbolo (Symbol)': 'Ativo',
                        'Descrição (Description)': 'Nome',
                        'Setor (Sector)': 'Classe',
                        'Valor Líquido (Net Value)': 'Valor (USD)'
                    }
                    df_comp.rename(columns=lambda x: col_mapping.get(x, x), inplace=True)
                    
                    # Garante que as colunas existam
                    if 'Classe' not in df_comp.columns: 
                        df_comp['Classe'] = df_comp.get('Setor', 'Indefinido')
                    
                    if 'Ativo' not in df_comp.columns:
                        df_comp['Ativo'] = df_comp.get('Símbolo', 'Desconhecido')
                        
                    if 'Valor (USD)' not in df_comp.columns:
                        # Tenta encontrar alguma coluna de valor
                        cols_val = [c for c in df_comp.columns if 'Valor' in c or 'Value' in c]
                        if cols_val: df_comp['Valor (USD)'] = df_comp[cols_val[0]]
                        else: df_comp['Valor (USD)'] = 0.0

                    # Garantir que é numérico
                    df_comp['Valor (USD)'] = pd.to_numeric(df_comp['Valor (USD)'], errors='coerce').fillna(0.0)

                    col_valor = 'Valor (USD)'
                    
                    # Filtra valores positivos
                    df_comp = df_comp[df_comp[col_valor] > 0]
                    df_comp = df_comp.sort_values(by=col_valor, ascending=False)
                    
                    total_comp = df_comp[col_valor].sum()
                    df_comp['Peso (%)'] = (df_comp[col_valor] / total_comp) * 100
                    
                    col_c1, col_c2 = st.columns(2)
                    with col_c1:
                        st.markdown('<div class="tab-header-sm">🍩 Por Classe</div>', unsafe_allow_html=True)
                        fig_comp = px.pie(df_comp, values=col_valor, names='Classe', hole=0.5, color_discrete_sequence=px.colors.qualitative.Vivid)
                        fig_comp.update_traces(textinfo="percent+label")
                        fig_comp.update_layout(margin=dict(t=20, l=20, r=20, b=20), height=400, paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
                        st.plotly_chart(fig_comp, use_container_width=True)
                    with col_c2:
                        st.markdown('<div class="tab-header-sm">🍩 Por Ativo</div>', unsafe_allow_html=True)
                        fig_ativo = px.pie(df_comp, values=col_valor, names='Ativo', hole=0.5, color_discrete_sequence=px.colors.qualitative.Prism)
                        fig_ativo.update_traces(textinfo="percent+label")
                        fig_ativo.update_layout(margin=dict(t=20, l=20, r=20, b=20), height=400, paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
                        st.plotly_chart(fig_ativo, use_container_width=True)

                    
                    st.markdown('<div class="tab-header-sm">📋 Tabela de Ativos (Decrescente)</div>', unsafe_allow_html=True)
                    altura_tabela = min((len(df_comp) + 1) * 35, 1200)
                    st.dataframe(df_comp.style.format({col_valor: 'US$ {:,.2f}', 'Peso (%)': '{:.2f}%'}), use_container_width=True, height=altura_tabela)
                else:
                    st.markdown('<div class="glass-alert glass-info">ℹ️ Arquivo de composição não encontrado ou vazio.</div>', unsafe_allow_html=True)
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
    c_head, c_refresh = st.columns([5,1])
    with c_head:
        st.markdown('<div class="tab-header">💱 FX Command Center</div>', unsafe_allow_html=True)
    
    st.divider()

    carteiras = {}
    moedas_encontradas = set()    
    
    def init_wallet(moeda):
        if moeda not in carteiras:
            carteiras[moeda] = {
                'moeda_base': 'BRL',
                'pm_cambio': 0.0,
                'investido_rv': 0.0,
                'atual_rv': 0.0,
                'investido_rf': 0.0,
                'atual_rf': 0.0,
                'caixa': 0.0
            }

    with st.container(border=True):
        cols = st.columns(6)
        
        tickers_monitor = [
            ('🇺🇸 USD', 'BRL=X'), 
            ('🇪🇺 EUR', 'EURBRL=X'), 
            ('🇨🇦 CAD', 'CADBRL=X'), 
            ('🇨🇭 CHF/USD', 'CHFUSD=X')
        ]
        
        for i, (label, ticker) in enumerate(tickers_monitor):
            val = mapa_precos.get(ticker, 0.0)
            var = mapa_variacao.get(ticker, 0.0)
            simbolo = "US$" if ticker == 'CHFUSD=X' else "R$"
            with cols[i]:
                st.markdown(render_metric_card(
                    label=label,
                    value=f"{simbolo} {val:.3f}",
                    delta=f"{var:+.3f}",
                    delta_positive=var >= 0,
                    icon="💱"
                ), unsafe_allow_html=True)

    # Removed try-except to debug UI
    df_cambio = load_cambio()
    
    if not df_cambio.empty:
        df_cambio['moeda_origem'] = df_cambio['moeda_origem'].str.upper().str.strip()
        df_cambio['moeda_destino'] = df_cambio['moeda_destino'].str.upper().str.strip()
        # Debug: st.dataframe(df_cambio.head()) 
        
        todas_moedas = set(df_cambio['moeda_origem'].unique()) | set(df_cambio['moeda_destino'].unique())
        moedas_encontradas.update(todas_moedas - {'BRL'})

        for moeda in moedas_encontradas:
            init_wallet(moeda)
            # Case 1: BRL -> Moeda (Buy FX)
            filt_entrada = df_cambio[(df_cambio['moeda_destino'] == moeda) & (df_cambio['moeda_origem'] == 'BRL')]
            if not filt_entrada.empty:
                carteiras[moeda]['moeda_base'] = 'BRL'
                reais_gastos = filt_entrada['valor_origem'].sum()
                moeda_recebida = filt_entrada['valor_destino'].sum()
                carteiras[moeda]['pm_cambio'] = reais_gastos / moeda_recebida if moeda_recebida > 0 else 0
            
            # Case 2: USD -> Moeda (Cross FX, e.g. USD -> CHF)
            filt_cross = df_cambio[(df_cambio['moeda_destino'] == moeda) & (df_cambio['moeda_origem'] == 'USD')]
            if not filt_cross.empty:
                carteiras[moeda]['moeda_base'] = 'USD'
                usd_gasto = filt_cross['valor_origem'].sum()
                moeda_rec = filt_cross['valor_destino'].sum()
                carteiras[moeda]['pm_cambio'] = usd_gasto / moeda_rec if moeda_rec > 0 else 0

    if 'df_view' in locals() and not df_view.empty:
        for _, row in df_view.iterrows():
            moeda_ativo = str(row['Moeda']).upper().strip()
            if moeda_ativo in ['BRL', 'NAN', 'NONE', '']: continue
            moedas_encontradas.add(moeda_ativo)
            init_wallet(moeda_ativo)
            qtd = row.get('Qtd', 0.0)
            if qtd > 0:
                pm_compra = row.get('PM Compra', 0.0)
                preco_mkt = row.get('Preço Atual', 0.0) 
                if preco_mkt <= 0: preco_mkt = row.get('Preco Atual', pm_compra)
                carteiras[moeda_ativo]['investido_rv'] += (qtd * pm_compra)
                carteiras[moeda_ativo]['atual_rv'] += (qtd * preco_mkt)

    if 'df_rf_filtrado' in locals() and not df_rf_filtrado.empty:
         rf_ativos_fx = df_rf_filtrado[df_rf_filtrado['Status'] == 'Ativo']
         for _, row in rf_ativos_fx.iterrows():
             m_rf = str(row.get('Moeda', 'BRL')).upper().strip()
             if m_rf in ['BRL', 'NAN', 'NONE', '']: continue
             moedas_encontradas.add(m_rf)
             init_wallet(m_rf)
             nome_ativo = str(row.get('Ativo', '')).upper()
             investido = row.get('Investido', 0.0)
             atual = row.get('Atual', 0.0)
             if atual <= 0: atual = investido
             if 'CAIXA' in nome_ativo or 'SALDO' in nome_ativo or 'CASH' in nome_ativo or 'DISPONIVEL' in nome_ativo:
                 carteiras[m_rf]['caixa'] += atual
             else:
                 carteiras[m_rf]['investido_rf'] += investido
                 carteiras[m_rf]['atual_rf'] += atual

    lista_moedas = sorted(list(moedas_encontradas))

    if not lista_moedas:
        st.markdown('<div class="glass-alert glass-info">ℹ️ Nenhuma exposição em moeda estrangeira identificada.</div>', unsafe_allow_html=True)
    else:
        c_sel, _ = st.columns([2, 5])
        with c_sel:
            idx_ini = lista_moedas.index('USD') if 'USD' in lista_moedas else 0
            moeda_sel = st.selectbox("🏳️ Selecione a Carteira:", lista_moedas, index=idx_ini)

        d = carteiras[moeda_sel]
        
        caixa = d['caixa']
        total_investido_ativos = d['investido_rv'] + d['investido_rf']
        total_atual_ativos = d['atual_rv'] + d['atual_rf']
        
        exposicao_total = total_atual_ativos + caixa
        pm_usuario = d['pm_cambio']
        simbolo_base = "R$" if d['moeda_base'] == 'BRL' else "US$"

        ticker_yahoo = f"{moeda_sel}{d['moeda_base']}=X"
        if d['moeda_base'] == 'USD': ticker_yahoo = f"{moeda_sel}=X"

        @st.cache_data(ttl=3600)
        def get_history_fx(t):
            try: return yf.download(t, period="1y", interval="1d", progress=False)['Close']
            except: return pd.DataFrame()

        df_hist = get_history_fx(ticker_yahoo)
        cotacao_raw = mapa_precos.get(ticker_yahoo, 0.0)
        
        if cotacao_raw <= 0 and not df_hist.empty:
            try: cotacao_raw = float(df_hist.iloc[-1].iloc[0] if isinstance(df_hist, pd.DataFrame) else df_hist.iloc[-1])
            except: cotacao_raw = 1.0
        if cotacao_raw <= 0: cotacao_raw = 1.0

        is_indirect = False 
        if d['moeda_base'] == 'USD' and moeda_sel in ['CAD', 'JPY', 'CHF', 'SEK', 'EUR', 'GBP', 'AUD']:
            is_indirect = True
        
        if is_indirect:
            valor_base_hoje = exposicao_total / cotacao_raw 
            valor_base_custo = (exposicao_total / pm_usuario) if pm_usuario > 0 else 0.0
            
            cotacao_exib = 1 / cotacao_raw
            pm_visual = 1 / pm_usuario if pm_usuario > 0 else 0.0

        else:
            valor_base_hoje = exposicao_total * cotacao_raw
            valor_base_custo = exposicao_total * pm_usuario
            
            cotacao_exib = cotacao_raw
            pm_visual = pm_usuario

        pnl_valor = valor_base_hoje - valor_base_custo
        
        if valor_base_custo > 0:
            pnl_pct = (pnl_valor / valor_base_custo) * 100
        else:
            pnl_pct = 0.0

        st.markdown(f"#### 🎯 Performance Cambial ({moeda_sel} $\\to$ {d['moeda_base']})")
        
        k1, k2, k3, k4 = st.columns(4)
        
        m1, m2, m3, m4 = st.columns(4)
        with m1:
            st.markdown(render_metric_card(f"Posição {moeda_sel}", f"{exposicao_total:,.2f}", icon="🏁"), unsafe_allow_html=True)
        with m2:
            st.markdown(render_metric_card(f"PnL Cambial", f"{simbolo_base} {pnl_valor:,.0f}", f"{pnl_pct:.1f}%", pnl_pct >= 0, icon="📈"), unsafe_allow_html=True)
        with m3:
            st.markdown(render_metric_card(f"PM {moeda_sel}", f"{simbolo_base} {pm_visual:.3f}", icon="📍"), unsafe_allow_html=True)
        with m4:
            st.markdown(render_metric_card(f"Cotação", f"{simbolo_base} {cotacao_exib:.3f}", icon="⚡"), unsafe_allow_html=True)

    st.markdown("---")
    
    # Transaction History (The missing "View of Contributions")
    with st.expander("📜 Histórico de Aportes (Trades)", expanded=False):
        # Filter for ANY trade involving this currency (Source or Destination)
        cols_show = ['data', 'corretora destino', 'moeda_origem', 'valor_origem', 'taxa', 'valor_destino', 'moeda_destino']
        
        df_show = df_cambio[
            (df_cambio['moeda_destino'] == moeda_sel) | 
            (df_cambio['moeda_origem'] == moeda_sel)
        ].copy()
        
        if not df_show.empty:
            df_show = df_show.sort_values('data', ascending=False)
            
            # Calculate PnL for Inflows (Buying the currency)
            df_show['valor_atual_base'] = 0.0
            df_show['pnl_valor'] = 0.0
            df_show['pnl_pct'] = 0.0
            
            # Only calculate for rows where we BOUGHT the selected currency (Inflow)
            mask_inflow = df_show['moeda_destino'] == moeda_sel
            
            if is_indirect:
                # Indirect: Value Now = Amount(Currency) / Rate
                df_show.loc[mask_inflow, 'valor_atual_base'] = df_show.loc[mask_inflow, 'valor_destino'] / cotacao_raw
            else:
                # Direct: Value Now = Amount(Currency) * Rate
                df_show.loc[mask_inflow, 'valor_atual_base'] = df_show.loc[mask_inflow, 'valor_destino'] * cotacao_raw
                
            # PnL = Value Now - Cost (valor_origem)
            df_show.loc[mask_inflow, 'pnl_valor'] = df_show.loc[mask_inflow, 'valor_atual_base'] - df_show.loc[mask_inflow, 'valor_origem']
            
            # PnL %
            df_show.loc[mask_inflow, 'pnl_pct'] = (df_show.loc[mask_inflow, 'pnl_valor'] / df_show.loc[mask_inflow, 'valor_origem']).fillna(0.0)
            
            # --- Summary KPIs ---
            total_purchased_dest = df_show.loc[mask_inflow, 'valor_destino'].sum()
            
            if is_indirect:
                theoretical_cost_base = total_purchased_dest / pm_usuario if pm_usuario > 0 else 0.0
                current_val_base = total_purchased_dest / cotacao_raw
            else:
                theoretical_cost_base = total_purchased_dest * pm_usuario
                current_val_base = total_purchased_dest * cotacao_raw
                
            total_pnl_hist = current_val_base - theoretical_cost_base
            total_pnl_pct_hist = (total_pnl_hist / theoretical_cost_base * 100) if theoretical_cost_base > 0 else 0.0
            
            c_kpi1, c_kpi2 = st.columns(2)
            with c_kpi1:
                st.markdown(render_metric_card(f"Total Comprado ({moeda_sel})", f"{simbolo} {total_purchased_dest:,.2f}", icon="💰"), unsafe_allow_html=True)
            with c_kpi2:
                st.markdown(render_metric_card("PnL Histórico", f"R$ {total_pnl_hist:,.2f}", f"{total_pnl_pct_hist:.2f}%", total_pnl_hist >= 0, icon="💸"), unsafe_allow_html=True)
            
            st.divider()

            cols_show = ['data', 'corretora destino', 'moeda_origem', 'valor_origem', 'taxa', 'valor_destino', 'moeda_destino', 'pnl_valor', 'pnl_pct']

            st.dataframe(
                df_show[cols_show],
                column_config={
                    "data": st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
                    "corretora destino": "Corretora",
                    "moeda_origem": "Origem",
                    "valor_origem": st.column_config.NumberColumn("Investido (R$)", format="R$ %.2f"),
                    "taxa": st.column_config.NumberColumn("Taxa (VET)", format="%.4f"),
                    "valor_destino": st.column_config.NumberColumn("Recebido", format="%.2f"),
                    "moeda_destino": "Destino",
                    "pnl_valor": st.column_config.NumberColumn("Lucro/Prej (R$)", format="R$ %.2f"),
                    "pnl_pct": st.column_config.NumberColumn("Rentab. (%)", format="%.2f%%"),
                },
                use_container_width=True,
                hide_index=True
            )
        else:
            st.markdown(f'<div class="glass-alert glass-info">ℹ️ Nenhum registro encontrado para {moeda_sel}.</div>', unsafe_allow_html=True)

    inverter = is_indirect

    if d['investido_rv'] > 0 and pm_usuario > 0:
        with st.expander("🌊 Decomposição de Lucro (Ativos vs. Câmbio)", expanded=True):
            
            total_rv_original_moeda = d['investido_rv']
            total_rv_atual_moeda = d['atual_rv']
            
            if is_indirect:
                investido_base = total_rv_original_moeda / pm_usuario
                delta_ativo_base = (total_rv_atual_moeda - total_rv_original_moeda) / pm_usuario
                val_atual_convertido_hoje = total_rv_atual_moeda / cotacao_raw
                val_atual_convertido_pm = total_rv_atual_moeda / pm_usuario
                delta_cambio_base = val_atual_convertido_hoje - val_atual_convertido_pm
                valor_final_base = val_atual_convertido_hoje
            else:
                investido_base = total_rv_original_moeda * pm_usuario
                delta_ativo_base = (total_rv_atual_moeda - total_rv_original_moeda) * pm_usuario
                delta_cambio_base = total_rv_atual_moeda * (cotacao_raw - pm_usuario)
                valor_final_base = total_rv_atual_moeda * cotacao_raw

            fig_water = go.Figure(go.Waterfall(
                name="Atribuição", orientation="v",
                measure=["relative", "relative", "relative", "total"],
                x=["Investido Inicial", "Resultado Papéis", "Variação Cambial", "Valor Atual"],
                textposition="outside",
                text=[
                    f"{simbolo_base} {investido_base/1000:.1f}k",
                    f"{'+' if delta_ativo_base > 0 else ''}{simbolo_base} {delta_ativo_base/1000:.1f}k",
                    f"{'+' if delta_cambio_base > 0 else ''}{simbolo_base} {delta_cambio_base/1000:.1f}k",
                    f"{simbolo_base} {valor_final_base/1000:.1f}k"
                ],
                y=[investido_base, delta_ativo_base, delta_cambio_base, valor_final_base],
                connector={"line": {"color": "rgb(63, 63, 63)"}},
                decreasing={"marker": {"color": "#FF4B4B"}},
                increasing={"marker": {"color": "#00C805"}},
                totals={"marker": {"color": "#2979FF"}}
            ))

            fig_water.update_layout(
                title=dict(text=f"Origem do Retorno em {d['moeda_base']}", font=dict(size=14)),
                waterfallgap=0.1, template="plotly_dark", height=350,
                margin=dict(l=20, r=20, t=40, b=20),
                paper_bgcolor='rgba(0,0,0,0)',
                plot_bgcolor='rgba(0,0,0,0)'
            )
            st.plotly_chart(fig_water, use_container_width=True)

    col_grafico, col_dados = st.columns([2, 1])

    with col_grafico:
        st.markdown(f'<div class="tab-header-sm">📈 Análise Técnica: {moeda_sel} → {d["moeda_base"]}</div>', unsafe_allow_html=True)
        
        if not df_hist.empty:
            if isinstance(df_hist, pd.Series): df_hist = df_hist.to_frame()
            if isinstance(df_hist.columns, pd.MultiIndex): df_hist.columns = df_hist.columns.get_level_values(0)
            
            series_plot = df_hist.iloc[:, 0]
            if inverter: 
                series_plot = 1 / series_plot

            sma = series_plot.rolling(window=21).mean()
            
            y_min = series_plot.min()
            y_max = series_plot.max()
            margin = (y_max - y_min) * 0.1
            range_y = [y_min - margin, y_max + margin]

            fig = go.Figure()
            fig.add_trace(go.Scatter(
                x=series_plot.index, y=series_plot.values,
                mode='lines', name='Cotação',
                fill='tozeroy', line=dict(color='#00B0FF', width=2),
                fillcolor='rgba(0, 176, 255, 0.1)'
            ))

            fig.add_trace(go.Scatter(
                x=sma.index, y=sma.values,
                mode='lines', name='Média 21d',
                line=dict(color='white', width=1, dash='dot')
            ))

            pm_usuario_val = d['pm_cambio']
            if inverter and pm_usuario_val > 0:
                pm_visual_g = 1 / pm_usuario_val
            else:
                pm_visual_g = pm_usuario_val

            if pm_visual_g > 0:
                cor_pm = '#00E676' if cotacao_exib >= pm_visual_g else '#FF5252' 
                fig.add_hline(y=pm_visual_g, line_width=2, line_dash="dash", line_color=cor_pm)
                fig.add_annotation(
                    x=series_plot.index[-1], y=pm_visual_g,
                    text=f"Seu PM: {pm_visual_g:.4f}",
                    showarrow=False, yshift=10, font=dict(color=cor_pm, size=12)
                )

            fig.update_layout(
                template="plotly_dark", height=400,
                margin=dict(l=20, r=20, t=30, b=20),
                hovermode="x unified", showlegend=True,
                legend=dict(orientation="h", y=1.02, xanchor="right", x=1),
                yaxis=dict(range=range_y),
                paper_bgcolor='rgba(0,0,0,0)',
                plot_bgcolor='rgba(0,0,0,0)'
            )
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.markdown('<div class="glass-alert glass-warn">⚠️ Dados históricos indisponíveis.</div>', unsafe_allow_html=True)

    with col_dados:
        st.markdown('<div class="tab-header-sm">📊 Alocação</div>', unsafe_allow_html=True)
        
        labels = ['Caixa', 'Renda Variável', 'Renda Fixa']
        values = [caixa, d['atual_rv'], d['atual_rf']]
        
        clean_data = [(l, v) for l, v in zip(labels, values) if v > 0]
        
        if clean_data:
            labels_c, values_c = zip(*clean_data)
            fig_pie = px.pie(values=values_c, names=labels_c, hole=0.5, color_discrete_sequence=['#00E676', '#2979FF', '#FFCA28'])
            fig_pie.update_layout(showlegend=True, margin=dict(t=0, b=0, l=0, r=0), height=250, legend=dict(orientation="h"), paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
            st.plotly_chart(fig_pie, use_container_width=True)

        st.markdown("###### Detalhamento Patrimonial")
        df_break = pd.DataFrame({
            'Categoria': ['Caixa Livre', 'Renda Variável', 'Renda Fixa'],
            'Investido': [caixa, d['investido_rv'], d['investido_rf']],
            'Valor Atual': [caixa, d['atual_rv'], d['atual_rf']]
        })
        df_break = df_break[df_break['Valor Atual'] > 0]
        
        st.dataframe(
            df_break.style.format({'Investido': '{:,.2f}', 'Valor Atual': '{:,.2f}'}), 
            hide_index=True,
            use_container_width=True
        )

    st.markdown("---")

    with st.container(border=True):
        st.markdown('<div class="tab-header-sm">⚡ Stress Test & Cenários</div>', unsafe_allow_html=True)
        st.caption(f"Simule o impacto da variação cambial sobre o seu patrimônio total em {moeda_sel}.")
        
        shock = st.slider(f"Ajuste a Variação da Cotação ({moeda_sel})", -50, 50, 0, format="%+d%%")
        
        cotacao_base_sim = cotacao_exib if cotacao_exib > 0 else 1.0
        cotacao_simulada = cotacao_base_sim * (1 + shock/100)
        patrimonio_convertido_hoje = exposicao_total * cotacao_base_sim
        patrimonio_convertido_sim = exposicao_total * cotacao_simulada
        diff_financeira = patrimonio_convertido_sim - patrimonio_convertido_hoje
        
        sc1, sc2, sc3 = st.columns(3)
        with sc1:
            st.markdown(render_metric_card("Cotação Simulada", f"{simbolo_base} {cotacao_simulada:.4f}", f"{shock}%", shock >= 0, icon="📉"), unsafe_allow_html=True)
        with sc2:
            st.markdown(render_metric_card(f"Patrimônio ({d['moeda_base']})", f"{simbolo_base} {patrimonio_convertido_sim:,.2f}", icon="🌍"), unsafe_allow_html=True)
        with sc3:
            st.markdown(render_metric_card("Impacto Financeiro", f"{simbolo_base} {diff_financeira:,.0f}", "Ganho" if diff_financeira > 0 else "Perda", diff_financeira >= 0, icon="⚡"), unsafe_allow_html=True)

with tab4:
    if not df_proventos_bruto.empty:
        df_p = df_proventos_bruto.copy()
        
        if filtro_moeda != 'Todas': 
            df_p = df_p[df_p['moeda'] == filtro_moeda]
        
        df_p['setor_calc'] = df_p['ticker'].apply(identificar_setor_ativo)

        if filtro_setor:
            df_p = df_p[df_p['setor_calc'].isin(filtro_setor)]
        
        if lista_tickers_final:
            def limpar_sufixo_prov(t): return str(t).replace('.SA', '').replace('.TO', '').replace('.L', '').strip().upper()
            tickers_permitidos = {limpar_sufixo_prov(t) for t in lista_tickers_final}
            df_p = df_p[df_p['ticker'].apply(limpar_sufixo_prov).isin(tickers_permitidos)]
        else: 
            df_p = df_p[0:0]

        def conv_brl(row):
            m = str(row.get('moeda', 'BRL')).strip().upper()
            if m in ['NAN', 'NONE', '']: m = 'BRL'
            v = row['valor'] if pd.notna(row['valor']) else 0.0
            if m == 'USD': return v * usd
            if m == 'CAD': return v * cad
            if m == 'EUR': return v * eur
            return v
        
        if not df_p.empty: 
            df_p['valor_brl'] = df_p.apply(conv_brl, axis=1)

        st.markdown('<div class="tab-header">💰 Extrato de Proventos (Consolidado R$)</div>', unsafe_allow_html=True)
        st.caption("💡 Para importar proventos do IBKR, acesse **Configurações** → **Importar Dados**")

        if not df_p.empty:
            df_p['ano_real'] = df_p['data'].dt.year
            df_p['mes_real'] = df_p['data'].dt.month
            anos_disponiveis = sorted(df_p['ano_real'].unique().tolist(), reverse=True)
            meses_map = {1:'Jan', 2:'Fev', 3:'Mar', 4:'Abr', 5:'Mai', 6:'Jun', 7:'Jul', 8:'Ago', 9:'Set', 10:'Out', 11:'Nov', 12:'Dez'}
            
            col_ano, col_mes = st.columns(2)
            with col_ano: 
                anos_sel = st.multiselect("📅 Filtrar Anos:", anos_disponiveis, placeholder="Todos os anos")
            with col_mes:
                opcoes_meses = list(meses_map.values())
                meses_sel_nomes = st.multiselect("📅 Filtrar Meses:", opcoes_meses, placeholder="Todos os meses")
                meses_sel = [k for k,v in meses_map.items() if v in meses_sel_nomes]
            
            df_filter = df_p.copy()
            if anos_sel: df_filter = df_filter[df_filter['ano_real'].isin(anos_sel)]
            if meses_sel: df_filter = df_filter[df_filter['mes_real'].isin(meses_sel)]

            if not df_filter.empty:
                container_kpi = st.container()
                st.markdown("---")
                
                col_evolucao, col_proporcao = st.columns([2, 1])
                
                with col_proporcao:
                    st.write("🏆 **Top Pagadores**")
                    grp = st.radio("Agrupar:", ["Ativo", "Categoria", "Tipo"], horizontal=True, label_visibility="collapsed", key="radio_pie_group")
                    col_grp = 'ticker'
                    if grp == "Categoria" and 'categoria' in df_filter.columns: col_grp = 'categoria'
                    elif grp == "Tipo" and 'lancamento' in df_filter.columns: col_grp = 'lancamento'
                    
                    df_pie = df_filter.groupby(col_grp)['valor_brl'].apply(lambda x: x[x>0].sum()).reset_index().sort_values('valor_brl', ascending=False)
                    if not df_pie.empty:
                        fig_p = px.pie(df_pie, values='valor_brl', names=col_grp, hole=0.4, color_discrete_sequence=px.colors.qualitative.Prism)
                        fig_p.update_traces(textinfo='percent+label', textposition='inside')
                        fig_p.update_layout(showlegend=False, margin=dict(t=20, b=0, l=0, r=0), height=350, paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
                        st.plotly_chart(fig_p, use_container_width=True)
                    else:
                        st.markdown('<div class="glass-alert glass-info">ℹ️ Sem valores positivos para gráfico.</div>', unsafe_allow_html=True)

                with container_kpi:
                    bruto = df_filter[df_filter['valor_brl'] > 0]['valor_brl'].sum()
                    imposto_val = abs(df_filter[df_filter['valor_brl'] < 0]['valor_brl'].sum())
                    liq = df_filter['valor_brl'].sum()
                    qtd_meses = len(df_filter['data'].dt.to_period('M').unique())
                    media = liq / qtd_meses if qtd_meses > 0 else 0
                    
                    k1, k2, k3, k4 = st.columns(4)
                    with k1:
                        st.markdown(render_metric_card("Total Bruto", f"R$ {bruto:,.0f}", icon="💰"), unsafe_allow_html=True)
                    with k2:
                        st.markdown(render_metric_card("Impostos", f"R$ {imposto_val:,.0f}", "-Retido", False, icon="🧾"), unsafe_allow_html=True)
                    with k3:
                        st.markdown(render_metric_card("Líquido (Caixa)", f"R$ {liq:,.0f}", icon="🏁"), unsafe_allow_html=True)
                    with k4:
                        st.markdown(render_metric_card("Média Mensal", f"R$ {media:,.0f}", icon="📊"), unsafe_allow_html=True)

                st.markdown("### 🧾 Resumo por Ativo")
                df_resumo_simples = df_filter.groupby('ticker')['valor_brl'].sum().reset_index().sort_values('valor_brl', ascending=False)
                st.dataframe(df_resumo_simples.style.format({'valor_brl': 'R$ {:,.2f}'}), use_container_width=True, height=250)
                
                st.markdown("---")
                
                with col_evolucao:
                    df_filter['pos'] = df_filter['valor_brl'].apply(lambda x: x if x > 0 else 0)
                    df_filter['neg'] = df_filter['valor_brl'].apply(lambda x: x if x < 0 else 0)
                    df_filter['sort'] = df_filter['data'].dt.strftime('%Y-%m')
                    df_filter['mes'] = df_filter['data'].dt.strftime('%b/%Y')
                    df_time = df_filter.groupby(['sort', 'mes']).agg({'valor_brl':'sum', 'pos':'sum', 'neg':'sum'}).reset_index().sort_values('sort')
                    
                    if not df_time.empty:
                        fig_t = px.bar(df_time, x='mes', y='valor_brl', title="Evolução Mensal (Líquido)", custom_data=['pos', 'neg'])
                        fig_t.update_traces(marker_color='#00CC96', hovertemplate="<b>%{x}</b><br>Líq: R$ %{y:,.2f}<br>Bruto: %{customdata[0]:,.2f}<br>Imp: %{customdata[1]:,.2f}")
                        fig_t.update_layout(hovermode="x unified", xaxis={'type':'category'}, height=450, paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
                        st.plotly_chart(fig_t, use_container_width=True)


                st.markdown("### 🌊 Fluxo de Capital (Ticker ➔ Setor ➔ Moeda)")

                # Garantir coluna moeda existe
                if 'moeda' not in df_filter.columns:
                    df_filter['moeda'] = 'BRL'

                df_L1 = df_filter.groupby(['ticker', 'setor_calc'])['valor_brl'].sum().reset_index()
                df_L1.columns = ['source', 'target', 'value']

                df_L2 = df_filter.groupby(['setor_calc', 'moeda'])['valor_brl'].sum().reset_index()
                df_L2.columns = ['source', 'target', 'value']

                df_L1 = df_L1[df_L1['value'] > 0]
                df_L2 = df_L2[df_L2['value'] > 0]

                if not df_L1.empty and not df_L2.empty:
                    labels_tickers = sorted(df_L1['source'].unique().tolist())
                    labels_sectors = sorted(df_L1['target'].unique().tolist())
                    labels_moedas  = sorted(df_L2['target'].unique().tolist())
                    
                    all_labels = labels_tickers + labels_sectors + labels_moedas
                    
                    id_map = {label: i for i, label in enumerate(all_labels)}
                    
                    sources = []
                    targets = []
                    values = []
                    colors = []

                    for _, row in df_L1.iterrows():
                        sources.append(id_map[row['source']])
                        targets.append(id_map[row['target']])
                        values.append(row['value'])
                        colors.append('rgba(33, 150, 243, 0.4)') 

                    for _, row in df_L2.iterrows():
                        sources.append(id_map[row['source']]) 
                        targets.append(id_map[row['target']])
                        values.append(row['value'])
                        colors.append('rgba(76, 175, 80, 0.4)') 

                    node_colors = []
                    for label in all_labels:
                        if label in labels_tickers: node_colors.append("#2196F3") 
                        elif label in labels_sectors: node_colors.append("#4CAF50") 
                        else: node_colors.append("#FF9800") 

                    fig_sankey = go.Figure(data=[go.Sankey(
                        node = dict(
                          pad = 20,
                          thickness = 20,
                          line = dict(color = "black", width = 0.5),
                          label = all_labels,
                          color = node_colors,
                          hovertemplate='%{label}<br>Total: R$ %{value:,.2f}<extra></extra>'
                        ),
                        link = dict(
                          source = sources,
                          target = targets,
                          value = values,
                          color = colors,
                          hovertemplate='Fluxo: R$ %{value:,.2f}<extra></extra>'
                        )
                    )])

                    fig_sankey.update_layout(
                        height=600, 
                        font=dict(size=12, color="white"),
                        template="plotly_dark",
                        margin=dict(l=10, r=10, t=30, b=30),
                        paper_bgcolor='rgba(0,0,0,0)', 
                        plot_bgcolor='rgba(0,0,0,0)'
                    )
                    
                    st.plotly_chart(fig_sankey, use_container_width=True)
                    
                else:
                    st.markdown('<div class="glass-alert glass-info">ℹ️ Dados insuficientes para gerar o fluxo de 3 níveis.</div>', unsafe_allow_html=True)
                
                st.markdown("---")
                st.markdown('<div class="tab-header-sm">📋 Detalhamento</div>', unsafe_allow_html=True)
                def st_neg(v): return 'color: #ff4b4b' if v < 0 else 'color: #4CAF50'
                cols = ['data','ticker','lancamento','valor','moeda','valor_brl']
                cols = [c for c in cols if c in df_filter.columns]
                # Filter out invalid dates (NaT) to prevent formatter crash
                df_display = df_filter[cols].dropna(subset=['data']).sort_values('data', ascending=False)
                st.dataframe(
                    df_display.style.format({'valor':'{:,.2f}', 'valor_brl':'R$ {:,.2f}', 'data':'{:%d/%m/%Y}'}).map(st_neg, subset=['valor','valor_brl']),
                    use_container_width=True
                )
            else:
                st.markdown('<div class="glass-alert glass-warn">⚠️ Sem dados para o período selecionado.</div>', unsafe_allow_html=True)
        else:
            st.markdown('<div class="glass-alert glass-warn">⚠️ Nenhum provento encontrado para os ativos filtrados.</div>', unsafe_allow_html=True)
    else:
        st.markdown('<div class="glass-alert glass-info">ℹ️ Arquivo de proventos vazio.</div>', unsafe_allow_html=True)
        
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
            
        except Exception as e:
            st.warning(f"Não foi possível carregar PTAX oficial: {e}")
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
        st.error(f"Erro ao processar curva RF (Nova Lógica): {e}")
    
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
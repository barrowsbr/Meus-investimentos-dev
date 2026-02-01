import streamlit as st
from core.auth import init_auth_state

# --- INIT SESSION STATE ---
init_auth_state()

# --- PAGE CONFIGURATION ---
st.set_page_config(
    page_title="Wealth Manager",
    page_icon="🏦",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- ADVANCED CUSTOM CSS ---
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');

    /* Reset & Base */
    html, body, [class*="css"] {
        font-family: 'Outfit', sans-serif;
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

    /* Hide Default Elements */
    #MainMenu, footer, header {visibility: hidden;}
    [data-testid="stSidebar"] {display: none;}
    
    /* Hero Title - Responsive */
    .hero-container {
        text-align: center;
        padding-top: 4vh;
        padding-bottom: 6vh;
        animation: fadeIn 1.2s ease-out;
    }
    
    .hero-title {
        font-size: 4.5rem;
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
        font-size: 1.2rem;
        font-weight: 300;
        margin-top: 10px;
        padding: 0 10px;
    }

    /* Modern Clickable Glass Card */
    .nav-card {
        background: rgba(30, 41, 59, 0.4);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 24px;
        padding: 40px 20px;
        width: 100%;
        max-width: 380px;
        height: 380px;
        margin: 0 auto;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        box-shadow: 0 20px 40px -10px rgba(0,0,0,0.5);
        text-decoration: none !important;
        color: white !important;
        cursor: pointer;
    }
    
    .nav-card:hover {
        transform: translateY(-8px) scale(1.01);
        background: rgba(30, 41, 59, 0.6);
        border-color: rgba(99, 102, 241, 0.4);
        box-shadow: 0 25px 50px -12px rgba(99, 102, 241, 0.25);
    }

    /* Icon Styling */
    .icon-box {
        font-size: 4rem;
        margin-bottom: 25px;
        background: rgba(255,255,255,0.03);
        width: 100px;
        height: 100px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        border: 1px solid rgba(255,255,255,0.05);
        transition: 0.4s;
    }
    
    .nav-card:hover .icon-box {
        background: rgba(99, 102, 241, 0.1);
        border-color: rgba(99, 102, 241, 0.3);
        transform: scale(1.1) rotate(5deg);
    }

    .card-title {
        color: white;
        font-size: 1.8rem;
        font-weight: 700;
        margin-bottom: 12px;
    }
    
    .card-desc {
        color: #94a3b8;
        font-size: 1rem;
        line-height: 1.6;
        margin-bottom: 10px;
    }

    /* Mobile Responsive Adjustments */
    @media (max-width: 768px) {
        .hero-title {
            font-size: 2.8rem;
        }
        .nav-card {
            height: auto;
            min-height: 340px;
            padding: 30px 20px;
            max-width: 100%;
        }
        div[data-testid="column"] {
            margin-bottom: 2rem;
        }
    }
    
    /* Center columns content hacks for Streamlit */
    div[data-testid="column"] {
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    /* Animations */
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
    }

    /* Snapshot Card Styles */
    .snapshot-card {
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.2);
        border-radius: 16px;
        padding: 20px;
        margin-bottom: 30px;
        display: flex;
        justify-content: space-around;
        align-items: center;
        backdrop-filter: blur(10px);
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 10px 20px -5px rgba(0,0,0,0.3);
    }

    .snapshot-card:hover {
        transform: translateY(-4px) scale(1.01);
        background: rgba(16, 185, 129, 0.15);
        border-color: rgba(52, 211, 153, 0.4);
        box-shadow: 0 20px 40px -10px rgba(16, 185, 129, 0.2);
    }
</style>
""", unsafe_allow_html=True)

# --- IMPORTS ---
import pandas as pd
from core.data.loader import load_assets
from core.data.market import fetch_market_data
from core.utils import format_decimal_br

# --- HERO SECTION ---
st.markdown("""
<div class="hero-container">
    <div class="hero-title">BARROOTS</div>
    <div class="hero-subtitle">Sistema Integrado para Gestão Pessoal</div>
</div>
""", unsafe_allow_html=True)

# --- DAILY SNAPSHOT CALCULATION ---
with st.spinner("Sintonizando mercado..."):
    df_assets = load_assets()
    dolar_val = 0.0
    dolar_var = 0.0
    rv_day_gain = 0.0
    rv_day_pct = 0.0
    dolar_change = 0.0
    
    if not df_assets.empty:
        df_rv = df_assets[df_assets['ticker'].notna()]
        tickers = df_rv['ticker'].unique().tolist()
        if 'BRL=X' not in tickers: tickers.append('BRL=X')
        
        map_prices, map_changes = fetch_market_data(tickers)
        
        dolar_val = map_prices.get('BRL=X', 5.0)
        dolar_change = map_changes.get('BRL=X', 0.0)
        dolar_var = (dolar_change / (dolar_val - dolar_change)) * 100 if (dolar_val - dolar_change) != 0 else 0.0
        
        from core.finance import calcular_carteira_fechada
        df_pos, _ = calcular_carteira_fechada(df_assets)
        
        total_mkt_val = 0.0
        if not df_pos.empty:
            for _, row in df_pos.iterrows():
                t = row['Ticker']
                q = row['Qtd']
                m = row['Moeda']
                
                if q > 0:
                    delta = map_changes.get(t, 0.0)
                    price = map_prices.get(t, 0.0)
                    rate = 1.0
                    if m == 'USD': rate = dolar_val
                    
                    gain_brl = q * delta * rate
                    rv_day_gain += gain_brl
                    total_mkt_val += (q * price * rate)
            
            if (total_mkt_val - rv_day_gain) > 0:
                rv_day_pct = (rv_day_gain / (total_mkt_val - rv_day_gain)) * 100

# --- SNAPSHOT CARD ---
col_snap_1, col_snap_2, col_snap_3 = st.columns([1, 8, 1])
with col_snap_2:
    st.markdown(f"""
    <div class="snapshot-card">
        <div style="text-align: center;">
            <div style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 4px;">Renda Variável (Hoje)</div>
            <div style="font-size: 1.8rem; font-weight: 700; color: {'#34d399' if rv_day_gain >= 0 else '#f87171'};">
                R$ {format_decimal_br(rv_day_gain, 2)}
                <span style="font-size: 1rem; opacity: 0.8;">({format_decimal_br(rv_day_pct, 2)}%)</span>
            </div>
        </div>
        <div style="width: 1px; height: 40px; background: rgba(255,255,255,0.1);"></div>
        <div style="text-align: center;">
            <div style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 4px;">Dólar (USD)</div>
            <div style="font-size: 1.8rem; font-weight: 700; color: #f8fafc;">
                R$ {format_decimal_br(dolar_val, 3)}
                <span style="font-size: 1rem; opacity: 0.8; color: {'#34d399' if dolar_change >= 0 else '#f87171'};">
                    ({format_decimal_br(dolar_var, 2)}%)
                </span>
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)

# --- NAVIGATION CONTAINER ---
# Row 1: Investimentos | Finanças
col_r1_l, col_r1_c1, col_r1_c2, col_r1_r = st.columns([1, 6, 6, 1])

with col_r1_c1:
    st.markdown("""
    <a href="Investimentos" target="_self" class="nav-card">
        <div class="icon-box">🚀</div>
        <div class="card-title">Patrimônio</div>
        <div class="card-desc">
            Dashboard de alocação.<br>
            Acompanhe carteira e ativos.
        </div>
        <div style="font-size: 0.8rem; color: #6366f1; font-weight: 600; margin-top: 10px;">Acessar Carteira →</div>
    </a>
    """, unsafe_allow_html=True)

with col_r1_c2:
    st.markdown("""
    <a href="Finanças" target="_self" class="nav-card">
        <div class="icon-box">💎</div>
        <div class="card-title">Finanças</div>
        <div class="card-desc">
            Controle financeiro pessoal.<br>
            Gerencie gastos e cartão de crédito.
        </div>
        <div style="font-size: 0.8rem; color: #6366f1; font-weight: 600; margin-top: 10px;">Acessar Finanças →</div>
    </a>
    """, unsafe_allow_html=True)

st.markdown("<div style='height: 20px'></div>", unsafe_allow_html=True)

# Row 2: Performance | Editor
col_r2_l, col_r2_c1, col_r2_c2, col_r2_r = st.columns([1, 6, 6, 1])

with col_r2_c1:
    st.markdown("""
    <a href="Performance" target="_self" class="nav-card">
        <div class="icon-box">📈</div>
        <div class="card-title">Performance</div>
        <div class="card-desc">
            Análise GIPS e rentabilidade real.<br>
            Time-Weighted Return (TWR) puro.
        </div>
        <div style="font-size: 0.8rem; color: #6366f1; font-weight: 600; margin-top: 10px;">Ver Rentabilidade →</div>
    </a>
    """, unsafe_allow_html=True)

with col_r2_c2:
    st.markdown("""
    <a href="Editor" target="_self" class="nav-card">
        <div class="icon-box">📝</div>
        <div class="card-title">Editor</div>
        <div class="card-desc">
            Edição de registros brutos.<br>
            Ajuste ativos e transações.
        </div>
        <div style="font-size: 0.8rem; color: #6366f1; font-weight: 600; margin-top: 10px;">Acessar Editor →</div>
    </a>
    """, unsafe_allow_html=True)

st.markdown("<div style='height: 20px'></div>", unsafe_allow_html=True)

# Row 3: Ferramentas (Aligned with first column)
col_r3_l, col_r3_c1, col_r3_c2, col_r3_r = st.columns([1, 6, 6, 1])

with col_r3_c1:
    st.markdown("""
    <a href="Ferramentas" target="_self" class="nav-card">
        <div class="icon-box">🛠️</div>
        <div class="card-title">Ferramentas</div>
        <div class="card-desc">
            Área de dados e scripts.<br>
            Importação e otimização de registros.
        </div>
        <div style="font-size: 0.8rem; color: #6366f1; font-weight: 600; margin-top: 10px;">Acessar Ferramentas →</div>
    </a>
    """, unsafe_allow_html=True)

# --- FOOTER ---
st.markdown("""
<div style="text-align: center; color: #475569; padding-top: 80px; padding-bottom: 40px; font-size: 0.8rem;">
    Version 145.64 - Final 3.4
</div>
""", unsafe_allow_html=True)

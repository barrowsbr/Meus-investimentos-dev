import streamlit as st
import base64
from pathlib import Path
from core.auth import init_auth_state

# --- INIT SESSION STATE ---
init_auth_state()

# --- PAGE CONFIGURATION ---
st.set_page_config(
    page_title="BARROOTS",
    page_icon="🌿",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- LOAD BACKGROUND IMAGE AS BASE64 ---
def get_base64_image(image_path):
    """Convert image to base64 string."""
    try:
        with open(image_path, "rb") as img_file:
            return base64.b64encode(img_file.read()).decode()
    except:
        return None

# Path to the wave image
img_path = Path(__file__).parent / "pictures" / "Gemini_Generated_Image_khtz3ukhtz3ukhtz.png"
bg_image_base64 = get_base64_image(img_path)

# Build background CSS
bg_image_css = ""
if bg_image_base64:
    bg_image_css = f"background-image: url('data:image/png;base64,{bg_image_base64}');"

# --- CSS STYLES (static, no f-string issues) ---
CSS_PART1 = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');

.easter-egg-btn {
    position: fixed;
    top: 0;
    right: 0;
    width: 40px;
    height: 40px;
    z-index: 99999;
    opacity: 0.02;
    cursor: pointer;
}
.easter-egg-btn:hover { opacity: 0.1; }

.tools-fab {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 50px;
    height: 50px;
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(30, 41, 59, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    font-size: 1.5rem;
    text-decoration: none;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
}
.tools-fab:hover {
    background: rgba(99, 102, 241, 0.3);
    border-color: rgba(99, 102, 241, 0.5);
    transform: scale(1.1);
}

html, body, [class*="css"] {
    font-family: 'Outfit', sans-serif;
}

.stApp {
    background: #0b1120;
    min-height: 100vh;
}

#MainMenu, footer, header { visibility: hidden; }
[data-testid="stSidebar"] { display: none; }

.hero-section {
    position: relative;
    min-height: 420px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 50px 20px 60px;
    margin: -10rem -10rem 0 -10rem;
    background-color: #0b1120;
    background-size: cover;
    background-position: center center;
    background-repeat: no-repeat;
"""

CSS_PART2 = """
}

.hero-section::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 150px;
    background: linear-gradient(to bottom, transparent 0%, #0b1120 100%);
    pointer-events: none;
}

.hero-content {
    position: relative;
    z-index: 10;
    text-align: center;
    animation: fadeIn 1s ease-out;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}

.hero-title {
    font-size: 6.5rem;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: 4px;
    margin-bottom: 14px;
    text-shadow: 
        0 0 10px rgba(255,255,255,0.8),
        0 0 20px rgba(255,255,255,0.6),
        0 0 40px rgba(255,255,255,0.4),
        0 0 80px rgba(255,255,255,0.2);
}

.hero-subtitle {
    font-size: 1.5rem;
    font-weight: 500;
    color: #ffffff;
    letter-spacing: 3px;
    margin-bottom: 40px;
    text-shadow: 
        0 0 10px rgba(255,255,255,0.6),
        0 0 20px rgba(255,255,255,0.3);
}

.metrics-card {
    background: rgba(15, 23, 42, 0.8);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    padding: 25px 40px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 40px;
    box-shadow: 0 15px 50px rgba(0,0,0,0.4);
    max-width: 580px;
    margin: 0 auto;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.metrics-card:hover {
    transform: translateY(-5px) scale(1.02);
    background: rgba(15, 23, 42, 0.95);
    border-color: rgba(99, 102, 241, 0.4);
    box-shadow: 0 25px 50px -12px rgba(99, 102, 241, 0.25), inset 0 0 30px rgba(255,255,255,0.05);
}

.metrics-divider {
    width: 1px;
    height: 50px;
    background: rgba(255,255,255,0.1);
}

.metric-group { text-align: center; }

.metric-label {
    display: block;
    font-size: 0.85rem;
    color: #64748b;
    margin-bottom: 8px;
}

.metric-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #f1f5f9;
}

.metric-change {
    font-size: 0.95rem;
    font-weight: 400;
    margin-left: 6px;
}

.positive { color: #34d399; }
.negative { color: #f87171; }

.nav-card {
    background: rgba(30, 41, 59, 0.5);
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
    background: rgba(30, 41, 59, 0.7);
    border-color: rgba(99, 102, 241, 0.4);
    box-shadow: 0 25px 50px -12px rgba(99, 102, 241, 0.25);
}

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

div[data-testid="column"] {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.arch-btn-wrapper {
    display: flex;
    justify-content: center;
    padding: 0 15px;
    margin-bottom: 20px;
    margin-top: 40px;
}

.arch-button {
    background: linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 20, 50, 0.8) 100%);
    backdrop-filter: blur(15px);
    border: 1px solid rgba(139, 92, 246, 0.4);
    border-radius: 20px;
    padding: 15px 25px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    box-shadow: 0 0 20px rgba(139, 92, 246, 0.25);
    transition: all 0.3s ease;
    max-width: 350px;
    width: 100%;
    cursor: pointer;
    text-decoration: none;
}

.arch-button:hover {
    box-shadow: 0 0 35px rgba(139, 92, 246, 0.4);
    border-color: rgba(139, 92, 246, 0.7);
    transform: translateY(-2px);
}

.arch-icon { font-size: 1.3rem; }

.arch-text {
    color: #f8fafc;
    font-weight: 600;
    font-size: 0.95rem;
    letter-spacing: 0.5px;
}

@media (max-width: 768px) {
    .hero-title { font-size: 3rem; }
    .hero-section { min-height: 350px; padding: 40px 15px 50px; }
    .metrics-card {
        flex-direction: column;
        gap: 20px;
        padding: 20px;
    }
    .metrics-divider {
        width: 80%;
        height: 1px;
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
    .tools-fab {
        width: 45px;
        height: 45px;
        font-size: 1.3rem;
    }
}
</style>
"""

# Inject CSS with background image
st.markdown(CSS_PART1 + bg_image_css + CSS_PART2, unsafe_allow_html=True)

# --- IMPORTS ---
import pandas as pd
from core.data.loader import load_assets
from core.data.market import fetch_market_data
from core.utils import format_decimal_br

# --- LOAD DATA ---
with st.spinner(""):
    df_assets = load_assets()
    dolar_val = 0.0
    dolar_var = 0.0
    rv_day_gain = 0.0
    rv_day_pct = 0.0
    dolar_change = 0.0

    if not df_assets.empty:
        df_rv = df_assets[df_assets['ticker'].notna()]
        tickers = df_rv['ticker'].unique().tolist()
        if 'BRL=X' not in tickers:
            tickers.append('BRL=X')

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
                    if m == 'USD':
                        rate = dolar_val

                    gain_brl = q * delta * rate
                    rv_day_gain += gain_brl
                    total_mkt_val += (q * price * rate)

            if (total_mkt_val - rv_day_gain) > 0:
                rv_day_pct = (rv_day_gain / (total_mkt_val - rv_day_gain)) * 100

# Format values
rv_class = "positive" if rv_day_gain >= 0 else "negative"
dolar_class = "positive" if dolar_change >= 0 else "negative"
rv_value = format_decimal_br(rv_day_gain, 2)
rv_pct = format_decimal_br(rv_day_pct, 2)
dolar_value = format_decimal_br(dolar_val, 3)
dolar_pct = format_decimal_br(dolar_var, 2)

# --- HERO SECTION ---
st.markdown("""
<a href="Easter_Eggs" target="_self" class="easter-egg-btn" title="?"></a>
<a href="Ferramentas" target="_self" class="tools-fab" title="Ferramentas">⚙️</a>

<div class="hero-section">
    <div class="hero-content">
        <h1 class="hero-title">BARROOTS</h1>
        <p class="hero-subtitle">Sistema Integrado para Gestão Pessoal</p>
    </div>
</div>
""", unsafe_allow_html=True)

# --- METRICS CARD (using native Streamlit) ---
st.markdown("""
<style>
.metrics-container {
    display: flex;
    justify-content: center;
    margin-top: -80px;
    position: relative;
    z-index: 100;
    padding: 0 20px;
}
.metrics-box {
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 20px;
    padding: 25px 40px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 40px;
    box-shadow: 0 15px 50px rgba(0,0,0,0.4), inset 0 0 30px rgba(255,255,255,0.02);
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.metrics-box:hover {
    transform: translateY(-5px) scale(1.02);
    background: rgba(15, 23, 42, 0.8);
    border-color: rgba(99, 102, 241, 0.4);
    box-shadow: 0 25px 50px -12px rgba(99, 102, 241, 0.25), inset 0 0 30px rgba(255,255,255,0.05);
}
.metric-item { text-align: center; }
.metric-item-label {
    font-size: 0.85rem;
    color: #64748b;
    margin-bottom: 8px;
}
.metric-item-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #f1f5f9;
}
.metric-item-change {
    font-size: 0.95rem;
    font-weight: 400;
    margin-left: 6px;
}
.metric-divider {
    width: 1px;
    height: 50px;
    background: rgba(255,255,255,0.1);
}
.color-positive { color: #34d399; }
.color-negative { color: #f87171; }
</style>
""", unsafe_allow_html=True)

rv_sign = "+" if rv_day_gain >= 0 else ""
dolar_sign = "+" if dolar_change >= 0 else ""

metrics_html = f"""
<div class="metrics-container">
    <div class="metrics-box">
        <div class="metric-item">
            <div class="metric-item-label">Renda Variável (Hoje)</div>
            <div class="metric-item-value color-{rv_class}">
                R$ {rv_value}
                <span class="metric-item-change">({rv_sign}{rv_pct}%)</span>
            </div>
        </div>
        <div class="metric-divider"></div>
        <div class="metric-item">
            <div class="metric-item-label">Dólar (USD)</div>
            <div class="metric-item-value">
                R$ {dolar_value}
                <span class="metric-item-change color-{dolar_class}">({dolar_sign}{dolar_pct}%)</span>
            </div>
        </div>
    </div>
</div>
"""

st.markdown(metrics_html, unsafe_allow_html=True)

# --- SPACER ---
st.markdown("<div style='height: 30px'></div>", unsafe_allow_html=True)

# --- NAVIGATION CARDS ---
col_nav_l, col_nav_c, col_nav_r = st.columns([1, 8, 1])

with col_nav_c:
    st.markdown('''
    <a href="Investimentos" target="_self" class="nav-card">
        <div class="icon-box">🚀</div>
        <div class="card-title">Patrimônio</div>
        <div class="card-desc">
            Dashboard de alocação.<br>
            Acompanhe carteira e ativos.
        </div>
        <div style="font-size: 0.8rem; color: #6366f1; font-weight: 600; margin-top: 10px;">Acessar Carteira →</div>
    </a>
    ''', unsafe_allow_html=True)

    st.markdown("<div style='height: 20px'></div>", unsafe_allow_html=True)

    st.markdown('''
    <a href="Finanças" target="_self" class="nav-card">
        <div class="icon-box">💎</div>
        <div class="card-title">Finanças</div>
        <div class="card-desc">
            Controle financeiro pessoal.<br>
            Gerencie gastos e cartão de crédito.
        </div>
        <div style="font-size: 0.8rem; color: #6366f1; font-weight: 600; margin-top: 10px;">Acessar Finanças →</div>
    </a>
    ''', unsafe_allow_html=True)

    st.markdown("<div style='height: 20px'></div>", unsafe_allow_html=True)

    st.markdown('''
    <a href="Performance" target="_self" class="nav-card">
        <div class="icon-box">📈</div>
        <div class="card-title">Performance</div>
        <div class="card-desc">
            Análise GIPS e rentabilidade real.<br>
            Time-Weighted Return (TWR) puro.
        </div>
        <div style="font-size: 0.8rem; color: #6366f1; font-weight: 600; margin-top: 10px;">Ver Rentabilidade →</div>
    </a>
    ''', unsafe_allow_html=True)

    st.markdown("<div style='height: 20px'></div>", unsafe_allow_html=True)

    st.markdown('''
    <a href="Historico_Patrimonial" target="_self" class="nav-card">
        <div class="icon-box">🏛️</div>
        <div class="card-title">Legado</div>
        <div class="card-desc">
            Evolução patrimonial histórica.<br>
            Construção de riqueza vs Anos.
        </div>
        <div style="font-size: 0.8rem; color: #6366f1; font-weight: 600; margin-top: 10px;">Ver Evolução →</div>
    </a>
    ''', unsafe_allow_html=True)

    st.markdown("<div style='height: 20px'></div>", unsafe_allow_html=True)

    st.markdown('''
    <a href="Editor" target="_self" class="nav-card">
        <div class="icon-box">📝</div>
        <div class="card-title">Editor</div>
        <div class="card-desc">
            Edição de registros brutos.<br>
            Ajuste ativos e transações.
        </div>
        <div style="font-size: 0.8rem; color: #6366f1; font-weight: 600; margin-top: 10px;">Acessar Editor →</div>
    </a>
    ''', unsafe_allow_html=True)

# --- ARCHITECTURE BUTTON ---
st.markdown('''
<div class="arch-btn-wrapper">
    <a href="Arquitetura" target="_self" class="arch-button">
        <span class="arch-icon">🏗️</span>
        <span class="arch-text">Ver Arquitetura do Sistema</span>
    </a>
</div>
''', unsafe_allow_html=True)

# --- FOOTER ---
st.markdown('''
<div style="text-align: center; color: #475569; padding-top: 80px; padding-bottom: 40px; font-size: 0.8rem;">
    Version 145.64 - Final 3.4
</div>
''', unsafe_allow_html=True)

# --- REFRESH BUTTON ---
col_refresh_spacer, col_refresh_btn = st.columns([20, 1])
with col_refresh_btn:
    if st.button("🔄", key="btn_refresh_fixed", help="Atualizar dados"):
        st.cache_data.clear()
        st.rerun()

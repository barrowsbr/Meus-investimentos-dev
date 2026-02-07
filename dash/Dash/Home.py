import streamlit as st
import streamlit.components.v1 as components
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

# --- CRITICAL CSS INJECTION (AVOID LAYOUT SHIFT) ---
st.markdown("""
<style>
/* PRE-LOADER MASK */
#pre-loader {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: #0b1120;
    z-index: 999999;
    animation: fadeOut 0.5s ease-in-out 0.5s forwards;
    pointer-events: none;
}
@keyframes fadeOut {
    0% { opacity: 1; }
    100% { opacity: 0; visibility: hidden; }
}

/* HIDE DEFAULT ELEMENTS IMMEDIATELY */
#MainMenu, footer, header, .stAppDeployButton, [data-testid="stToolbar"], [data-testid="stHeader"], [data-testid="stStatusWidget"], .viewerBadge_container__1QSob, [data-testid="stManageAppButton"], button[title="Manage app"], div[data-testid="stDecoration"] {
    visibility: hidden !important;
    display: none !important;
    height: 0px !important;
}

/* RESET STREAMLIT LAYOUT */
.block-container {
    padding-top: 0rem !important;
    padding-bottom: 0rem !important;
    padding-left: 0rem !important;
    padding-right: 0rem !important;
    max-width: 100%;
    margin-top: -65px !important;
}

[data-testid="stAppViewContainer"] > .main {
    padding-top: 0rem !important;
    padding-right: 0rem !important;
    padding-left: 0rem !important;
    padding-bottom: 0rem !important;
}

/* MOBILE ADJUSTMENTS */
@media (max-width: 768px) {
    html, body {
        overflow-x: hidden !important;
        width: 100% !important;
    }
    .stApp {
        overflow-x: hidden !important;
        width: 100% !important;
    }
    .block-container {
        margin-top: 0px !important; 
        padding-top: 20px !important;
    }
}
</style>
<div id="pre-loader"></div>
""", unsafe_allow_html=True)

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
    left: 20px;
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
    overflow-x: hidden;
    max-width: 100%;
}

.stApp {
    background: #0b1120;
    min-height: 100vh;
    overflow-x: hidden; /* Force no horizontal scroll */
}

/* Hide Default Elements */
/* REMOVED DUPLICATE CSS BLOCK */

.hero-section {
    position: relative;
    min-height: 420px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 50px 20px 60px;
    margin: 0; /* Reset margins */
    width: 100%; /* Full width */
    background-color: #0b1120;
    background-size: cover;
    background-position: center center;
    background-repeat: no-repeat;
    align-self: center; /* Center in parent */
    left: 0;
    right: 0;

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
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid transparent;
    border-radius: 20px;
    padding: 18px 30px;
    width: 100%;
    max-width: 580px;
    margin: 0 auto;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    text-decoration: none !important;
    color: white !important;
    cursor: pointer;
    position: relative;
}

.nav-card::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 20px;
    padding: 1px;
    background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.1) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
}

.nav-card:hover {
    transform: translateY(-4px);
    background: rgba(15, 23, 42, 0.75);
}

.nav-card.card-patrimonio:hover {
    box-shadow: 0 20px 50px -10px rgba(245, 222, 179, 0.2);
}
.nav-card.card-patrimonio:hover::before {
    background: linear-gradient(135deg, rgba(245, 222, 179, 0.4) 0%, rgba(210, 180, 140, 0.2) 100%);
}

.nav-card.card-financas:hover {
    box-shadow: 0 20px 50px -10px rgba(222, 184, 135, 0.2);
}
.nav-card.card-financas:hover::before {
    background: linear-gradient(135deg, rgba(222, 184, 135, 0.4) 0%, rgba(188, 143, 95, 0.2) 100%);
}

.nav-card.card-performance:hover {
    box-shadow: 0 20px 50px -10px rgba(250, 240, 230, 0.2);
}
.nav-card.card-performance:hover::before {
    background: linear-gradient(135deg, rgba(250, 240, 230, 0.4) 0%, rgba(220, 200, 180, 0.2) 100%);
}

.nav-card.card-legado:hover {
    box-shadow: 0 20px 50px -10px rgba(255, 228, 196, 0.2);
}
.nav-card.card-legado:hover::before {
    background: linear-gradient(135deg, rgba(255, 228, 196, 0.4) 0%, rgba(210, 180, 150, 0.2) 100%);
}

.nav-card.card-editor:hover {
    box-shadow: 0 20px 50px -10px rgba(240, 230, 220, 0.2);
}
.nav-card.card-editor:hover::before {
    background: linear-gradient(135deg, rgba(240, 230, 220, 0.4) 0%, rgba(200, 190, 180, 0.2) 100%);
}

.card-title {
    color: white;
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: 2px;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 10px;
}

.card-icon {
    font-size: 1rem;
    opacity: 0.6;
    font-style: normal;
}

.card-desc {
    color: #94a3b8;
    font-size: 0.85rem;
    letter-spacing: 1px;
}

.card-arrow {
    position: absolute;
    right: 25px;
    opacity: 0;
    transform: translateX(-10px);
    transition: all 0.3s ease;
    color: rgba(255,255,255,0.5);
    font-size: 1.2rem;
}

.nav-card:hover .card-arrow {
    opacity: 1;
    transform: translateX(0);
}

/* Expandable Card Styles */
.expandable-wrapper {
    width: 100%;
    max-width: 580px;
    margin: 0 auto;
}

.expandable-card {
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid transparent;
    border-radius: 20px;
    width: 100%;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    position: relative;
    overflow: hidden;
}

.expandable-card::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 20px;
    padding: 1px;
    background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.1) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
}

.expandable-header {
    padding: 18px 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    cursor: pointer;
    position: relative;
    transition: all 0.3s ease;
}

.expandable-header:hover {
    background: rgba(255,255,255,0.02);
}

.expand-icon {
    position: absolute;
    right: 25px;
    top: 50%;
    transform: translateY(-50%);
    color: rgba(255,255,255,0.4);
    font-size: 0.9rem;
    transition: all 0.3s ease;
}

/* Expandable Card CSS Logic (Checkbox Hack) */
.expand-toggle {
    display: none;
}

.expandable-content {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.expand-toggle:checked ~ .expandable-card .expand-icon {
    transform: translateY(-50%) rotate(180deg);
}

.expand-toggle:checked ~ .expandable-card .expandable-content {
    max-height: 500px;
}

.expand-toggle:checked ~ .expandable-card {
    box-shadow: 0 20px 50px -10px rgba(245, 222, 179, 0.2);
}

.expand-toggle:checked ~ .expandable-card::before {
    background: linear-gradient(135deg, rgba(245, 222, 179, 0.4) 0%, rgba(210, 180, 140, 0.2) 100%);
}

.expandable-card:hover {
    transform: translateY(-4px);
    background: rgba(15, 23, 42, 0.75);
    box-shadow: 0 20px 50px -10px rgba(245, 222, 179, 0.2);
}

.expandable-card:hover::before {
    background: linear-gradient(135deg, rgba(245, 222, 179, 0.4) 0%, rgba(210, 180, 140, 0.2) 100%);
}

.sub-items {
    padding: 0 20px 15px 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.sub-item {
    display: flex;
    align-items: center;
    padding: 12px 20px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    text-decoration: none !important;
    color: #e2e8f0 !important;
    transition: all 0.25s ease;
    position: relative;
    overflow: hidden;
}

.sub-item::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    width: 3px;
    height: 100%;
    background: linear-gradient(to bottom, rgba(245, 222, 179, 0.6), rgba(210, 180, 140, 0.3));
    opacity: 0;
    transition: opacity 0.25s ease;
}

.sub-item:hover {
    background: rgba(245, 222, 179, 0.08);
    border-color: rgba(245, 222, 179, 0.15);
    transform: translateX(4px);
}

.sub-item:hover::before {
    opacity: 1;
}

.sub-item-icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    margin-right: 14px;
    font-size: 0.85rem;
    color: rgba(245, 222, 179, 0.7);
}

.sub-item-text {
    flex: 1;
    font-size: 0.9rem;
    font-weight: 500;
    letter-spacing: 0.5px;
}

.sub-item-arrow {
    color: rgba(255,255,255,0.2);
    font-size: 0.8rem;
    transition: all 0.25s ease;
    transform: translateX(-5px);
    opacity: 0;
}

.sub-item:hover .sub-item-arrow {
    transform: translateX(0);
    opacity: 1;
    color: rgba(245, 222, 179, 0.6);
}

.divider-line {
    height: 1px;
    background: linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent);
    margin: 5px 30px 10px 30px;
}

div[data-testid="column"] {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.arch-link {
    display: block;
    text-align: center;
    margin-top: 30px;
    margin-bottom: 10px;
}

.arch-link a {
    color: #64748b;
    font-size: 0.75rem;
    letter-spacing: 1px;
    text-decoration: none;
    transition: all 0.3s ease;
}

.arch-link a:hover {
    color: #94a3b8;
}

@media (max-width: 768px) {
    .hero-title { font-size: 2.8rem; letter-spacing: 2px; }
    .hero-subtitle { font-size: 1rem; letter-spacing: 1px; }
    .hero-section {
        min-height: 300px;
        padding: 60px 15px 50px;
        margin: 0;
        width: 100%;
    }
    .nav-card {
        padding: 15px 20px;
        max-width: 100%;
    }
    .card-title { font-size: 1.2rem; }
    .card-desc { font-size: 0.75rem; }
    .card-icon { font-size: 0.85rem; }
    .card-arrow { right: 15px; font-size: 1rem; }
    .tools-fab {
        width: 40px;
        height: 40px;
        font-size: 1.2rem;
    }
    .expandable-wrapper { max-width: 100%; }
    .expandable-header { padding: 15px 20px; }
    .expand-icon { right: 15px; }
    .sub-items { padding: 0 12px 12px 12px; }
    .sub-item { padding: 10px 14px; }
    .sub-item-icon {
        width: 24px;
        height: 24px;
        font-size: 0.75rem;
        margin-right: 10px;
    }
    .sub-item-text { font-size: 0.82rem; }
    .divider-line { margin: 5px 20px 8px 20px; }
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

# --- PULL-TO-REFRESH (MOBILE) ---
# Inject custom JS to detect pull-down gesture and reload page
# --- PULL-TO-REFRESH (MOBILE) ---
# Inject custom JS to detect pull-down gesture and reload page
# components.html("""
# <script>
# document.addEventListener('DOMContentLoaded', function() {
#     let touchStartY = 0;
#     let touchEndY = 0;
#     const threshold = 150; // Minimum distance to trigger reload
#     const indicator = document.createElement('div');
#     indicator.style.position = 'fixed';
#     indicator.style.top = '-50px';
#     indicator.style.left = '50%';
#     indicator.style.transform = 'translateX(-50%)';
#     indicator.style.zIndex = '9999';
#     indicator.style.width = '30px';
#     indicator.style.height = '30px';
#     indicator.style.borderRadius = '50%';
#     indicator.style.border = '3px solid rgba(255,255,255,0.3)';
#     indicator.style.borderTopColor = '#ffffff';
#     indicator.style.animation = 'spin 1s linear infinite';
#     indicator.style.display = 'none';
#     indicator.id = 'pull-refresh-indicator';
#     
#     // Add spinner css
#     const style = document.createElement('style');
#     style.innerHTML = `
#         @keyframes spin { to { transform: translateX(-50%) rotate(360deg); } }
#     `;
#     document.head.appendChild(style);
#     document.body.appendChild(indicator);
#
#     window.addEventListener('touchstart', e => {
#         if (window.scrollY === 0) {
#             touchStartY = e.changedTouches[0].screenY;
#         }
#     }, {passive: true});
#
#     window.addEventListener('touchmove', e => {
#         if (window.scrollY === 0) {
#             const currentY = e.changedTouches[0].screenY;
#             const distance = currentY - touchStartY;
#             
#             if (distance > 0) {
#                 indicator.style.display = 'block';
#                 indicator.style.top = Math.min(distance / 2, 60) + 'px'; // Limit visual pull
#             }
#         }
#     }, {passive: true});
#
#     window.addEventListener('touchend', e => {
#         if (window.scrollY === 0) {
#             touchEndY = e.changedTouches[0].screenY;
#             const distance = touchEndY - touchStartY;
#             
#             if (distance > threshold) {
#                 // Trigger reload
#                 window.parent.location.reload(); 
#             } else {
#                 // Reset indicator
#                 indicator.style.top = '-50px';
#                 setTimeout(() => { indicator.style.display = 'none'; }, 300);
#             }
#         }
#     }, {passive: true});
# });
# </script>
# """, height=0)

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

@media (max-width: 768px) {
    .metrics-container { margin-top: -60px; }
    .metrics-box {
        flex-direction: column;
        gap: 15px;
        padding: 25px 40px; /* Increased horizontal padding (spaces before/after info) */
        width: 100%; /* Force wider card */
        max-width: 500px; /* Limit max width */
    }
    .metric-divider {
        width: 60%;
        height: 1px;
    }
    .metric-item-value {
        font-size: 1.3rem;
        white-space: nowrap;
    }
    .metric-item-change {
        font-size: 0.85rem;
    }
    .metric-item-label {
        font-size: 0.8rem;
    }
}
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
# --- NAVIGATION CARDS ---
st.markdown('''
<div style="display: flex; flex-direction: column; align-items: center; gap: 30px; padding: 0 20px;">

<!-- Patrimônio Expandable Card -->
<div class="expandable-wrapper">
    <input type="checkbox" id="patrimonio-toggle" class="expand-toggle">
    <div class="expandable-card">
        <label for="patrimonio-toggle" class="expandable-header">
            <div class="card-title"><i class="card-icon">◈</i> Patrimônio</div>
            <div class="card-desc">Dashboard de alocação e carteira</div>
            <span class="expand-icon">▼</span>
        </label>
        <div class="expandable-content">
            <div class="divider-line"></div>
            <div class="sub-items">
                <a href="Investimentos" target="_self" class="sub-item">
                    <span class="sub-item-icon">◇</span>
                    <span class="sub-item-text">Composição</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos" target="_self" class="sub-item">
                    <span class="sub-item-icon">▤</span>
                    <span class="sub-item-text">Renda Variável</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos" target="_self" class="sub-item">
                    <span class="sub-item-icon">▢</span>
                    <span class="sub-item-text">Renda Fixa</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos" target="_self" class="sub-item">
                    <span class="sub-item-icon">◐</span>
                    <span class="sub-item-text">Proventos</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos" target="_self" class="sub-item">
                    <span class="sub-item-icon">◎</span>
                    <span class="sub-item-text">Cripto</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos" target="_self" class="sub-item">
                    <span class="sub-item-icon">⬡</span>
                    <span class="sub-item-text">Câmbio</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos" target="_self" class="sub-item">
                    <span class="sub-item-icon">△</span>
                    <span class="sub-item-text">Imposto</span>
                    <span class="sub-item-arrow">→</span>
                </a>
            </div>
        </div>
    </div>
</div>

<a href="Finanças" target="_self" class="nav-card card-financas">
    <div class="card-title"><i class="card-icon">◇</i> Finanças</div>
    <div class="card-desc">Controle financeiro pessoal</div>
    <span class="card-arrow">→</span>
</a>
<a href="Performance" target="_self" class="nav-card card-performance">
    <div class="card-title"><i class="card-icon">△</i> Performance</div>
    <div class="card-desc">Rentabilidade TWR e análise GIPS</div>
    <span class="card-arrow">→</span>
</a>
<a href="Historico_Patrimonial" target="_self" class="nav-card card-legado">
    <div class="card-title"><i class="card-icon">◎</i> Legado</div>
    <div class="card-desc">Evolução patrimonial histórica</div>
    <span class="card-arrow">→</span>
</a>
<a href="Editor" target="_self" class="nav-card card-editor">
    <div class="card-title"><i class="card-icon">▢</i> Editor</div>
    <div class="card-desc">Edição de registros e transações</div>
    <span class="card-arrow">→</span>
</a>
</div>
''', unsafe_allow_html=True)

# --- ARCHITECTURE LINK ---
st.markdown('''
<div class="arch-link">
    <a href="Arquitetura" target="_self">Ver Arquitetura do Sistema</a>
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

import streamlit as st
import streamlit.components.v1 as components
from core.auth import require_auth

# --- AUTH ---
require_auth()

# --- CONFIG ---
st.set_page_config(
    page_title="System Architecture",
    page_icon="🧬",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- CSS ---
st.markdown("""
<style>
    #MainMenu, footer, header {visibility: hidden;}
    section[data-testid="stSidebar"] {display: none;}
    .stApp { background: #050508; }
</style>
""", unsafe_allow_html=True)

# --- MOBILE-FIRST ARCHITECTURE PAGE ---
arch_html = """
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');

    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        -webkit-tap-highlight-color: transparent;
    }

    body {
        font-family: 'Share Tech Mono', monospace;
        background: linear-gradient(180deg, #050508 0%, #0a0a12 100%);
        color: #e0e0e0;
        min-height: 100vh;
        padding: 15px;
        padding-bottom: 40px;
    }

    /* HEADER */
    .header {
        text-align: center;
        padding: 20px 10px;
        margin-bottom: 25px;
    }

    .back-btn {
        position: absolute;
        top: 15px;
        left: 15px;
        background: rgba(255, 0, 100, 0.15);
        border: 1px solid rgba(255, 0, 100, 0.4);
        color: #ff0064;
        padding: 10px 16px;
        border-radius: 8px;
        font-family: 'Orbitron', sans-serif;
        font-size: 0.8rem;
        cursor: pointer;
        transition: all 0.3s;
    }

    .back-btn:active {
        transform: scale(0.95);
        background: rgba(255, 0, 100, 0.3);
    }

    .title {
        font-family: 'Orbitron', sans-serif;
        font-size: 1.6rem;
        font-weight: 900;
        color: #00ff41;
        text-shadow: 0 0 30px rgba(0, 255, 65, 0.5);
        margin-bottom: 8px;
        letter-spacing: 2px;
    }

    .subtitle {
        color: #666;
        font-size: 0.85rem;
    }

    /* FLOW INDICATOR */
    .flow-container {
        display: flex;
        flex-direction: column;
        gap: 0;
        max-width: 400px;
        margin: 0 auto;
    }

    /* CONNECTION LINE */
    .connector {
        display: flex;
        justify-content: center;
        padding: 5px 0;
    }

    .connector-line {
        width: 3px;
        height: 35px;
        position: relative;
        overflow: hidden;
    }

    .connector-line::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(180deg, var(--from-color) 0%, var(--to-color) 100%);
        opacity: 0.3;
    }

    .connector-line::after {
        content: '';
        position: absolute;
        top: -100%;
        left: 0;
        width: 100%;
        height: 50%;
        background: linear-gradient(180deg, transparent, var(--to-color), transparent);
        animation: flowDown 1.5s linear infinite;
    }

    @keyframes flowDown {
        0% { top: -50%; }
        100% { top: 100%; }
    }

    /* NODE CARD */
    .node-card {
        background: rgba(10, 15, 20, 0.9);
        border: 1px solid var(--color);
        border-left: 4px solid var(--color);
        border-radius: 12px;
        padding: 18px;
        position: relative;
        overflow: hidden;
        transition: all 0.3s ease;
        cursor: pointer;
    }

    .node-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 100%;
        background: linear-gradient(135deg, var(--color-alpha) 0%, transparent 50%);
        opacity: 0.1;
    }

    .node-card:active {
        transform: scale(0.98);
        border-color: #fff;
    }

    .node-card.expanded {
        border-color: #fff;
        background: rgba(15, 20, 30, 0.95);
    }

    .node-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
    }

    .node-icon {
        font-size: 2rem;
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 10px;
        border: 1px solid var(--color);
    }

    .node-title-wrap {
        flex: 1;
    }

    .node-title {
        font-family: 'Orbitron', sans-serif;
        font-size: 1rem;
        font-weight: 700;
        color: var(--color);
        text-shadow: 0 0 10px var(--color-alpha);
        margin-bottom: 3px;
    }

    .node-subtitle {
        font-size: 0.75rem;
        color: #666;
    }

    .expand-icon {
        color: #444;
        font-size: 1.2rem;
        transition: transform 0.3s;
    }

    .node-card.expanded .expand-icon {
        transform: rotate(180deg);
        color: var(--color);
    }

    /* EXPANDED CONTENT */
    .node-content {
        max-height: 0;
        overflow: hidden;
        transition: max-height 0.4s ease, padding 0.4s ease;
        padding-top: 0;
    }

    .node-card.expanded .node-content {
        max-height: 300px;
        padding-top: 15px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        margin-top: 12px;
    }

    .node-desc {
        font-size: 0.9rem;
        color: #bbb;
        line-height: 1.6;
        margin-bottom: 12px;
    }

    .tech-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .tech-tag {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.15);
        padding: 5px 10px;
        border-radius: 6px;
        font-size: 0.75rem;
        color: #888;
    }

    /* FOOTER */
    .footer {
        text-align: center;
        padding: 30px 20px;
        color: #444;
        font-size: 0.75rem;
    }

    .footer-line {
        width: 50px;
        height: 2px;
        background: linear-gradient(90deg, transparent, #00ff41, transparent);
        margin: 15px auto;
    }

    /* STATUS INDICATORS */
    .status-bar {
        display: flex;
        justify-content: center;
        gap: 20px;
        margin-top: 25px;
        padding: 15px;
        background: rgba(0, 10, 5, 0.5);
        border-radius: 10px;
        border: 1px solid rgba(0, 255, 65, 0.15);
    }

    .status-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.7rem;
        color: #666;
    }

    .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        animation: pulse 2s ease-in-out infinite;
    }

    .status-dot.green { background: #00ff41; }
    .status-dot.blue { background: #00efff; }
    .status-dot.yellow { background: #ffcc00; }

    @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(0.8); }
    }

    /* SCAN LINE */
    .scan-line {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: linear-gradient(90deg, transparent, #00ff41, transparent);
        animation: scan 4s linear infinite;
        pointer-events: none;
        z-index: 1000;
        opacity: 0.5;
    }

    @keyframes scan {
        0% { top: 0; }
        100% { top: 100%; }
    }
</style>
</head>
<body>
    <div class="scan-line"></div>

    <!-- HEADER -->
    <div class="header">
        <div class="title">SYSTEM ARCHITECTURE</div>
        <div class="subtitle">BARROOTS Infrastructure Overview</div>
    </div>

    <!-- FLOW -->
    <div class="flow-container">

        <!-- USER -->
        <div class="node-card" style="--color: #00ff41; --color-alpha: rgba(0,255,65,0.3);" onclick="toggleCard(this)">
            <div class="node-header">
                <div class="node-icon">👤</div>
                <div class="node-title-wrap">
                    <div class="node-title">USER</div>
                    <div class="node-subtitle">Authenticated Access Point</div>
                </div>
                <span class="expand-icon">▼</span>
            </div>
            <div class="node-content">
                <div class="node-desc">
                    Ponto de entrada seguro via autenticação Streamlit.
                    Todas as requisições são criptografadas via HTTPS.
                    Suporte a desktop, tablet e mobile.
                </div>
                <div class="tech-tags">
                    <span class="tech-tag">Browser</span>
                    <span class="tech-tag">Mobile</span>
                    <span class="tech-tag">HTTPS</span>
                    <span class="tech-tag">Auth</span>
                </div>
            </div>
        </div>

        <!-- CONNECTOR -->
        <div class="connector">
            <div class="connector-line" style="--from-color: #00ff41; --to-color: #00efff;"></div>
        </div>

        <!-- INTERFACE -->
        <div class="node-card" style="--color: #00efff; --color-alpha: rgba(0,239,255,0.3);" onclick="toggleCard(this)">
            <div class="node-header">
                <div class="node-icon">💻</div>
                <div class="node-title-wrap">
                    <div class="node-title">INTERFACE</div>
                    <div class="node-subtitle">Streamlit Cloud UI</div>
                </div>
                <span class="expand-icon">▼</span>
            </div>
            <div class="node-content">
                <div class="node-desc">
                    Frontend reativo renderizado server-side.
                    Gerencia interações do usuário e estado da aplicação.
                    Visualizações interativas com Plotly e PyDeck.
                </div>
                <div class="tech-tags">
                    <span class="tech-tag">Streamlit</span>
                    <span class="tech-tag">HTML5</span>
                    <span class="tech-tag">CSS3</span>
                    <span class="tech-tag">Plotly</span>
                    <span class="tech-tag">PyDeck</span>
                </div>
            </div>
        </div>

        <!-- CONNECTOR -->
        <div class="connector">
            <div class="connector-line" style="--from-color: #00efff; --to-color: #ff00de;"></div>
        </div>

        <!-- ENGINE -->
        <div class="node-card" style="--color: #ff00de; --color-alpha: rgba(255,0,222,0.3);" onclick="toggleCard(this)">
            <div class="node-header">
                <div class="node-icon">🧠</div>
                <div class="node-title-wrap">
                    <div class="node-title">ENGINE</div>
                    <div class="node-subtitle">Python Core Processing</div>
                </div>
                <span class="expand-icon">▼</span>
            </div>
            <div class="node-content">
                <div class="node-desc">
                    Motor de cálculo vetorial de alta performance.
                    Processa TWR (Time-Weighted Return), MTM (Mark-to-Market)
                    e alocação de portfólio em tempo real.
                </div>
                <div class="tech-tags">
                    <span class="tech-tag">Python 3.11</span>
                    <span class="tech-tag">Pandas</span>
                    <span class="tech-tag">NumPy</span>
                    <span class="tech-tag">Cache</span>
                    <span class="tech-tag">TWR/GIPS</span>
                </div>
            </div>
        </div>

        <!-- CONNECTOR SPLIT -->
        <div class="connector">
            <div class="connector-line" style="--from-color: #ff00de; --to-color: #10b981;"></div>
        </div>

        <!-- DATA LAKE -->
        <div class="node-card" style="--color: #10b981; --color-alpha: rgba(16,185,129,0.3);" onclick="toggleCard(this)">
            <div class="node-header">
                <div class="node-icon">🗄️</div>
                <div class="node-title-wrap">
                    <div class="node-title">DATA LAKE</div>
                    <div class="node-subtitle">Google Sheets Database</div>
                </div>
                <span class="expand-icon">▼</span>
            </div>
            <div class="node-content">
                <div class="node-desc">
                    Camada de persistência cloud-native via Google Sheets API.
                    Leitura e escrita com baixa latência.
                    Autenticação via Service Account.
                </div>
                <div class="tech-tags">
                    <span class="tech-tag">GCP API</span>
                    <span class="tech-tag">JSON Auth</span>
                    <span class="tech-tag">Service Account</span>
                    <span class="tech-tag">GRID API</span>
                </div>
            </div>
        </div>

        <!-- CONNECTOR -->
        <div class="connector">
            <div class="connector-line" style="--from-color: #10b981; --to-color: #ffcc00;"></div>
        </div>

        <!-- MARKET -->
        <div class="node-card" style="--color: #ffcc00; --color-alpha: rgba(255,204,0,0.3);" onclick="toggleCard(this)">
            <div class="node-header">
                <div class="node-icon">📈</div>
                <div class="node-title-wrap">
                    <div class="node-title">MARKET DATA</div>
                    <div class="node-subtitle">Real-time Price Feeds</div>
                </div>
                <span class="expand-icon">▼</span>
            </div>
            <div class="node-content">
                <div class="node-desc">
                    Integração de dados de mercado em tempo real.
                    Cotações de ativos, taxas de câmbio e índices.
                    Cache inteligente para otimização de requests.
                </div>
                <div class="tech-tags">
                    <span class="tech-tag">Yahoo Finance</span>
                    <span class="tech-tag">BCB API</span>
                    <span class="tech-tag">REST</span>
                    <span class="tech-tag">yfinance</span>
                </div>
            </div>
        </div>

        <!-- STATUS BAR -->
        <div class="status-bar">
            <div class="status-item">
                <div class="status-dot green"></div>
                <span>System Online</span>
            </div>
            <div class="status-item">
                <div class="status-dot blue"></div>
                <span>API Connected</span>
            </div>
            <div class="status-item">
                <div class="status-dot yellow"></div>
                <span>Market Open</span>
            </div>
        </div>

    </div>

    <!-- FOOTER -->
    <div class="footer">
        <div class="footer-line"></div>
        BARROOTS v145.64<br>
        Wealth Management System
    </div>

    <script>
        function toggleCard(card) {
            // Close other cards
            document.querySelectorAll('.node-card').forEach(c => {
                if (c !== card) c.classList.remove('expanded');
            });
            // Toggle this card
            card.classList.toggle('expanded');

            // Scroll into view if expanded
            if (card.classList.contains('expanded')) {
                setTimeout(() => {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        }
    </script>
</body>
</html>
"""

# Back button (Streamlit native for reliability)
col1, col2 = st.columns([1, 5])
with col1:
    if st.button("◀ VOLTAR", use_container_width=True):
        st.switch_page("Home.py")

# Render mobile-first architecture
components.html(arch_html, height=950, scrolling=True)

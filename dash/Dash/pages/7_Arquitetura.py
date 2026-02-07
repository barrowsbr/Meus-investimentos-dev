import streamlit as st
import streamlit.components.v1 as components
from core.auth import require_auth

# --- AUTH ---
require_auth()

# --- CONFIG ---
st.set_page_config(
    page_title="Arquitetura do Sistema",
    page_icon="🧬",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- CSS ---
st.markdown("""
<style>
    #MainMenu, footer, header {visibility: hidden;}
    section[data-testid="stSidebar"] {display: none;}
    .stApp {
        background: #0f172a; /* Deep Navy */
    }
</style>
""", unsafe_allow_html=True)

# --- ARCHITECTURE DIAGRAM ---
arch_html = """
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
    :root {
        --bg-color: #0f172a;
        --card-bg: rgba(30, 41, 59, 0.7);
        --card-border: rgba(255, 255, 255, 0.08);
        --accent-primary: #2dd4bf; /* Turquoise */
        --accent-secondary: #fb7185; /* Coral */
        --accent-tertiary: #818cf8; /* Indigo */
        --text-primary: #f8fafc;
        --text-secondary: #94a3b8;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

    body {
        background-color: transparent;
        font-family: 'Outfit', sans-serif;
        color: var(--text-primary);
        padding: 20px;
        height: auto;
        min-height: 100vh;
        overflow-y: auto;
        overflow-x: hidden;
    }

    /* CONTAINER */
    .timeline-container {
        max-width: 500px; /* Mobile width priority */
        margin: 0 auto;
        position: relative;
        padding-bottom: 50px;
    }

    /* VERTICAL LINE */
    .timeline-line {
        position: absolute;
        left: 24px;
        top: 40px;
        bottom: 0;
        width: 2px;
        background: linear-gradient(180deg, 
            var(--accent-primary) 0%, 
            var(--accent-secondary) 50%, 
            var(--accent-tertiary) 100%);
        opacity: 0.3;
        z-index: 0;
    }

    /* HEADER */
    .header {
        margin-left: 60px;
        margin-bottom: 40px;
        padding-top: 10px;
    }
    
    .header h1 {
        font-size: 1.8rem;
        font-weight: 800;
        line-height: 1.2;
        background: linear-gradient(135deg, #fff 0%, #cbd5e1 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }
    
    .header p {
        color: var(--text-secondary);
        font-size: 0.9rem;
        margin-top: 5px;
        font-family: 'JetBrains Mono', monospace;
    }

    /* CARDS */
    .timeline-item {
        position: relative;
        margin-bottom: 30px;
        z-index: 1;
        perspective: 1000px;
    }

    /* DOT */
    .timeline-dot {
        position: absolute;
        left: 17px;
        top: 20px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--bg-color);
        border: 2px solid var(--item-color);
        box-shadow: 0 0 10px var(--item-color-alpha);
        z-index: 2;
        transition: all 0.3s ease;
    }

    .timeline-item:hover .timeline-dot {
        background: var(--item-color);
        transform: scale(1.2);
    }

    /* CARD CONTENT */
    .card {
        margin-left: 50px;
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 16px;
        padding: 20px;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        cursor: pointer;
    }

    .card:active {
        transform: scale(0.98);
    }

    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
    }

    .card-title {
        font-size: 1.1rem;
        font-weight: 600;
        color: #fff;
    }

    .card-icon {
        font-size: 1.5rem;
    }

    .card-subtitle {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.75rem;
        color: var(--item-color);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 12px;
        display: block;
    }

    /* DETAILS (Native HTML5 Details) */
    details > summary {
        list-style: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        color: var(--text-secondary);
        font-size: 0.85rem;
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid rgba(255,255,255,0.05);
        transition: color 0.2s;
    }

    details > summary::-webkit-details-marker {
        display: none;
    }

    details > summary:hover {
        color: var(--text-primary);
    }
    
    details > summary::after {
        content: '+';
        margin-left: auto;
        font-size: 1.2rem;
        font-weight: 300;
    }

    details[open] > summary::after {
        content: '-';
    }

    .details-content {
        margin-top: 12px;
        font-size: 0.9rem;
        color: #cbd5e1;
        line-height: 1.5;
        animation: slideDown 0.3s ease-out;
    }

    @keyframes slideDown {
        from { opacity: 0; transform: translateY(-5px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .tech-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 12px;
    }

    .badge {
        font-size: 0.7rem;
        font-family: 'JetBrains Mono', monospace;
        padding: 4px 8px;
        background: rgba(255,255,255,0.05);
        border-radius: 4px;
        color: var(--text-secondary);
    }

    /* PULSE ANIMATION for active state */
    @keyframes pulse {
        0% { box-shadow: 0 0 0 0 var(--item-color-alpha); }
        70% { box-shadow: 0 0 0 10px rgba(0,0,0,0); }
        100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
    }

    .timeline-item.active .timeline-dot {
        animation: pulse 2s infinite;
    }

</style>
</head>
<body>

    <div class="timeline-container">
        <!-- HEADER -->
        <div class="timeline-line"></div>
        
        <div class="header">
            <h1>SYSTEM<br>ARCHITECTURE</h1>
            <p>barroots.v2 // pipeline</p>
        </div>

        <!-- 1. USER -->
        <div class="timeline-item active" style="--item-color: var(--accent-primary); --item-color-alpha: rgba(45, 212, 191, 0.4);">
            <div class="timeline-dot"></div>
            <div class="card">
                <div class="card-header">
                    <span class="card-title">User Access</span>
                    <span class="card-icon">👤</span>
                </div>
                <span class="card-subtitle">Secure Entry Point</span>
                
                <details>
                    <summary>View Details</summary>
                    <div class="details-content">
                        Secure HTTPS connection via desktop or mobile. 
                        Authenticated session management handles all requests.
                        <div class="tech-badges">
                            <span class="badge">HTTPS</span>
                            <span class="badge">Auth</span>
                            <span class="badge">Mobile</span>
                        </div>
                    </div>
                </details>
            </div>
        </div>

        <!-- 2. UI LAYER -->
        <div class="timeline-item" style="--item-color: var(--accent-tertiary); --item-color-alpha: rgba(129, 140, 248, 0.4);">
            <div class="timeline-dot"></div>
            <div class="card">
                <div class="card-header">
                    <span class="card-title">Interface</span>
                    <span class="card-icon">📱</span>
                </div>
                <span class="card-subtitle">Streamlit Cloud UI</span>
                
                <details>
                    <summary>View Details</summary>
                    <div class="details-content">
                        Server-side rendered reactive UI. 
                        Handles state management, navigation, and interactive Plotly/PyDeck visualizations.
                        <div class="tech-badges">
                            <span class="badge">Streamlit</span>
                            <span class="badge">Plotly</span>
                            <span class="badge">CSS3</span>
                        </div>
                    </div>
                </details>
            </div>
        </div>

        <!-- 3. ENGINE -->
        <div class="timeline-item" style="--item-color: var(--accent-secondary); --item-color-alpha: rgba(251, 113, 133, 0.4);">
            <div class="timeline-dot"></div>
            <div class="card">
                <div class="card-header">
                    <span class="card-title">Core Engine</span>
                    <span class="card-icon">⚡</span>
                </div>
                <span class="card-subtitle">Vector Processing</span>
                
                <details>
                    <summary>View Details</summary>
                    <div class="details-content">
                        High-performance Python kernel. 
                        Calculates Time-Weighted Return (TWR) and Mark-to-Market (MTM) logic in real-time.
                        <div class="tech-badges">
                            <span class="badge">Python 3.13</span>
                            <span class="badge">Pandas</span>
                            <span class="badge">NumPy</span>
                        </div>
                    </div>
                </details>
            </div>
        </div>

        <!-- 4. DATA -->
        <div class="timeline-item" style="--item-color: #fbbf24; --item-color-alpha: rgba(251, 191, 36, 0.4);">
            <div class="timeline-dot"></div>
            <div class="card">
                <div class="card-header">
                    <span class="card-title">Data Lake</span>
                    <span class="card-icon">🗄️</span>
                </div>
                <span class="card-subtitle">Persistence Layer</span>
                
                <details>
                    <summary>View Details</summary>
                    <div class="details-content">
                        Distributed storage via Google Sheets API.
                        Auto-syncs transactions, quotes, and historical series.
                        <div class="tech-badges">
                            <span class="badge">GSheets API</span>
                            <span class="badge">JSON</span>
                            <span class="badge">Service Acc</span>
                        </div>
                    </div>
                </details>
            </div>
        </div>
        
    </div>

</body>
</html>
"""

col1, col2 = st.columns([1, 10])
with col1:
    if st.button("◀ VOLTAR", use_container_width=True):
        st.switch_page("Home.py")

components.html(arch_html, height=800, scrolling=True)

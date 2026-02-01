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

# --- CSS (APP LEVEL) ---
st.markdown("""
<style>
    /* REMOVE STREAMLIT CHROME */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}
    section[data-testid="stSidebar"] {display: none;}
    
    /* APP BACKGROUND */
    .stApp {
        background-color: #050505;
        background-image: 
            radial-gradient(circle at 50% 50%, rgba(20, 20, 30, 0.5) 0%, #000 100%);
    }
    
    /* GLOBAL FONTS */
    @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap');
    
    html, body, div, p, span {
        font-family: 'Share Tech Mono', monospace;
    }
    
    /* GLITCH TITLE */
    .glitch-header {
        text-align: center;
        margin-top: 20px;
        margin-bottom: 20px;
    }
    
    /* BUTTON STYLING */
    div.stButton > button {
        background: transparent;
        border: 1px solid #333;
        color: #aaa;
        font-family: 'Orbitron';
        transition: 0.3s;
    }
    div.stButton > button:hover {
        border-color: #00ff41;
        color: #00ff41;
        box-shadow: 0 0 10px rgba(0,255,65,0.2);
    }
    
</style>
""", unsafe_allow_html=True)

# --- NAVIGATION ---
c1, c2 = st.columns([1, 10])
with c1:
    if st.button("⬅ VOLTAR", use_container_width=True):
        st.switch_page("Home.py")

# --- HTML FLOWCHART COMPONENT ---
flowchart_html = """
<!DOCTYPE html>
<html>
<head>
<style>
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@600;900&family=Rajdhani:wght@500&display=swap');
    
    body {
        margin: 0;
        background: transparent;
        color: white;
        font-family: 'Rajdhani', sans-serif;
        overflow: hidden;
        user-select: none;
    }
    
    /* CONTAINER */
    .diagram-container {
        position: relative;
        width: 100%;
        height: 800px;
        perspective: 1000px;
    }
    
    /* NODES */
    .node {
        position: absolute;
        width: 160px;
        height: 100px;
        background: rgba(10, 15, 20, 0.8);
        border: 2px solid #333;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        transition: all 0.4s ease;
        z-index: 10;
        backdrop-filter: blur(5px);
    }
    
    .node:hover {
        transform: scale(1.1) translateZ(20px);
        border-color: #fff;
        box-shadow: 0 0 20px rgba(255,255,255,0.2);
    }
    
    .node-icon { font-size: 2.5rem; margin-bottom: 5px; }
    .node-label { font-family: 'Orbitron'; font-size: 1rem; color: #888; letter-spacing: 1px; }
    
    /* SPECIFIC NODES */
    #user { top: 40%; left: 5%; border-color: #00ff41; box-shadow: 0 0 10px rgba(0,255,65,0.1); }
    #user .node-label { color: #00ff41; }
    
    #frontend { top: 40%; left: 30%; border-color: #00efff; box-shadow: 0 0 10px rgba(0,239,255,0.1); }
    #frontend .node-label { color: #00efff; }
    
    #engine { top: 40%; left: 55%; border-color: #ff00de; box-shadow: 0 0 10px rgba(255,0,222,0.1); width: 180px; height: 120px; }
    #engine .node-label { color: #ff00de; }
    
    #db { top: 15%; left: 80%; border-color: #10b981; box-shadow: 0 0 10px rgba(16,185,129,0.1); }
    #db .node-label { color: #10b981; }
    
    #market { top: 65%; left: 80%; border-color: #ffcc00; box-shadow: 0 0 10px rgba(255,204,0,0.1); }
    #market .node-label { color: #ffcc00; }
    
    /* CONNECTIONS (SVG) */
    svg {
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        pointer-events: none;
        z-index: 1;
    }
    
    .conn-line {
        fill: none;
        stroke: #333;
        stroke-width: 2;
        vector-effect: non-scaling-stroke;
    }
    
    .conn-flow {
        fill: none;
        stroke-width: 4;
        stroke-linecap: round;
        stroke-dasharray: 10, 20;
        animation: flow 1s linear infinite;
        opacity: 0.8;
    }
    
    @keyframes flow {
        to { stroke-dashoffset: -30; }
    }
    
    /* INFO PANEL */
    .info-panel {
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        width: 60%;
        min-height: 100px;
        background: rgba(0, 5, 10, 0.9);
        border: 1px solid #444;
        border-left: 5px solid #00efff;
        padding: 20px;
        font-family: 'Share Tech Mono', monospace;
        display: none;
        animation: slideUp 0.3s ease-out;
    }
    
    @keyframes slideUp {
        from { opacity: 0; transform: translate(-50%, 20px); }
        to { opacity: 1; transform: translate(-50%, 0); }
    }
    
    .info-title { color: #00efff; font-size: 1.2rem; margin-bottom: 10px; font-weight: bold; text-transform: uppercase; }
    .info-content { color: #ddd; font-size: 0.95rem; line-height: 1.5; }
    .tech-tag { display: inline-block; padding: 2px 8px; background: #222; border: 1px solid #555; border-radius: 4px; font-size: 0.8rem; margin-right: 5px; margin-top: 5px; color: #aaa; }

</style>
</head>
<body>

<div class="diagram-container">
    <svg>
        <defs>
            <linearGradient id="grad-front" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style="stop-color:#00ff41;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#00efff;stop-opacity:1" />
            </linearGradient>
             <filter id="glow">
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>
        </defs>
        
        <!-- PATHS (Calculated roughly) -->
        <!-- User 5% -> Frontend 30% -->
        <path d="M 150 350 L 400 350" class="conn-line" />
        <path d="M 150 350 L 400 350" class="conn-flow" stroke="url(#grad-front)" />
        
        <!-- Frontend 30% -> Engine 55% -->
        <path d="M 520 350 L 720 350" class="conn-line" />
        <path d="M 520 350 L 720 350" class="conn-flow" stroke="#ff00de" style="animation-direction: reverse;" />
        
        <!-- Engine 55% -> DB 80% Top -->
        <path d="M 850 320 C 900 320, 900 180, 1050 180" class="conn-line" />
        <path d="M 850 320 C 900 320, 900 180, 1050 180" class="conn-flow" stroke="#10b981" />
        
        <!-- Engine 55% -> Market 80% Bottom -->
        <path d="M 850 380 C 900 380, 900 550, 1050 550" class="conn-line" />
        <path d="M 850 380 C 900 380, 900 550, 1050 550" class="conn-flow" stroke="#ffcc00" style="animation-duration: 2s;" />
        
    </svg>

    <!-- NODES -->
    <div class="node" id="user" onclick="showInfo('user')">
        <div class="node-icon">👤</div>
        <div class="node-label">USER</div>
    </div>
    
    <div class="node" id="frontend" onclick="showInfo('frontend')">
        <div class="node-icon">💻</div>
        <div class="node-label">INTERFACE</div>
    </div>
    
    <div class="node" id="engine" onclick="showInfo('engine')">
        <div class="node-icon">🧠</div>
        <div class="node-label">ENGINE</div>
    </div>
    
    <div class="node" id="db" onclick="showInfo('db')">
        <div class="node-icon">🗄️</div>
        <div class="node-label">DATA LAKE</div>
    </div>
    
    <div class="node" id="market" onclick="showInfo('market')">
        <div class="node-icon">📈</div>
        <div class="node-label">MARKET</div>
    </div>
    
    <!-- INFO PANEL -->
    <div class="info-panel" id="panel">
        <div class="info-title" id="p-title">SYSTEM READY</div>
        <div class="info-content" id="p-desc">Hover or click on nodes to analyze infrastructure components.</div>
        <div id="p-tags"></div>
    </div>

</div>

<script>
    const data = {
        'user': {
            title: 'AUTHENTICATED USER',
            desc: 'Secure entry point via Streamlit Auth protection. Requests encrypted via HTTPS.',
            tags: ['Browser', 'Mobile', 'Desktop']
        },
        'frontend': {
            title: 'STREAMLIT CLOUD UI',
            desc: 'Reactive frontend rendering server-side. Handles user interactions and state management.',
            tags: ['Streamlit', 'HTML5', 'CSS3', 'Plotly']
        },
        'engine': {
            title: 'PYTHON CORE ENGINE',
            desc: 'High-performance vector calculation engine for TWR, MTM, and Portfolio Allocation.',
            tags: ['Python 3.11', 'Pandas', 'NumPy', 'Cache']
        },
        'db': {
            title: 'GOOGLE SHEETS DB',
            desc: 'Cloud-native persistence layer accessed via Grid API. Low-latency reads/writes.',
            tags: ['GCP API', 'JSON Auth', 'Service Account']
        },
        'market': {
            title: 'MARKET DATA FEEDS',
            desc: 'Real-time asset pricing and currency exchange rates integration.',
            tags: ['Yahoo Finance API', 'BCB API', 'REST']
        }
    };

    function showInfo(id) {
        const item = data[id];
        if(!item) return;
        
        const panel = document.getElementById('panel');
        const title = document.getElementById('p-title');
        const desc = document.getElementById('p-desc');
        const tags = document.getElementById('p-tags');
        
        panel.style.display = 'block';
        panel.style.borderLeftColor = document.getElementById(id).style.borderColor;
        
        title.innerHTML = item.title;
        desc.innerHTML = item.desc;
        
        let tagHtml = '';
        item.tags.forEach(t => tagHtml += `<span class="tech-tag">${t}</span>`);
        tags.innerHTML = tagHtml;
        
        // Color match
        const color = window.getComputedStyle(document.querySelector(`#${id} .node-label`)).color;
        title.style.color = color;
        panel.style.borderLeftColor = color;
    }
</script>

</body>
</html>
"""

components.html(flowchart_html, height=850)

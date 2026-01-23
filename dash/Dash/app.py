import streamlit as st

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

    /* Modern Glass Card - Responsive */
    .nav-card {
        background: rgba(30, 41, 59, 0.4);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 24px;
        padding: 40px 20px;
        width: 100%;
        max-width: 380px; /* Constrain width on PC */
        height: 380px;
        margin: 0 auto; /* Center in column */
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center; /* Center content vertically */
        text-align: center;
        box-shadow: 0 20px 40px -10px rgba(0,0,0,0.5);
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
        margin-bottom: 30px;
    }

    /* Button Centering & Alignment */
    div.stButton {
        display: flex;
        justify-content: center;
        margin-top: 15px;
    }

    div.stButton > button {
        background: linear-gradient(90deg, #4f46e5 0%, #4338ca 100%);
        color: white;
        border: none;
        padding: 12px 28px;
        font-weight: 600;
        border-radius: 12px;
        transition: all 0.3s ease;
        width: 100%;
        max-width: 380px; /* Match Card Max Width */
        text-transform: uppercase;
        letter-spacing: 1px;
        font-size: 0.85rem;
    }
    
    div.stButton > button:hover {
        background: linear-gradient(90deg, #4338ca 0%, #3730a3 100%);
        box-shadow: 0 10px 20px -5px rgba(79, 70, 229, 0.4);
        transform: translateY(-2px);
    }

    /* Mobile Responsive Adjustments */
    @media (max-width: 768px) {
        .hero-title {
            font-size: 2.8rem; /* Smaller title on mobile */
        }
        .nav-card {
            height: auto; /* Allow auto height on mobile if content wraps */
            padding: 30px 20px;
            max-width: 100%; /* Full width on mobile */
        }
        .card-container {
            gap: 1.5rem;
        }
        /* Fix Streamlit column padding on mobile */
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
    
</style>
""", unsafe_allow_html=True)

# --- HERO SECTION ---
st.markdown("""
<div class="hero-container">
    <div class="hero-title">BARROOTS</div>
    <div class="hero-subtitle">Sistema Integrado para Gestão Pessoal</div>
</div>
""", unsafe_allow_html=True)

# --- NAVIGATION CONTAINER ---
# Use 2 columns equal width for PC, they stack on mobile.
# Added empty outer columns to centering on ultra-wide screens, but reduced ratio to keep them close.
# Layout: [Spacer, Card1, Card2, Spacer]
# Ratios: [1, 5, 5, 1] works well for desktop centering. 
# --- NAVIGATION CONTAINER (2x2 GRID) ---
# Row 1: Investimentos | Finanças
col_r1_l, col_r1_c1, col_r1_c2, col_r1_r = st.columns([1, 6, 6, 1])

with col_r1_c1:
    st.markdown("""
    <div class="nav-card">
        <div class="icon-box">🚀</div>
        <div class="card-title">Patrimônio</div>
        <div class="card-desc">
            Dashboard de alocação.<br>
            Acompanhe carteira e ativos.
        </div>
    </div>
    """, unsafe_allow_html=True)
    if st.button("Acessar Carteira →", key="btn_inv", use_container_width=True):
        st.switch_page("pages/1_Investimentos.py")

with col_r1_c2:
    st.markdown("""
    <div class="nav-card">
        <div class="icon-box">💎</div>
        <div class="card-title">Finanças</div>
        <div class="card-desc">
            Controle financeiro pessoal.<br>
            Gerencie gastos e cartão de crédito.
        </div>
    </div>
    """, unsafe_allow_html=True)
    if st.button("Acessar Finanças →", key="btn_fin", use_container_width=True):
        st.switch_page("pages/2_Finanças.py")

st.markdown("<div style='height: 20px'></div>", unsafe_allow_html=True)

# Row 2: Performance | Ferramentas
col_r2_l, col_r2_c1, col_r2_c2, col_r2_r = st.columns([1, 6, 6, 1])

with col_r2_c1:
    st.markdown("""
    <div class="nav-card">
        <div class="icon-box">📈</div>
        <div class="card-title">Performance</div>
        <div class="card-desc">
            Análise GIPS e rentabilidade real.<br>
            Time-Weighted Return (TWR) puro.
        </div>
    </div>
    """, unsafe_allow_html=True)
    if st.button("Ver Rentabilidade →", key="btn_perf", use_container_width=True):
        st.switch_page("pages/3_Performance.py")

with col_r2_c2:
    st.markdown("""
    <div class="nav-card">
        <div class="icon-box">🛠️</div>
        <div class="card-title">Ferramentas</div>
        <div class="card-desc">
            Área de dados e scripts.<br>
            Importação e otimização de registros.
        </div>
    </div>
    """, unsafe_allow_html=True)
    if st.button("Acessar Ferramentas →", key="btn_tools", use_container_width=True):
        st.switch_page("pages/4_Ferramentas.py")

# --- FOOTER ---
st.markdown("""
<div style="text-align: center; color: #475569; padding-top: 80px; padding-bottom: 40px; font-size: 0.8rem;">
    VERSION 3.0 • SECURE ENVIRONMENT
</div>
""", unsafe_allow_html=True)

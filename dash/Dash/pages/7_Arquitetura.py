import streamlit as st
from core.auth import require_auth

# --- AUTH CHECK ---
require_auth()

import time

# --- PÁGINA CONFIG ---
st.set_page_config(
    page_title="Arquitetura Técnica",
    page_icon="🏗️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# --- CSS (BARROOTS) ---
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

    /* Hero Styles */
    .hero-container {
        text-align: center;
        padding-top: 2vh;
        padding-bottom: 4vh;
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
        letter-spacing: 0.5px;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
    }

    /* GLASS CARDS */
    .glass-card {
        background: rgba(30, 41, 59, 0.4);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 20px;
        padding: 30px;
        margin-bottom: 20px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        transition: transform 0.3s ease, border-color 0.3s ease;
        height: 100%;
    }
    
    .glass-card:hover {
        transform: translateY(-5px);
        border-color: rgba(99, 102, 241, 0.3); /* Indigo glow */
        box-shadow: 0 20px 40px -10px rgba(99, 102, 241, 0.1);
    }
    
    /* TECH BADGES */
    .tech-badge {
        display: inline-flex;
        align-items: center;
        padding: 6px 16px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 50px;
        margin-right: 8px;
        margin-bottom: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        font-size: 0.85rem;
        font-weight: 600;
        color: #cbd5e1;
        transition: all 0.2s;
    }
    
    .tech-badge:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #ffffff;
        border-color: rgba(99, 102, 241, 0.5);
    }
    
    .section-title {
        font-size: 1.5rem;
        font-weight: 700;
        color: #f8fafc;
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    /* REMOVE STREAMLIT ELEMENTS */
    #MainMenu, footer, header {visibility: hidden;}
    
</style>
""", unsafe_allow_html=True)

# --- HEADER ---
c1, c2 = st.columns([8, 1])
with c1:
    st.markdown("""
    <div class="hero-container" style="text-align: left; padding-top: 0;">
        <div class="hero-title" style="font-size: 3rem;">Arquitetura & Engenharia</div>
        <div class="hero-subtitle">Blueprint do ecossistema Barroots</div>
    </div>
    """, unsafe_allow_html=True)
with c2:
    if st.button("🏠 Home", use_container_width=True):
        st.switch_page("Home.py")

# --- MAIN FLOW ---
col_main, col_side = st.columns([2, 1])

with col_main:
    # --- FLUXO DE DADOS (MERMAID) ---
    st.markdown('<div class="glass-card">', unsafe_allow_html=True)
    st.markdown('<div class="section-title">⚡ Fluxo de Dados (End-to-End)</div>', unsafe_allow_html=True)
    
    mermaid_code = """
    graph LR
        subgraph CLIENTE [Interface do Usuário]
            User((Usuário))
            Browser[Navegador Web]
        end
        
        subgraph CLOUD [Streamlit Cloud]
            App[App Streamlit]
            Auth[Módulo de Auth]
            Cache[Cache Redis/Local]
            Engine[Motor de Cálculo]
        end
        
        subgraph GOOGLE [Google Cloud Platform]
            API[Google Sheets API]
            Sheet[(Database .xlsx)]
            Auth2[GCP Credentials]
        end
        
        subgraph EXT [Dados Externos]
            Yahoo[Yahoo Finance API]
            BCB[Banco Central API]
        end

        User -->|Acessa| Browser
        Browser -->|HTTPS Request| App
        
        App -->|Verifica Senha| Auth
        App -->|Processa Dados| Engine
        
        Engine -->|Requisita JSON| API
        Auth2 -->|Autentica| API
        API -->|Leitura/Escrita| Sheet
        
        Engine -->|Cotações| Yahoo
        Engine -->|Taxas/Moedas| BCB
        
        Engine -->|Armazena| Cache
        Cache -->|Serve Rápido| App
        
        style CLIENTE fill:#eef2ff,stroke:#6366f1,color:#000
        style CLOUD fill:#1e1b4b,stroke:#818cf8,color:#fff
        style GOOGLE fill:#064e3b,stroke:#34d399,color:#fff
        style EXT fill:#3f3f46,stroke:#a1a1aa,color:#fff
    """
    
    st.graphviz_chart(mermaid_code)
    st.markdown('</div>', unsafe_allow_html=True)

    # --- DETALHAMENTO DE STACK ---
    st.markdown('<div class="glass-card">', unsafe_allow_html=True)
    st.markdown('<div class="section-title">🛠️ Stack Tecnológico</div>', unsafe_allow_html=True)
    
    c_codes = st.columns(3)
    with c_codes[0]:
        st.markdown("**Core (Backend)**")
        st.markdown("""
        <div style="margin-top: 10px;">
            <span class="tech-badge">Python 3.11+</span>
            <span class="tech-badge">Pandas 2.0</span>
            <span class="tech-badge">NumPy</span>
            <span class="tech-badge">YahooQuery</span>
        </div>
        """, unsafe_allow_html=True)
        st.caption("Processamento vetorial de alta performance para cálculos financeiros complexos (TWR, MTM).")

    with c_codes[1]:
        st.markdown("**Frontend (UI/UX)**")
        st.markdown("""
        <div style="margin-top: 10px;">
            <span class="tech-badge">Streamlit</span>
            <span class="tech-badge">Plotly Express</span>
            <span class="tech-badge">CSS3 Custom</span>
            <span class="tech-badge">HTML5</span>
        </div>
        """, unsafe_allow_html=True)
        st.caption("Interface reativa com renderização Server-Side, permitindo interatividade fluida e gráficos dinâmicos.")

    with c_codes[2]:
        st.markdown("**Infra & Dados**")
        st.markdown("""
        <div style="margin-top: 10px;">
            <span class="tech-badge">Google Sheets API</span>
            <span class="tech-badge">Streamlit Cloud</span>
            <span class="tech-badge">JSON Auth</span>
            <span class="tech-badge">Git Versioning</span>
        </div>
        """, unsafe_allow_html=True)
        st.caption("Persistência em nuvem (Low Code) com autenticação segura via Service Accounts da GCP.")
        
    st.markdown('</div>', unsafe_allow_html=True)

with col_side:
    # --- DESTAQUES DE ARQUITETURA ---
    st.markdown('<div class="glass-card">', unsafe_allow_html=True)
    st.markdown('<div class="section-title">✨ Destaques</div>', unsafe_allow_html=True)
    
    highlights = [
        ("🔐 Segurança", "Autenticação via **Layer de Proteção** proprietária antes de qualquer carga de dados."),
        ("🚀 Performance", "Uso intensivo de **@st.cache_data** para evitar requisições repetitivas à API do Google."),
        ("💎 GIPS Compliant", "Cálculo de rentabilidade seguindo estritamente o padrão global (Fluxos externos vs Variação de Mercado)."),
        ("🌐 Multi-Currency", "Suporte nativo para **BRL, USD, EUR e CAD** com normalização automática de câmbio."),
        ("📱 Responsividade", "Layout adaptável para Desktop e Mobile (Grid System do Streamlit).")
    ]
    
    for title, desc in highlights:
        st.markdown(f"""
        <div style="margin-bottom: 20px;">
            <div style="font-weight: 700; color: #a5b4fc; font-size: 1.1rem; margin-bottom: 4px;">{title}</div>
            <div style="font-size: 0.95rem; color: #94a3b8; line-height: 1.5;">{desc}</div>
        </div>
        """, unsafe_allow_html=True)
        
    st.markdown('</div>', unsafe_allow_html=True)

# --- FOOTER ---
st.markdown("---")
st.caption("© 2026 Barroots System Architecture | Developed with ❤️ using Python & Streamlit")

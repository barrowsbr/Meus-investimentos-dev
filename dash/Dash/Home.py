import random
import time
import streamlit as st
import streamlit.components.v1 as components
import base64
from pathlib import Path
from core.auth import init_auth_state
from core.ui import render_fab
from core.agent.polymarket import fetch_polymarket_events, _CRYPTO_KW

# --- INIT SESSION STATE ---
init_auth_state()

# --- PAGE CONFIGURATION ---
st.set_page_config(
    page_title="BARROOTS",
    page_icon="🌿",
    layout="wide",
    initial_sidebar_state="collapsed"
)

@st.cache_resource
def get_intro_state():
    return {"played": False}

intro_state = get_intro_state()

# --- CACHE REFRESH LOGIC ---
if st.query_params.get("refresh") == "1":
    intro_state["played"] = False
    st.cache_data.clear()
    st.query_params.clear()
    st.rerun()

# --- LOAD LOGO FOR HERO SECTION ---
def get_logo_base64():
    """Load logo image as base64 for the main hero section."""
    try:
        logo_path = Path(__file__).parent / "assets" / "logos" / "carregamento.png"
        with open(logo_path, "rb") as f:
            return base64.b64encode(f.read()).decode()
    except:
        return None

logo_b64 = get_logo_base64()

# --- PRELOADER LOGIC (Play only once per app load) ---
if not intro_state["played"]:
    intro_state["played"] = True
    
    def get_video_base64():
        """Load video as base64 for preloader."""
        try:
            video_path = Path(__file__).parent / "assets" / "videos" / "Abertura de logo.mp4"
            with open(video_path, "rb") as f:
                return base64.b64encode(f.read()).decode()
        except:
            return None

    video_b64 = get_video_base64()
    video_html = f'<video autoplay muted playsinline id="preloader-video" class="preloader-video"><source src="data:video/mp4;base64,{video_b64}" type="video/mp4"></video>' if video_b64 else '<div class="preloader-spinner"></div>'

    st.markdown(f"""
    <style>
    /* PRELOADER - Cobre tudo durante carregamento */
    .preloader-overlay {{
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: #0b1120;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        pointer-events: none;
        animation: fadeOutPreloader 1.2s ease-in-out 7s forwards;
    }}
    .preloader-overlay::after {{
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(11, 17, 32, 0.45);
        z-index: 2;
    }}
    .preloader-video {{
        position: absolute;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        object-fit: cover;
        opacity: 0.5;
        z-index: 1;
    }}
    .preloader-spinner {{
        width: 40px;
        height: 40px;
        border: 3px solid rgba(255,255,255,0.1);
        border-top-color: #a5b4fc;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }}
    @keyframes spin {{
        to {{ transform: rotate(360deg); }}
    }}
    @keyframes fadeOutPreloader {{
        to {{ opacity: 0; visibility: hidden; }}
    }}
    </style>
    <div class="preloader-overlay" id="preloader-overlay">{video_html}</div>
    """, unsafe_allow_html=True)
else:
    # Minimal empty preloader styles if already played to avoid breaking anything
    st.markdown("""
    <style>
    .preloader-overlay, .preloader-video { display: none !important; }
    </style>
    """, unsafe_allow_html=True)

# --- META TAGS FOR MOBILE (Theme Color) ---
st.markdown("""
<meta name="theme-color" content="#0b1120" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
""", unsafe_allow_html=True)

# --- JS INJECTION TO REMOVE TOOLBAR (Aggressive) ---
components.html("""
<script>
    // Access window.parent to target Streamlit UI outside the iframe
    window.onload = function() {
        // 1. Force Theme Color (Meta Tag Injection)
        const injectMeta = (name, content) => {
            let meta = document.querySelector(`meta[name="${name}"]`);
            if (!meta) {
                meta = document.createElement('meta');
                meta.name = name;
                document.getElementsByTagName('head')[0].appendChild(meta);
            }
            meta.content = content;
        };

        injectMeta("theme-color", "#0b1120");
        injectMeta("apple-mobile-web-app-status-bar-style", "black-translucent");
        injectMeta("apple-mobile-web-app-capable", "yes");

        // 2. Remove Streamlit Toolbar – preserva o Manage App Button estilizado como FAB
        const removeToolbar = () => {
            try {
                // Esconde seletores simples (nunca o manage app button)
                const simpleHide = [
                    '[data-testid="stHeader"]',
                    '[data-testid="stAppDeployButton"]',
                    'div[class*="viewerBadge"]',
                ];
                const docs = [document];
                try { docs.push(window.parent.document); } catch(e){}

                docs.forEach(doc => {
                    simpleHide.forEach(selector => {
                        doc.querySelectorAll(selector).forEach(el => {
                            el.style.display = 'none';
                            el.style.visibility = 'hidden';
                        });
                    });
                    const header = doc.querySelector('header');
                    if (header) header.style.display = 'none';

                    // Limpeza cirúrgica do toolbar: esconde tudo EXCETO o manage app button
                    const toolbar = doc.querySelector('[data-testid="stToolbar"]');
                    if (toolbar) {
                        toolbar.style.background = 'transparent';
                        toolbar.style.boxShadow = 'none';
                        toolbar.style.border = 'none';
                        Array.from(toolbar.children).forEach(child => {
                            const isManageApp =
                                child.getAttribute('data-testid') === 'stManageAppButton' ||
                                !!child.querySelector('[data-testid="stManageAppButton"]');
                            if (!isManageApp) child.style.display = 'none';
                        });
                    }

                    // Injeta CSS de FAB no documento pai (uma única vez)
                    if (!doc.getElementById('fab-manage-style')) {
                        const s = doc.createElement('style');
                        s.id = 'fab-manage-style';
                        s.textContent = `
                            [data-testid="stManageAppButton"],
                            [data-testid="stManageAppButton"] > button,
                            [data-testid="stManageAppButton"] > a {
                                width: 42px !important;
                                height: 42px !important;
                                min-width: 42px !important;
                                min-height: 42px !important;
                                border-radius: 50% !important;
                                background: rgba(30,41,59,0.8) !important;
                                backdrop-filter: blur(8px) !important;
                                -webkit-backdrop-filter: blur(8px) !important;
                                border: 1px solid rgba(255,255,255,0.1) !important;
                                box-shadow: 0 4px 15px rgba(0,0,0,0.3) !important;
                                color: rgba(0,0,0,0) !important;
                                padding: 0 !important;
                                display: flex !important;
                                align-items: center !important;
                                justify-content: center !important;
                                cursor: pointer !important;
                                overflow: hidden !important;
                                transition: all 0.3s cubic-bezier(0.4,0,0.2,1) !important;
                                font-size: 0 !important;
                                line-height: 42px !important;
                            }
                            [data-testid="stManageAppButton"] svg,
                            [data-testid="stManageAppButton"] > button svg,
                            [data-testid="stManageAppButton"] > a svg {
                                width: 18px !important;
                                height: 18px !important;
                                fill: white !important;
                                color: white !important;
                                display: block !important;
                                flex-shrink: 0 !important;
                            }
                            [data-testid="stManageAppButton"] > button:hover,
                            [data-testid="stManageAppButton"] > a:hover {
                                background: rgba(99,102,241,0.3) !important;
                                border-color: rgba(99,102,241,0.5) !important;
                                transform: scale(1.1) translateY(-2px) !important;
                                box-shadow: 0 8px 20px rgba(99,102,241,0.3) !important;
                            }
                            @media (max-width: 768px) {
                                [data-testid="stManageAppButton"],
                                [data-testid="stManageAppButton"] > button,
                                [data-testid="stManageAppButton"] > a {
                                    width: 36px !important;
                                    height: 36px !important;
                                    min-width: 36px !important;
                                    min-height: 36px !important;
                                }
                            }
                        `;
                        try { doc.head.appendChild(s); } catch(e) {}
                    }
                });
            } catch (e) {
                console.log("Toolbar removal error:", e);
            }
        };

        // 3. Easter Egg: 5 Clicks on Logo to Unlock Protocol
        const setupEasterEgg = () => {
             try {
                const logo = window.parent.document.querySelector('.hero-logo');
                if (logo && !logo.dataset.eggAttached) {
                    logo.dataset.eggAttached = "true"; 
                    let clicks = 0;
                    let timer;
                    
                    logo.style.cursor = "pointer";
                    logo.addEventListener('click', (e) => {
                        clicks++;
                        
                        // Visual Feedback (Subtle shake)
                        logo.style.transform = `scale(1.1) rotate(${Math.random() * 10 - 5}deg)`;
                        setTimeout(() => logo.style.transform = "scale(1)", 200);

                        clearTimeout(timer);
                        timer = setTimeout(() => clicks = 0, 2000); // Reset after 2s
                        
                        if (clicks === 5) {
                            // Trigger Navigation
                            window.parent.location.href = 'Easter_Eggs';
                            clicks = 0;
                        }
                    });
                }
             } catch (e) {
                console.log("Easter egg error:", e);
             }
        };

        // Run repeatedly to catch late rendering
        setInterval(removeToolbar, 500);
        setInterval(setupEasterEgg, 1000);
        
        removeToolbar();
        setupEasterEgg();
    };
</script>
""", height=0)

# --- CRITICAL CSS INJECTION (AVOID LAYOUT SHIFT) ---
st.markdown("""
<style>
/* HIDE DEFAULT ELEMENTS - Sempre esconder */
#MainMenu, footer, header, .stAppDeployButton, [data-testid="stToolbar"], [data-testid="stHeader"], [data-testid="stStatusWidget"], .viewerBadge_container__1QSob, div[data-testid="stDecoration"], [data-testid="stAppToolbar"], div[class*="stAppToolbar"], div[class*="viewerBadge"], [data-testid="stSidebar"], [data-testid="collapsedControl"], section[data-testid="stSidebar"], div[data-testid="stSidebarNav"] {
    display: none !important;
}

/* FORCE DARK BACKGROUND E CORES */
html, body, .stApp {
    background-color: transparent !important;
    margin: 0 !important;
    padding: 0 !important;
    color: #e2e8f0 !important;
}

/* Previne texto azul durante carregamento */
a, a:visited, a:hover, a:active {
    color: inherit !important;
    text-decoration: none !important;
}

/* RESET STREAMLIT LAYOUT - FULL BLEED */
.stApp > header {
    display: none !important;
}

[data-testid="stAppViewContainer"] {
    padding: 0 !important;
    margin: 0 !important;
}

[data-testid="stAppViewContainer"] > .main {
    padding: 0 !important;
    margin: 0 !important;
}

.block-container {
    padding: 0 !important;
    padding-top: 0 !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
    margin: 0 !important;
    margin-top: -95px !important;
    max-width: 100% !important;
    width: 100% !important;
}

/* MOBILE */
@media (max-width: 768px) {
    .block-container {
        margin-top: -100px !important;
    }
    html, body, .stApp {
        overflow-x: hidden !important;
    }
}
</style>
""", unsafe_allow_html=True)

# --- LOAD BACKGROUND IMAGE AS BASE64 ---
def get_base64_image(image_path):
    """Convert image to base64 string."""
    try:
        with open(image_path, "rb") as img_file:
            return base64.b64encode(img_file.read()).decode()
    except:
        return None

# Build background images CSS
fundo_path = Path(__file__).parent / "assets" / "backgrounds" / "fundo.png"
bg_base64 = get_base64_image(fundo_path)
global_bg_css = f"""
    background-image: url('data:image/png;base64,{bg_base64}');
    background-size: cover;
    background-position: center center;
    background-attachment: fixed;
    background-repeat: no-repeat;
""" if bg_base64 else ""

# --- CSS STYLES (static, no f-string issues) ---
CSS_PART1 = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');




html, body, [class*="css"] {
    font-family: 'Outfit', sans-serif;
    overflow-x: hidden;
    max-width: 100%;
}

.stApp {
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
    margin: 0;
    width: 100%;
    background-color: transparent;
    background-size: cover;
    background-position: center center;
    background-repeat: no-repeat;
}

"""

# --- FOOTER CSS PART REMOVED ---
FOOTER_STYLE = ""

CSS_PART2 = """
}
""" + FOOTER_STYLE + """
.hero-section::after, .footer-section::before {
    display: none !important;
}

.hero-content {
    position: relative;
    z-index: 10;
    text-align: center;
    animation: fadeIn 1s ease-out;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.hero-logo {
    width: 84px;
    height: auto;
    margin-bottom: 12px;
    filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.4));
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
}

.hero-logo:hover {
    transform: scale(1.15) rotate(5deg);
    filter: drop-shadow(0 0 15px rgba(255, 255, 255, 0.8));
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}

@keyframes divineGlow {
    0%, 100% { 
        text-shadow: 
            2px 2px 10px rgba(0, 0, 0, 0.8),
            0 0 15px rgba(255, 255, 255, 0.9),
            0 0 30px rgba(255, 255, 255, 0.4);
        transform: translateY(0);
    }
    50% { 
        text-shadow: 
            4px 4px 20px rgba(0, 0, 0, 0.9),
            0 0 20px rgba(255, 255, 255, 1),
            0 0 40px rgba(255, 255, 255, 0.7);
        transform: translateY(-8px);
    }
}

.hero-title {
    font-size: 7.2rem;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: 6px;
    margin-right: -6px; /* Compensate for letter-spacing to center perfectly */
    margin-bottom: 14px;
    animation: fadeIn 1s ease-out, divineGlow 4s ease-in-out infinite alternate;
    will-change: transform, text-shadow;
}

.hero-subtitle {
    font-size: 1.5rem;
    font-weight: 500;
    color: #ffffff;
    letter-spacing: 3px;
    margin-right: -3px; /* Compensate for letter-spacing to center perfectly */
    margin-bottom: 25px;
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
    z-index: 10;
}

.neon-footer {
    color: #ffffff !important;
    text-shadow: 
        0 0 5px rgba(255, 255, 255, 0.8),
        0 0 10px rgba(99, 102, 241, 0.6),
        0 0 20px rgba(99, 102, 241, 0.4);
    font-weight: 600;
    letter-spacing: 1px;
    transition: all 0.3s ease;
}

.neon-footer:hover {
    text-shadow: 
        0 0 10px rgba(255, 255, 255, 1),
        0 0 20px rgba(99, 102, 241, 0.8),
        0 0 40px rgba(99, 102, 241, 0.6);
    transform: scale(1.05);
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

.nav-card.card-noticias:hover {
    box-shadow: 0 20px 50px -10px rgba(6, 182, 212, 0.2);
}
.nav-card.card-noticias:hover::before {
    background: linear-gradient(135deg, rgba(6, 182, 212, 0.4) 0%, rgba(8, 145, 178, 0.2) 100%);
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
    max-height: 800px;
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
        width: 36px;
        height: 36px;
        font-size: 1rem;
    }
    .fab-container {
        bottom: 15px;
        left: 15px;
        gap: 8px;
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

# Inject Global Background and CSS
st.markdown(f"""
<style>
html, body, [data-testid="stAppViewContainer"] {{
    {global_bg_css}
    background-color: #0b1120;
}}
</style>
""", unsafe_allow_html=True)

st.markdown(CSS_PART1 + CSS_PART2, unsafe_allow_html=True)

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

# === STEP 1: RENDER ALL VISUAL STRUCTURE FIRST ===

# --- HERO SECTION ---
render_fab()
st.markdown(f"""
<div class="hero-section">
    <div class="hero-content">
        <img src="data:image/png;base64,{logo_b64}" class="hero-logo" alt="Logo" />
        <h1 class="hero-title">BARROOTS</h1>
        <p class="hero-subtitle">Sistema Integrado para Gestão Pessoal</p>
    </div>
</div>
""", unsafe_allow_html=True)

# --- METRICS CSS (render first) ---
st.markdown("""
<style>
.metrics-container {
    display: flex;
    justify-content: center;
    gap: 20px;
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
    padding: 20px 30px;
    display: flex;
    justify-content: center;
    align-items: center;
    flex: 1;
    max-width: 280px;
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
.color-positive { color: #34d399 !important; }
.color-negative { color: #f87171 !important; }
.skeleton-pulse {
    animation: skeletonPulse 1.5s ease-in-out infinite;
}
@keyframes skeletonPulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
}

@media (max-width: 768px) {
    .metrics-container { 
        margin-top: -60px; 
        gap: 12px;
        flex-direction: row;
        padding: 0 15px;
    }
    .metrics-box {
        padding: 15px 12px;
        width: 100%;
        max-width: 50%;
    }
    .metric-divider {
        display: none;
    }
    .metric-item-value {
        font-size: 1.15rem;
        white-space: nowrap;
    }
    .metric-item-change {
        font-size: 0.8rem;
    }
    .metric-item-label {
        font-size: 0.75rem;
        margin-bottom: 4px;
    }
}

/* ── Home Ticker Tape ── */
@keyframes homeTickerScroll {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
}
@keyframes homeTickerPulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.35; }
}
.home-ticker-container {
    display: flex;
    justify-content: center;
    padding: 0 20px;
    margin-top: 12px;
}
.home-ticker-wrap {
    display: flex;
    align-items: stretch;
    background: rgba(15, 23, 42, 0.55);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    overflow: hidden;
    height: 44px;
    width: 100%;
    max-width: 580px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.35);
    transition: border-color 0.4s ease, box-shadow 0.4s ease;
}
.home-ticker-wrap:hover {
    border-color: rgba(99, 102, 241, 0.35);
    box-shadow: 0 12px 40px -8px rgba(99, 102, 241, 0.2);
}
.home-tt-badge {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 13px;
    background: rgba(99, 102, 241, 0.08);
    border-right: 1px solid rgba(255, 255, 255, 0.07);
    font-size: 0.52rem;
    font-weight: 800;
    letter-spacing: 2px;
    color: #818cf8;
    white-space: nowrap;
}
.home-tt-dot {
    width: 5px;
    height: 5px;
    background: #818cf8;
    border-radius: 50%;
    flex-shrink: 0;
    animation: homeTickerPulse 1.5s ease-in-out infinite;
}
.home-ticker-viewport {
    flex: 1;
    overflow: hidden;
    display: flex;
    align-items: center;
    -webkit-mask-image: linear-gradient(to right, transparent 0%, black 3%, black 97%, transparent 100%);
    mask-image: linear-gradient(to right, transparent 0%, black 3%, black 97%, transparent 100%);
}
.home-ticker-track {
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
    will-change: transform;
}
.home-tt-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 16px;
}
.home-tt-symbol {
    font-size: 0.73rem;
    font-weight: 800;
    color: #e2e8f0;
    letter-spacing: 0.5px;
}
.home-tt-up   { font-size: 0.7rem; font-weight: 700; color: #34d399; }
.home-tt-down { font-size: 0.7rem; font-weight: 700; color: #f87171; }
.home-tt-flat { font-size: 0.7rem; font-weight: 700; color: #64748b; }
.home-tt-sep  { color: rgba(255,255,255,0.07); font-size: 0.85rem; padding: 0 1px; }
.home-ticker-skeleton {
    height: 44px;
    max-width: 580px;
    margin: 12px auto 0;
    border-radius: 16px;
    background: rgba(15, 23, 42, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.07);
    animation: skeletonPulse 1.5s ease-in-out infinite;
}

/* ── Ticker Tape Expandable ── */
.ticker-expand-wrapper {
    max-width: 580px;
    margin: 12px auto 0;
    padding: 0 20px;
}
.ticker-expand-toggle {
    display: none;
}
.ticker-expand-card {
    border-radius: 16px;
    overflow: hidden;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.ticker-expand-content {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    background: rgba(15, 23, 42, 0.55);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-top: none;
    border-radius: 0 0 16px 16px;
}
.ticker-expand-toggle:checked ~ .ticker-expand-card .ticker-expand-content {
    max-height: 500px;
}
.ticker-expand-toggle:checked ~ .ticker-expand-card .home-ticker-wrap {
    border-radius: 16px 16px 0 0;
    border-color: rgba(99, 102, 241, 0.35);
    box-shadow: 0 12px 40px -8px rgba(99, 102, 241, 0.2);
}
.ticker-expand-toggle:checked ~ .ticker-expand-card .ticker-expand-content {
    border-color: rgba(99, 102, 241, 0.15);
}
.ticker-expand-toggle:checked ~ .ticker-expand-card .ticker-expand-hint {
    transform: rotate(180deg);
}
.ticker-expand-hint {
    font-size: 0.55rem;
    color: rgba(255,255,255,0.25);
    transition: transform 0.3s ease;
    padding-right: 4px;
}
.home-ticker-wrap {
    cursor: pointer;
}

/* Performers grid (used under ticker tape) */
.perfs-grid-container { padding: 12px 15px 15px 15px; }
.perfs-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 10px;
}
.perfs-col {
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 10px;
    overflow: hidden;
}
.perfs-hdr {
    padding: 8px 12px;
    font-size: 0.57rem;
    font-weight: 800;
    letter-spacing: 2px;
    display: flex;
    align-items: center;
    gap: 5px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
}
.perfs-hdr.best  { color:#34d399; background:rgba(52,211,153,0.05); border-bottom-color:rgba(52,211,153,0.1); }
.perfs-hdr.worst { color:#f87171; background:rgba(248,113,113,0.05); border-bottom-color:rgba(248,113,113,0.1); }
.perfs-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    transition: background 0.2s ease;
}
.perfs-row:last-child { border-bottom: none; }
.perfs-row:hover { background: rgba(255,255,255,0.03); }
.perfs-ticker { font-size:0.77rem; font-weight:700; color:#e2e8f0; letter-spacing:0.3px; }
.perfs-up   { font-size:0.72rem; font-weight:700; color:#34d399; }
.perfs-down { font-size:0.72rem; font-weight:700; color:#f87171; }
/* Editor expandable — slate theme overrides */
.expandable-card.card-editor-exp:hover {
    box-shadow: 0 20px 50px -10px rgba(240,230,220,0.15) !important;
}
.expandable-card.card-editor-exp:hover::before {
    background: linear-gradient(135deg,rgba(240,230,220,0.35) 0%,rgba(200,190,180,0.2) 100%) !important;
}
.editor-toggle:checked ~ .expandable-card.card-editor-exp {
    box-shadow: 0 20px 50px -10px rgba(240,230,220,0.15) !important;
}
.editor-toggle:checked ~ .expandable-card.card-editor-exp::before {
    background: linear-gradient(135deg,rgba(240,230,220,0.35) 0%,rgba(200,190,180,0.2) 100%) !important;
}
.editor-toggle:checked ~ .expandable-card.card-editor-exp .expandable-content {
    max-height: 300px !important;
}

/* Financas expandable — gold theme overrides */
.expandable-card.card-financas-exp:hover {
    box-shadow: 0 20px 50px -10px rgba(222,184,135,0.2) !important;
}
.expandable-card.card-financas-exp:hover::before {
    background: linear-gradient(135deg,rgba(222,184,135,0.4) 0%,rgba(188,143,95,0.2) 100%) !important;
}
.financas-toggle:checked ~ .expandable-card.card-financas-exp {
    box-shadow: 0 20px 50px -10px rgba(222,184,135,0.2) !important;
}
.financas-toggle:checked ~ .expandable-card.card-financas-exp::before {
    background: linear-gradient(135deg,rgba(222,184,135,0.4) 0%,rgba(188,143,95,0.2) 100%) !important;
}
.financas-toggle:checked ~ .expandable-card.card-financas-exp .expandable-content {
    max-height: 400px !important;
}

/* Noticias expandable — cyan theme overrides */
.expandable-card.card-noticias-exp:hover {
    box-shadow: 0 20px 50px -10px rgba(6,182,212,0.2) !important;
}
.expandable-card.card-noticias-exp:hover::before {
    background: linear-gradient(135deg,rgba(6,182,212,0.4) 0%,rgba(8,145,178,0.2) 100%) !important;
}
.noticias-toggle:checked ~ .expandable-card.card-noticias-exp {
    box-shadow: 0 20px 50px -10px rgba(6,182,212,0.2) !important;
}
.noticias-toggle:checked ~ .expandable-card.card-noticias-exp::before {
    background: linear-gradient(135deg,rgba(6,182,212,0.4) 0%,rgba(8,145,178,0.2) 100%) !important;
}
.noticias-toggle:checked ~ .expandable-card.card-noticias-exp .expandable-content {
    max-height: 700px !important;
}
@media (max-width: 768px) {
    .perfs-grid { grid-template-columns: 1fr; }
    .ticker-expand-wrapper { padding: 0 15px; }
}

/* ── Unified Radar do Dia Card ── */
.radar-wrap {
    max-width: 580px;
    margin: 14px auto 0;
    padding: 0 20px;
    position: relative;
    z-index: 10;
}
.radar-card {
    background: rgba(8,13,26,0.82);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 14px 48px -10px rgba(0,0,0,0.55);
}
.radar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 11px 16px 9px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
}
.radar-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
}
.radar-live-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: #22d3ee;
    animation: pulseDot 2s ease-in-out infinite;
    flex-shrink: 0;
}
@keyframes pulseDot {
    0%,100% { opacity:1; transform:scale(1); }
    50%      { opacity:0.35; transform:scale(0.65); }
}
.radar-title {
    font-size: 0.68rem; font-weight: 800;
    letter-spacing: 1.6px; text-transform: uppercase;
    color: #64748b;
}
.radar-date {
    font-size: 0.63rem; color: #1e293b; letter-spacing: 0.3px;
}
/* News row */
.radar-news {
    display: grid;
    grid-template-columns: 1fr 1fr;
    height: 148px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
}
.radar-news-card {
    position: relative; overflow: hidden;
    display: flex; flex-direction: column; justify-content: flex-end;
    text-decoration: none !important;
    transition: all 0.3s ease;
}
.radar-news-card:first-child {
    border-right: 1px solid rgba(255,255,255,0.05);
}
.radar-news-bg {
    position: absolute; inset: 0;
    background-size: cover; background-position: center;
    filter: brightness(0.38) saturate(0.6);
    transition: transform 0.5s ease, filter 0.3s ease;
    z-index: 0;
}
.radar-news-card:hover .radar-news-bg {
    transform: scale(1.06); filter: brightness(0.5) saturate(0.75);
}
.radar-news-overlay {
    position: absolute; inset: 0; z-index: 1;
}
.radar-news-content {
    position: relative; z-index: 2;
    padding: 10px 12px;
    display: flex; flex-direction: column; gap: 4px;
}
.radar-news-badge {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 0.6rem; font-weight: 800;
    text-transform: uppercase; letter-spacing: 0.8px;
    padding: 2px 6px; border-radius: 5px; align-self: flex-start;
}
.radar-badge-up   { background:rgba(52,211,153,0.18); color:#34d399; border:1px solid rgba(52,211,153,0.28); }
.radar-badge-down { background:rgba(248,113,113,0.18); color:#f87171; border:1px solid rgba(248,113,113,0.28); }
.radar-news-headline {
    font-size: 0.76rem; font-weight: 600; color: #f1f5f9;
    line-height: 1.35;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    text-shadow: 0 1px 4px rgba(0,0,0,0.9);
}
.radar-news-source {
    font-size: 0.6rem; color: #475569; font-weight: 500;
}
/* Divider */
.radar-divider {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
}
.radar-divider-line { flex:1; height:1px; background:rgba(255,255,255,0.05); }
.radar-divider-label {
    font-size: 0.6rem; font-weight: 800; color: #38bdf8;
    letter-spacing: 1.2px; text-transform: uppercase; white-space: nowrap;
}
/* Polymarket section (clickable) */
.radar-poly {
    display: block;
    padding: 12px 16px 10px;
    text-decoration: none !important;
    color: inherit;
    transition: background 0.2s ease;
    border-bottom: 1px solid rgba(255,255,255,0.04);
}
.radar-poly:hover { background: rgba(56,189,248,0.04); }
.radar-poly-question {
    font-size: 0.87rem; font-weight: 600; color: #e2e8f0;
    line-height: 1.42; margin-bottom: 10px;
}
.radar-poly-bars {
    display: flex; flex-direction: column; gap: 5px; margin-bottom: 8px;
}
.radar-bar-row {
    position: relative;
    display: flex; align-items: center; gap: 8px;
    padding: 5px 9px; border-radius: 7px;
    background: rgba(255,255,255,0.04); overflow: hidden;
}
.radar-bar-fill {
    position: absolute; left:0; top:0; bottom:0;
    border-radius: 7px; z-index: 0;
    transition: width 0.55s cubic-bezier(0.4,0,0.2,1);
}
/* rank 0 = leader (teal), 1 = 2nd (orange), 2 = 3rd (purple) */
.radar-bar-fill.yes   { background: rgba(34,211,238,0.16); border-right: 2px solid rgba(34,211,238,0.4); }
.radar-bar-fill.no    { background: rgba(251,146,60,0.14);  border-right: 2px solid rgba(251,146,60,0.35); }
.radar-bar-fill.other { background: rgba(167,139,250,0.13); border-right: 2px solid rgba(167,139,250,0.3); }
.radar-bar-name {
    position:relative; z-index:1;
    font-size:0.75rem; color:#cbd5e1; flex:1;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.radar-bar-pct {
    position:relative; z-index:1;
    font-size:0.77rem; font-weight:700; flex-shrink:0;
}
.radar-bar-pct.yes   { color:#22d3ee; }
.radar-bar-pct.no    { color:#fb923c; }
.radar-bar-pct.other { color:#a78bfa; }
.radar-poly-meta {
    display:flex; justify-content:space-between;
    font-size:0.67rem; color:#475569;
}
.radar-poly-meta-cta { color:#38bdf8; font-weight:600; }
/* Nav row */
.radar-nav {
    display:flex; align-items:center; justify-content:space-between;
    padding: 7px 16px;
}
.radar-counter { font-size:0.63rem; color:#1e293b; }
.radar-next-btn {
    display:inline-flex; align-items:center; gap:5px;
    font-size:0.68rem; font-weight:600;
    color:#334155 !important; text-decoration:none !important;
    padding:4px 12px; border-radius:20px;
    border:1px solid rgba(255,255,255,0.05);
    background:rgba(255,255,255,0.02);
    transition: all 0.2s ease;
}
.radar-next-btn:hover {
    color:#38bdf8 !important;
    border-color:rgba(56,189,248,0.2);
    background:rgba(56,189,248,0.05);
}
@media (max-width: 768px) {
    .radar-wrap { padding: 0 12px; }
    .radar-news { height: 128px; }
    .radar-news-headline { font-size: 0.72rem; }
}
</style>
""", unsafe_allow_html=True)

# --- METRICS PLACEHOLDER (will be updated with data) ---
metrics_placeholder = st.empty()
ticker_placeholder = st.empty()

# Show skeleton/loading state initially
ticker_placeholder.markdown(
    '<div class="home-ticker-skeleton"></div>',
    unsafe_allow_html=True,
)

metrics_placeholder.markdown("""
<div class="metrics-container">
    <div class="metrics-box">
        <div class="metric-item">
            <div class="metric-item-label">Renda Variável (Hoje)</div>
            <div class="metric-item-value skeleton-pulse">R$ ---.--</div>
        </div>
    </div>
    <div class="metrics-box">
        <div class="metric-item">
            <div class="metric-item-label">Dólar (USD)</div>
            <div class="metric-item-value skeleton-pulse">R$ --.---</div>
        </div>
    </div>
</div>
""", unsafe_allow_html=True)

# --- SPACER & DYNAMIC HIGHLIGHTS PLACEHOLDER ---
st.markdown("<div style='height: 16px'></div>", unsafe_allow_html=True)
highlights_placeholder = st.empty()
poly_insight_placeholder = st.empty()   # filled after data loads
st.markdown("<div style='height: 16px'></div>", unsafe_allow_html=True)

# --- NAVIGATION CARDS (static - no data needed) ---
st.markdown('''
<div style="display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 0 20px;">

<!-- Patrimônio Expandable Card -->
<div class="expandable-wrapper">
    <input type="checkbox" id="patrimonio-toggle" class="expand-toggle">
    <div class="expandable-card">
        <label for="patrimonio-toggle" class="expandable-header">
            <div class="card-title"><i class="card-icon">◈</i> Composição</div>
            <div class="card-desc">Dashboard de alocação e carteira</div>
            <span class="expand-icon">▼</span>
        </label>
        <div class="expandable-content">
            <div class="divider-line"></div>
            <div class="sub-items">
                <a href="Investimentos?tab=0" target="_self" class="sub-item">
                    <span class="sub-item-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="14" y="14" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                        </svg>
                    </span>
                    <span class="sub-item-text">Resumo</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Performance_Advanced" target="_self" class="sub-item">
                    <span class="sub-item-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                        </svg>
                    </span>
                    <span class="sub-item-text">Performance</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos?tab=2" target="_self" class="sub-item">
                    <span class="sub-item-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 3v18h18"></path>
                            <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path>
                        </svg>
                    </span>
                    <span class="sub-item-text">Renda Variável</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos?tab=3" target="_self" class="sub-item">
                    <span class="sub-item-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                        </svg>
                    </span>
                    <span class="sub-item-text">Renda Fixa</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos?tab=4" target="_self" class="sub-item">
                    <span class="sub-item-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="1" x2="12" y2="23"></line>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                        </svg>
                    </span>
                    <span class="sub-item-text">Proventos</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos?tab=5" target="_self" class="sub-item">
                    <span class="sub-item-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                        </svg>
                    </span>
                    <span class="sub-item-text">Cripto</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos?tab=6" target="_self" class="sub-item">
                    <span class="sub-item-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="2" y1="12" x2="22" y2="12"></line>
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                        </svg>
                    </span>
                    <span class="sub-item-text">Câmbio</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos?tab=7" target="_self" class="sub-item">
                    <span class="sub-item-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                            <path d="M9 14h6"></path>
                            <path d="M9 18h6"></path>
                            <path d="M9 10h6"></path>
                        </svg>
                    </span>
                    <span class="sub-item-text">Imposto</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos?tab=8" target="_self" class="sub-item">
                    <span class="sub-item-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
                            <path d="M8 4v16"></path>
                        </svg>
                    </span>
                    <span class="sub-item-text">Legado</span>
                    <span class="sub-item-arrow">→</span>
                </a>
            </div>
        </div>
    </div>
</div>

<!-- Finanças Expandable Card -->
<div class="expandable-wrapper">
    <input type="checkbox" id="financas-toggle" class="expand-toggle financas-toggle">
    <div class="expandable-card card-financas-exp">
        <label for="financas-toggle" class="expandable-header">
            <div class="card-title"><i class="card-icon">◆</i> Finanças</div>
            <div class="card-desc">Controle financeiro pessoal</div>
            <span class="expand-icon">▼</span>
        </label>
        <div class="expandable-content">
            <div class="divider-line"></div>
            <div class="sub-items">
                <a href="Finanças?tab=0" target="_self" class="sub-item">
                    <span class="sub-item-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="2" y="6" width="20" height="12" rx="2"></rect>
                            <circle cx="12" cy="12" r="2"></circle>
                            <path d="M6 12h.01M18 12h.01"></path>
                        </svg>
                    </span>
                    <span class="sub-item-text">Mensal</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Finanças?tab=1" target="_self" class="sub-item">
                    <span class="sub-item-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l-5.46-2.18"></path>
                        </svg>
                    </span>
                    <span class="sub-item-text">Assinaturas</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Finanças?tab=2" target="_self" class="sub-item">
                    <span class="sub-item-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                            <line x1="12" y1="22.08" x2="12" y2="12"></line>
                        </svg>
                    </span>
                    <span class="sub-item-text">Parcelamentos</span>
                    <span class="sub-item-arrow">→</span>
                </a>
            </div>
        </div>
    </div>
</div>

<!-- Editor Expandable Card -->
<div class="expandable-wrapper">
    <input type="checkbox" id="editor-toggle" class="expand-toggle editor-toggle">
    <div class="expandable-card card-editor-exp">
        <label for="editor-toggle" class="expandable-header">
            <div class="card-title"><i class="card-icon">▣</i> Editor</div>
            <div class="card-desc">Edição de registros e transações</div>
            <span class="expand-icon">▼</span>
        </label>
        <div class="expandable-content">
            <div class="divider-line"></div>
            <div class="sub-items">
                <a href="Editor" target="_self" class="sub-item">
                    <span class="sub-item-icon">📋</span>
                    <span class="sub-item-text">Lançamentos</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Editor" target="_self" class="sub-item">
                    <span class="sub-item-icon">💵</span>
                    <span class="sub-item-text">Caixa Rápido</span>
                    <span class="sub-item-arrow">→</span>
                </a>
            </div>
        </div>
    </div>
</div>

<!-- Notícias Expandable Card -->
<div class="expandable-wrapper">
    <input type="checkbox" id="noticias-toggle" class="expand-toggle noticias-toggle">
    <div class="expandable-card card-noticias-exp">
        <label for="noticias-toggle" class="expandable-header">
            <div class="card-title"><i class="card-icon">◉</i> Notícias</div>
            <div class="card-desc">Mercado, portfólio e tendências do dia</div>
            <span class="expand-icon">▼</span>
        </label>
        <div class="expandable-content">
            <div class="divider-line"></div>
            <div class="sub-items">
                <a href="Noticias?tab=0" target="_self" class="sub-item">
                    <span class="sub-item-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                    </span>
                    <span class="sub-item-text">Cronológico</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Noticias?tab=1" target="_self" class="sub-item">
                    <span class="sub-item-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                            <line x1="7" y1="7" x2="7.01" y2="7"></line>
                        </svg>
                    </span>
                    <span class="sub-item-text">Por ticker</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Noticias?tab=2" target="_self" class="sub-item">
                    <span class="sub-item-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                        </svg>
                    </span>
                    <span class="sub-item-text">Reddit</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Noticias?tab=3" target="_self" class="sub-item">
                    <span class="sub-item-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="20" x2="18" y2="10"></line>
                            <line x1="12" y1="20" x2="12" y2="4"></line>
                            <line x1="6" y1="20" x2="6" y2="14"></line>
                        </svg>
                    </span>
                    <span class="sub-item-text">Polymarket</span>
                    <span class="sub-item-arrow">→</span>
                </a>
            </div>
        </div>
    </div>
</div>

</div>
''', unsafe_allow_html=True)


# --- ARCHITECTURE LINK ---
st.markdown('''
<div class="arch-link" style="position: relative; z-index: 15; margin-top: 20px;">
    <a href="Arquitetura" target="_self">Ver Arquitetura do Sistema</a>
</div>
''', unsafe_allow_html=True)

# --- FOOTER ---
st.markdown('''
<div class="neon-footer" style="text-align: center; padding-top: 40px; padding-bottom: 20px; font-size: 0.85rem; position: relative; z-index: 15;">
    Lucas Barroso Fouraux - 2026
</div>
''', unsafe_allow_html=True)

# --- SPACER BOTTOM ---
st.markdown("<div style='height: 40px'></div>", unsafe_allow_html=True)

# === STEP 2: NOW LOAD DATA (after visual structure is rendered) ===
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

# === STEP 3: UPDATE METRICS WITH ACTUAL DATA ===
rv_class = "positive" if rv_day_gain >= 0 else "negative"
rv_value = format_decimal_br(rv_day_gain, 2)
rv_pct = format_decimal_br(rv_day_pct, 2)
rv_sign = "+" if rv_day_gain >= 0 else ""

dolar_class = "positive" if dolar_change >= 0 else "negative"
dolar_sign = "+" if dolar_change >= 0 else ""

metrics_placeholder.markdown(f"""
<div class="metrics-container">
    <div class="metrics-box">
        <div class="metric-item">
            <div class="metric-item-label">Renda Variável (Hoje)</div>
            <div class="metric-item-value color-{rv_class}">
                R$ {rv_value}
                <span class="metric-item-change">({rv_sign}{rv_pct}%)</span>
            </div>
        </div>
    </div>
    <div class="metrics-box">
        <div class="metric-item">
            <div class="metric-item-label">Dólar Dia</div>
            <div class="metric-item-value">
                R$ {format_decimal_br(dolar_val, 2)}
                <span class="metric-item-change color-{dolar_class}">({dolar_sign}{format_decimal_br(dolar_var, 2)}%)</span>
            </div>
        </div>
    </div>
</div>
""", unsafe_allow_html=True)

# === STEP 4: RENDER HOME TICKER TAPE ===
perf_home = []
if not df_pos.empty:
    termos_excluir = ['TESOURO', 'CDB', 'LCI', 'LCA', 'CAIXA', 'SALDO', 'CDI', 'NTN']
    for _, row in df_pos.iterrows():
        t = row['Ticker']
        q = row.get('Qtd', 0)
        if q <= 0:
            continue
        if t == 'BRL=X' or any(x in t.upper() for x in termos_excluir):
            continue
        price = map_prices.get(t, 0.0)
        change = map_changes.get(t, 0.0)
        prev = price - change
        if prev > 0 and price > 0:
            pct = (change / prev) * 100
            perf_home.append({"ticker": t, "pct": pct})

perf_home.sort(key=lambda x: x["pct"], reverse=True)

# --- POLYMARKET INSIGHT CARD (after worst-of-day) ---
_POOL_V = 3  # bump to bust stale cache after keyword/limit changes

@st.cache_data(ttl=900, show_spinner=False)
def _get_poly_insight_pool(_bucket: int, _v: int = _POOL_V) -> list[dict]:
    """Pool de eventos do Polymarket sem crypto (cache 15 min). Retorna até 20 eventos."""
    try:
        events = fetch_polymarket_events(limit=200)
        filtered = []
        for ev in events:
            text = (ev["title"] + " " + ev["description"]).lower()
            if any(kw in text for kw in _CRYPTO_KW):
                continue
            if (ev.get("volume") or 0) < 1_000:
                continue
            if not ev.get("odds"):
                continue
            filtered.append(ev)
            if len(filtered) >= 20:
                break
        return filtered
    except Exception:
        return []

if perf_home:
    def _clean(t):
        for s in ('.SA', '-USD', '-BRL', '=X'):
            t = t.replace(s, '')
        return t

    items_html = ""
    for p in perf_home:
        t_label = _clean(p["ticker"])
        pct = p["pct"]
        if pct > 0:
            cls, arr, sign = "home-tt-up", "▲", "+"
        elif pct < 0:
            cls, arr, sign = "home-tt-down", "▼", ""
        else:
            cls, arr, sign = "home-tt-flat", "▬", ""
        pct_str = f"{sign}{pct:.2f}%"
        items_html += (
            f'<span class="home-tt-item">'
            f'<span class="home-tt-symbol">{t_label}</span>'
            f'<span class="{cls}">{arr} {pct_str}</span>'
            f'</span><span class="home-tt-sep">|</span>'
        )

    track = items_html * 2
    duration = max(18, len(perf_home) * 4)

    # Build performers grid
    best_5  = perf_home[:5]
    worst_5 = list(reversed(perf_home[-5:])) if len(perf_home) >= 5 else list(reversed(perf_home))

    def _perf_rows(items, cls):
        rows = ""
        for p in items:
            label = _clean(p["ticker"])
            pct = p["pct"]
            sign = "+" if pct >= 0 else ""
            arr  = "▲" if pct >= 0 else "▼"
            rows += (
                f'<div class="perfs-row">'
                f'<span class="perfs-ticker">{label}</span>'
                f'<span class="{cls}">{arr} {sign}{pct:.2f}%</span>'
                f'</div>'
            )
        return rows

    best_rows  = _perf_rows(best_5,  "perfs-up")
    worst_rows = _perf_rows(worst_5, "perfs-down")

    performers_html = (
        f'<div class="perfs-grid">'
        f'<div class="perfs-col">'
        f'<div class="perfs-hdr best">▲ MELHORES</div>'
        f'{best_rows}'
        f'</div>'
        f'<div class="perfs-col">'
        f'<div class="perfs-hdr worst">▼ PIORES</div>'
        f'{worst_rows}'
        f'</div>'
        f'</div>'
    )

    ticker_placeholder.markdown(
        f'<div class="ticker-expand-wrapper">'
        f'<input type="checkbox" id="ticker-expand-toggle" class="ticker-expand-toggle">'
        f'<div class="ticker-expand-card">'
        f'<label for="ticker-expand-toggle">'
        f'<div class="home-ticker-wrap" style="max-width:none;">'
        f'<div class="home-tt-badge"><span class="home-tt-dot"></span>AO VIVO</div>'
        f'<div class="home-ticker-viewport">'
        f'<div class="home-ticker-track" style="animation:homeTickerScroll {duration}s linear infinite;">{track}</div>'
        f'</div>'
        f'<span class="ticker-expand-hint">▼</span>'
        f'</div>'
        f'</label>'
        f'<div class="ticker-expand-content">'
        f'<div class="perfs-grid-container">{performers_html}</div>'
        f'</div>'
        f'</div>'
        f'</div>',
        unsafe_allow_html=True,
    )

    # --- NOVIDADE: CARDS DE DESTAQUE (Melhor / Pior) ---
    from core.agent.news_fetcher import fetch_news_combined
    
    best_t = best_5[0]["ticker"] if best_5 else None
    worst_t = worst_5[0]["ticker"] if worst_5 else None
    
    # We fetch a slightly higher maximum limit to try to hit one with an image if possible, but keep the first
    best_news = fetch_news_combined(best_t, max_items=2) if best_t else []
    worst_news = fetch_news_combined(worst_t, max_items=2) if worst_t else []
    
    # Prefererably pick the one with an image
    best_n = next((n for n in best_news if n.get("imagem")), best_news[0] if best_news else None)
    worst_n = next((n for n in worst_news if n.get("imagem")), worst_news[0] if worst_news else None)
    
    highlights_html = ""
    
    # Fetch Polymarket pool (cached 15 min) and pick market by query param
    _poly_bucket = int(time.time() // 900)
    _poly_pool   = _get_poly_insight_pool(_poly_bucket, _POOL_V)
    import html as _h
    from datetime import datetime as _dt

    def _radar_news_card(news, ticker, pct, is_best):
        """HTML for one half of the news row."""
        if not ticker:
            return ""
        label = ticker.replace(".SA","").replace("-USD","").replace("-BRL","").replace("=X","")
        sign  = "+" if pct >= 0 else ""
        badge = "radar-badge-up" if is_best else "radar-badge-down"
        arr   = "▲" if is_best else "▼"
        link     = _h.escape(news.get("link", "#"))       if news else "#"
        headline = _h.escape(news.get("titulo","")[:88])  if news else ""
        fonte    = _h.escape(news.get("fonte","")[:28])   if news else ""
        img      = news.get("imagem","")                   if news else ""
        bg_img   = f'background-image:url("{img}");'       if img else "background:rgba(15,23,42,0.6);"
        overlay  = (
            "linear-gradient(to top,rgba(4,14,8,0.96) 0%,rgba(4,14,8,0.55) 55%,rgba(4,14,8,0.15) 100%)"
            if is_best else
            "linear-gradient(to top,rgba(20,4,4,0.96) 0%,rgba(20,4,4,0.55) 55%,rgba(20,4,4,0.15) 100%)"
        )
        return (
            f'<a href="{link}" target="_blank" rel="noopener noreferrer" class="radar-news-card">'
            f'<div class="radar-news-bg" style="{bg_img}"></div>'
            f'<div class="radar-news-overlay" style="background:{overlay};"></div>'
            f'<div class="radar-news-content">'
            f'<span class="radar-news-badge {badge}">{arr} {label} {sign}{pct:.1f}%</span>'
            f'<div class="radar-news-headline">{headline}</div>'
            f'<div class="radar-news-source">{fonte}</div>'
            f'</div></a>'
        )

    def _radar_poly_section(pool):
        """Pure-CSS carousel for Polymarket events — no page reload on 'Próximo'."""
        if not pool:
            return "", ""

        n       = len(pool)
        _rank_css = ("yes", "no", "other")  # rank 0 = leader (teal), 1 = 2nd (red), 2 = 3rd (purple)

        # ── CSS rules (generated per pool size) ──────────────────────────────
        base_css = (
            ".pc-radio{display:none!important;}"
            ".pc-slide{display:none;}"
            "label.pc-next{display:none!important;cursor:pointer;}"
        )
        per_item = []
        for i in range(n):
            nxt_i = (i + 1) % n
            per_item.append(
                f"#pc{i}:checked~.pc-slides .pc-slide:nth-child({i+1}){{display:block;}}"
                f"#pc{i}:checked~.radar-nav label.n{i}{{display:inline-flex!important;}}"
                f"#pc{i}:checked~.radar-nav .pc-count::before{{content:\"{i+1} / {n}\";}}"
            )
        css = base_css + "".join(per_item)

        # ── Radio inputs ──────────────────────────────────────────────────────
        radios = "".join(
            f'<input type="radio" name="poly-car" id="pc{i}" class="pc-radio"'
            f'{" checked" if i == 0 else ""}>'
            for i in range(n)
        )

        # ── Slides ────────────────────────────────────────────────────────────
        slides = []
        for ev in pool:
            title   = _h.escape(ev["title"])
            url     = _h.escape(ev["url"])
            odds    = ev.get("odds", [])
            vol     = ev.get("volume") or 0.0
            days    = ev.get("days_left")
            vol_str = (
                f"${vol/1_000_000:.1f}M" if vol >= 1_000_000
                else f"${vol/1_000:.0f}k" if vol >= 1_000
                else f"${vol:.0f}"
            )
            if   days is None: resolve = ""
            elif days == 0:    resolve = " · resolve hoje"
            elif days <= 7:    resolve = f" · ⏳ {days}d restantes"
            else:              resolve = f" · resolve em {days}d"

            def _bar(j, o):
                rc       = _rank_css[j] if j < len(_rank_css) else "other"
                nm_sty   = ' style="font-weight:700;"' if j == 0 else ""
                return (
                    f'<div class="radar-bar-row">'
                    f'<div class="radar-bar-fill {rc}" style="width:{o["percent"]}%;"></div>'
                    f'<div class="radar-bar-name"{nm_sty}>{_h.escape(o["outcome"][:35])}</div>'
                    f'<div class="radar-bar-pct {rc}">{o["percent"]:.0f}%</div>'
                    f'</div>'
                )
            bars = "".join(_bar(j, o) for j, o in enumerate(odds[:3]))
            slides.append(
                f'<div class="pc-slide">'
                f'<a href="{url}" target="_blank" rel="noopener noreferrer" class="radar-poly">'
                f'<div class="radar-poly-question">{title}</div>'
                f'<div class="radar-poly-bars">{bars}</div>'
                f'<div class="radar-poly-meta">'
                f'<span>Vol <b style="color:#64748b;">{vol_str}</b>{_h.escape(resolve)}</span>'
                f'<span class="radar-poly-meta-cta">Ver no Polymarket →</span>'
                f'</div></a></div>'
            )
        slides_html = "".join(slides)

        # ── Nav labels (one per item, each points to next radio) ─────────────
        svg_arrow = (
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" '
            'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" '
            'stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>'
        )
        nav_labels = "".join(
            f'<label class="radar-next-btn pc-next n{i}" for="pc{(i+1)%n}">'
            f'{svg_arrow}Próximo</label>'
            for i in range(n)
        )

        html = (
            f'<div class="radar-divider">'
            f'<div class="radar-divider-line"></div>'
            f'<span class="radar-divider-label">📊 Mercado Preditivo</span>'
            f'<div class="radar-divider-line"></div>'
            f'</div>'
            f'{radios}'
            f'<div class="pc-slides">{slides_html}</div>'
            f'<div class="radar-nav">'
            f'<span class="radar-counter pc-count"></span>'
            f'{nav_labels}'
            f'</div>'
        )
        return css, html

    best_pct  = best_5[0]["pct"]  if best_5  else 0.0
    worst_pct = worst_5[0]["pct"] if worst_5 else 0.0
    today_str = _dt.now().strftime("%d %b %Y").upper()

    n1 = _radar_news_card(best_n,  best_t,  best_pct,  True)
    n2 = _radar_news_card(worst_n, worst_t, worst_pct, False)
    news_row  = f'<div class="radar-news">{n1}{n2}</div>' if (n1 or n2) else ""
    poly_css, poly_html = _radar_poly_section(_poly_pool)

    unified = (
        (f'<style>{poly_css}</style>' if poly_css else "")
        + f'<div class="radar-wrap"><div class="radar-card">'
        f'<div class="radar-header">'
        f'<div class="radar-header-left"><span class="radar-live-dot"></span>'
        f'<span class="radar-title">Radar do Dia</span></div>'
        f'<span class="radar-date">{today_str}</span>'
        f'</div>'
        f'{news_row}'
        f'{poly_html}'
        f'</div></div>'
    )
    highlights_placeholder.markdown(unified, unsafe_allow_html=True)

else:
    ticker_placeholder.empty()

# poly_insight_placeholder intentionally left empty (merged into radar card)

# --- FOOTER SECTION REMOVED FROM HERE ---

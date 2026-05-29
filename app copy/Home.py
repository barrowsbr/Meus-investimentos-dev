import random
import time
import streamlit as st
import streamlit.components.v1 as components
import base64
from pathlib import Path
from core.auth import init_auth_state
from core.ui import render_fab
from core.agent.polymarket import fetch_polymarket_events, _CRYPTO_KW, _MACRO_KW, _GEO_KW, _TECH_AI_KW

# --- INIT SESSION STATE ---
init_auth_state()

# --- PAGE CONFIGURATION ---
st.set_page_config(
    page_title="BRTS",
    page_icon=None,
    layout="wide",
    initial_sidebar_state="collapsed"
)

@st.cache_resource
def get_intro_state():
    return {"played": False}

intro_state = get_intro_state()

# --- CACHE REFRESH LOGIC ---
if st.query_params.get("refresh") == "1":
    from_page = st.query_params.get("from", "")
    st.cache_data.clear()
    st.cache_resource.clear()
    st.query_params.clear()
    # Return to the page that triggered the refresh (if not Home)
    if from_page and from_page.strip("/"):
        import streamlit.components.v1 as _cmp
        _cmp.html(
            f'<script>window.parent.location.replace("{from_page}");</script>',
            height=0,
        )
        st.stop()
    else:
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

if not intro_state["played"]:
    intro_state["played"] = True

    video_html = '<video autoplay muted playsinline id="preloader-video" class="preloader-video"><source src="app/static/videos/video1.mp4" type="video/mp4"></video>'

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
    .preloader-video {{
        position: absolute;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        object-fit: cover;
        opacity: 1;
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

        // 3. Easter Egg: Triple-click Logo to unlock Extras
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

                        // Subtle visual feedback — shake intensity grows with each click
                        const angle = clicks === 2 ? 8 : (Math.random() * 6 - 3);
                        const scale = clicks === 2 ? 1.15 : 1.08;
                        logo.style.transition = "transform 0.15s ease";
                        logo.style.transform = `scale(${scale}) rotate(${angle}deg)`;
                        setTimeout(() => { logo.style.transform = "scale(1)"; }, 200);

                        clearTimeout(timer);
                        timer = setTimeout(() => { clicks = 0; }, 1200); // 1.2s window between clicks

                        if (clicks >= 3) {
                            clicks = 0;
                            clearTimeout(timer);
                            window.parent.location.href = 'Easter_Eggs';
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
from core.data.loader import load_assets, load_fixed_income, load_fixed_income_manual, load_proventos
from core.data.market import fetch_market_data
from core.utils import format_decimal_br
from core.finance import calcular_carteira_fechada, summarize_fixed_income, summarize_fixed_income_hybrid

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
        <div class="hero-title">BRTS</div>
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

/* ── Expandable RV Metric Card ── */
.rv-expand-toggle { display: none; }
.rv-expand-card {
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 20px;
    flex: 1;
    max-width: 280px;
    box-shadow: 0 15px 50px rgba(0,0,0,0.4), inset 0 0 30px rgba(255,255,255,0.02);
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
    cursor: pointer;
}
.rv-expand-card:hover {
    transform: translateY(-5px) scale(1.02);
    background: rgba(15, 23, 42, 0.8);
    border-color: rgba(99, 102, 241, 0.4);
    box-shadow: 0 25px 50px -12px rgba(99, 102, 241, 0.25), inset 0 0 30px rgba(255,255,255,0.05);
}
.rv-expand-header {
    padding: 20px 30px;
    text-align: center;
    position: relative;
}
.rv-expand-hint {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.55rem;
    color: rgba(255,255,255,0.25);
    transition: transform 0.3s ease;
}
.rv-expand-toggle:checked ~ .rv-expand-card .rv-expand-hint {
    transform: translateY(-50%) rotate(180deg);
}
.rv-expand-content {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.rv-expand-toggle:checked ~ .rv-expand-card .rv-expand-content {
    max-height: 200px;
}
.rv-expand-toggle:checked ~ .rv-expand-card {
    border-color: rgba(99, 102, 241, 0.4);
    box-shadow: 0 25px 50px -12px rgba(99, 102, 241, 0.25), inset 0 0 30px rgba(255,255,255,0.05);
}
.rv-expand-inner {
    padding: 0 16px 14px;
    border-top: 1px solid rgba(255,255,255,0.06);
    padding-top: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
}
.rv-expand-col {
    flex: 1;
    text-align: center;
    min-width: 0;
}
.rv-expand-divider {
    width: 1px;
    height: 36px;
    background: rgba(255,255,255,0.08);
    flex-shrink: 0;
}
.patrimonio-label {
    font-size: 0.6rem;
    color: #818cf8;
    margin-bottom: 3px;
    letter-spacing: 1.2px;
    font-weight: 700;
    text-transform: uppercase;
}
.patrimonio-value {
    font-size: 1.05rem;
    font-weight: 700;
    color: #f1f5f9;
    white-space: nowrap;
}
.equity-label {
    font-size: 0.6rem;
    color: #34d399;
    margin-bottom: 3px;
    letter-spacing: 1.2px;
    font-weight: 700;
    text-transform: uppercase;
}
.equity-value {
    font-size: 1.05rem;
    font-weight: 700;
    color: #f1f5f9;
    white-space: nowrap;
}

/* ── RV grid value: allow wrap for long amounts ── */
.rv-grid-value {
    white-space: normal !important;
    word-break: break-all;
    font-size: 0.82rem !important;
    line-height: 1.2;
}
/* ── RV patrimônio items: taller padding to match FX 4-cell height ── */
.rv-pat-item {
    padding: 22px 8px !important;
}

/* ── FX Expandable Grid (Dollar Card) ── */
.fx-expand-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    background: rgba(255,255,255,0.04);
    border-top: 1px solid rgba(255,255,255,0.06);
}
.fx-grid-item {
    text-align: center;
    padding: 10px 8px;
    background: rgba(15, 23, 42, 0.6);
}
.fx-grid-label {
    font-size: 0.58rem;
    color: #64748b;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-bottom: 3px;
}
.fx-grid-value {
    font-size: 0.92rem;
    font-weight: 700;
    color: #f1f5f9;
    white-space: nowrap;
}
.fx-grid-var {
    font-size: 0.7rem;
    font-weight: 600;
    margin-top: 1px;
}
@media (max-width: 768px) {
    .metrics-container {
        margin-top: -60px;
        gap: 10px;
        flex-direction: row;
        align-items: flex-start;   /* cards independentes em altura */
        padding: 0 12px;
    }
    /* Cards: 50/50 split via flex wrappers, sem overflow */
    .metrics-box, .rv-expand-card {
        width: 100%;
        max-width: 100%;
        min-width: 0;
    }
    /* Header centralizado com padding justo */
    .rv-expand-header {
        padding: 16px 14px 14px;
        text-align: center;
    }
    .metric-divider { display: none; }
    /* Valor: permite quebra natural, % na linha de baixo */
    .metric-item-value {
        font-size: 1.15rem;
        white-space: normal;
        line-height: 1.2;
    }
    .metric-item-change {
        font-size: 0.78rem;
        display: block;
        margin-left: 0;
        margin-top: 3px;
    }
    .metric-item-label, .patrimonio-label {
        font-size: 0.7rem;
        margin-bottom: 4px;
    }
    /* Patrimônio/equity values sem nowrap, fonte um pouco menor */
    .patrimonio-value, .equity-value {
        font-size: 1.0rem;
        white-space: normal;
        word-break: break-all;
    }
    .rv-expand-hint { font-size: 0.45rem; right: 10px; }
    /* FX grid compacto */
    .fx-grid-item { padding: 9px 6px; }
    .fx-grid-label { font-size: 0.52rem; letter-spacing: 0.5px; }
    .fx-grid-value { font-size: 0.85rem; }
    .fx-grid-var   { font-size: 0.68rem; }
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
.home-tt-up    { font-size: 0.7rem; font-weight: 700; color: #34d399; }
.home-tt-down  { font-size: 0.7rem; font-weight: 700; color: #f87171; }
.home-tt-flat  { font-size: 0.7rem; font-weight: 700; color: #64748b; }
.home-tt-price { font-size: 0.66rem; font-weight: 500; color: #475569; letter-spacing: 0.2px; }
.home-tt-sep   { color: rgba(255,255,255,0.07); font-size: 0.85rem; padding: 0 1px; }
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
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    column-gap: 10px;
    padding: 7px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    transition: background 0.2s ease;
}
.perfs-row:last-child { border-bottom: none; }
.perfs-row:hover { background: rgba(255,255,255,0.03); }
.perfs-ticker { font-size:0.77rem; font-weight:700; color:#e2e8f0; letter-spacing:0.3px; }
.perfs-price  { font-size:0.68rem; font-weight:500; color:#475569; text-align:right; min-width:64px; }
.perfs-up     { font-size:0.72rem; font-weight:700; color:#34d399; text-align:right; min-width:60px; }
.perfs-down   { font-size:0.72rem; font-weight:700; color:#f87171; text-align:right; min-width:60px; }
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
    margin: 2px auto 0;
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
.radar-counter { font-size:0.63rem; color:#64748b; }
.radar-next-btn {
    display:inline-flex; align-items:center; gap:5px;
    font-size:0.68rem; font-weight:600; cursor:pointer;
    color:#94a3b8; text-decoration:none !important;
    padding:4px 12px; border-radius:20px;
    border:1px solid rgba(255,255,255,0.08);
    background:rgba(255,255,255,0.03);
    transition: all 0.18s ease;
}
.radar-next-btn:hover {
    color:#38bdf8;
    border-color:rgba(56,189,248,0.3);
    background:rgba(56,189,248,0.06);
}
/* TWR Portfolio Chart — Plotly chart container card styling */
[data-testid="stPlotlyChart"] > div {
    border-radius: 20px !important;
    overflow: hidden !important;
    box-shadow: 0 10px 40px rgba(0,0,0,0.35) !important;
    border: 1px solid rgba(52,211,153,0.12) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    margin: 4px 0 14px !important;
}
.twr-chart-skeleton {
    height: 120px;
    background: rgba(15,23,42,0.65);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(52,211,153,0.14);
    border-radius: 20px;
    box-shadow: 0 12px 44px rgba(0,0,0,0.45);
    margin: 8px 20px 4px;
    padding: 18px 20px 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.skel-lbl { width: 130px; height: 9px; background: rgba(255,255,255,0.06); border-radius: 5px; animation: skeletonPulse 1.8s ease-in-out infinite; }
.skel-num { width: 200px; height: 42px; background: rgba(52,211,153,0.08); border-radius: 8px; animation: skeletonPulse 1.8s ease-in-out infinite 0.1s; }
.skel-sub { width: 160px; height: 9px; background: rgba(255,255,255,0.04); border-radius: 5px; animation: skeletonPulse 1.8s ease-in-out infinite 0.15s; }
@keyframes skeletonPulse {
    0%, 100% { opacity: 0.4; }
    50%       { opacity: 0.8; }
}
@media (max-width: 768px) {
    .radar-wrap { padding: 0 12px; }
    .radar-news { height: 128px; }
    .radar-news-headline { font-size: 0.72rem; }
}
/* Collapse the default Streamlit gap between chart, radar, nav cards */
[data-testid="stVerticalBlock"] > div[data-testid="stVerticalBlock"] {
    gap: 4px !important;
}
/* Pull iframes flush — remove browser default iframe margins */
iframe { display: block; }
</style>
""", unsafe_allow_html=True)

# --- METRICS PLACEHOLDER (will be updated with data) ---
metrics_placeholder = st.empty()
ticker_placeholder = st.empty()
chart_placeholder = st.empty()

# Show skeleton/loading state initially
ticker_placeholder.markdown(
    '<div class="home-ticker-skeleton"></div>',
    unsafe_allow_html=True,
)
chart_placeholder.markdown(
    '<div class="twr-chart-skeleton"><div class="skel-lbl"></div><div class="skel-num"></div><div class="skel-sub"></div></div>',
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

# --- DYNAMIC HIGHLIGHTS PLACEHOLDER ---
highlights_placeholder = st.empty()
poly_nav_placeholder = st.empty()       # kept for backward compat (always empty)
poly_insight_placeholder = st.empty()   # kept for backward compat (always empty)

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
                            <path d="M3 17l6-6 4 4 8-8"></path>
                            <path d="M14 7h7v7"></path>
                        </svg>
                    </span>
                    <span class="sub-item-text">Alavancagem</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos?tab=8" target="_self" class="sub-item">
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
                <a href="Investimentos?tab=9" target="_self" class="sub-item">
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
_RF_SETORES = {'Renda Fixa USD', 'Renda Fixa'}

df_assets = load_assets()
df_pos = pd.DataFrame()
dolar_val = 5.0
dolar_var = 0.0
rv_day_gain = 0.0
rv_day_pct = 0.0
dolar_change = 0.0
total_patrimonio = 0.0
map_prices = {}
map_changes = {}

if not df_assets.empty:
    df_rv = df_assets[df_assets['ticker'].notna()]
    tickers = df_rv['ticker'].unique().tolist()
    
    if 'BRL=X' not in tickers:
        tickers.append('BRL=X')
    for _fx in ['EURBRL=X', 'CADBRL=X', 'CHFUSD=X', 'CAD=X', 'JPY=X']:
        if _fx not in tickers:
            tickers.append(_fx)

    map_prices, map_changes = fetch_market_data(tickers)

    dolar_val = map_prices.get('BRL=X', 5.0)
    dolar_change = map_changes.get('BRL=X', 0.0)
    dolar_var = (dolar_change / (dolar_val - dolar_change)) * 100 if (dolar_val - dolar_change) != 0 else 0.0

    df_pos, _ = calcular_carteira_fechada(df_assets)

    rf_usd_from_pos = 0.0

    total_mkt_val = 0.0
    if not df_pos.empty:
        for _, row in df_pos.iterrows():
            t = row['Ticker']
            q = row['Qtd']
            m = row['Moeda']

            if q > 0:
                if row.get('Setor', '') in _RF_SETORES:
                    continue
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

    # --- PATRIMÔNIO TOTAL (mesma lógica exata do Resumo em 1_Investimentos.py) ---
    # Replicar a construção de df_view + df_grafico idêntica à tab1 de Composição

    # Câmbios adicionais
    eur_val = map_prices.get('EURBRL=X', 6.0)
    cad_val = map_prices.get('CADBRL=X', 4.0)

    # 1) Construir df_view (mesma lógica de 1_Investimentos.py, seção 8)
    lista_view = []
    if not df_pos.empty:
        for _, row in df_pos.iterrows():
            t = row['Ticker']
            m = row['Moeda']
            qtd = row['Qtd']
            pm = row['PM_Origem']

            preco_atual = map_prices.get(t, 0.0)
            if preco_atual <= 0 or 'TESOURO' in t or 'CDB' in t:
                preco_atual = pm

            fator_conversao = 1.0
            if m == 'USD': fator_conversao = dolar_val
            elif m == 'EUR': fator_conversao = eur_val
            elif m == 'CAD': fator_conversao = cad_val

            valor_hoje_brl = qtd * preco_atual * fator_conversao

            if row.get('Setor', '') in _RF_SETORES:
                rf_usd_from_pos += valor_hoje_brl
                continue

            lista_view.append({
                'Ticker': t,
                'Qtd': qtd,
                'Valor Hoje (R$)': valor_hoje_brl,
            })

    df_view_home = pd.DataFrame(lista_view) if lista_view else pd.DataFrame()

    # 2) RV: filtrar ativos com Valor Hoje > 1.0 (exatamente como tab1)
    rv_patrimonio = 0.0
    if not df_view_home.empty:
        df_rv_g = df_view_home[df_view_home['Valor Hoje (R$)'] > 1.0]
        rv_patrimonio = df_rv_g['Valor Hoje (R$)'].sum()

    # 3) RF: carregar e somar ativos, converter USD→BRL (exatamente como tab1)
    rf_patrimonio = 0.0
    try:
        df_rf_raw = load_fixed_income()
        df_rf_manual = load_fixed_income_manual()
        df_proventos_bruto = load_proventos()

        if not df_rf_raw.empty:
            if df_rf_manual.empty:
                df_rf_completo = summarize_fixed_income(df_rf_raw)
            else:
                df_rf_completo = summarize_fixed_income_hybrid(df_rf_manual, df_rf_raw, df_proventos_bruto)
        else:
            df_rf_completo = pd.DataFrame()

        if not df_rf_completo.empty:
            df_rf_ativo = df_rf_completo[df_rf_completo['Status'] == 'Ativo'].copy()
            if not df_rf_ativo.empty and 'Atual' in df_rf_ativo.columns:
                df_rf_ativo['Atual'] = pd.to_numeric(df_rf_ativo['Atual'], errors='coerce').fillna(0)
                # Converte USD para BRL (mesma lógica de 1_Investimentos.py linhas 687-692)
                if 'Moeda' in df_rf_ativo.columns:
                    mask_usd = df_rf_ativo['Moeda'] == 'USD'
                    if mask_usd.any():
                        df_rf_ativo.loc[mask_usd, 'Atual'] = df_rf_ativo.loc[mask_usd, 'Atual'] * dolar_val
                rf_patrimonio = df_rf_ativo['Atual'].sum()
    except Exception:
        rf_patrimonio = 0.0

    rf_patrimonio += rf_usd_from_pos
    total_patrimonio = rv_patrimonio + rf_patrimonio

# === STEP 3: UPDATE METRICS WITH ACTUAL DATA ===
if df_assets.empty:
    st.warning(
        "⚠️ **Planilha não carregada.** Verifique:\n"
        "1. `gcp_service_account` configurado em *Settings → Secrets* no Streamlit Cloud.\n"
        "2. `SPREADSHEET_KEY = \"<id da planilha>\"` também nos Secrets "
        "(o ID está na URL: `docs.google.com/spreadsheets/d/**<ID>**/edit`).\n"
        "3. A planilha **gdados** está compartilhada com o e-mail da service account.\n"
        "4. No campo `private_key`, use **`\\\\n`** literal — não pressione Enter.\n"
        "Acesse **?refresh=1** para forçar nova tentativa após corrigir.",
        icon=None,
    )

rv_class = "positive" if rv_day_gain >= 0 else "negative"
rv_value = format_decimal_br(rv_day_gain, 2)
rv_pct = format_decimal_br(rv_day_pct, 2)
rv_sign = "+" if rv_day_gain >= 0 else ""

dolar_class = "positive" if dolar_change >= 0 else "negative"
dolar_sign = "+" if dolar_change >= 0 else ""

# Exchange rates for dollar expandable card
eur_brl_val = map_prices.get('EURBRL=X', 6.0)
eur_brl_change = map_changes.get('EURBRL=X', 0.0)
eur_brl_var = (eur_brl_change / (eur_brl_val - eur_brl_change)) * 100 if (eur_brl_val - eur_brl_change) != 0 else 0.0

usd_cad_val = map_prices.get('CAD=X', 1.35)
usd_cad_change = map_changes.get('CAD=X', 0.0)
usd_cad_var = (usd_cad_change / (usd_cad_val - usd_cad_change)) * 100 if (usd_cad_val - usd_cad_change) != 0 else 0.0

chf_usd_val = map_prices.get('CHFUSD=X', 1.10)
chf_usd_change = map_changes.get('CHFUSD=X', 0.0)
chf_usd_var = (chf_usd_change / (chf_usd_val - chf_usd_change)) * 100 if (chf_usd_val - chf_usd_change) != 0 else 0.0

usd_jpy_val = map_prices.get('JPY=X', 149.0)
usd_jpy_change = map_changes.get('JPY=X', 0.0)
usd_jpy_var = (usd_jpy_change / (usd_jpy_val - usd_jpy_change)) * 100 if (usd_jpy_val - usd_jpy_change) != 0 else 0.0

metrics_placeholder.markdown(f"""
<div class="metrics-container">
    <div style="flex:1;max-width:280px;">
        <input type="checkbox" id="rv-metric-toggle" class="rv-expand-toggle">
        <div class="rv-expand-card">
            <label for="rv-metric-toggle" class="rv-expand-header">
                <div class="metric-item">
                    <div class="metric-item-label">Renda Variável (Hoje)</div>
                    <div class="metric-item-value color-{rv_class}">
                        R$ {rv_value}
                        <span class="metric-item-change">({rv_sign}{rv_pct}%)</span>
                    </div>
                </div>
                <span class="rv-expand-hint">▼</span>
            </label>
            <div class="rv-expand-content">
                <div class="fx-expand-grid">
                    <div class="fx-grid-item rv-pat-item">
                        <div class="fx-grid-label" style="color:#818cf8;">PATRIMÔNIO</div>
                        <div class="fx-grid-value rv-grid-value">R$ {format_decimal_br(total_patrimonio, 2)}</div>
                    </div>
                    <div class="fx-grid-item rv-pat-item">
                        <div class="fx-grid-label" style="color:#34d399;">EQUITY FAM.</div>
                        <div class="fx-grid-value rv-grid-value">R$ {format_decimal_br(total_patrimonio * 2, 2)}</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div style="flex:1;max-width:280px;">
        <input type="checkbox" id="fx-metric-toggle" class="rv-expand-toggle">
        <div class="rv-expand-card">
            <label for="fx-metric-toggle" class="rv-expand-header">
                <div class="metric-item">
                    <div class="metric-item-label">Dólar Dia</div>
                    <div class="metric-item-value">
                        R$ {format_decimal_br(dolar_val, 2)}
                        <span class="metric-item-change color-{dolar_class}">({dolar_sign}{format_decimal_br(dolar_var, 2)}%)</span>
                    </div>
                </div>
                <span class="rv-expand-hint">▼</span>
            </label>
            <div class="rv-expand-content">
                <div class="fx-expand-grid">
                    <div class="fx-grid-item">
                        <div class="fx-grid-label">EUR/BRL</div>
                        <div class="fx-grid-value">R$ {format_decimal_br(eur_brl_val, 4)}</div>
                        <div class="fx-grid-var {'color-positive' if eur_brl_change >= 0 else 'color-negative'}">{'+'if eur_brl_change >= 0 else ''}{format_decimal_br(eur_brl_var, 2)}%</div>
                    </div>
                    <div class="fx-grid-item">
                        <div class="fx-grid-label">USD/JPY</div>
                        <div class="fx-grid-value">¥ {format_decimal_br(usd_jpy_val, 2)}</div>
                        <div class="fx-grid-var {'color-positive' if usd_jpy_change >= 0 else 'color-negative'}">{'+'if usd_jpy_change >= 0 else ''}{format_decimal_br(usd_jpy_var, 2)}%</div>
                    </div>
                    <div class="fx-grid-item">
                        <div class="fx-grid-label">USD/CAD</div>
                        <div class="fx-grid-value">C$ {format_decimal_br(usd_cad_val, 4)}</div>
                        <div class="fx-grid-var {'color-positive' if usd_cad_change >= 0 else 'color-negative'}">{'+'if usd_cad_change >= 0 else ''}{format_decimal_br(usd_cad_var, 2)}%</div>
                    </div>
                    <div class="fx-grid-item">
                        <div class="fx-grid-label">CHF/USD</div>
                        <div class="fx-grid-value">US$ {format_decimal_br(chf_usd_val, 4)}</div>
                        <div class="fx-grid-var {'color-positive' if chf_usd_change >= 0 else 'color-negative'}">{'+'if chf_usd_change >= 0 else ''}{format_decimal_br(chf_usd_var, 2)}%</div>
                    </div>
                </div>
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
        if row.get('Setor', '') in _RF_SETORES:
            continue
        price = map_prices.get(t, 0.0)
        change = map_changes.get(t, 0.0)
        prev = price - change
        if prev > 0 and price > 0:
            pct = (change / prev) * 100
            perf_home.append({"ticker": t, "pct": pct, "price": price})

perf_home.sort(key=lambda x: x["pct"], reverse=True)

# --- POLYMARKET INSIGHT CARD (after worst-of-day) ---
_POOL_V = 9  # bump to bust stale cache after keyword/limit changes
_HOME_ALLOW_KW = _MACRO_KW + _GEO_KW + _TECH_AI_KW

@st.cache_data(ttl=900, show_spinner=False)
def _get_poly_insight_pool(_bucket: int, _v: int = _POOL_V) -> list[dict]:
    """Pool de eventos do Polymarket: apenas Macro, Geopolítica e Tech (cache 15 min). Retorna até 50 eventos."""
    events = fetch_polymarket_events(limit=400)
    if not events:
        # Raise so cache_data does NOT store the empty result and retries next call
        raise RuntimeError("Polymarket returned no events")
    filtered = []
    for ev in events:
        try:
            title = (ev.get("title") or "")
            desc  = (ev.get("description") or "")
            text  = (title + " " + desc).lower()
            if any(kw in text for kw in _CRYPTO_KW):
                continue
            if (ev.get("volume") or 0) < 100:
                continue
            if not ev.get("odds"):
                continue
            filtered.append(ev)
            if len(filtered) >= 50:
                break
        except Exception:
            continue
    if not filtered:
        raise RuntimeError("Polymarket: no events after filtering")
    return filtered

# Fetch Polymarket pool before portfolio check — Polymarket is independent of GSheets/Yahoo
import html as _h
from datetime import datetime as _dt
_poly_bucket = int(time.time() // 900)
try:
    _poly_pool = _get_poly_insight_pool(_poly_bucket, _POOL_V)
    st.session_state["_poly_pool_stale"] = _poly_pool
except Exception:
    # Fall back to stale data from previous successful fetch in this session
    _poly_pool = st.session_state.get("_poly_pool_stale", [])


def _radar_poly_section(pool):
    """Poly carousel: returns (html, js) to embed directly inside the full-card iframe."""
    if not pool:
        offline_html = (
            '<div class="radar-divider">'
            '<div class="radar-divider-line"></div>'
            '<span class="radar-divider-label">📊 Mercado Preditivo</span>'
            '<div class="radar-divider-line"></div>'
            '</div>'
            '<div style="padding:18px 16px;display:flex;align-items:center;gap:12px;'
            'opacity:0.55;">'
            '<span style="font-size:1.2rem">🔌</span>'
            '<div>'
            '<div style="font-size:0.78rem;font-weight:600;color:#94a3b8;margin-bottom:3px">'
            'Polymarket temporariamente indisponível</div>'
            '<div style="font-size:0.68rem;color:#475569">API bloqueada neste servidor · '
            'dados voltarão automaticamente</div>'
            '</div></div>'
        )
        return offline_html, ""

    import random as _random
    pool = _random.sample(pool, min(len(pool), 12))

    n         = len(pool)
    _rank_css = ("yes", "no", "other")

    def _bar(j, o):
        rc     = _rank_css[j] if j < len(_rank_css) else "other"
        nm_sty = ' style="font-weight:700;"' if j == 0 else ""
        return (
            f'<div class="radar-bar-row">'
            f'<div class="radar-bar-fill {rc}" style="width:{o["percent"]}%;"></div>'
            f'<div class="radar-bar-name"{nm_sty}>{_h.escape(o["outcome"][:35])}</div>'
            f'<div class="radar-bar-pct {rc}">{o["percent"]:.0f}%</div>'
            f'</div>'
        )

    slides = []
    for i, ev in enumerate(pool):
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
        bars = "".join(_bar(j, o) for j, o in enumerate(odds[:3]))
        slides.append(
            f'<div id="ps{i}" style="display:{"block" if i==0 else "none"};">'
            f'<a href="{url}" target="_blank" rel="noopener noreferrer" class="radar-poly">'
            f'<div class="radar-poly-question">{title}</div>'
            f'<div class="radar-poly-bars">{bars}</div>'
            f'<div class="radar-poly-meta">'
            f'<span>Vol <b style="color:#64748b;">{vol_str}</b>{_h.escape(resolve)}</span>'
            f'<span class="radar-poly-meta-cta">Ver no Polymarket →</span>'
            f'</div></a></div>'
        )
    slides_html = "".join(slides)

    svg_next = (
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" '
        'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" '
        'stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>'
    )
    poly_html = (
        '<div class="radar-divider">'
        '<div class="radar-divider-line"></div>'
        '<span class="radar-divider-label">📊 Mercado Preditivo</span>'
        '<div class="radar-divider-line"></div>'
        f'</div>{slides_html}'
        f'<div class="radar-nav">'
        f'<span class="radar-counter" id="poly-cnt">1 / {n}</span>'
        f'<button class="radar-next-btn" onclick="polyNext()">{svg_next} Próximo</button>'
        f'</div>'
    )
    poly_js = (
        f'var pI=0,pN={n};'
        'function polyNext(){'
        'document.getElementById("ps"+pI).style.display="none";'
        'pI=(pI+1)%pN;'
        'document.getElementById("ps"+pI).style.display="block";'
        'document.getElementById("poly-cnt").textContent=(pI+1)+" / "+pN;'
        '}'
    )
    return poly_html, poly_js

if perf_home:
    def _clean(t):
        for s in ('.SA', '-USD', '-BRL', '=X'):
            t = t.replace(s, '')
        return t

    def _fmt_price(price: float, ticker: str) -> str:
        is_brl = ticker.endswith('.SA') or ticker.endswith('-BRL')
        if is_brl:
            s = f"{price:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            return f"R${s}"
        decimals = 2 if price < 1000 else 0
        return f"${price:,.{decimals}f}"

    items_html = ""
    for p in perf_home:
        t_label = _clean(p["ticker"])
        pct   = p["pct"]
        price = p.get("price", 0.0)
        price_str = _fmt_price(price, p["ticker"]) if price else ""
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
            f'<span class="home-tt-price">{price_str}</span>'
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
            pct   = p["pct"]
            price = p.get("price", 0.0)
            sign  = "+" if pct >= 0 else ""
            arr   = "▲" if pct >= 0 else "▼"
            price_str = _fmt_price(price, p["ticker"]) if price else ""
            rows += (
                f'<div class="perfs-row">'
                f'<span class="perfs-ticker">{label}</span>'
                f'<span class="perfs-price">{price_str}</span>'
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

    # --- VISÃO DO PORTFÓLIO — TWR CHART (components.html for full design control) ---
    try:
        import json as _json_twr
        from core.performance.home_twr import get_home_twr_series
        _twr_series, _twr_total, _twr_annual = get_home_twr_series()
        if _twr_series is not None and len(_twr_series) >= 2:
            _twr_pct   = _twr_total * 100
            _twr_sign  = '+' if _twr_pct >= 0 else ''
            _twr_color = '#34d399' if _twr_pct >= 0 else '#f87171'
            _twr_fill  = 'rgba(52,211,153,0.13)' if _twr_pct >= 0 else 'rgba(248,113,113,0.13)'
            _cum_pct   = _twr_series * 100

            _dates_j  = _json_twr.dumps([str(d.date()) for d in _cum_pct.index])
            _values_j = _json_twr.dumps([round(float(v), 4) for v in _cum_pct.values])
            _ann_pct  = f"{_twr_sign}{_twr_pct:.2f}%"

            _twr_html = (
                "<!DOCTYPE html><html><head><meta charset='UTF-8'>"
                "<meta name='viewport' content='width=device-width,initial-scale=1'>"
                "<script src='https://cdn.plot.ly/plotly-2.26.0.min.js'></script>"
                "<style>"
                "*{box-sizing:border-box;margin:0;padding:0}"
                "body{background:transparent;font-family:'Outfit',system-ui,sans-serif;"
                "color:#e2e8f0;overflow:hidden}"
                ".card{background:rgba(15,23,42,0.65);backdrop-filter:blur(16px);"
                "-webkit-backdrop-filter:blur(16px);"
                "border:1px solid rgba(52,211,153,0.14);border-radius:20px;overflow:hidden;"
                "box-shadow:0 12px 44px rgba(0,0,0,0.45);padding:16px 20px 14px;"
                "margin:8px 20px 4px;position:relative;"
                "transition:background .25s ease}"
                ".card:hover{background:rgba(15,23,42,0.72)}"
                ".card::before{content:'';position:absolute;inset:0;border-radius:20px;padding:1px;"
                "background:linear-gradient(135deg,rgba(52,211,153,0.22) 0%,"
                "rgba(255,255,255,0.04) 50%,rgba(52,211,153,0.1) 100%);"
                "-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);"
                "mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);"
                "-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}"
                ".hdr{display:flex;align-items:center;justify-content:space-between;"
                "margin-bottom:6px}"
                ".lbl{font-size:0.52rem;font-weight:800;color:#475569;text-transform:uppercase;"
                f"letter-spacing:1.5px;display:flex;align-items:center;gap:5px}}"
                f".lbl::before{{content:'';width:5px;height:5px;border-radius:50%;"
                f"background:{_twr_color};flex-shrink:0}}"
                f".val{{font-size:2.3rem;font-weight:800;color:{_twr_color};"
                "letter-spacing:-1.5px;line-height:1;margin-bottom:3px}"
                ".sub{font-size:0.62rem;color:#64748b;font-weight:500}"
                ".expand-hint{font-size:0.60rem;font-weight:600;color:#475569;"
                "letter-spacing:0.5px;display:flex;align-items:center;gap:4px;"
                "user-select:none;transition:all .2s ease;white-space:nowrap;"
                "cursor:pointer;padding:3px 10px;border-radius:20px;"
                "border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.03)}"
                ".expand-hint:hover{color:#94a3b8;"
                "border-color:rgba(255,255,255,0.14);background:rgba(255,255,255,0.06)}"
                ".caret{display:inline-block;"
                "transition:transform .35s cubic-bezier(0.4,0,0.2,1);font-size:0.72rem;line-height:1}"
                ".caret.open{transform:rotate(180deg)}"
                ".btns{display:flex;gap:4px;margin-top:8px}"
                ".btn{flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);"
                "border-radius:8px;color:#64748b;font-size:0.62rem;font-weight:600;"
                "padding:5px 2px;cursor:pointer;transition:all .15s ease;"
                "font-family:inherit;text-align:center}"
                ".btn:hover{background:rgba(255,255,255,0.08);color:#94a3b8}"
                f".btn.on{{background:rgba(52,211,153,0.14);border-color:rgba(52,211,153,0.3);"
                f"color:{_twr_color}}}"
                "#ch-wrap{margin-top:10px;overflow:hidden}"
                "#ch{width:100%;height:188px;touch-action:pan-y}"
                ".nsewdrag,.drag{cursor:default!important}"
                "</style></head><body>"
                "<div class='card'>"
                "<div class='hdr'>"
                "<div class='lbl'>VISÃO DO PORTFÓLIO</div>"
                "<div id='expand-hint' class='expand-hint' onclick='toggleCard()'>"
                "<span id='hint-txt'>expandir</span>&nbsp;<span class='caret' id='caret'>↓</span>"
                "</div>"
                "</div>"
                f"<div class='val' id='vv'>{_ann_pct}</div>"
                "<div class='sub' id='ss'>Retorno — Ano até hoje</div>"
                "<div id='btns-wrap' style='display:none' onclick='event.stopPropagation()'>"
                "<div class='btns'>"
                "<button class='btn on' onclick='sp(\"1D\",this)'>1D</button>"
                "<button class='btn' onclick='sp(\"1S\",this)'>1S</button>"
                "<button class='btn' onclick='sp(\"1M\",this)'>1M</button>"
                "<button class='btn' onclick='sp(\"YTD\",this)'>YTD</button>"
                "<button class='btn' onclick='sp(\"1A\",this)'>1A</button>"
                "<button class='btn' onclick='sp(\"MAX\",this)'>TUDO</button>"
                "</div></div>"
                "<div id='ch-wrap' style='display:none'><div id='ch'></div></div>"
                "</div>"
                "<script>"
                f"const AD={_dates_j};"
                f"const AV={_values_j};"
                f"const TOTAL='{_ann_pct}';"
                "const C_POS='#34d399',C_NEG='#f87171';"
                "const F_POS='rgba(52,211,153,0.13)',F_NEG='rgba(248,113,113,0.13)';"
                "const SUBS={"
                "'1D':'Retorno — Hoje',"
                "'1S':'Retorno — Última Semana',"
                "'1M':'Retorno — Último Mês',"
                "'YTD':'Retorno — Ano até hoje',"
                "'1A':'Retorno — Último Ano',"
                "'MAX':'Retorno Total desde a Criação'"
                "};"
                "const _COLL=120,_EXP=352;"
                "let isExpanded=false,chartReady=false;"
                "function calc1D(){"
                "if(AD.length<2)return TOTAL;"
                "const last=new Date(AD[AD.length-1]);"
                "const start=new Date(last);start.setDate(start.getDate()-1);"
                "const startStr=start.toISOString().slice(0,10);"
                "const fd=AD.filter(d=>d>=startStr);"
                "if(fd.length<1)return TOTAL;"
                "let fv=fd.map(d=>AV[AD.indexOf(d)]);"
                "const b0=1+fv[0]/100;"
                "fv=fv.map(v=>((1+v/100)/b0-1)*100);"
                "const v=fv[fv.length-1];"
                "return(v>=0?'+':'')+v.toFixed(2)+'%';}"
                "function calcYTD(){"
                "if(AD.length<2)return TOTAL;"
                "const last=new Date(AD[AD.length-1]);"
                "const startStr=new Date(last.getFullYear(),0,1).toISOString().slice(0,10);"
                "const fd=AD.filter(d=>d>=startStr);"
                "if(fd.length<1)return TOTAL;"
                "let fv=fd.map(d=>AV[AD.indexOf(d)]);"
                "const b0=1+fv[0]/100;"
                "fv=fv.map(v=>((1+v/100)/b0-1)*100);"
                "const v=fv[fv.length-1];"
                "return(v>=0?'+':'')+v.toFixed(2)+'%';}"
                "function setNum(disp){"
                "const pos=!disp.startsWith('-');"
                "const el=document.getElementById('vv');"
                "el.textContent=disp;"
                "el.style.color=pos?C_POS:C_NEG;}"
                "setNum(calcYTD());"
                "function tr(dates,vals,lc,fc){"
                "return[{x:dates,y:vals,type:'scatter',mode:'lines',"
                "fill:'tozeroy',fillcolor:fc||F_POS,"
                "line:{color:lc||C_POS,width:2.2,shape:'spline',smoothing:0.5},"
                "hovertemplate:'%{x|%d/%m/%Y}<br><b>%{y:.2f}%</b><extra></extra>'}];}"
                "const LY={"
                "height:188,margin:{l:44,r:8,t:6,b:30},"
                "paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',"
                "showlegend:false,hovermode:'x unified',dragmode:false,"
                "hoverlabel:{bgcolor:'rgba(15,23,42,0.9)',bordercolor:'rgba(255,255,255,0.1)',"
                "font:{size:11,color:'#e2e8f0',family:'Outfit,sans-serif'}},"
                "xaxis:{showgrid:false,showline:false,type:'date',"
                "tickfont:{size:9,color:'#475569'},tickcolor:'rgba(0,0,0,0)',"
                "linecolor:'rgba(0,0,0,0)'},"
                "yaxis:{ticksuffix:'%',tickformat:'.0f',"
                "showgrid:true,gridcolor:'rgba(255,255,255,0.05)',"
                "showline:false,zeroline:true,zerolinecolor:'rgba(255,255,255,0.12)',"
                "zerolinewidth:1,tickfont:{size:9,color:'#475569'},"
                "tickcolor:'rgba(0,0,0,0)'}};"
                "const CFG={displayModeBar:false,responsive:true,scrollZoom:false,doubleClick:false};"
                f"const initPos={'true' if _twr_pct >= 0 else 'false'};"
                "function sp(p,btn){"
                "document.querySelectorAll('.btn').forEach(b=>b.classList.remove('on'));"
                "btn.classList.add('on');"
                "const last=new Date(AD[AD.length-1]);"
                "let start;"
                "if(p==='1D'){start=new Date(last);start.setDate(start.getDate()-1);}"
                "else if(p==='1S'){start=new Date(last);start.setDate(start.getDate()-7);}"
                "else if(p==='1M'){start=new Date(last);start.setMonth(start.getMonth()-1);}"
                "else if(p==='YTD'){start=new Date(last.getFullYear(),0,1);}"
                "else if(p==='1A'){start=new Date(last);start.setFullYear(start.getFullYear()-1);}"
                "else{start=new Date(AD[0]);}"
                "const startStr=start.toISOString().slice(0,10);"
                "const fd=AD.filter(d=>d>=startStr);"
                "let fv=fd.map(d=>AV[AD.indexOf(d)]);"
                "let disp,lc,fc;"
                "if(p!=='MAX'&&fv.length>0){"
                "const b0=1+fv[0]/100;"
                "fv=fv.map(v=>((1+v/100)/b0-1)*100);"
                "const last_v=fv[fv.length-1];"
                "const pos=last_v>=0;"
                "disp=(pos?'+':'')+last_v.toFixed(2)+'%';"
                "lc=pos?C_POS:C_NEG;fc=pos?F_POS:F_NEG;"
                "} else {"
                "disp=TOTAL;"
                f"lc={'C_POS' if _twr_pct >= 0 else 'C_NEG'};"
                f"fc={'F_POS' if _twr_pct >= 0 else 'F_NEG'};"
                "}"
                "setNum(disp);"
                "document.getElementById('ss').textContent=SUBS[p]||'';"
                "Plotly.react('ch',tr(fd,fv,lc,fc),LY,CFG);}"
                "function toggleCard(){"
                "const chWrap=document.getElementById('ch-wrap');"
                "const btnsWrap=document.getElementById('btns-wrap');"
                "const hintTxt=document.getElementById('hint-txt');"
                "const caret=document.getElementById('caret');"
                "const fe=window.frameElement;"
                "if(!isExpanded){"
                "chWrap.style.display='block';"
                "btnsWrap.style.display='block';"
                "hintTxt.textContent='recolher';"
                "caret.classList.add('open');"
                "if(fe){const tr='height .4s cubic-bezier(0.4,0,0.2,1)';"
                "fe.style.transition=tr;fe.style.height=_EXP+'px';"
                "if(fe.parentElement){fe.parentElement.style.transition=tr;"
                "fe.parentElement.style.height=_EXP+'px';}}"
                "const lastD=new Date(AD[AD.length-1]);"
                "const s1=new Date(lastD);s1.setDate(s1.getDate()-1);"
                "const s1str=s1.toISOString().slice(0,10);"
                "const fd1=AD.filter(d=>d>=s1str);"
                "let fv1=fd1.map(d=>AV[AD.indexOf(d)]);"
                "if(fv1.length>0){const b0=1+fv1[0]/100;"
                "fv1=fv1.map(v=>((1+v/100)/b0-1)*100);}"
                "const v1=fv1.length>0?fv1[fv1.length-1]:0;"
                "const lc1=v1>=0?C_POS:C_NEG,fc1=v1>=0?F_POS:F_NEG;"
                "const d1=(v1>=0?'+':'')+v1.toFixed(2)+'%';"
                "setNum(d1);"
                "document.getElementById('ss').textContent=SUBS['1D'];"
                "document.querySelectorAll('.btn').forEach(b=>b.classList.remove('on'));"
                "const firstBtn=btnsWrap.querySelector('.btn');"
                "if(firstBtn)firstBtn.classList.add('on');"
                "if(!chartReady){"
                "Plotly.newPlot('ch',tr(fd1,fv1,lc1,fc1),LY,CFG);chartReady=true;"
                "}else{Plotly.react('ch',tr(fd1,fv1,lc1,fc1),LY,CFG);}"
                "}else{"
                "chWrap.style.display='none';"
                "btnsWrap.style.display='none';"
                "hintTxt.textContent='expandir';"
                "caret.classList.remove('open');"
                "if(fe){const tr='height .4s cubic-bezier(0.4,0,0.2,1)';"
                "fe.style.transition=tr;fe.style.height=_COLL+'px';"
                "if(fe.parentElement){fe.parentElement.style.transition=tr;"
                "fe.parentElement.style.height=_COLL+'px';}}"
                "setNum(calcYTD());"
                "document.getElementById('ss').textContent=SUBS['YTD'];"
                "}"
                "isExpanded=!isExpanded;}"
                "</script></body></html>"
            )

            with chart_placeholder:
                components.html(_twr_html, height=120, scrolling=False)
        else:
            chart_placeholder.empty()
    except Exception:
        chart_placeholder.empty()

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

    best_pct  = best_5[0]["pct"]  if best_5  else 0.0
    worst_pct = worst_5[0]["pct"] if worst_5 else 0.0
    today_str = _dt.now().strftime("%d %b %Y").upper()

    n1 = _radar_news_card(best_n,  best_t,  best_pct,  True)
    n2 = _radar_news_card(worst_n, worst_t, worst_pct, False)
    news_row  = f'<div class="radar-news">{n1}{n2}</div>' if (n1 or n2) else ""
    poly_body, poly_js = _radar_poly_section(_poly_pool)

    # ── Self-contained card rendered inside a real iframe (JS works natively) ──
    _css = (
        "*{box-sizing:border-box}"
        "body{margin:0;padding:0;background:transparent;"
        "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;"
        "color:#e2e8f0;overflow:hidden}"
        "a{text-decoration:none!important;color:inherit}"
        ".rw{max-width:580px;margin:2px auto 0;padding:0 20px}"
        ".rc{background:#090e19;border:1px solid rgba(255,255,255,.07);"
        "border-radius:20px;overflow:hidden;box-shadow:0 14px 48px -10px rgba(0,0,0,.55)}"
        ".rh{display:flex;align-items:center;justify-content:space-between;"
        "padding:11px 16px 9px;border-bottom:1px solid rgba(255,255,255,.05)}"
        ".rhl{display:flex;align-items:center;gap:8px}"
        ".ld{width:7px;height:7px;border-radius:50%;background:#22d3ee;"
        "animation:pd 2s ease-in-out infinite;flex-shrink:0}"
        "@keyframes pd{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.65)}}"
        ".rt{font-size:.68rem;font-weight:800;letter-spacing:1.6px;"
        "text-transform:uppercase;color:#64748b}"
        ".rd{font-size:.63rem;color:#1e293b;letter-spacing:.3px}"
        ".radar-news{display:grid;grid-template-columns:1fr 1fr;"
        "height:104px;border-bottom:1px solid rgba(255,255,255,.05)}"
        ".radar-news-card{position:relative;overflow:hidden;display:flex;"
        "flex-direction:column;justify-content:flex-end;"
        "text-decoration:none!important;transition:all .3s ease}"
        ".radar-news-card:first-child{border-right:1px solid rgba(255,255,255,.05)}"
        ".radar-news-bg{position:absolute;inset:0;background-size:cover;"
        "background-position:center;filter:brightness(.38) saturate(.6);"
        "transition:transform .5s ease,filter .3s ease;z-index:0}"
        ".radar-news-card:hover .radar-news-bg{transform:scale(1.06);"
        "filter:brightness(.5) saturate(.75)}"
        ".radar-news-overlay{position:absolute;inset:0;z-index:1}"
        ".radar-news-content{position:relative;z-index:2;padding:10px 12px;"
        "display:flex;flex-direction:column;gap:4px}"
        ".radar-news-badge{display:inline-flex;align-items:center;gap:3px;"
        "font-size:.6rem;font-weight:800;text-transform:uppercase;"
        "letter-spacing:.8px;padding:2px 6px;border-radius:5px;align-self:flex-start}"
        ".radar-badge-up{background:rgba(52,211,153,.18);color:#34d399;"
        "border:1px solid rgba(52,211,153,.28)}"
        ".radar-badge-down{background:rgba(248,113,113,.18);color:#f87171;"
        "border:1px solid rgba(248,113,113,.28)}"
        ".radar-news-headline{font-size:.76rem;font-weight:600;color:#f1f5f9;"
        "line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;"
        "-webkit-box-orient:vertical;overflow:hidden;"
        "text-shadow:0 1px 4px rgba(0,0,0,.9)}"
        ".radar-news-source{font-size:.6rem;color:#475569;font-weight:500}"
        ".radar-divider{display:flex;align-items:center;gap:10px;padding:8px 16px;"
        "border-bottom:1px solid rgba(255,255,255,.04)}"
        ".radar-divider-line{flex:1;height:1px;background:rgba(255,255,255,.05)}"
        ".radar-divider-label{font-size:.6rem;font-weight:800;color:#38bdf8;"
        "letter-spacing:1.2px;text-transform:uppercase;white-space:nowrap}"
        ".radar-poly{display:block;padding:12px 16px 10px;"
        "text-decoration:none!important;color:inherit;"
        "transition:background .2s ease;border-bottom:1px solid rgba(255,255,255,.04)}"
        ".radar-poly:hover{background:rgba(56,189,248,.04)}"
        ".radar-poly-question{font-size:.87rem;font-weight:600;color:#e2e8f0;"
        "line-height:1.42;margin-bottom:10px}"
        ".radar-poly-bars{display:flex;flex-direction:column;gap:5px;margin-bottom:8px}"
        ".radar-bar-row{position:relative;display:flex;align-items:center;gap:8px;"
        "padding:5px 9px;border-radius:7px;"
        "background:rgba(255,255,255,.04);overflow:hidden}"
        ".radar-bar-fill{position:absolute;left:0;top:0;bottom:0;border-radius:7px;"
        "z-index:0;transition:width .55s cubic-bezier(.4,0,.2,1)}"
        ".radar-bar-fill.yes{background:rgba(34,211,238,.16);"
        "border-right:2px solid rgba(34,211,238,.4)}"
        ".radar-bar-fill.no{background:rgba(251,146,60,.14);"
        "border-right:2px solid rgba(251,146,60,.35)}"
        ".radar-bar-fill.other{background:rgba(167,139,250,.13);"
        "border-right:2px solid rgba(167,139,250,.3)}"
        ".radar-bar-name{position:relative;z-index:1;font-size:.75rem;"
        "color:#cbd5e1;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
        ".radar-bar-pct{position:relative;z-index:1;font-size:.77rem;"
        "font-weight:700;flex-shrink:0}"
        ".radar-bar-pct.yes{color:#22d3ee}"
        ".radar-bar-pct.no{color:#fb923c}"
        ".radar-bar-pct.other{color:#a78bfa}"
        ".radar-poly-meta{display:flex;justify-content:space-between;"
        "font-size:.67rem;color:#475569}"
        ".radar-poly-meta-cta{color:#38bdf8;font-weight:600}"
        ".radar-nav{display:flex;align-items:center;justify-content:space-between;"
        "padding:7px 16px}"
        ".radar-counter{font-size:.63rem;color:#64748b}"
        ".radar-next-btn{display:inline-flex;align-items:center;gap:5px;"
        "font-size:.68rem;font-weight:600;cursor:pointer;color:#94a3b8;"
        "text-decoration:none!important;padding:4px 12px;border-radius:20px;"
        "border:1px solid rgba(255,255,255,.08);"
        "background:rgba(255,255,255,.03);transition:all .18s ease}"
        ".radar-next-btn:hover{color:#38bdf8;"
        "border-color:rgba(56,189,248,.3);background:rgba(56,189,248,.06)}"
    )
    _full_html = (
        "<!DOCTYPE html><html><head><meta charset='UTF-8'>"
        f"<style>{_css}</style></head><body>"
        "<div class='rw'><div class='rc'>"
        "<div class='rh'><div class='rhl'>"
        "<span class='ld'></span><span class='rt'>Radar do Dia</span>"
        f"</div><span class='rd'>{today_str}</span></div>"
        f"{news_row}{poly_body}"
        f"</div></div><script>{poly_js}</script></body></html>"
    )
    if _poly_pool and poly_body:
        _radar_height = 382
    elif poly_body:  # offline fallback message
        _radar_height = 225 if news_row else 115
    else:
        _radar_height = 145 if news_row else 55
    with highlights_placeholder:
        components.html(_full_html, height=_radar_height, scrolling=False)
    poly_nav_placeholder.empty()

else:
    ticker_placeholder.empty()
    # Portfolio data unavailable — show standalone Polymarket card (with offline fallback if needed)
    if True:
        poly_body, poly_js = _radar_poly_section(_poly_pool)
        _today_str = _dt.now().strftime("%d %b %Y").upper()
        _css_solo = (
            "*{box-sizing:border-box}"
            "body{margin:0;padding:0;background:transparent;"
            "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;"
            "color:#e2e8f0;overflow:hidden}"
            "a{text-decoration:none!important;color:inherit}"
            ".rw{max-width:580px;margin:2px auto 0;padding:0 20px}"
            ".rc{background:#090e19;border:1px solid rgba(255,255,255,.07);"
            "border-radius:20px;overflow:hidden;box-shadow:0 14px 48px -10px rgba(0,0,0,.55)}"
            ".rh{display:flex;align-items:center;justify-content:space-between;"
            "padding:11px 16px 9px;border-bottom:1px solid rgba(255,255,255,.05)}"
            ".rhl{display:flex;align-items:center;gap:8px}"
            ".ld{width:7px;height:7px;border-radius:50%;background:#22d3ee;"
            "animation:pd 2s ease-in-out infinite;flex-shrink:0}"
            "@keyframes pd{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.65)}}"
            ".rt{font-size:.68rem;font-weight:800;letter-spacing:1.6px;"
            "text-transform:uppercase;color:#64748b}"
            ".rd{font-size:.63rem;color:#1e293b;letter-spacing:.3px}"
            ".radar-divider{display:flex;align-items:center;gap:10px;padding:8px 16px;"
            "border-bottom:1px solid rgba(255,255,255,.04)}"
            ".radar-divider-line{flex:1;height:1px;background:rgba(255,255,255,.05)}"
            ".radar-divider-label{font-size:.6rem;font-weight:800;color:#38bdf8;"
            "letter-spacing:1.2px;text-transform:uppercase;white-space:nowrap}"
            ".radar-poly{display:block;padding:12px 16px 10px;"
            "text-decoration:none!important;color:inherit;"
            "transition:background .2s ease;border-bottom:1px solid rgba(255,255,255,.04)}"
            ".radar-poly:hover{background:rgba(56,189,248,.04)}"
            ".radar-poly-question{font-size:.87rem;font-weight:600;color:#e2e8f0;"
            "line-height:1.42;margin-bottom:10px}"
            ".radar-poly-bars{display:flex;flex-direction:column;gap:5px;margin-bottom:8px}"
            ".radar-bar-row{position:relative;display:flex;align-items:center;gap:8px;"
            "padding:5px 9px;border-radius:7px;"
            "background:rgba(255,255,255,.04);overflow:hidden}"
            ".radar-bar-fill{position:absolute;left:0;top:0;bottom:0;border-radius:7px;"
            "z-index:0;transition:width .55s cubic-bezier(.4,0,.2,1)}"
            ".radar-bar-fill.yes{background:rgba(34,211,238,.16);"
            "border-right:2px solid rgba(34,211,238,.4)}"
            ".radar-bar-fill.no{background:rgba(251,146,60,.14);"
            "border-right:2px solid rgba(251,146,60,.35)}"
            ".radar-bar-fill.other{background:rgba(167,139,250,.13);"
            "border-right:2px solid rgba(167,139,250,.3)}"
            ".radar-bar-name{position:relative;z-index:1;font-size:.75rem;"
            "color:#cbd5e1;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
            ".radar-bar-pct{position:relative;z-index:1;font-size:.77rem;"
            "font-weight:700;flex-shrink:0}"
            ".radar-bar-pct.yes{color:#22d3ee}"
            ".radar-bar-pct.no{color:#fb923c}"
            ".radar-bar-pct.other{color:#a78bfa}"
            ".radar-poly-meta{display:flex;justify-content:space-between;"
            "font-size:.67rem;color:#475569}"
            ".radar-poly-meta-cta{color:#38bdf8;font-weight:600}"
            ".radar-nav{display:flex;align-items:center;justify-content:space-between;"
            "padding:7px 16px}"
            ".radar-counter{font-size:.63rem;color:#64748b}"
            ".radar-next-btn{display:inline-flex;align-items:center;gap:5px;"
            "font-size:.68rem;font-weight:600;cursor:pointer;color:#94a3b8;"
            "text-decoration:none!important;padding:4px 12px;border-radius:20px;"
            "border:1px solid rgba(255,255,255,.08);"
            "background:rgba(255,255,255,.03);transition:all .18s ease}"
            ".radar-next-btn:hover{color:#38bdf8;"
            "border-color:rgba(56,189,248,.3);background:rgba(56,189,248,.06)}"
        )
        _full_solo_html = (
            "<!DOCTYPE html><html><head><meta charset='UTF-8'>"
            f"<style>{_css_solo}</style></head><body>"
            "<div class='rw'><div class='rc'>"
            "<div class='rh'><div class='rhl'>"
            "<span class='ld'></span><span class='rt'>Mercado Preditivo</span>"
            f"</div><span class='rd'>{_today_str}</span></div>"
            f"{poly_body}"
            f"</div></div><script>{poly_js}</script></body></html>"
        )
        _solo_height = 300 if _poly_pool else 115
        with highlights_placeholder:
            components.html(_full_solo_html, height=_solo_height, scrolling=False)
        poly_nav_placeholder.empty()

# poly_insight_placeholder intentionally left empty (merged into radar card)

# --- FOOTER SECTION REMOVED FROM HERE ---

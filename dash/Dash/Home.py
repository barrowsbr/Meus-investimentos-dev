import streamlit as st
import streamlit.components.v1 as components
import base64
from pathlib import Path
from core.auth import init_auth_state
from core.ui import render_fab

# --- INIT SESSION STATE ---
init_auth_state()

# --- PAGE CONFIGURATION ---
st.set_page_config(
    page_title="BARROOTS",
    page_icon="🌿",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- CACHE REFRESH LOGIC ---
if st.query_params.get("refresh") == "1":
    st.cache_data.clear()
    st.query_params.clear()
    st.rerun()

# --- LOAD LOGO FOR PRELOADER ---
def get_logo_base64():
    """Load logo image as base64 for preloader."""
    try:
        logo_path = Path(__file__).parent / "assets" / "logos" / "carregamento.png"
        with open(logo_path, "rb") as f:
            return base64.b64encode(f.read()).decode()
    except:
        return None

logo_b64 = get_logo_base64()

logo_html = f'<img src="data:image/png;base64,{logo_b64}" class="preloader-logo" />' if logo_b64 else '<div class="preloader-spinner"></div>'

# --- META TAGS FOR MOBILE (Theme Color) ---
st.markdown(f"""
<meta name="theme-color" content="#0b1120" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
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
    animation: fadeOutPreloader 0.5s ease-out 3s forwards;
}}
.preloader-logo {{
    width: 190px;
    height: auto;
    background: transparent;
    border: none;
    animation: pulseLogo 1.5s ease-in-out infinite;
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
@keyframes pulseLogo {{
    0%, 100% {{ opacity: 0.7; transform: scale(1); }}
    50% {{ opacity: 1; transform: scale(1.05); }}
}}
@keyframes fadeOutPreloader {{
    to {{ opacity: 0; visibility: hidden; }}
}}
</style>
<div class="preloader-overlay">{logo_html}</div>
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
    .metrics-container { margin-top: -60px; }
    .metrics-box {
        flex-direction: column;
        gap: 15px;
        padding: 25px 40px;
        width: 100%;
        max-width: 500px;
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
        <div class="metric-divider"></div>
        <div class="metric-item">
            <div class="metric-item-label">Dólar (USD)</div>
            <div class="metric-item-value skeleton-pulse">R$ --.---</div>
        </div>
    </div>
</div>
""", unsafe_allow_html=True)

# --- SPACER ---
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
                    <span class="sub-item-icon">❖</span>
                    <span class="sub-item-text">Resumo</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Performance_Advanced" target="_self" class="sub-item">
                    <span class="sub-item-icon">▲</span>
                    <span class="sub-item-text">Performance</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos?tab=2" target="_self" class="sub-item">
                    <span class="sub-item-icon">▤</span>
                    <span class="sub-item-text">Renda Variável</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos?tab=3" target="_self" class="sub-item">
                    <span class="sub-item-icon">▦</span>
                    <span class="sub-item-text">Renda Fixa</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos?tab=4" target="_self" class="sub-item">
                    <span class="sub-item-icon">◐</span>
                    <span class="sub-item-text">Proventos</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos?tab=5" target="_self" class="sub-item">
                    <span class="sub-item-icon">❂</span>
                    <span class="sub-item-text">Cripto</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos?tab=6" target="_self" class="sub-item">
                    <span class="sub-item-icon">⬡</span>
                    <span class="sub-item-text">Câmbio</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos?tab=7" target="_self" class="sub-item">
                    <span class="sub-item-icon">▼</span>
                    <span class="sub-item-text">Imposto</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Investimentos?tab=8" target="_self" class="sub-item">
                    <span class="sub-item-icon">∞</span>
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
                    <span class="sub-item-icon">💰</span>
                    <span class="sub-item-text">Mensal</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Finanças?tab=1" target="_self" class="sub-item">
                    <span class="sub-item-icon">🔄</span>
                    <span class="sub-item-text">Assinaturas</span>
                    <span class="sub-item-arrow">→</span>
                </a>
                <a href="Finanças?tab=2" target="_self" class="sub-item">
                    <span class="sub-item-icon">📦</span>
                    <span class="sub-item-text">Parcelamentos</span>
                    <span class="sub-item-arrow">→</span>
                </a>
            </div>
        </div>
    </div>
</div>

<a href="Editor" target="_self" class="nav-card card-editor">
    <div class="card-title"><i class="card-icon">▣</i> Editor</div>
    <div class="card-desc">Edição de registros e transações</div>
    <span class="card-arrow">→</span>
</a>

<a href="Noticias" target="_self" class="nav-card card-noticias">
    <div class="card-title"><i class="card-icon">◉</i> Notícias</div>
    <div class="card-desc">Mercado, portfólio e tendências do dia</div>
    <span class="card-arrow">→</span>
</a>

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
dolar_class = "positive" if dolar_change >= 0 else "negative"
rv_value = format_decimal_br(rv_day_gain, 2)
rv_pct = format_decimal_br(rv_day_pct, 2)
dolar_value = format_decimal_br(dolar_val, 3)
dolar_pct = format_decimal_br(dolar_var, 2)
rv_sign = "+" if rv_day_gain >= 0 else ""
dolar_sign = "+" if dolar_change >= 0 else ""

# Update the placeholder with real data
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
else:
    ticker_placeholder.empty()

# --- FOOTER SECTION REMOVED FROM HERE ---

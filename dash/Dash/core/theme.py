"""
core/theme.py — Design System centralizado (Glassmorphism)

Módulo reutilizável para injetar o tema visual padrão da Home
em qualquer página do app. Uso:

    from core.theme import inject_global_theme, render_page_header
    inject_global_theme()
    render_page_header("Título da Página", "Subtítulo descritivo", "⚙️")
"""

import streamlit as st
import base64
from pathlib import Path


# ─── Design Tokens ───────────────────────────────────────────────────
COLORS = {
    "bg":             "#0b1120",
    "card_bg":        "rgba(15, 23, 42, 0.6)",
    "card_bg_hover":  "rgba(15, 23, 42, 0.75)",
    "card_bg_solid":  "rgba(15, 23, 42, 0.85)",
    "border":         "rgba(255, 255, 255, 0.08)",
    "border_hover":   "rgba(99, 102, 241, 0.3)",
    "border_focus":   "rgba(99, 102, 241, 0.5)",
    "accent":         "#6366f1",
    "accent_rgb":     "99, 102, 241",
    "text_primary":   "#f1f5f9",
    "text_secondary": "#94a3b8",
    "text_muted":     "#64748b",
    "positive":       "#34d399",
    "negative":       "#f87171",
    "divider":        "rgba(255, 255, 255, 0.06)",
}


def _get_bg_base64() -> str | None:
    """Load Fundo.png as base64."""
    try:
        path = Path(__file__).parent.parent / "pictures" / "Fundo.png"
        with open(path, "rb") as f:
            return base64.b64encode(f.read()).decode()
    except Exception:
        return None


def inject_global_theme(*, hide_sidebar: bool = True):
    """
    Injeta o tema glassmorphism global.
    Chamar UMA VEZ no topo de cada página, logo após st.set_page_config().
    """
    C = COLORS
    bg_b64 = _get_bg_base64()

    bg_image_css = ""
    if bg_b64:
        bg_image_css = f"""
            background-image: url('data:image/png;base64,{bg_b64}');
            background-size: cover;
            background-position: center center;
            background-attachment: fixed;
            background-repeat: no-repeat;
        """

    sidebar_css = ""
    if hide_sidebar:
        sidebar_css = """
        section[data-testid="stSidebar"],
        [data-testid="stSidebarNav"],
        [data-testid="collapsedControl"] {
            display: none !important;
        }
        """

    st.markdown(f"""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');

    /* ═══ RESET & BASE ═══ */
    html, body, .stApp, [class*="css"] {{
        font-family: 'Outfit', sans-serif !important;
        color: {C['text_primary']} !important;
    }}

    html, body, [data-testid="stAppViewContainer"] {{
        background-color: {C['bg']} !important;
        {bg_image_css}
    }}

    .stApp {{
        background-color: transparent !important;
        min-height: 100vh;
    }}

    /* ═══ HIDE STREAMLIT CHROME ═══ */
    #MainMenu, footer, header,
    .stAppDeployButton,
    [data-testid="stToolbar"],
    [data-testid="stHeader"],
    [data-testid="stStatusWidget"],
    [data-testid="stAppToolbar"],
    div[class*="viewerBadge"],
    [data-testid="stManageAppButton"],
    div[data-testid="stDecoration"] {{
        display: none !important;
    }}
    {sidebar_css}

    /* ═══ LAYOUT RESET ═══ */
    .stApp > header {{
        display: none !important;
    }}
    .block-container {{
        padding-top: 2rem !important;
        padding-bottom: 2rem !important;
        max-width: 1200px !important;
    }}

    /* ═══ GLASS CARDS ═══ */
    .glass-card {{
        background: {C['card_bg']};
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid {C['border']};
        border-radius: 20px;
        padding: 28px;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
    }}

    .glass-card::before {{
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 20px;
        padding: 1px;
        background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 50%, rgba(255,255,255,0.05) 100%);
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        pointer-events: none;
    }}

    .glass-card:hover {{
        transform: translateY(-4px);
        background: {C['card_bg_hover']};
        border-color: {C['border_hover']};
        box-shadow: 0 20px 50px -10px rgba({C['accent_rgb']}, 0.2);
    }}

    .glass-card:hover::before {{
        background: linear-gradient(135deg, rgba({C['accent_rgb']}, 0.3) 0%, rgba({C['accent_rgb']}, 0.1) 100%);
    }}

    /* ═══ CARD INTERNALS ═══ */
    .glass-card-icon {{
        font-size: 2rem;
        margin-bottom: 12px;
        display: block;
    }}

    .glass-card-title {{
        font-size: 1.15rem;
        font-weight: 700;
        color: {C['text_primary']};
        margin-bottom: 4px;
        letter-spacing: 0.3px;
    }}

    .glass-card-desc {{
        font-size: 0.82rem;
        color: {C['text_muted']};
        letter-spacing: 0.3px;
        line-height: 1.5;
    }}

    .glass-card-divider {{
        height: 1px;
        background: linear-gradient(to right, transparent, {C['divider']}, transparent);
        margin: 16px 0;
    }}

    /* ═══ BUTTONS ═══ */
    div.stButton > button {{
        background: linear-gradient(135deg, rgba({C['accent_rgb']}, 0.15), rgba({C['accent_rgb']}, 0.05)) !important;
        color: {C['text_primary']} !important;
        border: 1px solid rgba({C['accent_rgb']}, 0.3) !important;
        border-radius: 12px !important;
        font-family: 'Outfit', sans-serif !important;
        font-weight: 600 !important;
        letter-spacing: 0.5px !important;
        padding: 0.55rem 1.2rem !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }}

    div.stButton > button:hover {{
        background: linear-gradient(135deg, rgba({C['accent_rgb']}, 0.35), rgba({C['accent_rgb']}, 0.15)) !important;
        border-color: rgba({C['accent_rgb']}, 0.6) !important;
        box-shadow: 0 8px 24px rgba({C['accent_rgb']}, 0.25) !important;
        transform: translateY(-2px) !important;
    }}

    div.stButton > button:active {{
        transform: translateY(0) !important;
    }}

    /* ═══ FORM INPUTS ═══ */
    .stTextInput input,
    .stTextInput textarea {{
        background: rgba(15, 23, 42, 0.8) !important;
        border: 1px solid {C['border']} !important;
        border-radius: 10px !important;
        color: {C['text_primary']} !important;
        font-family: 'Outfit', sans-serif !important;
    }}

    .stTextInput input:focus,
    .stTextInput textarea:focus {{
        border-color: {C['border_focus']} !important;
        box-shadow: 0 0 0 3px rgba({C['accent_rgb']}, 0.1) !important;
    }}

    div[data-baseweb="select"] > div {{
        background: rgba(15, 23, 42, 0.8) !important;
        border-color: {C['border']} !important;
        border-radius: 10px !important;
        color: {C['text_primary']} !important;
        font-family: 'Outfit', sans-serif !important;
    }}

    /* ═══ TOGGLE ═══ */
    .stToggle label span {{
        color: {C['text_secondary']} !important;
        font-family: 'Outfit', sans-serif !important;
    }}

    /* ═══ CAPTIONS ═══ */
    .stCaption, small {{
        color: {C['text_muted']} !important;
        font-family: 'Outfit', sans-serif !important;
    }}

    /* ═══ DIVIDERS ═══ */
    hr {{
        border-color: {C['divider']} !important;
    }}

    /* ═══ SUCCESS / ERROR / WARNING ═══ */
    div[data-testid="stAlert"] {{
        border-radius: 12px !important;
        backdrop-filter: blur(8px) !important;
    }}

    /* ═══ FILE UPLOADER ═══ */
    [data-testid="stFileUploader"] {{
        font-family: 'Outfit', sans-serif !important;
    }}
    [data-testid="stFileUploader"] section {{
        border: 1px dashed {C['border']} !important;
        border-radius: 12px !important;
        background: rgba(15, 23, 42, 0.4) !important;
    }}
    [data-testid="stFileUploader"] section:hover {{
        border-color: rgba({C['accent_rgb']}, 0.3) !important;
    }}

    /* ═══ FORM ═══ */
    [data-testid="stForm"] {{
        border: 1px solid {C['border']} !important;
        border-radius: 16px !important;
        background: rgba(15, 23, 42, 0.3) !important;
        padding: 20px !important;
    }}

    /* ═══ MOBILE ═══ */
    @media (max-width: 768px) {{
        .block-container {{
            padding-left: 1rem !important;
            padding-right: 1rem !important;
        }}
        .glass-card {{
            padding: 20px;
            border-radius: 16px;
        }}
    }}

    </style>
    """, unsafe_allow_html=True)


def render_page_header(title: str, subtitle: str = "", icon: str = ""):
    """
    Renderiza um header de página padronizado com gradient text.
    """
    C = COLORS
    icon_html = f'<span style="font-size:1.6rem; margin-right:10px;">{icon}</span>' if icon else ""

    st.markdown(f"""
    <div style="margin-bottom: 32px;">
        <div style="
            display: flex;
            align-items: center;
            margin-bottom: 6px;
        ">
            {icon_html}
            <h1 style="
                font-size: 2rem;
                font-weight: 800;
                margin: 0;
                background: linear-gradient(135deg, #fff 0%, {C['text_secondary']} 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                letter-spacing: -0.5px;
            ">{title}</h1>
        </div>
        <p style="
            color: {C['text_muted']};
            font-size: 0.9rem;
            margin: 0;
            letter-spacing: 0.3px;
        ">{subtitle}</p>
    </div>
    """, unsafe_allow_html=True)


def render_back_button(target: str = "Home.py"):
    """
    Botão discreto de voltar, estilo consistente.
    """
    col1, _ = st.columns([1, 10])
    with col1:
        if st.button("◀ Voltar", use_container_width=True):
            st.switch_page(target)

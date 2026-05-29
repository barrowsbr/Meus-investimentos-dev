import streamlit as st
import streamlit.components.v1 as components
import base64
from pathlib import Path

def get_logo_base64():
    """Load logo image as base64."""
    try:
        # Resolve path relative to this file: core/ui.py -> ../../assets/logos/carregamento.png
        logo_path = Path(__file__).parent.parent / "assets" / "logos" / "carregamento.png"
        with open(logo_path, "rb") as f:
            return base64.b64encode(f.read()).decode()
    except:
        return None

def _get_grimmi_logo_b64():
    """Load Grimmi AI agent logo as base64."""
    try:
        logo_path = Path(__file__).parent.parent / "assets" / "logos" / "grimmi.png"
        with open(logo_path, "rb") as f:
            return base64.b64encode(f.read()).decode()
    except:
        return None

def render_fab():
    """
    Renderiza a barra de navegação inferior no estilo bottom-nav de apps nativos.
    """
    logo_b64 = get_logo_base64()
    logo_icon_html = (
        f'<img src="data:image/png;base64,{logo_b64}" '
        'style="width:20px;height:20px;object-fit:contain;display:block;" />'
        if logo_b64 else '🌿'
    )

    grimmi_b64 = _get_grimmi_logo_b64()
    grimmi_icon_html = (
        f'<img src="data:image/png;base64,{grimmi_b64}" '
        'style="width:22px;height:22px;border-radius:50%;object-fit:cover;display:block;" />'
        if grimmi_b64 else '🤖'
    )

    st.markdown(f"""
    <style>
    /* Espaço para conteúdo não ficar atrás da barra inferior */
    .block-container {{
        padding-bottom: 64px !important;
    }}

    /* ===== BARRA UNIFICADA – cor exata do botão "Manage App" ===== */
    .bottom-nav {{
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        width: 100%;
        height: 48px;
        display: flex;
        flex-direction: row;
        align-items: stretch;
        background: rgba(14, 17, 23, 0.97);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-top: 1px solid rgba(255, 255, 255, 0.10);
        border-radius: 0;
        z-index: 99999;
        padding: 0;
        box-shadow:
            0 -4px 24px rgba(0, 0, 0, 0.55),
            inset 0 1px 0 rgba(255, 255, 255, 0.06);
    }}

    /* Área dos botões — desktop: Manage App ~110px */
    .nav-items {{
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        width: calc(100% - 110px);
        height: 100%;
        flex-shrink: 0;
        padding: 0 12px;
    }}

    .nav-ghost {{
        visibility: hidden;
        pointer-events: none;
        width: 44px;
        flex-shrink: 0;
    }}

    .nav-item {{
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: 4px 6px;
        text-decoration: none !important;
        color: rgba(148, 163, 184, 0.8) !important;
        transition: color 0.18s ease, background 0.18s ease;
        border-radius: 6px;
        -webkit-tap-highlight-color: transparent;
        cursor: pointer;
        white-space: nowrap;
        height: 100%;
    }}

    .nav-item:hover {{
        color: rgba(226, 232, 240, 1) !important;
        background: rgba(255, 255, 255, 0.07) !important;
        text-decoration: none !important;
    }}

    .nav-icon {{
        font-size: 1.05rem;
        line-height: 1;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
    }}

    .nav-label {{
        font-size: 0.54rem;
        font-weight: 500;
        letter-spacing: 0.2px;
        font-family: 'Outfit', sans-serif;
        white-space: nowrap;
        line-height: 1;
        color: inherit;
    }}

    .nav-sep {{
        flex-shrink: 0;
        width: 1px;
        height: 24px;
        background: rgba(255, 255, 255, 0.08);
        align-self: center;
    }}

    /* Manage App: fixar dentro da barra inferior */
    [data-testid="stToolbar"],
    [data-testid="stAppToolbar"],
    [data-testid="stToolbarActions"] {{
        position: fixed !important;
        bottom: 0 !important;
        right: 0 !important;
        top: auto !important;
        height: 48px !important;
        width: 110px !important;
        z-index: 100000 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: flex-end !important;
        background: transparent !important;
        padding: 0 8px !important;
        opacity: 1 !important;
        transform: none !important;
    }}
    [data-testid="stStatusWidget"] {{
        opacity: 1 !important;
        transform: none !important;
    }}

    @media (max-width: 600px) {{
        .bottom-nav {{
            height: 44px;
        }}
        .nav-items {{
            width: calc(100% - 85px);
        }}
        .nav-item {{
            padding: 4px 2px;
        }}
        .nav-icon {{
            font-size: 0.95rem;
            height: 18px;
        }}
        .nav-label {{
            font-size: 0.5rem;
        }}
        .nav-sep {{
            height: 20px;
        }}
        [data-testid="stToolbar"],
        [data-testid="stAppToolbar"],
        [data-testid="stToolbarActions"] {{
            height: 44px !important;
            width: 85px !important;
        }}
    }}

    /* iPhone X+ safe area */
    @supports (padding-bottom: env(safe-area-inset-bottom)) {{
        .bottom-nav {{
            height: calc(48px + env(safe-area-inset-bottom));
            padding-bottom: env(safe-area-inset-bottom);
        }}
        .block-container {{
            padding-bottom: calc(64px + env(safe-area-inset-bottom)) !important;
        }}
        [data-testid="stToolbar"],
        [data-testid="stAppToolbar"],
        [data-testid="stToolbarActions"] {{
            height: calc(48px + env(safe-area-inset-bottom)) !important;
            padding-bottom: env(safe-area-inset-bottom) !important;
        }}
    }}
    </style>

<!-- Barra: ghost | Home | Reload | Gemini | Extras | Config | ghost -->
<nav class="bottom-nav">
<div class="nav-items">
<span class="nav-ghost" aria-hidden="true"></span>
<a href="./" target="_self" class="nav-item" title="Home">
<span class="nav-icon">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
<polyline points="9 22 9 12 15 12 15 22"></polyline>
</svg>
</span>
<span class="nav-label">Home</span>
</a>
<a href="#" onclick="event.preventDefault(); var p=encodeURIComponent(window.location.pathname); window.location.href='./?refresh=1&from='+p;" class="nav-item" title="Atualizar dados">
<span class="nav-icon">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<polyline points="23 4 23 10 17 10"></polyline>
<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
</svg>
</span>
<span class="nav-label">Reload</span>
</a>
<a href="Agente_IA" target="_self" class="nav-item" title="Agente IA – Gemini">
<span class="nav-icon">{grimmi_icon_html}</span>
<span class="nav-label">Gemini</span>
</a>
<a href="Easter_Eggs" target="_self" class="nav-item" title="Easter Eggs">
<span class="nav-icon">{logo_icon_html}</span>
<span class="nav-label">Extras</span>
</a>
<a href="Ferramentas" target="_self" class="nav-item" title="Configurações">
<span class="nav-icon">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<circle cx="12" cy="12" r="3"></circle>
<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
</svg>
</span>
<span class="nav-label">Config</span>
</a>
<span class="nav-ghost" aria-hidden="true"></span>
</div>
</nav>
    """, unsafe_allow_html=True)


def get_view_mode_css() -> str:
    """
    CSS para os cards de seleção de modo (Visão Mercado / Meu Dinheiro)
    com efeito glassmorphism, neon e animações de hover.
    """
    return """
<style>
    /* ===== VIEW MODE SELECTOR - NEON GLASS CARDS ===== */
    .view-mode-container {
        display: flex;
        gap: 16px;
        margin: 20px 0;
        flex-wrap: wrap;
    }

    .view-mode-card {
        flex: 1;
        min-width: 200px;
        max-width: 320px;
        background: rgba(15, 23, 42, 0.6);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;
        padding: 24px 28px;
        cursor: pointer;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
    }

    /* Glow layer behind card */
    .view-mode-card::before {
        content: '';
        position: absolute;
        top: -2px;
        left: -2px;
        right: -2px;
        bottom: -2px;
        border-radius: 22px;
        background: transparent;
        z-index: -1;
        transition: all 0.4s ease;
    }

    /* Inner shine effect */
    .view-mode-card::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 50%;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, transparent 100%);
        border-radius: 20px 20px 0 0;
        pointer-events: none;
    }

    /* Hover state */
    .view-mode-card:hover {
        transform: translateY(-4px) scale(1.02);
        border-color: rgba(255, 255, 255, 0.15);
        box-shadow:
            0 20px 40px rgba(0, 0, 0, 0.4),
            0 0 30px rgba(99, 102, 241, 0.1);
    }

    /* Active/Click effect */
    .view-mode-card:active {
        transform: translateY(-2px) scale(0.98);
        transition: all 0.1s ease;
    }

    /* ===== MARKET VIEW - CYAN NEON ===== */
    .view-mode-card.market {
        border-color: rgba(34, 211, 238, 0.15);
    }

    .view-mode-card.market:hover {
        border-color: rgba(34, 211, 238, 0.4);
        box-shadow:
            0 20px 40px rgba(0, 0, 0, 0.4),
            0 0 30px rgba(34, 211, 238, 0.15),
            inset 0 0 20px rgba(34, 211, 238, 0.03);
    }

    .view-mode-card.market.selected {
        border-color: rgba(34, 211, 238, 0.6);
        background: rgba(34, 211, 238, 0.08);
        box-shadow:
            0 0 20px rgba(34, 211, 238, 0.3),
            0 0 40px rgba(34, 211, 238, 0.15),
            0 0 60px rgba(34, 211, 238, 0.08),
            inset 0 0 30px rgba(34, 211, 238, 0.05);
    }

    .view-mode-card.market.selected::before {
        background: linear-gradient(135deg, rgba(34, 211, 238, 0.4) 0%, rgba(34, 211, 238, 0.1) 100%);
        filter: blur(20px);
        opacity: 0.5;
    }

    /* ===== MY MONEY VIEW - PURPLE/VIOLET NEON ===== */
    .view-mode-card.money {
        border-color: rgba(167, 139, 250, 0.15);
    }

    .view-mode-card.money:hover {
        border-color: rgba(167, 139, 250, 0.4);
        box-shadow:
            0 20px 40px rgba(0, 0, 0, 0.4),
            0 0 30px rgba(167, 139, 250, 0.15),
            inset 0 0 20px rgba(167, 139, 250, 0.03);
    }

    .view-mode-card.money.selected {
        border-color: rgba(167, 139, 250, 0.6);
        background: rgba(167, 139, 250, 0.08);
        box-shadow:
            0 0 20px rgba(167, 139, 250, 0.3),
            0 0 40px rgba(167, 139, 250, 0.15),
            0 0 60px rgba(167, 139, 250, 0.08),
            inset 0 0 30px rgba(167, 139, 250, 0.05);
    }

    .view-mode-card.money.selected::before {
        background: linear-gradient(135deg, rgba(167, 139, 250, 0.4) 0%, rgba(167, 139, 250, 0.1) 100%);
        filter: blur(20px);
        opacity: 0.5;
    }

    /* ===== CARD CONTENT ===== */
    .view-mode-icon {
        font-size: 2.2rem;
        margin-bottom: 12px;
        filter: drop-shadow(0 0 8px currentColor);
        transition: all 0.3s ease;
    }

    .view-mode-card.market .view-mode-icon {
        color: #22d3ee;
        text-shadow: 0 0 20px rgba(34, 211, 238, 0.5);
    }

    .view-mode-card.money .view-mode-icon {
        color: #a78bfa;
        text-shadow: 0 0 20px rgba(167, 139, 250, 0.5);
    }

    .view-mode-card:hover .view-mode-icon {
        transform: scale(1.1);
        filter: drop-shadow(0 0 12px currentColor);
    }

    .view-mode-title {
        font-size: 1.1rem;
        font-weight: 700;
        color: #f1f5f9;
        margin-bottom: 6px;
        letter-spacing: -0.3px;
    }

    .view-mode-card.market.selected .view-mode-title {
        color: #22d3ee;
        text-shadow: 0 0 10px rgba(34, 211, 238, 0.3);
    }

    .view-mode-card.money.selected .view-mode-title {
        color: #a78bfa;
        text-shadow: 0 0 10px rgba(167, 139, 250, 0.3);
    }

    .view-mode-desc {
        font-size: 0.8rem;
        color: #64748b;
        line-height: 1.4;
        margin: 0;
    }

    .view-mode-card.selected .view-mode-desc {
        color: #94a3b8;
    }

    /* Selection indicator */
    .view-mode-check {
        position: absolute;
        top: 16px;
        right: 16px;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.75rem;
        opacity: 0;
        transform: scale(0);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .view-mode-card.market .view-mode-check {
        background: rgba(34, 211, 238, 0.2);
        border: 1px solid rgba(34, 211, 238, 0.5);
        color: #22d3ee;
        box-shadow: 0 0 15px rgba(34, 211, 238, 0.3);
    }

    .view-mode-card.money .view-mode-check {
        background: rgba(167, 139, 250, 0.2);
        border: 1px solid rgba(167, 139, 250, 0.5);
        color: #a78bfa;
        box-shadow: 0 0 15px rgba(167, 139, 250, 0.3);
    }

    .view-mode-card.selected .view-mode-check {
        opacity: 1;
        transform: scale(1);
    }

    /* Pulse animation for selected state */
    @keyframes neon-pulse {
        0%, 100% {
            box-shadow:
                0 0 20px rgba(var(--neon-color), 0.3),
                0 0 40px rgba(var(--neon-color), 0.15);
        }
        50% {
            box-shadow:
                0 0 25px rgba(var(--neon-color), 0.4),
                0 0 50px rgba(var(--neon-color), 0.2);
        }
    }

    .view-mode-card.selected {
        animation: none; /* Subtle, can enable with: neon-pulse 2s ease-in-out infinite */
    }

    /* Mobile adjustments */
    @media (max-width: 640px) {
        .view-mode-container {
            flex-direction: column;
        }
        .view-mode-card {
            max-width: 100%;
        }
    }
</style>
"""


def render_view_mode_selector(current_mode: str) -> str:
    """
    Renderiza os cards de seleção de modo com efeito neon/glass.

    Args:
        current_mode: "market" ou "money"

    Returns:
        HTML string com os dois cards
    """
    market_selected = "selected" if current_mode == "market" else ""
    money_selected = "selected" if current_mode == "money" else ""

    return f"""
<div class="view-mode-container">
    <div class="view-mode-card market {market_selected}" onclick="
        document.querySelectorAll('.view-mode-card').forEach(c => c.classList.remove('selected'));
        this.classList.add('selected');
    " id="card-market">
        <div class="view-mode-check">✓</div>
        <div class="view-mode-icon">📈</div>
        <div class="view-mode-title">Visão Mercado</div>
        <p class="view-mode-desc">Câmbio de mercado do dia — ideal para comparar com benchmarks</p>
    </div>

    <div class="view-mode-card money {money_selected}" onclick="
        document.querySelectorAll('.view-mode-card').forEach(c => c.classList.remove('selected'));
        this.classList.add('selected');
    " id="card-money">
        <div class="view-mode-check">✓</div>
        <div class="view-mode-icon">💰</div>
        <div class="view-mode-title">Meu Custo</div>
        <p class="view-mode-desc">Seu preço médio de remessas — retorno real do capital em BRL</p>
    </div>
</div>
"""


def get_card_css() -> str:
    """
    Retorna o CSS padronizado para os cards de métricas.
    """
    return """
<style>
    /* ===== METRIC CARDS DO ZERO ===== */
    .metric-card {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 20px 24px;
        backdrop-filter: blur(12px);
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
        
        /* Flexbox para garantir altura consistente */
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        
        /* Altura mínima para padronização */
        min-height: 140px; 
        
        /* Espaçamento mobile */
        margin-bottom: 20px;
    }

    .metric-card:hover {
        transform: translateY(-2px);
        border-color: rgba(255, 255, 255, 0.15);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }

    /* Barra superior colorida */
    .metric-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        border-radius: 16px 16px 0 0;
    }

    .metric-card.positive::before {
        background: linear-gradient(90deg, #10b981 0%, #34d399 100%);
    }

    .metric-card.negative::before {
        background: linear-gradient(90deg, #ef4444 0%, #f87171 100%);
    }

    .metric-card.neutral::before {
        background: linear-gradient(90deg, #6366f1 0%, #818cf8 100%);
    }

    /* Labels e Valores */
    .metric-label {
        font-size: 0.75rem;
        font-weight: 500;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .metric-value {
        font-size: 1.75rem;
        font-weight: 700;
        line-height: 1.2;
        margin-bottom: 4px;
        color: #f1f5f9; /* Default whiteish */
    }

    /* Cores de valor opcionais */
    .metric-value.positive { color: #34d399; }
    .metric-value.negative { color: #f87171; }
    .metric-value.neutral { color: #f1f5f9; }

    /* Delta (Variação) */
    .metric-delta {
        font-size: 0.8rem;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .metric-delta.positive { color: #34d399; }
    .metric-delta.negative { color: #f87171; }

    /* Subtítulo */
    .metric-subtitle {
        font-size: 0.7rem;
        color: #64748b;
        margin-top: 8px; /* Espaço maior antes do subtítulo para empurrar pro fundo */
    }

    /* Ajustes Mobile */
    @media (max-width: 768px) {
        .metric-card { 
            padding: 16px; 
            min-height: auto; /* No mobile pode ser auto para economizar espaço se tiver pouco texto */
        }
        .metric-value { font-size: 1.4rem; }
    }
</style>
"""

def render_metric_card(label: str, value: str, delta: str = None, delta_positive: bool = True,
                       subtitle: str = None, icon: str = "📊") -> str:
    """
    Renderiza um card de métrica estilizado com HTML/CSS.
    """
    import html

    # Escape para evitar problemas de renderização
    label_safe = html.escape(str(label)) if label else ""
    value_safe = html.escape(str(value)) if value else ""
    subtitle_safe = html.escape(str(subtitle)) if subtitle else ""

    status_class = "positive" if delta_positive else "negative" if delta is not None else "neutral"

    # Delta HTML
    delta_html = ""
    if delta:
        delta_safe = html.escape(str(delta))
        arrow = "↑" if delta_positive else "↓"
        delta_html = f'<div class="metric-delta {status_class}">{arrow} {delta_safe}</div>'

    # Subtitle HTML
    subtitle_html = f'<div class="metric-subtitle">{subtitle_safe}</div>' if subtitle else ""

    return f"""<div class="metric-card {status_class}"><div><div class="metric-label">{icon} {label_safe}</div><div class="metric-value {status_class}">{value_safe}</div>{delta_html}</div>{subtitle_html}</div>"""

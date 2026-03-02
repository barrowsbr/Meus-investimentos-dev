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
    /* Espaço para conteúdo não ficar atrás do pill */
    .block-container {{
        padding-bottom: 96px !important;
    }}

    /* ===== FLOATING PILL NAV ===== */
    .bottom-nav {{
        position: fixed;
        bottom: 16px;
        left: 16px;
        width: max-content;
        min-width: 260px;
        max-width: calc(100vw - 140px); /* margem p/ Manage App não colidir */
        height: 60px;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        gap: 2px;
        background: rgba(8, 14, 28, 0.88);
        backdrop-filter: blur(28px);
        -webkit-backdrop-filter: blur(28px);
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 30px;
        z-index: 99999;
        padding: 0 10px;
        box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.55),
            0 0 0 0.5px rgba(255, 255, 255, 0.04) inset;
    }}

    .nav-item {{
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        padding: 6px 13px;
        text-decoration: none !important;
        color: rgba(100, 116, 139, 0.85) !important;
        transition: color 0.2s ease, background 0.2s ease;
        border-radius: 22px;
        -webkit-tap-highlight-color: transparent;
        cursor: pointer;
        white-space: nowrap;
    }}

    .nav-item:hover {{
        color: rgba(226, 232, 240, 1) !important;
        background: rgba(255, 255, 255, 0.07) !important;
        text-decoration: none !important;
    }}

    .nav-icon {{
        font-size: 1.2rem;
        line-height: 1;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
    }}

    .nav-label {{
        font-size: 0.58rem;
        font-weight: 500;
        letter-spacing: 0.2px;
        font-family: 'Outfit', sans-serif;
        white-space: nowrap;
        line-height: 1;
        color: inherit;
    }}

    /* Separador vertical entre grupos */
    .nav-sep {{
        width: 1px;
        height: 28px;
        background: rgba(255, 255, 255, 0.08);
        margin: 0 4px;
        flex-shrink: 0;
    }}

    /* Item IA: destaque roxo */
    .nav-item-ai {{
        color: rgba(139, 92, 246, 0.85) !important;
        background: rgba(99, 102, 241, 0.1) !important;
        border: 1px solid rgba(99, 102, 241, 0.18) !important;
    }}

    .nav-item-ai:hover {{
        color: rgba(167, 139, 250, 1) !important;
        background: rgba(99, 102, 241, 0.25) !important;
        border-color: rgba(99, 102, 241, 0.4) !important;
    }}

    /* Tentar reduzir visualmente o Manage App (sem saber selector exato) */
    [data-testid="stToolbar"],
    [data-testid="stStatusWidget"],
    [data-testid="stAppToolbar"],
    [data-testid="stToolbarActions"] {{
        opacity: 0.45 !important;
        transform: scale(0.78) !important;
        transform-origin: bottom right !important;
        transition: opacity 0.25s, transform 0.25s !important;
    }}
    [data-testid="stToolbar"]:hover,
    [data-testid="stStatusWidget"]:hover,
    [data-testid="stAppToolbar"]:hover,
    [data-testid="stToolbarActions"]:hover {{
        opacity: 1 !important;
        transform: scale(1) !important;
    }}

    @media (max-width: 600px) {{
        .bottom-nav {{
            height: 56px;
            bottom: 12px;
            left: 12px;
            max-width: calc(100vw - 110px);
            padding: 0 6px;
            gap: 0;
        }}
        .nav-item {{
            padding: 5px 9px;
        }}
        .nav-icon {{
            font-size: 1.1rem;
            height: 22px;
        }}
        .nav-label {{
            font-size: 0.53rem;
        }}
        .nav-sep {{
            height: 22px;
            margin: 0 2px;
        }}
    }}

    /* iPhone X+ safe area */
    @supports (padding-bottom: env(safe-area-inset-bottom)) {{
        .bottom-nav {{
            bottom: calc(16px + env(safe-area-inset-bottom));
            left: calc(16px + env(safe-area-inset-left));
        }}
        .block-container {{
            padding-bottom: calc(96px + env(safe-area-inset-bottom)) !important;
        }}
    }}
    </style>

    <nav class="bottom-nav">
        <a href="Ferramentas" target="_self" class="nav-item" title="Configurações">
            <span class="nav-icon">⚙️</span>
            <span class="nav-label">Config</span>
        </a>
        <a href="./?refresh=1" target="_self" class="nav-item" title="Atualizar dados">
            <span class="nav-icon">↻</span>
            <span class="nav-label">Reload</span>
        </a>
        <span class="nav-sep"></span>
        <a href="./" target="_self" class="nav-item" title="Home">
            <span class="nav-icon">🏠</span>
            <span class="nav-label">Home</span>
        </a>
        <a href="Easter_Eggs" target="_self" class="nav-item" title="Easter Eggs">
            <span class="nav-icon">{logo_icon_html}</span>
            <span class="nav-label">Extras</span>
        </a>
        <span class="nav-sep"></span>
        <a href="Agente_IA" target="_self" class="nav-item nav-item-ai" title="Agente IA – Grimmi">
            <span class="nav-icon">{grimmi_icon_html}</span>
            <span class="nav-label">Grimmi</span>
        </a>
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
        <div class="view-mode-title">Meu Dinheiro</div>
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

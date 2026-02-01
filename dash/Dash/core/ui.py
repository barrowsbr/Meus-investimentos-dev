import streamlit as st

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

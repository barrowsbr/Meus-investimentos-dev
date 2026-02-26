import streamlit as st
from core.auth import require_auth

# --- AUTH CHECK ---
require_auth()

import pandas as pd
from datetime import datetime

# Core imports
from core.data.loader import load_assets, load_proventos, load_fixed_income
from core.finance import calcular_carteira_fechada, summarize_fixed_income
from core.data.market import fetch_market_data
from core.logic import normalize_ticker
from core.ui import get_card_css, render_fab

# Agent imports
from core.agent import build_portfolio_context, fetch_news_for_tickers, GeminiAgent
from core.agent.news_fetcher import format_news_for_prompt

# ── Configuração da Página ─────────────────────────────────────────────────
st.set_page_config(
    page_title="Agente IA – Meus Investimentos",
    layout="wide",
    initial_sidebar_state="expanded",
    page_icon="🤖",
)

# ── CSS ───────────────────────────────────────────────────────────────────
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');

    html, body, [class*="css"] {
        font-family: 'Outfit', sans-serif;
        color: #e2e8f0;
    }

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

    /* ── Lote Cards (KPI glass) ── */
    .lote-card {
        background: rgba(30, 41, 59, 0.5);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 16px;
        padding: 20px 24px;
        text-align: center;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        transition: transform 0.2s, box-shadow 0.2s;
        height: 100%;
    }
    .lote-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 12px 40px rgba(0,0,0,0.4);
    }
    .lote-card .lc-label {
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #94a3b8;
        margin-bottom: 8px;
    }
    .lote-card .lc-value {
        font-size: 1.5rem;
        font-weight: 800;
        color: #ffffff;
        line-height: 1.2;
    }
    .lote-card .lc-sub {
        font-size: 0.8rem;
        color: #94a3b8;
        margin-top: 4px;
    }
    .lc-pos  { color: #34d399 !important; }
    .lc-neg  { color: #f87171 !important; }
    .lc-neu  { color: #60a5fa !important; }

    /* ── Tab Header ── */
    .tab-header {
        font-size: 1.3rem;
        font-weight: 700;
        color: #f1f5f9;
        border-bottom: 2px solid rgba(99,102,241,0.4);
        padding-bottom: 8px;
        margin: 24px 0 16px 0;
    }

    /* ── Glass Alerts ── */
    .glass-alert {
        border-radius: 12px;
        padding: 14px 18px;
        margin: 12px 0;
        font-size: 0.9rem;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border-left: 4px solid;
        line-height: 1.5;
    }
    .glass-info    { background: rgba(59,130,246,0.12); border-color: #3b82f6; color: #93c5fd; }
    .glass-warn    { background: rgba(245,158,11,0.12); border-color: #f59e0b; color: #fcd34d; }
    .glass-success { background: rgba(16,185,129,0.12); border-color: #10b981; color: #6ee7b7; }
    .glass-error   { background: rgba(239,68,68,0.12);  border-color: #ef4444; color: #fca5a5; }

    /* ── Chat ── */
    [data-testid="stChatMessage"] {
        background: rgba(30, 41, 59, 0.4);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 16px;
        padding: 16px !important;
        margin-bottom: 12px;
    }

    /* ── Sidebar ── */
    [data-testid="stSidebar"] {
        background: rgba(10,14,22,0.8) !important;
        backdrop-filter: blur(16px);
        border-right: 1px solid rgba(255,255,255,0.06);
    }

    /* Stagger animation para cards */
    .lote-card { animation: fadeUp 0.4s ease both; }
    @keyframes fadeUp {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: translateY(0); }
    }
</style>
""", unsafe_allow_html=True)

render_fab()


# ── Helpers ────────────────────────────────────────────────────────────────
def fmt_brl(v: float) -> str:
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def metric_card(label: str, value: str, sub: str = "", color_class: str = "lc-neu") -> str:
    sub_html = f'<div class="lc-sub">{sub}</div>' if sub else ""
    return f"""
    <div class="lote-card">
        <div class="lc-label">{label}</div>
        <div class="lc-value {color_class}">{value}</div>
        {sub_html}
    </div>
    """


# ── Inicialização do agente (session state) ────────────────────────────────
if "agent" not in st.session_state:
    st.session_state.agent = GeminiAgent()
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []  # [{"role": "user"|"assistant", "content": str}]
if "portfolio_context" not in st.session_state:
    st.session_state.portfolio_context = ""
if "news_context" not in st.session_state:
    st.session_state.news_context = ""
if "context_loaded" not in st.session_state:
    st.session_state.context_loaded = False


# ── Header ────────────────────────────────────────────────────────────────
st.markdown('<div class="tab-header">🤖 Agente IA de Investimentos</div>', unsafe_allow_html=True)
st.markdown(
    '<div class="glass-alert glass-info">Assistente inteligente alimentado pelo <strong>Google Gemini</strong>. '
    'Analisa seu portfólio em tempo real e busca notícias relevantes para seus ativos.</div>',
    unsafe_allow_html=True,
)

agent: GeminiAgent = st.session_state.agent


# ── Verificações de setup ──────────────────────────────────────────────────
if agent.missing_dependency():
    st.markdown(
        '<div class="glass-alert glass-error">📦 Dependência não instalada. Execute:<br>'
        '<code>pip install google-generativeai</code> e reinicie o app.</div>',
        unsafe_allow_html=True,
    )
    st.stop()

if agent.missing_key():
    st.markdown(
        '<div class="glass-alert glass-warn">🔑 Chave de API do Gemini não configurada. '
        'Digite sua chave abaixo para continuar.</div>',
        unsafe_allow_html=True,
    )

    with st.form("api_key_form", border=False):
        st.markdown('<div class="tab-header">🔑 Configurar Chave de API</div>', unsafe_allow_html=True)
        key_input = st.text_input(
            "Google Gemini API Key",
            type="password",
            placeholder="AIza...",
            help="Obtenha sua chave em https://aistudio.google.com/apikey",
        )
        col_btn, col_help = st.columns([1, 3])
        with col_btn:
            submitted = st.form_submit_button("✅ Salvar e continuar", use_container_width=True)
        with col_help:
            st.markdown(
                '<div class="glass-alert glass-info" style="margin:0">'
                'A chave fica salva apenas nesta sessão. Para persistir, '
                'adicione em <code>.streamlit/secrets.toml</code>.</div>',
                unsafe_allow_html=True,
            )
        if submitted and key_input.strip():
            st.session_state["gemini_api_key_input"] = key_input.strip()
            # Recria o agente com a nova chave
            st.session_state.agent = GeminiAgent()
            st.session_state.context_loaded = False
            st.rerun()

    with st.expander("Como configurar permanentemente"):
        st.code('# .streamlit/secrets.toml\nGEMINI_API_KEY = "AIza..."', language="toml")
        st.code("# Ou variável de ambiente\nexport GEMINI_API_KEY='AIza...'", language="bash")
    st.stop()


# ── Sidebar – controles ────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("### ⚙️ Configurações do Agente")
    st.divider()

    # ── Campo de chave de API na sidebar ──
    with st.expander("🔑 Chave de API Gemini", expanded=not agent.is_ready()):
        api_key_sidebar = st.text_input(
            "Gemini API Key",
            value=st.session_state.get("gemini_api_key_input", ""),
            type="password",
            placeholder="AIza...",
            key="sidebar_api_key",
            label_visibility="collapsed",
        )
        if st.button("Aplicar chave", use_container_width=True, key="apply_key_btn"):
            if api_key_sidebar.strip():
                st.session_state["gemini_api_key_input"] = api_key_sidebar.strip()
                st.session_state.agent = GeminiAgent()
                st.session_state.context_loaded = False
                st.rerun()
        st.caption("[Obter chave →](https://aistudio.google.com/apikey)")

    st.divider()

    fetch_news = st.toggle("📰 Buscar notícias", value=True, help="Busca notícias do Google News para seus tickers")
    max_tickers_news = st.slider("Tickers para notícias", 1, 10, 5)
    auto_analysis = st.toggle("🔍 Análise automática ao carregar", value=True)

    st.divider()

    if st.button("🔄 Recarregar portfólio", use_container_width=True):
        st.session_state.context_loaded = False
        st.session_state.portfolio_context = ""
        st.session_state.news_context = ""
        st.cache_data.clear()
        st.rerun()

    if st.button("🗑️ Limpar conversa", use_container_width=True):
        st.session_state.chat_history = []
        agent.clear_history()
        st.rerun()

    st.divider()
    modelo_ativo = agent.MODEL if agent.is_ready() else GeminiAgent._MODEL_CANDIDATES[0]
    st.caption(f"Modelo: `{modelo_ativo}`")
    st.caption(f"Histórico: {len(st.session_state.chat_history)} mensagens")


# ── Carregamento do contexto ──────────────────────────────────────────────
@st.cache_data(show_spinner=False, ttl=300)
def load_rv_summary():
    """Retorna DataFrame resumido de RV (posições abertas)."""
    try:
        df_assets = load_assets()
        if df_assets.empty:
            return pd.DataFrame()
        tickers = df_assets["ticker"].dropna().unique().tolist()
        prices = fetch_market_data(tickers)
        result = calcular_carteira_fechada(df_assets, prices)
        if isinstance(result, tuple):
            result = result[0]
        return result if isinstance(result, pd.DataFrame) else pd.DataFrame()
    except Exception:
        return pd.DataFrame()


@st.cache_data(show_spinner=False, ttl=300)
def load_rf_summary():
    try:
        df_rf = load_fixed_income()
        return df_rf if not df_rf.empty else pd.DataFrame()
    except Exception:
        return pd.DataFrame()


@st.cache_data(show_spinner=False, ttl=300)
def load_proventos_summary():
    try:
        df = load_proventos()
        return df if not df.empty else pd.DataFrame()
    except Exception:
        return pd.DataFrame()


if not st.session_state.context_loaded:
    with st.status("Carregando dados do portfólio...", expanded=False) as status:
        df_rv = load_rv_summary()
        status.update(label="Carregando renda fixa...")
        df_rf = load_rf_summary()
        status.update(label="Carregando proventos...")
        df_prov = load_proventos_summary()

        # Notícias
        news_data = {}
        if fetch_news and not df_rv.empty and "ticker" in df_rv.columns:
            status.update(label="Buscando notícias...")
            tickers = df_rv["ticker"].dropna().tolist()[:max_tickers_news]
            news_data = fetch_news_for_tickers(tickers, max_per_ticker=3, max_tickers=max_tickers_news)

        status.update(label="Construindo contexto para o Gemini...")
        st.session_state.portfolio_context = build_portfolio_context(
            df_rv=df_rv if not df_rv.empty else None,
            df_rf=df_rf if not df_rf.empty else None,
            df_proventos=df_prov if not df_prov.empty else None,
        )
        st.session_state.news_context = format_news_for_prompt(news_data) if news_data else ""
        st.session_state.context_loaded = True
        status.update(label="✅ Contexto pronto!", state="complete")

    # Análise automática
    if auto_analysis and not st.session_state.chat_history:
        with st.chat_message("assistant", avatar="🤖"):
            placeholder = st.empty()
            full_response = ""
            for chunk in agent.get_quick_analysis(
                st.session_state.portfolio_context,
                st.session_state.news_context,
            ):
                full_response += chunk
                placeholder.markdown(full_response + "▌")
            placeholder.markdown(full_response)
        st.session_state.chat_history.append({"role": "assistant", "content": full_response})


# ── KPI Cards ─────────────────────────────────────────────────────────────
df_rv_disp = load_rv_summary()
df_rf_disp = load_rf_summary()

col1, col2, col3, col4 = st.columns(4)

total_rv = df_rv_disp["valor_atual"].sum() if not df_rv_disp.empty and "valor_atual" in df_rv_disp.columns else 0
total_rf = 0
if not df_rf_disp.empty:
    if "valor_atual" in df_rf_disp.columns:
        total_rf = df_rf_disp["valor_atual"].sum()
    elif "saldo" in df_rf_disp.columns:
        total_rf = df_rf_disp["saldo"].sum()

total_port = total_rv + total_rf

resultado_rv = df_rv_disp["resultado"].sum() if not df_rv_disp.empty and "resultado" in df_rv_disp.columns else 0
color_res = "lc-pos" if resultado_rv >= 0 else "lc-neg"

n_tickers = df_rv_disp["ticker"].nunique() if not df_rv_disp.empty and "ticker" in df_rv_disp.columns else 0
n_news    = sum(len(v) for v in ([] if not st.session_state.news_context else [st.session_state.news_context.split("###")]))

with col1:
    st.markdown(metric_card("Portfólio Total", fmt_brl(total_port), "RV + RF"), unsafe_allow_html=True)
with col2:
    st.markdown(metric_card("Renda Variável", fmt_brl(total_rv), f"{n_tickers} ativos"), unsafe_allow_html=True)
with col3:
    st.markdown(metric_card("Renda Fixa", fmt_brl(total_rf)), unsafe_allow_html=True)
with col4:
    sinal = "+" if resultado_rv >= 0 else ""
    st.markdown(metric_card("Resultado RV", f"{sinal}{fmt_brl(resultado_rv)}", "desde aporte", color_res), unsafe_allow_html=True)

st.markdown("<br>", unsafe_allow_html=True)


# ── Histórico do chat ─────────────────────────────────────────────────────
for msg in st.session_state.chat_history:
    avatar = "👤" if msg["role"] == "user" else "🤖"
    with st.chat_message(msg["role"], avatar=avatar):
        st.markdown(msg["content"])


# ── Input do usuário ──────────────────────────────────────────────────────
SUGESTOES = [
    "Quais são meus maiores riscos hoje?",
    "Analise minha concentração setorial",
    "Como as notícias de hoje impactam minha carteira?",
    "Devo rebalancear alguma posição?",
    "Quais ativos tiveram pior desempenho?",
]

if not st.session_state.chat_history:
    st.markdown('<div class="tab-header">💡 Sugestões</div>', unsafe_allow_html=True)
    cols = st.columns(len(SUGESTOES))
    for i, (col, sug) in enumerate(zip(cols, SUGESTOES)):
        with col:
            if st.button(sug, key=f"sug_{i}", use_container_width=True):
                st.session_state._quick_prompt = sug
                st.rerun()

# Pega prompt rápido se clicou em sugestão
user_input = st.chat_input("Pergunte sobre seu portfólio, estratégia, notícias...")
if hasattr(st.session_state, "_quick_prompt"):
    user_input = st.session_state._quick_prompt
    del st.session_state._quick_prompt

if user_input:
    # Exibe mensagem do usuário
    st.session_state.chat_history.append({"role": "user", "content": user_input})
    with st.chat_message("user", avatar="👤"):
        st.markdown(user_input)

    # Contexto apenas na primeira mensagem (o agente já tem o histórico)
    is_first = len(st.session_state.chat_history) == 1
    portfolio_ctx = st.session_state.portfolio_context if is_first else ""
    news_ctx = st.session_state.news_context if is_first else ""

    # Resposta do agente com streaming
    with st.chat_message("assistant", avatar="🤖"):
        placeholder = st.empty()
        full_response = ""
        for chunk in agent.chat(user_input, portfolio_ctx, news_ctx, stream=True):
            full_response += chunk
            placeholder.markdown(full_response + "▌")
        placeholder.markdown(full_response)

    st.session_state.chat_history.append({"role": "assistant", "content": full_response})
    st.rerun()


# ── Expander: notícias brutas ──────────────────────────────────────────────
if st.session_state.news_context:
    with st.expander("📰 Ver notícias carregadas"):
        st.markdown(st.session_state.news_context)

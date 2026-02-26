import hashlib
from datetime import datetime

import streamlit as st
from core.auth import require_auth

# --- AUTH CHECK ---
require_auth()

import pandas as pd

# Core imports
from core.data.loader import load_assets, load_proventos, load_fixed_income, load_fixed_income_manual
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
        0%   { background-position: 0% 50%; }
        50%  { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
    }

    /* ── Welcome Hero ── */
    .hero-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 64px 24px 32px;
        text-align: center;
    }
    .hero-icon {
        font-size: 4rem;
        margin-bottom: 16px;
        filter: drop-shadow(0 0 24px rgba(99,102,241,0.6));
        animation: pulse 3s ease-in-out infinite;
    }
    @keyframes pulse {
        0%, 100% { transform: scale(1);   filter: drop-shadow(0 0 24px rgba(99,102,241,0.5)); }
        50%       { transform: scale(1.08); filter: drop-shadow(0 0 40px rgba(99,102,241,0.9)); }
    }
    .hero-title {
        font-size: 2rem;
        font-weight: 800;
        color: #f1f5f9;
        margin: 0 0 8px;
    }
    .hero-sub {
        font-size: 1rem;
        color: #94a3b8;
        max-width: 480px;
        line-height: 1.6;
    }

    /* ── Suggestion chips ── */
    .chips-wrap {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: center;
        margin-top: 32px;
        padding: 0 24px;
    }

    /* ── Chat messages ── */
    [data-testid="stChatMessage"] {
        background: rgba(30, 41, 59, 0.45);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 18px;
        padding: 18px !important;
        margin-bottom: 10px;
    }

    /* ── Chat input ── */
    [data-testid="stChatInput"] textarea {
        background: rgba(15, 23, 42, 0.7) !important;
        border: 1px solid rgba(99,102,241,0.35) !important;
        border-radius: 14px !important;
        color: #f1f5f9 !important;
        font-family: 'Outfit', sans-serif !important;
    }
    [data-testid="stChatInput"] textarea:focus {
        border-color: rgba(99,102,241,0.7) !important;
        box-shadow: 0 0 0 2px rgba(99,102,241,0.2) !important;
    }

    /* ── Sidebar ── */
    [data-testid="stSidebar"] {
        background: rgba(10,14,22,0.88) !important;
        backdrop-filter: blur(16px);
        border-right: 1px solid rgba(255,255,255,0.06);
    }

    /* ── Glass Alerts ── */
    .glass-alert {
        border-radius: 12px;
        padding: 14px 18px;
        margin: 12px 0;
        font-size: 0.9rem;
        backdrop-filter: blur(8px);
        border-left: 4px solid;
        line-height: 1.5;
    }
    .glass-info  { background: rgba(59,130,246,0.12); border-color: #3b82f6; color: #93c5fd; }
    .glass-warn  { background: rgba(245,158,11,0.12);  border-color: #f59e0b; color: #fcd34d; }
    .glass-error { background: rgba(239,68,68,0.12);   border-color: #ef4444; color: #fca5a5; }

    /* ── Status/spinner ── */
    [data-testid="stStatus"] {
        background: rgba(15,23,42,0.7) !important;
        border: 1px solid rgba(255,255,255,0.07) !important;
        border-radius: 12px !important;
    }
</style>
""", unsafe_allow_html=True)

render_fab()


# ── Session State ──────────────────────────────────────────────────────────
if "agent" not in st.session_state:
    st.session_state.agent = GeminiAgent()
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []
if "portfolio_context" not in st.session_state:
    st.session_state.portfolio_context = ""
if "news_context" not in st.session_state:
    st.session_state.news_context = ""
if "ctx_hash" not in st.session_state:
    st.session_state.ctx_hash = ""
if "ctx_updated_at" not in st.session_state:
    st.session_state.ctx_updated_at = ""
if "load_errors" not in st.session_state:
    st.session_state.load_errors = []

agent: GeminiAgent = st.session_state.agent


# ── Verificações de setup ──────────────────────────────────────────────────
if agent.missing_dependency():
    st.markdown(
        '<div class="glass-alert glass-error">📦 Pacote não instalado. Execute:<br>'
        '<code>pip install google-genai</code> e reinicie o app.</div>',
        unsafe_allow_html=True,
    )
    st.stop()

if agent.missing_key():
    st.markdown("""
    <div class="hero-wrap">
        <div class="hero-icon">🔑</div>
        <div class="hero-title">Configure sua chave de API</div>
        <div class="hero-sub">Você precisa de uma chave do Google Gemini para usar o assistente.</div>
    </div>
    """, unsafe_allow_html=True)

    with st.form("api_key_form", border=False):
        col_k, col_b = st.columns([3, 1])
        with col_k:
            key_input = st.text_input(
                "Google Gemini API Key",
                type="password",
                placeholder="AIza...",
                label_visibility="collapsed",
            )
        with col_b:
            submitted = st.form_submit_button("Salvar", use_container_width=True)

        st.markdown(
            '<div class="glass-alert glass-info" style="margin-top:8px">'
            'Obtenha sua chave grátis em '
            '<a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com/apikey</a>. '
            'A chave fica salva apenas nesta sessão. Para persistir, adicione em '
            '<code>.streamlit/secrets.toml</code>.</div>',
            unsafe_allow_html=True,
        )

        if submitted and key_input.strip():
            st.session_state["gemini_api_key_input"] = key_input.strip()
            st.session_state.agent = GeminiAgent()
            st.session_state.context_loaded = False
            st.rerun()
    st.stop()


# ── Sidebar – controles ────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("### ⚙️ Agente IA")
    st.divider()

    with st.expander("🔑 Chave de API", expanded=True):
        api_key_sidebar = st.text_input(
            "Gemini API Key",
            value=st.session_state.get("gemini_api_key_input", ""),
            type="password",
            placeholder="AIza...",
            key="sidebar_api_key",
            label_visibility="collapsed",
        )
        if st.button("Aplicar", use_container_width=True, key="apply_key_btn"):
            if api_key_sidebar.strip():
                st.session_state["gemini_api_key_input"] = api_key_sidebar.strip()
                st.session_state.agent = GeminiAgent()
                st.session_state.context_loaded = False
                st.rerun()
        st.caption("[Obter chave →](https://aistudio.google.com/apikey)")

    st.divider()

    fetch_news = st.toggle("📰 Incluir notícias", value=True, help="Busca notícias do Google News para os seus tickers")
    max_tickers_news = st.slider("Tickers para notícias", 1, 10, 5)

    st.divider()

    if st.button("🔄 Forçar atualização", use_container_width=True):
        st.session_state.ctx_hash = ""   # força re-injeção mesmo sem mudança
        st.session_state.portfolio_context = ""
        st.session_state.news_context = ""
        st.session_state.load_errors = []
        st.cache_data.clear()
        st.rerun()

    if st.button("🗑️ Limpar conversa", use_container_width=True):
        st.session_state.chat_history = []
        agent.clear_history()
        st.rerun()

    st.divider()
    st.caption(f"Modelo: `{agent.MODEL}`")
    if agent.is_ready():
        st.caption(f"SDK: `{agent.sdk_label()}`")
    st.caption(f"Histórico: {len(st.session_state.chat_history)} mensagens")
    if st.session_state.ctx_updated_at:
        st.caption(f"📊 GSheets: `{st.session_state.ctx_updated_at}`")

    if st.session_state.portfolio_context:
        with st.expander("🔍 Ver contexto enviado ao Gemini", expanded=False):
            st.code(st.session_state.portfolio_context, language="markdown")
    if st.session_state.load_errors:
        with st.expander("⚠️ Avisos de carregamento", expanded=False):
            for err in st.session_state.load_errors:
                st.warning(err)


# ── Funções de carregamento do GSheets (cache 5 min) ───────────────────────

@st.cache_data(show_spinner=False, ttl=300)
def _load_rv() -> tuple[pd.DataFrame, str]:
    """Transações brutas de RV da aba 'meus_ativos'. Retorna (df, erro)."""
    try:
        df = load_assets()
        if df.empty:
            return pd.DataFrame(), "Aba 'meus_ativos' vazia."
        return df, ""
    except Exception as e:
        return pd.DataFrame(), str(e)


@st.cache_data(show_spinner=False, ttl=300)
def _load_rf_atual() -> tuple[pd.DataFrame, str]:
    """
    Posições atuais de RF (aba 'fixa_aberta') — o que você TEM agora.
    Colunas: Ticker, Atual, Data, Moeda, Tipo
    """
    try:
        df = load_fixed_income_manual()
        if df.empty:
            return pd.DataFrame(), "Aba 'fixa_aberta' vazia."
        return df, ""
    except Exception as e:
        return pd.DataFrame(), str(e)


@st.cache_data(show_spinner=False, ttl=300)
def _load_rf_hist() -> tuple[pd.DataFrame, str]:
    """Transações brutas de RF da aba 'renda_fixa'. Retorna (df, erro)."""
    try:
        df = load_fixed_income()
        if df.empty:
            return pd.DataFrame(), "Aba 'renda_fixa' vazia."
        return df, ""
    except Exception as e:
        return pd.DataFrame(), str(e)


@st.cache_data(show_spinner=False, ttl=300)
def _load_proventos() -> tuple[pd.DataFrame, str]:
    """Proventos históricos. Retorna (df, erro)."""
    try:
        df = load_proventos()
        return (df, "") if not df.empty else (pd.DataFrame(), "Aba 'meus_proventos' vazia.")
    except Exception as e:
        return pd.DataFrame(), str(e)


@st.cache_data(show_spinner=False, ttl=600)
def _fetch_news_cached(tickers: tuple, max_per_ticker: int, max_tickers: int) -> dict:
    """Notícias do Google News (cache 10 min)."""
    try:
        return fetch_news_for_tickers(list(tickers), max_per_ticker=max_per_ticker, max_tickers=max_tickers)
    except Exception:
        return {}


# ── Auto-sincronização com GSheets a cada page render ──────────────────────
# As funções acima são cacheadas (ttl=300), então não batem no GSheets a
# cada rerun — apenas quando o cache expira (5 min) ou o botão força reload.
# O hash detecta se o conteúdo mudou e só re-injeta no agente se mudou.

def _sync_context() -> None:
    """
    Carrega dados brutos do GSheets, monta contexto e injeta no agente SE mudou.
    Executado a cada page render (rápido quando cache ativo, ~0ms).
    Bate no GSheets só quando o cache expira (5 min) ou botão força reload.

    Fontes (dados brutos, sem cálculos):
      RV        → meus_ativos   (transações de renda variável)
      RF atual  → fixa_aberta   (posições que você tem agora)
      RF hist   → renda_fixa    (histórico de transações RF)
      Proventos → meus_proventos
    """
    df_rv,       err_rv  = _load_rv()
    df_rf_atual, err_rfa = _load_rf_atual()
    df_rf_hist,  err_rfh = _load_rf_hist()
    df_prov,     err_pv  = _load_proventos()

    portfolio_ctx = build_portfolio_context(
        df_rv=df_rv               if not df_rv.empty       else None,
        df_rf_atual=df_rf_atual   if not df_rf_atual.empty else None,
        df_rf_hist=df_rf_hist     if not df_rf_hist.empty  else None,
        df_proventos=df_prov      if not df_prov.empty     else None,
    )

    new_hash = hashlib.md5(portfolio_ctx.encode()).hexdigest()

    if st.session_state.ctx_hash != new_hash:
        # Dados mudaram (ou 1ª carga) → busca notícias e re-injeta no agente
        news_data: dict = {}
        if fetch_news and not df_rv.empty and "ticker" in df_rv.columns:
            # Tickers únicos da aba meus_ativos (dados brutos têm 1 linha/transação)
            tickers = tuple(
                df_rv["ticker"].dropna().unique().tolist()[:max_tickers_news]
            )
            news_data = _fetch_news_cached(tickers, max_per_ticker=3, max_tickers=max_tickers_news)
        news_ctx = format_news_for_prompt(news_data) if news_data else ""

        agent.set_context(
            portfolio_ctx,
            news_ctx,
            chat_history=st.session_state.chat_history,
        )

        st.session_state.ctx_hash         = new_hash
        st.session_state.portfolio_context = portfolio_ctx
        st.session_state.news_context      = news_ctx
        st.session_state.ctx_updated_at    = datetime.now().strftime("%H:%M:%S")
        st.session_state.load_errors       = [
            e for e in [err_rv, err_rfa, err_rfh, err_pv] if e
        ]


# Executa sincronização (instantânea quando cache ativo, ~2s na 1ª vez)
_sync_context()


# ── Tela vazia — welcome state ─────────────────────────────────────────────
SUGESTOES = [
    "Quais são meus maiores riscos?",
    "Como está minha alocação setorial?",
    "Quais ativos tiveram pior desempenho?",
    "As notícias de hoje impactam minha carteira?",
    "Devo rebalancear alguma posição?",
]

if not st.session_state.chat_history:
    st.markdown("""
    <div class="hero-wrap">
        <div class="hero-icon">🤖</div>
        <div class="hero-title">Olá, vamos analisar sua carteira?</div>
        <div class="hero-sub">Pergunte qualquer coisa sobre seu portfólio. Eu leio seus dados e busco notícias automaticamente antes de responder.</div>
    </div>
    """, unsafe_allow_html=True)

    # Chips de sugestão
    st.markdown('<div class="chips-wrap">', unsafe_allow_html=True)
    cols = st.columns(len(SUGESTOES))
    for i, (col, sug) in enumerate(zip(cols, SUGESTOES)):
        with col:
            if st.button(sug, key=f"sug_{i}", use_container_width=True):
                st.session_state._quick_prompt = sug
                st.rerun()
    st.markdown('</div>', unsafe_allow_html=True)


# ── Histórico do chat ──────────────────────────────────────────────────────
for msg in st.session_state.chat_history:
    avatar = "👤" if msg["role"] == "user" else "🤖"
    with st.chat_message(msg["role"], avatar=avatar):
        st.markdown(msg["content"])

# ── Notícias brutas (colapsado) ───────────────────────────────────────────
if st.session_state.news_context and st.session_state.chat_history:
    with st.expander("📰 Ver notícias carregadas"):
        st.markdown(st.session_state.news_context)


# ── Input ──────────────────────────────────────────────────────────────────
user_input = st.chat_input("Pergunte sobre seu portfólio...")

# Sugestão clicada tem prioridade
if hasattr(st.session_state, "_quick_prompt"):
    user_input = st.session_state._quick_prompt
    del st.session_state._quick_prompt

if user_input:
    st.session_state.chat_history.append({"role": "user", "content": user_input})
    with st.chat_message("user", avatar="👤"):
        st.markdown(user_input)

    # Contexto já está no system_instruction (injetado por _sync_context() acima)
    with st.chat_message("assistant", avatar="🤖"):
        placeholder = st.empty()
        full_response = ""
        for chunk in agent.chat(user_input, stream=True):
            full_response += chunk
            placeholder.markdown(full_response + "▌")
        placeholder.markdown(full_response)

    st.session_state.chat_history.append({"role": "assistant", "content": full_response})
    st.rerun()

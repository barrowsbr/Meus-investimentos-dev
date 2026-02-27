import hashlib
from datetime import datetime

import streamlit as st
import base64
from pathlib import Path
from core.auth import require_auth

# --- AUTH CHECK ---
require_auth()

import pandas as pd

# Core imports
from core.data.loader import load_assets, load_proventos, load_fixed_income, load_fixed_income_manual
from core.ui import get_card_css, render_fab

# Agent imports
from core.agent import build_portfolio_context, GeminiAgent
from core.agent.context_builder import build_market_snapshot
from core.computed import get_portfolio_snapshot

# ── Configuração da Página ─────────────────────────────────────────────────
st.set_page_config(
    page_title="Agente IA – Meus Investimentos",
    layout="wide",
    initial_sidebar_state="expanded",
    page_icon="🤖",
)

# ── Load Grimmi Logo ───────────────────────────────────────────────────────
def _load_grimmi_b64():
    try:
        p = Path(__file__).parent.parent / "assets" / "logos" / "grimmi.png"
        with open(p, "rb") as f:
            return base64.b64encode(f.read()).decode()
    except:
        return None

_GRIMMI_B64 = _load_grimmi_b64()

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
        padding: 48px 24px 24px;
        text-align: center;
    }
    .hero-icon {
        width: 80px;
        height: 80px;
        margin-bottom: 14px;
        filter: drop-shadow(0 0 24px rgba(99,102,241,0.6));
        animation: pulse 3s ease-in-out infinite;
        border-radius: 50%;
    }
    @keyframes pulse {
        0%, 100% { transform: scale(1);   filter: drop-shadow(0 0 24px rgba(99,102,241,0.5)); }
        50%       { transform: scale(1.08); filter: drop-shadow(0 0 40px rgba(99,102,241,0.9)); }
    }
    .hero-title {
        font-size: 1.8rem;
        font-weight: 800;
        color: #f1f5f9;
        margin: 0 0 8px;
    }
    .hero-sub {
        font-size: 0.95rem;
        color: #94a3b8;
        max-width: 480px;
        line-height: 1.6;
    }

    /* ── Suggestion chips – horizontal row (via st.columns) ── */
    /* Faz o bloco horizontal scrollar sem quebrar linha */
    [data-testid="stHorizontalBlock"] {
        overflow-x: auto !important;
        flex-wrap: nowrap !important;
        scrollbar-width: none;
        padding-bottom: 2px;
    }
    [data-testid="stHorizontalBlock"]::-webkit-scrollbar { display: none; }

    /* Cada coluna do bloco: tamanho mínimo pelo conteúdo, não cresce */
    [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {
        min-width: fit-content !important;
        flex: 0 0 auto !important;
    }

    /* Botões dos chips: sem quebra de texto */
    [data-testid="stHorizontalBlock"] button {
        white-space: nowrap !important;
        border-radius: 20px !important;
        font-size: 0.82rem !important;
        padding: 6px 14px !important;
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

    /* ── Eleva o chat input acima dos FABs horizontais ── */
    /* FABs: bottom 20px + height 42px = 62px → usar 76px com folga */
    [data-testid="stBottom"] {
        bottom: 76px !important;
    }

    /* Garante que o conteúdo não fique atrás do chat input elevado */
    [data-testid="stAppViewBlockContainer"],
    .block-container {
        padding-bottom: 160px !important;
    }

    /* ── Mobile ── */
    @media (max-width: 768px) {
        .hero-wrap   { padding: 28px 16px 18px; }
        .hero-icon   { font-size: 2.6rem; }
        .hero-title  { font-size: 1.3rem; }
        .hero-sub    { font-size: 0.86rem; }
        [data-testid="stChatMessage"] {
            padding: 12px !important;
            border-radius: 12px;
            margin-bottom: 6px;
        }
        [data-testid="stChatInput"] textarea { font-size: 0.95rem !important; }
        .block-container {
            padding-left: 12px !important;
            padding-right: 12px !important;
            padding-top: 16px !important;
        }
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
    st.markdown(
        '<div class="glass-alert glass-error">🔑 Chave de API não configurada. '
        'Edite <code>_HARDCODED_KEY</code> em <code>core/agent/gemini_client.py</code> '
        'ou adicione <code>GEMINI_API_KEY</code> no <code>.streamlit/secrets.toml</code>.</div>',
        unsafe_allow_html=True,
    )
    st.stop()


# ── Sidebar – controles ────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("### ⚙️ Agente IA")
    st.divider()

    # ── Toggle: Busca na internet ──────────────────────────────────────────
    web_search_on = st.toggle(
        "🌐 Busca na internet",
        value=agent.enable_web_search,
        help="Permite que o Gemini consulte o Google Search em tempo real para responder perguntas de mercado, cotações e notícias.",
    )
    if web_search_on != agent.enable_web_search:
        agent.enable_web_search = web_search_on
        # Força rebuild do contexto para recriar o config com/sem tool
        st.session_state.ctx_hash = ""
        st.rerun()

    st.divider()

    if st.button("🔄 Forçar atualização", use_container_width=True):
        st.session_state.ctx_hash = ""
        st.session_state.portfolio_context = ""
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
    if agent.is_ready():
        status = agent.web_search_status()
        icon = "🟢" if status == "ativa" else "🔴" if status == "desativada" else "🟡"
        st.caption(f"Web search: {icon} `{status}`")

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
    try:
        df = load_assets()
        return (df, "") if not df.empty else (pd.DataFrame(), "Aba 'meus_ativos' vazia.")
    except Exception as e:
        return pd.DataFrame(), str(e)


@st.cache_data(show_spinner=False, ttl=300)
def _load_rf_atual() -> tuple[pd.DataFrame, str]:
    try:
        df = load_fixed_income_manual()
        return (df, "") if not df.empty else (pd.DataFrame(), "Aba 'fixa_aberta' vazia.")
    except Exception as e:
        return pd.DataFrame(), str(e)


@st.cache_data(show_spinner=False, ttl=300)
def _load_rf_hist() -> tuple[pd.DataFrame, str]:
    try:
        df = load_fixed_income()
        return (df, "") if not df.empty else (pd.DataFrame(), "Aba 'renda_fixa' vazia.")
    except Exception as e:
        return pd.DataFrame(), str(e)


@st.cache_data(show_spinner=False, ttl=300)
def _load_proventos() -> tuple[pd.DataFrame, str]:
    try:
        df = load_proventos()
        return (df, "") if not df.empty else (pd.DataFrame(), "Aba 'meus_proventos' vazia.")
    except Exception as e:
        return pd.DataFrame(), str(e)


# ── Auto-sincronização com GSheets a cada page render ──────────────────────

def _sync_context() -> None:
    df_rv,       err_rv  = _load_rv()
    df_rf_atual, err_rfa = _load_rf_atual()
    df_rf_hist,  err_rfh = _load_rf_hist()
    df_prov,     err_pv  = _load_proventos()

    # Dados brutos do Google Sheets (histórico completo de transações)
    portfolio_ctx = build_portfolio_context(
        df_rv=df_rv               if not df_rv.empty       else None,
        df_rf_atual=df_rf_atual   if not df_rf_atual.empty else None,
        df_rf_hist=df_rf_hist     if not df_rf_hist.empty  else None,
        df_proventos=df_prov      if not df_prov.empty     else None,
    )

    # Snapshot de mercado — calculado pelas mesmas funções do dashboard
    # (garante que o agente veja os mesmos números que aparecem nas outras páginas)
    try:
        snapshot = get_portfolio_snapshot()
        snapshot_ctx = build_market_snapshot(snapshot)
        snapshot_errors = snapshot.get('errors', [])
    except Exception as exc:
        snapshot_ctx = ""
        snapshot_errors = [f"Snapshot de mercado indisponível: {exc}"]

    full_ctx = portfolio_ctx
    if snapshot_ctx:
        full_ctx = full_ctx + "\n\n---\n\n" + snapshot_ctx

    new_hash = hashlib.md5(full_ctx.encode()).hexdigest()

    if st.session_state.ctx_hash != new_hash:
        agent.set_context(
            full_ctx,
            chat_history=st.session_state.chat_history,
        )
        st.session_state.ctx_hash          = new_hash
        st.session_state.portfolio_context = full_ctx
        st.session_state.ctx_updated_at    = datetime.now().strftime("%H:%M:%S")
        st.session_state.load_errors       = [
            e for e in [err_rv, err_rfa, err_rfh, err_pv] + snapshot_errors if e
        ]


_sync_context()


# ── Sugestões ──────────────────────────────────────────────────────────────
SUGESTOES = [
    "Quais são meus maiores riscos?",
    "Como está minha alocação setorial?",
    "Quais ativos tiveram pior desempenho?",
    "Devo rebalancear alguma posição?",
    "Resuma meu portfólio em 5 pontos.",
]


# ── Tela inicial (sem histórico) ───────────────────────────────────────────
if not st.session_state.chat_history:
    _grimmi_hero = f'<img src="data:image/png;base64,{_GRIMMI_B64}" class="hero-icon" />' if _GRIMMI_B64 else '<div class="hero-icon">🤖</div>'
    st.markdown(f"""
    <div class="hero-wrap">
        {_grimmi_hero}
        <div class="hero-title">Olá, vamos analisar sua carteira?</div>
        <div class="hero-sub">Pergunte qualquer coisa sobre seu portfólio. Eu leio seus dados automaticamente antes de responder.</div>
    </div>
    """, unsafe_allow_html=True)

    # Chips horizontais – st.button nativo (sem reload de página)
    cols = st.columns(len(SUGESTOES))
    for i, (col, sug) in enumerate(zip(cols, SUGESTOES)):
        with col:
            if st.button(sug, key=f"sug_{i}", use_container_width=True):
                st.session_state._quick_prompt = sug
                st.rerun()


# ── Histórico do chat ──────────────────────────────────────────────────────
for msg in st.session_state.chat_history:
    avatar = "👤" if msg["role"] == "user" else "🤖"
    with st.chat_message(msg["role"], avatar=avatar):
        st.markdown(msg["content"])


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

    with st.chat_message("assistant", avatar="🤖"):
        placeholder = st.empty()
        full_response = ""
        for chunk in agent.chat(user_input, stream=True):
            full_response += chunk
            placeholder.markdown(full_response + "▌")
        placeholder.markdown(full_response)

    st.session_state.chat_history.append({"role": "assistant", "content": full_response})
    st.rerun()

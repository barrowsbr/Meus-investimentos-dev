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
    initial_sidebar_state="collapsed",
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
        animation: bgShift 15s ease infinite;
    }
    @keyframes bgShift {
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
        padding: 48px 24px 20px;
        text-align: center;
    }
    .hero-icon {
        width: 84px;
        height: 84px;
        margin-bottom: 16px;
        filter: drop-shadow(0 0 28px rgba(99,102,241,0.65));
        animation: aiPulse 3s ease-in-out infinite;
        border-radius: 50%;
    }
    @keyframes aiPulse {
        0%, 100% { transform: scale(1);    filter: drop-shadow(0 0 24px rgba(99,102,241,0.5)); }
        50%       { transform: scale(1.07); filter: drop-shadow(0 0 44px rgba(99,102,241,0.95)); }
    }
    .hero-title {
        font-size: 1.9rem;
        font-weight: 800;
        color: #f1f5f9;
        margin: 0 0 8px;
        letter-spacing: 0.5px;
    }
    .hero-sub {
        font-size: 0.93rem;
        color: #94a3b8;
        max-width: 460px;
        line-height: 1.65;
        margin-bottom: 14px;
    }
    /* Pill de status do contexto */
    .ctx-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(99,102,241,0.25);
        border-radius: 20px;
        padding: 4px 12px;
        font-size: 0.75rem;
        color: #94a3b8;
        margin-bottom: 8px;
        backdrop-filter: blur(8px);
    }
    .ctx-pill .dot {
        width: 7px; height: 7px;
        border-radius: 50%;
        animation: pulseDot 1.8s ease-in-out infinite;
    }
    .ctx-pill .dot.ready   { background: #34d399; }
    .ctx-pill .dot.loading { background: #f59e0b; }
    @keyframes pulseDot {
        0%, 100% { opacity: 1;    transform: scale(1); }
        50%       { opacity: 0.35; transform: scale(0.65); }
    }

    /* ── Suggestion chips ── */
    [data-testid="stHorizontalBlock"] {
        overflow-x: auto !important;
        flex-wrap: nowrap !important;
        scrollbar-width: none;
        padding-bottom: 4px;
        gap: 8px !important;
    }
    [data-testid="stHorizontalBlock"]::-webkit-scrollbar { display: none; }
    [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {
        min-width: fit-content !important;
        flex: 0 0 auto !important;
    }
    [data-testid="stHorizontalBlock"] button {
        white-space: nowrap !important;
        border-radius: 20px !important;
        font-size: 0.81rem !important;
        font-weight: 500 !important;
        padding: 5px 14px !important;
        border: 1px solid rgba(99,102,241,0.25) !important;
        background: rgba(15,23,42,0.5) !important;
        color: #cbd5e1 !important;
        transition: all 0.25s ease !important;
    }
    [data-testid="stHorizontalBlock"] button:hover {
        background: rgba(99,102,241,0.15) !important;
        border-color: rgba(99,102,241,0.5) !important;
        color: #e2e8f0 !important;
        transform: translateY(-1px);
    }
    /* Primeiro chip (Análise rápida) — destaque índigo */
    [data-testid="stHorizontalBlock"] > [data-testid="stColumn"]:first-child button {
        background: rgba(99,102,241,0.2) !important;
        border-color: rgba(99,102,241,0.45) !important;
        color: #a5b4fc !important;
    }

    /* ── Chat messages ── */
    [data-testid="stChatMessage"] {
        background: rgba(15, 23, 42, 0.5);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 20px;
        padding: 20px !important;
        margin-bottom: 10px;
        transition: box-shadow 0.3s ease;
    }
    /* Mensagem do usuário: leve acento à direita */
    [data-testid="stChatMessage"]:has([data-testid="chatAvatarIcon-user"]) {
        background: rgba(99, 102, 241, 0.08);
        border-color: rgba(99,102,241,0.15);
    }
    /* Mensagem do assistente: acento verde suave */
    [data-testid="stChatMessage"]:has([data-testid="chatAvatarIcon-assistant"]) {
        background: rgba(15, 23, 42, 0.55);
        border-color: rgba(52,211,153,0.1);
    }

    /* ── Chat input ── */
    [data-testid="stChatInput"] textarea {
        background: rgba(15, 23, 42, 0.75) !important;
        border: 1px solid rgba(99,102,241,0.3) !important;
        border-radius: 16px !important;
        color: #f1f5f9 !important;
        font-family: 'Outfit', sans-serif !important;
        font-size: 0.95rem !important;
    }
    [data-testid="stChatInput"] textarea:focus {
        border-color: rgba(99,102,241,0.65) !important;
        box-shadow: 0 0 0 2px rgba(99,102,241,0.15) !important;
    }

    /* ── Sidebar ── */
    [data-testid="stSidebar"] {
        background: rgba(8, 12, 20, 0.92) !important;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-right: 1px solid rgba(255,255,255,0.05);
    }

    /* Card de status na sidebar */
    .sidebar-status-card {
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 12px;
        padding: 12px 14px;
        font-size: 0.78rem;
        color: #64748b;
        line-height: 1.8;
    }
    .sidebar-status-card .row { display: flex; justify-content: space-between; align-items: center; }
    .sidebar-status-card .val { color: #94a3b8; font-weight: 500; }
    .sidebar-status-card .val.green { color: #34d399; }
    .sidebar-status-card .val.yellow { color: #f59e0b; }
    .sidebar-status-card .val.red { color: #f87171; }

    /* ── Glass Alerts ── */
    .glass-alert {
        border-radius: 12px;
        padding: 13px 16px;
        margin: 10px 0;
        font-size: 0.88rem;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border-left: 3px solid;
        line-height: 1.55;
    }
    .glass-info  { background: rgba(59,130,246,0.1);  border-color: #3b82f6; color: #93c5fd; }
    .glass-warn  { background: rgba(245,158,11,0.1);   border-color: #f59e0b; color: #fcd34d; }
    .glass-error { background: rgba(239,68,68,0.1);    border-color: #ef4444; color: #fca5a5; }
    .glass-ok    { background: rgba(52,211,153,0.1);   border-color: #34d399; color: #6ee7b7; }

    /* ── Status/spinner ── */
    [data-testid="stStatus"] {
        background: rgba(15,23,42,0.7) !important;
        border: 1px solid rgba(255,255,255,0.07) !important;
        border-radius: 12px !important;
    }

    /* ── Eleva o chat input acima dos FABs ── */
    [data-testid="stBottom"] { bottom: 76px !important; }
    [data-testid="stAppViewBlockContainer"], .block-container {
        padding-bottom: 160px !important;
    }

    /* ── Expanders ── */
    [data-testid="stExpander"] {
        background: rgba(10, 18, 35, 0.4) !important;
        backdrop-filter: blur(18px) !important;
        border: 1px solid rgba(99,102,241,0.08) !important;
        border-radius: 12px !important;
    }

    /* ── Mobile ── */
    @media (max-width: 768px) {
        .hero-wrap  { padding: 24px 14px 14px; }
        .hero-icon  { width: 64px; height: 64px; }
        .hero-title { font-size: 1.35rem; }
        .hero-sub   { font-size: 0.85rem; }
        [data-testid="stChatMessage"] { padding: 14px !important; border-radius: 14px; margin-bottom: 8px; }
        [data-testid="stChatInput"] textarea { font-size: 0.95rem !important; }
        .block-container { padding-left: 10px !important; padding-right: 10px !important; padding-top: 12px !important; }
    }
</style>
""", unsafe_allow_html=True)

render_fab()

_MAX_HISTORY_WARN = 40  # mensagens (20 turnos user+assistant)

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

if not agent.is_ready() and getattr(agent, '_init_error', ''):
    st.error(f"❌ Falha ao inicializar o agente: {agent._init_error}")
    st.stop()


# ── Sidebar – controles ────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("### ⚙️ Agente IA")
    st.divider()

    # ── Seletor de modelo ──────────────────────────────────────────────────
    available_models = agent.get_available_models()
    if available_models and agent.is_ready():
        current_idx = 0
        if agent.MODEL in available_models:
            current_idx = available_models.index(agent.MODEL)

        selected_model = st.selectbox(
            "🧠 Modelo",
            options=available_models,
            index=current_idx,
            help="Escolha o modelo Gemini. Modelos menores (flash) consomem menos cota.",
        )

        if selected_model != agent.MODEL:
            with st.spinner(f"Trocando para {selected_model}..."):
                success = agent.switch_model(selected_model)
            if success:
                st.session_state.chat_history = []
                st.session_state.ctx_hash = ""  # Força re-sync do contexto
                st.toast(f"✅ Modelo trocado para **{selected_model}**")
                st.rerun()
            else:
                st.toast(f"❌ Falha ao trocar para {selected_model}", icon="⚠️")

    st.divider()

    # ── Toggle: Busca na internet ──────────────────────────────────────────
    web_search_on = st.toggle(
        "🌐 Busca na internet",
        value=agent.enable_web_search,
        help="Permite que o Gemini consulte o Google Search em tempo real para responder perguntas de mercado, cotações e notícias.",
    )
    if web_search_on != agent.enable_web_search:
        # update_web_search() recria só o config de tools — sem reinjetar contexto
        agent.update_web_search(web_search_on)
        st.rerun()

    st.divider()

    if st.button("🔄 Forçar atualização", use_container_width=True):
        st.session_state.ctx_hash = ""
        st.session_state.portfolio_context = ""
        st.session_state.load_errors = []
        st.session_state.pop("_ctx_last_sync", None)  # bypassa o fast-path
        st.cache_data.clear()
        st.rerun()

    if st.button("⚡ Análise rápida", use_container_width=True):
        st.session_state._quick_prompt = "Análise completa do meu portfólio"
        st.rerun()

    if st.button("🗑️ Limpar conversa", use_container_width=True):
        st.session_state.chat_history = []
        agent.clear_history()
        st.rerun()

    st.divider()
    # ── Card de status consolidado ────────────────────────────────────────
    _ws = agent.web_search_status() if agent.is_ready() else "—"
    _ws_cls = "green" if _ws == "ativa" else ("red" if _ws == "desativada" else "yellow")
    _hist_n = len(st.session_state.chat_history)
    _hist_cls = "red" if _hist_n >= _MAX_HISTORY_WARN else ("yellow" if _hist_n >= 20 else "green")
    _gsheets_val = st.session_state.ctx_updated_at or "—"
    _sdk_val = agent.sdk_label() if agent.is_ready() else "não inicializado"
    st.markdown(f"""
    <div class="sidebar-status-card">
        <div class="row"><span>Modelo</span><span class="val">{agent.MODEL}</span></div>
        <div class="row"><span>SDK</span><span class="val" style="font-size:0.72rem">{_sdk_val}</span></div>
        <div class="row"><span>Web search</span><span class="val {_ws_cls}">{_ws}</span></div>
        <div class="row"><span>Histórico</span><span class="val {_hist_cls}">{_hist_n} msgs</span></div>
        <div class="row"><span>Dados em</span><span class="val">{_gsheets_val}</span></div>
    </div>
    """, unsafe_allow_html=True)

    if st.session_state.portfolio_context:
        with st.expander("🔍 Ver contexto enviado ao Gemini", expanded=False):
            ctx_text = st.session_state.portfolio_context
            ctx_chars = len(ctx_text)
            st.caption(f"📏 Tamanho: ~{ctx_chars:,} caracteres (~{ctx_chars // 4:,} tokens)")
            st.code(ctx_text, language="markdown")
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
#
# Fast-path: a reconstrução do contexto é cara (carrega DFs + monta string grande).
# Evitamos fazê-la em todo rerender (ex: pós-mensagem do chat) usando um timestamp
# de último sync. O threshold de 110s é ligeiramente inferior ao TTL do snapshot
# (120s em computed.py), garantindo que dados novos sempre chegam ao agente.

_CTX_REBUILD_INTERVAL = 110  # segundos


def _sync_context() -> None:
    now = datetime.now()
    last_sync = st.session_state.get("_ctx_last_sync")

    # Fast-path: pula o rebuild se o contexto já existe e ainda é recente.
    # "Forçar atualização" limpa ctx_hash, bypassando esta guarda.
    if (
        last_sync is not None
        and (now - last_sync).total_seconds() < _CTX_REBUILD_INTERVAL
        and st.session_state.ctx_hash
    ):
        return

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

    st.session_state["_ctx_last_sync"] = now


_sync_context()


# ── Sugestões ──────────────────────────────────────────────────────────────
SUGESTOES = [
    "Análise completa do meu portfólio",
    "Quais são meus maiores riscos?",
    "Como está minha alocação setorial?",
    "Quais ativos performaram melhor/pior hoje?",
    "Devo rebalancear alguma posição?",
    "Quanto recebi de dividendos este ano?",
]


# ── Tela inicial (sem histórico) ───────────────────────────────────────────
if not st.session_state.chat_history:
    _grimmi_hero = f'<img src="data:image/png;base64,{_GRIMMI_B64}" class="hero-icon" />' if _GRIMMI_B64 else '<div style="font-size:3rem;margin-bottom:14px">🤖</div>'
    _ctx_ts = st.session_state.ctx_updated_at
    if _ctx_ts:
        _pill = f'<div class="ctx-pill"><span class="dot ready"></span>Carteira carregada às {_ctx_ts}</div>'
    else:
        _pill = '<div class="ctx-pill"><span class="dot loading"></span>Carregando dados...</div>'
    st.markdown(f"""
    <div class="hero-wrap">
        {_grimmi_hero}
        <div class="hero-title">Olá, vamos analisar sua carteira?</div>
        <div class="hero-sub">Pergunte qualquer coisa sobre seu portfólio. Leio seus dados automaticamente antes de cada resposta.</div>
        {_pill}
    </div>
    """, unsafe_allow_html=True)

    # Chips horizontais – st.button nativo (sem reload de página)
    cols = st.columns(len(SUGESTOES))
    for i, (col, sug) in enumerate(zip(cols, SUGESTOES)):
        with col:
            if st.button(sug, key=f"sug_{i}", use_container_width=True):
                st.session_state._quick_prompt = sug
                st.rerun()


# ── Aviso de histórico longo ───────────────────────────────────────────────
if len(st.session_state.chat_history) >= _MAX_HISTORY_WARN:
    st.markdown(
        f'<div class="glass-alert glass-warn">⚠️ Histórico com '
        f'<strong>{len(st.session_state.chat_history)} mensagens</strong> — '
        'históricos longos consomem mais tokens e podem degradar as respostas. '
        'Use <strong>Limpar conversa</strong> no menu lateral ao mudar de assunto.</div>',
        unsafe_allow_html=True,
    )

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

import streamlit as st
from core.auth import require_auth

# --- AUTH CHECK ---
require_auth()

import pandas as pd

# Core imports
from core.data.loader import load_assets, load_proventos, load_fixed_income
from core.finance import calcular_carteira_fechada, summarize_fixed_income
from core.data.market import fetch_market_data
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
if "context_loaded" not in st.session_state:
    st.session_state.context_loaded = False
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

    if st.button("🔄 Recarregar portfólio", use_container_width=True):
        st.session_state.context_loaded = False
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

    if st.session_state.context_loaded and st.session_state.portfolio_context:
        with st.expander("🔍 Ver contexto enviado ao Gemini", expanded=False):
            st.code(st.session_state.portfolio_context, language="markdown")
    elif st.session_state.load_errors:
        st.error("Erros ao carregar portfólio:\n" + "\n".join(st.session_state.load_errors))


# ── Helpers para carregar contexto (lazy) ──────────────────────────────────
@st.cache_data(show_spinner=False, ttl=300)
def _load_rv() -> tuple[pd.DataFrame, str]:
    """
    Carrega posições de RV do Google Sheets, processa via FIFO e enriquece
    com preços atuais do Yahoo Finance.
    Retorna (DataFrame, erro_str).
    """
    try:
        df_assets = load_assets()
        if df_assets.empty:
            return pd.DataFrame(), "Nenhum ativo encontrado na aba 'meus_ativos'."

        # FIFO → posições abertas (função só aceita df)
        result    = calcular_carteira_fechada(df_assets)
        positions = result[0] if isinstance(result, tuple) else result
        if positions.empty:
            return pd.DataFrame(), "Nenhuma posição aberta calculada."

        # Cotações via Yahoo Finance
        tickers      = positions["Ticker"].dropna().tolist()
        price_result = fetch_market_data(tickers)
        prices, changes = price_result if isinstance(price_result, tuple) else (price_result, {})

        rows = []
        for _, row in positions.iterrows():
            tkr   = row["Ticker"]
            qtd   = float(row.get("Qtd", 0))
            pm    = float(row.get("PM_Origem", 0))
            moeda = str(row.get("Moeda", "BRL"))
            setor = str(row.get("Setor", "—"))

            preco_atual   = float(prices.get(tkr, pm))  # fallback: PM
            valor_atual   = qtd * preco_atual
            custo         = qtd * pm
            resultado     = valor_atual - custo
            resultado_pct = (resultado / custo * 100) if custo else 0.0
            variacao_dia  = float(changes.get(tkr, 0.0))

            rows.append({
                "ticker": tkr, "setor": setor, "moeda": moeda,
                "quantidade": qtd, "preco_medio": pm,
                "preco_atual": preco_atual, "valor_atual": valor_atual,
                "resultado": resultado, "resultado_pct": resultado_pct,
                "variacao_dia": variacao_dia,
            })

        return pd.DataFrame(rows), ""
    except Exception as e:
        return pd.DataFrame(), str(e)


@st.cache_data(show_spinner=False, ttl=300)
def _load_rf() -> tuple[pd.DataFrame, str]:
    """Carrega renda fixa do Google Sheets e resume via summarize_fixed_income()."""
    try:
        df_raw = load_fixed_income()
        if df_raw.empty:
            return pd.DataFrame(), "Nenhum dado em 'renda_fixa'."
        df_rf = summarize_fixed_income(df_raw)
        if df_rf.empty:
            return pd.DataFrame(), "summarize_fixed_income retornou vazio."
        df_rf = df_rf.rename(columns={
            "Ticker": "ticker",
            "Atual":  "valor_atual",
            "Rent. %": "taxa",
            "Data":   "vencimento",
        })
        return df_rf, ""
    except Exception as e:
        return pd.DataFrame(), str(e)


@st.cache_data(show_spinner=False, ttl=300)
def _load_proventos() -> tuple[pd.DataFrame, str]:
    try:
        df = load_proventos()
        return (df, "") if not df.empty else (pd.DataFrame(), "Nenhum provento encontrado.")
    except Exception as e:
        return pd.DataFrame(), str(e)


def _ensure_context_loaded():
    """
    Carrega dados do Google Sheets e injeta no system_instruction do agente.
    Executado apenas uma vez por sessão (lazy, na primeira pergunta).
    """
    if st.session_state.context_loaded:
        return

    erros: list[str] = []

    with st.status("Lendo seu portfólio do Google Sheets...", expanded=False) as status:

        status.update(label="📊 Carregando renda variável...")
        df_rv, err_rv = _load_rv()
        if err_rv:
            erros.append(f"RV: {err_rv}")

        status.update(label="💰 Carregando renda fixa...")
        df_rf, err_rf = _load_rf()
        if err_rf:
            erros.append(f"RF: {err_rf}")

        status.update(label="💸 Carregando proventos...")
        df_prov, err_pv = _load_proventos()
        if err_pv:
            erros.append(f"Proventos: {err_pv}")

        news_data = {}
        if fetch_news and not df_rv.empty and "ticker" in df_rv.columns:
            status.update(label="📰 Buscando notícias dos seus ativos...")
            tickers   = df_rv["ticker"].dropna().tolist()[:max_tickers_news]
            news_data = fetch_news_for_tickers(tickers, max_per_ticker=3, max_tickers=max_tickers_news)

        status.update(label="🧠 Montando contexto para o Gemini...")
        portfolio_ctx = build_portfolio_context(
            df_rv=df_rv       if not df_rv.empty   else None,
            df_rf=df_rf       if not df_rf.empty   else None,
            df_proventos=df_prov if not df_prov.empty else None,
        )
        news_ctx = format_news_for_prompt(news_data) if news_data else ""

        # Injeta no system_instruction do agente (NÃO na mensagem do usuário)
        agent.set_context(portfolio_ctx, news_ctx)

        st.session_state.portfolio_context = portfolio_ctx
        st.session_state.news_context      = news_ctx
        st.session_state.context_loaded    = True
        st.session_state.load_errors       = erros

        label = "✅ Portfólio carregado!" if not erros else f"⚠️ Carregado com {len(erros)} aviso(s)"
        status.update(label=label, state="complete" if not erros else "error")


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
    # Mostra a mensagem do usuário imediatamente
    st.session_state.chat_history.append({"role": "user", "content": user_input})
    with st.chat_message("user", avatar="👤"):
        st.markdown(user_input)

    # Carrega dados do GSheets e injeta no system_instruction (lazy, só na 1ª vez)
    _ensure_context_loaded()

    # Erros de carregamento
    for err in st.session_state.get("load_errors", []):
        st.warning(f"⚠️ {err}")

    # Resposta em streaming — contexto já está no system_instruction do agente
    with st.chat_message("assistant", avatar="🤖"):
        placeholder = st.empty()
        full_response = ""
        for chunk in agent.chat(user_input, stream=True):
            full_response += chunk
            placeholder.markdown(full_response + "▌")
        placeholder.markdown(full_response)

    st.session_state.chat_history.append({"role": "assistant", "content": full_response})
    st.rerun()

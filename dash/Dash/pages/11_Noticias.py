"""
11_Noticias.py
==============
Feed de notícias do mercado e do portfólio.
Fontes: Google News RSS + Yahoo Finance.
"""

from __future__ import annotations

import html
import time
from datetime import datetime, timezone

import streamlit as st
import pandas as pd

from core.auth import require_auth

require_auth()

from core.data.loader import load_assets
from core.data.market import fetch_market_data
from core.agent.news_fetcher import (
    fetch_news_combined,
    _GOOGLE_NEWS_RSS,
    _fetch_rss,
    _parse_items,
    time_ago,
    _parse_rss_date,
)
from core.ui import render_fab

# ── Configuração ───────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Notícias – Meus Investimentos",
    layout="wide",
    initial_sidebar_state="expanded",
    page_icon="📰",
)

# ── CSS ────────────────────────────────────────────────────────────────────
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
    animation: gradientBG 15s ease infinite;
}
@keyframes gradientBG {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}

/* ── Page header ── */
.news-page-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 20px 0 4px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    margin-bottom: 20px;
}
.news-page-icon {
    font-size: 2rem;
    filter: drop-shadow(0 0 14px rgba(6,182,212,0.7));
    animation: iconPulse 3s ease-in-out infinite;
}
@keyframes iconPulse {
    0%, 100% { filter: drop-shadow(0 0 10px rgba(6,182,212,0.5)); }
    50%       { filter: drop-shadow(0 0 24px rgba(6,182,212,0.9)); }
}
.news-page-title {
    font-size: 1.7rem;
    font-weight: 800;
    color: #f1f5f9;
    letter-spacing: 1px;
    margin: 0;
}
.news-page-sub {
    font-size: 0.78rem;
    color: #475569;
    margin-top: 3px;
    letter-spacing: 0.5px;
}

/* ── Performers bar ── */
.perf-label {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 2.5px;
    color: #334155;
    text-transform: uppercase;
    margin-bottom: 10px;
}
.perf-row {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 6px;
    scrollbar-width: none;
    flex-wrap: nowrap;
    -webkit-overflow-scrolling: touch;
}
.perf-row::-webkit-scrollbar { display: none; }

.perf-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 24px;
    white-space: nowrap;
    font-size: 0.82rem;
    font-family: 'Outfit', sans-serif;
    cursor: default;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    flex-shrink: 0;
}
.perf-chip:hover {
    transform: translateY(-2px);
}
.perf-chip.up {
    background: rgba(52, 211, 153, 0.1);
    border: 1px solid rgba(52, 211, 153, 0.3);
}
.perf-chip.down {
    background: rgba(248, 113, 113, 0.1);
    border: 1px solid rgba(248, 113, 113, 0.3);
}
.perf-chip.neutral {
    background: rgba(100, 116, 139, 0.1);
    border: 1px solid rgba(100, 116, 139, 0.2);
}
.perf-ticker {
    font-weight: 700;
    color: #f1f5f9;
    font-size: 0.83rem;
}
.perf-pct { font-weight: 600; font-size: 0.82rem; }
.perf-pct.up   { color: #34d399; }
.perf-pct.down { color: #f87171; }
.perf-sep {
    width: 1px;
    min-height: 30px;
    background: rgba(255,255,255,0.1);
    flex-shrink: 0;
    align-self: center;
    margin: 0 2px;
}
.perf-section {
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 18px;
    padding: 16px 20px 12px;
    margin-bottom: 20px;
}

/* ── Ticker pills filter ── */
.filter-section {
    margin-bottom: 20px;
}
.filter-label {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 2px;
    color: #334155;
    text-transform: uppercase;
    margin-bottom: 10px;
}

/* ── News grid ── */
.news-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 14px;
    margin-bottom: 28px;
}
.news-count-label {
    font-size: 0.75rem;
    color: #334155;
    margin-bottom: 14px;
    letter-spacing: 0.5px;
}

/* ── News card ── */
.news-card {
    background: rgba(15, 23, 42, 0.55);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.07);
    border-left: 3px solid rgba(6, 182, 212, 0.45);
    border-radius: 16px;
    padding: 16px;
    text-decoration: none !important;
    color: inherit !important;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    position: relative;
    overflow: hidden;
}
.news-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(6,182,212,0.04) 0%, transparent 60%);
    opacity: 0;
    transition: opacity 0.25s ease;
    pointer-events: none;
    border-radius: 16px;
}
.news-card:hover {
    transform: translateY(-3px);
    background: rgba(15, 23, 42, 0.75);
    border-left-color: #06b6d4;
    box-shadow: 0 12px 32px -8px rgba(6, 182, 212, 0.2);
}
.news-card:hover::before { opacity: 1; }

.news-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}
.news-source {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    background: rgba(6, 182, 212, 0.1);
    border: 1px solid rgba(6, 182, 212, 0.22);
    color: #22d3ee;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.4px;
    max-width: 160px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.news-time {
    color: #334155;
    font-size: 0.72rem;
    white-space: nowrap;
    flex-shrink: 0;
}
.news-headline {
    font-size: 0.88rem;
    font-weight: 600;
    color: #e2e8f0;
    line-height: 1.48;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
.news-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: auto;
}
.news-ticker-tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 8px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    color: #64748b;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 1px;
}
.news-read-more {
    color: #22d3ee;
    font-size: 0.72rem;
    opacity: 0;
    transition: opacity 0.2s ease;
    font-weight: 600;
}
.news-card:hover .news-read-more { opacity: 1; }

/* ── Ticker section header ── */
.ticker-section-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 0 6px;
    margin-top: 8px;
}
.ticker-section-name {
    font-size: 0.95rem;
    font-weight: 700;
    color: #f1f5f9;
    letter-spacing: 1px;
}
.ticker-section-count {
    font-size: 0.7rem;
    color: #475569;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.07);
    padding: 2px 8px;
    border-radius: 10px;
}
.ticker-divider {
    flex: 1;
    height: 1px;
    background: linear-gradient(to right, rgba(255,255,255,0.07), transparent);
}

/* ── Empty / loading ── */
.news-empty {
    text-align: center;
    padding: 56px 24px;
    color: #334155;
}
.news-empty-icon { font-size: 2.8rem; margin-bottom: 14px; }
.news-empty-text { font-size: 0.9rem; line-height: 1.6; }

.skeleton-card {
    background: rgba(15, 23, 42, 0.4);
    border: 1px solid rgba(255,255,255,0.05);
    border-left: 3px solid rgba(6, 182, 212, 0.15);
    border-radius: 16px;
    padding: 16px;
    animation: skeletonPulse 1.6s ease-in-out infinite;
}
.skeleton-line {
    height: 12px;
    border-radius: 6px;
    background: rgba(255,255,255,0.07);
    margin-bottom: 10px;
}
@keyframes skeletonPulse {
    0%, 100% { opacity: 0.4; }
    50%       { opacity: 0.8; }
}

/* ── Sidebar ── */
[data-testid="stSidebar"] {
    background: rgba(10,14,22,0.88) !important;
    backdrop-filter: blur(16px);
    border-right: 1px solid rgba(255,255,255,0.06);
}
[data-testid="stSidebar"] [data-testid="stMarkdownContainer"] p {
    color: #94a3b8;
    font-size: 0.85rem;
}

/* ── Mobile ── */
@media (max-width: 768px) {
    .news-grid {
        grid-template-columns: 1fr;
        gap: 10px;
    }
    .news-page-title { font-size: 1.3rem; }
    .news-page-icon  { font-size: 1.6rem; }
    .perf-chip { padding: 7px 13px; }
    .perf-section { padding: 12px 14px 10px; }
    .news-card { padding: 14px; }
}
</style>
""", unsafe_allow_html=True)

render_fab()


# ── Session State ──────────────────────────────────────────────────────────
if "noticias_selected" not in st.session_state:
    st.session_state.noticias_selected = []
if "noticias_include_market" not in st.session_state:
    st.session_state.noticias_include_market = True


# ── Funções cacheadas ──────────────────────────────────────────────────────

@st.cache_data(show_spinner=False, ttl=300)
def _load_portfolio_tickers() -> list[str]:
    try:
        df = load_assets()
        if df.empty:
            return []
        tickers = df["ticker"].dropna().unique().tolist()
        return sorted([t for t in tickers if isinstance(t, str) and len(t) >= 4])
    except Exception:
        return []


@st.cache_data(show_spinner=False, ttl=180)
def _get_performers(tickers: tuple) -> list[dict]:
    """Retorna lista ordenada de desempenho do dia."""
    if not tickers:
        return []
    try:
        map_prices, map_changes = fetch_market_data(list(tickers))
    except Exception:
        return []
    result = []
    for t in tickers:
        price = map_prices.get(t, 0.0)
        change = map_changes.get(t, 0.0)
        prev = price - change
        if prev > 0 and price > 0:
            pct = (change / prev) * 100
            result.append({"ticker": t, "pct": pct, "change": change, "price": price})
    return sorted(result, key=lambda x: x["pct"], reverse=True)


@st.cache_data(show_spinner=False, ttl=300)
def _get_news(tickers: tuple, include_market: bool) -> dict[str, list[dict]]:
    """Busca notícias (Google News + Yahoo Finance) para os tickers."""
    news: dict[str, list[dict]] = {}
    for t in tickers[:8]:
        news[t] = fetch_news_combined(t, max_items=6)
        time.sleep(0.25)
    if include_market:
        url = _GOOGLE_NEWS_RSS.format(query="bolsa+brasil+ibovespa+mercado")
        root = _fetch_rss(url)
        news["📈 Mercado"] = _parse_items(root, 6) if root else []
    return news


# ── Sidebar ────────────────────────────────────────────────────────────────
all_tickers = _load_portfolio_tickers()

with st.sidebar:
    st.markdown("### 📰 Notícias")
    st.divider()

    # Seleção de tickers
    selected = st.multiselect(
        "Filtrar por ticker",
        options=all_tickers,
        default=st.session_state.noticias_selected or (all_tickers[:6] if all_tickers else []),
        placeholder="Selecione os tickers...",
        label_visibility="collapsed",
    )
    st.session_state.noticias_selected = selected

    col_a, col_b = st.columns(2)
    with col_a:
        if st.button("Todos", use_container_width=True):
            st.session_state.noticias_selected = all_tickers
            st.rerun()
    with col_b:
        if st.button("Limpar", use_container_width=True):
            st.session_state.noticias_selected = []
            st.rerun()

    st.divider()
    include_market = st.toggle(
        "Incluir mercado geral",
        value=st.session_state.noticias_include_market,
    )
    st.session_state.noticias_include_market = include_market

    st.divider()
    if st.button("🔄 Atualizar", use_container_width=True):
        _get_news.clear()
        _get_performers.clear()
        st.rerun()

    st.divider()
    if all_tickers:
        st.caption(f"{len(all_tickers)} tickers no portfólio")
    else:
        st.caption("Nenhum ticker carregado")
    st.caption(f"Atualizado às {datetime.now().strftime('%H:%M:%S')}")


# ── Tickers efetivos ───────────────────────────────────────────────────────
tickers_eff = selected if selected else (all_tickers[:6] if all_tickers else [])

# ── Cabeçalho ─────────────────────────────────────────────────────────────
st.markdown("""
<div class="news-page-header">
    <div class="news-page-icon">📰</div>
    <div>
        <div class="news-page-title">Notícias do Mercado</div>
        <div class="news-page-sub">Google News · Yahoo Finance · Atualização automática</div>
    </div>
</div>
""", unsafe_allow_html=True)


# ── Seção de Desempenho do Dia ─────────────────────────────────────────────
def _render_performers(perf: list[dict]) -> None:
    tops = [p for p in perf if p["pct"] > 0]
    bots = [p for p in perf if p["pct"] < 0]

    if not tops and not bots:
        return

    chips = ""

    for p in tops[:5]:
        t = p["ticker"].replace(".SA", "").replace("-USD", "").replace("-BRL", "")
        chips += (
            f'<div class="perf-chip up">'
            f'<span class="perf-ticker">{t}</span>'
            f'<span class="perf-pct up">+{p["pct"]:.2f}%</span>'
            f'</div>'
        )

    if tops and bots:
        chips += '<div class="perf-sep"></div>'

    for p in reversed(bots[-5:]):
        t = p["ticker"].replace(".SA", "").replace("-USD", "").replace("-BRL", "")
        chips += (
            f'<div class="perf-chip down">'
            f'<span class="perf-ticker">{t}</span>'
            f'<span class="perf-pct down">{p["pct"]:.2f}%</span>'
            f'</div>'
        )

    st.markdown(f"""
    <div class="perf-section">
        <div class="perf-label">📊 Desempenho hoje</div>
        <div class="perf-row">{chips}</div>
    </div>
    """, unsafe_allow_html=True)


# ── Funções de render de cards ─────────────────────────────────────────────

def _news_card(item: dict, ticker: str) -> str:
    titulo = html.escape(item.get("titulo", "Sem título")[:140])
    link   = html.escape(item.get("link", "#"))
    data   = item.get("data", "")
    fonte  = html.escape(item.get("fonte", "Notícias")[:35])
    ago    = time_ago(data)
    ticker_clean = ticker.replace(".SA", "").replace("-USD", "").replace("-BRL", "")

    return f"""
    <a class="news-card" href="{link}" target="_blank" rel="noopener noreferrer">
        <div class="news-meta">
            <span class="news-source">{fonte}</span>
            <span class="news-time">{ago}</span>
        </div>
        <div class="news-headline">{titulo}</div>
        <div class="news-footer">
            <span class="news-ticker-tag">{ticker_clean}</span>
            <span class="news-read-more">Ler →</span>
        </div>
    </a>"""


def _skeleton_grid(n: int = 6) -> str:
    cards = ""
    for _ in range(n):
        cards += """
        <div class="skeleton-card">
            <div class="skeleton-line" style="width:40%;margin-bottom:14px;"></div>
            <div class="skeleton-line" style="width:95%;"></div>
            <div class="skeleton-line" style="width:80%;"></div>
            <div class="skeleton-line" style="width:30%;margin-top:14px;"></div>
        </div>"""
    return f'<div class="news-grid">{cards}</div>'


def _sort_key(item: dict) -> float:
    try:
        dt = _parse_rss_date(item.get("data", ""))
        if dt:
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.timestamp()
    except Exception:
        pass
    return 0.0


# ── Render principal ───────────────────────────────────────────────────────

# Performers
if tickers_eff:
    perf_data = _get_performers(tuple(tickers_eff))
    _render_performers(perf_data)

# Spinner + busca de notícias
news_placeholder = st.empty()

if not tickers_eff and not include_market:
    st.markdown("""
    <div class="news-empty">
        <div class="news-empty-icon">🔍</div>
        <div class="news-empty-text">Selecione ao menos um ticker na barra lateral<br>ou ative "Incluir mercado geral".</div>
    </div>
    """, unsafe_allow_html=True)
else:
    # Skeleton enquanto carrega
    news_placeholder.markdown(_skeleton_grid(6), unsafe_allow_html=True)

    news_data = _get_news(tuple(tickers_eff), include_market)

    # Monta feed cronológico + por ticker
    tab_feed, tab_group = st.tabs(["📅 Cronológico", "🏷️ Por ticker"])

    news_placeholder.empty()

    # ── Tab Feed cronológico ────────────────────────────────────────────────
    with tab_feed:
        all_items: list[dict] = []
        for ticker, items in news_data.items():
            for item in items:
                all_items.append({"_ticker": ticker, **item})

        all_items.sort(key=_sort_key, reverse=True)

        total = len(all_items)
        if total == 0:
            st.markdown("""
            <div class="news-empty">
                <div class="news-empty-icon">📭</div>
                <div class="news-empty-text">Nenhuma notícia encontrada.<br>
                Tente outros tickers ou clique em Atualizar.</div>
            </div>
            """, unsafe_allow_html=True)
        else:
            st.markdown(
                f'<div class="news-count-label">{total} notícias encontradas</div>',
                unsafe_allow_html=True,
            )
            cards_html = '<div class="news-grid">'
            for item in all_items:
                cards_html += _news_card(item, item["_ticker"])
            cards_html += "</div>"
            st.markdown(cards_html, unsafe_allow_html=True)

    # ── Tab Por ticker ──────────────────────────────────────────────────────
    with tab_group:
        has_any = False
        for ticker, items in news_data.items():
            if not items:
                continue
            has_any = True
            ticker_clean = ticker.replace(".SA", "").replace("-USD", "").replace("-BRL", "")
            st.markdown(f"""
            <div class="ticker-section-head">
                <span class="ticker-section-name">{ticker_clean}</span>
                <span class="ticker-section-count">{len(items)} notícias</span>
                <div class="ticker-divider"></div>
            </div>
            """, unsafe_allow_html=True)

            cards_html = '<div class="news-grid">'
            for item in sorted(items, key=_sort_key, reverse=True):
                cards_html += _news_card(item, ticker)
            cards_html += "</div>"
            st.markdown(cards_html, unsafe_allow_html=True)

        if not has_any:
            st.markdown("""
            <div class="news-empty">
                <div class="news-empty-icon">📭</div>
                <div class="news-empty-text">Nenhuma notícia encontrada.</div>
            </div>
            """, unsafe_allow_html=True)

# ── Rodapé ─────────────────────────────────────────────────────────────────
st.markdown("""
<div style="text-align:center;padding:32px 0 16px;color:#1e293b;font-size:0.75rem;letter-spacing:1px;">
    Google News RSS · Yahoo Finance · Dados apenas informativos
</div>
""", unsafe_allow_html=True)

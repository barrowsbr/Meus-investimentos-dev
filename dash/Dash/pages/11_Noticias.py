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

from core.auth import require_auth

require_auth()

from core.computed import get_portfolio_snapshot
from core.data.market import fetch_market_data
from core.agent.news_fetcher import (
    fetch_news_combined,
    fetch_reddit_for_tickers,
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
    initial_sidebar_state="collapsed",
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

/* Oculta sidebar completamente */
[data-testid="stSidebar"] { display: none !important; }
[data-testid="collapsedControl"] { display: none !important; }

/* ── Page header ── */
.news-page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 20px 0 4px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    margin-bottom: 20px;
}
.news-page-left {
    display: flex;
    align-items: center;
    gap: 14px;
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

/* ── Ticker Tape ── */
.ticker-tape-wrap {
    display: flex;
    align-items: stretch;
    background: rgba(6, 10, 20, 0.92);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 14px;
    margin-bottom: 26px;
    overflow: hidden;
    height: 46px;
    box-shadow: 0 4px 24px -4px rgba(0,0,0,0.5);
    position: relative;
}
.ticker-tape-wrap::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(6,182,212,0.25), transparent);
}
.tt-badge {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 16px;
    background: rgba(34,197,94,0.08);
    border-right: 1px solid rgba(255,255,255,0.07);
    font-size: 0.6rem;
    font-weight: 800;
    letter-spacing: 2px;
    color: #22c55e;
    white-space: nowrap;
}
.tt-badge::before {
    content: '';
    width: 6px; height: 6px;
    background: #22c55e;
    border-radius: 50%;
    animation: livePulse 1.5s ease-in-out infinite;
    flex-shrink: 0;
}
@keyframes livePulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(34,197,94,0.6); }
    50%       { opacity: 0.5; box-shadow: 0 0 0 5px rgba(34,197,94,0); }
}
.ticker-viewport {
    flex: 1;
    overflow: hidden;
    display: flex;
    align-items: center;
    -webkit-mask-image: linear-gradient(
        to right,
        transparent 0%,
        black 4%,
        black 96%,
        transparent 100%
    );
    mask-image: linear-gradient(
        to right,
        transparent 0%,
        black 4%,
        black 96%,
        transparent 100%
    );
}
.ticker-track {
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
    animation: tickerScroll linear infinite;
    will-change: transform;
}
@keyframes tickerScroll {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
}
.tt-item {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 22px;
}
.tt-symbol {
    font-size: 0.8rem;
    font-weight: 800;
    color: #f1f5f9;
    letter-spacing: 0.8px;
}
.tt-price {
    font-size: 0.78rem;
    color: #94a3b8;
    font-variant-numeric: tabular-nums;
}
.tt-change {
    font-size: 0.78rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}
.tt-change.up      { color: #22c55e; }
.tt-change.down    { color: #ef4444; }
.tt-change.neutral { color: #64748b; }
.tt-sep {
    color: rgba(255,255,255,0.10);
    font-size: 1.1rem;
    padding: 0 2px;
    user-select: none;
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

/* ── Reddit card extras ── */
.reddit-card {
    border-left-color: rgba(255, 69, 0, 0.45) !important;
}
.reddit-card:hover {
    border-left-color: #ff4500 !important;
    box-shadow: 0 12px 32px -8px rgba(255, 69, 0, 0.2) !important;
}
.reddit-card::before {
    background: linear-gradient(135deg, rgba(255,69,0,0.04) 0%, transparent 60%) !important;
}
.reddit-meta-badges {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: auto;
}
.reddit-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 8px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    color: #94a3b8;
    font-size: 0.68rem;
    font-weight: 600;
}
.reddit-source {
    background: rgba(255, 69, 0, 0.1) !important;
    border-color: rgba(255, 69, 0, 0.22) !important;
    color: #ff6b35 !important;
}

/* ── Mobile ── */
@media (max-width: 768px) {
    .news-grid { grid-template-columns: 1fr; gap: 10px; }
    .news-page-title { font-size: 1.3rem; }
    .news-page-icon  { font-size: 1.6rem; }
    .tt-item { padding: 0 14px; }
}
</style>
""", unsafe_allow_html=True)

render_fab()


# ── Funções cacheadas ──────────────────────────────────────────────────────

@st.cache_data(show_spinner=False, ttl=300)
def _load_portfolio_snapshot():
    try:
        return get_portfolio_snapshot()
    except Exception:
        return {}


def _get_active_tickers(snapshot: dict) -> list[str]:
    """Tickers com posição aberta, ordenados por maior movimentação absoluta."""
    if not snapshot or "positions" not in snapshot:
        return []
    sorted_pos = sorted(
        snapshot["positions"],
        key=lambda x: abs(x.get("day_pnl_pct", 0.0) or 0.0),
        reverse=True,
    )
    return [p["ticker"] for p in sorted_pos if p.get("qty", 0) > 0 and p.get("ticker")]


@st.cache_data(show_spinner=False, ttl=180)
def _get_performers(tickers: tuple) -> list[dict]:
    """Retorna lista ordenada de desempenho do dia para todos os tickers."""
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
    """Busca notícias para TODOS os tickers da carteira."""
    news: dict[str, list[dict]] = {}
    for t in tickers:
        news[t] = fetch_news_combined(t, max_items=6)
        time.sleep(0.2)
    if include_market:
        url = _GOOGLE_NEWS_RSS.format(query="bolsa+brasil+ibovespa+mercado")
        root = _fetch_rss(url)
        news["📈 Mercado"] = _parse_items(root, 6) if root else []
    return news


@st.cache_data(show_spinner=False, ttl=300)
def _get_reddit_news(tickers: tuple) -> dict[str, list[dict]]:
    """Busca posts do Reddit para os tickers da carteira."""
    return fetch_reddit_for_tickers(list(tickers), max_per_ticker=6, max_tickers=10)


# ── Helpers ────────────────────────────────────────────────────────────────

def _ticker_clean(t: str) -> str:
    return t.replace(".SA", "").replace("-USD", "").replace("-BRL", "").replace("=X", "")


def _fmt_price(price: float) -> str:
    if price >= 1_000:
        return f"{price:,.2f}"
    if price >= 1:
        return f"{price:.2f}"
    return f"{price:.4f}"


# ── Ticker Tape ────────────────────────────────────────────────────────────

def _render_ticker_tape(perf: list[dict]) -> None:
    """Faixa horizontal rolante estilo bolsa de valores."""
    if not perf:
        return

    items_html = ""
    for p in perf:
        t     = _ticker_clean(p["ticker"])
        pct   = p["pct"]
        price = p["price"]

        if pct > 0:
            cls, arr, sign = "up", "▲", "+"
        elif pct < 0:
            cls, arr, sign = "down", "▼", ""
        else:
            cls, arr, sign = "neutral", "▬", ""

        price_str = _fmt_price(price)
        pct_str   = f"{sign}{pct:.2f}%"

        items_html += (
            f'<span class="tt-item">'
            f'<span class="tt-symbol">{html.escape(t)}</span>'
            f'<span class="tt-price">R$ {price_str}</span>'
            f'<span class="tt-change {cls}">{arr} {pct_str}</span>'
            f'</span><span class="tt-sep">|</span>'
        )

    track = items_html * 2
    duration = max(20, len(perf) * 5)

    st.markdown(
        f'<div class="ticker-tape-wrap">'
        f'<div class="tt-badge">AO VIVO</div>'
        f'<div class="ticker-viewport">'
        f'<div class="ticker-track" style="animation-duration:{duration}s;">{track}</div>'
        f'</div></div>',
        unsafe_allow_html=True,
    )


# ── News card ──────────────────────────────────────────────────────────────

def _news_card(item: dict, ticker: str) -> str:
    titulo = html.escape(item.get("titulo", "Sem título")[:140])
    link   = html.escape(item.get("link", "#"))
    data   = item.get("data", "")
    fonte  = html.escape(item.get("fonte", "Notícias")[:35])
    ago    = time_ago(data)
    ticker_clean = _ticker_clean(ticker)

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


# ── Carrega portfólio ───────────────────────────────────────────────────────
snapshot    = _load_portfolio_snapshot()
all_tickers = _get_active_tickers(snapshot)

# ── Cabeçalho ──────────────────────────────────────────────────────────────
col_title, col_ctrl = st.columns([4, 1])

with col_title:
    st.markdown("""
    <div class="news-page-header" style="border-bottom:none;margin-bottom:0;padding-bottom:0;">
        <div class="news-page-left">
            <div class="news-page-icon">📰</div>
            <div>
                <div class="news-page-title">Notícias do Mercado</div>
                <div class="news-page-sub">Google News · Yahoo Finance · Todos os ativos da carteira</div>
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)

with col_ctrl:
    st.markdown("<div style='height:14px'></div>", unsafe_allow_html=True)
    include_market = st.toggle("Mercado geral", value=True)
    if st.button("🔄 Atualizar", use_container_width=True):
        _get_news.clear()
        _get_performers.clear()
        _get_reddit_news.clear()
        st.rerun()

st.markdown("<div style='margin-bottom:16px'></div>", unsafe_allow_html=True)

# ── Ticker Tape — todos os ativos ──────────────────────────────────────────
perf_data: list[dict] = []
if all_tickers:
    perf_data = _get_performers(tuple(all_tickers))
    _render_ticker_tape(perf_data)

# ── Notícias ───────────────────────────────────────────────────────────────
news_placeholder = st.empty()

if not all_tickers and not include_market:
    st.markdown("""
    <div class="news-empty">
        <div class="news-empty-icon">🔍</div>
        <div class="news-empty-text">Nenhum ticker encontrado na carteira.<br>Adicione ativos para ver as notícias.</div>
    </div>
    """, unsafe_allow_html=True)
else:
    news_placeholder.markdown(_skeleton_grid(6), unsafe_allow_html=True)

    news_data = _get_news(tuple(all_tickers), include_market)

    tab_feed, tab_group, tab_reddit = st.tabs(["📅 Cronológico", "🏷️ Por ticker", "🤖 Reddit"])

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
                Clique em Atualizar para tentar novamente.</div>
            </div>
            """, unsafe_allow_html=True)
        else:
            st.markdown(
                f'<div class="news-count-label">{total} notícias · {len(news_data)} fontes</div>',
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

        # Destaques: maior alta e maior baixa do dia
        st.markdown("<h3 style='margin-bottom:10px; color:#f1f5f9;'>🏆 Destaques do Dia</h3>", unsafe_allow_html=True)
        movers_col1, movers_col2 = st.columns(2)
        shown_movers: set[str] = set()

        with movers_col1:
            if perf_data and perf_data[0]["pct"] > 0:
                top_gainer = perf_data[0]
                t_g = top_gainer["ticker"]
                n = (news_data.get(t_g) or [None])[0]
                if n and n.get("titulo"):
                    shown_movers.add(t_g)
                    has_any = True
                    t_clean = _ticker_clean(t_g)
                    st.markdown(
                        f'<div>'
                        f'<a class="news-card" href="{html.escape(n["link"])}" target="_blank" rel="noopener noreferrer"'
                        f' style="border-left-color:#34d399;background:rgba(52,211,153,0.05);min-height:180px;">'
                        f'<div style="font-size:0.75rem;font-weight:800;color:#34d399;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">🚀 Maior Alta: {html.escape(t_clean)} (+{top_gainer["pct"]:.2f}%)</div>'
                        f'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">'
                        f'<span style="padding:2px 10px;border-radius:12px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.22);color:#22d3ee;font-size:0.7rem;font-weight:600;">{html.escape(n["fonte"])}</span>'
                        f'<span style="color:#64748b;font-size:0.72rem;">{time_ago(n["data"])}</span>'
                        f'</div>'
                        f'<div style="font-size:1rem;font-weight:600;color:#e2e8f0;line-height:1.45;">{html.escape(n["titulo"][:140])}</div>'
                        f'<div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:8px;">'
                        f'<span style="padding:2px 8px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:#64748b;font-size:0.68rem;font-weight:700;letter-spacing:1px;">{html.escape(t_clean)}</span>'
                        f'<span style="color:#22d3ee;font-size:0.72rem;font-weight:600;">Ler notícia →</span>'
                        f'</div>'
                        f'</a></div>',
                        unsafe_allow_html=True,
                    )

        with movers_col2:
            if perf_data and perf_data[-1]["pct"] < 0:
                top_loser = perf_data[-1]
                t_l = top_loser["ticker"]
                n = (news_data.get(t_l) or [None])[0] if t_l not in shown_movers else None
                if n and n.get("titulo"):
                    shown_movers.add(t_l)
                    has_any = True
                    t_clean = _ticker_clean(t_l)
                    st.markdown(
                        f'<div>'
                        f'<a class="news-card" href="{html.escape(n["link"])}" target="_blank" rel="noopener noreferrer"'
                        f' style="border-left-color:#f87171;background:rgba(248,113,113,0.05);min-height:180px;">'
                        f'<div style="font-size:0.75rem;font-weight:800;color:#f87171;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">🔻 Maior Queda: {html.escape(t_clean)} ({top_loser["pct"]:.2f}%)</div>'
                        f'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">'
                        f'<span style="padding:2px 10px;border-radius:12px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.22);color:#22d3ee;font-size:0.7rem;font-weight:600;">{html.escape(n["fonte"])}</span>'
                        f'<span style="color:#64748b;font-size:0.72rem;">{time_ago(n["data"])}</span>'
                        f'</div>'
                        f'<div style="font-size:1rem;font-weight:600;color:#e2e8f0;line-height:1.45;">{html.escape(n["titulo"][:140])}</div>'
                        f'<div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:8px;">'
                        f'<span style="padding:2px 8px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:#64748b;font-size:0.68rem;font-weight:700;letter-spacing:1px;">{html.escape(t_clean)}</span>'
                        f'<span style="color:#22d3ee;font-size:0.72rem;font-weight:600;">Ler notícia →</span>'
                        f'</div>'
                        f'</a></div>',
                        unsafe_allow_html=True,
                    )

        if shown_movers:
            st.markdown("<br>", unsafe_allow_html=True)

        # Demais tickers
        for ticker, items in news_data.items():
            if not items or ticker in shown_movers:
                continue
            has_any = True
            ticker_clean = _ticker_clean(ticker)

            # Variação do dia ao lado do nome
            pct_str = ""
            matches = [p["pct"] for p in perf_data if p["ticker"] == ticker]
            if matches:
                val = matches[0]
                color = "#34d399" if val >= 0 else "#f87171"
                sign  = "+" if val >= 0 else ""
                pct_str = f" <span style='color:{color};font-size:0.8rem;'>{sign}{val:.2f}%</span>"

            st.markdown(f"""
            <div class="ticker-section-head">
                <span class="ticker-section-name">{ticker_clean}{pct_str}</span>
                <span class="ticker-section-count">{len(items)} notícias</span>
                <div class="ticker-divider"></div>
            </div>
            """, unsafe_allow_html=True)

            cards_html = '<div class="news-grid">'
            for item in sorted(items, key=_sort_key, reverse=True):
                # Filtra notícias com mais de 7 dias
                dt = _parse_rss_date(item.get("data", ""))
                if dt:
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    if (datetime.now(timezone.utc) - dt).days > 7:
                        continue
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

    # ── Tab Reddit ──────────────────────────────────────────────────────────
    with tab_reddit:
        reddit_data = _get_reddit_news(tuple(all_tickers))

        # Flatten todos os posts
        all_reddit: list[dict] = []
        for ticker, posts in reddit_data.items():
            for post in posts:
                all_reddit.append({"_ticker": ticker, **post})

        # Ordena por score
        all_reddit.sort(key=lambda x: x.get("score", 0), reverse=True)

        total_reddit = len(all_reddit)
        if total_reddit == 0:
            st.markdown("""
            <div class="news-empty">
                <div class="news-empty-icon">🤖</div>
                <div class="news-empty-text">Nenhum post encontrado no Reddit.<br>
                Seus ativos podem não ter discussões recentes.</div>
            </div>
            """, unsafe_allow_html=True)
        else:
            tickers_com_posts = sum(1 for v in reddit_data.values() if v)
            st.markdown(
                f'<div class="news-count-label">{total_reddit} posts · {tickers_com_posts} ativos com discussões</div>',
                unsafe_allow_html=True,
            )

            cards_html = '<div class="news-grid">'
            for post in all_reddit:
                titulo = html.escape(post.get("titulo", "Sem título")[:140])
                link = html.escape(post.get("link", "#"))
                data = post.get("data", "")
                fonte = html.escape(post.get("fonte", "Reddit")[:35])
                ago = time_ago(data)
                ticker_clean = _ticker_clean(post["_ticker"])
                score = post.get("score", 0)
                num_comments = post.get("num_comments", 0)
                resumo = html.escape(post.get("resumo", "")[:120])

                resumo_html = f'<div style="font-size:0.78rem;color:#64748b;line-height:1.4;margin-top:4px;">{resumo}...</div>' if resumo else ''

                cards_html += f"""
                <a class="news-card reddit-card" href="{link}" target="_blank" rel="noopener noreferrer">
                    <div class="news-meta">
                        <span class="news-source reddit-source">{fonte}</span>
                        <span class="news-time">{ago}</span>
                    </div>
                    <div class="news-headline">{titulo}</div>
                    {resumo_html}
                    <div class="news-footer">
                        <div class="reddit-meta-badges">
                            <span class="news-ticker-tag">{ticker_clean}</span>
                            <span class="reddit-badge">⬆ {score}</span>
                            <span class="reddit-badge">💬 {num_comments}</span>
                        </div>
                        <span class="news-read-more">Abrir →</span>
                    </div>
                </a>"""
            cards_html += '</div>'
            st.markdown(cards_html, unsafe_allow_html=True)

# ── Rodapé ─────────────────────────────────────────────────────────────────
st.markdown("""
<div style="text-align:center;padding:32px 0 16px;color:#1e293b;font-size:0.75rem;letter-spacing:1px;">
    Google News RSS · Yahoo Finance · Reddit · Dados apenas informativos
</div>
""", unsafe_allow_html=True)

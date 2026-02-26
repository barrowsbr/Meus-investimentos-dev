"""
news_fetcher.py
===============
Busca notícias relevantes para os tickers do portfólio.
Fontes: Google News RSS (sem chave) + Yahoo Finance (via yfinance).
"""

from __future__ import annotations

import re
import time
from typing import Optional
from urllib.request import urlopen, Request
from urllib.error import URLError
import xml.etree.ElementTree as ET
from datetime import datetime, timezone


_GOOGLE_NEWS_RSS = (
    "https://news.google.com/rss/search?q={query}"
    "&hl=pt-BR&gl=BR&ceid=BR:pt"
)

_INFOMONEY_RSS = "https://www.infomoney.com.br/feed/"

_USER_AGENT = (
    "Mozilla/5.0 (compatible; InvestimentosBot/1.0; +https://github.com)"
)


# ── Helpers internos ────────────────────────────────────────────────────────

def _clean_html(text: str) -> str:
    """Remove tags HTML simples do texto."""
    return re.sub(r"<[^>]+>", "", text or "").strip()


def _fetch_rss(url: str, timeout: int = 8) -> Optional[ET.Element]:
    try:
        req = Request(url, headers={"User-Agent": _USER_AGENT})
        with urlopen(req, timeout=timeout) as resp:
            content = resp.read()
        return ET.fromstring(content)
    except (URLError, ET.ParseError, Exception):
        return None


def _parse_items(root: ET.Element, max_items: int = 5) -> list[dict]:
    items = []
    channel = root.find("channel")
    if channel is None:
        return items
    for item in channel.findall("item")[:max_items]:
        title = _clean_html(item.findtext("title", ""))
        link = item.findtext("link", "")
        pub = item.findtext("pubDate", "")
        desc = _clean_html(item.findtext("description", ""))
        if title:
            items.append({
                "titulo": title,
                "link": link,
                "data": pub,
                "resumo": desc[:200],
                "fonte": "Google Notícias",
            })
    return items


def _clean_ticker_query(ticker: str) -> str:
    """Remove sufixos de mercado para queries mais limpas."""
    t = ticker.upper()
    for suf in [".SA", "-USD", "-BRL", "11.SA"]:
        t = t.replace(suf, "")
    return t


# ── Tempo relativo ──────────────────────────────────────────────────────────

def _parse_rss_date(date_str: str) -> Optional[datetime]:
    """Tenta parsear pubDate do RSS em vários formatos."""
    if not date_str:
        return None
    s = date_str.strip()
    for fmt in (
        "%a, %d %b %Y %H:%M:%S %Z",
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S",
    ):
        try:
            return datetime.strptime(s[:31], fmt)
        except ValueError:
            continue
    return None


def time_ago(date_str: str) -> str:
    """Converte data RSS para string relativa: '2h atrás', '30min atrás'."""
    try:
        dt = _parse_rss_date(date_str)
        if dt is None:
            return ""
        now = datetime.now(timezone.utc)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        delta = now - dt
        mins = int(delta.total_seconds() / 60)
        if mins < 1:
            return "agora"
        if mins < 60:
            return f"{mins}min atrás"
        hrs = mins // 60
        if hrs < 24:
            return f"{hrs}h atrás"
        days = hrs // 24
        return f"{days}d atrás"
    except Exception:
        return ""


# ── Yahoo Finance ───────────────────────────────────────────────────────────

def fetch_yahoo_news(ticker: str, max_items: int = 5) -> list[dict]:
    """
    Busca notícias do Yahoo Finance para um ticker.
    Compatível com múltiplas versões do yfinance.
    """
    try:
        import yfinance as yf  # noqa: PLC0415

        yf_ticker = ticker.upper().strip()
        # Acrescenta .SA para ações BR sem sufixo
        if (
            not yf_ticker.endswith(".SA")
            and not yf_ticker.endswith("-USD")
            and not yf_ticker.endswith("-BRL")
            and len(yf_ticker) <= 6
            and yf_ticker[-1].isdigit()
        ):
            yf_ticker += ".SA"

        t = yf.Ticker(yf_ticker)
        raw_news = getattr(t, "news", None) or []

        items: list[dict] = []
        for n in raw_news[: max_items * 2]:
            if not isinstance(n, dict):
                continue

            # yfinance ≥ 0.2.51 encapsula tudo em 'content'
            content = n.get("content", n)

            title = content.get("title", "") or n.get("title", "")
            if not title:
                continue

            # URL
            canonical = content.get("canonicalUrl", {})
            if isinstance(canonical, dict):
                link = canonical.get("url", "")
            else:
                link = str(canonical) if canonical else ""
            if not link:
                ctu = content.get("clickThroughUrl", {})
                link = ctu.get("url", "") if isinstance(ctu, dict) else (ctu or "")
            if not link:
                link = n.get("link", "")

            # Timestamp
            ts = n.get("providerPublishTime", 0)
            if ts:
                pub = datetime.utcfromtimestamp(ts).strftime(
                    "%a, %d %b %Y %H:%M:%S GMT"
                )
            else:
                pub = content.get("pubDate", "")

            # Fonte/publisher
            provider = content.get("provider", {})
            if isinstance(provider, dict):
                source = provider.get("displayName", "") or provider.get("name", "")
            else:
                source = ""
            if not source:
                source = n.get("publisher", "Yahoo Finance")

            summary = content.get("summary", "") or content.get("description", "") or ""

            items.append({
                "titulo": title[:140],
                "link": link,
                "data": pub,
                "resumo": summary[:200],
                "fonte": source or "Yahoo Finance",
            })

            if len(items) >= max_items:
                break

        return items
    except Exception:
        return []


# ── Busca combinada por ticker ──────────────────────────────────────────────

def fetch_news_combined(ticker: str, max_items: int = 6) -> list[dict]:
    """
    Combina Google News RSS + Yahoo Finance para um ticker.
    Deduplica por título e retorna até max_items resultados.
    """
    query = f"{_clean_ticker_query(ticker)} ação bolsa brasil"
    url = _GOOGLE_NEWS_RSS.format(query=query.replace(" ", "+"))
    root = _fetch_rss(url)
    google = _parse_items(root, max_items) if root else []

    yahoo = fetch_yahoo_news(ticker, max_items=max_items // 2 + 1)

    # Mescla e deduplica pelo início do título
    combined = list(google)
    seen = {n["titulo"][:40].lower() for n in combined}
    for item in yahoo:
        key = item["titulo"][:40].lower()
        if key not in seen:
            combined.append(item)
            seen.add(key)

    return combined[:max_items]


# ── API original preservada ─────────────────────────────────────────────────

def fetch_news_for_tickers(
    tickers: list[str],
    max_per_ticker: int = 3,
    max_tickers: int = 6,
    include_market: bool = True,
) -> dict[str, list[dict]]:
    """
    Retorna um dict  {ticker: [lista de notícias]}.

    Parâmetros
    ----------
    tickers        : lista de tickers (ex.: ['PETR4', 'VALE3', 'BTC-USD'])
    max_per_ticker : máximo de notícias por ticker
    max_tickers    : limita quantos tickers pesquisar (evita muitas requests)
    include_market : se True, adiciona uma busca geral 'bolsa brasil'
    """
    results: dict[str, list[dict]] = {}

    selected = tickers[:max_tickers]

    for ticker in selected:
        query = f"{_clean_ticker_query(ticker)} ação bolsa brasil"
        url = _GOOGLE_NEWS_RSS.format(query=query.replace(" ", "+"))
        root = _fetch_rss(url)
        if root is not None:
            results[ticker] = _parse_items(root, max_per_ticker)
        else:
            results[ticker] = []
        time.sleep(0.3)

    if include_market:
        url = _GOOGLE_NEWS_RSS.format(query="bolsa+brasil+ibovespa+mercado")
        root = _fetch_rss(url)
        results["📈 Mercado Geral"] = _parse_items(root, 5) if root else []

    return results


def format_news_for_prompt(news: dict[str, list[dict]]) -> str:
    """Formata as notícias em texto para incluir no prompt."""
    if not any(news.values()):
        return "Nenhuma notícia encontrada no momento."

    lines = ["## Notícias Recentes"]
    for ticker, items in news.items():
        if not items:
            continue
        lines.append(f"\n### {ticker}")
        for n in items:
            lines.append(f"- **{n['titulo']}** ({n['data'][:16]})")
            if n.get("resumo"):
                lines.append(f"  _{n['resumo']}_")
    return "\n".join(lines)

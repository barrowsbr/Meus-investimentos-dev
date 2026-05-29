"""
news_fetcher.py
===============
Busca notícias relevantes para os tickers do portfólio.
Fontes: Google News RSS (sem chave) + Yahoo Finance (direto, sem yfinance).
"""

from __future__ import annotations

import gzip as _gzip
import json as _json
import re
import time
import urllib.parse
from typing import Optional
from urllib.request import urlopen, Request
from urllib.error import URLError
import xml.etree.ElementTree as ET
from datetime import datetime, timezone


_GOOGLE_NEWS_RSS_BASE = "https://news.google.com/rss/search"
_GOOGLE_NEWS_PARAMS    = "&hl=pt-BR&gl=BR&ceid=BR:pt"
_GOOGLE_NEWS_PARAMS_EN = "&hl=en-US&gl=US&ceid=US:en"


def _news_url(query: str, lang: str = "pt") -> str:
    """Constrói URL do Google News RSS com encoding correto."""
    params = _GOOGLE_NEWS_PARAMS if lang == "pt" else _GOOGLE_NEWS_PARAMS_EN
    return f"{_GOOGLE_NEWS_RSS_BASE}?q={urllib.parse.quote_plus(query)}{params}"

# Kept for backward compat — 11_Noticias.py imports this symbol
_GOOGLE_NEWS_RSS = _GOOGLE_NEWS_RSS_BASE + "?q={query}" + _GOOGLE_NEWS_PARAMS

_PREMIUM_SOURCES = (
    "site:infomoney.com.br OR "
    "site:valor.globo.com OR "
    "site:exame.com OR "
    "site:cnnbrasil.com.br OR "
    "site:bloomberglinea.com.br OR "
    "site:neofeed.com.br OR "
    "site:investnews.com.br OR "
    "site:moneytimes.com.br"
)

_INFOMONEY_RSS = "https://www.infomoney.com.br/feed/"

# Browser-like UA: avoids bot blocks from Reddit, Google, Yahoo
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# Headers that closely mimic a real browser RSS reader / news aggregator
_RSS_HEADERS = {
    "User-Agent": _USER_AGENT,
    "Accept": "application/rss+xml, application/xml, text/xml, */*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    # Request uncompressed — Chrome UA can trigger gzip which urlopen doesn't auto-decode
    "Accept-Encoding": "identity",
    "Cache-Control": "no-cache",
}


# ── Helpers internos ────────────────────────────────────────────────────────

def _clean_html(text: str) -> str:
    """Remove tags HTML simples do texto."""
    return re.sub(r"<[^>]+>", "", text or "").strip()


def _fetch_rss(url: str, timeout: int = 12) -> Optional[ET.Element]:
    try:
        req = Request(url, headers=_RSS_HEADERS)
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            enc = (resp.headers.get("Content-Encoding") or "").lower()
        # Decompress if server ignored Accept-Encoding: identity
        if enc == "gzip":
            raw = _gzip.decompress(raw)
        elif enc == "deflate":
            import zlib
            raw = zlib.decompress(raw)
        return ET.fromstring(raw)
    except ET.ParseError:
        return None
    except Exception:
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
        desc_html = item.findtext("description", "")
        
        # Tentativa de extrair imagem do HTML da descrição (Google News costuma embutir <img> lá)
        img_match = re.search(r'<img[^>]+src="([^">]+)"', desc_html)
        image_url = img_match.group(1) if img_match else ""
        
        # Fallback para namespace media (para outros RSS)
        if not image_url:
            media = item.find("{http://search.yahoo.com/mrss/}content")
            if media is not None:
                image_url = media.get("url", "")
                
        desc = _clean_html(desc_html)
        if title:
            items.append({
                "titulo": title,
                "link": link,
                "data": pub,
                "resumo": desc[:200],
                "fonte": "Google Notícias",
                "imagem": image_url,
            })
    return items


def _clean_ticker_query(ticker: str) -> str:
    """Remove sufixos de mercado para queries mais limpas."""
    t = ticker.upper()
    for suf in [".SA", "-USD", "-BRL", "11.SA"]:
        t = t.replace(suf, "")
    return t


# Tickers cujo nome colide com termos comuns em português.
# O valor é a query base que substitui "{clean} ação" na busca Google News.
_TICKER_QUERY_OVERRIDES: dict[str, str] = {
    # "meta" em PT = objetivo/alvo → sem override traz "meta selic", "meta de inflação" etc.
    "META": '"Meta Platforms" OR "Meta AI" OR "Zuckerberg" OR "Facebook" OR "Instagram" -"meta selic" -"meta inflação" -"meta fiscal" -"meta atuarial"',
    # "apple" pode trazer notícias de frutas em PT
    "AAPL": '"Apple" iPhone OR MacBook OR "Tim Cook" OR "App Store"',
    # "amazon" pode trazer notícias da floresta
    "AMZN": '"Amazon" AWS OR Bezos OR "e-commerce" OR "Amazon.com"',
}


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
# Uses Yahoo Finance search API directly — yfinance 0.2.66 .news is broken.

def fetch_yahoo_news(ticker: str, max_items: int = 5) -> list[dict]:
    """
    Busca notícias do Yahoo Finance via API de busca pública (sem yfinance).
    """
    yf_ticker = ticker.upper().strip()
    if (
        not yf_ticker.endswith(".SA")
        and not yf_ticker.endswith("-USD")
        and not yf_ticker.endswith("-BRL")
        and len(yf_ticker) <= 6
        and yf_ticker[-1].isdigit()
    ):
        yf_ticker += ".SA"

    url = (
        "https://query1.finance.yahoo.com/v1/finance/search"
        f"?q={urllib.parse.quote_plus(yf_ticker)}"
        f"&newsCount={max_items * 2}"
        "&enableFuzzyQuery=false"
        "&enableCb=false"
        "&enableNavLinks=false"
    )
    try:
        req = Request(
            url,
            headers={
                "User-Agent": _USER_AGENT,
                "Accept": "application/json",
                "Referer": "https://finance.yahoo.com/",
                "Accept-Encoding": "identity",
            },
        )
        with urlopen(req, timeout=10) as resp:
            data = _json.loads(resp.read().decode("utf-8"))

        raw_news = data.get("news", [])
        items: list[dict] = []
        for n in raw_news[:max_items]:
            title = n.get("title", "")
            if not title:
                continue
            link = n.get("link", "")
            ts = n.get("providerPublishTime", 0)
            pub = (
                datetime.utcfromtimestamp(ts).strftime("%a, %d %b %Y %H:%M:%S GMT")
                if ts else ""
            )
            thumb = n.get("thumbnail") or {}
            image_url = ""
            if isinstance(thumb, dict):
                ress = thumb.get("resolutions", [])
                if ress:
                    image_url = (ress[0] or {}).get("url", "")
            items.append({
                "titulo": title[:140],
                "link": link,
                "data": pub,
                "resumo": "",
                "fonte": n.get("publisher", "Yahoo Finance"),
                "imagem": image_url,
            })
        return items
    except Exception:
        return []


# ── Busca combinada por ticker ──────────────────────────────────────────────

def fetch_news_combined(ticker: str, max_items: int = 6) -> list[dict]:
    """
    Combina Google News RSS + Yahoo Finance para um ticker.
    Deduplica por título e retorna até max_items resultados.
    """
    clean = _clean_ticker_query(ticker)
    base_q = _TICKER_QUERY_OVERRIDES.get(clean, f"{clean} ação")

    # 1) pt-BR locale
    root = _fetch_rss(_news_url(base_q, lang="pt"))
    # 2) en-US locale — helps when server IP is outside Brazil
    if not root or not root.findall(".//item"):
        root = _fetch_rss(_news_url(base_q, lang="en"))
    # 3) simpler pt-BR query
    if not root or not root.findall(".//item"):
        root = _fetch_rss(_news_url(f"{clean} bolsa", lang="pt"))
    # 4) bare ticker in en-US
    if not root or not root.findall(".//item"):
        root = _fetch_rss(_news_url(clean, lang="en"))

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
        clean = _clean_ticker_query(ticker)
        base_q = _TICKER_QUERY_OVERRIDES.get(clean, f"{clean} ação")
        root = _fetch_rss(_news_url(base_q, lang="pt"))
        if not root or not root.findall(".//item"):
            root = _fetch_rss(_news_url(base_q, lang="en"))
        if not root or not root.findall(".//item"):
            root = _fetch_rss(_news_url(clean, lang="en"))

        results[ticker] = _parse_items(root, max_per_ticker) if root else []
        time.sleep(0.3)

    if include_market:
        root = _fetch_rss(_INFOMONEY_RSS)
        if root:
            results["📈 InfoMoney (Mercado)"] = _parse_items(root, 6)
        else:
            root = _fetch_rss(_news_url("bolsa brasil ibovespa mercado financeiro", lang="pt"))
            if not root or not root.findall(".//item"):
                root = _fetch_rss(_news_url("brazil stock market ibovespa", lang="en"))
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


# ── Reddit (JSON API pública, sem OAuth) ────────────────────────────────────
# Reddit descontinuou o RSS de busca — usamos os endpoints .json públicos,
# que ainda funcionam sem autenticação para leitura de dados públicos.

_REDDIT_JSON_SEARCH = "https://www.reddit.com/search.json"
_REDDIT_JSON_SUBREDDIT = "https://www.reddit.com/r/{subreddit}/search.json"

_FINANCE_SUBREDDITS = [
    "investimentos", "farialimabets", "bolsa",
    "stocks", "wallstreetbets", "investing",
    "dividends", "stockmarket",
]


def _fetch_reddit_json(url: str, timeout: int = 12) -> list[dict]:
    """Busca posts do Reddit via endpoint .json público (sem OAuth)."""
    import json
    import urllib.request as _ureq

    try:
        req = _ureq.Request(
            url,
            headers={
                "User-Agent": _USER_AGENT,
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
            },
        )
        with _ureq.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data.get("data", {}).get("children", [])
    except Exception:
        return []


def fetch_reddit_posts(
    ticker: str,
    max_items: int = 8,
    subreddits: list[str] | None = None,
) -> list[dict]:
    """
    Busca posts do Reddit via JSON API pública (sem autenticação).

    Parâmetros
    ----------
    ticker      : ticker a pesquisar (ex.: 'PETR4', 'VALE3', 'AAPL')
    max_items   : máximo de posts a retornar
    subreddits  : lista de subreddits para filtrar (None = busca geral)

    Retorna lista de dicts no formato padrão:
        {titulo, link, data, resumo, fonte, score, num_comments, subreddit}
    """
    import urllib.parse

    clean = _clean_ticker_query(ticker)
    is_br = (
        ticker.upper().endswith(".SA")
        or clean.endswith("3")
        or clean.endswith("4")
        or clean.endswith("11")
    )

    if is_br:
        query = f"{clean} investimento OR ação OR bolsa OR dividendo"
    else:
        query = f"{clean} stocks OR investing OR earnings"

    base_params = urllib.parse.urlencode({
        "q": query,
        "sort": "relevance",
        "t": "month",
        "limit": str(min(max_items * 3, 25)),
    })

    # Tenta subreddits específicos (só para tickers não-BR) + busca global
    urls: list[str] = []
    if subreddits and not is_br:
        for sr in subreddits[:3]:
            urls.append(
                f"{_REDDIT_JSON_SUBREDDIT.format(subreddit=sr)}?{base_params}&restrict_sr=1"
            )
    urls.append(f"{_REDDIT_JSON_SEARCH}?{base_params}")

    posts: list[dict] = []
    seen: set[str] = set()

    for url in urls:
        children = _fetch_reddit_json(url, timeout=12)

        for child in children:
            pdata = child.get("data", {})
            title = pdata.get("title", "").strip()
            if not title:
                continue

            permalink = pdata.get("permalink", "")
            link = (
                f"https://www.reddit.com{permalink}"
                if permalink.startswith("/")
                else permalink
            )
            if link in seen:
                continue
            seen.add(link)

            subreddit = pdata.get("subreddit", "reddit")
            created_utc = pdata.get("created_utc", 0)
            if created_utc:
                dt = datetime.fromtimestamp(created_utc, tz=timezone.utc)
                pub_date = dt.strftime("%a, %d %b %Y %H:%M:%S %z")
            else:
                pub_date = ""

            selftext = pdata.get("selftext", "").strip()
            if selftext in ("[removed]", "[deleted]"):
                selftext = ""

            posts.append({
                "titulo": title[:140],
                "link": link,
                "data": pub_date,
                "resumo": selftext[:200] if selftext else "",
                "fonte": f"r/{subreddit}",
                "score": pdata.get("score", 0),
                "num_comments": pdata.get("num_comments", 0),
                "subreddit": subreddit,
            })

            if len(posts) >= max_items:
                break

        if len(posts) >= max_items:
            break

    return posts


def fetch_reddit_for_tickers(
    tickers: list[str],
    max_per_ticker: int = 5,
    max_tickers: int = 8,
) -> dict[str, list[dict]]:
    """
    Busca posts do Reddit para múltiplos tickers.
    Retorna dict {ticker: [lista de posts]}.
    """
    results: dict[str, list[dict]] = {}
    for ticker in tickers[:max_tickers]:
        results[ticker] = fetch_reddit_posts(
            ticker,
            max_items=max_per_ticker,
            subreddits=_FINANCE_SUBREDDITS,
        )
        time.sleep(0.5)  # Rate limit gentil
    return results

"""
news_fetcher.py
===============
Busca notícias relevantes para os tickers do portfólio via RSS do Google News.
Não requer chave de API adicional.
"""

from __future__ import annotations

import re
import time
from typing import Optional
from urllib.request import urlopen, Request
from urllib.error import URLError
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta


_GOOGLE_NEWS_RSS = (
    "https://news.google.com/rss/search?q={query}"
    "&hl=pt-BR&gl=BR&ceid=BR:pt"
)

_INFOMONEY_RSS = "https://www.infomoney.com.br/feed/"

_USER_AGENT = (
    "Mozilla/5.0 (compatible; InvestimentosBot/1.0; +https://github.com)"
)


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
            items.append({"titulo": title, "link": link, "data": pub, "resumo": desc[:200]})
    return items


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

    # Remove sufixos de mercado para queries mais limpas
    def clean_query(t: str) -> str:
        t = t.upper()
        for suf in [".SA", "-USD", "-BRL", "11.SA"]:
            t = t.replace(suf, "")
        return t

    selected = tickers[:max_tickers]

    for ticker in selected:
        query = f"{clean_query(ticker)} ação bolsa brasil"
        url = _GOOGLE_NEWS_RSS.format(query=query.replace(" ", "+"))
        root = _fetch_rss(url)
        if root is not None:
            results[ticker] = _parse_items(root, max_per_ticker)
        else:
            results[ticker] = []
        time.sleep(0.3)  # Gentil com o servidor

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

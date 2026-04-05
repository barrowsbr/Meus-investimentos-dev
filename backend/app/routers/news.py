"""
routers/news.py
===============
Endpoints de notícias e eventos de mercado.
Replica os dados de 11_Noticias.py.

Endpoints:
  GET /api/news              — notícias filtradas pelos tickers da carteira
  GET /api/news/polymarket   — eventos Polymarket por categoria
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.cache import ttl_cache

logger = logging.getLogger("uvicorn")
router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers com cache
# ---------------------------------------------------------------------------

@ttl_cache(ttl=600)
def _get_portfolio_tickers() -> list[str]:
    """Retorna lista de tickers ativos na carteira para filtrar notícias."""
    try:
        from core.computed import get_portfolio_snapshot
        snap = get_portfolio_snapshot()
        return [p["ticker"] for p in snap.get("positions", [])]
    except Exception:
        return []


@ttl_cache(ttl=300)
def _fetch_news(tickers_key: str) -> list[dict]:
    from core.agent.news_fetcher import fetch_news_for_tickers
    tickers = tickers_key.split("|") if tickers_key else []
    return fetch_news_for_tickers(tickers)


@ttl_cache(ttl=600)
def _fetch_polymarket(category: str) -> list[dict]:
    from core.agent.polymarket import fetch_polymarket_events
    return fetch_polymarket_events(category=category or None)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("")
def get_news(
    category: Optional[str] = Query(None, description="crypto|macro|geopolitica|tech"),
    limit: int = Query(50, ge=1, le=200),
) -> list[dict]:
    """
    Notícias de mercado filtradas pelos tickers da carteira.
    Fontes: Google News RSS, Yahoo Finance News.
    """
    try:
        tickers = _get_portfolio_tickers()
        tickers_key = "|".join(sorted(tickers))
        news = _fetch_news(tickers_key)

        # Filtra por categoria se informada
        if category:
            news = [n for n in news if n.get("category", "").lower() == category.lower()]

        return news[:limit]

    except Exception as exc:
        logger.exception("Erro em /news")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/polymarket")
def get_polymarket(
    category: Optional[str] = Query(None, description="crypto|macro|geopolitica|tech|all"),
) -> list[dict]:
    """Eventos de previsão do Polymarket por categoria."""
    try:
        return _fetch_polymarket(category or "all")
    except Exception as exc:
        logger.exception("Erro em /news/polymarket")
        raise HTTPException(status_code=500, detail=str(exc))

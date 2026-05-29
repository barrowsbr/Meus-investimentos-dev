# Agente IA – Gemini + Portfólio
from .context_builder import build_portfolio_context
from .news_fetcher import fetch_news_for_tickers
from .gemini_client import GeminiAgent

__all__ = ["build_portfolio_context", "fetch_news_for_tickers", "GeminiAgent"]

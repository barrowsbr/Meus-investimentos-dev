"""Predictive analytics endpoints — econometric models on portfolio data."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Query

from app.services.gsheets_service import fetch_tab
from app.services.preditivo_service import (
    monte_carlo,
    arima_forecast,
    prophet_forecast,
    garch_forecast,
    var_forecast,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/preditivo", tags=["preditivo"])

Row = dict[str, Any]


async def _get_cotacoes() -> list[Row]:
    """Fetch db_cotacoes from Google Sheets."""
    return await fetch_tab("db_cotacoes")


def _parse_tickers(tickers: str | None) -> list[str] | None:
    if not tickers:
        return None
    return [t.strip().upper() for t in tickers.split(",") if t.strip()]


@router.get("/monte-carlo")
async def endpoint_monte_carlo(
    tickers: str | None = Query(None, description="Comma-separated tickers (empty = portfolio)"),
    simulations: int = Query(1000, ge=100, le=10000),
    horizon: int = Query(252, ge=10, le=504),
    initial_value: float = Query(100.0, ge=1),
):
    rows = await _get_cotacoes()
    result = await asyncio.get_event_loop().run_in_executor(
        None, monte_carlo, rows, _parse_tickers(tickers), simulations, horizon, initial_value
    )
    return result


@router.get("/arima")
async def endpoint_arima(
    tickers: str | None = Query(None),
    horizon: int = Query(60, ge=5, le=252),
):
    rows = await _get_cotacoes()
    result = await asyncio.get_event_loop().run_in_executor(
        None, arima_forecast, rows, _parse_tickers(tickers), horizon
    )
    return result


@router.get("/prophet")
async def endpoint_prophet(
    tickers: str | None = Query(None),
    horizon: int = Query(60, ge=5, le=252),
):
    rows = await _get_cotacoes()
    result = await asyncio.get_event_loop().run_in_executor(
        None, prophet_forecast, rows, _parse_tickers(tickers), horizon
    )
    return result


@router.get("/garch")
async def endpoint_garch(
    tickers: str | None = Query(None),
    horizon: int = Query(60, ge=5, le=252),
):
    rows = await _get_cotacoes()
    result = await asyncio.get_event_loop().run_in_executor(
        None, garch_forecast, rows, _parse_tickers(tickers), horizon
    )
    return result


@router.get("/var")
async def endpoint_var(
    tickers: str | None = Query(None),
    horizon: int = Query(30, ge=5, le=120),
    max_vars: int = Query(4, ge=2, le=8),
):
    rows = await _get_cotacoes()
    result = await asyncio.get_event_loop().run_in_executor(
        None, var_forecast, rows, _parse_tickers(tickers), horizon, max_vars
    )
    return result

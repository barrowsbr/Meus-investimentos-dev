"""Predictive analytics endpoints — econometric models on portfolio data.

Data flow: Frontend fetches db_cotacoes from Next.js API (/api/sheets/db_cotacoes),
then POSTs the rows to these endpoints. This avoids the Python backend needing
direct Google Sheets access.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel

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


class PreditivoRequest(BaseModel):
    rows: list[dict[str, Any]]
    tickers: list[str] | None = None


class MonteCarloRequest(PreditivoRequest):
    simulations: int = 1000
    horizon: int = 252
    initial_value: float = 100.0


class HorizonRequest(PreditivoRequest):
    horizon: int = 60


class VarRequest(PreditivoRequest):
    horizon: int = 30
    max_vars: int = 4


def _error_no_data():
    return {"error": "Nenhum dado recebido. Verifique se db_cotacoes está populado."}


@router.post("/monte-carlo")
async def endpoint_monte_carlo(req: MonteCarloRequest):
    if not req.rows:
        return _error_no_data()
    result = await asyncio.get_event_loop().run_in_executor(
        None, monte_carlo, req.rows, req.tickers, req.simulations, req.horizon, req.initial_value
    )
    return result


@router.post("/arima")
async def endpoint_arima(req: HorizonRequest):
    if not req.rows:
        return _error_no_data()
    result = await asyncio.get_event_loop().run_in_executor(
        None, arima_forecast, req.rows, req.tickers, req.horizon
    )
    return result


@router.post("/prophet")
async def endpoint_prophet(req: HorizonRequest):
    if not req.rows:
        return _error_no_data()
    result = await asyncio.get_event_loop().run_in_executor(
        None, prophet_forecast, req.rows, req.tickers, req.horizon
    )
    return result


@router.post("/garch")
async def endpoint_garch(req: HorizonRequest):
    if not req.rows:
        return _error_no_data()
    result = await asyncio.get_event_loop().run_in_executor(
        None, garch_forecast, req.rows, req.tickers, req.horizon
    )
    return result


@router.post("/var")
async def endpoint_var(req: VarRequest):
    if not req.rows:
        return _error_no_data()
    result = await asyncio.get_event_loop().run_in_executor(
        None, var_forecast, req.rows, req.tickers, req.horizon, req.max_vars
    )
    return result

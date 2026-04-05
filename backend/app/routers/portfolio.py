"""
routers/portfolio.py
====================
Endpoints de carteira de investimentos.
Replica os dados exibidos em 1_Investimentos.py.

Endpoints:
  GET /api/portfolio/snapshot      — posições + P&L do dia + top gainers/losers
  GET /api/portfolio/positions     — lista de posições abertas (RV)
  GET /api/portfolio/fixed-income  — posições de renda fixa
  GET /api/portfolio/dividends     — proventos recebidos
  GET /api/portfolio/summary       — totalizadores do patrimônio
"""
from __future__ import annotations

import logging
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException

from app.cache import ttl_cache

logger = logging.getLogger("uvicorn")
router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers com cache
# ---------------------------------------------------------------------------

@ttl_cache(ttl=120)
def _portfolio_snapshot() -> dict:
    """Reutiliza get_portfolio_snapshot() do core — mesma fonte do agente IA."""
    from core.computed import get_portfolio_snapshot  # noqa: import after sys.path setup
    return get_portfolio_snapshot()


@ttl_cache(ttl=300)
def _proventos_data() -> list[dict]:
    from core.data.loader import load_proventos
    df = load_proventos()
    if df.empty:
        return []
    # Converte datas para string JSON-serializável
    for col in df.select_dtypes(include=["datetime64[ns]", "datetime64"]).columns:
        df[col] = df[col].dt.strftime("%Y-%m-%d")
    df = df.fillna("")
    return df.to_dict(orient="records")


@ttl_cache(ttl=300)
def _fixed_income_data() -> list[dict]:
    from core.data.loader import load_fixed_income_manual
    df = load_fixed_income_manual()
    if df.empty:
        return []
    for col in df.select_dtypes(include=["datetime64[ns]", "datetime64"]).columns:
        df[col] = df[col].dt.strftime("%Y-%m-%d")
    df = df.fillna("")
    return df.to_dict(orient="records")


def _serialize_snapshot(snap: dict) -> dict:
    """Remove DataFrames e garante que o snapshot é JSON-serializável."""
    result = {k: v for k, v in snap.items() if not isinstance(v, pd.DataFrame)}
    # rf_positions é um DataFrame — converte para lista de dicts
    rf_df: pd.DataFrame = snap.get("rf_positions", pd.DataFrame())
    if isinstance(rf_df, pd.DataFrame) and not rf_df.empty:
        for col in rf_df.select_dtypes(include=["datetime64[ns]", "datetime64"]).columns:
            rf_df[col] = rf_df[col].dt.strftime("%Y-%m-%d")
        result["rf_positions"] = rf_df.fillna("").to_dict(orient="records")
    else:
        result["rf_positions"] = []
    return result


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/snapshot")
def get_snapshot() -> dict:
    """
    Snapshot completo do portfólio: posições enriquecidas com preço atual,
    P&L do dia, top gainers e top losers.
    """
    try:
        snap = _portfolio_snapshot()
        return _serialize_snapshot(snap)
    except Exception as exc:
        logger.exception("Erro em /portfolio/snapshot")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/positions")
def get_positions() -> list[dict]:
    """Lista de posições abertas de renda variável com preços e P&L."""
    try:
        snap = _portfolio_snapshot()
        return snap.get("positions", [])
    except Exception as exc:
        logger.exception("Erro em /portfolio/positions")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/fixed-income")
def get_fixed_income() -> list[dict]:
    """Posições de renda fixa da aba fixa_aberta."""
    try:
        return _fixed_income_data()
    except Exception as exc:
        logger.exception("Erro em /portfolio/fixed-income")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/dividends")
def get_dividends() -> list[dict]:
    """Proventos (dividendos, JCP, etc.) da aba meus_proventos."""
    try:
        return _proventos_data()
    except Exception as exc:
        logger.exception("Erro em /portfolio/dividends")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/summary")
def get_summary() -> dict:
    """
    Totalizadores do patrimônio:
    - rv_total: valor de mercado total RV em BRL
    - rf_total: saldo RF em BRL
    - patrimonio_total: rv + rf + caixa
    - day_pnl_r: P&L do dia em R$
    - day_pnl_pct: P&L do dia em %
    """
    try:
        snap = _portfolio_snapshot()
        positions = snap.get("positions", [])
        rv_total = sum(p["market_value"] for p in positions if p.get("moeda") == "BRL")
        rf_total = snap.get("rf_total", 0.0)
        return {
            "rv_total": round(rv_total, 2),
            "rf_total": round(rf_total, 2),
            "patrimonio_total": round(rv_total + rf_total, 2),
            "day_pnl_r": snap.get("portfolio_day_pnl_r", 0.0),
            "day_pnl_pct": snap.get("portfolio_day_pnl_pct", 0.0),
            "top_gainers": snap.get("top_gainers", []),
            "top_losers": snap.get("top_losers", []),
            "computed_at": snap.get("computed_at"),
        }
    except Exception as exc:
        logger.exception("Erro em /portfolio/summary")
        raise HTTPException(status_code=500, detail=str(exc))

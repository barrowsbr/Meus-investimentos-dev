"""
routers/portfolio.py
====================
Endpoints de carteira de investimentos.
Replica os dados exibidos em 1_Investimentos.py.

Endpoints:
  GET /api/portfolio/snapshot      — posições + P&L do dia + top gainers/losers
  GET /api/portfolio/positions     — lista de posições abertas (RV) com valores em BRL
  GET /api/portfolio/fixed-income  — posições de renda fixa
  GET /api/portfolio/dividends     — proventos recebidos
  GET /api/portfolio/summary       — totalizadores do patrimônio em BRL
"""
from __future__ import annotations

import logging

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


@ttl_cache(ttl=300)
def _fx_rates() -> dict[str, float]:
    """
    Busca cotações de câmbio atuais via yfinance.
    Retorna mapa moeda → taxa BRL (ex: {"USD": 5.75, "EUR": 6.30}).
    Cache de 5 min — FX não muda segundo a segundo.
    """
    import yfinance as yf

    fx_map = {"BRL": 1.0}
    try:
        data = yf.download(
            ["BRL=X", "EURBRL=X"],
            period="5d",
            progress=False,
            auto_adjust=True,
            threads=True,
        )
        if not data.empty:
            closes = data["Close"].ffill()
            last = closes.iloc[-1]
            # BRL=X é USD/BRL (quantos reais por 1 dólar)
            if "BRL=X" in last and pd.notna(last["BRL=X"]):
                fx_map["USD"] = float(last["BRL=X"])
            # EURBRL=X é EUR/BRL
            if "EURBRL=X" in last and pd.notna(last["EURBRL=X"]):
                fx_map["EUR"] = float(last["EURBRL=X"])
    except Exception as exc:
        logger.warning("Erro ao buscar FX rates: %s", exc)

    return fx_map


def _apply_fx(positions: list[dict], fx: dict[str, float]) -> list[dict]:
    """
    Adiciona market_value_brl, total_pnl_r_brl e day_pnl_r_brl a cada posição.
    Posições BRL já estão em reais; outras são convertidas pela taxa do dia.
    """
    result = []
    for p in positions:
        p = dict(p)  # cópia para não mutar o cache
        moeda = (p.get("moeda") or "BRL").upper()
        rate = fx.get(moeda, 1.0)
        p["fx_rate"] = round(rate, 4)
        p["market_value_brl"] = round(p.get("market_value", 0) * rate, 2)
        p["day_pnl_r_brl"] = round(p.get("day_pnl_r", 0) * rate, 2)
        p["total_pnl_r_brl"] = round(p.get("total_pnl_r", 0) * rate, 2)
        # pm_brl útil para exibição comparativa
        p["pm_brl"] = round(p.get("pm", 0) * rate, 2)
        result.append(p)
    return result


def _serialize_snapshot(snap: dict, fx: dict[str, float]) -> dict:
    """Remove DataFrames, aplica FX e garante que o snapshot é JSON-serializável."""
    result = {k: v for k, v in snap.items() if not isinstance(v, pd.DataFrame)}

    # Aplica FX nas posições
    positions = _apply_fx(snap.get("positions", []), fx)
    result["positions"] = positions
    result["top_gainers"] = _apply_fx(snap.get("top_gainers", []), fx)
    result["top_losers"] = _apply_fx(snap.get("top_losers", []), fx)

    # rv_total_brl correto: soma de TODAS as posições convertidas
    result["rv_total_brl"] = round(sum(p["market_value_brl"] for p in positions), 2)
    result["day_pnl_r_brl"] = round(sum(p["day_pnl_r_brl"] for p in positions), 2)

    # rf_positions é um DataFrame — converte para lista de dicts
    rf_df: pd.DataFrame = snap.get("rf_positions", pd.DataFrame())
    if isinstance(rf_df, pd.DataFrame) and not rf_df.empty:
        for col in rf_df.select_dtypes(include=["datetime64[ns]", "datetime64"]).columns:
            rf_df[col] = rf_df[col].dt.strftime("%Y-%m-%d")
        result["rf_positions"] = rf_df.fillna("").to_dict(orient="records")
    else:
        result["rf_positions"] = []

    result["fx_rates"] = fx
    return result


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/snapshot")
def get_snapshot() -> dict:
    """
    Snapshot completo do portfólio: posições enriquecidas com preço atual,
    P&L do dia, top gainers e top losers. Todos os valores monetários em BRL.
    """
    try:
        snap = _portfolio_snapshot()
        fx = _fx_rates()
        return _serialize_snapshot(snap, fx)
    except Exception as exc:
        logger.exception("Erro em /portfolio/snapshot")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/positions")
def get_positions() -> list[dict]:
    """Lista de posições abertas de renda variável com preços e P&L convertidos para BRL."""
    try:
        snap = _portfolio_snapshot()
        fx = _fx_rates()
        return _apply_fx(snap.get("positions", []), fx)
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
    Totalizadores do patrimônio em BRL:
    - rv_total: valor de mercado total RV convertido para BRL
    - rf_total: saldo RF em BRL
    - patrimonio_total: rv + rf
    - day_pnl_r: P&L do dia em R$ (todas as moedas convertidas)
    - day_pnl_pct: P&L do dia em %
    """
    try:
        snap = _portfolio_snapshot()
        fx = _fx_rates()
        positions = _apply_fx(snap.get("positions", []), fx)

        rv_total = sum(p["market_value_brl"] for p in positions)
        prev_rv = rv_total - sum(p["day_pnl_r_brl"] for p in positions)
        day_pnl_r = sum(p["day_pnl_r_brl"] for p in positions)
        day_pnl_pct = (day_pnl_r / prev_rv * 100) if prev_rv > 0 else 0.0

        rf_total = snap.get("rf_total", 0.0)
        return {
            "rv_total": round(rv_total, 2),
            "rf_total": round(rf_total, 2),
            "patrimonio_total": round(rv_total + rf_total, 2),
            "day_pnl_r": round(day_pnl_r, 2),
            "day_pnl_pct": round(day_pnl_pct, 2),
            "top_gainers": _apply_fx(snap.get("top_gainers", []), fx),
            "top_losers": _apply_fx(snap.get("top_losers", []), fx),
            "computed_at": snap.get("computed_at"),
            "fx_rates": fx,
        }
    except Exception as exc:
        logger.exception("Erro em /portfolio/summary")
        raise HTTPException(status_code=500, detail=str(exc))

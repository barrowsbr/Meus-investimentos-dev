"""Proventos (dividends) endpoint."""
from fastapi import APIRouter, HTTPException

from app.services.gsheets_service import fetch_tab
from app.services.market_service import fetch_fx_rates
from app.services.portfolio_service import calcular_proventos_brl

router = APIRouter(prefix="/api/proventos", tags=["proventos"])


@router.get("")
async def get_proventos():
    try:
        rows = await fetch_tab("meus_proventos")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    try:
        fx, _ = await fetch_fx_rates()
    except Exception:
        from app.services.market_service import DEFAULTS_FX
        fx = DEFAULTS_FX

    total_brl, por_mes = calcular_proventos_brl(rows, fx)

    return {
        "total_brl": total_brl,
        "por_mes": por_mes,
        "rows": rows,
    }

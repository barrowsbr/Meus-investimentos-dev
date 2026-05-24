"""Câmbio endpoints."""
from fastapi import APIRouter, HTTPException

from app.models.schemas import CambioMetrics
from app.services.cambio_service import calcular_cambio_metrics, parse_ptax
from app.services.gsheets_service import fetch_tab
from app.services.market_service import fetch_fx_rates

router = APIRouter(prefix="/api/cambio", tags=["cambio"])


@router.get("", response_model=CambioMetrics)
async def get_cambio():
    try:
        rows = await fetch_tab("cambio")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    try:
        fx, _ = await fetch_fx_rates()
    except Exception:
        from app.services.market_service import DEFAULTS_FX
        fx = DEFAULTS_FX

    return calcular_cambio_metrics(rows, fx)


@router.get("/ptax")
async def get_ptax():
    try:
        rows = await fetch_tab("p_tax")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    ptax = parse_ptax(rows)
    if ptax is None:
        raise HTTPException(status_code=404, detail="Dados PTAX não encontrados")
    return ptax

"""Histórico patrimonial endpoint."""
from fastapi import APIRouter, HTTPException

from app.models.schemas import LbHistoricoEntry
from app.services.cambio_service import parse_lb_historic
from app.services.gsheets_service import fetch_tab

router = APIRouter(prefix="/api/historico", tags=["historico"])


@router.get("/patrimonial", response_model=list[LbHistoricoEntry])
async def get_historico_patrimonial():
    try:
        rows = await fetch_tab("lb_historic")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return parse_lb_historic(rows)

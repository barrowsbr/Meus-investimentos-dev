"""Finanças pessoais endpoints."""
from fastapi import APIRouter, HTTPException

from app.services.gsheets_service import fetch_tab

router = APIRouter(prefix="/api/financas", tags=["financas"])


@router.get("")
async def get_financas():
    try:
        rows = await fetch_tab("financas_pessoal")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"rows": rows}


@router.get("/orcamento")
async def get_orcamento():
    try:
        rows = await fetch_tab("financas")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"rows": rows}

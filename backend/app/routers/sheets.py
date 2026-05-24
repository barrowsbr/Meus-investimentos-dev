"""Generic Google Sheets tab endpoint."""
from fastapi import APIRouter, HTTPException

from app.services.gsheets_service import fetch_tab

router = APIRouter(prefix="/api/sheets", tags=["sheets"])


@router.get("/{tab_name}")
async def get_sheet_tab(tab_name: str):
    try:
        rows = await fetch_tab(tab_name)
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

"""Market data endpoints."""
from fastapi import APIRouter, HTTPException

from app.models.schemas import FxRates
from app.services.market_service import fetch_fx_rates, fetch_quotes, yahoo_ticker

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/fx", response_model=FxRates)
async def get_fx():
    try:
        fx, _ = await fetch_fx_rates()
        return fx
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/prices")
async def get_prices(tickers: str):
    """tickers: comma-separated list, e.g. ?tickers=PETR4,IVVB11,VOO"""
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    if not ticker_list:
        raise HTTPException(status_code=400, detail="Nenhum ticker informado")

    yahoo_list = [yahoo_ticker(t) for t in ticker_list]
    try:
        quotes, source = await fetch_quotes(yahoo_list)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"quotes": quotes, "source": source}

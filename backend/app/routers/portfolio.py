"""Main portfolio endpoint — equivalent of /api/cotacoes in Next.js."""
from fastapi import APIRouter, HTTPException

from app.models.schemas import FxRates, PortfolioResponse
from app.services.cambio_service import (
    build_pm_fx_rates,
    calcular_cambio_metrics,
    parse_lb_historic,
    parse_ptax,
)
from app.services.gsheets_service import fetch_tab
from app.services.market_service import fetch_cotacoes, yahoo_ticker
from app.services.portfolio_service import calcular_snapshot

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("", response_model=PortfolioResponse)
async def get_portfolio():
    try:
        transacoes, proventos, fixa_aberta, cambio_rows, ptax_rows, lb_rows = await _fetch_all_tabs()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar dados do Google Sheets: {e}")

    ticker_set: dict[str, dict] = {}
    for row in transacoes:
        ticker = str(row.get("símbolo") or row.get("simbolo") or row.get("ticker") or "").upper().strip()
        if not ticker:
            continue
        if ticker not in ticker_set:
            ticker_set[ticker] = {
                "ticker": ticker,
                "moeda": str(row.get("moeda") or "BRL").upper().strip(),
                "corretora": str(row.get("corretora") or "").strip(),
            }

    tickers = list(ticker_set.values())

    try:
        cotacoes = await fetch_cotacoes(tickers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar cotações: {e}")

    fx_atual: FxRates = cotacoes["fx"]

    cambio = calcular_cambio_metrics(cambio_rows, fx_atual)
    fx_custo = build_pm_fx_rates(cambio)
    ptax = parse_ptax(ptax_rows)
    lb_historic = parse_lb_historic(lb_rows)

    snapshot = calcular_snapshot(transacoes, proventos, fixa_aberta, cotacoes["quotes"], fx_atual, fx_custo)

    ticker_map = {
        t["ticker"]: yahoo_ticker(t["ticker"], t.get("moeda", "BRL"), t.get("corretora", ""))
        for t in tickers
    }

    return PortfolioResponse(
        **snapshot.model_dump(),
        fx=fx_atual,
        fx_source=cotacoes["fx_source"],
        fx_custo=fx_custo,
        cambio=cambio,
        ptax=ptax,
        lb_historic=lb_historic,
        timestamp=cotacoes["timestamp"],
        quotes_found=len(cotacoes["quotes"]),
        quotes_total=len(tickers),
        quotes_errors=cotacoes["errors"],
        ticker_map=ticker_map,
    )


async def _fetch_all_tabs():
    import asyncio
    results = await asyncio.gather(
        fetch_tab("meus_ativos"),
        fetch_tab("meus_proventos"),
        fetch_tab("fixa_aberta"),
        _safe_fetch("cambio"),
        _safe_fetch("p_tax"),
        _safe_fetch("lb_historic"),
    )
    return results


async def _safe_fetch(tab: str):
    try:
        return await fetch_tab(tab)
    except Exception:
        return []

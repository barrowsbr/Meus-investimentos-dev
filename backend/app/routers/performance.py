"""TWR performance endpoint — canonical Modified Dietz with lb_historic NAV."""
from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta
from typing import Any

import yfinance as yf
from fastapi import APIRouter, HTTPException

from app.services.gsheets_service import fetch_tab
from app.services.performance_service import (
    DEFAULT_PREMISES,
    build_flows_from_transactions,
    build_nav_anchors_from_lb_historic,
    calculate_canonical_twr,
    calculate_mwr,
)
from app.services.cambio_service import parse_lb_historic

from app.services.performance_service import decompose_by_currency

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["performance"])

Row = dict[str, Any]


def _fetch_benchmark_sync(ticker: str, start: date, end: date) -> list[tuple[str, float]]:
    try:
        tk = yf.Ticker(ticker)
        hist = tk.history(
            start=start.isoformat(),
            end=(end + timedelta(days=1)).isoformat(),
        )
        if hist.empty:
            logger.warning(f"No data returned for benchmark {ticker}")
            return []
        return [(str(dt.date()), float(row["Close"])) for dt, row in hist.iterrows()]
    except Exception as e:
        logger.error(f"Failed to fetch benchmark {ticker}: {e}", exc_info=True)
        return []


def _to_twr_series(price_series: list[tuple[str, float]]) -> list[dict]:
    if len(price_series) < 2:
        return []
    base = price_series[0][1]
    return [{"date": dt, "twr": round(p / base - 1, 6)} for dt, p in price_series]


async def _safe_fetch(tab: str) -> list[Row]:
    try:
        return await fetch_tab(tab)
    except Exception:
        return []


@router.get("/twr")
async def get_twr(lookback: int = 365):
    try:
        transacoes, lb_rows = await asyncio.gather(
            fetch_tab("meus_ativos"),
            _safe_fetch("lb_historic"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not transacoes:
        raise HTTPException(status_code=422, detail="Sem transações na planilha meus_ativos")

    # ── Build cash flows from transactions ────────────────────────────────────
    flows = build_flows_from_transactions(transacoes)
    if not flows:
        raise HTTPException(status_code=422, detail="Sem fluxos de caixa identificados")

    flows.sort(key=lambda x: x[0])
    first_flow_date = flows[0][0]
    today = date.today()
    lookback_start = today - timedelta(days=lookback)
    effective_start = max(first_flow_date, lookback_start)

    # ── Build NAV anchors from lb_historic ────────────────────────────────────
    lb_entries = parse_lb_historic(lb_rows) if lb_rows else []
    raw_anchors = build_nav_anchors_from_lb_historic(
        [{"data": e.data, "rv": e.rv, "patrimonio": e.patrimonio} for e in lb_entries],
        use_rv=True,
    )

    # Filter anchors to the lookback window
    anchors = [
        (d, nav)
        for d, nav in raw_anchors
        if d >= effective_start
    ]

    # ── Fallback: if no lb_historic data, build proxy NAV from flows ──────────
    if len(anchors) < 2:
        flow_map: dict[date, float] = {}
        for d, f in flows:
            if d >= effective_start:
                flow_map[d] = flow_map.get(d, 0) + f

        all_dates = []
        d = effective_start
        while d <= today:
            all_dates.append(d)
            d += timedelta(days=1)

        cum = 0.0
        anchors = []
        for dt in all_dates:
            cum += flow_map.get(dt, 0)
            if cum > 0 and (not anchors or (dt - anchors[-1][0]).days >= 7):
                anchors.append((dt, cum))
        if anchors and anchors[-1][0] != today and cum > 0:
            anchors.append((today, cum))

    if len(anchors) < 2:
        raise HTTPException(status_code=422, detail="Dados insuficientes para calcular TWR")

    # ── Canonical TWR calculation ─────────────────────────────────────────────
    result = calculate_canonical_twr(anchors, flows, DEFAULT_PREMISES)
    twr_points = result.twr_points

    if not twr_points:
        raise HTTPException(status_code=422, detail="Sem dados no período selecionado")

    # ── Fetch benchmarks ──────────────────────────────────────────────────────
    bench_start = anchors[0][0]
    loop = asyncio.get_event_loop()
    cdi_raw, ibov_raw = await asyncio.gather(
        loop.run_in_executor(None, _fetch_benchmark_sync, "IRFM11.SA", bench_start, today),
        loop.run_in_executor(None, _fetch_benchmark_sync, "^BVSP", bench_start, today),
    )

    cdi_twr = _to_twr_series(cdi_raw)
    ibov_twr = _to_twr_series(ibov_raw)

    twr_total = result.total_twr
    twr_anualizado = result.annualized_twr
    anos = result.total_calendar_days / 365

    cdi_total = cdi_twr[-1]["twr"] if cdi_twr else 0
    ibov_total = ibov_twr[-1]["twr"] if ibov_twr else 0

    # MWR (Money-Weighted Return / IRR)
    mwr = calculate_mwr(
        nav_final=result.capital_base,
        flows=flows,
        start_date=anchors[0][0],
        premises=DEFAULT_PREMISES,
    )

    errors = result.validation.warnings if not result.validation.is_valid else []

    return {
        "summary": {
            "twrTotal": round(twr_total, 6),
            "twrAnualizado": round(twr_anualizado, 6),
            "mwr": round(mwr, 6),
            "navFinal": result.capital_base,
            "navInicial": anchors[0][1],
            "totalInvestido": sum(f for _, f in flows if f > 0),
            "duracaoAnos": round(anos, 4),
            "primeiraData": anchors[0][0].isoformat(),
            "ultimaData": today.isoformat(),
            "vsCDI": round(twr_total - cdi_total, 6),
            "vsIBOV": round(twr_total - ibov_total, 6),
            "cdiTotal": round(cdi_total, 6),
            "ibovTotal": round(ibov_total, 6),
            "ganhoEconomico": round(result.economic_gain, 2),
            "usandoLbHistoric": len(raw_anchors) >= 2,
            "numAnchors": len(anchors),
        },
        "chart": twr_points,
        "benchmarks": {
            "cdi": cdi_twr,
            "ibov": ibov_twr,
        },
        "errors": errors,
        "lookback": lookback,
    }


@router.get("/twr/decomposicao")
async def get_decomposicao():
    """Returns currency bucket decomposition: asset return vs FX return."""
    from app.services.gsheets_service import fetch_tab as ft
    from app.services.cambio_service import build_pm_fx_rates, calcular_cambio_metrics
    from app.services.market_service import fetch_cotacoes
    from app.services.portfolio_service import calcular_carteira_fifo, enriquecer_posicoes

    try:
        transacoes, cambio_rows = await asyncio.gather(
            ft("meus_ativos"),
            _safe_fetch("cambio"),
        )
        cotacoes = await fetch_cotacoes(
            [
                {
                    "ticker": str(r.get("símbolo") or r.get("simbolo") or r.get("ticker") or ""),
                    "moeda": str(r.get("moeda") or "BRL").upper(),
                    "corretora": str(r.get("corretora") or ""),
                }
                for r in transacoes
                if r.get("símbolo") or r.get("simbolo") or r.get("ticker")
            ]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    from app.models.schemas import FxRates
    fx_atual: FxRates = cotacoes["fx"]
    cambio = calcular_cambio_metrics(cambio_rows, fx_atual)
    fx_custo = build_pm_fx_rates(cambio)

    portfolio = calcular_carteira_fifo(transacoes)
    positions = enriquecer_posicoes(portfolio, cotacoes["quotes"], fx_atual, fx_custo)

    pos_dicts = [p.model_dump() for p in positions]
    return decompose_by_currency(pos_dicts)

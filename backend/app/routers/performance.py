"""TWR performance endpoint."""
from __future__ import annotations

import asyncio
from datetime import date, timedelta
from typing import Any

import yfinance as yf
from fastapi import APIRouter, HTTPException

from app.services.cambio_service import build_pm_fx_rates, calcular_cambio_metrics
from app.services.gsheets_service import fetch_tab
from app.services.market_service import fetch_cotacoes, yahoo_ticker
from app.services.portfolio_service import calcular_carteira_fifo

router = APIRouter(prefix="/api", tags=["performance"])

Row = dict[str, Any]


def _get_data_str(row: Row) -> str:
    val = row.get("data") or row.get("date") or row.get("compra") or ""
    return str(val).strip()[:10]


def _get_valor(row: Row) -> float:
    from app.core.format import to_number
    for k in ("valor líquido", "valor liquido", "valor bruto", "valor"):
        v = to_number(row.get(k))
        if v is not None:
            return abs(v)
    return 0.0


def _get_tipo(row: Row) -> str:
    raw = str(row.get("tipo de transação") or row.get("tipo de transacao") or row.get("tipo") or "").lower()
    if any(w in raw for w in ("compra", "buy", "aporte", "subscri", "bonif")):
        return "Compra"
    if any(w in raw for w in ("venda", "sell", "resgate")):
        return "Venda"
    return ""


def _fetch_benchmark_sync(ticker: str, start: date, end: date) -> list[tuple[str, float]]:
    try:
        tk = yf.Ticker(ticker)
        hist = tk.history(start=start.isoformat(), end=(end + timedelta(days=1)).isoformat())
        result = []
        for dt, row in hist.iterrows():
            result.append((str(dt.date()), float(row["Close"])))
        return result
    except Exception:
        return []


def _compute_twr(nav_series: list[tuple[str, float]], flows: list[tuple[str, float]]) -> list[dict]:
    """Simple daily TWR using Modified Dietz approximation per period."""
    if len(nav_series) < 2:
        return []

    flow_map: dict[str, float] = {}
    for dt, f in flows:
        flow_map[dt] = flow_map.get(dt, 0) + f

    points = []
    twr = 1.0
    prev_nav = nav_series[0][1]

    for dt, nav in nav_series[1:]:
        flow = flow_map.get(dt, 0)
        if prev_nav + flow > 0:
            r = (nav - prev_nav - flow) / (prev_nav + flow)
        else:
            r = 0.0
        twr *= (1 + r)
        points.append({"date": dt, "nav": nav, "flow": flow, "ret": r, "twr": twr - 1})
        prev_nav = nav

    return points


@router.get("/twr")
async def get_twr(lookback: int = 365):
    try:
        transacoes, cambio_rows, fixa_aberta = await asyncio.gather(
            fetch_tab("meus_ativos"),
            _safe_fetch("cambio"),
            _safe_fetch("fixa_aberta"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not transacoes:
        raise HTTPException(status_code=422, detail="Sem transações na planilha meus_ativos")

    # Build daily cashflow series from transactions
    flows: list[tuple[str, float]] = []
    for row in transacoes:
        dt = _get_data_str(row)
        if not dt:
            continue
        tipo = _get_tipo(row)
        valor = _get_valor(row)
        if tipo == "Compra" and valor > 0:
            flows.append((dt, valor))
        elif tipo == "Venda" and valor > 0:
            flows.append((dt, -valor))

    if not flows:
        raise HTTPException(status_code=422, detail="Sem fluxos de caixa identificados")

    flows.sort(key=lambda x: x[0])
    start_date = date.fromisoformat(flows[0][0])
    end_date = date.today()
    lookback_start = end_date - timedelta(days=lookback)
    effective_start = max(start_date, lookback_start)

    # Get current portfolio value to build NAV series
    ticker_set: dict[str, dict] = {}
    for row in transacoes:
        t = str(row.get("símbolo") or row.get("simbolo") or row.get("ticker") or "").upper().strip()
        if t and t not in ticker_set:
            ticker_set[t] = {
                "ticker": t,
                "moeda": str(row.get("moeda") or "BRL").upper().strip(),
                "corretora": str(row.get("corretora") or "").strip(),
            }

    try:
        cotacoes = await fetch_cotacoes(list(ticker_set.values()))
        fx_atual = cotacoes["fx"]
        cambio = calcular_cambio_metrics(cambio_rows, fx_atual)
        fx_custo = build_pm_fx_rates(cambio)
        quotes = cotacoes["quotes"]
    except Exception:
        raise HTTPException(status_code=500, detail="Erro ao buscar cotações")

    # Build simplified NAV series from flows (cumulative invested)
    from collections import defaultdict
    daily_flows: dict[str, float] = defaultdict(float)
    for dt, f in flows:
        if dt >= effective_start.isoformat():
            daily_flows[dt] += f

    # Generate date range
    dates = []
    d = effective_start
    while d <= end_date:
        dates.append(d.isoformat())
        d += timedelta(days=1)

    # Cumulative invested as proxy NAV (simplified)
    cum = 0.0
    nav_series: list[tuple[str, float]] = []
    for dt in dates:
        cum += daily_flows.get(dt, 0)
        nav_series.append((dt, cum))

    twr_points = _compute_twr(nav_series, flows)

    # Filter to lookback window
    twr_points = [p for p in twr_points if p["date"] >= effective_start.isoformat()]

    if not twr_points:
        raise HTTPException(status_code=422, detail="Sem dados no período selecionado")

    # Fetch benchmarks
    loop = asyncio.get_event_loop()
    cdi_raw, ibov_raw = await asyncio.gather(
        loop.run_in_executor(None, _fetch_benchmark_sync, "IRFM11.SA", effective_start, end_date),
        loop.run_in_executor(None, _fetch_benchmark_sync, "^BVSP", effective_start, end_date),
    )

    def _to_twr_series(price_series: list[tuple[str, float]]) -> list[dict]:
        if len(price_series) < 2:
            return []
        base = price_series[0][1]
        return [{"date": dt, "twr": (p / base - 1)} for dt, p in price_series]

    cdi_twr = _to_twr_series(cdi_raw)
    ibov_twr = _to_twr_series(ibov_raw)

    twr_total = twr_points[-1]["twr"] if twr_points else 0
    anos = lookback / 365
    twr_anualizado = ((1 + twr_total) ** (1 / anos) - 1) if anos > 0 else twr_total

    cdi_total = cdi_twr[-1]["twr"] if cdi_twr else 0
    ibov_total = ibov_twr[-1]["twr"] if ibov_twr else 0

    return {
        "summary": {
            "twrTotal": twr_total,
            "twrAnualizado": twr_anualizado,
            "navFinal": nav_series[-1][1] if nav_series else 0,
            "navInicial": nav_series[0][1] if nav_series else 0,
            "totalInvestido": sum(f for _, f in flows if f > 0),
            "duracaoAnos": anos,
            "primeiraData": flows[0][0] if flows else "",
            "ultimaData": end_date.isoformat(),
            "vsCDI": twr_total - cdi_total,
            "vsIBOV": twr_total - ibov_total,
            "cdiTotal": cdi_total,
            "ibovTotal": ibov_total,
        },
        "chart": twr_points,
        "benchmarks": {
            "cdi": cdi_twr,
            "ibov": ibov_twr,
        },
        "errors": [],
        "lookback": lookback,
    }


async def _safe_fetch(tab: str) -> list[Row]:
    try:
        return await fetch_tab(tab)
    except Exception:
        return []

"""Composição da carteira — endpoint único para a página Resumo."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException

from app.services.gsheets_service import fetch_tab
from app.services.market_service import fetch_cotacoes
from app.services.portfolio_service import (
    calcular_carteira_fifo,
    calcular_proventos_brl,
    calcular_renda_fixa_brl,
    enriquecer_posicoes,
)
from app.services.cambio_service import build_pm_fx_rates, calcular_cambio_metrics
from app.services.composicao_service import (
    build_custodia,
    build_estrutura_carteira,
    build_look_through,
    build_pareto,
    build_rentabilidade,
    build_risco_retorno,
    get_top_bottom_performer,
)
from app.core.logic import get_moeda_exposicao, is_renda_fixa, is_renda_variavel
from app.models.schemas import FxRates

router = APIRouter(prefix="/api/composicao", tags=["composicao"])

Row = dict[str, Any]


async def _safe_fetch(tab: str) -> list[Row]:
    try:
        return await fetch_tab(tab)
    except Exception:
        return []


def _ticker_list(transacoes: list[Row]) -> list[dict[str, str]]:
    return [
        {
            "ticker": str(r.get("símbolo") or r.get("simbolo") or r.get("ticker") or ""),
            "moeda": str(r.get("moeda") or "BRL").upper(),
            "corretora": str(r.get("corretora") or ""),
        }
        for r in transacoes
        if r.get("símbolo") or r.get("simbolo") or r.get("ticker")
    ]


@router.get("/resumo")
async def get_resumo():
    try:
        transacoes, proventos, fixa_aberta, cambio_rows, composicao_rows = await asyncio.gather(
            fetch_tab("meus_ativos"),
            _safe_fetch("meus_proventos"),
            _safe_fetch("fixa_aberta"),
            _safe_fetch("cambio"),
            _safe_fetch("composicao"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not transacoes:
        raise HTTPException(status_code=422, detail="Sem transações em meus_ativos")

    cotacoes = await fetch_cotacoes(_ticker_list(transacoes))

    fx_atual: FxRates = cotacoes["fx"]
    fx_custo = build_pm_fx_rates(calcular_cambio_metrics(cambio_rows, fx_atual))

    portfolio = calcular_carteira_fifo(transacoes)
    positions = enriquecer_posicoes(portfolio, cotacoes["quotes"], fx_atual, fx_custo)

    total_proventos_brl, _ = calcular_proventos_brl(proventos, fx_atual)
    rf_brl = calcular_renda_fixa_brl(fixa_aberta, fx_atual)

    rv_value = sum(p.valor_atual_brl for p in positions if is_renda_variavel(p.setor))
    rf_value = rf_brl + sum(p.valor_atual_brl for p in positions if is_renda_fixa(p.setor))
    total_portfolio = rv_value + rf_value

    top_performer, bottom_performer = get_top_bottom_performer(positions)

    exposicao_cambial: dict[str, float] = {}
    for p in positions:
        if p.valor_atual_brl < 1:
            continue
        key = get_moeda_exposicao(p.setor, p.moeda)
        exposicao_cambial[key] = exposicao_cambial.get(key, 0) + p.valor_atual_brl
    exposicao_cambial = {
        k: round(v, 2)
        for k, v in sorted(exposicao_cambial.items(), key=lambda x: -x[1])
    }

    return {
        "computed_at": datetime.now(tz=timezone.utc).isoformat(),
        "fx": {
            "USDBRL": fx_atual.USDBRL,
            "EURBRL": fx_atual.EURBRL,
            "CADBRL": fx_atual.CADBRL,
            "GBPBRL": fx_atual.GBPBRL,
        },
        "resumo": {
            "total_portfolio": round(total_portfolio, 2),
            "rv_value": round(rv_value, 2),
            "rf_value": round(rf_value, 2),
            "total_proventos": round(total_proventos_brl, 2),
            "top_performer": top_performer,
            "bottom_performer": bottom_performer,
        },
        "estrutura_carteira": build_estrutura_carteira(positions),
        "exposicao_cambial": exposicao_cambial,
        "custodia": build_custodia(positions),
        "rentabilidade": build_rentabilidade(positions),
        "risco_retorno": build_risco_retorno(positions),
        "pareto": build_pareto(positions),
        "look_through": build_look_through(positions, composicao_rows),
        "errors": cotacoes.get("errors", []),
    }


@router.get("/resumo/etfs")
async def get_etfs():
    try:
        transacoes, cambio_rows, composicao_rows = await asyncio.gather(
            fetch_tab("meus_ativos"),
            _safe_fetch("cambio"),
            _safe_fetch("composicao"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    cotacoes = await fetch_cotacoes(_ticker_list(transacoes))
    fx_atual: FxRates = cotacoes["fx"]
    fx_custo = build_pm_fx_rates(calcular_cambio_metrics(cambio_rows, fx_atual))

    portfolio = calcular_carteira_fifo(transacoes)
    positions = enriquecer_posicoes(portfolio, cotacoes["quotes"], fx_atual, fx_custo)

    return build_look_through(positions, composicao_rows)

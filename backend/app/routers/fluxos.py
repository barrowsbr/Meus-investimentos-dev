"""FlowLedger — auditable cash flow timeline endpoint."""
from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException

from app.services.gsheets_service import fetch_tab
from app.services.flow_ledger import (
    FlowType,
    build_ledger_from_cambio,
    build_ledger_from_proventos,
    build_ledger_from_transacoes,
    merge_ledgers,
)
from app.services.market_service import fetch_cotacoes

router = APIRouter(prefix="/api", tags=["fluxos"])

Row = dict[str, Any]


async def _safe_fetch(tab: str) -> list[Row]:
    try:
        return await fetch_tab(tab)
    except Exception:
        return []


@router.get("/fluxos")
async def get_fluxos(tipo: str = ""):
    """
    Returns the complete auditable cash flow ledger.
    Optional ?tipo= filter: aporte_brl, compra_ativo, venda_ativo,
                             dividendo, taxa, conversao_fx, entrada_rf, saida_rf
    """
    try:
        transacoes, proventos, cambio_rows = await asyncio.gather(
            _safe_fetch("meus_ativos"),
            _safe_fetch("meus_proventos"),
            _safe_fetch("cambio"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Fetch current FX for BRL conversion
    try:
        cotacoes = await fetch_cotacoes([{"ticker": "USDBRL", "moeda": "USD", "corretora": ""}])
        usdbrl = cotacoes["fx"].USDBRL
    except Exception:
        usdbrl = 5.7

    ledger_ativos = build_ledger_from_transacoes(transacoes, usdbrl)
    ledger_prov = build_ledger_from_proventos(proventos, usdbrl)
    ledger_cambio = build_ledger_from_cambio(cambio_rows)
    full_ledger = merge_ledgers(ledger_ativos, ledger_prov, ledger_cambio)

    flows = full_ledger.all()

    # Apply type filter
    if tipo:
        try:
            target_type = FlowType(tipo)
            flows = [f for f in flows if f.flow_type == target_type]
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Tipo inválido: {tipo}")

    flows.sort(key=lambda f: f.date, reverse=True)

    # Build summary by type
    summary: dict[str, float] = {}
    for f in full_ledger.all():
        key = f.flow_type.value
        summary[key] = summary.get(key, 0) + (f.amount_brl or 0)

    total_aportes = sum(
        f.amount_brl or 0
        for f in full_ledger.all()
        if f.flow_type == FlowType.COMPRA_ATIVO
    )
    total_dividendos = sum(
        f.amount_brl or 0
        for f in full_ledger.all()
        if f.flow_type == FlowType.DIVIDENDO
    )
    total_taxas = abs(sum(
        f.amount_brl or 0
        for f in full_ledger.all()
        if f.flow_type == FlowType.TAXA
    ))

    return {
        "summary": {
            "totalAportesBrl": round(total_aportes, 2),
            "totalDividendosBrl": round(total_dividendos, 2),
            "totalTaxasBrl": round(total_taxas, 2),
            "porTipo": {k: round(v, 2) for k, v in summary.items()},
            "totalFluxos": len(full_ledger),
        },
        "fluxos": [
            {
                "date": f.date.isoformat(),
                "amount": round(f.amount, 4),
                "currency": f.currency,
                "flow_type": f.flow_type.value,
                "amount_brl": round(f.amount_brl or 0, 2),
                "ticker": f.ticker,
                "fx_rate": f.fx_rate,
                "notes": f.notes,
            }
            for f in flows
        ],
    }


@router.get("/renda-fixa/posicoes")
async def get_rf_posicoes():
    """Returns RF positions capitalized by SELIC proxy."""
    try:
        fixa_aberta, cotacoes_data = await asyncio.gather(
            _safe_fetch("fixa_aberta"),
            fetch_cotacoes([{"ticker": "USDBRL", "moeda": "USD", "corretora": ""}]),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    from app.services.fixed_income_service import calcular_valor_rf_com_selic
    from app.models.schemas import FxRates
    fx = cotacoes_data["fx"] if isinstance(cotacoes_data, dict) else FxRates()

    try:
        total_brl, positions = calcular_valor_rf_com_selic(fixa_aberta, fx)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "totalBrl": round(total_brl, 2),
        "posicoes": positions,
    }

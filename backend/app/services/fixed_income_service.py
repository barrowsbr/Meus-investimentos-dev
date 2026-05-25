"""Fixed Income Engine — SELIC-curve proxy valuation for open RF positions."""
from __future__ import annotations

from datetime import date
from typing import Any

from app.core.format import to_number
from app.core.utils import parse_date_br
from app.models.schemas import FxRates
from app.services.market_service import fx_to_brl

Row = dict[str, Any]

SELIC_ANNUAL_RATE = 0.15   # 15% p.a. fallback proxy
CALENDAR_DAYS_YEAR = 365


def _get(row: Row, *keys: str) -> Any:
    for k in keys:
        v = row.get(k)
        if v is not None and v != "":
            return v
    return None


def calcular_valor_rf_com_selic(
    fixa_aberta: list[Row],
    fx: FxRates,
    selic_rate: float = SELIC_ANNUAL_RATE,
) -> tuple[float, list[dict]]:
    """
    Capitalizes each open RF position using SELIC proxy from the date of
    last manual update (fixa_aberta.data) to today.

    Returns (total_brl, list_of_enriched_positions).
    """
    today = date.today()
    positions: list[dict] = []
    total_brl = 0.0

    for row in fixa_aberta:
        ticker = str(_get(row, "ticker", "ativo", "nome") or "RF").strip()
        valor_raw = to_number(_get(row, "atual", "valor_atual", "saldo", "valor atual", "valor")) or 0
        if valor_raw <= 0:
            continue

        moeda = str(_get(row, "moeda", "currency") or "BRL").upper().strip() or "BRL"
        tipo = str(_get(row, "tipo", "type") or "CDB").strip()
        data_raw = _get(row, "data", "data_atualizacao", "data_compra", "compra")
        data_ref = parse_date_br(data_raw)

        # Capitalize from last-known date to today
        if data_ref and data_ref < today:
            dias = (today - data_ref).days
            selic_acum = (1 + selic_rate) ** (dias / CALENDAR_DAYS_YEAR) - 1
            valor_hoje = valor_raw * (1 + selic_acum)
        else:
            dias = 0
            selic_acum = 0.0
            valor_hoje = valor_raw

        fator = fx_to_brl(moeda, fx)
        valor_brl = valor_hoje * fator

        total_brl += valor_brl
        positions.append({
            "ticker": ticker,
            "moeda": moeda,
            "tipo": tipo,
            "valor_original": valor_raw,
            "valor_capitalizado": valor_hoje,
            "valor_brl": valor_brl,
            "data_referencia": data_ref.isoformat() if data_ref else None,
            "dias_passados": dias,
            "rendimento_estimado_pct": round(selic_acum * 100, 4),
        })

    return total_brl, positions

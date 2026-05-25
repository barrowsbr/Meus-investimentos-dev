"""
FlowLedger — typed, auditable registry of all cash flows.

Every financial event that moves money in or out of the portfolio
is recorded as a typed CashFlow entry for full auditability.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from typing import Any, Optional

from app.core.format import to_number
from app.core.utils import parse_date_br


class FlowType(str, Enum):
    APORTE_BRL = "aporte_brl"       # Cash deposit in BRL
    CONVERSAO_FX = "conversao_fx"   # FX remittance (BRL → USD/EUR/CAD)
    COMPRA_ATIVO = "compra_ativo"   # Stock/ETF purchase (net zero at portfolio level)
    VENDA_ATIVO = "venda_ativo"     # Stock/ETF sale
    DIVIDENDO = "dividendo"         # Dividend / JCP received
    TAXA = "taxa"                   # Brokerage fees, taxes paid
    ENTRADA_RF = "entrada_rf"       # Fixed-income purchase
    SAIDA_RF = "saida_rf"           # Fixed-income maturity or sale


@dataclass
class CashFlow:
    date: date
    amount: float                       # Value in native currency (+= inflow)
    currency: str                       # 'BRL', 'USD', 'EUR', ...
    flow_type: FlowType
    amount_brl: Optional[float] = None  # Converted to BRL
    ticker: Optional[str] = None
    fx_rate: Optional[float] = None     # FX rate used for conversion
    notes: str = ""


class FlowLedger:
    """Typed cash flow registry with filter / aggregate helpers."""

    def __init__(self) -> None:
        self._flows: list[CashFlow] = []

    def add(self, flow: CashFlow) -> None:
        self._flows.append(flow)

    def all(self) -> list[CashFlow]:
        return list(self._flows)

    def filter_by_type(self, *types: FlowType) -> "FlowLedger":
        sub = FlowLedger()
        sub._flows = [f for f in self._flows if f.flow_type in types]
        return sub

    def filter_by_currency(self, currency: str) -> "FlowLedger":
        sub = FlowLedger()
        sub._flows = [f for f in self._flows if f.currency.upper() == currency.upper()]
        return sub

    def filter_by_ticker(self, ticker: str) -> "FlowLedger":
        sub = FlowLedger()
        sub._flows = [f for f in self._flows if f.ticker == ticker]
        return sub

    def filter_by_period(self, start: date, end: date) -> "FlowLedger":
        sub = FlowLedger()
        sub._flows = [f for f in self._flows if start <= f.date <= end]
        return sub

    def total_native(self) -> float:
        return sum(f.amount for f in self._flows)

    def total_brl(self) -> float:
        return sum(f.amount_brl or 0 for f in self._flows)

    def to_list(self) -> list[dict]:
        return [
            {
                "date": f.date.isoformat(),
                "amount": f.amount,
                "currency": f.currency,
                "flow_type": f.flow_type.value,
                "amount_brl": f.amount_brl,
                "ticker": f.ticker,
                "fx_rate": f.fx_rate,
                "notes": f.notes,
            }
            for f in sorted(self._flows, key=lambda x: x.date)
        ]

    def __len__(self) -> int:
        return len(self._flows)


# ── Ledger builders ───────────────────────────────────────────────────────────

def build_ledger_from_transacoes(
    transacoes: list[dict],
    fx_atual_usdbrl: float = 5.7,
) -> FlowLedger:
    """Builds a FlowLedger from meus_ativos rows."""
    ledger = FlowLedger()

    for row in transacoes:
        raw_date = (
            row.get("data") or row.get("date") or row.get("compra") or ""
        )
        d = parse_date_br(raw_date)
        if d is None:
            continue

        tipo_raw = str(
            row.get("tipo de transação") or row.get("tipo de transacao") or
            row.get("tipo_transacao") or row.get("tipo") or ""
        ).lower()

        ticker = str(
            row.get("símbolo") or row.get("simbolo") or
            row.get("ticker") or row.get("symbol") or ""
        ).upper().strip()

        moeda = str(row.get("moeda") or row.get("currency") or "BRL").upper().strip() or "BRL"

        valor_liq = to_number(
            row.get("valor líquido") or row.get("valor liquido") or
            row.get("valor_liquido") or row.get("valor bruto") or
            row.get("valor_bruto") or row.get("valor") or 0
        ) or 0
        valor_liq = abs(valor_liq)

        taxas = abs(to_number(row.get("taxa de corretagem") or row.get("taxas") or 0) or 0)

        fx = fx_atual_usdbrl if moeda == "USD" else 1.0
        amount_brl = valor_liq * fx

        if any(w in tipo_raw for w in ("compra", "buy", "aporte", "subscri", "bonif")):
            flow_type = FlowType.COMPRA_ATIVO
            ledger.add(CashFlow(
                date=d, amount=valor_liq, currency=moeda,
                flow_type=flow_type, amount_brl=amount_brl,
                ticker=ticker, fx_rate=fx,
            ))
            if taxas > 0:
                ledger.add(CashFlow(
                    date=d, amount=-taxas, currency=moeda,
                    flow_type=FlowType.TAXA, amount_brl=-taxas * fx,
                    ticker=ticker,
                ))

        elif any(w in tipo_raw for w in ("venda", "sell", "resgate")):
            ledger.add(CashFlow(
                date=d, amount=-valor_liq, currency=moeda,
                flow_type=FlowType.VENDA_ATIVO, amount_brl=-amount_brl,
                ticker=ticker, fx_rate=fx,
            ))

    return ledger


def build_ledger_from_proventos(
    proventos: list[dict],
    fx_atual_usdbrl: float = 5.7,
) -> FlowLedger:
    """Builds a FlowLedger from meus_proventos rows."""
    ledger = FlowLedger()

    for row in proventos:
        raw_date = row.get("data") or row.get("date") or ""
        d = parse_date_br(raw_date)
        if d is None:
            continue

        decisao = str(row.get("decisao") or row.get("decisão") or "").lower()
        if "imposto" in decisao:
            continue

        ticker = str(row.get("ticker") or "").upper().strip()
        moeda = str(row.get("moeda") or "BRL").upper().strip() or "BRL"
        valor = abs(to_number(row.get("valor") or 0) or 0)
        if valor <= 0:
            continue

        fx = fx_atual_usdbrl if moeda == "USD" else 1.0
        ledger.add(CashFlow(
            date=d, amount=valor, currency=moeda,
            flow_type=FlowType.DIVIDENDO, amount_brl=valor * fx,
            ticker=ticker, fx_rate=fx,
        ))

    return ledger


def build_ledger_from_cambio(cambio_rows: list[dict]) -> FlowLedger:
    """Builds a FlowLedger from câmbio rows (FX remittances)."""
    ledger = FlowLedger()

    for row in cambio_rows:
        raw_date = row.get("data") or row.get("date") or ""
        d = parse_date_br(raw_date)
        if d is None:
            continue

        moeda_dest = str(
            row.get("moeda_destino") or row.get("moeda destino") or "USD"
        ).upper().strip()
        valor_orig = abs(to_number(
            row.get("valor_origem") or row.get("valor entrada") or
            row.get("valor_entrada") or 0
        ) or 0)
        valor_dest = abs(to_number(
            row.get("valor_destino") or row.get("valor saída") or
            row.get("valor_saida") or 0
        ) or 0)
        taxa = (valor_orig / valor_dest) if valor_dest > 0 else 0

        if valor_orig == 0 and valor_dest == 0:
            continue

        ledger.add(CashFlow(
            date=d, amount=valor_dest, currency=moeda_dest,
            flow_type=FlowType.CONVERSAO_FX, amount_brl=-valor_orig,
            fx_rate=taxa,
            notes=f"Remessa {valor_orig:.2f} BRL → {valor_dest:.2f} {moeda_dest}",
        ))

    return ledger


def merge_ledgers(*ledgers: FlowLedger) -> FlowLedger:
    merged = FlowLedger()
    for lg in ledgers:
        for flow in lg.all():
            merged.add(flow)
    return merged

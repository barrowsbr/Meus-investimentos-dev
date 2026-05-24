"""
Canonical TWR (Time-Weighted Return) engine.

Uses Modified Dietz between NAV anchor points (lb_historic) and chains
sub-period returns geometrically (GIPS / ANBIMA standard).

Flow timing: END_OF_DAY — a purchase on date D does NOT participate in D's return.
Annualization: 252 business days per year (ANBIMA standard).
"""
from __future__ import annotations

import calendar
import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from enum import Enum
from typing import Any, Optional

from app.core.utils import parse_date_br


# ── Enums & Premises ─────────────────────────────────────────────────────────

class FlowTiming(Enum):
    END_OF_DAY = "EOD"    # Flow enters AFTER market close (GIPS default)
    START_OF_DAY = "SOD"  # Flow participates in same-day return


class IncomePolicy(Enum):
    INCLUDE = "include"   # Dividends counted as portfolio return
    EXCLUDE = "exclude"   # Dividends treated as external inflows


class RFValuationMode(Enum):
    CURVA_PROXY = "proxy"  # SELIC 15% p.a. proxy
    MTM_REAL = "mtm"       # Real mark-to-market prices


@dataclass(frozen=True)
class TWRPremises:
    flow_timing: FlowTiming = FlowTiming.END_OF_DAY
    income_policy: IncomePolicy = IncomePolicy.INCLUDE
    rf_valuation_mode: RFValuationMode = RFValuationMode.CURVA_PROXY
    min_capital_for_valid_return: float = 1.0
    selic_annual_rate: float = 0.15
    business_days_per_year: int = 252
    extreme_return_threshold: float = 0.50   # 50% in a single period = warning


DEFAULT_PREMISES = TWRPremises()


# ── Result types ──────────────────────────────────────────────────────────────

@dataclass
class TWRSubPeriod:
    date: str           # ISO end-date of this sub-period
    nav_start: float
    nav_end: float
    flow: float         # Net external flow in this period
    daily_return: float
    cumulative_return: float
    is_anomaly: bool = False


@dataclass
class TWRValidation:
    is_valid: bool
    warnings: list[str] = field(default_factory=list)
    anomaly_periods: list[str] = field(default_factory=list)


@dataclass
class CanonicalTWRResult:
    twr_points: list[dict]          # For frontend chart: [{date, nav, flow, ret, twr}]
    total_twr: float
    annualized_twr: float
    economic_gain: float            # nav_final - nav_initial - sum(flows)
    capital_base: float             # Final NAV
    total_calendar_days: int
    validation: TWRValidation
    subperiods: list[TWRSubPeriod] = field(default_factory=list)


def _empty_result() -> CanonicalTWRResult:
    return CanonicalTWRResult(
        twr_points=[],
        total_twr=0.0,
        annualized_twr=0.0,
        economic_gain=0.0,
        capital_base=0.0,
        total_calendar_days=0,
        validation=TWRValidation(is_valid=False, warnings=["Dados insuficientes"]),
    )


# ── Core calculation ──────────────────────────────────────────────────────────

def calculate_canonical_twr(
    nav_anchors: list[tuple[date, float]],
    flows: list[tuple[date, float]],
    premises: TWRPremises = DEFAULT_PREMISES,
) -> CanonicalTWRResult:
    """
    Multi-period TWR using Modified Dietz between NAV anchors.

    nav_anchors: [(date, nav_value), ...] sorted ascending — these are the
                 periodic portfolio valuations (e.g. from lb_historic).
    flows:       [(date, flow_amount), ...] — external cash flows (+= inflow).

    Algorithm per sub-period [t_start, t_end]:
        total_flow = Σ CF_i   (for all flows within the period)
        weighted_flow = Σ CF_i * ((t_end - t_i).days / D)  # Modified Dietz weight
        return_i = (NAV_end - NAV_start - total_flow) / (NAV_start + weighted_flow)

    Then: TWR = ∏(1 + return_i) - 1
    Annualized using 252 business days per year (ANBIMA).
    """
    if len(nav_anchors) < 2:
        return _empty_result()

    # Deduplicate and sort anchors
    anchors = sorted(set(nav_anchors), key=lambda x: x[0])

    # Build flow map: date -> net flow
    flow_map: dict[date, float] = {}
    for d, f in flows:
        flow_map[d] = flow_map.get(d, 0) + f

    cumulative = 1.0
    subperiods: list[TWRSubPeriod] = []
    twr_points: list[dict] = []
    warnings: list[str] = []
    anomaly_periods: list[str] = []

    for i in range(len(anchors) - 1):
        d_start, nav_start = anchors[i]
        d_end, nav_end = anchors[i + 1]

        total_days = (d_end - d_start).days
        if total_days <= 0:
            continue

        # EOD: flows on d_end date belong to the NEXT period
        period_flows = [
            (d, f)
            for d, f in flow_map.items()
            if d_start < d < d_end
        ]
        # For EOD: flows on d_start itself were yesterday's EOD so include them
        if d_start in flow_map:
            period_flows.insert(0, (d_start, flow_map[d_start]))

        total_flow = sum(f for _, f in period_flows)

        # Modified Dietz weighted denominator
        if premises.flow_timing == FlowTiming.END_OF_DAY:
            # Weight = fraction of period remaining after flow
            weighted_flow = sum(
                f * ((d_end - d).days / total_days)
                for d, f in period_flows
            )
        else:
            # SOD: flow participates fully from start
            weighted_flow = total_flow

        denominator = nav_start + weighted_flow

        if denominator < premises.min_capital_for_valid_return:
            r = 0.0
        else:
            r = (nav_end - nav_start - total_flow) / denominator

        is_anomaly = abs(r) > premises.extreme_return_threshold
        if is_anomaly:
            anomaly_periods.append(d_end.isoformat())
            warnings.append(
                f"Retorno {r:.1%} no período até {d_end} pode ser anômalo "
                f"(NAV {nav_start:.0f}→{nav_end:.0f}, flow {total_flow:.0f})"
            )
            # Cap anomalous returns to avoid polluting the series
            r = max(-0.5, min(0.5, r))

        cumulative *= (1 + r)

        sp = TWRSubPeriod(
            date=d_end.isoformat(),
            nav_start=nav_start,
            nav_end=nav_end,
            flow=total_flow,
            daily_return=r,
            cumulative_return=cumulative - 1,
            is_anomaly=is_anomaly,
        )
        subperiods.append(sp)
        twr_points.append({
            "date": d_end.isoformat(),
            "nav": nav_end,
            "flow": total_flow,
            "ret": round(r, 6),
            "twr": round(cumulative - 1, 6),
        })

    total_twr = cumulative - 1
    total_calendar_days = (anchors[-1][0] - anchors[0][0]).days

    if total_calendar_days > 0 and total_twr > -1:
        biz_days = total_calendar_days * (premises.business_days_per_year / 365)
        annualized = (1 + total_twr) ** (premises.business_days_per_year / max(biz_days, 1)) - 1
    else:
        annualized = total_twr

    nav_initial = anchors[0][1]
    nav_final = anchors[-1][1]
    all_flows = sum(flow_map.values())
    economic_gain = nav_final - nav_initial - all_flows

    return CanonicalTWRResult(
        twr_points=twr_points,
        total_twr=total_twr,
        annualized_twr=annualized,
        economic_gain=economic_gain,
        capital_base=nav_final,
        total_calendar_days=total_calendar_days,
        validation=TWRValidation(
            is_valid=len(anomaly_periods) == 0,
            warnings=warnings,
            anomaly_periods=anomaly_periods,
        ),
        subperiods=subperiods,
    )


# ── NAV anchor helpers ────────────────────────────────────────────────────────

def build_nav_anchors_from_lb_historic(
    lb_rows: list[dict],
    use_rv: bool = True,
) -> list[tuple[date, float]]:
    """
    Parses lb_historic rows into (date, nav) anchor pairs.
    use_rv=True → uses the 'rv' field; False → uses 'patrimônio'.
    """
    anchors: list[tuple[date, float]] = []
    for row in lb_rows:
        d = parse_date_br(row.get("data") or row.get("date") or row.get("mes") or "")
        if d is None:
            continue
        nav = float(row.get("rv") or row.get("renda_variavel") or 0) if use_rv else 0
        if nav == 0:
            nav = float(row.get("patrimonio") or row.get("patrimônio") or 0)
        if nav > 0:
            anchors.append((d, nav))

    anchors.sort(key=lambda x: x[0])
    return anchors


def build_flows_from_transactions(
    transacoes: list[dict],
) -> list[tuple[date, float]]:
    """
    Extracts external cash flows from meus_ativos rows.
    Compra = +inflow, Venda = -outflow (money leaving portfolio perspective).
    """
    from app.core.format import to_number

    flows: list[tuple[date, float]] = []

    for row in transacoes:
        raw_date = (
            row.get("data") or row.get("date") or
            row.get("compra") or ""
        )
        d = parse_date_br(raw_date)
        if d is None:
            continue

        tipo_raw = str(
            row.get("tipo de transação") or row.get("tipo de transacao") or
            row.get("tipo_transacao") or row.get("tipo") or ""
        ).lower()

        valor = abs(
            to_number(
                row.get("valor líquido") or row.get("valor liquido") or
                row.get("valor_liquido") or row.get("valor bruto") or
                row.get("valor_bruto") or row.get("valor") or 0
            ) or 0
        )
        if valor <= 0:
            continue

        if any(w in tipo_raw for w in ("compra", "buy", "aporte", "subscri", "bonif")):
            flows.append((d, valor))
        elif any(w in tipo_raw for w in ("venda", "sell", "resgate")):
            flows.append((d, -valor))

    return flows

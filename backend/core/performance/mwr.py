"""
MWR (Money-Weighted Return) / IRR Calculator
=============================================

Calcula a taxa interna de retorno (IRR) que zera o valor presente líquido
dos fluxos de caixa do investidor.

MWR mede a performance REAL do investidor, levando em conta o timing
dos aportes e resgates (diferente do TWR que é timing-neutral).

Implementação: Newton-Raphson com fallback para bisection (sem scipy).

Versão: 1.0.0
Data: 2026-02-11
"""

import pandas as pd
import numpy as np
from dataclasses import dataclass, field
from typing import List, Optional, Tuple


# =============================================================================
# RESULT
# =============================================================================

@dataclass
class MWRResult:
    """Resultado do cálculo de MWR/IRR."""
    irr_annual: float           # Taxa anual que zera o VPL
    irr_period: float           # Taxa do período total
    npv_at_irr: float           # VPL na taxa encontrada (deve ser ~0)
    cashflows_used: int         # Número de fluxos usados
    period_days: int            # Dias no período
    converged: bool             # Se o solver convergiu
    method: str                 # Método usado ('newton', 'bisection', 'fallback')
    notes: str = ""             # Observações

    def __repr__(self) -> str:
        return (
            f"MWRResult(IRR_anual={self.irr_annual:.4%}, "
            f"IRR_periodo={self.irr_period:.4%}, "
            f"converged={self.converged}, method={self.method})"
        )


# =============================================================================
# NPV FUNCTION
# =============================================================================

def _npv(cashflows: List[Tuple[float, float]], rate: float) -> float:
    """
    Calcula NPV com taxa contínua (dia-base).

    Parameters
    ----------
    cashflows : List of (day_fraction, amount)
        day_fraction = (date - date_first) / 365.25
        amount: negativo = aporte, positivo = resgate/NAV final
    rate : float
        Taxa anual a testar

    Returns
    -------
    float: NPV
    """
    if rate <= -1.0:
        return float('inf')

    npv = 0.0
    for t, cf in cashflows:
        try:
            npv += cf / ((1.0 + rate) ** t)
        except (OverflowError, ZeroDivisionError):
            return float('inf')
    return npv


def _npv_derivative(cashflows: List[Tuple[float, float]], rate: float) -> float:
    """Derivada do NPV em relação à taxa (para Newton-Raphson)."""
    if rate <= -1.0:
        return float('inf')

    d_npv = 0.0
    for t, cf in cashflows:
        try:
            d_npv += -t * cf / ((1.0 + rate) ** (t + 1))
        except (OverflowError, ZeroDivisionError):
            return float('inf')
    return d_npv


# =============================================================================
# SOLVERS
# =============================================================================

def _solve_newton(
    cashflows: List[Tuple[float, float]],
    initial_guess: float = 0.1,
    tol: float = 1e-8,
    max_iter: int = 200
) -> Tuple[float, bool]:
    """Newton-Raphson para encontrar IRR."""
    rate = initial_guess

    for _ in range(max_iter):
        f = _npv(cashflows, rate)
        df = _npv_derivative(cashflows, rate)

        if abs(df) < 1e-14:
            break

        step = f / df
        # Dampen large steps
        if abs(step) > 1.0:
            step = np.sign(step) * 1.0

        rate_new = rate - step

        # Keep rate in reasonable bounds
        rate_new = max(rate_new, -0.999)
        rate_new = min(rate_new, 100.0)

        if abs(rate_new - rate) < tol:
            return rate_new, True

        rate = rate_new

    # Check if we're close enough
    return rate, abs(_npv(cashflows, rate)) < 1e-4


def _solve_bisection(
    cashflows: List[Tuple[float, float]],
    low: float = -0.99,
    high: float = 10.0,
    tol: float = 1e-8,
    max_iter: int = 300
) -> Tuple[float, bool]:
    """Bisection method as fallback."""
    f_low = _npv(cashflows, low)
    f_high = _npv(cashflows, high)

    # Check if root exists in interval
    if f_low * f_high > 0:
        # Try wider range
        for h in [50.0, 100.0]:
            f_high = _npv(cashflows, h)
            if f_low * f_high <= 0:
                high = h
                break
        else:
            # No root found in any range
            return 0.0, False

    for _ in range(max_iter):
        mid = (low + high) / 2.0
        f_mid = _npv(cashflows, mid)

        if abs(f_mid) < tol or abs(high - low) < tol:
            return mid, True

        if f_low * f_mid < 0:
            high = mid
            f_high = f_mid
        else:
            low = mid
            f_low = f_mid

    return (low + high) / 2.0, abs(_npv(cashflows, (low + high) / 2.0)) < 1e-4


# =============================================================================
# MAIN FUNCTION
# =============================================================================

def calculate_mwr(
    dated_cashflows: List[Tuple[pd.Timestamp, float]],
    nav_final: float,
    date_final: pd.Timestamp,
    nav_inicial: float = 0.0,
    date_inicial: Optional[pd.Timestamp] = None,
) -> MWRResult:
    """
    Calcula MWR/IRR dos fluxos de caixa.

    Parameters
    ----------
    dated_cashflows : List of (date, amount)
        Fluxos intermediários (não incluir NAV final).
        Convenção: negativo = aporte do investidor, positivo = resgate.
    nav_final : float
        Valor de mercado final do portfólio (tratado como resgate final).
    date_final : Timestamp
        Data do NAV final.
    nav_inicial : float
        NAV no início do período (tratado como aporte inicial). Default 0.
    date_inicial : Timestamp
        Data do NAV inicial. Se None, usa a data do primeiro fluxo.

    Returns
    -------
    MWRResult
    """
    # Build cashflow vector
    all_flows = []

    # Determine base date
    if date_inicial is not None:
        base_date = date_inicial
        if nav_inicial > 0:
            all_flows.append((base_date, -nav_inicial))  # Initial NAV = aporte
    elif dated_cashflows:
        base_date = min(d for d, _ in dated_cashflows)
    else:
        return MWRResult(
            irr_annual=0.0, irr_period=0.0, npv_at_irr=0.0,
            cashflows_used=0, period_days=0,
            converged=False, method='none', notes='No cashflows'
        )

    # Add intermediate flows
    for date, amount in dated_cashflows:
        all_flows.append((date, amount))

    # Add final NAV as positive (liquidation)
    all_flows.append((date_final, nav_final))

    # Sort by date
    all_flows.sort(key=lambda x: x[0])

    # Convert to (year_fraction, amount) format
    cf_normalized = []
    for date, amount in all_flows:
        t = (date - base_date).days / 365.25
        cf_normalized.append((t, amount))

    period_days = (date_final - base_date).days

    if not cf_normalized or period_days <= 0:
        return MWRResult(
            irr_annual=0.0, irr_period=0.0, npv_at_irr=0.0,
            cashflows_used=len(cf_normalized), period_days=period_days,
            converged=False, method='none', notes='Invalid period'
        )

    # Check if all amounts are zero
    total_abs = sum(abs(cf) for _, cf in cf_normalized)
    if total_abs < 1e-6:
        return MWRResult(
            irr_annual=0.0, irr_period=0.0, npv_at_irr=0.0,
            cashflows_used=len(cf_normalized), period_days=period_days,
            converged=True, method='trivial', notes='All zero flows'
        )

    # Try Newton-Raphson first
    irr, converged = _solve_newton(cf_normalized, initial_guess=0.05)
    method = 'newton'

    if not converged:
        # Try different initial guesses
        for guess in [0.0, 0.2, -0.3, 0.5, -0.5]:
            irr, converged = _solve_newton(cf_normalized, initial_guess=guess)
            if converged:
                break

    if not converged:
        # Fallback to bisection
        irr, converged = _solve_bisection(cf_normalized)
        method = 'bisection'

    if not converged:
        # Last resort: simple return as fallback
        total_invested = sum(-cf for _, cf in cf_normalized if cf < 0)
        total_received = sum(cf for _, cf in cf_normalized if cf > 0)
        if total_invested > 0:
            irr = (total_received / total_invested) ** (365.25 / max(period_days, 1)) - 1
        else:
            irr = 0.0
        method = 'fallback'

    # Calculate period return from annual
    irr_annual = irr
    irr_period = (1 + irr_annual) ** (period_days / 365.25) - 1

    npv_at_irr = _npv(cf_normalized, irr_annual)

    return MWRResult(
        irr_annual=irr_annual,
        irr_period=irr_period,
        npv_at_irr=npv_at_irr,
        cashflows_used=len(cf_normalized),
        period_days=period_days,
        converged=converged,
        method=method,
        notes=f"VPL residual: {npv_at_irr:.4f}"
    )


def calculate_mwr_from_nav_flows(
    nav_series: pd.Series,
    flow_series: pd.Series,
    income_series: Optional[pd.Series] = None,
) -> MWRResult:
    """
    Calcula MWR a partir de séries de NAV e fluxos (formato do engine existente).

    Parameters
    ----------
    nav_series : NAV diário
    flow_series : Fluxos diários (positivo = aporte)
    income_series : Proventos diários (opcional, tratados como resgates)

    Returns
    -------
    MWRResult
    """
    if nav_series.empty:
        return MWRResult(
            irr_annual=0.0, irr_period=0.0, npv_at_irr=0.0,
            cashflows_used=0, period_days=0,
            converged=False, method='none', notes='Empty NAV series'
        )

    # Build intermediate cashflows
    dated_cashflows = []

    # Flows: positive in engine = aporte → negative for IRR convention
    for date, flow in flow_series.items():
        if abs(flow) > 0.01:
            dated_cashflows.append((date, -flow))  # Flip sign for IRR

    # Income: dividends received → positive for IRR convention
    if income_series is not None:
        for date, income in income_series.items():
            if abs(income) > 0.01:
                dated_cashflows.append((date, income))  # Already positive

    nav_inicial = nav_series.iloc[0]
    nav_final = nav_series.iloc[-1]
    date_inicial = nav_series.index[0]
    date_final = nav_series.index[-1]

    return calculate_mwr(
        dated_cashflows=dated_cashflows,
        nav_final=nav_final,
        date_final=date_final,
        nav_inicial=nav_inicial,
        date_inicial=date_inicial,
    )

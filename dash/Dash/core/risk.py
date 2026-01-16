import pandas as pd
import numpy as np
from typing import Dict, Optional, Tuple

def calculate_drawdown(series_twr: pd.Series) -> pd.Series:
    """
    Calculates the Drawdown series (percentage drop from peak).
    Input: Cumulative Return Series (Percentage or Factor).
    Output: Drawdown Series (Percentage, e.g., -0.05 for 5% drop).
    """
    if series_twr.empty:
        return pd.Series(dtype=float)
        
    # Assume input is cumulative percentage (e.g. 10.5 for 10.5%)
    # Convert to Wealth Index
    wealth_index = (1 + series_twr/100)
    peaks = wealth_index.cummax()
    drawdown = (wealth_index - peaks) / peaks
    return drawdown

def calculate_risk_metrics(daily_returns: pd.Series, risk_free_rate_annual: float = 0.10) -> Dict[str, float]:
    """
    Calculates Annualized Volatility, Sharpe Ratio, Sortino, Calmar.
    
    Args:
        daily_returns: Series of daily returns (decimal, e.g. 0.01 for 1%).
        risk_free_rate_annual: Annual Risk Free Rate (decimal, e.g. 0.10).
    """
    if daily_returns.empty:
        return {}
    
    # Annualization Factor (Business Days Brazil ~252)
    ANNUALIZATION_FACTOR = 252
    
    # 1. Volatility
    vol_annual = daily_returns.std() * np.sqrt(ANNUALIZATION_FACTOR)
    
    # 2. Risk Free Daily
    rf_daily = (1 + risk_free_rate_annual) ** (1/ANNUALIZATION_FACTOR) - 1
    
    # 3. Sharpe Ratio
    excess_ret = daily_returns - rf_daily
    mean_excess = excess_ret.mean() * ANNUALIZATION_FACTOR
    sharpe = mean_excess / vol_annual if vol_annual > 0 else 0.0
    
    # 4. Sortino Ratio (Downside Deviation)
    downside_returns = daily_returns[daily_returns < 0]
    downside_vol = downside_returns.std() * np.sqrt(ANNUALIZATION_FACTOR)
    sortino = mean_excess / downside_vol if downside_vol > 0 else 0.0
    
    return {
        'volatility': vol_annual * 100, # Return in %
        'sharpe': sharpe,
        'sortino': sortino
    }

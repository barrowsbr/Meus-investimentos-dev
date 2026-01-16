import pandas as pd
import numpy as np

def calculate_correlation_matrix(df_returns: pd.DataFrame) -> pd.DataFrame:
    """
    Calculates the correlation matrix of asset returns.
    """
    if df_returns.empty:
        return pd.DataFrame()
    return df_returns.corr()

def calculate_risk_contribution(df_holdings_mtm: pd.DataFrame, df_returns: pd.DataFrame, window_days: int = 126) -> pd.DataFrame:
    """
    Calculates the PERCENTAGE Risk Contribution of each asset to the portfolio's total volatility.
    Uses Current Weights (Snapshot) and Historical Covariance (Window).
    
    MCR_i = Cov(r_i, r_p) / Sigma_p
    Risk_Contrib_i = Weight_i * MCR_i
    % Risk_Contrib_i = Risk_Contrib_i / Sigma_p
    
    Args:
        df_holdings_mtm: DataFrame [Date x Ticker] with market values. Used to get current weights.
        df_returns: DataFrame [Date x Ticker] with daily returns. Used for covariance.
        window_days: Lookback period for covariance (default 126 days = ~6 months).
        
    Returns:
        DataFrame with columns ['Weight', 'Pct_Risk_Contrib'] sorted by risk contribution.
    """
    if df_holdings_mtm.empty or df_returns.empty:
        return pd.DataFrame()

    # Align data
    common_idx = df_holdings_mtm.index.intersection(df_returns.index)
    returns_window = df_returns.loc[common_idx].tail(window_days)
    
    if returns_window.empty: return pd.DataFrame()

    # Current Weights (Last available row)
    current_holdings = df_holdings_mtm.iloc[-1]
    total_val = current_holdings.sum()
    if total_val == 0: return pd.DataFrame()
    
    weights = current_holdings / total_val
    weights = weights.fillna(0.0)
    
    # Filter only assets with non-zero weight to avoid singular matrices or noise
    active_assets = weights[weights > 0.001].index # > 0.1% weight
    
    if len(active_assets) < 2:
        return pd.DataFrame({'Weight': weights, 'Pct_Risk_Contrib': 0.0})

    w_active = weights[active_assets]
    r_active = returns_window[active_assets]

    # Covariance Matrix (Annualized)
    cov_matrix = r_active.cov() * 252 
    
    # Portfolio Volatility (Annualized)
    # Var_p = w.T * Cov * w
    port_var = w_active.dot(cov_matrix).dot(w_active)
    port_vol = np.sqrt(port_var)
    
    if port_vol == 0: 
        return pd.DataFrame({'Weight': weights, 'Pct_Risk_Contrib': 0.0})
    
    # Marginal Contribution to Risk (MCR)
    # MCR = (Cov * w) / Vol
    mcr = cov_matrix.dot(w_active) / port_vol
    
    # Absolute Risk Contribution
    # RC = w * MCR
    rc = w_active * mcr
    
    # Percent Risk Contribution
    # %RC = RC / Vol
    # Note: sum(%RC) should be 1.0 (or close to it)
    pct_rc = rc / port_vol
    
    df_res = pd.DataFrame({
        'Weight': w_active,
        'Pct_Risk_Contrib': pct_rc
    })
    
    # Add back zero-weight assets for completeness if needed, or leave filtered
    return df_res.sort_values('Pct_Risk_Contrib', ascending=False)

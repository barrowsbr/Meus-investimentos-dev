import pandas as pd
import numpy as np

def calculate_contribution(
    df_daily_holdings: pd.DataFrame, 
    df_daily_returns: pd.DataFrame
) -> pd.DataFrame:
    """
    Calculates the Daily Contribution to Return for each asset/sector.
    
    Logic:
    1. Calculate Portfolio Total Value per day.
    2. Calculate Weight of each asset per day (Value_i / Total_Value).
    3. Contribution_i = Weight_i * Return_i
    
    Args:
        df_daily_holdings: DataFrame [Date x Ticker] with Market Value (R$).
        df_daily_returns: DataFrame [Date x Ticker] with Daily Return (decimal).
        
    Returns:
        df_contribution: DataFrame [Date x Ticker] with Daily Contribution (decimal).
    """
    if df_daily_holdings.empty or df_daily_returns.empty:
        return pd.DataFrame()

    # Align indexes
    common_idx = df_daily_holdings.index.intersection(df_daily_returns.index)
    holdings = df_daily_holdings.loc[common_idx]
    returns = df_daily_returns.loc[common_idx]

    # Calculate Total Portfolio Value (Daily)
    total_value = holdings.sum(axis=1).replace(0, np.nan) # Avoid div by zero

    # Calculate Weights (Lagged 1 day ideally, but concurrent is acceptable approx for daily)
    # Standard GIPS: Weight(t-1) * Return(t). 
    # Here we treat 'holdings' as End-of-Day. So we shift holdings by 1 to get Start-of-Day weight.
    holdings_shifted = holdings.shift(1).fillna(0.0)
    total_shifted = total_value.shift(1).replace(0, np.nan)
    
    # Weights for day t
    weights = holdings_shifted.div(total_shifted, axis=0).fillna(0.0)

    # Contribution = Weight * Return
    # Element-wise multiplication
    contribution = weights * returns

    return contribution

def group_contributions(df_contribution: pd.DataFrame, map_groups: dict) -> pd.DataFrame:
    """
    Aggregates contributions by a grouping key (e.g., Sector, Class).
    
    Args:
        df_contribution: DataFrame [Date x Ticker]
        map_groups: Dict {Ticker: GroupName}
        
    Returns:
        df_grouped: DataFrame [Date x GroupName]
    """
    if df_contribution.empty: return pd.DataFrame()
    
    # Transpose to group by columns (Tickers)
    df_T = df_contribution.T
    df_T['group'] = df_T.index.map(map_groups).fillna('Outros')
    
    # Sum by group
    df_grouped_T = df_T.groupby('group').sum()
    
    df_result = df_grouped_T.T
    df_result.index = pd.to_datetime(df_result.index)
    return df_result

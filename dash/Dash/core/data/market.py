import pandas as pd
import streamlit as st
import yfinance as yf
from typing import List, Dict, Tuple
from datetime import datetime, timedelta

# Cache for 15 minutes to avoid spamming Yahoo API
@st.cache_data(ttl=900, show_spinner=False)
def fetch_historical_data(tickers: List[str], start_date: datetime = None) -> pd.DataFrame:
    """
    Fetches historical price data from Yahoo Finance for TWR calculations.
    
    Args:
        tickers: List of ticker symbols to download
        start_date: Start date for historical data (defaults to 5 years ago)
        
    Returns:
        DataFrame with dates as index and ticker prices as columns
    """
    if not tickers:
        return pd.DataFrame()
    
    # Deduplicate and clean tickers
    unique_tickers = list(set([t.strip().upper() for t in tickers if t.strip()]))
    
    # Filter out non-Yahoo tickers (Fixed Income, Cash, etc.)
    termos_excluir = ['TESOURO', 'CDB', 'LCI', 'LCA', 'IPCA', 'CAIXA', 'SALDO', 'CDI', 'BRL']
    valid_tickers = [t for t in unique_tickers if not any(x in t.upper() for x in termos_excluir)]
    
    if not valid_tickers:
        return pd.DataFrame()
    
    # Default to 5 years of history
    if start_date is None:
        start_date = datetime.now() - timedelta(days=365 * 5)
    
    try:
        # Download all tickers at once
        data = yf.download(
            valid_tickers, 
            start=start_date.strftime('%Y-%m-%d'),
            end=(datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d'),
            progress=False,
            auto_adjust=True,
            threads=True
        )
        
        if data.empty:
            return pd.DataFrame()
        
        # Extract Close prices
        if 'Close' in data.columns.get_level_values(0) if isinstance(data.columns, pd.MultiIndex) else 'Close' in data.columns:
            if isinstance(data.columns, pd.MultiIndex):
                df_close = data['Close']
            else:
                df_close = data[['Close']] if len(valid_tickers) == 1 else data['Close']
                if len(valid_tickers) == 1:
                    df_close.columns = valid_tickers
        else:
            # Single ticker case
            df_close = data.to_frame(name=valid_tickers[0]) if isinstance(data, pd.Series) else data
        
        # Forward fill missing values (weekends, holidays)
        df_close = df_close.ffill()
        
        # Ensure index is DatetimeIndex
        df_close.index = pd.to_datetime(df_close.index)
        
        return df_close
        
    except Exception as e:
        print(f"Error fetching historical data from Yahoo: {e}")
        return pd.DataFrame()


@st.cache_data(ttl=900, show_spinner=False)
def fetch_market_data(tickers: List[str]) -> Tuple[Dict[str, float], Dict[str, float]]:
    """
    Fetches latest pricing data FROM YAHOO FINANCE API.
    Returns: (map_prices, map_changes)
    """
    if not tickers:
        return {}, {}
        
    map_prices = {}
    map_changes = {}
    
    # Deduplicate and clean tickers
    unique_tickers = list(set([t.strip().upper() for t in tickers if t.strip()]))
    
    # Optimization: Map 'BRL=X' logic locally if needed, but yfinance handles 'BRL=X' (USD/BRL).
    # IF the user stores 'BRL=X' meaning 1.0 (Cash implication), we handle it.
    # Usually BRL=X in Yahoo is Currency.
    
    try:
        # Download data for all tickers at once (Batch)
        # Period '5d' to ensure we get at least 2 days of data even on weekends
        data = yf.download(unique_tickers, period="5d", progress=False)['Close']
        
        # If single ticker, data is Series. If multiple, DataFrame.
        if isinstance(data, pd.Series):
             data = data.to_frame(name=unique_tickers[0])
             
        if data.empty:
            return {}, {}
            
        # Standardize: Last valid index might differ per asset? 
        # ffill() propagates last valid observation.
        data_filled = data.ffill()
        
        # Get latest prices
        last_row = data_filled.iloc[-1]
        
        # Get previous prices (for variation)
        # We try to get day-1.
        prev_row = data_filled.iloc[-2] if len(data_filled) >= 2 else last_row
        
        for t in unique_tickers:
            # Special Case: BRL/Cash placeholder
            if t == 'BRL': 
                 # Explicit BRL Cash -> Price 1.0, Change 0.0
                 map_prices[t] = 1.0
                 map_changes[t] = 0.0
                 continue
                 
            # If BRL=X is requested, we allow it to flow through to yfinance (getting ~5.xx)
            # because it is needed for currency conversion of USD assets.
            
            # If the user has BRL=X as an ASSET (Quantity > 0), they are holding Dollar Cash.
            # If they meant Reais Cash, they should use 'BRL' or 'CAIXA' (which we should map to 1.0).
            
            try:
                # Handle MultiIndex columns if yfinance returns complex structure (rare with 'Close' only)
                if t in last_row:
                    price_now = float(last_row[t])
                    price_prev = float(prev_row[t])
                    
                    if pd.notna(price_now):
                         map_prices[t] = price_now
                         map_changes[t] = price_now - price_prev
            except Exception:
                continue
                
    except Exception as e:
        print(f"Error fetching Yahoo data: {e}")
        
    return map_prices, map_changes



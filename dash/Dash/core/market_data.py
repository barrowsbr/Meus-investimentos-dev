import yfinance as yf
import pandas as pd
import streamlit as st
import time
from typing import List, Dict, Tuple

# Constants
BATCH_SIZE = 20
RETRY_COUNT = 3
BACKOFF_FACTOR = 1.5

@st.cache_data(ttl=3600, show_spinner=False)
def fetch_market_data(tickers: List[str]) -> Tuple[Dict[str, float], Dict[str, float]]:
    """
    Robust Yahoo Finance fetcher with retries and batching.
    Returns: (map_prices, map_changes)
    """
    # 1. Filter out non-market tickers (Fixed Income, etc)
    # This logic was previously inline in app.py
    market_tickers = [
        t for t in tickers 
        if 'TESOURO' not in t and 'CDB' not in t and 'LCI' not in t and 'LCA' not in t
    ]
    
    # Always ensure we have currency pairs
    currencies = ['BRL=X', 'CADBRL=X', 'EURBRL=X', 'CHF=X', 'JPY=X', 'EURUSD=X']
    all_tickers = list(set(market_tickers + currencies))
    
    if not all_tickers:
        return {}, {}

    map_prices = {t: 0.0 for t in all_tickers}
    map_changes = {t: 0.0 for t in all_tickers}
    
    # 2. Batch Processing
    chunks = [all_tickers[i:i + BATCH_SIZE] for i in range(0, len(all_tickers), BATCH_SIZE)]
    market_df = pd.DataFrame()
    
    for chunk in chunks:
        for attempt in range(RETRY_COUNT):
            try:
                # yfinance download
                temp = yf.download(chunk, period="5d", progress=False)['Close']
                
                # Normalize single-ticker result to DataFrame
                if isinstance(temp, pd.Series):
                    temp = temp.to_frame(name=chunk[0])
                
                if not temp.empty:
                    market_df = pd.concat([market_df, temp], axis=1)
                break 
            except Exception:
                time.sleep(BACKOFF_FACTOR * (attempt + 1))
                
    # 3. Extract Latest Prices
    if not market_df.empty:
        # Fill missing data (weekends/holidays)
        market_df = market_df.ffill()
        
        for col in market_df.columns:
            try:
                series = market_df[col].dropna()
                series = series[series > 0] # Filter zeroes
                
                if not series.empty:
                    last_price = float(series.iloc[-1])
                    map_prices[col] = last_price
                    
                    if len(series) >= 2:
                        prev_price = float(series.iloc[-2])
                        map_changes[col] = last_price - prev_price
            except:
                continue
                
    return map_prices, map_changes

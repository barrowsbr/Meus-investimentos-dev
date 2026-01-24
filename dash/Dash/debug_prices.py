import sys
import os
import pandas as pd
sys.path.append(os.getcwd())

from core.market_data import fetch_market_data
from core.data_provider import DataProvider

print("--- DEBUG MARKET DATA ---")

# 1. Fetch Raw Dataframe
try:
    df = DataProvider.fetch_data('db_cotacoes')
    print(f"Raw DF Shape: {df.shape}")
    print("Columns:", df.columns.tolist())
    if not df.empty:
        print("Last Row Raw:")
        print(df.iloc[-1].to_dict())
except Exception as e:
    print(f"Error fetching raw: {e}")

# 2. Test Fetch Function with some tickers
tickers = ['BTC-USD', 'BTC', 'ETH-USD', 'PETR4.SA', 'VALE3.SA', 'AAPL', 'IVVB11', 'BRL=X']
print(f"\nFetching prices for: {tickers}")
prices, changes = fetch_market_data(tickers)

print("\nParsed Prices:")
for t in tickers:
    print(f"{t}: {prices.get(t, 'Not Found')} (Change: {changes.get(t, 'N/A')})")

import sys
import os
import pandas as pd
sys.path.append(os.getcwd())

from core.data_loader import load_assets, load_fixed_income
from core.market_data import fetch_market_data
from core.finance import calcular_carteira_fechada

print("--- DEBUG RV CALCULATION ---")

# 1. Load Assets
print("\n1. Loading Assets...")
try:
    df_assets = load_assets()
    print(f"Assets Loaded: {len(df_assets)} rows")
    if not df_assets.empty:
        print("Sample Asset Row:")
        print(df_assets.iloc[0].to_dict())
        print("Types:")
        print(df_assets.dtypes)
    else:
        print("No assets found.")
except Exception as e:
    print(f"Error loading assets: {e}")

# 2. Portfolio Position
print("\n2. Calculating Position...")
try:
    df_pos, _ = calcular_carteira_fechada(df_assets)
    print(f"Positions Calculated: {len(df_pos)} rows")
    if not df_pos.empty:
        print("Sample Position:")
        sample = df_pos.iloc[0]
        print(sample)
        tickers = df_pos['Ticker'].unique().tolist()
        print(f"Tickers: {tickers[:5]}...")
    else:
        tickers = []
except Exception as e:
    print(f"Error calculating position: {e}")
    tickers = []

# 3. Market Data
print("\n3. Fetching Market Data...")
try:
    map_prices, map_changes = fetch_market_data(tickers)
    print(f"Prices Fetched: {len(map_prices)}")
    print("Sample Prices:", list(map_prices.items())[:5])
except Exception as e:
    print(f"Error fetching market data: {e}")
    map_prices = {}

# 4. dry-run Calculation
print("\n4. Simulating Return Calculation...")
for _, row in df_pos.head(5).iterrows():
    t = row['Ticker']
    qtd = row['Qtd']
    pm = row['PM_Origem']
    price = map_prices.get(t, 0.0)
    
    print(f"Ticker: {t}")
    print(f"  Qtd: {qtd} (Type: {type(qtd)})")
    print(f"  PM: {pm} (Type: {type(pm)})")
    print(f"  Price: {price} (Type: {type(price)})")
    
    if price > 0:
        rent = (price - pm) / pm if pm > 0 else 0
        print(f"  Rent: {rent:.2%}")
    else:
        print("  Rent: N/A (Price 0)")

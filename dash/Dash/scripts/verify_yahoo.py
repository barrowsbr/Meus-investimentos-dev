import sys
import os
import pandas as pd
sys.path.append(os.getcwd())

from core.market_data import fetch_market_data

def verify():
    print("--- VERIFYING YAHOO FINANCE INTEGRATION ---")
    
    tickers = ['PETR4.SA', 'VALE3.SA', 'BRL=X', 'AAPL', 'BTC-USD']
    print(f"Fetching: {tickers}")
    
    try:
        prices, changes = fetch_market_data(tickers)
        
        print("\nResults:")
        for t in tickers:
            p = prices.get(t, 0.0)
            c = changes.get(t, 0.0)
            print(f"{t:<10} | Price: {p:>10.4f} | Change: {c:>10.4f}")
            
        # Assertion
        if prices.get('PETR4.SA', 0) > 1 and prices.get('BRL=X', 0) > 1:
            print("\nSUCCESS: Data flowing from Yahoo!")
        else:
            print("\nFAILURE: Zeros detected.")
            
    except Exception as e:
        print(f"CRITICAL ERROR: {e}")

if __name__ == "__main__":
    verify()

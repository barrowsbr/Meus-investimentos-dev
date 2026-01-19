
import pandas as pd
from core.data_loader import load_assets, load_proventos
import streamlit as st

def troubleshoot():
    print("--- 1. Testing load_assets() ---")
    df = load_assets()
    if df.empty:
        print("❌ load_assets returned EMPTY DataFrame")
    else:
        print(f"✅ Loaded {len(df)} rows.")
        print("Columns:", df.columns.tolist())
        print("dtypes:")
        print(df.dtypes)
        print("\nFirst 5 rows:")
        print(df.head(5))
        
        if 'data' in df.columns:
            print("\nDate Column Sample:")
            print(df['data'].head(5))
            print("NaT count:", df['data'].isna().sum())
            
    print("\n\n--- 2. Testing load_proventos() ---")
    df_p = load_proventos()
    if df_p.empty:
        print("❌ load_proventos returned EMPTY DataFrame")
    else:
        print(f"✅ Loaded {len(df_p)} rows.")
        print(df_p.head(3))

if __name__ == "__main__":
    troubleshoot()

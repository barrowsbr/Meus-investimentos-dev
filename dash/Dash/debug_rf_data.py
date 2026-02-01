
import pandas as pd
import sys
import os

# Add dash root to path
sys.path.append(os.getcwd())

from core.data.loader import load_fixed_income_manual, load_fixed_income
from core.finance import summarize_fixed_income_hybrid

def debug_rf():
    print("--- DEBUGGING RF DATA ---")
    
    # 1. Inspect Manual Data
    print("\n1. LOAD FIXED INCOME MANUAL:")
    try:
        df_manual = load_fixed_income_manual()
        if df_manual.empty:
            print("df_manual is EMPTY")
        else:
            print(f"Columns: {df_manual.columns.tolist()}")
            print(df_manual[['Ticker', 'Moeda', 'Atual']].head(10))
            
            # Check for specific terms
            mask = df_manual['Ticker'].str.contains('Caixa|Cash|Disponivel|Saldo', case=False, na=False)
            print("\nPotential Cash Entries in Manual:")
            print(df_manual[mask][['Ticker', 'Moeda', 'Atual']])
            
            usd_entries = df_manual[df_manual['Moeda'] == 'USD']
            print(f"\nUSD Entries in Manual: {len(usd_entries)}")
            if not usd_entries.empty:
                print(usd_entries[['Ticker', 'Moeda', 'Atual']])

    except Exception as e:
        print(f"Error loading manual: {e}")

    # 2. Inspect Raw Data
    print("\n2. LOAD FIXED INCOME RAW:")
    try:
        df_raw = load_fixed_income()
        if df_raw.empty:
            print("df_raw is EMPTY")
        else:
            print(f"Columns: {df_raw.columns.tolist()}")
            # Check for USD in raw
            usd_raw = df_raw[df_raw['Moeda'] == 'USD']
            print(f"\nUSD Entries in RAW: {len(usd_raw)}")
            if not usd_raw.empty:
                print(usd_raw[['Ticker', 'Moeda', 'Valor', 'Tipo']].head())

    except Exception as e:
        print(f"Error loading raw: {e}")

    # 3. Test Hybrid Summary
    print("\n3. HYBRID SUMMARY PREVIEW:")
    try:
        if not df_manual.empty and not df_raw.empty:
            df_comp = summarize_fixed_income_hybrid(df_manual, df_raw)
            print(f"Columns: {df_comp.columns.tolist()}")
            
            mask_cx = df_comp['Ticker'].str.contains('Caixa|Cash|Disponivel|Saldo', case=False, na=False)
            print("\nCash Entries in Hybrid Summary:")
            print(df_comp[mask_cx][['Ticker', 'Moeda', 'Atual', 'Investido']])
            
    except Exception as e:
        print(f"Error in hybrid summary: {e}")

if __name__ == "__main__":
    debug_rf()

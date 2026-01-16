import pandas as pd
import os
import sys

# Add project root to path
sys.path.append(os.path.abspath(r"g:\Meu Drive\Finanças\Investimentos\Meus-investimentos\dash\Dash"))

from core.data_loader import load_cambio

def debug():
    print("--- DEBUG CAMBIO START ---")
    df = load_cambio()
    
    if df.empty:
        print("ERROR: DataFrame is Empty.")
    else:
        print(f"Loaded {len(df)} rows.")
        print("\nColumns Found:")
        print(df.columns.tolist())
        
        print("\nFirst 5 Rows:")
        print(df.head())
        
        print("\nData Types:")
        print(df.dtypes)
        
        print("\nCalculations:")
        if 'valor_origem' in df.columns:
            print(f"Sum Valor Origem: {df['valor_origem'].sum()} (Type: {df['valor_origem'].dtype})")
        else:
            print("MISSING 'valor_origem' column")
            
        if 'valor_destino' in df.columns:
            print(f"Sum Valor Destino: {df['valor_destino'].sum()} (Type: {df['valor_destino'].dtype})")
        else:
            print("MISSING 'valor_destino' column")

if __name__ == "__main__":
    debug()

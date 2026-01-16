import pandas as pd
import os
import sys

# Add project root to path
sys.path.append(os.path.abspath(r"g:\Meu Drive\Finanças\Investimentos\Meus-investimentos\dash\Dash"))

from core.data_loader import load_cambio

def debug():
    df = load_cambio()
    print("Unique Moeda Origem:", df['moeda_origem'].unique())
    print("Unique Moeda Destino:", df['moeda_destino'].unique())
    
    print("\nSample Row:")
    print(df[['moeda_origem', 'moeda_destino', 'valor_origem', 'valor_destino']].head())

if __name__ == "__main__":
    debug()

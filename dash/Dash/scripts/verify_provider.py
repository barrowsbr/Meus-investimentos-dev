import sys
import os
import pandas as pd

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.data_provider import DataProvider
import streamlit as st

# Mock st.secrets for local run if needed, but core/gsheets.py handles local file fallback
# Just run checking

def verify():
    print("Testing DataProvider...")
    
    try:
        df_assets = DataProvider.get_assets()
        print(f"Assets: {len(df_assets)} rows")
        print(df_assets.head(1).to_string())
    except Exception as e:
        print(f"Failed Assets: {e}")

    try:
        df_prov = DataProvider.get_proventos()
        print(f"Proventos: {len(df_prov)} rows")
    except Exception as e:
        print(f"Failed Proventos: {e}")

if __name__ == "__main__":
    verify()


import streamlit as st
import pandas as pd
from core.data_loader import load_assets
from core.data_provider import DataProvider

st.set_page_config(layout="wide")

def main():
    st.title("Diagnóstico de Valores - Meus Ativos")
    
    # 1. Fetch RAW data directly to see what text comes from Sheets
    df_raw = DataProvider.get_assets()
    st.subheader("1. Dados Brutos (Raw from Sheets)")
    st.dataframe(df_raw.head(20))
    
    if not df_raw.empty:
        # Show unique types in critical columns
        cols_to_check = [c for c in df_raw.columns if any(x in c.lower() for x in ['preco', 'preço', 'qtd', 'quantidade', 'total', 'valor'])]
        
        for c in cols_to_check:
            st.write(f"**Coluna: {c}**")
            st.write("Exemplos de valores únicos (top 10):")
            st.write(df_raw[c].astype(str).unique()[:10])

    # 2. Run Loader (with current logic)
    st.subheader("2. Dados Processados (load_assets)")
    try:
        df_proc = load_assets()
        st.dataframe(df_proc.head(20))
        
        if not df_proc.empty:
            st.write("Estatísticas Descritivas:")
            st.write(df_proc.describe())
    except Exception as e:
        st.error(f"Erro no load_assets: {e}")

if __name__ == "__main__":
    main()

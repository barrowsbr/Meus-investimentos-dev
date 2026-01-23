import pandas as pd
import streamlit as st
from datetime import datetime
from core.data_provider import DataProvider
from core.utils import parse_decimal_br, parse_date_br, normalize_dataframe_columns
from core.logic import normalize_ticker

# ------------------------------------------------------------------------------
# MAPPINGS
# ------------------------------------------------------------------------------

COLUMN_MAP_ASSETS = {
    'símbolo': 'ticker', 'simbolo': 'ticker',
    'tipo de transação': 'tipo', 'tipo_de_transacao': 'tipo', 'tipo_de_transacão': 'tipo', 'tipo_de_transação': 'tipo',
    'preço': 'preco', 'preco': 'preco',
    'data': 'data', 
    'taxa de corretagem': 'taxas', 'taxa_de_corretagem': 'taxas',
    'valor líquido': 'total', 'valor_liquido': 'total', 'valor_líquido': 'total'
}

COLUMN_MAP_PROVENTOS = {
    'ticker': 'ticker', 'símbolo': 'ticker', 'simbolo': 'ticker',
    'data': 'data', 'pagamento': 'data',
    'valor': 'valor', 'valor líquido': 'valor', 'valor_liquido': 'valor',
    'tipo': 'lancamento', 'lançamento': 'lancamento', 'lancamento': 'lancamento', 'evento': 'lancamento',
    'categoria': 'categoria'
}

# ------------------------------------------------------------------------------
# LOADERS
# ------------------------------------------------------------------------------

@st.cache_data(show_spinner=False)
def load_assets() -> pd.DataFrame:
    try:
        df = DataProvider.get_assets()
        if df.empty: return pd.DataFrame()
        
        # 1. Normalize Columns
        df = normalize_dataframe_columns(df, COLUMN_MAP_ASSETS)
        
        # FAILSAFE: Deduplicate locally if utils failed or cache is stale
        if df.columns.duplicated().any():
            # st.warning(f"Duplicates detected in assets: {df.columns[df.columns.duplicated()].tolist()}")
            df = df.loc[:, ~df.columns.duplicated()]
            
        # FAILSAFE: Ensure 'data' is a Series
        if 'data' in df.columns and isinstance(df['data'], pd.DataFrame):
            # If it's still a DataFrame, force select first column
            df['data'] = df['data'].iloc[:, 0]
        
        # 2. Logic Normalization
        if 'ticker' in df.columns:
            df['ticker'] = df['ticker'].apply(normalize_ticker)
            
        if 'tipo' in df.columns:
            def normalize_type(t):
                t_str = str(t).lower().strip()
                if any(x in t_str for x in ['compra', 'buy', 'aporte', 'entrada', 'bonif', 'subscri']):
                    return 'Compra'
                elif any(x in t_str for x in ['venda', 'sell', 'resgate', 'saida', 'saída']):
                    return 'Venda'
                return t 
            df['tipo'] = df['tipo'].apply(normalize_type)
        
        # 3. Type Parsing (Robust)
        if 'data' in df.columns:
             df['data'] = parse_date_br(df['data'])

        for c in ['quantidade', 'preco', 'taxas', 'total']:
            if c in df.columns:
                 df[c] = df[c].apply(parse_decimal_br)
        
        return df.sort_values('data') if 'data' in df.columns else df
    except Exception as e:
        st.error(f"Error loading assets: {e}")
        return pd.DataFrame()

@st.cache_data(show_spinner=False)
def load_proventos() -> pd.DataFrame:
    try:
        df = DataProvider.get_proventos()
        if df.empty: return pd.DataFrame()
        
        df = normalize_dataframe_columns(df, COLUMN_MAP_PROVENTOS)
              
        if 'ticker' in df.columns:
            df['ticker'] = df['ticker'].apply(normalize_ticker)
            
        if 'data' in df.columns:
            df['data'] = parse_date_br(df['data'])
            
        if 'valor' in df.columns:
             df['valor'] = df['valor'].apply(parse_decimal_br)
             
        return df.sort_values('data') if 'data' in df.columns else df
    except Exception as e:
        st.error(f"Error loading proventos: {e}")
        return pd.DataFrame()

@st.cache_data(show_spinner=False)
def load_fixed_income() -> pd.DataFrame:
    try:
        df = DataProvider.get_fixed_income()
        if df.empty: return pd.DataFrame()
        
        # Normalize headers broadly first
        df.columns = df.columns.str.strip().str.lower()

        # Dynamic mapping based on keywords
        # UPDATED: Nova estrutura usa 'compra' como coluna de data principal
        mapa_colunas = {}
        for c in df.columns:
            # Prioriza 'compra' como coluna de data (nova estrutura)
            if c == 'compra': 
                mapa_colunas[c] = 'Compra'
            elif 'data' in c and 'Compra' not in mapa_colunas.values(): 
                mapa_colunas[c] = 'Compra'  # Fallback: mapeia 'data' para 'Compra'
            if 'ticker' in c or 'ativo' in c or 'papel' in c: 
                mapa_colunas[c] = 'Ticker'
            if 'tipo' in c or 'moviment' in c: 
                mapa_colunas[c] = 'Tipo'
            if c == 'valor': 
                mapa_colunas[c] = 'Valor'
            if 'moeda' in c: 
                mapa_colunas[c] = 'Moeda'
        
        df.rename(columns=mapa_colunas, inplace=True)

        # Defaults
        if 'Compra' not in df.columns: df['Compra'] = datetime.now()
        if 'Ticker' not in df.columns: df['Ticker'] = 'Desconhecido'
        if 'Tipo' not in df.columns: df['Tipo'] = 'Compra'
        if 'Moeda' not in df.columns: df['Moeda'] = 'BRL'
        
        df['Compra'] = parse_date_br(df['Compra'])
        df['Tipo'] = df['Tipo'].astype(str).str.strip().str.title()
        df['Ticker'] = df['Ticker'].astype(str).str.strip()
        df['Moeda'] = df['Moeda'].fillna('BRL').astype(str).str.upper().str.strip()
        df['Moeda'] = df['Moeda'].replace({'NAN': 'BRL', 'NONE': 'BRL', '': 'BRL'})

        # Parse Valor column
        if 'Valor' in df.columns:
            df['Valor'] = df['Valor'].apply(parse_decimal_br)
        else:
            df['Valor'] = 0.0

        return df.sort_values(by='Compra')
    except Exception as e:
        st.error(f"Error loading RF: {e}")
        return pd.DataFrame()


@st.cache_data(show_spinner=False)
def load_cambio() -> pd.DataFrame:
    try:
        df = DataProvider.get_cambio()
        if df.empty: return pd.DataFrame()
        
        df.columns = df.columns.str.strip().str.lower()
        
        col_map = {}
        for c in df.columns:
            if 'data' in c: col_map[c] = 'data'
            elif 'moeda' in c and 'origem' in c: col_map[c] = 'moeda_origem'
            elif 'moeda' in c and 'destino' in c: col_map[c] = 'moeda_destino'
            elif 'valor' in c and 'entrada' in c: col_map[c] = 'valor_origem'
            elif 'valor' in c and ('saida' in c or 'saída' in c or 'sa' in c): col_map[c] = 'valor_destino' 
            elif 'vet' in c or 'taxa' in c: col_map[c] = 'taxa'
            elif 'corretora' in c or 'institui' in c: col_map[c] = 'corretora destino'
        df.rename(columns=col_map, inplace=True)
        
        if 'data' in df.columns:
            df['data'] = parse_date_br(df['data'])
            
        for c in ['valor_origem', 'valor_destino', 'taxa']:
            if c in df.columns:
                 df[c] = df[c].apply(parse_decimal_br)
                 
        return df.sort_values('data') if 'data' in df.columns else df
    except Exception as e:
        st.error(f"Error loading cambio: {e}")
        return pd.DataFrame()

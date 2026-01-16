import pandas as pd
import streamlit as st
import os
from datetime import datetime
from typing import Optional, Dict
from config import FILE_ASSETS, FILE_PROVENTOS, FILE_RENDA_FIXA, FILE_CAMBIO, FILE_COMPOSICAO

def normalize_ticker(ticker: str) -> str:
    """
    Standardizes ticker names to institutional format.
    - Adds .SA to Brazilian stocks ending in 3, 4, 5, 6, 11 (if missing).
    - Upper cases and strips whitespace.
    """
    t = str(ticker).upper().strip()
    
    # Common suffix correction
    if not t.endswith('.SA'):
        # Check if it looks like a BR ticker (4 chars + digit) or (4 chars + 11)
        # simplistic heuristic for now, can be improved with regex
        has_digit_suffix = (len(t) > 4 and t[-1].isdigit())
        if has_digit_suffix:
             if t.endswith(('3', '4', '5', '6', '11')):
                 return f"{t}.SA"
    
    return t

@st.cache_data(show_spinner=False)
def load_assets() -> pd.DataFrame:
    """Loads and cleans the Assets (Equity/Stocks) CSV."""
    if not os.path.exists(FILE_ASSETS):
        return pd.DataFrame()

    try:
        df = pd.read_csv(FILE_ASSETS, sep=';', encoding='utf-8')
        # Standardize Columns
        df.columns = df.columns.str.strip().str.lower()
        rename_map = {
            'símbolo': 'ticker', 'tipo de transação': 'tipo', 
            'preço': 'preco', 'data': 'data', 
            'taxa de corretagem': 'taxas', 'valor líquido': 'total'
        }
        df.rename(columns=rename_map, inplace=True)
        
        # Enforce Types
        if 'data' in df.columns:
            df['data'] = pd.to_datetime(df['data'], format='%d/%m/%Y', errors='coerce')
        
        df['ticker'] = df['ticker'].apply(normalize_ticker)
        
        num_cols = ['quantidade', 'preco', 'taxas', 'total']
        for c in num_cols:
            if c in df.columns and df[c].dtype == 'object':
                 df[c] = df[c].astype(str).str.replace('R$', '', regex=False).str.replace('.', '', regex=False).str.replace(',', '.', regex=False)
                 df[c] = pd.to_numeric(df[c], errors='coerce').fillna(0.0)
        
        return df.sort_values('data')
    except Exception as e:
        st.error(f"Error loading assets: {e}")
        return pd.DataFrame()

@st.cache_data(show_spinner=False)
def load_proventos() -> pd.DataFrame:
    """Loads and standardizes Dividends CSV."""
    if not os.path.exists(FILE_PROVENTOS):
        return pd.DataFrame()
        
    try:
        df = pd.read_csv(FILE_PROVENTOS, sep=';', encoding='utf-8')
        if len(df.columns) < 2: 
            df = pd.read_csv(FILE_PROVENTOS, sep=',') # Failover
            
        df.columns = df.columns.str.strip().str.lower()
        
        # Normalize Tickers immediately to match Assets
        if 'ticker' in df.columns:
            df['ticker'] = df['ticker'].apply(normalize_ticker)
            
        if 'data' in df.columns:
            df['data'] = pd.to_datetime(df['data'], dayfirst=True, errors='coerce')
            
        if 'valor' in df.columns and df['valor'].dtype == 'object':
             df['valor'] = df['valor'].astype(str).str.replace(',', '.', regex=False)
             df['valor'] = pd.to_numeric(df['valor'], errors='coerce').fillna(0.0)
             
        return df.sort_values('data')
    except Exception as e:
        st.error(f"Error loading proventos: {e}")
        return pd.DataFrame()

@st.cache_data(show_spinner=False)
def load_fixed_income() -> pd.DataFrame:
    """Loads Fixed Income data."""
    if not os.path.exists(FILE_RENDA_FIXA):
        return pd.DataFrame()
    
    try:
        # Try different encodings
        try:
            df = pd.read_csv(FILE_RENDA_FIXA, sep=';', encoding='latin1')
        except:
            df = pd.read_csv(FILE_RENDA_FIXA, sep=';', encoding='utf-8')
            

        df.columns = df.columns.str.strip().str.lower()

        mapa_colunas = {}
        
        col_data = next((c for c in df.columns if 'data' in c or 'compra' in c or 'date' in c), None)
        if col_data: mapa_colunas[col_data] = 'Data'
        
        col_ticker = next((c for c in df.columns if 'ticker' in c or 'ativo' in c or 'papel' in c or 'produto' in c), None)
        if col_ticker: mapa_colunas[col_ticker] = 'Ticker'
        
        col_tipo = next((c for c in df.columns if 'tipo' in c or 'moviment' in c or 'operacao' in c), None)
        if col_tipo: mapa_colunas[col_tipo] = 'Tipo'
        
        col_valor = next((c for c in df.columns if ('valor' in c and 'atual' not in c) or 'investido' in c or 'aplicado' in c), None)
        if col_valor: mapa_colunas[col_valor] = 'Valor'

        col_atual = next((c for c in df.columns if 'atual' in c or 'bruto' in c or 'saldo' in c), None)
        if col_atual: mapa_colunas[col_atual] = 'Valor Atual'

        col_moeda = next((c for c in df.columns if c in ['moeda', 'moedas', 'currency']), None)
        if col_moeda: mapa_colunas[col_moeda] = 'Moeda'

        df.rename(columns=mapa_colunas, inplace=True)

        if 'Data' not in df.columns: df['Data'] = datetime.now()
        if 'Ticker' not in df.columns: df['Ticker'] = 'Desconhecido'
        if 'Tipo' not in df.columns: df['Tipo'] = 'Compra'
        
        if 'Moeda' not in df.columns: 
            df['Moeda'] = 'BRL'
        
        df['Data'] = pd.to_datetime(df['Data'], dayfirst=True, errors='coerce')
        df['Tipo'] = df['Tipo'].astype(str).str.strip().str.title()
        df['Ticker'] = df['Ticker'].astype(str).str.strip()
        
        df['Moeda'] = df['Moeda'].fillna('BRL').astype(str).str.upper().str.strip()
        df['Moeda'] = df['Moeda'].replace({'NAN': 'BRL', 'NONE': 'BRL', '': 'BRL'})

        for col in ['Valor', 'Valor Atual']:
            if col in df.columns:
                if df[col].dtype == 'object':
                    df[col] = df[col].astype(str).str.replace('R$', '', regex=False).str.strip()
                    df[col] = df[col].str.replace('.', '', regex=False).str.replace(',', '.', regex=False)
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
            else:
                df[col] = 0.0

        return df.sort_values(by='Data')

    except Exception as e:
        return pd.DataFrame()

def summarize_fixed_income(df_rf_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Processes raw Fixed Income transactions into a summary DataFrame (Active/Closed Positions).
    """
    if df_rf_raw.empty:
        return pd.DataFrame(columns=['Ticker', 'Ativo', 'Status', 'Data', 'Investido', 'Atual', 'Lucro', 'Rent. %', 'Moeda'])

    lista_rf_proc = []
    # Group by Ticker
    for ativo, dados in df_rf_raw.groupby('Ticker'):
        dados = dados.sort_values('Data')
        dados_validos = dados[dados['Tipo'] != 'Imposto']
        
        if not dados_validos.empty:
            ult = dados_validos.iloc[-1]
            status = 'Ativo' if ult['Tipo'] == 'Compra' else 'Encerrado'
            
            inv = dados[dados['Tipo']=='Compra']['Valor'].sum()
            
            # Logic: If Active, use Current Value. If Closed, use Exit Values.
            if status == 'Ativo':
                atl = dados[dados['Tipo']=='Compra']['Valor Atual'].sum()
                luc = atl - inv
                data_ref = dados_validos.iloc[0]['Data'] # Start Date
            else:
                saidas = dados[dados['Tipo'].isin(['Venda','Resgate','Vencimento'])]['Valor'].sum()
                atl = saidas
                luc = saidas - inv
                data_ref = dados_validos.iloc[-1]['Data'] # End Date
            
            rent_pct = (luc / inv * 100) if inv > 0 else 0.0
            
            lista_rf_proc.append({
                'Ticker': ativo, 
                'Ativo': ativo, 
                'Status': status,
                'Data': data_ref,
                'Investido': inv, 
                'Atual': atl, 
                'Lucro': luc, 
                'Rent. %': rent_pct,
                'Moeda': dados_validos.iloc[0]['Moeda']
            })
            
    if lista_rf_proc:
        return pd.DataFrame(lista_rf_proc)
    else:
        return pd.DataFrame(columns=['Ticker', 'Ativo', 'Status', 'Data', 'Investido', 'Atual', 'Lucro', 'Rent. %', 'Moeda'])


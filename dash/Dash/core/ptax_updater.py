import pandas as pd
import streamlit as st
from core.data.provider import DataProvider
from datetime import datetime
import re

def atualizar_ptax():
    """
    Scrapes historical USD/BRL PTAX data from IPEA and updates Google Sheets.
    Only adds new records to avoid duplicates.
    """
    url = "https://www.ipeadata.gov.br/ExibeSerie.aspx?stub=1&serid=38590&module=M"
    
    # 1. Load existing data to find the gap
    df_existing = DataProvider.get_ptax()
    last_date = None
    
    if not df_existing.empty:
        print(f"DEBUG PTAX: df_existing columns: {df_existing.columns.tolist()}")
        # Normalize columns for consistency (handles 'data' vs 'Data')
        df_existing.columns = [str(c).strip().capitalize() for c in df_existing.columns]
        
        try:
            from core.utils import parse_date_br
            dates = parse_date_br(df_existing['Data'])
            if dates.notnull().any():
                last_date = dates.max()
        except Exception as e:
            st.warning(f"Aviso ao ler datas existentes: {e}")
            last_date = None

    # 2. Scrape IPEA
    try:
        tables = pd.read_html(url, decimal=',', thousands='.')
        
        df_ipea = None
        for i, t in enumerate(tables):
            # Look for the table with "Data" and a numeric value column
            if t.shape[1] >= 2 and any(t.iloc[:, 0].astype(str).str.contains(r'\d{2}/\d{2}/\d{4}', regex=True, na=False)):
                df_ipea = t
                print(f"DEBUG PTAX: Found table at index {i} with shape {t.shape}")
                break
        
        if df_ipea is None:
            return False, "Não foi possível localizar a tabela de dados no site do IPEA."

        # Clean IPEA DataFrame
        mask_dates = df_ipea.iloc[:, 0].astype(str).str.match(r'\d{2}/\d{2}/\d{4}')
        df_ipea = df_ipea[mask_dates].copy()
        
        # Explicitly rename columns regardless of original header rows
        df_ipea.columns = ['Data', 'Taxa']
        print(f"DEBUG PTAX: IPEA cleaned with columns: {df_ipea.columns.tolist()}")
        
        # Convert Data using our utility
        from core.utils import parse_date_br, parse_decimal_br
        df_ipea['Data_dt'] = parse_date_br(df_ipea['Data'])
        df_ipea['Taxa'] = df_ipea['Taxa'].apply(parse_decimal_br)
        
        df_ipea = df_ipea.dropna(subset=['Data_dt'])
        
        # Filter for new records
        if last_date:
            df_new = df_ipea[df_ipea['Data_dt'] > last_date].copy()
        else:
            df_new = df_ipea.copy()
            
        if df_new.empty:
            return True, "Base já está atualizada."

        # Prepare for save
        if not df_existing.empty:
            df_existing_clean = df_existing.copy()
            df_existing_clean['Data_dt'] = parse_date_br(df_existing_clean['Data'])
            df_existing_clean['Taxa'] = df_existing_clean['Taxa'].apply(parse_decimal_br)
            
            df_combined = pd.concat([df_existing_clean, df_new], ignore_index=True)
            # Remove duplicates by date
            df_combined = df_combined.drop_duplicates(subset=['Data_dt'], keep='last')
            df_combined = df_combined.sort_values('Data_dt', ascending=False)
            
            # Format back to strings for Sheets compatibility
            df_combined['Data'] = df_combined['Data_dt'].dt.strftime('%d/%m/%Y')
            
            df_save = df_combined[['Data', 'Taxa']].copy()
        else:
            df_new = df_new.sort_values('Data_dt', ascending=False)
            df_new['Data'] = df_new['Data_dt'].dt.strftime('%d/%m/%Y')
            df_save = df_new[['Data', 'Taxa']]

        # 3. Save to Sheets
        success = DataProvider.save_data('p_tax', df_save)
        
        if success:
            count = len(df_new)
            # Get latest from original IPEA strings or formatted strings
            latest_str = df_new.sort_values('Data_dt', ascending=False)['Data'].iloc[0]
            return True, f"Sucesso! {count} novas linhas adicionadas até {latest_str}."
        else:
            return False, "Erro ao salvar dados no Google Sheets."

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"DEBUG PTAX ERROR:\n{error_details}")
        return False, f"Erro ao acessar IPEA: {e}"

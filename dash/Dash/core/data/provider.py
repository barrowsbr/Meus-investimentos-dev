import pandas as pd
import streamlit as st
from core.data.gsheets import get_worksheet
from datetime import datetime

SPREADSHEET_NAME = 'gdados'
SHEET_TAB_FIXA_MANUAL = 'fixa_aberta'

class DataProvider:
    """
    Singleton-like provider for application data.
    Abstracts the data source (Google Sheets) from the business logic.
    """
    
    @staticmethod
    @st.cache_data(ttl=600, show_spinner=False)
    def fetch_data(tab_name: str) -> pd.DataFrame:
        """
        Generic fetcher for any tab. Returns a DataFrame.
        Cached for performance (10 min TTL).
        """
        ws = get_worksheet(SPREADSHEET_NAME, tab_name)
        if not ws:
            return pd.DataFrame()
            
        try:
            # Use get_all_values with UNFORMATTED_VALUE to avoid '########' for narrow columns
            # Then manually construct DataFrame with headers
            all_values = ws.get_all_values(value_render_option='UNFORMATTED_VALUE')
            
            if not all_values or len(all_values) < 2:
                return pd.DataFrame()
            
            headers = all_values[0]
            data_rows = all_values[1:]
            
            df = pd.DataFrame(data_rows, columns=headers)
            
            # Standardize empty strings to None for consistency
            df = df.replace(r'^\s*$', None, regex=True)
            df = df.replace('', None)
            
            return df
        except Exception as e:
            st.error(f"Error reading '{tab_name}': {e}")
            return pd.DataFrame()

    @classmethod
    def get_assets(cls) -> pd.DataFrame:
        """Returns standard Assets DataFrame (meus_ativos)"""
        return cls.fetch_data('meus_ativos')

    @classmethod
    def get_proventos(cls) -> pd.DataFrame:
        """Returns Dividends DataFrame (meus_proventos)"""
        return cls.fetch_data('meus_proventos')

    @classmethod
    def get_fixed_income(cls) -> pd.DataFrame:
        """Returns Fixed Income Transactions (renda_fixa)"""
        return cls.fetch_data('renda_fixa')

    @classmethod
    def get_fixed_income_manual(cls) -> pd.DataFrame:
        """Returns Manual Balance (fixa_aberta)"""
        # We need to import the constant or use string. Using string 'fixa_aberta' or cls member if defined.
        # But wait, constants are module level.
        # Let's use string 'fixa_aberta' for simplicity as constant is external to class scope if not careful.
        return cls.fetch_data('fixa_aberta')

    @classmethod
    def get_cambio(cls) -> pd.DataFrame:
        """Returns Forex DataFrame (cambio)"""
        return cls.fetch_data('cambio')

    @classmethod
    def get_db_cotacoes(cls) -> pd.DataFrame:
        """Returns Local Prices DataFrame (db_cotacoes)"""
        return cls.fetch_data('db_cotacoes')
        
    @staticmethod
    def save_data(tab_name: str, df: pd.DataFrame) -> bool:
        """
        Overwrites a tab with the provided DataFrame.
        Used by the Editor.
        """
        ws = get_worksheet(SPREADSHEET_NAME, tab_name)
        if not ws: return False
        
        try:
            # Prepare data
            # Convert NaNs to empty strings for JSON compatibility
            df_clean = df.fillna('')
            
            # Convert dates to string if necessary? 
            # Sheets handles strings well. 
            # Need to ensure columns are consistent.
            
            data = [df_clean.columns.values.tolist()] + df_clean.values.tolist()
            
            ws.clear()
            ws.update(values=data, range_name='A1')
            
            # Clear cache to ensure next fetch gets updated data
            st.cache_data.clear()
            return True
        except Exception as e:
            st.error(f"Error saving to '{tab_name}': {e}")
            return False

    @classmethod
    def get_composicao(cls) -> pd.DataFrame:
        """Returns Composition DataFrame (composicao)"""
        return cls.fetch_data('composicao')

    @classmethod
    def get_ptax(cls) -> pd.DataFrame:
        """Returns PTAX DataFrame (ptax) - Official BCB rates for tax purposes"""
        return cls.fetch_data('ptax')

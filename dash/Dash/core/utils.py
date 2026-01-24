import pandas as pd
# Force reload
import numpy as np

def parse_decimal_br(value) -> float:
    """
    Parses a string number assuming strict Brazilian formatting (comma as decimal).
    Logic: Remove dots (thousands), replace comma with dot.
    """
    if value is None or (isinstance(value, str) and not value.strip()):
        return 0.0
        
    if isinstance(value, (int, float)):
        return float(value)
        
    try:
        # User defined logic: value.replace(".", "").replace(",", ".")
        # Added safety for currency symbols and spaces
        s = str(value).strip().replace('R$', '').replace('US$', '').replace('%', '').replace('\xa0', '').strip()
        clean_s = s.replace(".", "").replace(",", ".")
        return float(clean_s)
    except Exception:
        return 0.0

def format_decimal_br(value, decimals=2) -> str:
    """
    Formats float to Brazilian string: 1,000.00 -> '1.000,00'
    """
    try:
        val = float(value)
        return f"{val:,.{decimals}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except:
        return str(value)

def normalize_dataframe_columns(df: pd.DataFrame, mapping: dict = None) -> pd.DataFrame:
    """
    Standardizes dataframe columns: lowecase, stripped.
    Optionally renames columns based on provided mapping.
    """
    if df.empty:
        return df
        
    df.columns = df.columns.astype(str).str.strip().str.lower()
    
    if mapping:
        df.rename(columns=mapping, inplace=True)
        
    # Deduplicate columns: keep first occurrence
    # This is critical because if multiple columns map to the same name (e.g. 'data'), 
    # df['data'] returns a DataFrame, causing .str accessors to fail.
    df = df.loc[:, ~df.columns.duplicated()]
        
    return df

def parse_date_br(series: pd.Series) -> pd.Series:
    """
    Parses a series to datetime assuming day-first (BR) format primarily.
    Handles 'NaT', empty strings, etc.
    """
    # Clean artifacts like single quotes sometimes exported from Sheets
    clean_series = series.astype(str).str.replace("'", "", regex=False).str.strip()
    return pd.to_datetime(clean_series, dayfirst=True, errors='coerce')

import pandas as pd
import numpy as np

def parse_decimal_br(value) -> float:
    """
    Parses a string number with Brazilian or US formatting into a float.
    Prioritizes Brazilian format (comma as decimal separator).
    
    Examples:
    - '1.000,00' -> 1000.0
    - '10,50' -> 10.5
    - '1000' -> 1000.0
    - '1.050.200,50' -> 1050200.5
    - 'USD 500.00' -> 500.0 (US format fallback if standard float conversion works)
    """
    if pd.isna(value) or value == '':
        return 0.0
    
    if isinstance(value, (int, float)):
        return float(value)
    
    s = str(value).strip()
    
    # Remove currency symbols and extra whitespace
    s = s.replace('R$', '').replace('US$', '').replace('€', '').strip()
    
    if not s:
        return 0.0

    try:
        # Scenario 1: '1.000,00' -> Remove dots, replace comma with dot
        if ',' in s and '.' in s:
            if s.rfind(',') > s.rfind('.'): # Comma is likely decimal (BR)
                clean_s = s.replace('.', '').replace(',', '.')
                return float(clean_s)
            else: # Dot is likely decimal (US: 1,000.00)
                clean_s = s.replace(',', '')
                # clean_s is now 1000.00
                return float(clean_s)
        
        # Scenario 2: '10,50' -> Replace comma with dot (BR simple)
        elif ',' in s:
            clean_s = s.replace(',', '.')
            return float(clean_s)
            
        # Scenario 3: '1.000' vs '1.0'
        # Ambiguous. In financial contexts in BR, '1.000' is usually 1k, but Python sees 1.0.
        # However, many Sheets exports come as '1000' (no dot).
        # We will assume standard float behavior for dots unless it fails.
        # If it has multiple dots '1.000.000', handle it.
        elif s.count('.') > 1:
             clean_s = s.replace('.', '')
             return float(clean_s)

        return float(s)
    except Exception:
        return 0.0

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

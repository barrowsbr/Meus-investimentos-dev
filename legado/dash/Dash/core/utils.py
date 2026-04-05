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
    Handles 'NaT', empty strings, and Excel serial dates (integers from Google Sheets).
    """
    def convert_value(val):
        # Handle None/NaN
        if pd.isna(val):
            return pd.NaT

        # Handle numeric (Excel serial date from Google Sheets)
        # Excel serial: 1 = 1900-01-01, with origin at 1899-12-30 (leap year bug)
        if isinstance(val, (int, float)) and not isinstance(val, bool):
            try:
                # Reasonable Excel date range: ~1900 to ~2200
                if 1 < val < 150000:
                    return pd.to_datetime(val, unit='D', origin='1899-12-30')
            except:
                pass
            return pd.NaT

        # Handle string
        s = str(val).replace("'", "").strip()
        if not s or s.lower() in ['nat', 'none', 'nan', '']:
            return pd.NaT

        # Check if string is numeric (Excel serial as string)
        try:
            num_val = float(s)
            if 1 < num_val < 150000:  # Reasonable Excel date range
                return pd.to_datetime(num_val, unit='D', origin='1899-12-30')
        except ValueError:
            pass

        # Regular date string parsing
        try:
            # If format is YYYY-MM-DD, don't use dayfirst
            if len(s) >= 10 and s[4] == '-' and s[7] == '-':
                return pd.to_datetime(s)
            # Otherwise use dayfirst for BR format (DD/MM/YYYY)
            return pd.to_datetime(s, dayfirst=True)
        except:
            return pd.NaT

    return series.apply(convert_value)

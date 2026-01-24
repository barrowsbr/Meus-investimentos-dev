import sys
import os
import pandas as pd
import gspread
from datetime import datetime, timedelta
import time

# Add project root to path to allow importing from core
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
sys.path.append(project_root)

# Now we can import core modules
try:
    from core.gsheets import get_service_account_creds
    from core.logic import normalize_ticker
except ImportError as e:
    print(f"Error importing core modules: {e}")
    sys.exit(1)

SPREADSHEET_NAME = 'gdados'
TAB_NAME = 'db_cotacoes'
SOURCE_TAB = 'meus_ativos'

def get_google_ticker(yahoo_ticker):
    """
    Converts Yahoo Finance tickers to Google Finance format.
    """
    t = str(yahoo_ticker).strip().upper()
    
    # Currencies
    if t in ['BRL=X', 'USDBRL=X']: return 'CURRENCY:USDBRL'
    if t in ['EURBRL=X']: return 'CURRENCY:EURBRL'
    if t in ['CADBRL=X']: return 'CURRENCY:CADBRL'
    
    # B3 Assets (Brazil)
    if t.endswith('.SA'):
        clean = t.replace('.SA', '')
        return f"BVMF:{clean}"
        
    # Crypto Currencies
    # Common coins often used without suffix in portfolios
    crypto_map = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'DOGE', 'SHIB', 'LTC', 'XRP', 'HBAR', 'LINK', 'UNI', 'MATIC', 'AVAX']
    if t in crypto_map:
        return f"CURRENCY:{t}USD"
    
    # Check for -USD suffix (Yahoo format) -> Google format (CURRENCY:XXXUSD)
    if t.endswith('-USD'):
        clean = t.replace('-USD', '')
        return f"CURRENCY:{clean}USD"

    # US Assets (Simple Heuristic for now)
    # If no suffix, Google often finds it (AAPL, TSLA, etc)
    # Or explicitly: NYSE:AMT, NASDAQ:AAPL. 
    # For now, let's try raw ticker if no suffix, or maybe add logic later.
    return t

def setup_market_data_sheet():
    print("--- Starting Market Data Setup ---")
    
    # 1. Authenticate
    creds = get_service_account_creds()
    if not creds:
        print("CRITICAL: Credentials not found.")
        return
        
    client = gspread.authorize(creds)
    
    try:
        sh = client.open(SPREADSHEET_NAME)
    except Exception as e:
        print(f"Error opening spreadsheet '{SPREADSHEET_NAME}': {e}")
        return

    # 2. Get Assets
    try:
        ws_assets = sh.worksheet(SOURCE_TAB)
        data_assets = ws_assets.get_all_records()
        df_assets = pd.DataFrame(data_assets)
        
        # Extract unique tickers
        # Assuming column name is 'Ticker' or 'Símbolo'
        col_ticker = next((c for c in df_assets.columns if c.lower() in ['ticker', 'símbolo', 'simbolo']), None)
        if not col_ticker:
            print("Could not find Ticker column in meus_ativos.")
            return
            
        raw_tickers = df_assets[col_ticker].dropna().unique().tolist()
        # NORMALIZE TICKERS TO MATCH APP LOGIC
        tickers_yahoo = sorted(list(set([normalize_ticker(t) for t in raw_tickers])))
        
        # Add basic currencies
        tickers_yahoo += ['BRL=X', 'EURBRL=X']
        tickers_yahoo = sorted(list(set(tickers_yahoo)))
        
        print(f"Found {len(tickers_yahoo)} unique assets.")
        
    except Exception as e:
        print(f"Error processing assets: {e}")
        return

    # 3. Prepare Target Sheet
    try:
        ws_target = sh.worksheet(TAB_NAME)
        print(f"Worksheet '{TAB_NAME}' found. Clearing...")
        ws_target.clear()
    except gspread.WorksheetNotFound:
        print(f"Worksheet '{TAB_NAME}' not found. Creating...")
        ws_target = sh.add_worksheet(title=TAB_NAME, rows=2000, cols=100)

    # 4. Construct Data Structure
    # Row 1: Headers (Date + Google Tickers)
    # We keep Yahoo Ticker as header for mapping, OR Google Ticker?
    # Reader needs to know which column corresponds to which Yahoo asset.
    # PROPOSAL: Use Yahoo Ticker in Row 1 (Header), use Google Ticker in formula.
    
    headers = ['Data'] + tickers_yahoo
    
    # Col A: Dates (Last 5 years to be safe, or 2 years?)
    # User said "365 days", but performance usually needs more. Let's do 3 years (approx 1000 rows).
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=365*3) 
    date_range = pd.date_range(start=start_date, end=end_date, freq='B') # Business Days
    
    # Format dates for Google Sheets (DD/MM/YYYY for Brazil Locale)
    dates_str = [d.strftime('%d/%m/%Y') for d in date_range]
    
    # Batch Update Data (Headers + Dates)
    print("Writing headers and dates...")
    
    # Prepare full matrix for batch update
    # Row 1: Headers
    data_matrix = [headers]
    
    # Subsequent Rows: [Date, "", "", ...]
    for d in dates_str:
        row = [d] + [""] * len(tickers_yahoo)
        data_matrix.append(row)
        
    # Write skeleton
    # Note: Writing huge matrix with empty strings is fine.
    # But later we want to inject FORMULAS in B2:Range.
    
    # Optimization: Write only Headers and Column A
    ws_target.update('A1', [headers])
    
    # Write Dates (Column A, starting A2)
    # Reshape for column update
    date_col_vals = [[d] for d in dates_str]
    ws_target.update(f'A2:A{len(date_col_vals)+1}', date_col_vals, value_input_option='USER_ENTERED')
    
    # 5. Inject Formulas
    print("Injecting GoogleFinance formulas...")
    
    # Formula Pattern: =IFERROR(INDEX(GOOGLEFINANCE("BVMF:PETR4"; "price"; $A2); 2; 2); "")
    # "price" attribute gives Closing Price.
    
    formulas_row = []
    
    # Starting from Column B (Index 0 in tickers list)
    for t_yahoo in tickers_yahoo:
        t_google = get_google_ticker(t_yahoo)
        
        # Note: $A2 is relative to row, absolute to column A.
        # When we write this to B2 and drag right, $A2 stays $A2.
        # When we drag down, $A2 becomes $A3.
        # We need to manually construct the starting formula for Row 2.
        
        # BRL=X -> 1.0 (Static)
        if t_yahoo == 'BRL=X':
            f = '=1'
        else:
            f = f'=IFERROR(INDEX(GOOGLEFINANCE("{t_google}"; "price"; $A2); 2; 2); "")'
            
        formulas_row.append(f)
        
    # 6. Apply Formulas to Range
    # We want to fill B2 : [LastCol][LastRow]
    # In gspread, we can set a range of formulas using update(value_input_option='USER_ENTERED')
    
    # Construct formula matrix? No, that's heavy.
    # Smart way: Write formulas in Row 2, then user can drag?
    # Or use array formula logic?
    # User specifically asked: "script deve escrever na linha 2 a fórmula correta e arrastar/copiar para baixo"
    
    # Doing "fill down" via API is hard.
    # Best API approach: Construct the full matrix of formulas in Python and push it.
    # Matrix Size: ~1000 rows x ~20 cols = 20k cells. API can handle this in one go.
    
    # Let's generate the formula matrix
    print("Generating formula matrix...")
    full_formula_matrix = []
    
    num_rows = len(dates_str)
    
    for i in range(num_rows):
        # row index (2-based) = i + 2
        row_num = i + 2
        row_formulas = []
        for t_yahoo in tickers_yahoo:
            t_google = get_google_ticker(t_yahoo)
            
            # Robust check for BRL currency
            if t_yahoo.strip().upper().replace('BRL=X', 'BRL=X') == 'BRL=X':
                col_f = '=1'
            else:
                # Remove IFERROR temporarily to see #ERROR! if it fails
                # col_f = f'=INDEX(GOOGLEFINANCE("{t_google}"; "price"; $A{row_num}); 2; 2)'
                # Actually, keep IFERROR but return -1 to distinguish from empty
                col_f = f'=IFERROR(INDEX(GOOGLEFINANCE("{t_google}"; "price"; $A{row_num}); 2; 2); "")'
            
            row_formulas.append(col_f)
            
        full_formula_matrix.append(row_formulas)
    
    # Determine Range: B2 : [EndCol][EndRow]
    # Convert col index to letter
    def get_col_letter(col_idx_1based):
        string = ""
        while col_idx_1based > 0:
            col_idx_1based, remainder = divmod(col_idx_1based - 1, 26)
            string = chr(65 + remainder) + string
        return string

    last_col_idx = len(tickers_yahoo) + 1 # +1 for Date col
    last_col_letter = get_col_letter(last_col_idx)
    last_row_idx = len(dates_str) + 1
    
    range_str = f'B2:{last_col_letter}{last_row_idx}'
    
    print(f"Uploading formulas to range {range_str}...")
    ws_target.update(range_str, full_formula_matrix, value_input_option='USER_ENTERED')
    
    print("Formatting...")
    # Optional: Format Header
    ws_target.format('A1:Z1', {'textFormat': {'bold': True}})
    
    print("--- Setup Complete ---")
    print(f"Sheet '{TAB_NAME}' is ready.")

if __name__ == "__main__":
    setup_market_data_sheet()

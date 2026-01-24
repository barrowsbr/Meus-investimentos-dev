import sys
import os
import pandas as pd
import gspread
import time
sys.path.append(os.getcwd())

try:
    from core.gsheets import get_service_account_creds
except ImportError as e:
    print(f"Error importing core: {e}")
    sys.exit(1)

TEST_TAB = 'debug_formulas'
SPREADSHEET_NAME = 'gdados'

def test_formulas():
    print("--- PROBING GOOGLE FINANCE FORMULAS ---")
    creds = get_service_account_creds()
    client = gspread.authorize(creds)
    sh = client.open(SPREADSHEET_NAME)
    
    # Create or Clear Debug Tab
    try:
        ws = sh.worksheet(TEST_TAB)
        ws.clear()
    except:
        ws = sh.add_worksheet(TEST_TAB, 20, 10)
        
    print(f"Writing test formulas to '{TEST_TAB}'...")
    
    # Define variations
    # We use BVMF:PETR4 as a baseline stable asset
    ticker = "BVMF:PETR4"
    
    tests = [
        ("Simple_Semi", f'=GOOGLEFINANCE("{ticker}")'),
        ("Simple_Comma", f'=GOOGLEFINANCE("{ticker}")'), # Same for simple
        ("Attr_Semi", f'=GOOGLEFINANCE("{ticker}"; "price")'),
        ("Attr_Comma", f'=GOOGLEFINANCE("{ticker}", "price")'),
        ("Date_Semi_ISO", f'=INDEX(GOOGLEFINANCE("{ticker}"; "price"; "2024-01-20"); 2; 2)'),
        ("Date_Comma_ISO", f'=INDEX(GOOGLEFINANCE("{ticker}", "price", "2024-01-20"), 2, 2)'),
        ("Date_Semi_BR", f'=INDEX(GOOGLEFINANCE("{ticker}"; "price"; "20/01/2024"); 2; 2)'),
        ("Date_Comma_BR", f'=INDEX(GOOGLEFINANCE("{ticker}", "price", "20/01/2024"), 2, 2)'),
        ("Date_Func_Semi", f'=INDEX(GOOGLEFINANCE("{ticker}"; "price"; DATE(2024;1;20)); 2; 2)'),
        ("Date_Func_Comma", f'=INDEX(GOOGLEFINANCE("{ticker}", "price", DATE(2024,1,20)), 2, 2)'),
        ("Current_Script_Logic", f'=IFERROR(INDEX(GOOGLEFINANCE("{ticker}"; "price"; "20/01/2024"); 2; 2); "ERR")')
    ]
    
    # Write descriptions in Col A, Formulas in Col B
    cells_desc = []
    cells_form = []
    
    for i, (desc, fm) in enumerate(tests):
        row = i + 1
        ws.update_cell(row, 1, desc)
        ws.update_cell(row, 2, fm)
        
    print("Waiting 10s for Google Sheets calculation...")
    time.sleep(10)
    
    # Read Values
    print("\n--- RESULTS ---")
    vals = ws.get_all_values()
    for row in vals:
        print(f"{row[0]}: {row[1]}")
        
    # Check locale info if possible (indirectly via number format)
    # 1.5 vs 1,5
    ws.update_cell(15, 1, "=1/2")
    time.sleep(2)
    val_num = ws.cell(15, 1).value
    print(f"\nLocale Check (1/2): '{val_num}'")

if __name__ == "__main__":
    test_formulas()

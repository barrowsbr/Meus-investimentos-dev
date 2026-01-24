import sys
import os
import pandas as pd
import gspread
sys.path.append(os.getcwd())

try:
    from core.gsheets import get_service_account_creds
except ImportError:
    print("Error importing core")

def inspect():
    print("--- INSPECTING RAW SHEET DATA ---")
    creds = get_service_account_creds()
    client = gspread.authorize(creds)
    sh = client.open('gdados')
    ws = sh.worksheet('db_cotacoes')
    
    # Get headers
    headers = ws.row_values(1)
    print(f"Headers ({len(headers)}): {headers[:5]} ...")
    
    # Get last 3 rows raw
    all_vals = ws.get_all_values()
    print(f"Total Rows: {len(all_vals)}")
    
    if len(all_vals) > 1:
        print("\nLast 3 Rows Raw:")
        for row in all_vals[-3:]:
            print(row[:5]) # Print first 5 cols
            
    # Check formula in row 2 cell 2 (B2)
    print("\nFormula in B2:")
    print(ws.cell(2, 2, value_render_option='FORMULA').value)

if __name__ == "__main__":
    inspect()

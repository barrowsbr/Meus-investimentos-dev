import sys
import os
import gspread
sys.path.append(os.getcwd())

from core.gsheets import get_service_account_creds

def inspect_top():
    print("--- INSPECTING SHEET TOP (A1:E5) ---")
    creds = get_service_account_creds()
    start = gspread.authorize(creds)
    sh = start.open('gdados')
    ws = sh.worksheet('db_cotacoes')
    
    # Get Top 5 rows
    top_rows = ws.get_values('A1:E5') 
    
    for i, row in enumerate(top_rows):
        print(f"Row {i+1}: {row}")

if __name__ == "__main__":
    inspect_top()

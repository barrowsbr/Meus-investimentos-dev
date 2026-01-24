import sys
import os
import gspread
sys.path.append(os.getcwd())

from core.gsheets import get_service_account_creds

def inspect_tab():
    print("--- INSPECTING TAB: fixa_atual ---")
    try:
        creds = get_service_account_creds()
        client = gspread.authorize(creds)
        sh = client.open('gdados')
        ws = sh.worksheet('fixa_aberta')
        
        headers = ws.row_values(1)
        print(f"Headers: {headers}")
        
        vals = ws.get_all_values()
        if len(vals) > 1:
            print(f"Row 2: {vals[1]}")
            print(f"Row 3: {vals[2]}")
            
    except Exception as e:
        print(f"Error accessing 'fixa_atual': {e}")
        print("List of available worksheets:")
        try:
             creds = get_service_account_creds()
             client = gspread.authorize(creds)
             sh = client.open('gdados')
             for ws in sh.worksheets():
                 print(f" - '{ws.title}'")
        except:
             print("Could not list worksheets.")

if __name__ == "__main__":
    inspect_tab()

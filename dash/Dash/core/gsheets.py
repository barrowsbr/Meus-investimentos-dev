import gspread
import streamlit as st
from oauth2client.service_account import ServiceAccountCredentials
import os
import toml

# Constants
# Try to load from secrets, fallback to local file (for dev/migration context)
# In production Streamlit Cloud, secrets are loaded automatically into st.secrets
# For local dev, we might use secrets.toml or service_account.json

def get_service_account_creds():
    """
    Returns credentials object. 
    Prioritizes st.secrets if available (Streamlit Cloud).
    Fallbacks to local 'service_account.json' if standard secrets aren't set.
    """
    scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
    
    # 1. Try Local File (Dev Environment / Migration) FIRST
    # This avoids triggering Streamlit's "No secrets found" error if we are just running locally
    current_dir = os.path.dirname(os.path.abspath(__file__)) # core/
    project_root = os.path.dirname(current_dir) # Dash/
    local_file = os.path.join(project_root, 'service_account.json')
    
    if os.path.exists(local_file):
        return ServiceAccountCredentials.from_json_keyfile_name(local_file, scope)

    # 2. Try Streamlit Secrets (Cloud Environment)
    try:
        if hasattr(st, "secrets") and "gcp_service_account" in st.secrets:
            return ServiceAccountCredentials.from_json_keyfile_dict(st.secrets["gcp_service_account"], scope)
    except:
        # Ignore any secrets loading errors if file didn't exist
        pass
        
    return None

@st.cache_resource(ttl=3600)
def connect_to_gsheets():
    """
    Connects to Google Sheets and returns the client.
    Cached resource to avoid re-authenticating on every run.
    """
    creds = get_service_account_creds()
    if not creds:
        st.error("⚠️ Credentials not found. Please configure st.secrets or service_account.json")
        return None
        
    client = gspread.authorize(creds)
    return client

def get_worksheet(spreadsheet_name, tab_name):
    """
    Helper to get a specific worksheet safely.
    """
    client = connect_to_gsheets()
    if not client: return None
    
    try:
        sh = client.open(spreadsheet_name)
        ws = sh.worksheet(tab_name)
        return ws
    except Exception as e:
        st.error(f"Error accessing sheet '{tab_name}' in '{spreadsheet_name}': {e}")
        return None

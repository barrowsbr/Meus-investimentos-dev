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
    current_dir = os.path.dirname(os.path.abspath(__file__)) # core/data/
    core_dir = os.path.dirname(current_dir) # core/
    project_root = os.path.dirname(core_dir) # Dash/
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
    return _authenticate_no_cache()

def _authenticate_no_cache():
    """Internal function to get a fresh client"""
    creds = get_service_account_creds()
    if not creds:
        st.error("⚠️ Credentials not found. Please configure st.secrets or service_account.json")
        return None
    return gspread.authorize(creds)

def get_worksheet(spreadsheet_name, tab_name):
    """
    Helper to get a specific worksheet safely.
    Robust against SSL Persistence Errors by forcing re-auth.
    Returns None silently if worksheet doesn't exist.
    """
    import time
    from gspread.exceptions import WorksheetNotFound
    
    # Retry config
    MAX_RETRIES = 5
    DELAY_BASE = 2.0 # seconds

    # Initial Attempt with Cached Client
    client = connect_to_gsheets()
    if not client: return None
    
    for attempt in range(MAX_RETRIES):
        try:
            sh = client.open(spreadsheet_name)
            ws = sh.worksheet(tab_name)
            return ws
        except WorksheetNotFound:
            # Aba não existe - retorna None silenciosamente
            return None
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                # Exponential backoff
                sleep_time = DELAY_BASE * (1.5 ** attempt) 
                time.sleep(sleep_time)
                
                # Handling errors
                err_str = str(e)
                if hasattr(e, 'response'):
                    try:
                        err_str += f" | Response Text: {e.response.text}"
                    except:
                        pass
                
                # Semper tenta re-autenticar se houver erro não mapeado no gspread
                st.warning(f"Erro na conexão com Sheets (Tentativa {attempt+1}/{MAX_RETRIES}). Tentando reconectar...")
                client = _authenticate_no_cache()
                if not client: 
                    st.error("Re-authentication failed.")
                    return None
            else:
                err_str = str(e)
                if hasattr(e, 'response'):
                    try:
                        err_str += f" | Desc: {e.response.text}"
                    except:
                        pass
                st.error(f"Error accessing sheet '{tab_name}' after {MAX_RETRIES} attempts. Last error: {err_str} | repr: {repr(e)}")
                return None
    return None

import gspread
import streamlit as st
import os

# spreadsheets: leitura e escrita via Sheets API
# drive: necessário para operações de escrita (clear/update)
# open_by_key() é usado em vez de open(name) para evitar chamadas à Drive API
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
]

SPREADSHEET_NAME = 'gdados'


def _get_spreadsheet_key() -> str | None:
    try:
        if hasattr(st, 'secrets') and 'SPREADSHEET_KEY' in st.secrets:
            return str(st.secrets['SPREADSHEET_KEY'])
    except Exception:
        pass
    return os.environ.get('SPREADSHEET_KEY')


def _authenticate_no_cache():
    """Always returns a fresh client or None. Never cached."""
    current_dir = os.path.dirname(os.path.abspath(__file__))  # core/data/
    core_dir = os.path.dirname(current_dir)                   # core/
    project_root = os.path.dirname(core_dir)                  # app/
    local_file = os.path.join(project_root, 'service_account.json')

    if os.path.exists(local_file):
        try:
            return gspread.service_account(filename=local_file, scopes=SCOPES)
        except Exception as e:
            st.error(f"⚠️ Erro ao autenticar com service_account.json: {e}")
            return None

    try:
        if hasattr(st, "secrets") and "gcp_service_account" in st.secrets:
            creds = dict(st.secrets["gcp_service_account"])
            # Fix \n encoding in private_key (Streamlit Cloud stores as \\n)
            if "private_key" in creds and isinstance(creds["private_key"], str):
                creds["private_key"] = creds["private_key"].replace("\\n", "\n")
            # Strip <> from URL fields (common copy-paste mistake in secrets editor)
            for url_field in ("auth_uri", "token_uri", "auth_provider_x509_cert_url",
                              "client_x509_cert_url", "universe_domain"):
                if url_field in creds and isinstance(creds[url_field], str):
                    creds[url_field] = creds[url_field].strip().strip("<>").strip()
            return gspread.service_account_from_dict(creds, scopes=SCOPES)
    except Exception as e:
        st.error(f"⚠️ Erro ao autenticar com st.secrets: {e}")
        return None

    st.error("⚠️ Credenciais não encontradas. Configure st.secrets ou service_account.json")
    return None


@st.cache_resource(ttl=3600, show_spinner=False)
def _cached_gsheets_client(_bust: int = 0):
    """Cached gspread client. Pass _bust=<timestamp> to force refresh."""
    return _authenticate_no_cache()


def connect_to_gsheets():
    """
    Returns a gspread client.
    If the cached result is None (stale failure), clears the cache and retries immediately.
    """
    client = _cached_gsheets_client()
    if client is not None:
        return client
    # Stale None in cache — clear and get fresh client
    try:
        _cached_gsheets_client.clear()
    except Exception:
        pass
    return _authenticate_no_cache()


def _open_spreadsheet(client, spreadsheet_name: str):
    """
    Open by SPREADSHEET_KEY (preferred — works with Sheets scope only).
    Falls back to open by name (requires Drive scope — may fail on restricted GCP projects).
    """
    from gspread.exceptions import SpreadsheetNotFound

    # Always try by key first — doesn't need Drive API
    key = _get_spreadsheet_key()
    if key:
        try:
            return client.open_by_key(key)
        except Exception:
            pass

    # Fall back to open by name (needs Drive scope — may raise 403 insufficientScopes)
    try:
        return client.open(spreadsheet_name)
    except SpreadsheetNotFound:
        pass
    except Exception:
        pass

    try:
        email = dict(st.secrets.get("gcp_service_account", {})).get("client_email", "?")
    except Exception:
        email = "?"
    st.error(
        f"⚠️ Planilha '{spreadsheet_name}' não encontrada. "
        f"Compartilhe-a com: **{email}**  \n"
        f"Adicione `SPREADSHEET_KEY = \"<id>\"` em `.streamlit/secrets.toml` "
        f"(o ID está na URL da planilha)."
    )
    return None


def get_or_create_worksheet(spreadsheet_name: str, tab_name: str, rows: int = 100, cols: int = 10):
    """Returns existing worksheet or creates it if not found."""
    from gspread.exceptions import WorksheetNotFound

    client = connect_to_gsheets()
    if not client:
        return None

    try:
        sh = _open_spreadsheet(client, spreadsheet_name)
        if sh is None:
            return None
        try:
            return sh.worksheet(tab_name)
        except WorksheetNotFound:
            return sh.add_worksheet(title=tab_name, rows=rows, cols=cols)
    except Exception as e:
        st.error(f"⚠️ Erro ao criar aba '{tab_name}': {e}")
        return None


def get_worksheet(spreadsheet_name, tab_name):
    import time
    from gspread.exceptions import WorksheetNotFound

    MAX_RETRIES = 5
    DELAY_BASE = 2.0

    client = connect_to_gsheets()
    if not client:
        return None

    for attempt in range(MAX_RETRIES):
        try:
            sh = _open_spreadsheet(client, spreadsheet_name)
            if sh is None:
                return None
            return sh.worksheet(tab_name)
        except WorksheetNotFound:
            return None
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                sleep_time = DELAY_BASE * (1.5 ** attempt)
                time.sleep(sleep_time)
                client = _authenticate_no_cache()
                if not client:
                    return None
            else:
                err_str = str(e)
                if hasattr(e, 'response'):
                    try:
                        err_str += f" | {e.response.text}"
                    except Exception:
                        pass
                st.error(f"Erro ao acessar aba '{tab_name}' após {MAX_RETRIES} tentativas: {err_str}")
                return None

    return None

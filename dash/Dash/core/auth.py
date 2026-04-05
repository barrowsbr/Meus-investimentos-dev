import streamlit as st
import time
import os
import hashlib

PASSWORD_FILE = os.path.join(os.path.dirname(__file__), ".password")
AUTH_STATE_FILE = os.path.join(os.path.dirname(__file__), ".auth_state")
DEFAULT_PASSWORD = os.environ.get("AUTH_PASSWORD", "1015")

# ── Persistência ──────────────────────────────────────────────────────────────
# Token diário derivado da senha + dia atual.
# Fica salvo nos query_params da URL → sobrevive a:
#   • navegação entre páginas (Streamlit mantém os params)
#   • reconexões / restarts do servidor (browser preserva a URL)
# Expira automaticamente ao mudar de dia.
# ─────────────────────────────────────────────────────────────────────────────

_PARAM_KEY = "_t"  # nome do query param (curto, discreto)

def _daily_token(password: str) -> str:
    """Token HMAC-SHA256 que muda a cada dia."""
    day = str(int(time.time()) // 86400)
    return hashlib.sha256(f"{password}:{day}".encode()).hexdigest()[:20]


def get_password():
    if os.path.exists(PASSWORD_FILE):
        try:
            with open(PASSWORD_FILE, "r") as f:
                return f.read().strip()
        except:
            return DEFAULT_PASSWORD
    return DEFAULT_PASSWORD

def update_password(new_password):
    try:
        with open(PASSWORD_FILE, "w") as f:
            f.write(new_password)
        return True
    except Exception as e:
        print(f"Error updating password: {e}")
        return False

def is_auth_enabled():
    if os.path.exists(AUTH_STATE_FILE):
        try:
            with open(AUTH_STATE_FILE, "r") as f:
                return f.read().strip() == "ENABLED"
        except:
            return True
    return True

def set_auth_enabled(enabled: bool):
    try:
        with open(AUTH_STATE_FILE, "w") as f:
            f.write("ENABLED" if enabled else "DISABLED")
        return True
    except Exception as e:
        print(f"Error updating auth state: {e}")
        return False


def _restore_from_token() -> bool:
    """
    Verifica se o query param _t contém um token válido para hoje.
    Se sim, marca a sessão como autenticada e retorna True.
    """
    try:
        token = st.query_params.get(_PARAM_KEY, "")
        if token and token == _daily_token(get_password()):
            st.session_state["password_correct"] = True
            return True
    except Exception:
        pass
    return False


def _save_token():
    """Grava o token do dia nos query_params para persistência."""
    try:
        st.query_params[_PARAM_KEY] = _daily_token(get_password())
    except Exception:
        pass


def require_auth():
    """
    Bloqueia execução se não autenticado.
    Ordem de verificação:
      1. session_state (mesma conexão WebSocket) — caminho rápido
      2. query_params/_t (sobrevive a restarts e navegação) — restauração silenciosa
      3. Formulário de senha
    """
    if not is_auth_enabled():
        return

    # 1. Já autenticado nesta sessão
    if st.session_state.get("password_correct"):
        return

    # 2. Restaurar via token na URL
    if _restore_from_token():
        return

    # 3. Mostrar tela de login
    st.markdown("""
    <style>
    .stApp {
        background: linear-gradient(-45deg, #0e1217, #171c26, #0f1724, #000000);
        background-size: 400% 400%;
        animation: gradient 15s ease infinite;
        font-family: 'Outfit', sans-serif;
    }
    @keyframes gradient {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
    }
    h1 { color: white; text-align: center; margin-top: 100px; }
    .stTextInput { width: 300px; margin: 0 auto; }
    </style>
    <h1>🔒 Password</h1>
    """, unsafe_allow_html=True)

    if not check_password():
        st.stop()


def init_auth_state():
    if "password" not in st.session_state:
        st.session_state["password"] = ""
    if "password_correct" not in st.session_state:
        st.session_state["password_correct"] = None


def check_password():
    init_auth_state()
    current_password = get_password()

    def password_entered():
        if st.session_state.get("password") == current_password:
            st.session_state["password_correct"] = True
            if "password" in st.session_state:
                del st.session_state["password"]
            # Persiste o token na URL para sessões futuras
            _save_token()
        else:
            st.session_state["password_correct"] = False

    if not st.session_state.get("password_correct", False):
        st.text_input(
            "Digite a senha de acesso:", type="password",
            on_change=password_entered, key="password"
        )
        if st.session_state.get("password_correct") is False:
            st.error("😕 Senha incorreta")
        return False
    return True

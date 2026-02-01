import streamlit as st
import time
import os

PASSWORD_FILE = os.path.join(os.path.dirname(__file__), ".password")
AUTH_STATE_FILE = os.path.join(os.path.dirname(__file__), ".auth_state")
DEFAULT_PASSWORD = "1015"

def get_password():
    """Reads the current password from file or returns the default."""
    if os.path.exists(PASSWORD_FILE):
        try:
            with open(PASSWORD_FILE, "r") as f:
                return f.read().strip()
        except:
            return DEFAULT_PASSWORD
    return DEFAULT_PASSWORD

def update_password(new_password):
    """Updates the persistent password."""
    try:
        with open(PASSWORD_FILE, "w") as f:
            f.write(new_password)
        return True
    except Exception as e:
        print(f"Error updating password: {e}")
        return False

def is_auth_enabled():
    """Returns True if authentication is enabled, False otherwise."""
    if os.path.exists(AUTH_STATE_FILE):
        try:
            with open(AUTH_STATE_FILE, "r") as f:
                return f.read().strip() == "ENABLED"
        except:
            return True
    return True # Default to enabled

def set_auth_enabled(enabled: bool):
    """Sets the authentication state."""
    try:
        with open(AUTH_STATE_FILE, "w") as f:
            f.write("ENABLED" if enabled else "DISABLED")
        return True
    except Exception as e:
        print(f"Error updating auth state: {e}")
        return False

def init_auth_state():
    """Initializes authentication state keys safely."""
    if "password" not in st.session_state:
        st.session_state["password"] = ""
    if "password_correct" not in st.session_state:
        st.session_state["password_correct"] = None

def check_password():
    """Returns `True` if the user had the correct password."""
    # Ensure state is initialized
    init_auth_state()

    current_password = get_password()

    def password_entered():
        """Checks whether a password entered by the user is correct."""
        if st.session_state.get("password") == current_password:
            st.session_state["password_correct"] = True
            # Safe deletion
            if "password" in st.session_state:
                del st.session_state["password"]
        else:
            st.session_state["password_correct"] = False

    if not st.session_state.get("password_correct", False):
        # Show input for password.
        st.text_input(
            "Digite a senha de acesso:", type="password", on_change=password_entered, key="password"
        )
        # Show error if failed previously
        if "password_correct" in st.session_state and st.session_state["password_correct"] is False:
             st.error("😕 Senha incorreta")
        return False
    else:
        # Password correct.
        return True

def require_auth():
    """
    Blocks execution if not authenticated.
    Usage: Call at the top of the page.
    """
    if not is_auth_enabled():
        return

    if "password_correct" not in st.session_state or not st.session_state["password_correct"]:
        st.markdown(
            """
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
            """, unsafe_allow_html=True
        )
        if not check_password():
            st.stop()

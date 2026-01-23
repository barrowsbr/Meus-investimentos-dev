import streamlit as st
import time
import os

PASSWORD_FILE = os.path.join(os.path.dirname(__file__), ".password")
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

def check_password():
    """Returns `True` if the user had the correct password."""

    current_password = get_password()

    def password_entered():
        """Checks whether a password entered by the user is correct."""
        if st.session_state["password"] == current_password:
            st.session_state["password_correct"] = True
            del st.session_state["password"]  # Don't store password
        else:
            st.session_state["password_correct"] = False

    if "password_correct" not in st.session_state:
        # First run, show input for password.
        st.text_input(
            "Digite a senha de acesso:", type="password", on_change=password_entered, key="password"
        )
        return False
    elif not st.session_state["password_correct"]:
        # Password not correct, show input + error.
        st.text_input(
            "Digite a senha de acesso:", type="password", on_change=password_entered, key="password"
        )
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
            <h1>🔒 Acesso Restrito</h1>
            """, unsafe_allow_html=True
        )
        if not check_password():
            st.stop()

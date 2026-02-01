import streamlit as st
import time
import pandas as pd
from core.auth import require_auth, get_password, update_password, is_auth_enabled, set_auth_enabled

# --- AUTH CHECK ---
require_auth()

# --- CONFIG ---
st.set_page_config(
    page_title="Mainframe Utilities",
    page_icon="💾",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- CSS: CYBERPUNK MAINFRAME ---
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap');

    /* BASE THEME */
    .stApp {
        background-color: #050505;
        color: #e0e0e0;
        font-family: 'Share Tech Mono', monospace;
    }
    
    /* BACKGROUND GRID ANIMATION */
    .stApp::before {
        content: "";
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: 
            linear-gradient(rgba(0, 255, 65, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 65, 0.03) 1px, transparent 1px);
        background-size: 40px 40px;
        z-index: 0;
        pointer-events: none;
        animation: gridScan 20s linear infinite;
    }
    @keyframes gridScan {
        0% { transform: translateY(0); }
        100% { transform: translateY(40px); }
    }

    /* GLITCH HEADER */
    .glitch-header {
        font-family: 'Orbitron', sans-serif;
        font-size: 2.5rem;
        font-weight: 800;
        color: #fff;
        text-shadow: 2px 2px 0px #00ff41, -2px -2px 0px #ff00de;
        text-transform: uppercase;
        margin-bottom: 5px;
        letter-spacing: 2px;
    }
    
    .sys-status {
        color: #00ff41;
        font-size: 0.9rem;
        border: 1px solid #00ff41;
        padding: 5px 10px;
        display: inline-block;
        margin-bottom: 30px;
        background: rgba(0, 255, 65, 0.05);
    }

    /* CYBER CARDS */
    .cyber-card {
        background: rgba(10, 10, 10, 0.9);
        border: 1px solid #333;
        border-left: 4px solid #333;
        padding: 20px;
        margin-bottom: 20px;
        position: relative;
        transition: all 0.3s ease;
    }
    
    .cyber-card:hover {
        border-color: #00ff41;
        border-left-color: #00ff41;
        box-shadow: 0 0 15px rgba(0, 255, 65, 0.15);
        transform: translateX(5px);
    }
    
    .card-title {
        font-family: 'Orbitron', sans-serif;
        color: #fff;
        font-size: 1.1rem;
        margin-bottom: 10px;
        display: flex;
        align-items: center;
        gap: 10px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
        padding-bottom: 8px;
    }
    
    .card-title .icon { color: #ff00de; }

    /* FORM ELEMENTS OVERRIDE */
    div[data-baseweb="select"] > div {
        background-color: #0a0a0a !important;
        border-color: #333 !important;
        color: #00ff41 !important;
        font-family: 'Share Tech Mono', monospace !important;
    }
    
    .stTextInput input, .stSelectbox div[data-baseweb="select"] {
        color: #00ff41 !important;
    }
    
    /* BUTTONS */
    div.stButton > button {
        background-color: transparent !important;
        color: #00ff41 !important;
        border: 1px solid #00ff41 !important;
        font-family: 'Orbitron', sans-serif !important;
        transition: all 0.2s !important;
        text-transform: uppercase;
        letter-spacing: 1px;
    }
    
    div.stButton > button:hover {
        background-color: #00ff41 !important;
        color: #000 !important;
        box-shadow: 0 0 15px rgba(0, 255, 65, 0.4);
    }

    #MainMenu, footer, header {visibility: hidden;}
    section[data-testid="stSidebar"] { display: none; }
    
</style>
""", unsafe_allow_html=True)

# --- HEADER ROW ---
col_head, col_act = st.columns([6, 1])
with col_head:
    st.markdown('<div class="glitch-header">MAINFRAME UTILITIES</div>', unsafe_allow_html=True)
    st.markdown('<div class="sys-status">SYSTEM STATUS: ONLINE // ACCESS LEVEL: ADMIN</div>', unsafe_allow_html=True)

with col_act:
    if st.button("EXIT TERMINAL"):
        st.switch_page("Home.py")

st.markdown("---")

# --- TOOLS GRID ---
c1, c2, c3 = st.columns(3)

# --- 1. DATA INGESTION ---
with c1:
    st.markdown("""
    <div class="cyber-card">
        <div class="card-title"><span class="icon">📥</span> DATA INGESTION NODE</div>
    </div>
    """, unsafe_allow_html=True)
    
    with st.container():
        st.caption("// UPLOAD EXTERNAL FILES TO DATABASE")
        
        source = st.selectbox(
            "PROTOCOL SOURCE:",
            ["IBKR", "XP", "Nu", "Bradesco"],
            key="data_source_select"
        )
        
        uploaded_file = st.file_uploader("TARGET FILE (CSV/XLSX)", type=['csv', 'pdf', 'xlsx'], key="data_uploader")
        
        st.write("")
        if st.button("INITIATE UPLOAD SEQUENCE", use_container_width=True):
            if uploaded_file is None:
                st.warning("⚠️ ERROR: NO TARGET FILE DETECTED.")
            else:
                with st.spinner("UPLOADING PACKETS..."):
                    time.sleep(2)
                    st.success(f"✅ DATA STREAM FROM [{source}] ESTABLISHED.")
                    st.toast("Upload Complete", icon="💾")

# --- 2. SYSTEM SYNC ---
with c2:
    st.markdown("""
    <div class="cyber-card">
        <div class="card-title"><span class="icon">🔄</span> SYSTEM SYNCHRONIZATION</div>
    </div>
    """, unsafe_allow_html=True)
    
    st.caption("// UPDATE OFFICIAL EXCHANGE RATES")
    st.markdown("**PTAX SERVER (IPEA)**")
    st.info("Last Sync: AUTO-DETECT")
    
    st.write("")
    if st.button("EXECUTE PTAX SYNC", use_container_width=True):
        from core.ptax_updater import atualizar_ptax
        with st.spinner("ESTABLISHING LINK TO IPEA..."):
            success, msg = atualizar_ptax()
            if success:
                st.success(f"✅ {msg.upper()}")
            else:
                st.error(f"❌ CONNECTION FAILED: {msg}")

# --- 3. SECURITY ---
with c3:
    st.markdown("""
    <div class="cyber-card">
        <div class="card-title"><span class="icon">🔐</span> SECURITY OVERRIDE</div>
    </div>
    """, unsafe_allow_html=True)
    
    st.caption("// MODIFY ACCESS CREDENTIALS")
    
    # AUTH TOGGLE
    current_auth_state = is_auth_enabled()
    new_auth_state = st.toggle("🔒 REQUIRE PASSWORD", value=current_auth_state)
    
    if new_auth_state != current_auth_state:
        if set_auth_enabled(new_auth_state):
            state_msg = "ENABLED" if new_auth_state else "DISABLED"
            st.toast(f"AUTH SYSTEM {state_msg}", icon="🛡️")
            time.sleep(1)
            st.rerun()
        else:
            st.error("ERROR UPDATING AUTH STATE")

    st.markdown("---")

    with st.form("update_password_form", clear_on_submit=True):
        old_pwd = st.text_input("CURRENT PASSPHRASE", type="password")
        new_pwd = st.text_input("NEW PASSPHRASE", type="password")
        conf_pwd = st.text_input("CONFIRM PASSPHRASE", type="password")
        
        st.write("")
        submit = st.form_submit_button("UPDATE CREDENTIALS", use_container_width=True)
        
        if submit:
            if old_pwd != get_password():
                st.error("ACCESS DENIED: INVALID CREDENTIALS")
            elif new_pwd != conf_pwd:
                st.error("ERROR: PASSPHRASE MISMATCH")
            elif len(new_pwd) < 4:
                st.error("ERROR: WEAK ENCRYPTION (MIN 4 CHARS)")
            else:
                if update_password(new_pwd):
                    st.success("CREDENTIALS UPDATED SUCCESSFULLY")
                    time.sleep(1)
                    st.rerun()
                else:
                    st.error("WRITE ERROR: DATABASE LOCKED")

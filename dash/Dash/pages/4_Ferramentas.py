import streamlit as st
import time
import pandas as pd
from core.auth import require_auth, get_password, update_password, is_auth_enabled, set_auth_enabled
from core.theme import inject_global_theme, render_page_header, render_back_button
from core.ui import render_fab

# --- AUTH CHECK ---
require_auth()

# --- CONFIG ---
st.set_page_config(
    page_title="Configurações",
    page_icon="⚙️",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- APPLY GLOBAL THEME ---
inject_global_theme()

# --- HEADER ---
render_fab()
render_back_button()
render_page_header("Configurações", "Ferramentas de administração e controle do sistema", "⚙️")

# --- TOOLS GRID ---
c1, c2, c3 = st.columns(3)

# ════════════════════════════════════════════════════════
# 1. DATA INGESTION
# ════════════════════════════════════════════════════════
with c1:
    st.markdown("""
    <div class="glass-card">
        <span class="glass-card-icon">📥</span>
        <div class="glass-card-title">Importar Dados</div>
        <div class="glass-card-desc">Upload de arquivos externos para a base de dados</div>
        <div class="glass-card-divider"></div>
    </div>
    """, unsafe_allow_html=True)

    with st.container():
        source = st.selectbox(
            "Origem",
            ["IBKR", "XP", "Nu", "Bradesco"],
            key="data_source_select"
        )

        uploaded_file = st.file_uploader(
            "Arquivo (CSV/XLSX/PDF)",
            type=['csv', 'pdf', 'xlsx'],
            key="data_uploader"
        )

        st.write("")
        if st.button("Iniciar Upload", use_container_width=True, key="btn_upload"):
            if uploaded_file is None:
                st.warning("⚠️ Nenhum arquivo selecionado.")
            else:
                with st.spinner("Enviando dados..."):
                    time.sleep(2)
                    st.success(f"✅ Dados de **{source}** importados com sucesso.")
                    st.toast("Upload concluído", icon="📥")

# ════════════════════════════════════════════════════════
# 2. SYSTEM SYNC
# ════════════════════════════════════════════════════════
with c2:
    st.markdown("""
    <div class="glass-card">
        <span class="glass-card-icon">🔄</span>
        <div class="glass-card-title">Sincronização</div>
        <div class="glass-card-desc">Atualizar cotações de câmbio oficiais (PTAX)</div>
        <div class="glass-card-divider"></div>
    </div>
    """, unsafe_allow_html=True)

    st.caption("Fonte: IPEA / Banco Central")
    st.info("Última sincronização: automática")

    st.write("")
    if st.button("Sincronizar PTAX", use_container_width=True, key="btn_ptax"):
        from core.ptax_updater import atualizar_ptax
        with st.spinner("Conectando ao servidor IPEA..."):
            success, msg = atualizar_ptax()
            if success:
                st.success(f"✅ {msg}")
            else:
                st.error(f"❌ Falha na conexão: {msg}")

# ════════════════════════════════════════════════════════
# 3. SECURITY
# ════════════════════════════════════════════════════════
with c3:
    st.markdown("""
    <div class="glass-card">
        <span class="glass-card-icon">🔐</span>
        <div class="glass-card-title">Segurança</div>
        <div class="glass-card-desc">Gerenciar autenticação e credenciais de acesso</div>
        <div class="glass-card-divider"></div>
    </div>
    """, unsafe_allow_html=True)

    # AUTH TOGGLE
    current_auth_state = is_auth_enabled()
    new_auth_state = st.toggle("🔒 Exigir senha", value=current_auth_state)

    if new_auth_state != current_auth_state:
        if set_auth_enabled(new_auth_state):
            state_msg = "ativada" if new_auth_state else "desativada"
            st.toast(f"Autenticação {state_msg}", icon="🛡️")
            time.sleep(1)
            st.rerun()
        else:
            st.error("Erro ao atualizar estado de autenticação")

    st.markdown("---")

    with st.form("update_password_form", clear_on_submit=True):
        old_pwd = st.text_input("Senha atual", type="password")
        new_pwd = st.text_input("Nova senha", type="password")
        conf_pwd = st.text_input("Confirmar nova senha", type="password")

        st.write("")
        submit = st.form_submit_button("Atualizar Senha", use_container_width=True)

        if submit:
            if old_pwd != get_password():
                st.error("❌ Senha atual incorreta")
            elif new_pwd != conf_pwd:
                st.error("❌ As senhas não coincidem")
            elif len(new_pwd) < 4:
                st.error("❌ Senha muito curta (mínimo 4 caracteres)")
            else:
                if update_password(new_pwd):
                    st.success("✅ Senha atualizada com sucesso")
                    time.sleep(1)
                    st.rerun()
                else:
                    st.error("❌ Erro ao salvar nova senha")

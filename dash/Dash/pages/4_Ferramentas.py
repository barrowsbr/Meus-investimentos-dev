import streamlit as st
import time
from core.auth import require_auth, get_password, update_password

# --- AUTH CHECK ---
require_auth()

# --- CONFIG ---
st.set_page_config(
    page_title="Ferramentas & Dados",
    page_icon="🛠️",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- CSS / THEME ---
# --- CSS / THEME ---
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'Outfit', sans-serif;
    }
    
    /* GLASS EXPANDER STYLE */
    [data-testid="stExpander"] {
        background: rgba(30, 41, 59, 0.4);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 16px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        margin-bottom: 20px;
    }

    /* Hover Effect - Neon & Lift */
    [data-testid="stExpander"]:hover {
        transform: translateY(-5px);
        border-color: rgba(99, 102, 241, 0.5); /* Neon Purple/Blue */
        box-shadow: 0 15px 30px -10px rgba(99, 102, 241, 0.3);
    }
    
    /* Summary (Header) Styling */
    [data-testid="stExpander"] summary {
        color: #f1f5f9 !important;
        font-weight: 600;
        font-size: 1.1rem;
        padding-top: 15px;
        padding-bottom: 15px;
    }
    
    [data-testid="stExpander"] summary:hover {
        color: #a5b4fc !important;
    }
    
    /* Remove default border of expands */
    .streamlit-expanderContent {
        border: none !important;
    }

    h1, h2, h3 { color: #f1f5f9; }

    /* Hide Streamlit Toolbar */
    #MainMenu, footer, header {visibility: hidden;}
</style>
""", unsafe_allow_html=True)

# --- HEADER ---
col_h1, col_h2 = st.columns([3,1])
with col_h1:
    st.title("🛠️ Ferramentas de Dados")
    st.caption("Scripts de automação, importação e manutenção da base de dados.")
with col_h2:
    if st.button("🏠 Voltar para Home", use_container_width=True):
        st.switch_page("Home.py")

st.divider()

# --- CONTENT ---
# Layout Grid for Tools
c1, c2, c3 = st.columns(3)

with c1:
    with st.expander("📥 Carregamento de Dados", expanded=False):
        st.caption("Importação automática de notas e extratos.")
        st.markdown("---")
        
        source = st.selectbox(
            "Selecione a Fonte:",
            ["IBKR", "XP", "Nu", "Bradesco"],
            key="data_source_select"
        )
        
        uploaded_file = st.file_uploader("Arquivo (CSV, PDF, XLSX)", type=['csv', 'pdf', 'xlsx'], key="data_uploader")
        
        if st.button("🚀 Processar Arquivo", use_container_width=True):
            if uploaded_file is None:
                st.warning("⚠️ Por favor, faça o upload de um arquivo primeiro.")
            else:
                with st.spinner(f"Processando dados de {source}..."):
                    time.sleep(2) # Simulação de processamento
                    st.success(f"✅ Arquivo de {source} recebido com sucesso!")
                    st.info("ℹ️ Lógica de processamento detalhada pendente de implementação no backend.")

with c2:
    with st.expander("🧹 Manutenção & Dados", expanded=False):
        st.caption("Atualização de índices, taxas oficiais e limpeza de registros.")
        st.markdown("---")
        
        st.markdown("#### 🇧🇷 PTAX Oficial (IPEA)")
        st.caption("Atualiza a base histórica do Dólar para cálculos fiscais e conversões.")
        
        if st.button("🚀 Atualizar PTAX (IPEA)", use_container_width=True):
            from core.ptax_updater import atualizar_ptax
            with st.spinner("Buscando dados no IPEA..."):
                success, msg = atualizar_ptax()
                if success:
                    if "já está atualizada" in msg:
                        st.info(f"ℹ️ {msg}")
                    else:
                        st.success(f"✅ {msg}")
                else:
                    st.error(f"❌ {msg}")

with c3:
    with st.expander("⚙️ Configurações", expanded=False):
        st.caption("Gerenciamento de parâmetros do sistema.")
        st.markdown("---")
        
        st.markdown("##### 🔐 Atualizar Senha")
        with st.form("update_password_form", clear_on_submit=True):
            old_pwd = st.text_input("Senha Atual", type="password")
            new_pwd = st.text_input("Nova Senha", type="password")
            conf_pwd = st.text_input("Confirmar Nova Senha", type="password")
            
            submit = st.form_submit_button("Atualizar Senha", use_container_width=True)
            
            if submit:
                if old_pwd != get_password():
                    st.error("Senha atual incorreta.")
                elif new_pwd != conf_pwd:
                    st.error("As novas senhas não coincidem.")
                elif len(new_pwd) < 4:
                    st.error("A senha deve ter pelo menos 4 caracteres.")
                else:
                    if update_password(new_pwd):
                        st.success("Senha atualizada com sucesso!")
                        time.sleep(1)
                        st.rerun()
                    else:
                        st.error("Erro ao salvar nova senha.")


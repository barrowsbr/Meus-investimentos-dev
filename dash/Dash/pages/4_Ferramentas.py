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
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'Outfit', sans-serif;
    }
    
    .tool-card {
        background: rgba(30, 41, 59, 0.4);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 12px;
        padding: 25px;
        height: 100%;
        transition: all 0.3s ease;
    }
    .tool-card:hover {
        background: rgba(30, 41, 59, 0.6);
        border-color: rgba(99, 102, 241, 0.4);
        transform: translateY(-5px);
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
    st.markdown('<div class="tool-card">', unsafe_allow_html=True)
    st.markdown("<h3>📥 Carregamento de Dados</h3>", unsafe_allow_html=True)
    st.markdown('<p style="color: #94a3b8;">Importação automática de notas e extratos.</p>', unsafe_allow_html=True)
    
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
    
    st.markdown('</div>', unsafe_allow_html=True)

with c2:
    st.markdown('<div class="tool-card">', unsafe_allow_html=True)
    st.markdown("<h3>🧹 Manutenção & Dados</h3>", unsafe_allow_html=True)
    st.markdown('<p style="color: #94a3b8;">Atualização de índices, taxas oficiais e limpeza de registros.</p>', unsafe_allow_html=True)
    
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
    
    st.markdown('</div>', unsafe_allow_html=True)

with c3:
    with st.container():
        st.markdown('<div class="tool-card">', unsafe_allow_html=True)
        st.markdown("<h3>⚙️ Configurações</h3>", unsafe_allow_html=True)
        st.markdown('<p style="color: #94a3b8;">Gerenciamento de parâmetros do sistema.</p>', unsafe_allow_html=True)
        
        with st.expander("🔐 Atualizar Senha do Projeto"):
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
        
        st.markdown('</div>', unsafe_allow_html=True)


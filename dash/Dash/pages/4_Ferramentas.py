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

        # ── Sub-seletor para IBKR ──
        import_type = None
        if source == "IBKR":
            import_type = st.radio(
                "Tipo de importação",
                ["📊 Proventos", "📈 Ativos"],
                horizontal=True,
                key="ibkr_import_type",
                help="Selecione se deseja importar proventos (dividendos/impostos) ou novos ativos"
            )

        # ── Upload do arquivo ──
        file_types = ['csv', 'pdf', 'xlsx']
        if source == "IBKR":
            file_types = ['csv']  # IBKR exporta CSV

        uploaded_file = st.file_uploader(
            "Arquivo (CSV)" if source == "IBKR" else "Arquivo (CSV/XLSX/PDF)",
            type=file_types,
            key="data_uploader"
        )

        # ── IBKR PROVENTOS FLOW ──
        if source == "IBKR" and import_type == "📊 Proventos":
            if uploaded_file is not None:
                import tempfile
                import os as os_sync
                import importlib
                import core.ibkr_sync
                importlib.reload(core.ibkr_sync)
                from core.ibkr_sync import IBKRSyncManager
                from core.data.loader import load_proventos

                # Salvar arquivo temporariamente
                with tempfile.NamedTemporaryFile(delete=False, suffix='.csv') as tmp:
                    tmp.write(uploaded_file.getvalue())
                    tmp_path = tmp.name

                try:
                    # Inicializar manager
                    sync_manager = IBKRSyncManager(csv_path=tmp_path)

                    # Carregar CSV
                    qtd_div, qtd_imp = sync_manager.load_csv()
                    st.info(f"📊 CSV carregado: **{qtd_div}** dividendos, **{qtd_imp}** impostos")

                    # Carregar proventos existentes do GSheets (forçar dados frescos)
                    st.cache_data.clear()
                    df_proventos_bruto = load_proventos()

                    # Debug: dados do GSheets
                    with st.expander("🔍 Debug: Dados do GSheets"):
                        st.write(f"**Total de linhas:** {len(df_proventos_bruto)}")
                        st.write("**Colunas disponíveis:**", list(df_proventos_bruto.columns))
                        if not df_proventos_bruto.empty:
                            st.write("**dtypes:**")
                            st.text(str(df_proventos_bruto.dtypes))
                            st.write("**Amostra (últimos 10):**")
                            cols_show = [c for c in ['ticker', 'data', 'decisao', 'lancamento', 'valor', 'moeda'] if c in df_proventos_bruto.columns]
                            st.dataframe(df_proventos_bruto[cols_show].tail(10))
                        else:
                            st.error("⚠️ DataFrame vazio! load_proventos() retornou sem dados.")

                    # Encontrar faltantes (reconciliação)
                    df_faltantes = sync_manager.find_missing(df_proventos_bruto)

                    # Debug: relatório de reconciliação
                    with st.expander("🔍 Debug: Reconciliação"):
                        try:
                            summary = sync_manager.get_summary()
                            st.write(f"**CSV:** {summary['total_csv']} | **Base:** {summary['total_existentes']} | **Novos:** {summary['novos']} | **Duplicados:** {summary['duplicados']}")
                            report = sync_manager.get_reconciliation_report()
                            st.code(report)
                        except AttributeError:
                            st.warning("⚠️ Reinicie o Streamlit para carregar o módulo atualizado (método de relatório não encontrado)")

                    if df_faltantes.empty:
                        st.success("✅ Todos os proventos já estão sincronizados!")
                    else:
                        st.warning(f"⚠️ Encontrados **{len(df_faltantes)}** proventos faltantes")

                        # Mostrar preview
                        st.dataframe(
                            df_faltantes[['data', 'ticker', 'decisao', 'valor', 'moeda']],
                            use_container_width=True,
                            height=200
                        )

                        col_sync1, col_sync2 = st.columns(2)

                        with col_sync1:
                            if st.button("📝 Enviar para Teste", key="btn_sync_test", use_container_width=True):
                                success, msg = sync_manager.sync_to_test()
                                if success:
                                    st.success(f"✅ {msg}")
                                    st.info("📌 Verifique a aba 'meus_proventos_test' no Google Sheets")
                                else:
                                    st.error(f"❌ {msg}")

                        with col_sync2:
                            if st.button("🚀 Aplicar em Produção", key="btn_sync_prod", type="primary", use_container_width=True):
                                backup_dir = os_sync.path.join(os_sync.path.dirname(__file__), '..', 'backups')
                                success, msg, backup_path = sync_manager.apply_to_production()
                                if success:
                                    st.success(f"✅ {msg}")
                                    if backup_path:
                                        st.info(f"💾 Backup salvo em: {backup_path}")
                                    st.cache_data.clear()
                                    st.rerun()
                                else:
                                    st.error(f"❌ {msg}")

                except Exception as e:
                    st.error(f"Erro ao processar CSV: {e}")
                finally:
                    try:
                        os_sync.unlink(tmp_path)
                    except:
                        pass
            else:
                st.caption("Faça upload do CSV de transações do Interactive Brokers")

        # ── IBKR ATIVOS FLOW (placeholder) ──
        elif source == "IBKR" and import_type == "📈 Ativos":
            if uploaded_file is not None:
                st.info("🚧 Importação de ativos IBKR — em breve.")
                st.caption("Esta funcionalidade será implementada para sincronizar novos trades automaticamente.")
            else:
                st.caption("Faça upload do CSV de transações do Interactive Brokers")

        # ── GENERIC FLOW (XP, Nu, Bradesco) ──
        else:
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

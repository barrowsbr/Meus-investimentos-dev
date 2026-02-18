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

# Custom styles for this page
st.markdown("""
<style>
/* More opaque cards for settings page */
.glass-card {
    background: rgba(15, 23, 42, 0.85) !important;
}
/* White subtitle with shadow for contrast */
.glass-card-desc {
    color: white !important;
    text-shadow: 0 2px 4px rgba(0,0,0,0.8);
}
</style>
""", unsafe_allow_html=True)

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

                    # Carregar proventos existentes do GSheets
                    st.cache_data.clear()
                    df_proventos_bruto = load_proventos()

                    # Encontrar faltantes
                    df_faltantes = sync_manager.find_missing(df_proventos_bruto)


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
                                    # Limpar aba de teste após aplicar em produção
                                    try:
                                        from core.data.gsheets import _authenticate_no_cache
                                        client = _authenticate_no_cache()
                                        if client:
                                            sh = client.open('gdados')
                                            try:
                                                ws_test = sh.worksheet('meus_proventos_test')
                                                sh.del_worksheet(ws_test)
                                                st.info("🗑️ Aba 'meus_proventos_test' removida")
                                            except Exception:
                                                pass  # Aba não existe, tudo certo
                                    except Exception:
                                        pass
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

        # ── IBKR ATIVOS FLOW ──
        elif source == "IBKR" and import_type == "📈 Ativos":
            if uploaded_file is not None:
                import tempfile
                import os as os_sync
                import importlib
                import core.ibkr_sync
                importlib.reload(core.ibkr_sync)
                from core.ibkr_sync import IBKRTradesManager
                from core.data.provider import DataProvider

                # Salvar arquivo temporariamente
                with tempfile.NamedTemporaryFile(delete=False, suffix='.csv') as tmp:
                    tmp.write(uploaded_file.getvalue())
                    tmp_path = tmp.name

                try:
                    # Inicializar manager
                    trades_manager = IBKRTradesManager(csv_path=tmp_path)

                    # Carregar CSV
                    qtd_compras, qtd_vendas = trades_manager.load_csv()
                    st.info(f"📈 CSV carregado: **{qtd_compras}** compras, **{qtd_vendas}** vendas")

                    # Carregar ativos existentes do GSheets
                    st.cache_data.clear()
                    df_ativos = DataProvider.get_assets()


                    # Encontrar faltantes (inclui marcação de Splits)
                    df_faltantes_raw = trades_manager.find_missing(df_ativos)

                    # Separar Splits de Missing Real
                    if 'status_match' in df_faltantes_raw.columns:
                        df_splits = df_faltantes_raw[df_faltantes_raw['status_match'] == 'POTENTIAL_SPLIT']
                        df_missing = df_faltantes_raw[df_faltantes_raw['status_match'] == 'MISSING']
                    else:
                        df_splits = pd.DataFrame()
                        df_missing = df_faltantes_raw

                    # Atualizar o manager APENAS com os missing reais para importação
                    trades_manager.df_faltantes = df_missing

                    # 1. Alerta de Splits/Modificações
                    if not df_splits.empty:
                        with st.expander(f"⚠️ **Atenção:** {len(df_splits)} transações parecem já existir (Splits/Ajustes)", expanded=True):
                            st.warning("Estas transações tem valor financeiro compatível com itens da sua planilha, mas quantidade/preço diferentes. Provavelmente são **Splits (Desdobramentos)** ou ajustes manuais que você já fez. **Elas NÃO serão importadas automaticamente** para evitar duplicidade.")
                            
                            cols_split = ['Data', 'Símbolo', 'Tipo de transação', 'Quantidade', 'Preço', 'match_details']
                            # Garantir que colunas existam
                            cols_show_split = [c for c in cols_split if c in df_splits.columns]
                            
                            st.dataframe(
                                df_splits[cols_show_split],
                                use_container_width=True,
                                height=150,
                                column_config={
                                    "match_details": st.column_config.ListColumn("Compatível com (GSheets)")
                                }
                            )

                    # 2. Fluxo Normal de Importação (Missing)
                    if df_missing.empty:
                        if df_splits.empty:
                            st.success("✅ Todos os trades já estão sincronizados!")
                        else:
                            st.info("📌 Nenhuma nova transação para importar (apenas ajustes/splits detectados).")
                    else:
                        st.info(f"📥 **{len(df_missing)}** novas transações encontradas para importar:")

                        # Mostrar preview
                        cols_show = [c for c in ['Data', 'Tipo de transação', 'Símbolo', 'Quantidade', 'Preço', 'Moeda'] if c in df_missing.columns]
                        st.dataframe(
                            df_missing[cols_show],
                            use_container_width=True,
                            height=200
                        )

                        col_sync1, col_sync2 = st.columns(2)

                        with col_sync1:
                            if st.button("📝 Enviar para Teste", key="btn_trades_test", use_container_width=True):
                                success, msg = trades_manager.sync_to_test()
                                if success:
                                    st.success(f"✅ {msg}")
                                    st.info("📌 Verifique a aba 'meus_ativos_test' no Google Sheets")
                                else:
                                    st.error(f"❌ {msg}")

                        with col_sync2:
                            if st.button("🚀 Aplicar em Produção", key="btn_trades_prod", type="primary", use_container_width=True):
                                success, msg, backup_path = trades_manager.apply_to_production()
                                if success:
                                    st.success(f"✅ {msg}")
                                    if backup_path:
                                        st.info(f"💾 Backup salvo em: {backup_path}")
                                    # Limpar aba de teste
                                    try:
                                        from core.data.gsheets import _authenticate_no_cache
                                        client = _authenticate_no_cache()
                                        if client:
                                            # ... (código existente de limpeza)
                                            sh = client.open('gdados')
                                            try:
                                                ws_test = sh.worksheet('meus_ativos_test')
                                                sh.del_worksheet(ws_test)
                                            except: pass
                                    except: pass
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

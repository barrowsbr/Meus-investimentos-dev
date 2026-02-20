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
/* ═══════════════════════════════════════════════════════
   FUNDO SÓLIDO — Remove imagem, mantém azul escuro
   ═══════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════
   FUNDO SÓLIDO — Remove imagem, mantém azul escuro
   ═══════════════════════════════════════════════════════ */
html, body, [data-testid="stAppViewContainer"], .stApp {
    background: linear-gradient(180deg, #0b1120 0%, #0f172a 50%, #1e293b 100%) !important;
    background-color: #0b1120 !important;
    background-image: none !important;
    background-attachment: fixed !important;
    color: #f1f5f9 !important;
}

/* Force text color in all standard containers to avoid white-on-white */
p, h1, h2, h3, h4, h5, h6, span, div, label, li {
    color: #f1f5f9 !important;
}

/* More opaque cards for settings page */
/* hide any leftover glass-card usage */
.glass-card { display: none; }

/* ═══════════════════════════════════════════════════════
   STATUS CARDS
   ═══════════════════════════════════════════════════════ */
.status-card {
    background: rgba(15, 23, 42, 0.95);
    border-radius: 12px;
    padding: 16px;
    margin: 12px 0;
    border-left: 4px solid;
}
.status-card.info    { border-left-color: #60a5fa; background: rgba(15, 23, 42, 0.92); }
.status-card.success { border-left-color: #34d399; background: rgba(15, 23, 42, 0.92); }
.status-card.warning { border-left-color: #fbbf24; background: rgba(15, 23, 42, 0.92); }
.status-card.error   { border-left-color: #f87171; background: rgba(15, 23, 42, 0.92); }
.status-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
}
.status-card-icon  { font-size: 1.3rem; }
.status-card-title { font-size: 0.95rem; font-weight: 600; color: #f1f5f9; }
.status-card-body  { font-size: 0.85rem; color: #cbd5e1; line-height: 1.5; }

/* ═══════════════════════════════════════════════════════
   GLASS CARD — targets ALL st.container(border=True)
   ═══════════════════════════════════════════════════════ */
[data-testid="stVerticalBlockBorderWrapper"] {
    background: linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.97)) !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
    border: 1px solid rgba(212, 160, 23, 0.15) !important;
    border-radius: 20px !important;
    padding: 22px 20px !important;
    box-shadow:
        0 8px 32px rgba(0, 0, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.03) !important;
    transition: all 0.35s ease !important;
}
[data-testid="stVerticalBlockBorderWrapper"]:hover {
    border-color: rgba(251, 191, 36, 0.35) !important;
    box-shadow:
        0 12px 40px rgba(0, 0, 0, 0.4),
        0 0 20px rgba(251, 191, 36, 0.08),
        0 0 40px rgba(212, 160, 23, 0.04),
        inset 0 1px 0 rgba(251, 191, 36, 0.06) !important;
}
.import-glass-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 4px;
}
.import-glass-icon {
    font-size: 1.5rem;
    filter: drop-shadow(0 2px 8px rgba(99, 102, 241, 0.35));
}
.import-glass-title {
    font-size: 1.1rem;
    font-weight: 700;
    color: #f1f5f9;
    letter-spacing: 0.3px;
}
.import-glass-desc {
    font-size: 0.78rem;
    color: #e2e8f0;
    margin: 0 0 14px 0;
    line-height: 1.4;
}
.import-section-label {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #64748b;
    margin: 0 0 8px 2px;
}
.import-divider {
    border: none;
    border-top: 1px solid rgba(148, 163, 184, 0.08);
    margin: 14px 0;
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
  with st.container(border=True):
    # Glass card header
    st.markdown('''
    <div class="import-glass-header">
        <span class="import-glass-icon">📥</span>
        <span class="import-glass-title">Importar Dados</span>
    </div>
    <div class="import-glass-desc">Upload de arquivos externos para a base de dados</div>
    ''', unsafe_allow_html=True)

    # ── Session state ──
    if 'import_source' not in st.session_state:
        st.session_state.import_source = None
    if 'import_type' not in st.session_state:
        st.session_state.import_type = None
    if 'import_file_data' not in st.session_state:
        st.session_state.import_file_data = None
    if 'import_file_name' not in st.session_state:
        st.session_state.import_file_name = None

    source = st.session_state.import_source
    import_type = st.session_state.import_type
    needs_subtype = source in ["IBKR", "B3"]

    # Panel is now part of the glass card visual — no extra wrapper needed

    # ROW 1: Source
    st.markdown('<div class="import-section-label">Instituição</div>', unsafe_allow_html=True)
    src_col1, src_col2, src_col3 = st.columns(3)
    with src_col1:
        if st.button("🏦 IBKR", key="src_ibkr", use_container_width=True,
                     type="primary" if source == "IBKR" else "secondary"):
            if source != "IBKR":  # Limpar arquivo ao trocar instituição
                st.session_state.import_file_data = None
                st.session_state.import_file_name = None
            st.session_state.import_source = "IBKR"
            st.session_state.import_type = None
            st.rerun()
    with src_col2:
        if st.button("🇧🇷 B3", key="src_b3", use_container_width=True,
                     type="primary" if source == "B3" else "secondary"):
            if source != "B3":  # Limpar arquivo ao trocar instituição
                st.session_state.import_file_data = None
                st.session_state.import_file_name = None
            st.session_state.import_source = "B3"
            st.session_state.import_type = None
            st.rerun()
    with src_col3:
        if st.button("💳 Nu", key="src_nu", use_container_width=True,
                     type="primary" if source == "Nu" else "secondary"):
            if source != "Nu":  # Limpar arquivo ao trocar instituição
                st.session_state.import_file_data = None
                st.session_state.import_file_name = None
            st.session_state.import_source = "Nu"
            st.session_state.import_type = None
            st.rerun()

    st.markdown('<hr class="import-divider">', unsafe_allow_html=True)

    # ROW 2: Type (always shown)
    if source in ["IBKR", "B3"]:
        st.markdown('<div class="import-section-label">Tipo de importação</div>', unsafe_allow_html=True)
        tc1, tc2 = st.columns(2)
        with tc1:
            if st.button("📊 Proventos", key=f"type_prov_{source}", use_container_width=True,
                        type="primary" if import_type == "proventos" else "secondary"):
                st.session_state.import_type = "proventos"
                st.rerun()
        with tc2:
            if st.button("📈 Ativos", key=f"type_ativos_{source}", use_container_width=True,
                        type="primary" if import_type == "ativos" else "secondary"):
                st.session_state.import_type = "ativos"
                st.rerun()
    elif source == "Nu":
        st.markdown('<div class="import-section-label">Tipo de conta</div>', unsafe_allow_html=True)
        tc1, tc2 = st.columns(2)
        with tc1:
            if st.button("💳 Cartão", key=f"type_card_{source}", use_container_width=True,
                        type="primary" if import_type == "cartao" else "secondary"):
                st.session_state.import_type = "cartao"
                st.rerun()
        with tc2:
            if st.button("🏦 Conta", key=f"type_conta_{source}", use_container_width=True,
                        type="primary" if import_type == "conta" else "secondary"):
                st.session_state.import_type = "conta"
                st.rerun()
    else:
        st.markdown('<div class="import-section-label">Tipo</div>', unsafe_allow_html=True)
        st.caption("Selecione uma instituição acima")

    st.markdown('<hr class="import-divider">', unsafe_allow_html=True)

    # ROW 3: File Upload (always shown)
    st.markdown('<div class="import-section-label">Arquivo</div>', unsafe_allow_html=True)

    ready_for_upload = source and (import_type or not needs_subtype)

    if ready_for_upload:
        file_cfg = {
            "IBKR": (['csv'], "CSV do IBKR"),
            "B3":   (['xlsx', 'xls'], "Excel da B3 (.xlsx)"),
            "Nu":   (['ofx', 'txt'], "OFX do Nubank"),
        }
        file_types, file_hint = file_cfg.get(source, (['csv'], "Arquivo"))

        # Key só depende do source para preservar arquivo ao trocar tipo
        new_upload = st.file_uploader(
            f"📁 {file_hint}",
            type=file_types,
            key=f"uploader_{source}",
            label_visibility="collapsed"
        )

        # Salvar arquivo no session_state quando novo upload
        if new_upload is not None:
            st.session_state.import_file_data = new_upload.getvalue()
            st.session_state.import_file_name = new_upload.name

        # Usar arquivo do session_state (persiste entre trocas de tipo)
        uploaded_file = new_upload

        # Mostrar nome do arquivo carregado se houver
        if st.session_state.import_file_name and not new_upload:
            st.caption(f"📄 Arquivo: {st.session_state.import_file_name}")
            # Botão para limpar arquivo
            if st.button("🗑️ Limpar arquivo", key="clear_file", use_container_width=True):
                st.session_state.import_file_data = None
                st.session_state.import_file_name = None
                st.rerun()
    else:
        st.caption("Complete as seleções acima para fazer upload")
        uploaded_file = None

    # end of selectors section

    # ── PROCESSING ──
    # Usar dados do session_state se arquivo foi carregado anteriormente
    has_file = uploaded_file is not None or st.session_state.import_file_data is not None
    if has_file:
        # Obter dados e extensão do arquivo (do upload ou session_state)
        if uploaded_file is not None:
            file_data = uploaded_file.getvalue()
            file_ext = uploaded_file.name.split('.')[-1].lower()
        else:
            file_data = st.session_state.import_file_data
            file_ext = st.session_state.import_file_name.split('.')[-1].lower()

        # ── IBKR ──────────────────────────────────
        if source == "IBKR":
            if import_type == "proventos":
                import tempfile, os as os_sync
                from core.ibkr_sync import IBKRSyncManager
                from core.data.loader import load_proventos

                with tempfile.NamedTemporaryFile(delete=False, suffix='.csv') as tmp:
                    tmp.write(file_data)
                    tmp_path = tmp.name

                try:
                    with st.spinner("Analisando CSV..."):
                        sync_manager = IBKRSyncManager(csv_path=tmp_path)
                        qtd_div, qtd_imp = sync_manager.load_csv()

                    st.markdown(f'''
                    <div class="status-card info">
                        <div class="status-card-header">
                            <span class="status-card-icon">📊</span>
                            <span class="status-card-title">CSV Analisado</span>
                        </div>
                        <div class="status-card-body"><strong>{qtd_div}</strong> dividendos · <strong>{qtd_imp}</strong> impostos</div>
                    </div>''', unsafe_allow_html=True)

                    st.cache_data.clear()
                    df_faltantes = sync_manager.find_missing(load_proventos())

                    if df_faltantes.empty:
                        st.markdown('''
                        <div class="status-card success">
                            <div class="status-card-header">
                                <span class="status-card-icon">✅</span>
                                <span class="status-card-title">Tudo sincronizado!</span>
                            </div>
                            <div class="status-card-body">Todos os proventos já estão na base.</div>
                        </div>''', unsafe_allow_html=True)
                    else:
                        st.markdown(f'''
                        <div class="status-card warning">
                            <div class="status-card-header">
                                <span class="status-card-icon">📥</span>
                                <span class="status-card-title">{len(df_faltantes)} novos proventos</span>
                            </div>
                        </div>''', unsafe_allow_html=True)

                        st.dataframe(df_faltantes[['data','ticker','decisao','valor','moeda']], use_container_width=True, height=180)

                        col1, col2 = st.columns(2)
                        with col1:
                            if st.button("📝 Testar", key="btn_sync_test", use_container_width=True):
                                with st.spinner("Enviando..."):
                                    ok, msg = sync_manager.sync_to_test()
                                st.success(f"✅ {msg}") if ok else st.error(f"❌ {msg}")
                        with col2:
                            if st.button("🚀 Produção", key="btn_sync_prod", type="primary", use_container_width=True):
                                with st.spinner("Aplicando..."):
                                    ok, msg, _ = sync_manager.apply_to_production()
                                if ok:
                                    st.success(f"✅ {msg}")
                                    try:
                                        from core.data.gsheets import _authenticate_no_cache
                                        c = _authenticate_no_cache()
                                        if c:
                                            try: c.open('gdados').del_worksheet(c.open('gdados').worksheet('meus_proventos_test'))
                                            except: pass
                                    except: pass
                                    st.cache_data.clear(); time.sleep(1); st.rerun()
                                else:
                                    st.error(f"❌ {msg}")

                except Exception as e:
                    st.error(f"Erro: {e}")
                finally:
                    try: os_sync.unlink(tmp_path)
                    except: pass

            elif import_type == "ativos":
                import tempfile, os as os_sync
                from core.ibkr_sync import IBKRTradesManager
                from core.data.provider import DataProvider

                with tempfile.NamedTemporaryFile(delete=False, suffix='.csv') as tmp:
                    tmp.write(file_data)
                    tmp_path = tmp.name

                try:
                    with st.spinner("Analisando CSV..."):
                        trades_mgr = IBKRTradesManager(csv_path=tmp_path)
                        qtd_c, qtd_v = trades_mgr.load_csv()

                    st.markdown(f'''
                    <div class="status-card info">
                        <div class="status-card-header">
                            <span class="status-card-icon">📈</span>
                            <span class="status-card-title">CSV Analisado</span>
                        </div>
                        <div class="status-card-body"><strong>{qtd_c}</strong> compras · <strong>{qtd_v}</strong> vendas</div>
                    </div>''', unsafe_allow_html=True)

                    st.cache_data.clear()
                    df_raw = trades_mgr.find_missing(DataProvider.get_assets())

                    if 'status_match' in df_raw.columns:
                        df_splits = df_raw[df_raw['status_match'] == 'POTENTIAL_SPLIT']
                        df_missing = df_raw[df_raw['status_match'] == 'MISSING']
                    else:
                        df_splits, df_missing = pd.DataFrame(), df_raw

                    trades_mgr.df_faltantes = df_missing

                    if not df_splits.empty:
                        with st.expander(f"⚠️ {len(df_splits)} possíveis splits", expanded=False):
                            sc = [c for c in ['Data','Símbolo','Quantidade','Preço'] if c in df_splits.columns]
                            st.dataframe(df_splits[sc], use_container_width=True, height=120)

                    if df_missing.empty:
                        st.markdown('''
                        <div class="status-card success">
                            <div class="status-card-header">
                                <span class="status-card-icon">✅</span>
                                <span class="status-card-title">Tudo sincronizado!</span>
                            </div>
                        </div>''', unsafe_allow_html=True)
                    else:
                        st.markdown(f'''
                        <div class="status-card warning">
                            <div class="status-card-header">
                                <span class="status-card-icon">📥</span>
                                <span class="status-card-title">{len(df_missing)} novos trades</span>
                            </div>
                        </div>''', unsafe_allow_html=True)

                        tc = [c for c in ['Data','Tipo de transação','Símbolo','Quantidade','Preço'] if c in df_missing.columns]
                        st.dataframe(df_missing[tc], use_container_width=True, height=180)

                        col1, col2 = st.columns(2)
                        with col1:
                            if st.button("📝 Testar", key="btn_trades_test", use_container_width=True):
                                with st.spinner("Enviando..."):
                                    ok, msg = trades_mgr.sync_to_test()
                                st.success(f"✅ {msg}") if ok else st.error(f"❌ {msg}")
                        with col2:
                            if st.button("🚀 Produção", key="btn_trades_prod", type="primary", use_container_width=True):
                                with st.spinner("Aplicando..."):
                                    ok, msg, _ = trades_mgr.apply_to_production()
                                if ok:
                                    st.success(f"✅ {msg}"); st.cache_data.clear(); time.sleep(1); st.rerun()
                                else:
                                    st.error(f"❌ {msg}")

                except Exception as e:
                    st.error(f"Erro: {e}")
                finally:
                    try: os_sync.unlink(tmp_path)
                    except: pass

        # ── B3 ────────────────────────────────────
        elif source == "B3":
            if file_ext not in ['xlsx', 'xls']:
                st.error("❌ Use arquivo Excel (.xlsx)")
            elif import_type == "proventos":
                import importlib, core.b3_sync
                from io import BytesIO
                importlib.reload(core.b3_sync)
                from core.b3_sync import B3SyncManager

                with st.spinner("Processando B3..."):
                    b3_mgr = B3SyncManager()
                    file_obj = BytesIO(file_data)
                    df_prev, msg = b3_mgr.process_file(file_obj)

                if not df_prev.empty:
                    st.markdown(f'''
                    <div class="status-card warning">
                        <div class="status-card-header">
                            <span class="status-card-icon">📥</span>
                            <span class="status-card-title">{len(df_prev)} proventos faltantes</span>
                        </div>
                    </div>''', unsafe_allow_html=True)

                    cols = [c for c in ['data','ticker','decisao','valor','moeda'] if c in df_prev.columns]
                    st.dataframe(df_prev[cols], use_container_width=True, height=180)

                    col1, col2 = st.columns(2)
                    with col1:
                        if st.button("📝 Testar", key="btn_b3_test", use_container_width=True):
                            with st.spinner("Enviando..."):
                                ok, ms = b3_mgr.sync_to_test()
                            st.success(f"✅ {ms}") if ok else st.error(f"❌ {ms}")
                    with col2:
                        if st.button("🚀 Produção", key="btn_b3_prod", type="primary", use_container_width=True):
                            with st.spinner("Aplicando..."):
                                ok, ms, _ = b3_mgr.apply_to_production()
                            if ok:
                                st.success(f"✅ {ms}"); st.cache_data.clear(); time.sleep(1); st.rerun()
                            else:
                                st.error(f"❌ {ms}")
                elif msg:
                    st.warning(msg)
                else:
                    st.markdown('''
                    <div class="status-card success">
                        <div class="status-card-header">
                            <span class="status-card-icon">✅</span>
                            <span class="status-card-title">Tudo sincronizado!</span>
                        </div>
                    </div>''', unsafe_allow_html=True)

            elif import_type == "ativos":
                import importlib, core.b3_sync
                from io import BytesIO
                importlib.reload(core.b3_sync)
                from core.b3_sync import B3TradesManager

                with st.spinner("Processando B3..."):
                    b3_t = B3TradesManager()
                    file_obj = BytesIO(file_data)
                    df_prev, msg = b3_t.process_trades(file_obj)

                if not df_prev.empty:
                    st.markdown(f'''
                    <div class="status-card warning">
                        <div class="status-card-header">
                            <span class="status-card-icon">📥</span>
                            <span class="status-card-title">{len(df_prev)} trades faltantes</span>
                        </div>
                    </div>''', unsafe_allow_html=True)

                    cols = [c for c in ['Data','Tipo de transação','Símbolo','Quantidade','Preço'] if c in df_prev.columns]
                    st.dataframe(df_prev[cols], use_container_width=True, height=180)

                    col1, col2 = st.columns(2)
                    with col1:
                        if st.button("📝 Testar", key="btn_b3_trades_test", use_container_width=True):
                            with st.spinner("Enviando..."):
                                ok, ms = b3_t.sync_to_test()
                            st.success(f"✅ {ms}") if ok else st.error(f"❌ {ms}")
                    with col2:
                        if st.button("🚀 Produção", key="btn_b3_trades_prod", type="primary", use_container_width=True):
                            with st.spinner("Aplicando..."):
                                ok, ms, _ = b3_t.apply_to_production()
                            if ok:
                                st.success(f"✅ {ms}"); st.cache_data.clear(); time.sleep(1); st.rerun()
                            else:
                                st.error(f"❌ {ms}")
                elif msg:
                    st.warning(msg)
                else:
                    st.markdown('''
                    <div class="status-card success">
                        <div class="status-card-header">
                            <span class="status-card-icon">✅</span>
                            <span class="status-card-title">Tudo sincronizado!</span>
                        </div>
                    </div>''', unsafe_allow_html=True)

        # ── OFX (Nu) ─────────────────────────────
        elif source == "Nu":
            if file_ext not in ['ofx', 'txt']:
                st.error("❌ Use arquivo OFX")
            else:
                import importlib, core.finance_sync
                from io import BytesIO
                importlib.reload(core.finance_sync)
                from core.finance_sync import FinanceSyncManager

                tipo_bd = "Cartão" if import_type == "cartao" else "Conta"

                with st.spinner("Processando OFX..."):
                    f_mgr = FinanceSyncManager()
                    file_obj = BytesIO(file_data)
                    df_new, msg = f_mgr.process_file(file_obj, source, tipo_bd)

                if not msg and not df_new.empty:
                    st.markdown(f'''
                    <div class="status-card info">
                        <div class="status-card-header">
                            <span class="status-card-icon">💳</span>
                            <span class="status-card-title">{len(df_new)} novas transações</span>
                        </div>
                    </div>''', unsafe_allow_html=True)

                    st.dataframe(df_new[['data','descricao','valor','categoria']], use_container_width=True, height=180)

                    if st.button("🚀 Importar", use_container_width=True, type="primary", key="btn_imp_ofx"):
                        with st.spinner("Importando..."):
                            ok, save_msg = f_mgr.save_to_gsheets()
                        if ok:
                            st.success(save_msg); st.cache_data.clear(); time.sleep(1); st.rerun()
                        else:
                            st.error(save_msg)
                elif msg:
                    st.error(msg)
                else:
                    st.info("Nenhuma transação nova.")

# ════════════════════════════════════════════════════════
# 2. SYSTEM SYNC
# ════════════════════════════════════════════════════════
with c2:
  with st.container(border=True):
    st.markdown('''
    <div class="import-glass-header">
        <span class="import-glass-icon">🔄</span>
        <span class="import-glass-title">Sincronização</span>
    </div>
    <div class="import-glass-desc">Atualizar cotações de câmbio oficiais (PTAX)</div>
    ''', unsafe_allow_html=True)

    st.markdown("""
    <div class="status-card info">
        <div class="status-card-header">
            <span class="status-card-icon">🏛️</span>
            <span class="status-card-title">Fonte Oficial</span>
        </div>
        <div class="status-card-body">IPEA / Banco Central do Brasil</div>
    </div>
    """, unsafe_allow_html=True)

    if st.button("🔄 Sincronizar PTAX", use_container_width=True, key="btn_ptax", type="primary"):
        from core.ptax_updater import atualizar_ptax
        with st.spinner("Conectando ao IPEA..."):
            success, msg = atualizar_ptax()
        st.success(f"✅ {msg}") if success else st.error(f"❌ {msg}")

# ════════════════════════════════════════════════════════
# 3. SECURITY
# ════════════════════════════════════════════════════════
with c3:
  with st.container(border=True):
    st.markdown('''
    <div class="import-glass-header">
        <span class="import-glass-icon">🔐</span>
        <span class="import-glass-title">Segurança</span>
    </div>
    <div class="import-glass-desc">Gerenciar autenticação e credenciais de acesso</div>
    ''', unsafe_allow_html=True)

    current_auth_state = is_auth_enabled()
    new_auth_state = st.toggle("🔒 Exigir senha", value=current_auth_state)

    if new_auth_state != current_auth_state:
        if set_auth_enabled(new_auth_state):
            st.toast(f"Autenticação {'ativada' if new_auth_state else 'desativada'}", icon="🛡️")
            time.sleep(1)
            st.rerun()
        else:
            st.error("Erro ao atualizar")

    st.markdown("---")

    with st.form("update_password_form", clear_on_submit=True):
        old_pwd = st.text_input("Senha atual", type="password")
        new_pwd = st.text_input("Nova senha", type="password")
        conf_pwd = st.text_input("Confirmar", type="password")

        submit = st.form_submit_button("Atualizar Senha", use_container_width=True)

        if submit:
            if old_pwd != get_password():
                st.error("❌ Senha incorreta")
            elif new_pwd != conf_pwd:
                st.error("❌ Senhas não coincidem")
            elif len(new_pwd) < 4:
                st.error("❌ Mínimo 4 caracteres")
            else:
                if update_password(new_pwd):
                    st.success("✅ Senha atualizada")
                    time.sleep(1)
                    st.rerun()
                else:
                    st.error("❌ Erro ao salvar")

import streamlit as st
import streamlit.components.v1 as components
import time
import pandas as pd
from pathlib import Path
from core.auth import require_auth, get_password, update_password, is_auth_enabled, set_auth_enabled
from core.theme import inject_global_theme, render_back_button
from core.ui import render_fab
import base64

_LOGOS = Path(__file__).parent.parent / "assets" / "logos"

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

# ── BACKGROUND VIDEO ─────────────────────────────────────────────────────────

def get_video_base64():
    try:
        vpath = Path(__file__).parent.parent / "assets" / "videos" / "Video 1.mp4"
        with open(vpath, "rb") as f:
            return base64.b64encode(f.read()).decode()
    except Exception:
        return None

video_b64 = get_video_base64()

if video_b64:
    st.markdown(f"""
    <div style="position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:0;overflow:hidden;pointer-events:none;">
        <video id="bgvid" autoplay muted playsinline style="width:100vw;height:100vh;object-fit:cover;opacity:0.15;">
            <source src="data:video/mp4;base64,{video_b64}" type="video/mp4">
        </video>
        <div style="position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(10,14,20,0.7);"></div>
    </div>
    <script>
        var v = document.getElementById('bgvid');
        if (v) {{
            v.addEventListener('ended', function() {{
                setTimeout(function() {{ v.currentTime = 0; v.play(); }}, 5000);
            }});
        }}
    </script>
    """, unsafe_allow_html=True)

# ── CSS ──────────────────────────────────────────────────────────────────────

st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');

html, body, [class*="css"] { font-family: 'Outfit', sans-serif; }

.stApp {
    background: #0a0e14;
}

section[data-testid="stSidebar"],
[data-testid="collapsedControl"] { display: none !important; }

/* Force text color */
p, h1, h2, h3, h4, h5, h6, span, div, label, li {
    color: #f1f5f9 !important;
}

/* ── Glassmorphism Expanders ── */
.stExpander {
    background: rgba(10, 18, 35, 0.4) !important;
    backdrop-filter: blur(18px) !important;
    -webkit-backdrop-filter: blur(18px) !important;
    border: 1px solid rgba(99, 102, 241, 0.08) !important;
    border-radius: 16px !important;
    overflow: hidden !important;
    box-shadow: 0 0 20px rgba(99, 102, 241, 0.04), 0 6px 24px rgba(0,0,0,0.25) !important;
    margin-bottom: 10px !important;
    transition: all 0.35s ease !important;
}
.stExpander:hover {
    border-color: rgba(99, 102, 241, 0.15) !important;
    box-shadow: 0 0 30px rgba(99, 102, 241, 0.08), 0 8px 32px rgba(0,0,0,0.3) !important;
}
.stExpander > details > summary {
    padding: 14px 20px !important;
    font-family: 'Outfit', sans-serif !important;
    font-size: 0.92rem !important;
    font-weight: 600 !important;
    color: #e2e8f0 !important;
    letter-spacing: -0.2px !important;
    border: none !important;
    background: transparent !important;
}
.stExpander > details > summary:hover { color: #fff !important; }
.stExpander > details > summary svg { color: rgba(99, 102, 241, 0.5) !important; }
.stExpander > details > div[data-testid="stExpanderDetails"] {
    padding: 4px 20px 16px !important;
    border-top: 1px solid rgba(255,255,255,0.04) !important;
}

/* ── Status Cards ── */
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

/* ── Section Labels ── */
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

/* ── Header ── */
.fh { text-align: center; padding: 14px 0 18px; animation: fadeIn 0.6s ease-out; }
.fh-t {
    font-size: 2rem; font-weight: 800;
    background: linear-gradient(to right, #f1f5f9, #a5b4fc);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    letter-spacing: -1.2px;
}
.fh-s { color: #475569; font-size: 0.82rem; font-weight: 300; margin-top: 2px; }
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(-10px); }
    to   { opacity: 1; transform: translateY(0); }
}

/* ── Compact Input overrides ── */
.stNumberInput > div > div > input,
.stTextInput > div > div > input {
    padding: 6px 10px !important;
    font-size: 0.82rem !important;
    height: 34px !important;
    border-radius: 10px !important;
    background: rgba(15, 23, 42, 0.5) !important;
    border: 1px solid rgba(255,255,255,0.08) !important;
    color: #e2e8f0 !important;
}
.stNumberInput > div > div > input:focus,
.stTextInput > div > div > input:focus {
    border-color: rgba(99,102,241,0.4) !important;
    box-shadow: 0 0 0 2px rgba(99,102,241,0.1) !important;
}
.stNumberInput button { display: none !important; }
.stButton > button {
    padding: 4px 14px !important;
    font-size: 0.78rem !important;
    border-radius: 10px !important;
    min-height: 34px !important;
}

/* ── Security Toggle ── */
.stToggle label span {
    color: #e2e8f0 !important;
}

/* ── Mobile ── */
@media (max-width: 768px) {
    .fh-t { font-size: 1.6rem; }
}
</style>
""", unsafe_allow_html=True)

# ── HEADER ───────────────────────────────────────────────────────────────────

render_fab()

st.markdown("""
<div class="fh">
    <div class="fh-t">Configurações</div>
    <div class="fh-s">Ferramentas de administração e controle do sistema</div>
</div>
""", unsafe_allow_html=True)

# ════════════════════════════════════════════════════════
# 1. DATA INGESTION — Expandable Card
# ════════════════════════════════════════════════════════

with st.expander("📥  Importar Dados  ·  Upload de arquivos externos", expanded=False):

    # ── Session state ──
    if 'import_source' not in st.session_state:
        st.session_state.import_source = None
    if 'import_type' not in st.session_state:
        st.session_state.import_type = None
    if 'import_file_data' not in st.session_state:
        st.session_state.import_file_data = None
    if 'import_file_name' not in st.session_state:
        st.session_state.import_file_name = None
    if 'b3_prov_faltantes' not in st.session_state:
        st.session_state.b3_prov_faltantes = None
    if 'b3_trades_faltantes' not in st.session_state:
        st.session_state.b3_trades_faltantes = None

    source = st.session_state.import_source
    import_type = st.session_state.import_type
    needs_subtype = source in ["IBKR", "B3"]

    # ROW 1: Source (com logos)
    st.markdown('<div class="import-section-label">Instituição</div>', unsafe_allow_html=True)
    src_col1, src_col2, src_col3 = st.columns(3)
    with src_col1:
        col_img = st.columns([1, 2, 1])[1]
        with col_img:
            st.image(str(_LOGOS / "ibkr.jpg"), width=50)
        if st.button("IBKR", key="src_ibkr", use_container_width=True,
                     type="primary" if source == "IBKR" else "secondary"):
            if source != "IBKR":
                st.session_state.import_file_data = None
                st.session_state.import_file_name = None
                st.session_state.b3_prov_faltantes = None
                st.session_state.b3_trades_faltantes = None
            st.session_state.import_source = "IBKR"
            st.session_state.import_type = None
            st.rerun()
    with src_col2:
        col_img = st.columns([1, 2, 1])[1]
        with col_img:
            st.image(str(_LOGOS / "b3.png"), width=50)
        if st.button("B3", key="src_b3", use_container_width=True,
                     type="primary" if source == "B3" else "secondary"):
            if source != "B3":
                st.session_state.import_file_data = None
                st.session_state.import_file_name = None
                st.session_state.b3_prov_faltantes = None
                st.session_state.b3_trades_faltantes = None
            st.session_state.import_source = "B3"
            st.session_state.import_type = None
            st.rerun()
    with src_col3:
        col_img = st.columns([1, 2, 1])[1]
        with col_img:
            st.image(str(_LOGOS / "nubank.png"), width=50)
        if st.button("Nubank", key="src_nu", use_container_width=True,
                     type="primary" if source == "Nu" else "secondary"):
            if source != "Nu":
                st.session_state.import_file_data = None
                st.session_state.import_file_name = None
                st.session_state.b3_prov_faltantes = None
                st.session_state.b3_trades_faltantes = None
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
                if import_type != "proventos":
                    st.session_state.b3_prov_faltantes = None
                    st.session_state.b3_trades_faltantes = None
                st.session_state.import_type = "proventos"
                st.rerun()
        with tc2:
            if st.button("📈 Ativos", key=f"type_ativos_{source}", use_container_width=True,
                        type="primary" if import_type == "ativos" else "secondary"):
                if import_type != "ativos":
                    st.session_state.b3_prov_faltantes = None
                    st.session_state.b3_trades_faltantes = None
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

        new_upload = st.file_uploader(
            f"📁 {file_hint}",
            type=file_types,
            key=f"uploader_{source}",
            label_visibility="collapsed"
        )

        if new_upload is not None:
            st.session_state.import_file_data = new_upload.getvalue()
            st.session_state.import_file_name = new_upload.name

        uploaded_file = new_upload

        if st.session_state.import_file_name and not new_upload:
            st.caption(f"📄 Arquivo: {st.session_state.import_file_name}")
            if st.button("🗑️ Limpar arquivo", key="clear_file", use_container_width=True):
                st.session_state.import_file_data = None
                st.session_state.import_file_name = None
                st.session_state.b3_prov_faltantes = None
                st.session_state.b3_trades_faltantes = None
                st.rerun()
    else:
        st.caption("Complete as seleções acima para fazer upload")
        uploaded_file = None

    # ── PROCESSING ──
    has_file = uploaded_file is not None or st.session_state.import_file_data is not None
    if has_file:
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
                from core.sync.ibkr_sync import IBKRSyncManager
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
                from core.sync.ibkr_sync import IBKRTradesManager
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
                import importlib, core.sync.b3_sync
                from io import BytesIO
                importlib.reload(core.sync.b3_sync)
                from core.sync.b3_sync import B3SyncManager

                with st.spinner("Processando B3..."):
                    b3_mgr = B3SyncManager()
                    file_obj = BytesIO(file_data)
                    df_prev, msg = b3_mgr.process_file(file_obj)
                    if not df_prev.empty:
                        st.session_state.b3_prov_faltantes = df_prev.copy()

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
                            df_faltantes = st.session_state.get('b3_prov_faltantes')
                            if df_faltantes is not None and not df_faltantes.empty:
                                b3_mgr.df_faltantes = df_faltantes
                                with st.spinner("Aplicando..."):
                                    ok, ms, _ = b3_mgr.apply_to_production()
                                if ok:
                                    st.session_state.b3_prov_faltantes = None
                                    st.success(f"✅ {ms}"); st.cache_data.clear(); time.sleep(1); st.rerun()
                                else:
                                    st.error(f"❌ {ms}")
                            else:
                                st.error("❌ Nenhum dado faltante encontrado. Recarregue o arquivo.")
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
                import importlib, core.sync.b3_sync
                from io import BytesIO
                importlib.reload(core.sync.b3_sync)
                from core.sync.b3_sync import B3TradesManager

                with st.spinner("Processando B3..."):
                    b3_t = B3TradesManager()
                    file_obj = BytesIO(file_data)
                    df_prev, msg = b3_t.process_trades(file_obj)
                    if not df_prev.empty:
                        st.session_state.b3_trades_faltantes = df_prev.copy()

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
                            df_faltantes = st.session_state.get('b3_trades_faltantes')
                            if df_faltantes is not None and not df_faltantes.empty:
                                b3_t.df_faltantes = df_faltantes
                                with st.spinner("Aplicando..."):
                                    ok, ms, _ = b3_t.apply_to_production()
                                if ok:
                                    st.session_state.b3_trades_faltantes = None
                                    st.success(f"✅ {ms}"); st.cache_data.clear(); time.sleep(1); st.rerun()
                                else:
                                    st.error(f"❌ {ms}")
                            else:
                                st.error("❌ Nenhum dado faltante encontrado. Recarregue o arquivo.")
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
                import importlib, core.sync.finance_sync
                from io import BytesIO
                importlib.reload(core.sync.finance_sync)
                from core.sync.finance_sync import FinanceSyncManager

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
# 2. SYSTEM SYNC — Expandable Card
# ════════════════════════════════════════════════════════

with st.expander("🔄  Sincronização  ·  Atualizar cotações de câmbio (PTAX)", expanded=False):

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
# 3. SECURITY — Expandable Card
# ════════════════════════════════════════════════════════

with st.expander("🔐  Segurança  ·  Autenticação e credenciais de acesso", expanded=False):

    current_auth_state = is_auth_enabled()
    new_auth_state = st.toggle("🔒 Exigir senha", value=current_auth_state)

    if new_auth_state != current_auth_state:
        if set_auth_enabled(new_auth_state):
            st.toast(f"Autenticação {'ativada' if new_auth_state else 'desativada'}", icon="🛡️")
            time.sleep(1)
            st.rerun()
        else:
            st.error("Erro ao atualizar")

    st.markdown('<hr class="import-divider">', unsafe_allow_html=True)

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

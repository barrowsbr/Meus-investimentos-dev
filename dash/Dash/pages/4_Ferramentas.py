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
.stApp { background: #0a0e14; }
section[data-testid="stSidebar"],
[data-testid="collapsedControl"] { display: none !important; }
p, h1, h2, h3, h4, h5, h6, span, div, label, li { color: #f1f5f9 !important; }

/* ── Glassmorphism Expanders ── */
.stExpander {
    background: rgba(10, 18, 35, 0.45) !important;
    backdrop-filter: blur(20px) !important;
    -webkit-backdrop-filter: blur(20px) !important;
    border: 1px solid rgba(99, 102, 241, 0.1) !important;
    border-radius: 20px !important;
    overflow: hidden !important;
    box-shadow: 0 0 24px rgba(99, 102, 241, 0.05), 0 8px 32px rgba(0,0,0,0.3) !important;
    margin-bottom: 12px !important;
    transition: all 0.3s ease !important;
}
.stExpander:hover {
    border-color: rgba(99, 102, 241, 0.2) !important;
    box-shadow: 0 0 36px rgba(99, 102, 241, 0.09), 0 10px 40px rgba(0,0,0,0.35) !important;
}
.stExpander > details > summary {
    padding: 18px 22px !important;
    font-family: 'Outfit', sans-serif !important;
    font-size: 0.95rem !important;
    font-weight: 600 !important;
    color: #e2e8f0 !important;
    letter-spacing: -0.2px !important;
    border: none !important;
    background: transparent !important;
}
.stExpander > details > summary:hover { color: #fff !important; }
.stExpander > details > summary svg { color: rgba(99, 102, 241, 0.6) !important; }
.stExpander > details > div[data-testid="stExpanderDetails"] {
    padding: 0 22px 20px !important;
    border-top: 1px solid rgba(255,255,255,0.05) !important;
}

/* ── Status Cards ── */
.status-card {
    border-radius: 14px;
    padding: 14px 16px;
    margin: 10px 0;
    border-left: 3px solid;
    display: flex;
    align-items: flex-start;
    gap: 12px;
}
.status-card.info    { border-left-color: #60a5fa; background: rgba(96,165,250,0.08); }
.status-card.success { border-left-color: #34d399; background: rgba(52,211,153,0.08); }
.status-card.warning { border-left-color: #fbbf24; background: rgba(251,191,36,0.08); }
.status-card.error   { border-left-color: #f87171; background: rgba(248,113,113,0.08); }
.status-card-icon  { font-size: 1.4rem; flex-shrink: 0; margin-top: 1px; }
.status-card-content { flex: 1; }
.status-card-title { font-size: 0.9rem !important; font-weight: 700 !important; color: #f1f5f9 !important; }
.status-card-body  { font-size: 0.8rem !important; color: #94a3b8 !important; margin-top: 2px; line-height: 1.5; }

/* ── Wizard step header ── */
.wiz-step { display:none; }

/* ── Source selector cards ── */
.src-card { display:none; }

/* ── Import tabs ── */
.stTabs [data-baseweb="tab-list"] {
    gap: 0;
    background: rgba(15,23,42,0.5);
    border-radius: 14px;
    padding: 4px;
    border: 1px solid rgba(255,255,255,0.06);
}
.stTabs [data-baseweb="tab"] {
    border-radius: 10px !important;
    padding: 8px 28px !important;
    font-size: 0.82rem !important;
    font-weight: 600 !important;
    color: #64748b !important;
    background: transparent !important;
    border: none !important;
    transition: all 0.2s ease !important;
}
.stTabs [aria-selected="true"] {
    background: rgba(99,102,241,0.18) !important;
    color: #a5b4fc !important;
    box-shadow: 0 0 12px rgba(99,102,241,0.1) !important;
}
.stTabs [data-baseweb="tab-panel"] {
    padding-top: 20px !important;
}
.inst-logo-wrap { display:flex; justify-content:center; margin-bottom:14px; }
.inst-logo-wrap img { max-height: 56px; width:auto; }

/* ── Type pill buttons ── */
.type-pills { display: flex; gap: 8px; margin: 4px 0 8px; flex-wrap: wrap; }
.type-pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 16px;
    border-radius: 30px;
    font-size: 0.78rem; font-weight: 600;
    border: 1.5px solid rgba(255,255,255,0.08);
    background: rgba(15,23,42,0.5);
    color: #64748b !important;
    cursor: pointer; transition: all 0.2s ease;
}
.type-pill.active {
    border-color: rgba(99,102,241,0.5);
    background: rgba(99,102,241,0.12);
    color: #a5b4fc !important;
    box-shadow: 0 0 12px rgba(99,102,241,0.1);
}

/* ── File zone ── */
.file-zone-hint {
    background: rgba(99,102,241,0.05);
    border: 1.5px dashed rgba(99,102,241,0.2);
    border-radius: 14px;
    padding: 14px 16px;
    text-align: center;
    margin-bottom: 8px;
}
.file-zone-hint-text {
    font-size: 0.75rem !important;
    color: #475569 !important;
    letter-spacing: 0.3px;
}

/* ── Count badge ── */
.count-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(251,191,36,0.1);
    border: 1px solid rgba(251,191,36,0.25);
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 0.8rem; font-weight: 700;
    color: #fbbf24 !important;
    margin-bottom: 10px;
}
.count-badge.green {
    background: rgba(52,211,153,0.1);
    border-color: rgba(52,211,153,0.25);
    color: #34d399 !important;
}
.count-badge.blue {
    background: rgba(96,165,250,0.1);
    border-color: rgba(96,165,250,0.25);
    color: #60a5fa !important;
}

/* ── Section card (Sync / Security) ── */
.section-card {
    background: rgba(10,18,35,0.45);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(99,102,241,0.1);
    border-radius: 20px;
    padding: 20px 22px;
    margin-bottom: 12px;
}
.section-card-header {
    display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
}
.section-card-icon {
    width: 40px; height: 40px;
    background: rgba(99,102,241,0.12);
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.2rem; flex-shrink: 0;
}
.section-card-title {
    font-size: 1rem !important;
    font-weight: 700 !important;
    color: #e2e8f0 !important;
}
.section-card-sub {
    font-size: 0.75rem !important;
    color: #475569 !important;
    margin-top: 1px;
}
.divider { border: none; border-top: 1px solid rgba(255,255,255,0.05); margin: 14px 0; }

/* ── Backup hint ── */
.backup-hint {
    display: flex; align-items: center; gap: 6px;
    background: rgba(52,211,153,0.06);
    border: 1px solid rgba(52,211,153,0.15);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 0.7rem !important;
    color: #34d399 !important;
    margin-top: 6px;
    word-break: break-all;
}

/* ── Header ── */
.fh { text-align: center; padding: 14px 0 20px; animation: fadeIn 0.5s ease-out; }
.fh-t {
    font-size: 2rem; font-weight: 800;
    background: linear-gradient(to right, #f1f5f9, #a5b4fc);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    letter-spacing: -1.2px;
}
.fh-s { color: #475569 !important; font-size: 0.82rem; font-weight: 300; margin-top: 2px; }
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
}

/* ── Inputs ── */
.stNumberInput > div > div > input,
.stTextInput > div > div > input {
    padding: 8px 12px !important;
    font-size: 0.85rem !important;
    height: 38px !important;
    border-radius: 12px !important;
    background: rgba(15,23,42,0.6) !important;
    border: 1px solid rgba(255,255,255,0.08) !important;
    color: #e2e8f0 !important;
}
.stNumberInput > div > div > input:focus,
.stTextInput > div > div > input:focus {
    border-color: rgba(99,102,241,0.45) !important;
    box-shadow: 0 0 0 3px rgba(99,102,241,0.1) !important;
}
.stNumberInput button { display: none !important; }
.stButton > button {
    padding: 6px 16px !important;
    font-size: 0.82rem !important;
    border-radius: 12px !important;
    min-height: 38px !important;
    font-weight: 600 !important;
}
.stToggle label span { color: #e2e8f0 !important; }

/* ── Mobile ── */
@media (max-width: 768px) {
    .fh-t { font-size: 1.6rem; }
    .type-pills { gap: 6px; }
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
# 1. DATA INGESTION — Tabs B3 | IBKR
# ════════════════════════════════════════════════════════

with st.expander("📥  Importar Dados  ·  B3 e IBKR", expanded=False):

    # ── Session state por instituição ──
    for _k, _v in [
        ('b3_type', None),   ('b3_file_data', None),   ('b3_file_name', None),
        ('ibkr_type', None), ('ibkr_file_data', None), ('ibkr_file_name', None),
    ]:
        if _k not in st.session_state:
            st.session_state[_k] = _v

    # ── Helpers ──
    def _card(kind, icon, title, body=""):
        return (f'<div class="status-card {kind}">'
                f'<span class="status-card-icon">{icon}</span>'
                f'<div class="status-card-content">'
                f'<div class="status-card-title">{title}</div>'
                f'{"<div class=status-card-body>" + body + "</div>" if body else ""}'
                f'</div></div>')

    def _backup_hint(path):
        if path:
            st.markdown(f'<div class="backup-hint">💾 Backup salvo em <code>{path}</code></div>',
                        unsafe_allow_html=True)

    def _import_btn(key):
        return st.button("📥  Importar para produção", key=key,
                         type="primary", use_container_width=True)

    def _type_buttons(prefix):
        """Exibe botões Proventos / Ativos e retorna o tipo selecionado."""
        current = st.session_state[f"{prefix}_type"]
        c1, c2 = st.columns(2)
        with c1:
            if st.button("📊  Proventos", key=f"{prefix}_prov", use_container_width=True,
                         type="primary" if current == "proventos" else "secondary"):
                st.session_state[f"{prefix}_type"] = "proventos"
                st.session_state[f"{prefix}_file_data"] = None
                st.session_state[f"{prefix}_file_name"] = None
                st.rerun()
        with c2:
            if st.button("📈  Ativos", key=f"{prefix}_ativ", use_container_width=True,
                         type="primary" if current == "ativos" else "secondary"):
                st.session_state[f"{prefix}_type"] = "ativos"
                st.session_state[f"{prefix}_file_data"] = None
                st.session_state[f"{prefix}_file_name"] = None
                st.rerun()
        return st.session_state[f"{prefix}_type"]

    def _file_upload(prefix, file_types, file_hint):
        """Exibe uploader e retorna (file_data, file_ext) ou (None, None)."""
        st.markdown(f'<div class="file-zone-hint"><span class="file-zone-hint-text">📎 {file_hint}</span></div>',
                    unsafe_allow_html=True)
        imp_type = st.session_state[f"{prefix}_type"]
        new_upload = st.file_uploader("Upload", type=file_types,
                                      key=f"up_{prefix}_{imp_type}",
                                      label_visibility="collapsed")
        if new_upload is not None:
            st.session_state[f"{prefix}_file_data"] = new_upload.getvalue()
            st.session_state[f"{prefix}_file_name"] = new_upload.name

        if st.session_state[f"{prefix}_file_name"] and not new_upload:
            fc1, fc2 = st.columns([5, 2])
            with fc1:
                st.markdown(f'<div style="font-size:0.78rem;color:#64748b;padding:6px 0;">'
                            f'📄 <strong style="color:#94a3b8;">{st.session_state[f"{prefix}_file_name"]}</strong></div>',
                            unsafe_allow_html=True)
            with fc2:
                if st.button("✕ Limpar", key=f"clear_{prefix}", use_container_width=True):
                    st.session_state[f"{prefix}_file_data"] = None
                    st.session_state[f"{prefix}_file_name"] = None
                    st.rerun()

        if st.session_state[f"{prefix}_file_data"]:
            ext = st.session_state[f"{prefix}_file_name"].split('.')[-1].lower()
            return st.session_state[f"{prefix}_file_data"], ext
        return None, None

    # ── Tabs ──
    tab_b3, tab_ibkr = st.tabs(["  B3  ", "  IBKR  "])

    # ══════════════════════════════════════════════════
    # TAB B3
    # ══════════════════════════════════════════════════
    with tab_b3:
        logo_b3 = _LOGOS / "b3.png"
        if logo_b3.exists():
            _, lc, _ = st.columns([3, 2, 3])
            with lc:
                st.image(str(logo_b3), use_container_width=True)
        st.markdown('<div style="height:6px"></div>', unsafe_allow_html=True)

        b3_type = _type_buttons("b3")

        if b3_type:
            file_data, file_ext = _file_upload("b3", ['xlsx', 'xls'],
                                               "Excel da B3 · Movimentações (.xlsx)")
            if file_data:
                if file_ext not in ['xlsx', 'xls']:
                    st.markdown(_card("error", "❌", "Formato incorreto",
                                      "Use o arquivo Excel (.xlsx) exportado da B3."), unsafe_allow_html=True)

                elif b3_type == "proventos":
                    import importlib, core.sync.b3_sync
                    from io import BytesIO
                    importlib.reload(core.sync.b3_sync)
                    from core.sync.b3_sync import B3SyncManager
                    with st.spinner("Processando Excel da B3..."):
                        b3_mgr = B3SyncManager()
                        df_prev, msg = b3_mgr.process_file(BytesIO(file_data))
                    if not df_prev.empty:
                        st.markdown(f'<div class="count-badge">📥 {len(df_prev)} proventos novos encontrados</div>',
                                    unsafe_allow_html=True)
                        cols = [c for c in ['data','ticker','decisao','valor','moeda'] if c in df_prev.columns]
                        st.dataframe(df_prev[cols], use_container_width=True, height=180)
                        if _import_btn("btn_b3_prov_prod"):
                            with st.spinner("Fazendo backup e importando..."):
                                ok, ms, backup_path = b3_mgr.apply_to_production()
                            if ok:
                                st.markdown(_card("success", "✅", ms), unsafe_allow_html=True)
                                _backup_hint(backup_path)
                                st.session_state.b3_file_data = None
                                st.session_state.b3_file_name = None
                                st.cache_data.clear(); time.sleep(1); st.rerun()
                            else:
                                st.markdown(_card("error", "❌", "Falha", ms), unsafe_allow_html=True)
                    elif msg:
                        st.markdown(_card("warning", "⚠️", "Aviso", msg), unsafe_allow_html=True)
                    else:
                        st.markdown(_card("success", "✅", "Tudo sincronizado!",
                                          "Nenhum provento novo no arquivo."), unsafe_allow_html=True)

                elif b3_type == "ativos":
                    import importlib, core.sync.b3_sync
                    from io import BytesIO
                    importlib.reload(core.sync.b3_sync)
                    from core.sync.b3_sync import B3TradesManager
                    with st.spinner("Processando Excel da B3..."):
                        b3_t = B3TradesManager()
                        df_prev, msg = b3_t.process_trades(BytesIO(file_data))
                    if not df_prev.empty:
                        st.markdown(f'<div class="count-badge">📥 {len(df_prev)} trades novos encontrados</div>',
                                    unsafe_allow_html=True)
                        cols = [c for c in ['Data','Tipo de transação','Símbolo','Quantidade','Preço'] if c in df_prev.columns]
                        st.dataframe(df_prev[cols], use_container_width=True, height=180)
                        if _import_btn("btn_b3_ativ_prod"):
                            with st.spinner("Fazendo backup e importando..."):
                                ok, ms, backup_path = b3_t.apply_to_production()
                            if ok:
                                st.markdown(_card("success", "✅", ms), unsafe_allow_html=True)
                                _backup_hint(backup_path)
                                st.session_state.b3_file_data = None
                                st.session_state.b3_file_name = None
                                st.cache_data.clear(); time.sleep(1); st.rerun()
                            else:
                                st.markdown(_card("error", "❌", "Falha", ms), unsafe_allow_html=True)
                    elif msg:
                        st.markdown(_card("warning", "⚠️", "Aviso", msg), unsafe_allow_html=True)
                    else:
                        st.markdown(_card("success", "✅", "Tudo sincronizado!",
                                          "Nenhum trade novo no arquivo."), unsafe_allow_html=True)

    # ══════════════════════════════════════════════════
    # TAB IBKR
    # ══════════════════════════════════════════════════
    with tab_ibkr:
        logo_ibkr = _LOGOS / "ibkr.jpg"
        if logo_ibkr.exists():
            _, lc, _ = st.columns([3, 2, 3])
            with lc:
                st.image(str(logo_ibkr), use_container_width=True)
        st.markdown('<div style="height:6px"></div>', unsafe_allow_html=True)

        ibkr_type = _type_buttons("ibkr")

        if ibkr_type:
            file_data, file_ext = _file_upload("ibkr", ['csv'],
                                               "CSV exportado do IBKR Activity Statement")
            if file_data:
                if ibkr_type == "proventos":
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
                        st.markdown(_card("info", "📊", "CSV analisado",
                                          f"<strong>{qtd_div}</strong> dividendos · <strong>{qtd_imp}</strong> impostos retidos"),
                                    unsafe_allow_html=True)
                        st.cache_data.clear()
                        df_faltantes = sync_manager.find_missing(load_proventos())
                        if df_faltantes.empty:
                            st.markdown(_card("success", "✅", "Tudo sincronizado!",
                                              "Todos os proventos do CSV já estão na base."), unsafe_allow_html=True)
                        else:
                            st.markdown(f'<div class="count-badge">📥 {len(df_faltantes)} novos proventos para importar</div>',
                                        unsafe_allow_html=True)
                            st.dataframe(df_faltantes[['data','ticker','decisao','valor','moeda']],
                                         use_container_width=True, height=180)
                            if _import_btn("btn_ibkr_prov_prod"):
                                with st.spinner("Fazendo backup e importando..."):
                                    ok, msg, backup_path = sync_manager.apply_to_production()
                                if ok:
                                    st.markdown(_card("success", "✅", msg), unsafe_allow_html=True)
                                    _backup_hint(backup_path)
                                    st.session_state.ibkr_file_data = None
                                    st.session_state.ibkr_file_name = None
                                    st.cache_data.clear(); time.sleep(1); st.rerun()
                                else:
                                    st.markdown(_card("error", "❌", "Falha na importação", msg), unsafe_allow_html=True)
                    except Exception as e:
                        st.markdown(_card("error", "❌", "Erro ao processar", str(e)), unsafe_allow_html=True)
                    finally:
                        try: os_sync.unlink(tmp_path)
                        except: pass

                elif ibkr_type == "ativos":
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
                        st.markdown(_card("info", "📈", "CSV analisado",
                                          f"<strong>{qtd_c}</strong> compras · <strong>{qtd_v}</strong> vendas"),
                                    unsafe_allow_html=True)
                        st.cache_data.clear()
                        df_raw = trades_mgr.find_missing(DataProvider.get_assets())
                        if 'status_match' in df_raw.columns:
                            df_splits = df_raw[df_raw['status_match'] == 'POTENTIAL_SPLIT']
                            df_missing = df_raw[df_raw['status_match'] == 'MISSING']
                        else:
                            df_splits, df_missing = pd.DataFrame(), df_raw
                        trades_mgr.df_faltantes = df_missing
                        if not df_splits.empty:
                            st.markdown(_card("warning", "⚠️", f"{len(df_splits)} possíveis splits / ajustes",
                                              "Valor total bate mas quantidade/preço diferem. Verifique manualmente."),
                                        unsafe_allow_html=True)
                            sc = [c for c in ['Data','Símbolo','Quantidade','Preço'] if c in df_splits.columns]
                            st.dataframe(df_splits[sc], use_container_width=True, height=100)
                        if df_missing.empty:
                            st.markdown(_card("success", "✅", "Tudo sincronizado!",
                                              "Todos os trades do CSV já estão na base."), unsafe_allow_html=True)
                        else:
                            st.markdown(f'<div class="count-badge">📥 {len(df_missing)} novos trades para importar</div>',
                                        unsafe_allow_html=True)
                            tc = [c for c in ['Data','Tipo de transação','Símbolo','Quantidade','Preço'] if c in df_missing.columns]
                            st.dataframe(df_missing[tc], use_container_width=True, height=180)
                            if _import_btn("btn_ibkr_ativ_prod"):
                                with st.spinner("Fazendo backup e importando..."):
                                    ok, msg, backup_path = trades_mgr.apply_to_production()
                                if ok:
                                    st.markdown(_card("success", "✅", msg), unsafe_allow_html=True)
                                    _backup_hint(backup_path)
                                    st.session_state.ibkr_file_data = None
                                    st.session_state.ibkr_file_name = None
                                    st.cache_data.clear(); time.sleep(1); st.rerun()
                                else:
                                    st.markdown(_card("error", "❌", "Falha na importação", msg), unsafe_allow_html=True)
                    except Exception as e:
                        st.markdown(_card("error", "❌", "Erro ao processar", str(e)), unsafe_allow_html=True)
                    finally:
                        try: os_sync.unlink(tmp_path)
                        except: pass

# ════════════════════════════════════════════════════════
# 2. SYSTEM SYNC — Expandable Card
# ════════════════════════════════════════════════════════

with st.expander("🔄  Sincronização  ·  Cotações de câmbio PTAX", expanded=False):

    st.markdown("""
    <div class="status-card info">
        <span class="status-card-icon">🏛️</span>
        <div class="status-card-content">
            <div class="status-card-title">Fonte Oficial · Banco Central do Brasil</div>
            <div class="status-card-body">Atualiza a série histórica de câmbio (USD/BRL) via API PTAX do BCB.
            Necessário para conversão correta de ativos internacionais.</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    if st.button("🔄  Sincronizar PTAX agora", use_container_width=True, key="btn_ptax", type="primary"):
        from core.ptax_updater import atualizar_ptax
        with st.spinner("Conectando ao Banco Central..."):
            success, msg = atualizar_ptax()
        if success:
            st.markdown(f'<div class="status-card success"><span class="status-card-icon">✅</span><div class="status-card-content"><div class="status-card-title">{msg}</div></div></div>', unsafe_allow_html=True)
        else:
            st.markdown(f'<div class="status-card error"><span class="status-card-icon">❌</span><div class="status-card-content"><div class="status-card-title">Falha</div><div class="status-card-body">{msg}</div></div></div>', unsafe_allow_html=True)

# ════════════════════════════════════════════════════════
# 3. SECURITY — Expandable Card
# ════════════════════════════════════════════════════════

with st.expander("🔐  Segurança  ·  Autenticação e credenciais", expanded=False):

    # Toggle auth
    current_auth_state = is_auth_enabled()
    ca, cb = st.columns([3, 1])
    with ca:
        st.markdown(
            '<div style="font-size:0.88rem;font-weight:600;color:#e2e8f0;margin-bottom:2px;">Exigir senha de acesso</div>'
            '<div style="font-size:0.75rem;color:#475569;">Quando ativo, a senha é solicitada ao abrir o app.</div>',
            unsafe_allow_html=True
        )
    with cb:
        new_auth_state = st.toggle("", value=current_auth_state, key="auth_toggle", label_visibility="collapsed")

    if new_auth_state != current_auth_state:
        if set_auth_enabled(new_auth_state):
            st.toast(f"Autenticação {'ativada ✅' if new_auth_state else 'desativada'}", icon="🛡️")
            time.sleep(0.8)
            st.rerun()
        else:
            st.error("Erro ao atualizar configuração")

    st.markdown('<hr class="divider">', unsafe_allow_html=True)

    st.markdown(
        '<div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;'
        'letter-spacing:1.5px;color:#475569;margin-bottom:12px;">Alterar senha</div>',
        unsafe_allow_html=True
    )

    with st.form("update_password_form", clear_on_submit=True):
        old_pwd  = st.text_input("Senha atual",   type="password", placeholder="••••••••")
        new_pwd  = st.text_input("Nova senha",    type="password", placeholder="Mínimo 4 caracteres")
        conf_pwd = st.text_input("Confirmar",     type="password", placeholder="Repita a nova senha")

        submit = st.form_submit_button("Atualizar senha", use_container_width=True, type="primary")

        if submit:
            if old_pwd != get_password():
                st.markdown('<div class="status-card error"><span class="status-card-icon">❌</span><div class="status-card-content"><div class="status-card-title">Senha atual incorreta</div></div></div>', unsafe_allow_html=True)
            elif new_pwd != conf_pwd:
                st.markdown('<div class="status-card error"><span class="status-card-icon">❌</span><div class="status-card-content"><div class="status-card-title">As senhas não coincidem</div></div></div>', unsafe_allow_html=True)
            elif len(new_pwd) < 4:
                st.markdown('<div class="status-card warning"><span class="status-card-icon">⚠️</span><div class="status-card-content"><div class="status-card-title">Mínimo 4 caracteres</div></div></div>', unsafe_allow_html=True)
            else:
                if update_password(new_pwd):
                    st.markdown('<div class="status-card success"><span class="status-card-icon">✅</span><div class="status-card-content"><div class="status-card-title">Senha atualizada com sucesso</div></div></div>', unsafe_allow_html=True)
                    time.sleep(1); st.rerun()
                else:
                    st.markdown('<div class="status-card error"><span class="status-card-icon">❌</span><div class="status-card-content"><div class="status-card-title">Erro ao salvar senha</div></div></div>', unsafe_allow_html=True)

"""
2_Finanças.py
=============
Controle financeiro doméstico — visão clara do saldo mensal.
Dados persistidos na aba 'financas_pessoal' do Google Sheets.
Design compacto com cards recolhíveis e efeito neon.
"""

import streamlit as st
from core.auth import require_auth

require_auth()

from datetime import date, datetime
import calendar
from core.ui import render_fab
from core.theme import inject_global_theme, COLORS

st.set_page_config(
    page_title="Finanças Pessoais",
    page_icon="💳",
    layout="wide",
    initial_sidebar_state="collapsed",
)

inject_global_theme()

# ── CONSTANTS ────────────────────────────────────────────────────────────────

SPREADSHEET_NAME = 'gdados'
TAB_NAME         = 'financas_pessoal'
TAB_ASSINATURAS  = 'financas_assinaturas'
TAB_PARCELAMENTOS = 'financas_parcelamentos'

HEADERS              = ['Categoria', 'Nome', 'Valor']
HEADERS_ASSINATURAS  = ['Nome', 'Valor', 'Dia', 'Ativa']
HEADERS_PARCELAMENTOS = ['Nome', 'Valor_Total', 'Parcelas', 'Data_Compra']

DEFAULT_ROWS = [
    ['entrada', 'Salário Lucas', 0],
    ['entrada', 'Benefícios Lucas', 0],
    ['entrada', 'Salário Maria', 0],
    ['entrada', 'Benefícios Maria', 0],
    ['saida', 'Luz', 0],
    ['saida', 'Gás', 0],
    ['saida', 'Condomínio', 0],
    ['saida', 'Aluguel', 0],
    ['cartao', 'XP', 0],
    ['cartao', 'Nubank Lucas', 0],
    ['cartao', 'Nubank Maria', 0],
    ['cartao', 'AMEX', 0],
    ['poupanca', 'Poupança Esperada', 0],
]

# ── DATA LAYER ───────────────────────────────────────────────────────────────

def _get_or_create_ws(tab_name, headers, n_rows=100):
    from core.data.gsheets import get_worksheet, connect_to_gsheets
    ws = get_worksheet(SPREADSHEET_NAME, tab_name)
    if ws:
        return ws
    try:
        client = connect_to_gsheets()
        if not client:
            return None
        sh = client.open(SPREADSHEET_NAME)
        ws = sh.add_worksheet(title=tab_name, rows=n_rows, cols=len(headers))
        ws.update(values=[headers], range_name='A1')
        return ws
    except Exception as e:
        st.error(f"Erro ao criar aba '{tab_name}': {e}")
        return None


def _get_or_create_worksheet():
    from core.data.gsheets import get_worksheet, connect_to_gsheets
    ws = get_worksheet(SPREADSHEET_NAME, TAB_NAME)
    if ws:
        return ws
    try:
        client = connect_to_gsheets()
        if not client:
            return None
        sh = client.open(SPREADSHEET_NAME)
        ws = sh.add_worksheet(title=TAB_NAME, rows=50, cols=3)
        data = [HEADERS] + DEFAULT_ROWS
        ws.update(values=data, range_name='A1')
        return ws
    except Exception as e:
        st.error(f"Erro ao criar aba '{TAB_NAME}': {e}")
        return None


# ── Monthly ──────────────────────────────────────────────────────────────────

@st.cache_data(ttl=300, show_spinner=False)
def load_financas_data() -> list[dict]:
    ws = _get_or_create_worksheet()
    if not ws:
        return []
    try:
        all_vals = ws.get_all_values(value_render_option='UNFORMATTED_VALUE')
        if len(all_vals) < 2:
            return []
        rows = []
        for r in all_vals[1:]:
            if len(r) >= 3:
                val = r[2]
                try:
                    val = float(val) if val != '' and val is not None else 0.0
                except (ValueError, TypeError):
                    val = 0.0
                rows.append({
                    'categoria': str(r[0]).strip().lower(),
                    'nome': str(r[1]).strip(),
                    'valor': val,
                })
        return rows
    except Exception as e:
        st.error(f"Erro ao ler dados: {e}")
        return []


def save_financas_data(rows: list[dict]) -> bool:
    ws = _get_or_create_worksheet()
    if not ws:
        return False
    try:
        data = [HEADERS]
        for r in rows:
            data.append([r['categoria'], r['nome'], r['valor']])
        ws.clear()
        ws.update(values=data, range_name='A1')
        st.cache_data.clear()
        return True
    except Exception as e:
        st.error(f"Erro ao salvar: {e}")
        return False


# ── Assinaturas ──────────────────────────────────────────────────────────────

@st.cache_data(ttl=300, show_spinner=False)
def load_assinaturas() -> list[dict]:
    ws = _get_or_create_ws(TAB_ASSINATURAS, HEADERS_ASSINATURAS)
    if not ws:
        return []
    try:
        all_vals = ws.get_all_values(value_render_option='UNFORMATTED_VALUE')
        if len(all_vals) < 2:
            return []
        rows = []
        for r in all_vals[1:]:
            if len(r) >= 1 and r[0]:
                try:
                    valor = float(r[1]) if len(r) > 1 and r[1] not in ('', None) else 0.0
                except (ValueError, TypeError):
                    valor = 0.0
                try:
                    dia = int(r[2]) if len(r) > 2 and r[2] not in ('', None, '0') else 0
                except (ValueError, TypeError):
                    dia = 0
                ativa_str = str(r[3]).strip().lower() if len(r) > 3 else 'true'
                ativa = ativa_str not in ('false', '0', 'inativo', 'não', 'nao')
                rows.append({'nome': str(r[0]).strip(), 'valor': valor, 'dia': dia, 'ativa': ativa})
        return rows
    except Exception as e:
        st.error(f"Erro ao ler assinaturas: {e}")
        return []


def save_assinaturas(rows: list[dict]) -> bool:
    ws = _get_or_create_ws(TAB_ASSINATURAS, HEADERS_ASSINATURAS)
    if not ws:
        return False
    try:
        data = [HEADERS_ASSINATURAS]
        for r in rows:
            data.append([r['nome'], r['valor'], r.get('dia', 0), str(r.get('ativa', True))])
        ws.clear()
        ws.update(values=data, range_name='A1')
        st.cache_data.clear()
        return True
    except Exception as e:
        st.error(f"Erro ao salvar assinaturas: {e}")
        return False


# ── Parcelamentos ─────────────────────────────────────────────────────────────

@st.cache_data(ttl=300, show_spinner=False)
def load_parcelamentos() -> list[dict]:
    ws = _get_or_create_ws(TAB_PARCELAMENTOS, HEADERS_PARCELAMENTOS)
    if not ws:
        return []
    try:
        all_vals = ws.get_all_values(value_render_option='UNFORMATTED_VALUE')
        if len(all_vals) < 2:
            return []
        rows = []
        for r in all_vals[1:]:
            if len(r) >= 4 and r[0]:
                try:
                    vt = float(r[1]) if r[1] not in ('', None) else 0.0
                except (ValueError, TypeError):
                    vt = 0.0
                try:
                    parc = int(r[2]) if r[2] not in ('', None) else 1
                except (ValueError, TypeError):
                    parc = 1
                rows.append({
                    'nome': str(r[0]).strip(),
                    'valor_total': vt,
                    'parcelas': max(parc, 1),
                    'data_compra': str(r[3]).strip(),
                })
        return rows
    except Exception as e:
        st.error(f"Erro ao ler parcelamentos: {e}")
        return []


def save_parcelamentos(rows: list[dict]) -> bool:
    ws = _get_or_create_ws(TAB_PARCELAMENTOS, HEADERS_PARCELAMENTOS)
    if not ws:
        return False
    try:
        data = [HEADERS_PARCELAMENTOS]
        for r in rows:
            data.append([r['nome'], r['valor_total'], r['parcelas'], r['data_compra']])
        ws.clear()
        ws.update(values=data, range_name='A1')
        st.cache_data.clear()
        return True
    except Exception as e:
        st.error(f"Erro ao salvar parcelamentos: {e}")
        return False


def calc_parcelamento(p: dict) -> dict:
    """Calcula o progresso de um parcelamento com base na data de compra e hoje."""
    today = date.today()
    try:
        dt = datetime.strptime(p['data_compra'], '%d/%m/%Y').date()
    except (ValueError, TypeError):
        dt = today

    months_elapsed = (today.year - dt.year) * 12 + (today.month - dt.month)
    n = max(p['parcelas'], 1)
    # Quitado apenas quando já passou o mês da última parcela (fatura fechada)
    quitado = months_elapsed >= n
    parcela_atual = max(min(months_elapsed + 1, n), 1)
    restantes = max(n - parcela_atual, 0)
    valor_parcela = p['valor_total'] / n
    # Inclui a parcela atual pois ainda está na fatura em aberto
    valor_restante = valor_parcela * (restantes + 1) if not quitado else 0.0

    return {
        **p,
        'parcela_atual': parcela_atual,
        'restantes': restantes,
        'valor_parcela': valor_parcela,
        'valor_restante': valor_restante,
        'quitado': quitado,
    }


# ── HELPERS ──────────────────────────────────────────────────────────────────

def calc_total(rows, cat):
    return sum(r['valor'] for r in rows if r['categoria'] == cat)

def fmt(v: float) -> str:
    neg = v < 0
    v = abs(v)
    int_part = int(v)
    dec_part = int(round((v - int_part) * 100))
    int_str = f"{int_part:,}".replace(",", ".")
    sign = "-" if neg else ""
    return f"{sign}R$ {int_str},{dec_part:02d}"

def pct(part: float, total: float) -> str:
    if total == 0:
        return "–"
    return f"{(part / total) * 100:.0f}%"


# ── CARD BRANDS ──────────────────────────────────────────────────────────────

CARD_BRANDS = {
    'xp': ('#f5a623', 'XP'),
    'nubank': ('#8a05be', 'Nu'),
    'amex': ('#006fcf', 'Amex'),
}

def card_chip(nome):
    key = nome.lower()
    for brand_key, (color, short) in CARD_BRANDS.items():
        if brand_key in key:
            return (f'<span style="display:inline-flex;align-items:center;gap:5px;">'
                    f'<span style="background:{color};color:#fff;padding:1px 7px;'
                    f'border-radius:6px;font-size:0.62rem;font-weight:700;'
                    f'letter-spacing:0.3px;">{short}</span>'
                    f'<span style="color:#94a3b8;font-size:0.72rem;font-weight:500;">{nome}</span>'
                    f'</span>')
    return f'<span class="f-label">{nome}</span>'


# ── BACKGROUND VIDEO ─────────────────────────────────────────────────────────

import base64
from pathlib import Path

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
    font-size: 0.75rem !important;
    border-radius: 10px !important;
    min-height: 32px !important;
}

/* Force saida/ass columns to never wrap */
.saida-row [data-testid="stHorizontalBlock"],
.ass-row [data-testid="stHorizontalBlock"] {
    flex-wrap: nowrap !important;
    gap: 4px !important;
    align-items: center !important;
}
.saida-row [data-testid="stHorizontalBlock"] > [data-testid="stColumn"],
.ass-row [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {
    min-width: 0 !important;
    flex-shrink: 1 !important;
}
.saida-row [data-testid="stHorizontalBlock"] > [data-testid="stColumn"]:last-child,
.ass-row [data-testid="stHorizontalBlock"] > [data-testid="stColumn"]:last-child {
    flex: 0 0 32px !important;
    max-width: 32px !important;
}

@media (max-width: 640px) {
    .saida-row [data-testid="stHorizontalBlock"],
    .ass-row [data-testid="stHorizontalBlock"] {
        flex-wrap: nowrap !important;
    }
    .saida-row [data-testid="stHorizontalBlock"] > [data-testid="stColumn"],
    .ass-row [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {
        width: auto !important;
        min-width: 0 !important;
    }
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
    font-size: 0.88rem !important;
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

/* ── Tabs ── */
.stTabs [data-baseweb="tab-list"] {
    gap: 6px;
    background: rgba(10, 18, 35, 0.5);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 14px;
    padding: 5px;
    margin-bottom: 20px;
    border: 1px solid rgba(99, 102, 241, 0.1);
}
.stTabs [data-baseweb="tab"] {
    border-radius: 10px !important;
    padding: 8px 22px !important;
    font-family: 'Outfit', sans-serif !important;
    font-size: 0.82rem !important;
    font-weight: 600 !important;
    color: #64748b !important;
    background: transparent !important;
    border: none !important;
    transition: all 0.25s ease !important;
}
.stTabs [data-baseweb="tab"][aria-selected="true"] {
    background: rgba(99, 102, 241, 0.15) !important;
    color: #a5b4fc !important;
    box-shadow: 0 0 14px rgba(99, 102, 241, 0.12) !important;
}
.stTabs [data-baseweb="tab-highlight"] { background: transparent !important; }
.stTabs [data-baseweb="tab-border"] { display: none !important; }

/* ── Field labels ── */
.f-label { font-size: 0.72rem; font-weight: 500; color: #64748b; }

/* ── Totals ── */
.tot {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 0 2px; margin-top: 8px;
    border-top: 1px solid rgba(255,255,255,0.04);
}
.tot-label { font-size: 0.7rem; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
.tot-val { font-size: 0.95rem; font-weight: 700; }
.tot-val.g { color: #34d399; }
.tot-val.r { color: #f87171; }
.tot-val.a { color: #fbbf24; }
.tot-val.p { color: #a78bfa; }
.tot-val.c { color: #22d3ee; }

/* ── Dashboard card ── */
.dash {
    background: rgba(10, 18, 35, 0.4);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(99, 102, 241, 0.12);
    border-radius: 18px; padding: 20px 22px;
    margin-bottom: 20px; position: relative; overflow: hidden;
    box-shadow: 0 0 25px rgba(99, 102, 241, 0.06), 0 0 60px rgba(99, 102, 241, 0.03), 0 8px 32px rgba(0,0,0,0.3);
    transition: box-shadow 0.4s ease;
}
.dash:hover { box-shadow: 0 0 30px rgba(99, 102, 241, 0.1), 0 0 80px rgba(99, 102, 241, 0.05), 0 8px 32px rgba(0,0,0,0.3); }
.dash::before {
    content: ''; position: absolute; inset: 0;
    border-radius: 18px; padding: 1px;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, transparent 40%, rgba(99, 102, 241, 0.08) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude;
    pointer-events: none;
}
.dash.pos { border-color: rgba(52,211,153,0.15); }
.dash.neg { border-color: rgba(248,113,113,0.15); }

.dash-grid   { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; text-align: center; margin-bottom: 14px; }
.dash-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; text-align: center; margin-bottom: 14px; }
.dg-item  { padding: 6px 4px; }
.dg-label { font-size: 0.6rem; color: #475569; font-weight: 500; text-transform: uppercase; letter-spacing: 0.3px; }
.dg-val   { font-size: 0.85rem; font-weight: 700; margin-top: 2px; }
.dg-pct   { font-size: 0.6rem; color: #374151; font-weight: 500; margin-top: 1px; }

.saldo-area { text-align: center; padding: 12px 0 6px; border-top: 1px solid rgba(255,255,255,0.04); }
.saldo-lbl  { font-size: 0.6rem; color: #475569; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 600; }
.saldo-val  { font-size: 1.6rem; font-weight: 800; letter-spacing: -1px; margin-top: 2px; }
.saldo-val.g { color: #34d399; text-shadow: 0 0 25px rgba(52,211,153,0.25); }
.saldo-val.r { color: #f87171; text-shadow: 0 0 25px rgba(248,113,113,0.25); }

.poup-bar   { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 8px 0 0; margin-top: 6px; }
.poup-lbl   { font-size: 0.65rem; color: #64748b; }
.poup-tgt   { font-size: 0.8rem; font-weight: 700; color: #a78bfa; }
.poup-badge { font-size: 0.62rem; font-weight: 600; padding: 2px 8px; border-radius: 6px; }
.poup-badge.ok { background: rgba(52,211,153,0.1); color: #34d399; }
.poup-badge.no { background: rgba(248,113,113,0.1); color: #f87171; }
.dash-msg   { text-align: center; font-size: 0.68rem; color: #374151; margin-top: 6px; }

.livre-bar  { display: flex; align-items: center; justify-content: center; gap: 16px; padding: 10px 0 4px; margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.04); }
.livre-item { text-align: center; }
.livre-lbl  { font-size: 0.58rem; color: #475569; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 500; }
.livre-val  { font-size: 0.88rem; font-weight: 700; margin-top: 1px; }
.livre-val.ok { color: #22d3ee; }
.livre-val.no { color: #f87171; }
.livre-sep  { width: 1px; height: 28px; background: rgba(255,255,255,0.06); }

/* ── Parcelamento row ── */
.par-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.03); gap: 10px;
}
.par-nome  { font-size: 0.83rem; font-weight: 600; color: #e2e8f0; flex: 1; min-width: 0; }
.par-info  { text-align: right; flex-shrink: 0; }
.par-prog  { font-size: 0.7rem; font-weight: 600; }
.par-prog.ativa   { color: #fbbf24; }
.par-prog.quitada { color: #34d399; }
.par-sub   { font-size: 0.67rem; color: #94a3b8; margin-top: 2px; }
.par-date  { font-size: 0.63rem; color: #475569; margin-top: 1px; }
.par-badge {
    font-size: 0.6rem; font-weight: 700; padding: 2px 7px;
    border-radius: 5px; text-transform: uppercase; letter-spacing: 0.3px; flex-shrink: 0;
}
.par-badge.ativa   { background: rgba(251,191,36,0.12);  color: #fbbf24; }
.par-badge.quitada { background: rgba(52,211,153,0.12);  color: #34d399; }

/* ── Add-form divider ── */
.add-divider {
    margin: 14px 0 10px;
    border-top: 1px solid rgba(255,255,255,0.05);
    padding-top: 12px;
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

/* ── Mobile ── */
@media (max-width: 768px) {
    .dash-grid   { grid-template-columns: repeat(2, 1fr); }
    .dash-grid-3 { grid-template-columns: repeat(3, 1fr); }
    .saldo-val   { font-size: 1.3rem; }
    .fh-t        { font-size: 1.6rem; }
}
</style>
""", unsafe_allow_html=True)

# ── HEADER ───────────────────────────────────────────────────────────────────

render_fab()

st.markdown("""
<div class="fh">
    <div class="fh-t">Finanças</div>
    <div class="fh-s">Controle mensal simplificado</div>
</div>
""", unsafe_allow_html=True)

# ── LOAD DATA ────────────────────────────────────────────────────────────────

if 'fin_rows' not in st.session_state:
    st.session_state.fin_rows = load_financas_data()
    st.session_state.fin_snapshot = str(st.session_state.fin_rows)

if 'ass_rows' not in st.session_state:
    st.session_state.ass_rows = load_assinaturas()
    st.session_state.ass_snapshot = str(st.session_state.ass_rows)

if 'par_rows' not in st.session_state:
    st.session_state.par_rows = load_parcelamentos()
    st.session_state.par_snapshot = str(st.session_state.par_rows)

rows     = st.session_state.fin_rows
ass_rows = st.session_state.ass_rows
par_rows = st.session_state.par_rows

# Normalize monthly data
if not any(r['categoria'] == 'poupanca' for r in rows):
    rows.append({'categoria': 'poupanca', 'nome': 'Poupança Esperada', 'valor': 0.0})

cartao_rows = [r for r in rows if r['categoria'] == 'cartao']
if len(cartao_rows) == 1 and cartao_rows[0]['nome'] == 'Fatura':
    rows.remove(cartao_rows[0])
    for nome in ['XP', 'Nubank Lucas', 'Nubank Maria', 'AMEX']:
        rows.append({'categoria': 'cartao', 'nome': nome, 'valor': 0.0})
elif not cartao_rows:
    for nome in ['XP', 'Nubank Lucas', 'Nubank Maria', 'AMEX']:
        rows.append({'categoria': 'cartao', 'nome': nome, 'valor': 0.0})

# ── TABS ──────────────────────────────────────────────────────────────────────

tab_mensal, tab_ass, tab_par = st.tabs(["💰  Mensal", "🔄  Assinaturas", "📦  Parcelamentos"])

# ═══════════════════════════════════════════════════════════════════════════════
# TAB 1 — MENSAL
# ═══════════════════════════════════════════════════════════════════════════════

with tab_mensal:
    dash_ph = st.empty()

    entradas_list = [r for r in rows if r['categoria'] == 'entrada']
    saidas_list   = [r for r in rows if r['categoria'] == 'saida']
    cartao_list   = [r for r in rows if r['categoria'] == 'cartao']
    poupanca_list = [r for r in rows if r['categoria'] == 'poupanca']

    # 1️⃣ ENTRADAS
    t_ent = calc_total(rows, 'entrada')
    with st.expander(f"💰  Entradas  ·  {fmt(t_ent)}", expanded=False):
        for i, r in enumerate(entradas_list):
            row_idx = rows.index(r)
            st.markdown(f'<div class="f-label">{r["nome"]}</div>', unsafe_allow_html=True)
            rows[row_idx]['valor'] = st.number_input(
                r["nome"], value=r["valor"], min_value=0.0,
                step=100.0, format="%.2f",
                key=f"e{i}", label_visibility="collapsed"
            )
        t_ent = calc_total(rows, 'entrada')
        st.markdown(f'<div class="tot"><span class="tot-label">Total Entradas</span><span class="tot-val g">{fmt(t_ent)}</span></div>', unsafe_allow_html=True)

    # 2️⃣ CONTAS FIXAS
    t_sai = calc_total(rows, 'saida')
    with st.expander(f"🔥  Contas Fixas  ·  {fmt(t_sai)}", expanded=False):
        to_rm = None
        for i, r in enumerate(saidas_list):
            row_idx = rows.index(r)
            st.markdown('<div class="saida-row">', unsafe_allow_html=True)
            a, b, d = st.columns([5, 4, 1])
            with a:
                rows[row_idx]['nome'] = st.text_input(
                    f"n{i}", value=r['nome'], key=f"sn{i}", label_visibility="collapsed"
                )
            with b:
                rows[row_idx]['valor'] = st.number_input(
                    f"v{i}", value=r['valor'], min_value=0.0, step=50.0, format="%.2f",
                    key=f"sv{i}", label_visibility="collapsed"
                )
            with d:
                if st.button("×", key=f"sr{i}", help="Remover"):
                    to_rm = row_idx
            st.markdown('</div>', unsafe_allow_html=True)

        if to_rm is not None:
            rows.pop(to_rm)
            st.rerun()

        if st.button("＋ Conta", key="ac"):
            rows.append({"categoria": "saida", "nome": "", "valor": 0.0})
            st.rerun()

        t_sai = calc_total(rows, 'saida')
        st.markdown(f'<div class="tot"><span class="tot-label">Total Fixas</span><span class="tot-val r">{fmt(t_sai)}</span></div>', unsafe_allow_html=True)

    # 3️⃣ CARTÕES
    t_car = calc_total(rows, 'cartao')
    with st.expander(f"💳  Cartões  ·  {fmt(t_car)}", expanded=False):
        for i, cr in enumerate(cartao_list):
            ci = rows.index(cr)
            st.markdown(card_chip(cr['nome']), unsafe_allow_html=True)
            rows[ci]['valor'] = st.number_input(
                cr['nome'], value=cr['valor'], min_value=0.0,
                step=100.0, format="%.2f", key=f"cv{i}", label_visibility="collapsed"
            )
        t_car = calc_total(rows, 'cartao')
        st.markdown(f'<div class="tot"><span class="tot-label">Total Cartões</span><span class="tot-val a">{fmt(t_car)}</span></div>', unsafe_allow_html=True)

    # 4️⃣ POUPANÇA
    poupanca_list = [r for r in rows if r['categoria'] == 'poupanca']
    pr = poupanca_list[0] if poupanca_list else None
    if not pr:
        rows.append({"categoria": "poupanca", "nome": "Poupança Esperada", "valor": 0.0})
        pr = rows[-1]

    with st.expander(f"🎯  Poupança  ·  {fmt(pr['valor'])}", expanded=False):
        pi = rows.index(pr)
        st.markdown('<div class="f-label">Meta de poupança mensal</div>', unsafe_allow_html=True)
        rows[pi]['valor'] = st.number_input(
            "Meta", value=pr['valor'], min_value=0.0,
            step=100.0, format="%.2f", key="pv", label_visibility="collapsed"
        )
        meta = rows[pi]['valor']
        st.markdown(f'<div class="tot"><span class="tot-label">Meta Mensal</span><span class="tot-val p">{fmt(meta)}</span></div>', unsafe_allow_html=True)

    meta = pr['valor']

    # ── Dashboard (rendered into placeholder above expanders)
    t_ent = calc_total(rows, 'entrada')
    t_sai = calc_total(rows, 'saida')
    t_car = calc_total(rows, 'cartao')
    saldo = t_ent - t_sai - t_car
    s_cls = "pos" if saldo >= 0 else "neg"
    s_col = "g" if saldo >= 0 else "r"

    if meta > 0 and saldo >= meta:
        badge = '<span class="poup-badge ok">✓ Atingível</span>'
    elif meta > 0:
        badge = '<span class="poup-badge no">✗ Insuficiente</span>'
    else:
        badge = ''

    msg = "Valor disponível para poupança." if saldo >= 0 else "Despesas superam receitas."

    h = f'<div class="dash {s_cls}">'
    h += '<div class="dash-grid">'
    h += f'<div class="dg-item"><div class="dg-label">Entradas</div><div class="dg-val" style="color:#34d399">{fmt(t_ent)}</div><div class="dg-pct">100%</div></div>'
    h += f'<div class="dg-item"><div class="dg-label">Fixas</div><div class="dg-val" style="color:#f87171">{fmt(t_sai)}</div><div class="dg-pct">{pct(t_sai, t_ent)}</div></div>'
    h += f'<div class="dg-item"><div class="dg-label">Cartão</div><div class="dg-val" style="color:#fbbf24">{fmt(t_car)}</div><div class="dg-pct">{pct(t_car, t_ent)}</div></div>'
    h += f'<div class="dg-item"><div class="dg-label">Meta Poup.</div><div class="dg-val" style="color:#a78bfa">{fmt(meta)}</div><div class="dg-pct">{pct(meta, t_ent)}</div></div>'
    h += '</div>'
    h += f'<div class="saldo-area"><div class="saldo-lbl">Saldo · {pct(abs(saldo), t_ent)} da receita</div>'
    h += f'<div class="saldo-val {s_col}">{fmt(saldo)}</div></div>'
    h += f'<div class="poup-bar"><span class="poup-lbl">🎯 Meta:</span><span class="poup-tgt">{fmt(meta)}</span>{badge}</div>'
    h += f'<div class="dash-msg">{msg}</div>'

    livre = saldo - meta
    hoje = date.today()
    dias_mes = calendar.monthrange(hoje.year, hoje.month)[1]
    dias_rest = max(dias_mes - hoje.day, 1)
    media_dia = livre / dias_rest if dias_rest > 0 else 0
    lv_cls = 'ok' if livre >= 0 else 'no'

    h += '<div class="livre-bar">'
    h += f'<div class="livre-item"><div class="livre-lbl">Livre p/ gastar</div><div class="livre-val {lv_cls}">{fmt(livre)}</div></div>'
    h += '<div class="livre-sep"></div>'
    h += f'<div class="livre-item"><div class="livre-lbl">{dias_rest} dias restantes</div><div class="livre-val {lv_cls}">{fmt(media_dia)}/dia</div></div>'
    h += '</div>'
    h += '</div>'

    dash_ph.markdown(h, unsafe_allow_html=True)

# ═══════════════════════════════════════════════════════════════════════════════
# TAB 2 — ASSINATURAS
# ═══════════════════════════════════════════════════════════════════════════════

with tab_ass:
    ass_dash_ph = st.empty()

    # ── Assinaturas Ativas
    ass_ativas_idx  = [i for i, r in enumerate(ass_rows) if r.get('ativa', True)]
    ass_inativas_idx = [i for i, r in enumerate(ass_rows) if not r.get('ativa', True)]
    total_ass_mensal = sum(ass_rows[i]['valor'] for i in ass_ativas_idx)

    with st.expander(f"🔄  Assinaturas Ativas  ·  {fmt(total_ass_mensal)}/mês", expanded=False):
        # Column headers
        if ass_ativas_idx:
            hc1, hc2, hc3, _ = st.columns([5, 3, 2, 1])
            hc1.markdown('<div class="f-label">Nome</div>', unsafe_allow_html=True)
            hc2.markdown('<div class="f-label">Valor/mês</div>', unsafe_allow_html=True)
            hc3.markdown('<div class="f-label">Dia venc.</div>', unsafe_allow_html=True)

        to_rm_ass = None
        for ii, idx in enumerate(ass_ativas_idx):
            r = ass_rows[idx]
            st.markdown('<div class="ass-row">', unsafe_allow_html=True)
            a, b, c, d = st.columns([5, 3, 2, 1])
            with a:
                ass_rows[idx]['nome'] = st.text_input(
                    f"an{ii}", value=r['nome'], key=f"assn{ii}",
                    label_visibility="collapsed", placeholder="Nome da assinatura"
                )
            with b:
                ass_rows[idx]['valor'] = st.number_input(
                    f"av{ii}", value=float(r['valor']), min_value=0.0, step=10.0, format="%.2f",
                    key=f"assv{ii}", label_visibility="collapsed"
                )
            with c:
                ass_rows[idx]['dia'] = st.number_input(
                    f"ad{ii}", value=int(r.get('dia', 0) or 0),
                    min_value=0, max_value=31, step=1,
                    key=f"assd{ii}", label_visibility="collapsed", help="0 = sem data fixa"
                )
            with d:
                if st.button("×", key=f"asr{ii}", help="Remover"):
                    to_rm_ass = idx
            st.markdown('</div>', unsafe_allow_html=True)

        if to_rm_ass is not None:
            ass_rows.pop(to_rm_ass)
            st.rerun()

        if st.button("＋ Assinatura", key="add_ass"):
            ass_rows.append({'nome': '', 'valor': 0.0, 'dia': 0, 'ativa': True})
            st.rerun()

        total_ass_mensal = sum(ass_rows[i]['valor'] for i in range(len(ass_rows)) if ass_rows[i].get('ativa', True))
        st.markdown(f'<div class="tot"><span class="tot-label">Total Mensal</span><span class="tot-val c">{fmt(total_ass_mensal)}</span></div>', unsafe_allow_html=True)

    # ── Assinaturas Inativas
    if ass_inativas_idx:
        with st.expander(f"⏸️  Inativas  ·  {len(ass_inativas_idx)}", expanded=False):
            to_rm_inativa = None
            for ii, idx in enumerate(ass_inativas_idx):
                r = ass_rows[idx]
                st.markdown('<div class="ass-row">', unsafe_allow_html=True)
                a, b, c = st.columns([5, 3, 1])
                with a:
                    ass_rows[idx]['nome'] = st.text_input(
                        f"ian{ii}", value=r['nome'], key=f"iassn{ii}", label_visibility="collapsed"
                    )
                with b:
                    ass_rows[idx]['valor'] = st.number_input(
                        f"iav{ii}", value=float(r['valor']), min_value=0.0, step=10.0, format="%.2f",
                        key=f"iassv{ii}", label_visibility="collapsed"
                    )
                with c:
                    if st.button("×", key=f"iasr{ii}", help="Remover"):
                        to_rm_inativa = idx
                st.markdown('</div>', unsafe_allow_html=True)

            if to_rm_inativa is not None:
                ass_rows.pop(to_rm_inativa)
                st.rerun()

    # ── Dashboard Assinaturas
    n_ativas_ass  = sum(1 for r in ass_rows if r.get('ativa', True))
    n_total_ass   = len(ass_rows)
    total_mensal_ass = sum(r['valor'] for r in ass_rows if r.get('ativa', True))
    total_anual_ass  = total_mensal_ass * 12

    h_ass  = '<div class="dash">'
    h_ass += '<div class="dash-grid-3">'
    h_ass += f'<div class="dg-item"><div class="dg-label">Ativas</div><div class="dg-val" style="color:#22d3ee">{n_ativas_ass}</div><div class="dg-pct">de {n_total_ass}</div></div>'
    h_ass += f'<div class="dg-item"><div class="dg-label">Mensal</div><div class="dg-val" style="color:#f87171">{fmt(total_mensal_ass)}</div><div class="dg-pct">/mês</div></div>'
    h_ass += f'<div class="dg-item"><div class="dg-label">Anual</div><div class="dg-val" style="color:#fbbf24">{fmt(total_anual_ass)}</div><div class="dg-pct">/ano</div></div>'
    h_ass += '</div>'
    h_ass += '<div class="saldo-area"><div class="saldo-lbl">Gasto anual em assinaturas</div>'
    h_ass += f'<div class="saldo-val r">{fmt(total_anual_ass)}</div></div>'
    h_ass += '</div>'

    ass_dash_ph.markdown(h_ass, unsafe_allow_html=True)

# ═══════════════════════════════════════════════════════════════════════════════
# TAB 3 — PARCELAMENTOS
# ═══════════════════════════════════════════════════════════════════════════════

with tab_par:
    par_dash_ph = st.empty()

    # Compute all parcelamentos
    par_calc = [calc_parcelamento(p) for p in par_rows]

    ativos_idx   = [i for i, p in enumerate(par_calc) if not p['quitado']]
    quitados_idx = [i for i, p in enumerate(par_calc) if p['quitado']]

    total_mensal_par  = sum(par_calc[i]['valor_parcela'] for i in ativos_idx)
    total_restante_par = sum(par_calc[i]['valor_restante'] for i in ativos_idx)

    # ── Parcelamentos Ativos
    with st.expander(f"📦  Parcelas Ativas  ·  {fmt(total_mensal_par)}/mês", expanded=False):
        to_rm_par = None

        for orig_idx in ativos_idx:
            p = par_calc[orig_idx]
            prog_txt = f"parcela {p['parcela_atual']}/{p['parcelas']}"
            rest_txt = f"faltam {p['restantes']}" if p['restantes'] > 0 else "na fatura"

            st.markdown(f"""
            <div class="par-row">
                <div class="par-nome">{p['nome']}</div>
                <div class="par-info">
                    <div class="par-prog ativa">{prog_txt} · {rest_txt}</div>
                    <div class="par-sub">{fmt(p['valor_parcela'])}/mês · restante {fmt(p['valor_restante'])}</div>
                    <div class="par-date">compra em {p['data_compra']}</div>
                </div>
                <span class="par-badge ativa">ativa</span>
            </div>
            """, unsafe_allow_html=True)

            if st.button("×", key=f"prm_{orig_idx}", help=f"Remover {p['nome']}"):
                to_rm_par = orig_idx

        if to_rm_par is not None:
            par_rows.pop(to_rm_par)
            st.rerun()

        # ── Add new parcelamento form
        st.markdown('<div class="add-divider"><div class="f-label" style="margin-bottom:8px;">➕ Novo parcelamento</div></div>', unsafe_allow_html=True)
        pc1, pc2, pc3, pc4 = st.columns([4, 3, 2, 2])
        with pc1:
            st.markdown('<div class="f-label">Nome da compra</div>', unsafe_allow_html=True)
            new_nome = st.text_input("Nome", key="par_nome_new", label_visibility="collapsed", placeholder="Ex: iPhone, TV...")
        with pc2:
            st.markdown('<div class="f-label">Data da compra</div>', unsafe_allow_html=True)
            new_data = st.date_input("Data", value=date.today(), key="par_data_new",
                                     label_visibility="collapsed", format="DD/MM/YYYY")
        with pc3:
            st.markdown('<div class="f-label">Valor total (R$)</div>', unsafe_allow_html=True)
            new_total = st.number_input("Total", value=0.0, min_value=0.0, step=100.0,
                                        format="%.2f", key="par_total_new", label_visibility="collapsed")
        with pc4:
            st.markdown('<div class="f-label">Nº de parcelas</div>', unsafe_allow_html=True)
            new_parc = st.number_input("Parcelas", value=2, min_value=1, max_value=60, step=1,
                                       key="par_parc_new", label_visibility="collapsed")

        if st.button("Adicionar parcelamento", key="par_add_btn"):
            if new_nome and new_total > 0:
                par_rows.append({
                    'nome': new_nome,
                    'valor_total': float(new_total),
                    'parcelas': int(new_parc),
                    'data_compra': new_data.strftime('%d/%m/%Y'),
                })
                st.rerun()
            else:
                st.warning("Preencha o nome e o valor total.", icon="⚠️")

        # Recompute total after edits
        par_calc_now = [calc_parcelamento(p) for p in par_rows]
        total_mensal_par = sum(c['valor_parcela'] for c in par_calc_now if not c['quitado'])
        st.markdown(f'<div class="tot"><span class="tot-label">Total Mensal em Parcelas</span><span class="tot-val a">{fmt(total_mensal_par)}</span></div>', unsafe_allow_html=True)

    # ── Parcelamentos Quitados
    if quitados_idx:
        with st.expander(f"✅  Quitados  ·  {len(quitados_idx)}", expanded=False):
            to_rm_quit = None
            for orig_idx in quitados_idx:
                p = par_calc[orig_idx]
                st.markdown(f"""
                <div class="par-row">
                    <div class="par-nome" style="color:#475569;">{p['nome']}</div>
                    <div class="par-info">
                        <div class="par-prog quitada">{p['parcelas']}/{p['parcelas']} · pago</div>
                        <div class="par-sub" style="color:#374151;">total {fmt(p['valor_total'])}</div>
                        <div class="par-date">compra em {p['data_compra']}</div>
                    </div>
                    <span class="par-badge quitada">quitado</span>
                </div>
                """, unsafe_allow_html=True)
                if st.button("×", key=f"pqrm_{orig_idx}", help="Remover do histórico"):
                    to_rm_quit = orig_idx

            if to_rm_quit is not None:
                par_rows.pop(to_rm_quit)
                st.rerun()

    # ── Dashboard Parcelamentos
    par_calc_fresh = [calc_parcelamento(p) for p in par_rows]
    n_ativos_par   = sum(1 for c in par_calc_fresh if not c['quitado'])
    n_quit_par     = sum(1 for c in par_calc_fresh if c['quitado'])
    total_mensal_par   = sum(c['valor_parcela']  for c in par_calc_fresh if not c['quitado'])
    total_restante_par = sum(c['valor_restante'] for c in par_calc_fresh if not c['quitado'])

    h_par  = '<div class="dash">'
    h_par += '<div class="dash-grid-3">'
    h_par += f'<div class="dg-item"><div class="dg-label">Ativas</div><div class="dg-val" style="color:#fbbf24">{n_ativos_par}</div><div class="dg-pct">{n_quit_par} quitadas</div></div>'
    h_par += f'<div class="dg-item"><div class="dg-label">Mensal</div><div class="dg-val" style="color:#f87171">{fmt(total_mensal_par)}</div><div class="dg-pct">/mês</div></div>'
    h_par += f'<div class="dg-item"><div class="dg-label">A pagar</div><div class="dg-val" style="color:#fb923c">{fmt(total_restante_par)}</div><div class="dg-pct">total restante</div></div>'
    h_par += '</div>'
    h_par += '<div class="saldo-area"><div class="saldo-lbl">Total comprometido em parcelas</div>'
    h_par += f'<div class="saldo-val r">{fmt(total_restante_par)}</div></div>'
    h_par += '</div>'

    par_dash_ph.markdown(h_par, unsafe_allow_html=True)

# ── AUTO-SAVE (only if data changed) ─────────────────────────────────────────

current_fin = str(rows)
if st.session_state.get('fin_snapshot') != current_fin:
    if save_financas_data(rows):
        st.session_state.fin_snapshot = current_fin
        st.toast("Mensal salvo ✅", icon="✅")

current_ass = str(ass_rows)
if st.session_state.get('ass_snapshot') != current_ass:
    if save_assinaturas(ass_rows):
        st.session_state.ass_snapshot = current_ass
        st.toast("Assinaturas salvas ✅", icon="✅")

current_par = str(par_rows)
if st.session_state.get('par_snapshot') != current_par:
    if save_parcelamentos(par_rows):
        st.session_state.par_snapshot = current_par
        st.toast("Parcelamentos salvos ✅", icon="✅")

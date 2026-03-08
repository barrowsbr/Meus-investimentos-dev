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

/* ── Item card (compact read-only display) ── */
.ic {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 2px; border-bottom: 1px solid rgba(255,255,255,0.03); gap: 8px;
}
.ic:last-of-type { border-bottom: none; }
.ic-left  { flex: 1; min-width: 0; }
.ic-name  { font-size: 0.82rem; font-weight: 500; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ic-meta  { font-size: 0.62rem; color: #64748b; margin-top: 1px; }
.ic-val   { font-size: 0.85rem; font-weight: 700; white-space: nowrap; flex-shrink: 0; }

/* ── Tiny action buttons — × e ✎ em 2 micro-colunas lado a lado ── */
[data-testid="stHorizontalBlock"]:has(.par-row) {
    flex-wrap: nowrap !important;
    align-items: flex-start !important;
    gap: 2px !important;
}
[data-testid="stHorizontalBlock"]:has(.par-row) > [data-testid="stColumn"] {
    min-width: 0 !important;
}
/* Últimas 2 colunas = micro-colunas de ação */
[data-testid="stHorizontalBlock"]:has(.par-row) > [data-testid="stColumn"]:nth-last-child(-n+2) {
    flex: 0 0 20px !important;
    max-width: 20px !important;
    min-width: 0 !important;
    padding: 0 !important;
}
/* Base dos botões de ação: invisíveis e minúsculos */
[data-testid="stHorizontalBlock"]:has(.par-row) > [data-testid="stColumn"]:nth-last-child(-n+2) .stButton > button {
    width: 18px !important; height: 18px !important; min-height: 0 !important;
    max-height: 18px !important; padding: 0 !important; margin: 0 !important;
    font-size: 0.62rem !important; line-height: 1 !important;
    background: transparent !important; border: none !important; box-shadow: none !important;
    color: #2d3748 !important; border-radius: 3px !important;
    display: flex !important; align-items: center !important; justify-content: center !important;
}
/* × delete — fica na 2ª coluna a partir do fim */
[data-testid="stHorizontalBlock"]:has(.par-row) > [data-testid="stColumn"]:nth-last-child(2) .stButton > button:hover {
    color: #f87171 !important;
    background: rgba(248,113,113,0.10) !important;
}
/* ✎ edit — fica na última coluna */
[data-testid="stHorizontalBlock"]:has(.par-row) > [data-testid="stColumn"]:last-child .stButton > button:hover {
    color: #a5b4fc !important;
    background: rgba(99,102,241,0.10) !important;
}

/* ── Add-form divider ── */
.add-divider {
    margin: 14px 0 10px;
    border-top: 1px solid rgba(255,255,255,0.05);
    padding-top: 12px;
}

/* ── Tabela de projeção ── */
.par-table {
    width: 100%;
    border-collapse: collapse;
    font-family: 'Outfit', sans-serif;
    font-size: 0.75rem;
}
.par-table th {
    padding: 6px 10px;
    text-align: right;
    font-size: 0.62rem;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    white-space: nowrap;
}
.par-table th:first-child { text-align: left; }
.par-table td {
    padding: 6px 10px;
    text-align: right;
    color: #94a3b8;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    white-space: nowrap;
}
.par-table td:first-child { text-align: left; color: #64748b; }
.par-table tr:last-child td { border-bottom: none; }
.par-table tr:hover td { background: rgba(255,255,255,0.02); }

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

if 'par_edit_idx' not in st.session_state:
    st.session_state.par_edit_idx = None
if 'ent_edit_idx' not in st.session_state:
    st.session_state.ent_edit_idx = None
if 'sai_edit_idx' not in st.session_state:
    st.session_state.sai_edit_idx = None
if 'car_edit_idx' not in st.session_state:
    st.session_state.car_edit_idx = None
if 'ass_edit_idx' not in st.session_state:
    st.session_state.ass_edit_idx = None

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
        to_rm_ent = None
        for i, r in enumerate(entradas_list):
            row_idx = rows.index(r)
            if st.session_state.ent_edit_idx == row_idx:
                st.markdown(f'<div class="add-divider"><div class="f-label" style="margin-bottom:6px;">✏️ Editando: <strong style="color:#e2e8f0;">{r["nome"]}</strong></div></div>', unsafe_allow_html=True)
                ee1, ee2 = st.columns([5, 4])
                with ee1:
                    st.markdown('<div class="f-label">Nome</div>', unsafe_allow_html=True)
                    new_en = st.text_input("Nome", value=r['nome'], key=f"een{i}", label_visibility="collapsed")
                with ee2:
                    st.markdown('<div class="f-label">Valor (R$)</div>', unsafe_allow_html=True)
                    new_ev = st.number_input("Valor", value=r['valor'], min_value=0.0, step=100.0, format="%.2f", key=f"eev{i}", label_visibility="collapsed")
                ec1, ec2 = st.columns(2)
                with ec1:
                    if st.button("✓ Salvar", key=f"eesv{i}"):
                        rows[row_idx]['nome'] = new_en
                        rows[row_idx]['valor'] = float(new_ev)
                        st.session_state.ent_edit_idx = None
                        st.rerun()
                with ec2:
                    if st.button("✕ Cancelar", key=f"eeca{i}"):
                        st.session_state.ent_edit_idx = None
                        st.rerun()
            else:
                ci, cdel, cedit = st.columns([20, 1, 1])
                with ci:
                    st.markdown(f'''<div class="par-row">
                        <div class="par-nome">{r["nome"]}</div>
                        <div class="par-info">
                            <div class="par-prog ativa" style="color:#34d399;">{fmt(r["valor"])}</div>
                            <div class="par-sub">entrada mensal</div>
                        </div>
                        <span class="par-badge ativa" style="background:rgba(52,211,153,0.10);color:#34d399;">receita</span>
                    </div>''', unsafe_allow_html=True)
                with cdel:
                    if st.button("×", key=f"erm{i}", help="Remover"):
                        to_rm_ent = row_idx
                with cedit:
                    if st.button("✎", key=f"eed{i}", help="Editar"):
                        st.session_state.ent_edit_idx = row_idx
                        st.rerun()

        if to_rm_ent is not None:
            rows.pop(to_rm_ent)
            st.rerun()

        st.markdown('<div class="add-divider"><div class="f-label" style="margin-bottom:8px;">➕ Nova entrada</div></div>', unsafe_allow_html=True)
        enf1, enf2 = st.columns([5, 4])
        with enf1:
            st.markdown('<div class="f-label">Nome</div>', unsafe_allow_html=True)
            new_ent_nome = st.text_input("Nome entrada", key="new_ent_nome", label_visibility="collapsed", placeholder="Ex: Freelance, Renda extra...")
        with enf2:
            st.markdown('<div class="f-label">Valor (R$)</div>', unsafe_allow_html=True)
            new_ent_val = st.number_input("Valor entrada", value=0.0, min_value=0.0, step=100.0, format="%.2f", key="new_ent_val", label_visibility="collapsed")
        if st.button("Adicionar entrada", key="ent_add_btn"):
            if new_ent_nome:
                rows.append({"categoria": "entrada", "nome": new_ent_nome, "valor": float(new_ent_val)})
                st.rerun()
            else:
                st.warning("Preencha o nome da entrada.", icon="⚠️")

        t_ent = calc_total(rows, 'entrada')
        st.markdown(f'<div class="tot"><span class="tot-label">Total Entradas</span><span class="tot-val g">{fmt(t_ent)}</span></div>', unsafe_allow_html=True)

    # 2️⃣ CONTAS FIXAS
    t_sai = calc_total(rows, 'saida')
    with st.expander(f"🔥  Contas Fixas  ·  {fmt(t_sai)}", expanded=False):
        to_rm = None
        for i, r in enumerate(saidas_list):
            row_idx = rows.index(r)
            if st.session_state.sai_edit_idx == row_idx:
                st.markdown(f'<div class="add-divider"><div class="f-label" style="margin-bottom:6px;">✏️ Editando: <strong style="color:#e2e8f0;">{r["nome"]}</strong></div></div>', unsafe_allow_html=True)
                se1, se2 = st.columns([5, 4])
                with se1:
                    st.markdown('<div class="f-label">Nome</div>', unsafe_allow_html=True)
                    new_sn = st.text_input("Nome", value=r['nome'], key=f"sen{i}", label_visibility="collapsed")
                with se2:
                    st.markdown('<div class="f-label">Valor (R$)</div>', unsafe_allow_html=True)
                    new_sv = st.number_input("Valor", value=r['valor'], min_value=0.0, step=50.0, format="%.2f", key=f"sev{i}", label_visibility="collapsed")
                sc1, sc2 = st.columns(2)
                with sc1:
                    if st.button("✓ Salvar", key=f"sesv{i}"):
                        rows[row_idx]['nome'] = new_sn
                        rows[row_idx]['valor'] = float(new_sv)
                        st.session_state.sai_edit_idx = None
                        st.rerun()
                with sc2:
                    if st.button("✕ Cancelar", key=f"seca{i}"):
                        st.session_state.sai_edit_idx = None
                        st.rerun()
            else:
                si, sdel, sedit = st.columns([20, 1, 1])
                with si:
                    st.markdown(f'''<div class="par-row">
                        <div class="par-nome">{r["nome"]}</div>
                        <div class="par-info">
                            <div class="par-prog ativa" style="color:#f87171;">{fmt(r["valor"])}</div>
                            <div class="par-sub">conta fixa</div>
                        </div>
                        <span class="par-badge" style="background:rgba(248,113,113,0.10);color:#f87171;">fixo</span>
                    </div>''', unsafe_allow_html=True)
                with sdel:
                    if st.button("×", key=f"sr{i}", help="Remover"):
                        to_rm = row_idx
                with sedit:
                    if st.button("✎", key=f"sed{i}", help="Editar"):
                        st.session_state.sai_edit_idx = row_idx
                        st.rerun()

        if to_rm is not None:
            rows.pop(to_rm)
            st.rerun()

        st.markdown('<div class="add-divider"><div class="f-label" style="margin-bottom:8px;">➕ Nova conta fixa</div></div>', unsafe_allow_html=True)
        sf1, sf2 = st.columns([5, 4])
        with sf1:
            st.markdown('<div class="f-label">Nome</div>', unsafe_allow_html=True)
            new_sai_nome = st.text_input("Nome conta", key="new_sai_nome", label_visibility="collapsed", placeholder="Ex: Internet, Água...")
        with sf2:
            st.markdown('<div class="f-label">Valor (R$)</div>', unsafe_allow_html=True)
            new_sai_val = st.number_input("Valor conta", value=0.0, min_value=0.0, step=50.0, format="%.2f", key="new_sai_val", label_visibility="collapsed")
        if st.button("Adicionar conta", key="sai_add_btn"):
            if new_sai_nome:
                rows.append({"categoria": "saida", "nome": new_sai_nome, "valor": float(new_sai_val)})
                st.rerun()
            else:
                st.warning("Preencha o nome da conta.", icon="⚠️")

        t_sai = calc_total(rows, 'saida')
        st.markdown(f'<div class="tot"><span class="tot-label">Total Fixas</span><span class="tot-val r">{fmt(t_sai)}</span></div>', unsafe_allow_html=True)

    # 3️⃣ CARTÕES
    t_car = calc_total(rows, 'cartao')
    with st.expander(f"💳  Cartões  ·  {fmt(t_car)}", expanded=False):
        to_rm_car = None
        for i, cr in enumerate(cartao_list):
            ci_idx = rows.index(cr)
            if st.session_state.car_edit_idx == ci_idx:
                st.markdown(f'<div class="add-divider"><div class="f-label" style="margin-bottom:6px;">✏️ Editando: <strong style="color:#e2e8f0;">{cr["nome"]}</strong></div></div>', unsafe_allow_html=True)
                ce1, ce2 = st.columns([5, 4])
                with ce1:
                    st.markdown('<div class="f-label">Nome do cartão</div>', unsafe_allow_html=True)
                    new_cn = st.text_input("Nome", value=cr['nome'], key=f"cen{i}", label_visibility="collapsed")
                with ce2:
                    st.markdown('<div class="f-label">Fatura (R$)</div>', unsafe_allow_html=True)
                    new_cv = st.number_input("Fatura", value=cr['valor'], min_value=0.0, step=100.0, format="%.2f", key=f"cev{i}", label_visibility="collapsed")
                cc1, cc2 = st.columns(2)
                with cc1:
                    if st.button("✓ Salvar", key=f"cesv{i}"):
                        rows[ci_idx]['nome'] = new_cn
                        rows[ci_idx]['valor'] = float(new_cv)
                        st.session_state.car_edit_idx = None
                        st.rerun()
                with cc2:
                    if st.button("✕ Cancelar", key=f"ceca{i}"):
                        st.session_state.car_edit_idx = None
                        st.rerun()
            else:
                col_ci, col_cdel, col_cedit = st.columns([20, 1, 1])
                with col_ci:
                    st.markdown(f'''<div class="par-row">
                        <div class="par-nome">{card_chip(cr["nome"])}</div>
                        <div class="par-info">
                            <div class="par-prog ativa" style="color:#fbbf24;">{fmt(cr["valor"])}</div>
                            <div class="par-sub">fatura mensal</div>
                        </div>
                        <span class="par-badge" style="background:rgba(251,191,36,0.10);color:#fbbf24;">cartão</span>
                    </div>''', unsafe_allow_html=True)
                with col_cdel:
                    if st.button("×", key=f"crm{i}", help="Remover cartão"):
                        to_rm_car = ci_idx
                with col_cedit:
                    if st.button("✎", key=f"ced{i}", help="Editar"):
                        st.session_state.car_edit_idx = ci_idx
                        st.rerun()

        if to_rm_car is not None:
            rows.pop(to_rm_car)
            st.rerun()

        st.markdown('<div class="add-divider"><div class="f-label" style="margin-bottom:8px;">➕ Novo cartão</div></div>', unsafe_allow_html=True)
        crf1, crf2 = st.columns([5, 4])
        with crf1:
            st.markdown('<div class="f-label">Nome do cartão</div>', unsafe_allow_html=True)
            new_car_nome = st.text_input("Nome cartão", key="new_car_nome", label_visibility="collapsed", placeholder="Ex: C6, Bradesco...")
        with crf2:
            st.markdown('<div class="f-label">Fatura (R$)</div>', unsafe_allow_html=True)
            new_car_val = st.number_input("Fatura", value=0.0, min_value=0.0, step=100.0, format="%.2f", key="new_car_val", label_visibility="collapsed")
        if st.button("Adicionar cartão", key="car_add_btn"):
            if new_car_nome:
                rows.append({"categoria": "cartao", "nome": new_car_nome, "valor": float(new_car_val)})
                st.rerun()
            else:
                st.warning("Preencha o nome do cartão.", icon="⚠️")

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
        to_rm_ass = None
        for ii, idx in enumerate(ass_ativas_idx):
            r = ass_rows[idx]
            if st.session_state.ass_edit_idx == idx:
                st.markdown(f'<div class="add-divider"><div class="f-label" style="margin-bottom:6px;">✏️ Editando: <strong style="color:#e2e8f0;">{r["nome"]}</strong></div></div>', unsafe_allow_html=True)
                ae1, ae2, ae3 = st.columns([5, 3, 2])
                with ae1:
                    st.markdown('<div class="f-label">Nome</div>', unsafe_allow_html=True)
                    new_an = st.text_input("Nome", value=r['nome'], key=f"aen{ii}", label_visibility="collapsed")
                with ae2:
                    st.markdown('<div class="f-label">Valor/mês (R$)</div>', unsafe_allow_html=True)
                    new_av = st.number_input("Valor", value=float(r['valor']), min_value=0.0, step=10.0, format="%.2f", key=f"aev{ii}", label_visibility="collapsed")
                with ae3:
                    st.markdown('<div class="f-label">Dia venc.</div>', unsafe_allow_html=True)
                    new_ad = st.number_input("Dia", value=int(r.get('dia', 0) or 0), min_value=0, max_value=31, step=1, key=f"aed{ii}", label_visibility="collapsed")
                ac1, ac2 = st.columns(2)
                with ac1:
                    if st.button("✓ Salvar", key=f"aesv{ii}"):
                        ass_rows[idx]['nome'] = new_an
                        ass_rows[idx]['valor'] = float(new_av)
                        ass_rows[idx]['dia'] = int(new_ad)
                        st.session_state.ass_edit_idx = None
                        st.rerun()
                with ac2:
                    if st.button("✕ Cancelar", key=f"aeca{ii}"):
                        st.session_state.ass_edit_idx = None
                        st.rerun()
            else:
                dia_str = f" · vence dia {r['dia']}" if r.get('dia', 0) else ""
                col_ai, col_adel, col_aedit = st.columns([20, 1, 1])
                with col_ai:
                    st.markdown(f'''<div class="par-row">
                        <div class="par-nome">{r["nome"]}</div>
                        <div class="par-info">
                            <div class="par-prog ativa" style="color:#22d3ee;">{fmt(r["valor"])}/mês</div>
                            <div class="par-sub">assinatura{dia_str}</div>
                        </div>
                        <span class="par-badge ativa" style="background:rgba(34,211,238,0.10);color:#22d3ee;">ativa</span>
                    </div>''', unsafe_allow_html=True)
                with col_adel:
                    if st.button("×", key=f"asr{ii}", help="Remover"):
                        to_rm_ass = idx
                with col_aedit:
                    if st.button("✎", key=f"aed_btn{ii}", help="Editar"):
                        st.session_state.ass_edit_idx = idx
                        st.rerun()

        if to_rm_ass is not None:
            ass_rows.pop(to_rm_ass)
            st.rerun()

        st.markdown('<div class="add-divider"><div class="f-label" style="margin-bottom:8px;">➕ Nova assinatura</div></div>', unsafe_allow_html=True)
        asf1, asf2, asf3 = st.columns([5, 3, 2])
        with asf1:
            st.markdown('<div class="f-label">Nome</div>', unsafe_allow_html=True)
            new_ass_nome = st.text_input("Nome ass", key="new_ass_nome", label_visibility="collapsed", placeholder="Ex: Netflix, Spotify...")
        with asf2:
            st.markdown('<div class="f-label">Valor/mês (R$)</div>', unsafe_allow_html=True)
            new_ass_val = st.number_input("Valor ass", value=0.0, min_value=0.0, step=10.0, format="%.2f", key="new_ass_val", label_visibility="collapsed")
        with asf3:
            st.markdown('<div class="f-label">Dia venc.</div>', unsafe_allow_html=True)
            new_ass_dia = st.number_input("Dia ass", value=0, min_value=0, max_value=31, step=1, key="new_ass_dia", label_visibility="collapsed")
        if st.button("Adicionar assinatura", key="ass_add_btn"):
            if new_ass_nome:
                ass_rows.append({'nome': new_ass_nome, 'valor': float(new_ass_val), 'dia': int(new_ass_dia), 'ativa': True})
                st.rerun()
            else:
                st.warning("Preencha o nome da assinatura.", icon="⚠️")

        total_ass_mensal = sum(ass_rows[i]['valor'] for i in range(len(ass_rows)) if ass_rows[i].get('ativa', True))
        st.markdown(f'<div class="tot"><span class="tot-label">Total Mensal</span><span class="tot-val c">{fmt(total_ass_mensal)}</span></div>', unsafe_allow_html=True)

    # ── Assinaturas Inativas
    if ass_inativas_idx:
        with st.expander(f"⏸️  Inativas  ·  {len(ass_inativas_idx)}", expanded=False):
            to_rm_inativa = None
            for ii, idx in enumerate(ass_inativas_idx):
                r = ass_rows[idx]
                col_iai, col_idel, _ = st.columns([20, 1, 1])
                with col_iai:
                    st.markdown(f'''<div class="par-row">
                        <div class="par-nome" style="color:#374151;">{r["nome"]}</div>
                        <div class="par-info">
                            <div class="par-prog" style="color:#374151;">{fmt(r["valor"])}/mês</div>
                            <div class="par-sub">pausada</div>
                        </div>
                        <span class="par-badge" style="background:rgba(71,85,105,0.10);color:#475569;">inativa</span>
                    </div>''', unsafe_allow_html=True)
                with col_idel:
                    if st.button("×", key=f"iasr{ii}", help="Remover"):
                        to_rm_inativa = idx

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

            if st.session_state.par_edit_idx == orig_idx:
                # ── inline edit form
                st.markdown(f'<div class="add-divider"><div class="f-label" style="margin-bottom:8px;">✏️ Editando: <strong style="color:#e2e8f0;">{p["nome"]}</strong></div></div>', unsafe_allow_html=True)
                ec1, ec2, ec3, ec4 = st.columns([4, 3, 2, 2])
                with ec1:
                    st.markdown('<div class="f-label">Nome da compra</div>', unsafe_allow_html=True)
                    edit_nome = st.text_input("Nome", value=p['nome'], key=f"en_{orig_idx}", label_visibility="collapsed")
                with ec2:
                    st.markdown('<div class="f-label">Data da compra</div>', unsafe_allow_html=True)
                    try:
                        edit_dt_val = datetime.strptime(p['data_compra'], '%d/%m/%Y').date()
                    except Exception:
                        edit_dt_val = date.today()
                    edit_data = st.date_input("Data", value=edit_dt_val, key=f"ed_{orig_idx}", label_visibility="collapsed", format="DD/MM/YYYY")
                with ec3:
                    st.markdown('<div class="f-label">Valor total (R$)</div>', unsafe_allow_html=True)
                    edit_total = st.number_input("Total", value=float(p['valor_total']), min_value=0.0, step=100.0, format="%.2f", key=f"et_{orig_idx}", label_visibility="collapsed")
                with ec4:
                    st.markdown('<div class="f-label">Nº parcelas</div>', unsafe_allow_html=True)
                    edit_parc = st.number_input("Parcelas", value=int(p['parcelas']), min_value=1, max_value=60, step=1, key=f"ep_{orig_idx}", label_visibility="collapsed")
                sv_col, ca_col = st.columns(2)
                with sv_col:
                    if st.button("✓ Salvar", key=f"esv_{orig_idx}"):
                        par_rows[orig_idx]['nome'] = edit_nome
                        par_rows[orig_idx]['valor_total'] = float(edit_total)
                        par_rows[orig_idx]['parcelas'] = int(edit_parc)
                        par_rows[orig_idx]['data_compra'] = edit_data.strftime('%d/%m/%Y')
                        st.session_state.par_edit_idx = None
                        st.rerun()
                with ca_col:
                    if st.button("✕ Cancelar", key=f"eca_{orig_idx}"):
                        st.session_state.par_edit_idx = None
                        st.rerun()
            else:
                prog_txt = f"parcela {p['parcela_atual']}/{p['parcelas']}"
                rest_txt = f"faltam {p['restantes']}" if p['restantes'] > 0 else "na fatura"
                col_pcard, col_pdel, col_pedit = st.columns([20, 1, 1])
                with col_pcard:
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
                with col_pdel:
                    if st.button("×", key=f"prm_{orig_idx}", help=f"Remover {p['nome']}"):
                        to_rm_par = orig_idx
                with col_pedit:
                    if st.button("✎", key=f"ped_{orig_idx}", help=f"Editar {p['nome']}"):
                        st.session_state.par_edit_idx = orig_idx
                        st.rerun()

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

    # ── Projeção mês a mês
    par_ativos_calc = [par_calc[i] for i in ativos_idx]
    if par_ativos_calc:
        import plotly.graph_objects as go

        MESES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
        CHART_COLORS = ['#6366f1','#f87171','#fbbf24','#34d399','#22d3ee','#a78bfa','#fb923c','#f472b6','#64748b']

        def _month_lbl(d):
            return f"{MESES_PT[d.month - 1]}/{str(d.year)[2:]}"

        def _add_months(d, n):
            m = d.month + n
            return date(d.year + (m - 1) // 12, (m - 1) % 12 + 1, 1)

        today_d  = date.today()
        cur_month = date(today_d.year, today_d.month, 1)

        # Último mês com alguma parcela ativa
        end_months = []
        for p in par_ativos_calc:
            try:
                dt = datetime.strptime(p['data_compra'], '%d/%m/%Y').date()
            except Exception:
                dt = today_d
            end_months.append(_add_months(date(dt.year, dt.month, 1), p['parcelas'] - 1))
        end_month = max(end_months)

        # Lista de meses da timeline
        month_list = []
        m = cur_month
        while m <= end_month:
            month_list.append(m)
            m = _add_months(m, 1)

        labels = [_month_lbl(m) for m in month_list]

        # Valor por parcela por mês
        inst_data = {}
        for p in par_ativos_calc:
            try:
                dt = datetime.strptime(p['data_compra'], '%d/%m/%Y').date()
            except Exception:
                dt = today_d
            start = date(dt.year, dt.month, 1)
            vals = []
            for m in month_list:
                ms = (m.year - start.year) * 12 + (m.month - start.month)
                vals.append(p['valor_parcela'] if 1 <= ms + 1 <= p['parcelas'] else 0.0)
            # Nomes únicos
            key = p['nome']
            suf = 1
            while key in inst_data:
                key = f"{p['nome']} ({suf})"
                suf += 1
            inst_data[key] = vals

        totals = [sum(inst_data[k][i] for k in inst_data) for i in range(len(month_list))]
        end_lbl = _month_lbl(end_month)

        with st.expander(f"📊  Projeção de Dívida  ·  até {end_lbl}", expanded=False):
            # ── Gráfico
            fig = go.Figure()
            for ci, (nome, vals) in enumerate(inst_data.items()):
                fig.add_trace(go.Bar(
                    name=nome, x=labels, y=vals,
                    marker_color=CHART_COLORS[ci % len(CHART_COLORS)],
                    marker_line_width=0,
                    hovertemplate=f'<b>{nome}</b><br>%{{x}}<br>R$ %{{y:,.2f}}<extra></extra>',
                ))
            fig.update_layout(
                barmode='stack',
                paper_bgcolor='rgba(0,0,0,0)',
                plot_bgcolor='rgba(0,0,0,0)',
                margin=dict(l=0, r=0, t=6, b=0),
                height=200,
                font=dict(family='Outfit', color='#94a3b8', size=11),
                legend=dict(
                    orientation='h', yanchor='bottom', y=1.02, xanchor='left', x=0,
                    font=dict(size=10, color='#94a3b8'), bgcolor='rgba(0,0,0,0)', borderwidth=0,
                ),
                xaxis=dict(showgrid=False, showline=False, tickfont=dict(size=10, color='#64748b'), tickangle=-30),
                yaxis=dict(
                    showgrid=True, gridcolor='rgba(255,255,255,0.04)', gridwidth=1,
                    showline=False, zeroline=False,
                    tickfont=dict(size=10, color='#64748b'), tickprefix='R$ ', tickformat=',.0f',
                ),
                hoverlabel=dict(
                    bgcolor='rgba(15,23,42,0.95)',
                    bordercolor='rgba(99,102,241,0.3)',
                    font=dict(family='Outfit', size=12, color='#e2e8f0'),
                ),
            )
            st.plotly_chart(fig, use_container_width=True, config={'displayModeBar': False})

            # ── Tabela
            names = list(inst_data.keys())
            thead = '<tr><th>Mês</th>' + ''.join(f'<th>{n}</th>' for n in names) + '<th>Total</th></tr>'
            tbody = ''
            for i, m in enumerate(month_list):
                is_cur = (m == cur_month)
                row_bg = ' style="background:rgba(99,102,241,0.07);"' if is_cur else ''
                lbl = _month_lbl(m)
                mes_cell = f'<td><span style="color:#a5b4fc;font-weight:700;">{lbl} ◀</span></td>' if is_cur else f'<td>{lbl}</td>'
                cells = ''
                for name in names:
                    v = inst_data[name][i]
                    cells += f'<td style="color:#fbbf24;">{fmt(v)}</td>' if v > 0 else '<td style="color:#374151;">–</td>'
                tbody += f'<tr{row_bg}>{mes_cell}{cells}<td style="color:#f87171;font-weight:700;">{fmt(totals[i])}</td></tr>'

            st.markdown(f"""
            <div style="overflow-x:auto;margin-top:4px;">
              <table class="par-table">
                <thead>{thead}</thead>
                <tbody>{tbody}</tbody>
              </table>
            </div>
            """, unsafe_allow_html=True)

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

"""
2_Finanças.py
=============
Controle financeiro doméstico — visão clara do saldo mensal.
Dados persistidos na aba 'financas_pessoal' do Google Sheets.
Design system clonado de Home.py (glassmorphism, Outfit, gradients).
"""

import streamlit as st
from core.auth import require_auth

require_auth()

from core.ui import render_fab
from core.theme import inject_global_theme, render_page_header, render_back_button, COLORS

st.set_page_config(
    page_title="Finanças Pessoais",
    page_icon="💳",
    layout="wide",
    initial_sidebar_state="collapsed",
)

inject_global_theme()

# ── CONSTANTS ────────────────────────────────────────────────────────────────

SPREADSHEET_NAME = 'gdados'
TAB_NAME = 'financas_pessoal'
HEADERS = ['Categoria', 'Nome', 'Valor']

# Default rows if the tab is newly created
DEFAULT_ROWS = [
    ['entrada', 'Salário Lucas', 0],
    ['entrada', 'Benefícios Lucas', 0],
    ['entrada', 'Salário Maria', 0],
    ['entrada', 'Benefícios Maria', 0],
    ['saida', 'Luz', 0],
    ['saida', 'Gás', 0],
    ['saida', 'Condomínio', 0],
    ['saida', 'Aluguel', 0],
    ['cartao', 'Fatura', 0],
]

# ── DATA LAYER ───────────────────────────────────────────────────────────────

def _get_or_create_worksheet():
    """Get the financas_pessoal worksheet, creating it with defaults if needed."""
    from core.data.gsheets import get_worksheet, connect_to_gsheets
    
    ws = get_worksheet(SPREADSHEET_NAME, TAB_NAME)
    if ws:
        return ws
    
    # Tab doesn't exist — create it
    try:
        client = connect_to_gsheets()
        if not client:
            return None
        sh = client.open(SPREADSHEET_NAME)
        ws = sh.add_worksheet(title=TAB_NAME, rows=50, cols=3)
        # Write headers + defaults
        data = [HEADERS] + DEFAULT_ROWS
        ws.update(values=data, range_name='A1')
        return ws
    except Exception as e:
        st.error(f"Erro ao criar aba '{TAB_NAME}': {e}")
        return None


@st.cache_data(ttl=300, show_spinner=False)
def load_financas_data() -> list[dict]:
    """Load all rows from financas_pessoal as list of dicts."""
    ws = _get_or_create_worksheet()
    if not ws:
        return []
    
    try:
        all_vals = ws.get_all_values(value_render_option='UNFORMATTED_VALUE')
        if len(all_vals) < 2:
            return []
        headers = all_vals[0]
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
    """Overwrite the entire sheet with updated rows."""
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


# ── HELPERS ──────────────────────────────────────────────────────────────────

def calcular_total_entradas(rows: list[dict]) -> float:
    return sum(r['valor'] for r in rows if r['categoria'] == 'entrada')

def calcular_total_saidas(rows: list[dict]) -> float:
    return sum(r['valor'] for r in rows if r['categoria'] == 'saida')

def calcular_total_cartao(rows: list[dict]) -> float:
    return sum(r['valor'] for r in rows if r['categoria'] == 'cartao')

def calcular_saldo(entradas: float, saidas: float, cartao: float) -> float:
    return entradas - saidas - cartao

def fmt_brl(v: float) -> str:
    neg = v < 0
    v = abs(v)
    int_part = int(v)
    dec_part = int(round((v - int_part) * 100))
    int_str = f"{int_part:,}".replace(",", ".")
    sign = "-" if neg else ""
    return f"{sign}R$ {int_str},{dec_part:02d}"


# ── PAGE CSS (Cloned from Home.py tokens) ────────────────────────────────────

st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap');

html, body, [class*="css"] { font-family: 'Outfit', sans-serif; }

.stApp {
    background: linear-gradient(-45deg, #0e1217, #171c26, #0f1724, #000000);
    background-size: 400% 400%;
    animation: gradient 15s ease infinite;
}
@keyframes gradient {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}

section[data-testid="stSidebar"],
[data-testid="collapsedControl"] { display: none !important; }

/* ── Finance Cards ── */
.fin-card {
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 20px;
    padding: 24px 28px 16px;
    margin-bottom: 8px;
    position: relative;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
.fin-card::before {
    content: '';
    position: absolute; inset: 0;
    border-radius: 20px; padding: 1px;
    background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.08) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude;
    pointer-events: none;
}
.fin-card:hover { transform: translateY(-3px); box-shadow: 0 15px 50px rgba(0,0,0,0.4); }

.fin-card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.fin-card-icon { font-size: 1.2rem; opacity: 0.8; }
.fin-card-title { font-size: 1.15rem; font-weight: 700; color: #f1f5f9; letter-spacing: -0.3px; }

.fin-total-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 0 0; margin-top: 14px;
    border-top: 1px solid rgba(255,255,255,0.06);
}
.fin-total-label { font-size: 0.82rem; font-weight: 600; color: #94a3b8; letter-spacing: 0.5px; text-transform: uppercase; }
.fin-total-value { font-size: 1.2rem; font-weight: 800; letter-spacing: -0.5px; }
.fin-total-value.green { color: #34d399; }
.fin-total-value.red { color: #f87171; }
.fin-total-value.amber { color: #fbbf24; }

.fin-field-label { font-size: 0.78rem; font-weight: 500; color: #94a3b8; margin-bottom: 2px; }

/* ── Result Card ── */
.fin-result-card {
    background: rgba(15, 23, 42, 0.7);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 24px; padding: 30px 32px;
    margin-top: 10px; position: relative; overflow: hidden;
    box-shadow: 0 15px 50px rgba(0,0,0,0.4);
}
.fin-result-card::before {
    content: ''; position: absolute; inset: 0;
    border-radius: 24px; padding: 1.5px;
    background: linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.12) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude;
    pointer-events: none;
}
.fin-result-card.positive { border-color: rgba(52, 211, 153, 0.2); }
.fin-result-card.negative { border-color: rgba(248, 113, 113, 0.2); }

.fin-result-title { font-size: 0.8rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 16px; }
.fin-result-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: center; margin-bottom: 20px; }
.fin-result-item-label { font-size: 0.7rem; color: #64748b; font-weight: 500; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px; }
.fin-result-item-value { font-size: 1rem; font-weight: 700; }

.fin-saldo-big { text-align: center; padding: 20px 0 8px; border-top: 1px solid rgba(255,255,255,0.06); }
.fin-saldo-label { font-size: 0.72rem; color: #64748b; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600; margin-bottom: 6px; }
.fin-saldo-value { font-size: 2rem; font-weight: 800; letter-spacing: -1px; }
.fin-saldo-value.green { color: #34d399; text-shadow: 0 0 30px rgba(52,211,153,0.3); }
.fin-saldo-value.red { color: #f87171; text-shadow: 0 0 30px rgba(248,113,113,0.3); }
.fin-saldo-msg { text-align: center; font-size: 0.78rem; color: #64748b; font-weight: 400; margin-top: 8px; padding: 0 20px; }

/* ── Hero ── */
.fin-hero { text-align: center; padding: 20px 0 30px; animation: fadeIn 0.8s ease-out; }
.fin-hero-title {
    font-size: 2.4rem; font-weight: 800;
    background: linear-gradient(to right, #ffffff, #a5b4fc);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    margin-bottom: 0; letter-spacing: -1.5px;
}
.fin-hero-subtitle { color: #64748b; font-size: 0.95rem; font-weight: 300; margin-top: 4px; }
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(-15px); }
    to { opacity: 1; transform: translateY(0); }
}

/* Save button area */
.fin-save-area { text-align: center; margin: 20px 0; }

/* Mobile */
@media (max-width: 768px) {
    .fin-card { padding: 18px 20px 12px; }
    .fin-result-grid { grid-template-columns: 1fr; gap: 8px; }
    .fin-saldo-value { font-size: 1.6rem; }
    .fin-hero-title { font-size: 1.8rem; }
}
</style>
""", unsafe_allow_html=True)

# ── HEADER ───────────────────────────────────────────────────────────────────

render_fab()

if st.button("← Voltar para Home", type="secondary"):
    st.switch_page("Home.py")

st.markdown("""
<div class="fin-hero">
    <div class="fin-hero-title">Finanças</div>
    <div class="fin-hero-subtitle">Controle mensal simplificado</div>
</div>
""", unsafe_allow_html=True)

# ── LOAD DATA ────────────────────────────────────────────────────────────────

if 'fin_rows' not in st.session_state:
    st.session_state.fin_rows = load_financas_data()

rows = st.session_state.fin_rows

# Split by category
entradas = [r for r in rows if r['categoria'] == 'entrada']
saidas   = [r for r in rows if r['categoria'] == 'saida']
cartao   = [r for r in rows if r['categoria'] == 'cartao']

# ── LAYOUT ───────────────────────────────────────────────────────────────────

col_left, col_right = st.columns(2, gap="medium")

# ═══════════════════════════════════════════════════════════════════════════════
# 1️⃣ ENTRADAS
# ═══════════════════════════════════════════════════════════════════════════════

with col_left:
    st.markdown("""
    <div class="fin-card">
        <div class="fin-card-header">
            <span class="fin-card-icon">💰</span>
            <span class="fin-card-title">Entradas</span>
        </div>
    </div>
    """, unsafe_allow_html=True)

    for i, r in enumerate(entradas):
        st.markdown(f'<div class="fin-field-label">{r["nome"]}</div>', unsafe_allow_html=True)
        # Find the index in the full rows list
        row_idx = rows.index(r)
        rows[row_idx]['valor'] = st.number_input(
            r["nome"], value=r["valor"], min_value=0.0,
            step=100.0, format="%.2f",
            key=f"fin_ent_{i}", label_visibility="collapsed"
        )

    total_entradas = calcular_total_entradas(rows)

    st.markdown(f"""
    <div class="fin-total-row">
        <span class="fin-total-label">Total de Entradas</span>
        <span class="fin-total-value green">{fmt_brl(total_entradas)}</span>
    </div>
    """, unsafe_allow_html=True)

# ═══════════════════════════════════════════════════════════════════════════════
# 2️⃣ SAÍDAS (Contas Fixas)
# ═══════════════════════════════════════════════════════════════════════════════

with col_right:
    st.markdown("""
    <div class="fin-card">
        <div class="fin-card-header">
            <span class="fin-card-icon">🔥</span>
            <span class="fin-card-title">Contas Fixas</span>
        </div>
    </div>
    """, unsafe_allow_html=True)

    to_remove = None
    for i, r in enumerate(saidas):
        row_idx = rows.index(r)
        c1, c2, c3 = st.columns([3, 3, 1])
        with c1:
            rows[row_idx]['nome'] = st.text_input(
                f"Nome {i}", value=r['nome'],
                key=f"fin_saida_nome_{i}", label_visibility="collapsed"
            )
        with c2:
            rows[row_idx]['valor'] = st.number_input(
                f"Valor {i}", value=r['valor'], min_value=0.0,
                step=50.0, format="%.2f",
                key=f"fin_saida_val_{i}", label_visibility="collapsed"
            )
        with c3:
            if st.button("✕", key=f"fin_saida_rm_{i}", help="Remover"):
                to_remove = row_idx

    if to_remove is not None:
        rows.pop(to_remove)
        st.rerun()

    if st.button("＋ Adicionar conta", key="fin_add_conta"):
        rows.append({"categoria": "saida", "nome": "", "valor": 0.0})
        st.rerun()

    total_saidas = calcular_total_saidas(rows)

    st.markdown(f"""
    <div class="fin-total-row">
        <span class="fin-total-label">Total Contas Fixas</span>
        <span class="fin-total-value red">{fmt_brl(total_saidas)}</span>
    </div>
    """, unsafe_allow_html=True)

# ═══════════════════════════════════════════════════════════════════════════════
# 3️⃣ CARTÃO DE CRÉDITO
# ═══════════════════════════════════════════════════════════════════════════════

st.markdown("""
<div class="fin-card" style="max-width:680px;margin:6px auto 8px;">
    <div class="fin-card-header">
        <span class="fin-card-icon">💳</span>
        <span class="fin-card-title">Cartão de Crédito</span>
    </div>
</div>
""", unsafe_allow_html=True)

c_left, c_right = st.columns([2, 1])
with c_left:
    if not cartao:
        rows.append({"categoria": "cartao", "nome": "Fatura", "valor": 0.0})
        cartao = [rows[-1]]
    
    cartao_idx = rows.index(cartao[0])
    st.markdown('<div class="fin-field-label">Fatura atual</div>', unsafe_allow_html=True)
    rows[cartao_idx]['valor'] = st.number_input(
        "Fatura Cartão", value=cartao[0]['valor'], min_value=0.0,
        step=100.0, format="%.2f", key="fin_cartao_val", label_visibility="collapsed"
    )
with c_right:
    total_cartao = calcular_total_cartao(rows)
    st.markdown(f"""
    <div style="padding-top:22px;">
        <div class="fin-total-row" style="border-top:none;margin-top:0;padding-top:0;">
            <span class="fin-total-label">Total Cartão</span>
            <span class="fin-total-value amber">{fmt_brl(total_cartao)}</span>
        </div>
    </div>
    """, unsafe_allow_html=True)

# ═══════════════════════════════════════════════════════════════════════════════
# 💾 SALVAR
# ═══════════════════════════════════════════════════════════════════════════════

st.markdown("<br>", unsafe_allow_html=True)
save_col1, save_col2, save_col3 = st.columns([2, 1, 2])
with save_col2:
    if st.button("💾 Salvar Tudo", type="primary", use_container_width=True):
        if save_financas_data(rows):
            st.toast("✅ Dados salvos na planilha!", icon="💾")
            st.session_state.pop('fin_rows', None)
            st.rerun()
        else:
            st.error("Falha ao salvar.")

# ═══════════════════════════════════════════════════════════════════════════════
# 4️⃣ RESULTADO FINAL
# ═══════════════════════════════════════════════════════════════════════════════

total_cartao = calcular_total_cartao(rows)
saldo = calcular_saldo(total_entradas, total_saidas, total_cartao)
saldo_cls = "positive" if saldo >= 0 else "negative"
saldo_color = "green" if saldo >= 0 else "red"

msg = ("Esse é o valor disponível para poupança no mês."
       if saldo >= 0
       else "Atenção: suas despesas superam as receitas neste mês.")

st.markdown(f"""
<div class="fin-result-card {saldo_cls}">
    <div class="fin-result-title">⚖️ Resultado Mensal</div>
    <div class="fin-result-grid">
        <div>
            <div class="fin-result-item-label">Entradas</div>
            <div class="fin-result-item-value" style="color:#34d399">{fmt_brl(total_entradas)}</div>
        </div>
        <div>
            <div class="fin-result-item-label">Contas Fixas</div>
            <div class="fin-result-item-value" style="color:#f87171">{fmt_brl(total_saidas)}</div>
        </div>
        <div>
            <div class="fin-result-item-label">Cartão</div>
            <div class="fin-result-item-value" style="color:#fbbf24">{fmt_brl(total_cartao)}</div>
        </div>
    </div>
    <div class="fin-saldo-big">
        <div class="fin-saldo-label">Saldo Final</div>
        <div class="fin-saldo-value {saldo_color}">{fmt_brl(saldo)}</div>
    </div>
    <div class="fin-saldo-msg">{msg}</div>
</div>
""", unsafe_allow_html=True)

# ── Rodapé ───────────────────────────────────────────────────────────────────
st.markdown("""
<div style="text-align:center;padding:32px 0 16px;color:#1e293b;font-size:0.72rem;letter-spacing:1px;">
    Finanças Pessoais · Dados persistidos em Google Sheets
</div>
""", unsafe_allow_html=True)

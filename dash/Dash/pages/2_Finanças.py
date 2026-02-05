import streamlit as st
from core.auth import require_auth

# --- AUTH CHECK ---
require_auth()

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, date
from core.data.provider import DataProvider
from core.utils import parse_decimal_br

# --- CONFIG ---
st.set_page_config(
    page_title="Finanças Pessoais",
    page_icon="💳",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- CSS OTIMIZADO COM EFEITOS ---
st.markdown("""
<style>
    :root {
        --bg-dark: #0a0f1a;
        --bg-card: rgba(30, 41, 59, 0.85);
        --border: rgba(99, 102, 241, 0.25);
        --primary: #6366f1;
        --success: #10b981;
        --danger: #ef4444;
        --warning: #f59e0b;
        --text-main: #f1f5f9;
        --text-muted: #64748b;
    }
    
    .stApp {
        background: linear-gradient(180deg, #0a0f1a 0%, #1a1033 50%, #0a0f1a 100%);
    }
    
    /* ===== HERO ===== */
    .hero {
        text-align: center;
        padding: 30px 20px 40px;
        position: relative;
    }
    
    .hero-icon {
        font-size: 4rem;
        margin-bottom: 10px;
        display: inline-block;
    }
    
    .hero-title {
        font-size: 2.5rem;
        font-weight: 800;
        color: #fff;
        margin: 0;
        background: linear-gradient(135deg, #fff 0%, #a78bfa 50%, #6366f1 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }
    
    .hero-sub {
        color: var(--text-muted);
        font-size: 1rem;
        margin-top: 8px;
    }
    
    /* ===== KPI CARDS ===== */
    .kpi-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
        margin: 0 auto 30px;
        max-width: 900px;
        padding: 0 12px;
    }
    
    @media (min-width: 768px) {
        .kpi-grid { grid-template-columns: repeat(4, 1fr); gap: 16px; }
    }
    
    .kpi {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 18px;
        position: relative;
        overflow: hidden;
        transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .kpi:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }
    
    .kpi::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 3px;
        background: var(--accent);
    }
    
    .kpi.green { --accent: var(--success); }
    .kpi.red { --accent: var(--danger); }
    .kpi.blue { --accent: var(--primary); }
    .kpi.yellow { --accent: var(--warning); }
    
    .kpi-icon { font-size: 1.5rem; margin-bottom: 8px; }
    .kpi-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi-value { font-size: 1.5rem; font-weight: 700; color: var(--text-main); margin-top: 4px; }
    .kpi.green .kpi-value { color: var(--success); }
    .kpi.red .kpi-value { color: var(--danger); }
    
    /* ===== BANK CARDS COM FLIP ===== */
    .card-container {
        perspective: 1000px;
        min-height: 180px;
    }
    
    .card-inner {
        position: relative;
        width: 100%;
        height: 180px;
        transition: transform 0.6s;
        transform-style: preserve-3d;
        cursor: pointer;
    }
    
    .card-container:hover .card-inner {
        transform: rotateY(180deg);
    }
    
    .card-front, .card-back {
        position: absolute;
        width: 100%;
        height: 100%;
        backface-visibility: hidden;
        border-radius: 16px;
        padding: 20px;
        box-sizing: border-box;
    }
    
    .card-front {
        background: linear-gradient(135deg, #1e293b 0%, #312e81 100%);
        border: 1px solid var(--border);
    }
    
    .card-back {
        background: linear-gradient(135deg, #312e81 0%, #1e293b 100%);
        border: 1px solid var(--border);
        transform: rotateY(180deg);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
    }
    
    .card-back-icon { font-size: 2.5rem; margin-bottom: 10px; }
    .card-back-label { font-size: 0.8rem; color: var(--text-muted); }
    .card-back-value { font-size: 1.3rem; font-weight: 700; color: var(--text-main); margin-top: 5px; }
    
    .card-chip {
        width: 40px; height: 28px;
        background: linear-gradient(135deg, #fbbf24 0%, #d97706 100%);
        border-radius: 6px;
        margin-bottom: 15px;
    }
    
    .card-logo { font-size: 1.5rem; position: absolute; top: 20px; right: 20px; }
    .card-name { font-size: 1rem; font-weight: 600; color: #fff; margin-bottom: 4px; }
    .card-type { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
    .card-balance { font-size: 1.5rem; font-weight: 700; }
    .card-balance.pos { color: var(--success); }
    .card-balance.neg { color: var(--danger); }
    .card-trans { font-size: 0.75rem; color: var(--text-muted); margin-top: 8px; }
    
    /* ===== SECTION ===== */
    .section { margin: 30px 12px 20px; }
    .section-title {
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--text-main);
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 15px;
    }
    
    /* ===== PROGRESS BAR ===== */
    .progress-container {
        background: rgba(30, 41, 59, 0.6);
        border-radius: 12px;
        padding: 16px;
        margin: 0 12px 20px;
    }
    
    .progress-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 10px;
        font-size: 0.85rem;
        color: var(--text-muted);
    }
    
    .progress-bar {
        height: 10px;
        background: rgba(255,255,255,0.1);
        border-radius: 10px;
        overflow: hidden;
    }
    
    .progress-fill {
        height: 100%;
        border-radius: 10px;
        transition: width 0.5s ease;
    }
    
    .progress-fill.danger { background: linear-gradient(90deg, var(--danger) 0%, #f87171 100%); }
    .progress-fill.warning { background: linear-gradient(90deg, var(--warning) 0%, #fcd34d 100%); }
    .progress-fill.success { background: linear-gradient(90deg, var(--success) 0%, #34d399 100%); }
    
    /* ===== TRANSACTION LIST ===== */
    .tx-list { padding: 0 12px; }
    
    .tx-item {
        background: var(--bg-card);
        border-radius: 12px;
        padding: 14px 16px;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 14px;
        transition: background 0.2s;
    }
    
    .tx-item:hover { background: rgba(30, 41, 59, 0.95); }
    
    .tx-icon {
        width: 42px; height: 42px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.3rem;
        flex-shrink: 0;
    }
    
    .tx-icon.expense { background: rgba(239, 68, 68, 0.15); }
    .tx-icon.income { background: rgba(16, 185, 129, 0.15); }
    
    .tx-info { flex: 1; min-width: 0; }
    .tx-desc { font-weight: 500; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tx-meta { font-size: 0.75rem; color: var(--text-muted); margin-top: 3px; }
    
    .tx-amount { font-weight: 600; text-align: right; }
    .tx-amount.expense { color: var(--danger); }
    .tx-amount.income { color: var(--success); }
    
    .tx-status {
        font-size: 0.65rem;
        padding: 3px 8px;
        border-radius: 20px;
        text-transform: uppercase;
        font-weight: 500;
    }
    
    .tx-status.pendente { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
    .tx-status.pago { background: rgba(16, 185, 129, 0.15); color: var(--success); }
    
    /* ===== INSIGHTS ===== */
    .insight-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
        padding: 0 12px;
        margin-bottom: 20px;
    }
    
    @media (min-width: 768px) {
        .insight-grid { grid-template-columns: repeat(3, 1fr); }
    }
    
    .insight-card {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 16px;
        text-align: center;
    }
    
    .insight-icon { font-size: 2rem; margin-bottom: 8px; }
    .insight-value { font-size: 1.5rem; font-weight: 700; color: var(--text-main); }
    .insight-label { font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; }
    
    /* ===== STREAMLIT OVERRIDES ===== */
    .stTabs [data-baseweb="tab-list"] { background: transparent; gap: 8px; }
    .stTabs [data-baseweb="tab"] {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 10px;
        color: var(--text-muted);
    }
    .stTabs [aria-selected="true"] {
        background: rgba(99, 102, 241, 0.2);
        border-color: var(--primary);
        color: #fff;
    }
    
    #MainMenu, footer, header { visibility: hidden; }
    .js-plotly-plot .plotly .bg { fill: transparent !important; }
</style>
""", unsafe_allow_html=True)

# --- HELPERS ---
def fmt(v):
    return f"R$ {v:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')

def parse_valor(x):
    if pd.isna(x) or x is None: return 0.0
    if isinstance(x, (int, float)): return float(x)
    try:
        v = parse_decimal_br(x)
        return float(v) if v else 0.0
    except:
        try:
            return float(str(x).replace('R$','').replace(' ','').replace('.','').replace(',','.'))
        except:
            return 0.0

def parse_data(v):
    if pd.isna(v) or v is None: return pd.NaT
    if isinstance(v, (int, float)):
        try: return pd.Timestamp('1899-12-30') + pd.Timedelta(days=int(v))
        except: return pd.NaT
    try: return pd.to_datetime(v, dayfirst=True, errors='coerce')
    except: return pd.NaT

CAT_ICONS = {
    'alimentação': '🍔', 'alimentacao': '🍔', 'transporte': '🚗', 'lazer': '🎮',
    'saúde': '💊', 'saude': '💊', 'educação': '📚', 'educacao': '📚',
    'moradia': '🏠', 'salário': '💰', 'salario': '💰', 'investimento': '📈',
    'compras': '🛒', 'assinaturas': '📺', 'viagem': '✈️', 'pet': '🐕',
}

# --- LOAD DATA ---
@st.cache_data(ttl=300)
def load():
    df = DataProvider.get_financas()
    if df.empty: return pd.DataFrame()
    df.columns = df.columns.str.strip().str.lower()
    if 'data' in df.columns: df['data'] = df['data'].apply(parse_data)
    if 'valor' in df.columns: df['valor'] = df['valor'].apply(parse_valor)
    return df

# --- HEADER ---
st.markdown('''
<div class="hero">
    <div class="hero-icon">💳</div>
    <h1 class="hero-title">Finanças Pessoais</h1>
    <p class="hero-sub">Controle inteligente do seu dinheiro</p>
</div>
''', unsafe_allow_html=True)

# --- LOAD ---
df = load()

if df.empty:
    st.warning("📋 Nenhum dado encontrado. Crie a aba 'financas' no Google Sheets.")
    st.stop()

# --- PROCESS ---
today = date.today()
df_mes = df[(df['data'].dt.month == today.month) & (df['data'].dt.year == today.year)].copy()

gastos = df_mes[df_mes['valor'] > 0]['valor'].sum() if not df_mes.empty else 0
receitas = abs(df_mes[df_mes['valor'] < 0]['valor'].sum()) if not df_mes.empty else 0
saldo = receitas - gastos
media_dia = gastos / today.day if today.day > 0 else 0

# Stats
num_transacoes = len(df_mes)
maior_gasto = df_mes[df_mes['valor'] > 0]['valor'].max() if not df_mes.empty else 0
cat_top = df_mes[df_mes['valor'] > 0].groupby('categoria')['valor'].sum().idxmax() if 'categoria' in df_mes.columns and not df_mes[df_mes['valor'] > 0].empty else "N/A"

# --- KPI CARDS ---
kpis_html = '<div class="kpi-grid">'
kpis_html += f'''
<div class="kpi green">
    <div class="kpi-icon">💰</div>
    <div class="kpi-label">Receitas</div>
    <div class="kpi-value">{fmt(receitas)}</div>
</div>
'''
kpis_html += f'''
<div class="kpi red">
    <div class="kpi-icon">🔥</div>
    <div class="kpi-label">Gastos</div>
    <div class="kpi-value">{fmt(gastos)}</div>
</div>
'''
cor_saldo = "green" if saldo >= 0 else "red"
kpis_html += f'''
<div class="kpi {cor_saldo}">
    <div class="kpi-icon">⚖️</div>
    <div class="kpi-label">Saldo</div>
    <div class="kpi-value">{fmt(saldo)}</div>
</div>
'''
kpis_html += f'''
<div class="kpi blue">
    <div class="kpi-icon">📊</div>
    <div class="kpi-label">Média/Dia</div>
    <div class="kpi-value">{fmt(media_dia)}</div>
</div>
'''
kpis_html += '</div>'
st.markdown(kpis_html, unsafe_allow_html=True)

# --- BUDGET PROGRESS ---
budget = receitas if receitas > 0 else 10000  # fallback
pct = min((gastos / budget) * 100, 100) if budget > 0 else 0
pct_class = "success" if pct < 70 else ("warning" if pct < 90 else "danger")

st.markdown(f'''
<div class="progress-container">
    <div class="progress-header">
        <span>Orçamento do mês</span>
        <span>{pct:.0f}% utilizado</span>
    </div>
    <div class="progress-bar">
        <div class="progress-fill {pct_class}" style="width: {pct}%;"></div>
    </div>
</div>
''', unsafe_allow_html=True)

# --- BANK CARDS ---
st.markdown('<div class="section"><div class="section-title">🏦 Minhas Contas</div></div>', unsafe_allow_html=True)

contas = df['conta'].unique().tolist() if 'conta' in df.columns else []
tipos = df.groupby('conta')['tipo_conta'].first().to_dict() if 'tipo_conta' in df.columns else {}

if contas:
    cols = st.columns(min(len(contas), 4))
    for i, conta in enumerate(contas[:4]):
        tipo = tipos.get(conta, '')
        saldo_c = df[df['conta'] == conta]['valor'].sum() * -1
        trans_mes = len(df_mes[df_mes['conta'] == conta]) if 'conta' in df_mes.columns else 0
        icon = "💳" if 'cart' in str(tipo).lower() else "🏦"
        cor = "pos" if saldo_c >= 0 else "neg"
        tipo_label = "Cartão" if 'cart' in str(tipo).lower() else "Conta"
        
        with cols[i % 4]:
            st.markdown(f'''
            <div class="card-container">
                <div class="card-inner">
                    <div class="card-front">
                        <div class="card-chip"></div>
                        <div class="card-logo">{icon}</div>
                        <div class="card-name">{conta}</div>
                        <div class="card-type">{tipo_label}</div>
                        <div class="card-balance {cor}">{fmt(abs(saldo_c))}</div>
                    </div>
                    <div class="card-back">
                        <div class="card-back-icon">{icon}</div>
                        <div class="card-back-label">Transações este mês</div>
                        <div class="card-back-value">{trans_mes}</div>
                    </div>
                </div>
            </div>
            ''', unsafe_allow_html=True)

# --- INSIGHTS ---
st.markdown('<div class="section"><div class="section-title">💡 Insights</div></div>', unsafe_allow_html=True)

st.markdown(f'''
<div class="insight-grid">
    <div class="insight-card">
        <div class="insight-icon">📝</div>
        <div class="insight-value">{num_transacoes}</div>
        <div class="insight-label">Transações no mês</div>
    </div>
    <div class="insight-card">
        <div class="insight-icon">🏷️</div>
        <div class="insight-value">{cat_top}</div>
        <div class="insight-label">Categoria top</div>
    </div>
    <div class="insight-card">
        <div class="insight-icon">💸</div>
        <div class="insight-value">{fmt(maior_gasto)}</div>
        <div class="insight-label">Maior gasto</div>
    </div>
</div>
''', unsafe_allow_html=True)

# --- CHARTS ---
st.markdown('<div class="section"><div class="section-title">📈 Análises</div></div>', unsafe_allow_html=True)

tab1, tab2 = st.tabs(["🍩 Por Categoria", "📊 Evolução"])

with tab1:
    if 'categoria' in df_mes.columns and not df_mes.empty:
        df_cat = df_mes[df_mes['valor'] > 0].groupby('categoria')['valor'].sum().reset_index()
        if not df_cat.empty:
            fig = px.pie(df_cat, values='valor', names='categoria', hole=0.55,
                        color_discrete_sequence=['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'])
            fig.update_layout(
                height=320, paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)',
                font=dict(color='#e2e8f0', size=12),
                legend=dict(orientation="h", y=-0.15, x=0.5, xanchor="center"),
                margin=dict(t=30, b=60, l=30, r=30)
            )
            fig.update_traces(textposition='inside', textinfo='percent', textfont_size=11)
            st.plotly_chart(fig, use_container_width=True, config={'displayModeBar': False})
        else:
            st.info("Sem gastos no mês")

with tab2:
    if 'data' in df.columns and not df.empty:
        df['mes'] = df['data'].dt.to_period('M').astype(str)
        df_m = df[df['valor'] > 0].groupby('mes')['valor'].sum().reset_index().tail(6)
        if not df_m.empty:
            fig = go.Figure()
            fig.add_trace(go.Bar(
                x=df_m['mes'], y=df_m['valor'],
                marker=dict(color=df_m['valor'], colorscale=[[0,'#6366f1'],[0.5,'#a855f7'],[1,'#ec4899']]),
                hovertemplate='%{x}<br>%{y:,.2f}<extra></extra>'
            ))
            fig.update_layout(
                height=280, paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)',
                font=dict(color='#e2e8f0'), xaxis_title="", yaxis_title="",
                xaxis=dict(gridcolor='rgba(255,255,255,0.05)'),
                yaxis=dict(gridcolor='rgba(255,255,255,0.05)'),
                margin=dict(t=20, b=40, l=50, r=20)
            )
            st.plotly_chart(fig, use_container_width=True, config={'displayModeBar': False})

# --- EXTRATO ---
st.markdown('<div class="section"><div class="section-title">📜 Extrato Recente</div></div>', unsafe_allow_html=True)

# Filtros
with st.expander("🔍 Filtros", expanded=False):
    col1, col2 = st.columns(2)
    with col1:
        f_contas = st.multiselect("Contas", contas, default=contas, key="fc")
    with col2:
        cats = df['categoria'].unique().tolist() if 'categoria' in df.columns else []
        f_cats = st.multiselect("Categorias", cats, key="fcat")

df_ext = df_mes.copy()
if f_contas: df_ext = df_ext[df_ext['conta'].isin(f_contas)]
if f_cats: df_ext = df_ext[df_ext['categoria'].isin(f_cats)]
df_ext = df_ext.sort_values('data', ascending=False).head(10)

if not df_ext.empty:
    for _, row in df_ext.iterrows():
        desc = row.get('descricao', 'Sem descrição')
        val = row.get('valor', 0)
        cat = row.get('categoria', '')
        dt = row.get('data', '')
        status = row.get('status', '')
        conta = row.get('conta', '')
        
        dt_str = dt.strftime("%d/%m") if hasattr(dt, 'strftime') else ""
        is_gasto = val > 0
        tipo = "expense" if is_gasto else "income"
        icon = CAT_ICONS.get(str(cat).lower().strip(), '💸' if is_gasto else '💵')
        val_fmt = fmt(abs(val))
        if not is_gasto: val_fmt = "+" + val_fmt
        
        status_html = ""
        if status:
            s_class = "pendente" if 'pend' in str(status).lower() else "pago"
            status_html = f'<span class="tx-status {s_class}">{status}</span>'
        
        st.markdown(f'''
        <div class="tx-item">
            <div class="tx-icon {tipo}">{icon}</div>
            <div class="tx-info">
                <div class="tx-desc">{desc}</div>
                <div class="tx-meta">{dt_str} • {conta} {status_html}</div>
            </div>
            <div class="tx-amount {tipo}">{val_fmt}</div>
        </div>
        ''', unsafe_allow_html=True)
else:
    st.info("Nenhuma transação encontrada")

# Footer com botões
st.markdown("---")
col1, col2, col3 = st.columns([1,1,1])
with col1:
    if st.button("⬅️ Voltar", use_container_width=True):
        st.switch_page("Home.py")
with col2:
    if st.button("🔄 Atualizar Dados", use_container_width=True):
        st.cache_data.clear()
        st.rerun()

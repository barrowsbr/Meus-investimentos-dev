import streamlit as st
from core.auth import require_auth
from core.utils import format_decimal_br

# --- AUTH CHECK ---
require_auth()

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, date

from core.finances.logic import CreditCardEngine, MetricCalculator, CreditCardBill
from core.finances.data import get_finance_data

# --- CONFIG ---
st.set_page_config(
    page_title="Finanças (Barroots)",
    page_icon="💳",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- CSS INJECTION (MATCHING HOME.PY) ---
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');

    /* Reset & Base */
    html, body, [class*="css"] {
        font-family: 'Outfit', sans-serif;
        color: #e2e8f0; /* Slate 200 */
    }
    
    /* Background Gradient Animation */
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

    /* Metric Cards - Glassmorphism */
    div[data-testid="metric-container"] {
        background: rgba(30, 41, 59, 0.4);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.05);
        padding: 20px;
        border-radius: 16px;
        color: #ffffff;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        transition: transform 0.2s;
    }
    
    div[data-testid="metric-container"]:hover {
        transform: translateY(-2px);
        background: rgba(30, 41, 59, 0.6);
        border-color: rgba(99, 102, 241, 0.4);
    }
    
    label[data-testid="stMetricLabel"] > div {
        color: #94a3b8 !important; /* Slate 400 */
        font-weight: 400;
        font-size: 0.9rem;
    }

    div[data-testid="stMetricValue"] > div {
        color: #f8fafc !important; /* Slate 50 */
        font-weight: 700;
    }
    
    div[data-testid="stMetricDelta"] > svg {
        fill: #e2e8f0 !important;
    }

    /* Tabs */
    .stTabs [data-baseweb="tab-list"] {
        gap: 8px;
        background-color: transparent;
    }
    .stTabs [data-baseweb="tab"] {
        height: 50px;
        white-space: pre-wrap;
        background-color: rgba(255,255,255,0.05);
        border-radius: 8px;
        gap: 1px;
        padding-top: 10px;
        padding-bottom: 10px;
        color: #cbd5e1;
        border: 1px solid transparent;
        transition: all 0.3s;
    }
    .stTabs [aria-selected="true"] {
        background-color: rgba(99, 102, 241, 0.2); /* Indigo tint */
        border: 1px solid rgba(99, 102, 241, 0.5);
        color: #ffffff;
    }
    
    /* Table Styling */
    .stDataFrame {
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        background-color: rgba(15, 23, 42, 0.6);
    }
    
     /* Headers */
    h1, h2, h3 {
        color: #f1f5f9;
        font-weight: 700;
    }

    /* HERO TITLE (BARROOTS) */
    .hero-container {
        text-align: center;
        padding-top: 2vh;
        padding-bottom: 2vh;
        animation: fadeIn 1.2s ease-out;
    }
    
    .hero-title {
        font-size: 3.5rem;
        font-weight: 800;
        background: linear-gradient(to right, #ffffff, #a5b4fc);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 0px;
        letter-spacing: -2px;
        text-shadow: 0 0 40px rgba(165, 180, 252, 0.2);
    }
    
    .hero-subtitle {
        color: #94a3b8;
        font-size: 1.1rem;
        font-weight: 300;
        margin-top: 5px;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
    }
    
    hr {
        border-color: rgba(255,255,255,0.1);
    }
    
    /* Buttons */
    div.stButton > button {
        background: linear-gradient(90deg, #4f46e5 0%, #4338ca 100%);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 8px;
        font-weight: 600;
        transition: all 0.3s;
    }
    div.stButton > button:hover {
         box-shadow: 0 0 15px rgba(79, 70, 229, 0.5);
    }

    /* Hide Streamlit Toolbar */
    #MainMenu, footer, header {visibility: hidden;}

</style>
""", unsafe_allow_html=True)

# --- LOAD DATA ---
@st.cache_data
def load_and_process():
    df_raw = get_finance_data() # Returns mock DataFrame
    bills = CreditCardEngine.process_transactions(df_raw)
    return df_raw, bills

try:
    df_raw, bills = load_and_process()
except Exception as e:
    st.error(f"Erro ao carregar dados: {e}")
    st.stop()

# --- MAIN LOGIC FOR KPIS ---
# Find "Open" Bill (Current)
current_bill = next((b for b in bills if b.status == 'Open'), None)
if not current_bill:
    # If no open found (e.g. all closed), take last or next future
    current_bill = bills[-1] if bills else None

# Calculate KPIs
today = date.today()
if current_bill:
    # Burn Rate
    burn_rate = MetricCalculator.calculate_burn_rate(current_bill)
    
    # Points
    points_est = MetricCalculator.calculate_points(current_bill.total_amount)
    
    # Saldo Real Liquido (Needs Investment Data - Mocking for now as per plan)
    # TODO: Connect to `core.data_loader` real liquidity
    liquid_assets = 15000.00 # Placeholder
    
    # Liability: Current Open + All Future
    future_liability = sum(b.total_amount for b in bills if b.status == 'Future')
    total_liability = current_bill.total_amount + future_liability
    
    saldo_real = liquid_assets - total_liability
else:
    burn_rate = 0
    points_est = 0
    saldo_real = 0

# --- UI HEADER ---
col_head1, col_head2 = st.columns([8, 1])
with col_head1:
    st.markdown("""
    <div class="hero-container" style="text-align: left; padding: 0;">
        <div class="hero-title" style="font-size: 3rem;">Painel de Controle</div>
        <div class="hero-subtitle">Gestão Financeira & Cartões</div>
    </div>
    """, unsafe_allow_html=True)
with col_head2:
    st.markdown("<div style='height: 20px'></div>", unsafe_allow_html=True)
    if st.button("🏠 Voltar para Home", use_container_width=True):
        st.switch_page("Home.py")

st.markdown("---")

col_kpi1, col_kpi2, col_kpi3, col_kpi4 = st.columns(4)

with col_kpi1:
    st.metric(
        "Saldo Real Líquido", 
        f"R$ {format_decimal_br(saldo_real)}", 
        delta="Liquidez vs Dívida Futura", 
        delta_color="normal" if saldo_real > 0 else "inverse",
        help="Caixa Atual + Liquidez Imediata - (Fatura Aberta + Parcelados Futuros)"
    )

with col_kpi2:
    st.metric(
        "Fatura Aberta (Estimada)", 
        f"R$ {format_decimal_br(current_bill.total_amount)}" if current_bill else "R$ 0,00",
        delta=f"Vence em {current_bill.due_date.strftime('%d/%m')}" if current_bill else "",
        delta_color="off"
    )

with col_kpi3:
    st.metric(
        "Burn Rate Diário", 
        f"R$ {format_decimal_br(burn_rate)} / dia",
        help="Média de gasto diário no ciclo atual"
    )

with col_kpi4:
    st.metric(
        "Pontos Estimados", 
        f"{format_decimal_br(points_est, 0)} pts",
        delta="No ciclo atual"
    )

st.markdown("<div style='height: 30px'></div>", unsafe_allow_html=True)

# --- SECTION 2: TIMELINE & BUDGET ---
col_main1, col_main2 = st.columns([1.5, 1])

with col_main1:
    st.subheader("📅 Linha do Tempo de Faturas")
    
    # Prepare Timeline Data
    timeline_data = []
    for b in bills:
        if abs((b.due_date.month - today.month) + (b.due_date.year - today.year)*12) <= 3:
            timeline_data.append({
                'Vencimento': b.due_date.strftime('%Y-%m-%d'), 
                'Valor': b.total_amount, 
                'Status': b.status,
                'Mês': b.due_date.strftime('%b/%y')
            })
    
    df_tl = pd.DataFrame(timeline_data)
    
    if not df_tl.empty:
        colors = {'Closed': '#64748b', 'Open': '#ef4444', 'Future': '#3b82f6'}
        
        fig_tl = px.bar(
            df_tl, 
            x='Mês', 
            y='Valor', 
            color='Status',
            text_auto=',.2f',
            color_discrete_map=colors,
            title="Fluxo de Caixa (Vencimentos)"
        )
        fig_tl.update_layout(
            height=350, 
            template="plotly_dark",
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)',
            font={'family': 'Outfit, sans-serif'}
        )
        st.plotly_chart(fig_tl, use_container_width=True)
    else:
        st.info("Sem dados de faturas.")

with col_main2:
    st.subheader("📊 Orçamento (Competência)")
    
    curr_month_tx = df_raw[
        (pd.to_datetime(df_raw['date']).dt.month == today.month) & 
        (pd.to_datetime(df_raw['date']).dt.year == today.year)
    ]
    
    if not curr_month_tx.empty:
        df_bud = curr_month_tx.groupby('category')['amount'].sum().reset_index()
        df_bud = df_bud.sort_values('amount', ascending=True)
        
        fig_bud = px.bar(
            df_bud, 
            x='amount', 
            y='category', 
            orientation='h',
            title=f"Gastos de {today.strftime('%B')}",
            color='amount',
            color_continuous_scale='Reds' # Or a cooler scale for dark mode
        )
        fig_bud.update_layout(
            height=350, 
            showlegend=False,
            template="plotly_dark",
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)',
            font={'family': 'Outfit, sans-serif'}
        )
        st.plotly_chart(fig_bud, use_container_width=True)
    else:
        st.info("Sem gastos registrados neste mês calendário.")

# --- SECTION 3: INTELLIGENT TABLE ---
st.markdown("<div style='height: 20px'></div>", unsafe_allow_html=True)
st.subheader("🔎 Extrato Inteligente")

# Flatten bill items for display
all_items = []
for b in bills:
    for item in b.items:
        all_items.append({
            'Data Compra': item['date'],
            'Descrição': item['description'],
            'Categoria': item['category'],
            'Valor (R$)': item['value'],
            'Vencimento Fatura': b.due_date,
            'Status Fatura': b.status
        })

df_display = pd.DataFrame(all_items)

# Filters
col_f1, col_f2 = st.columns(2)
with col_f1:
    filter_status = st.multiselect("Filtrar Status Fatura", df_display['Status Fatura'].unique(), default=['Open', 'Future'])

if filter_status:
    df_display = df_display[df_display['Status Fatura'].isin(filter_status)]

# Styling logic (Streamlit dataframe styling is limited but we can match dark mode)
# Display
st.dataframe(
    df_display.sort_values('Vencimento Fatura'),
    column_config={
        "Valor (R$)": st.column_config.NumberColumn(format="R$ %.2f"),
        "Vencimento Fatura": st.column_config.DateColumn(format="DD/MM/YYYY"),
        "Data Compra": st.column_config.DateColumn(format="DD/MM/YYYY"),
    },
    use_container_width=True,
    hide_index=True,
    height=500
)

# Sidebar Navigation
with st.sidebar:
    st.header("Navegação")
    if st.button("🏠 Home"):
         st.switch_page("Home.py")
    if st.button("🚀 Investimentos"):
         st.switch_page("pages/1_Investimentos.py")

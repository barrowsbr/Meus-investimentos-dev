import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from core.auth import require_auth
from core.data.provider import DataProvider
from core.utils import parse_decimal_br

# --- AUTH CHECK ---
require_auth()

# --- PAGE CONFIG ---
st.set_page_config(
    page_title="Histórico Patrimonial",
    page_icon="🏛️",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- CSS / VISUAL IDENTITY (BARROOTS) ---
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');

    html, body, [class*="css"] {
        font-family: 'Outfit', sans-serif;
        color: #e2e8f0;
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

    /* Hero Styles */
    .hero-container {
        text-align: center;
        padding-top: 2vh;
        padding-bottom: 4vh;
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

    /* GLASS CARD STYLE */
    .glass-card {
        background: rgba(30, 41, 59, 0.4);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 20px;
        padding: 25px;
        margin-bottom: 20px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        transition: transform 0.3s ease, border-color 0.3s ease;
    }
    
    .glass-card:hover {
        transform: translateY(-5px);
        border-color: rgba(99, 102, 241, 0.3);
    }

    /* Hide Streamlit elements */
    #MainMenu, footer, header {visibility: hidden;}
    [data-testid="stSidebar"] {display: none;}
    
</style>
""", unsafe_allow_html=True)

# --- HEADER ---
c1, c2 = st.columns([8, 1])
with c1:
    st.markdown("""
    <div class="hero-container" style="text-align: left; padding-top: 0;">
        <div class="hero-title" style="font-size: 3rem;">Legado Patrimonial</div>
        <div class="hero-subtitle">Visualização da construção de riqueza ao longo dos anos</div>
    </div>
    """, unsafe_allow_html=True)
with c2:
    if st.button("🏠 Home", use_container_width=True):
        st.switch_page("Home.py")

# --- DATA PROCESSING ---
try:
    # Construct/Fetch Data directly to avoid caching issues with new methods
    df_raw = DataProvider.fetch_data('lb_historic')
    
    if df_raw.empty:
        st.info("Nenhum dado histórico encontrado na aba 'lb_historic'.")
    else: # Process Data
        # Assume format: 
        # Col 0: Index/Names
        # Cols 1+: Years (2019, 2020...)
        
        # 1. Clean Column Names to simpler years
        # The provider might have loaded headers. Let's inspect columns.
        # If headers are 2019, 2020... good.
        
        # Melt dataframe to long format for Plotly
        # Expected cols: ['Instituição', '2019', '2020', ...]
        
        # Detect year columns (numeric-ish)
        year_cols = [c for c in df_raw.columns if str(c).strip().isdigit()]
        
        # Filter rows: Remove "Total" and empty
        # Assuming first column is "Instituição" or empty name
        first_col = df_raw.columns[0]
        
        df_clean = df_raw[
            (df_raw[first_col].astype(str).str.lower() != 'total') & 
            (df_raw[first_col].notna())
        ].copy()
        
        # Convert Values to Float
        for yc in year_cols:
            df_clean[yc] = df_clean[yc].apply(parse_decimal_br)
            
        # Melt
        df_melted = df_clean.melt(id_vars=[first_col], value_vars=year_cols, var_name='Ano', value_name='Valor')
        df_melted['Ano'] = df_melted['Ano'].astype(str)
        
        # Enrich Data (Lucas vs Maria vs Joint)
        def classify_owner(row_name):
            n = str(row_name).lower()
            if 'lucas' in n: return 'Lucas'
            if 'maria' in n: return 'Maria'
            return 'Conjunto'
            
        df_melted['Titular'] = df_melted[first_col].apply(classify_owner)
        
        # --- DASHBOARD ---
        
        # KPI: Total Atual (Max Year)
        max_year = df_melted['Ano'].max()
        total_current = df_melted[df_melted['Ano'] == max_year]['Valor'].sum()
        
        # KPI: Growth compared to start
        min_year = df_melted['Ano'].min()
        total_start = df_melted[df_melted['Ano'] == min_year]['Valor'].sum()
        growth = ((total_current / total_start) - 1) * 100 if total_start > 0 else 0
        
        # ROW 1: KPIs
        k1, k2, k3 = st.columns(3)
        
        with k1:
             st.markdown(f"""
            <div class="glass-card">
                <div style="color: #94a3b8; font-size: 0.9rem;">Patrimônio Acumulado ({max_year})</div>
                <div style="font-size: 2.2rem; font-weight: 700; color: #fff;">R$ {total_current:,.2f}</div>
            </div>
            """, unsafe_allow_html=True)
            
        with k2:
            color_g = "#4ade80" if growth > 0 else "#f87171"
            st.markdown(f"""
            <div class="glass-card">
                <div style="color: #94a3b8; font-size: 0.9rem;">Crescimento Total ({min_year}-{max_year})</div>
                <div style="font-size: 2.2rem; font-weight: 700; color: {color_g};">+{growth:,.0f}%</div>
            </div>
            """, unsafe_allow_html=True)

        with k3:
             # Most representative holder
             df_last = df_melted[df_melted['Ano'] == max_year]
             grp = df_last.groupby('Titular')['Valor'].sum()
             top_holder = grp.idxmax() if not grp.empty else "-"
             val_holder = grp.max() if not grp.empty else 0
             st.markdown(f"""
            <div class="glass-card">
                <div style="color: #94a3b8; font-size: 0.9rem;">Maior Contribuição ({top_holder})</div>
                <div style="font-size: 2.2rem; font-weight: 700; color: #a5b4fc;">R$ {val_holder:,.2f}</div>
            </div>
            """, unsafe_allow_html=True)
            
        # ROW 2: MAIN CHART
        st.markdown("### 📈 Evolução Patrimonial")
        
        st.markdown('<div class="glass-card">', unsafe_allow_html=True)
        
        # Stacked Bar Chart
        fig = px.bar(
            df_melted, 
            x="Ano", 
            y="Valor", 
            color="Titular",
            hover_data=[first_col],
            color_discrete_map={'Lucas': '#818cf8', 'Maria': '#f472b6', 'Conjunto': '#2dd4bf'},
            title=""
        )
        
        fig.update_layout(
            paper_bgcolor='rgba(0,0,0,0)',
            plot_bgcolor='rgba(0,0,0,0)',
            font=dict(family="Outfit, sans-serif", color="#e2e8f0"),
            xaxis=dict(showgrid=False),
            yaxis=dict(showgrid=True, gridcolor='rgba(255,255,255,0.05)', tickformat="R$ "),
            legend=dict(orientation="h", y=1.1, x=0.5, xanchor="center", title=None),
            hovermode="x unified",
            height=500
        )
        # Add total labels on top? Maybe clutter.
        
        st.plotly_chart(fig, use_container_width=True)
        st.markdown('</div>', unsafe_allow_html=True)
        
        # ROW 3: DETAILED TABLE
        with st.expander("🔍 Visualizar Dados Detalhados em Tabela"):
             st.dataframe(
                 df_raw.style.format(precision=2),
                 use_container_width=True,
                 height=400
             )

except Exception as e:
    st.error(f"Erro ao processar dados históricos: {e}")
    st.exception(e)

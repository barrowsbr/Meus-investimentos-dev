
import streamlit as st
from core.auth import require_auth

# --- AUTH CHECK ---
require_auth()

import pandas as pd
import numpy as np
import plotly.graph_objects as go
import plotly.express as px
from datetime import datetime

# --- CORE IMPORTS ---
from core.data.loader import load_assets, load_proventos, load_fixed_income, load_cambio, load_fixed_income_manual
from core.data.market import fetch_historical_data, fetch_market_data
from core.finance import calcular_carteira_fechada, summarize_fixed_income_hybrid, summarize_fixed_income
from core.engine import reconstruct_history_multicurrency
from core.consolidator import consolidate_to_brl, ConsolidatedResult

# ═══════════════════════════════════════════════════════════════════════════════
# FINANCIAL X-RAY
# Surreal Visual Debugging Experience
# ═══════════════════════════════════════════════════════════════════════════════

st.set_page_config(
    page_title="Financial X-Ray",
    page_icon="🧬",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# Custom CSS for Cyberpunk/Glassmorphism look
st.markdown("""
<style>
    /* Darker background for X-Ray */
    [data-testid="stAppViewContainer"] {
        background-color: #020617;
        background-image: 
            radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%), 
            radial-gradient(at 100% 0%, rgba(16, 185, 129, 0.1) 0px, transparent 50%),
            radial-gradient(at 100% 100%, rgba(244, 63, 94, 0.1) 0px, transparent 50%);
    }
    
    .xray-title {
        font-family: 'Courier New', monospace;
        font-size: 3rem;
        font-weight: 700;
        letter-spacing: -2px;
        background: -webkit-linear-gradient(45deg, #818cf8, #34d399, #f472b6);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 0px;
    }
    
    .xray-subtitle {
        font-family: 'Outfit', sans-serif;
        color: #94a3b8;
        font-size: 1.1rem;
        margin-bottom: 40px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
        padding-bottom: 20px;
    }
    
    .glass-card {
        background: rgba(255, 255, 255, 0.03);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    }
    
    .metric-value {
        font-family: 'Courier New', monospace;
        font-size: 1.8rem;
        font-weight: bold;
        color: #e2e8f0;
    }
    
    .metric-label {
        font-family: 'Outfit', sans-serif;
        font-size: 0.8rem;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 1px;
    }
</style>
""", unsafe_allow_html=True)

# Header
col_head, col_back = st.columns([10, 1])
with col_head:
    st.markdown('<div class="xray-title">FINANCIAL X-RAY</div>', unsafe_allow_html=True)
    st.markdown('<div class="xray-subtitle">Deep Portfolio Exploration // Visual Debugger</div>', unsafe_allow_html=True)
with col_back:
    if st.button("⬅️ SAIR", use_container_width=True):
        st.switch_page("pages/3_Performance.py")

# ═══════════════════════════════════════════════════════════════════════════════
# DATA LOADING ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

@st.cache_data(ttl=3600, show_spinner=False)
def load_xray_data():
    """Loads all critical financial data for the X-Ray engine."""
    
    # 1. Raw Data
    df_assets = load_assets()
    df_rf_raw = load_fixed_income()
    df_cambio = load_cambio()
    df_prov = load_proventos()
    manual_rf_values = load_fixed_income_manual()
    
    # 2. Market Data
    tickers_carteira = df_assets['ticker'].unique().tolist()
    tickers_download = list(set([t for t in tickers_carteira if t]))
    
    # Ensure FX tickers are present
    for fx in ['BRL=X', 'EURUSD=X', 'CADUSD=X', 'BTC-USD']:
        if fx not in tickers_download:
            tickers_download.append(fx)
            
    df_hist_prices = fetch_historical_data(tickers_download)
    
    # 3. Engine Execution
    # reconstruct_history_multicurrency(df_bruto, df_proventos, days_lookback, df_prices_external, ...)
    multi_result = reconstruct_history_multicurrency(
        df_bruto=df_assets,
        df_proventos=df_prov,
        days_lookback=365*5,  # Default to 5 years
        df_prices_external=df_hist_prices,
        df_rf_raw=df_rf_raw,
        df_cambio=df_cambio,
        manual_rf_values=manual_rf_values
    )
    
    # 4. Consolidation (Market View by default)
    consolidated = consolidate_to_brl(multi_result.buckets, multi_result.fx_rates)
    
    return {
        "multi_result": multi_result,
        "consolidated": consolidated,
        "df_assets": df_assets,
        "df_rf_raw": df_rf_raw,
        "manual_rf_values": manual_rf_values,
        "df_prov": df_prov
    }

with st.spinner("🧬 SCANNING PORTFOLIO DNA..."):
    data = load_xray_data()
    multi_result = data["multi_result"]
    consolidated = data["consolidated"]
    
    # Spot Values (Snapshot)
    nav_total = consolidated.nav_brl.iloc[-1] if not consolidated.nav_brl.empty else 0
    cash_flow = consolidated.flow_brl.sum()
    pnl = nav_total - cash_flow
    
# ═══════════════════════════════════════════════════════════════════════════════
# VISUALIZATIONS
# ═══════════════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════════════
# VISUALIZATIONS
# ═══════════════════════════════════════════════════════════════════════════════

# Top KPI Matrix
k1, k2, k3, k4 = st.columns(4)

with k1:
    st.markdown(f"""
    <div class="glass-card">
        <div class="metric-label">NAV TOTAL</div>
        <div class="metric-value">R$ {nav_total:,.0f}</div>
        <div style="color: #34d399; font-size: 0.9rem;">LIVE</div>
    </div>
    """, unsafe_allow_html=True)

with k2:
    st.markdown(f"""
    <div class="glass-card">
        <div class="metric-label">TOTAL INVESTED</div>
        <div class="metric-value">R$ {cash_flow:,.0f}</div>
        <div style="color: #94a3b8; font-size: 0.9rem;">FLOWS</div>
    </div>
    """, unsafe_allow_html=True)

with k3:
    color = "#34d399" if pnl >= 0 else "#f87171"
    st.markdown(f"""
    <div class="glass-card">
        <div class="metric-label">NET PROFIT</div>
        <div class="metric-value" style="color: {color}">R$ {pnl:,.0f}</div>
        <div style="color: {color}; font-size: 0.9rem;">{(pnl/cash_flow)*100:+.1f}%</div>
    </div>
    """, unsafe_allow_html=True)

with k4:
    currencies = len(multi_result.buckets)
    assets = len(multi_result.tickers_yahoo)
    st.markdown(f"""
    <div class="glass-card">
        <div class="metric-label">COMPOSITION</div>
        <div class="metric-value">{currencies} <span style="font-size: 1rem; color: #64748b;">CURRENCIES</span></div>
        <div style="color: #94a3b8; font-size: 0.9rem;">{assets} ASSETS SCANNED</div>
    </div>
    """, unsafe_allow_html=True)

st.markdown("<br>", unsafe_allow_html=True)

# ─── SUNBURST: ASSET UNIVERSE ────────────────────────────────────────────────
st.markdown("### ☀️ CONSTANT UNIVERSE")
# [FIXED] Restored Definitions

# Prepare Sunburst Data
# Hierarchy: Portfolio -> Currency -> Class -> Ticker


# However, the above logic is flawed for px.sunburst which expects a flat table with columns for hierarchy.
# Let's fix:

# Fetch active positions in BRL
df_pos_spot, _ = calcular_carteira_fechada(data["df_assets"])
# Add FX rates
mapa_precos_spot, _ = fetch_market_data(['BRL=X', 'EURBRL=X', 'CADBRL=X'])
usd_spot = mapa_precos_spot.get('BRL=X', 5.50)
eur_spot = mapa_precos_spot.get('EURBRL=X', 6.00)
cad_spot = mapa_precos_spot.get('CADBRL=X', 4.00)

sunburst_data = []
for _, row in df_pos_spot.iterrows():
    if row['Qtd'] <= 0: continue
    t = row['Ticker']
    m = row['Moeda']
    
    fx = 1.0
    if m == 'USD': fx = usd_spot
    elif m == 'EUR': fx = eur_spot
    
    val_brl = row['Qtd'] * row['PM_Origem'] * fx # Cost basis size
    
    classe = 'Ações'
    if t in ['BTC-USD', 'BTC', 'ETH-USD']: classe = 'Cripto'
    elif m == 'BRL' and '11' in t: classe = 'FIIs'
    
    sunburst_data.append({
        'Moeda': m,
        'Classe': classe,
        'Ticker': t,
        'Valor': val_brl
    })

if sunburst_data:
    df_sun = pd.DataFrame(sunburst_data)
    fig_sb = px.sunburst(
        df_sun,
        path=['Moeda', 'Classe', 'Ticker'],
        values='Valor',
        color='Moeda',
        color_discrete_map={'USD': '#818cf8', 'BRL': '#34d399', 'EUR': '#f472b6'},
        maxdepth=3
    )
    
    fig_sb.update_layout(
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        font=dict(family='Outfit', color='#e2e8f0'),
        margin=dict(t=0, l=0, r=0, b=0),
        height=500
    )
    fig_sb.update_traces(
        marker=dict(line=dict(color='#020617', width=1)),
        leaf=dict(opacity=0.9)
    )
    st.plotly_chart(fig_sb, use_container_width=True)
else:
    st.info("No active assets for Sunburst.")


# ─── SANKEY: FLOW DYNAMICS ───────────────────────────────────────────────────
st.markdown("### 🌊 CAPITAL FLOW DYNAMICS")

# Sankey Data Preparation
# Flow: Portfolio (Total NAV) -> Currency -> Class
sankey_nodes = ["PORTFOLIO"]
sankey_links = []

# Mapeamento de índices
node_map = {"PORTFOLIO": 0}
counter = 1

def get_node_id(label):
    global counter
    if label not in node_map:
        node_map[label] = counter
        sankey_nodes.append(label)
        counter += 1
    return node_map[label]

# Data aggregation
agg_moeda = {}
agg_classe = {}
flows = []

if sunburst_data: # Reusing processed data from Sunburst step
    for item in sunburst_data:
        m = item['Moeda']
        c = f"{item['Classe']} ({m})" # Unique class per currency
        val = item['Valor']
        
        # Portfolio -> Moeda
        if m not in agg_moeda: agg_moeda[m] = 0
        agg_moeda[m] += val
        
        # Moeda -> Classe
        flows.append((m, c, val))

    # Build Links
    # 1. Root -> Moeda
    for m, val in agg_moeda.items():
        sankey_links.append({
            "source": get_node_id("PORTFOLIO"),
            "target": get_node_id(m),
            "value": val,
            "color": "rgba(129, 140, 248, 0.4)" if m=='USD' else "rgba(52, 211, 153, 0.4)"
        })
        
    # 2. Moeda -> Classe
    for m, c, val in flows:
        # Aggregate logic needed? flows list has granular items (one per ticker potentially if sunburst_data was granular)
        # Actually sunburst_data was granular. We should aggregate first.
        pass

    # Better aggregation for Moeda -> Classe
    df_sankey = pd.DataFrame(sunburst_data)
    df_class_agg = df_sankey.groupby(['Moeda', 'Classe'])['Valor'].sum().reset_index()
    
    for _, row in df_class_agg.iterrows():
        m = row['Moeda']
        c = row['Classe']
        val = row['Valor']
        
        sankey_links.append({
            "source": get_node_id(m),
            "target": get_node_id(c),
            "value": val,
            "color": "rgba(255, 255, 255, 0.1)"
        })

    # Plotly Sankey
    fig_sankey = go.Figure(data=[go.Sankey(
        node=dict(
            pad=15,
            thickness=20,
            line=dict(color="black", width=0.5),
            label=sankey_nodes,
            color=["#818cf8"] + ["#64748b"] * (len(sankey_nodes)-1)
        ),
        link=dict(
            source=[l['source'] for l in sankey_links],
            target=[l['target'] for l in sankey_links],
            value=[l['value'] for l in sankey_links],
            color=[l['color'] for l in sankey_links]
        )
    )])

    fig_sankey.update_layout(
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        font=dict(family='Outfit', color='#e2e8f0'),
        margin=dict(t=20, l=10, r=10, b=20),
        height=400
    )
    
    fig_sankey.update_layout(
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        font=dict(family='Outfit', color='#e2e8f0'),
        margin=dict(t=20, l=10, r=10, b=20),
        height=400
    )
    
    st.plotly_chart(fig_sankey, use_container_width=True)
else:
    st.info("No data for Sankey.")

st.markdown("<br>", unsafe_allow_html=True)

# ─── DNA EVOLUTION: TIME SERIES ──────────────────────────────────────────────
st.markdown("### 🧬 DNA EVOLUTION")

if not consolidated.nav_brl.empty:
    df_ev = pd.DataFrame({
        "NAV": consolidated.nav_brl,
        "Investido": consolidated.cost_brl if hasattr(consolidated, 'cost_brl') else consolidated.flow_brl.cumsum()
    })
    
    # Helper to reconstruct accumulated flow if simplified object
    if 'Investido' not in df_ev.columns or df_ev['Investido'].isna().all():
        # Reconstruct invested capital curve from flows
        df_ev['Investido'] = consolidated.flow_brl.cumsum()

    fig_dna = go.Figure()
    
    # Invested Area
    fig_dna.add_trace(go.Scatter(
        x=df_ev.index, y=df_ev['Investido'],
        fill='tozeroy', mode='none',
        name='Invested',
        fillcolor='rgba(148, 163, 184, 0.1)'
    ))
    
    # NAV Line with Neon Glow
    fig_dna.add_trace(go.Scatter(
        x=df_ev.index, y=df_ev['NAV'],
        mode='lines',
        name='NAV',
        line=dict(color='#818cf8', width=3, shape='spline'),
    ))
    
    fig_dna.update_layout(
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        font=dict(family='Courier New', color='#94a3b8'),
        margin=dict(t=10, l=10, r=10, b=10),
        height=300,
        showlegend=False,
        hovermode="x unified",
        xaxis=dict(showgrid=False, zeroline=False),
        yaxis=dict(showgrid=True, gridcolor='rgba(255,255,255,0.05)', zeroline=False)
    )
    st.plotly_chart(fig_dna, use_container_width=True)

st.markdown("<br>", unsafe_allow_html=True)

# ─── THE MATRIX: RAW DATA GRID ──────────────────────────────────────────────
st.markdown("### 🧬 THE MATRIX // RAW DATA")

if not df_pos_spot.empty:
    # Prepare "Matrix" dataframe
    df_matrix = df_pos_spot.copy()
    
    # Add Current Price if available (enrichment)
    # Using simple retrieval or re-using calc
    
    # Format for display
    st.dataframe(
        df_matrix,
        column_config={
            "Ticker": st.column_config.TextColumn("TICKER", width="small"),
            "Moeda": st.column_config.TextColumn("MOEDA", width="small"),
            "Qtd": st.column_config.NumberColumn("QUANTIDADE", format="%.4f"),
            "PM_Origem": st.column_config.NumberColumn("PM (ORIGEM)", format="%.2f"),
            "Setor": st.column_config.TextColumn("CLASSE", width="medium"),
        },
        use_container_width=True,
        hide_index=True,
        height=400
    )
    
    st.caption("⚡ LIVE DATA STREAM FROM CORE ENGINE")
else:
    st.warning("MATRIX OFFLINE: NO ACTIVE POSITIONS FOUND.")



import streamlit as st
from core.auth import require_auth

require_auth()

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta

# --- IMPORTS ---
from core.data_loader import load_assets, load_fixed_income, load_db_cotacoes
from core.twr import calculate_local_twr
from core.utils import format_decimal_br

st.set_page_config(
    page_title="Performance",
    page_icon="🚀",
    layout="wide"
)

st.title("🚀 Análise de Performance (Local)")
st.caption("Cálculo TWR Time-Weighted Return baseado em 'db_cotacoes'")
st.markdown("---")

# 1. LOAD DATA
with st.spinner("Carregando dados locais..."):
    # Transactions (RV + RF)
    df_rv = load_assets()
    df_rf = load_fixed_income()
    
    # Prices
    df_prices = load_db_cotacoes()

if df_prices.empty:
    st.error("⚠️ A aba 'db_cotacoes' está vazia ou não pôde ser carregada. Necessário alimentar cotações para cálculo.")
    st.stop()
    
if df_rv.empty and df_rf.empty:
    st.warning("Sem transações registradas.")
    st.stop()

# 2. MERGE TRANSACTIONS (RV + RF)
# Unify structure: [Data, Ticker, Tipo, Qtd, Valor]
# RV structure from load_assets might be holding positions, not transactions? 
# load_assets returns raw 'meus_ativos' usually. Let's check.
# 'meus_ativos' usually has transactions if it's the history log.
# Assuming 'meus_ativos' = Transactions Log.

transactions_list = []

# Process RV
if not df_rv.empty:
    # Mapping
    # Expected: data, ticker, tipo, quantidade, valor_total (computed or raw?)
    # Usually: 'data', 'ticker', 'tipo', 'quantidade', 'preco' -> Valor = Qtd * Preco
    
    cols = df_rv.columns.str.lower()
    df_rv.columns = cols
    
    if 'data' in df_rv.columns and 'quantidade' in df_rv.columns:
        df_rv['Valor'] = df_rv['quantidade'] * df_rv['preco']
        # IMPORTANT: Compra = Valor Negativo (Invisto Dinheiro)? Or Positivo?
        # Flow logic in TWR engine: "Flow" = Entry of money INTO asset.
        # Compra = Increase Position = Flow + (Money entered the "Asset Box").
        # Venda = Decrease Position = Flow - (Money left the "Asset Box").
        # Usually user logs Price as positive.
        # Ensure 'Valor' follows Flow logic.
        # Compra -> Flow +
        
        # Check types
        # Is 'quantidade' signed? Usually people log positive quantity for buy/sell but use 'Tipo'.
        # Let's trust 'Tipo'.
        
        for _, row in df_rv.iterrows():
            tipo = str(row.get('tipo', '')).lower()
            qtd = float(row.get('quantidade', 0))
            val = float(row.get('Valor', 0))
            
            # If Qtd is negative in log for sales, handle it.
            # But usually Flow should be:
            # Buy 100 * 10 = 1000 Flow.
            # Sell 100 * 12 = -1200 Flow.
            
            final_val = abs(val)
            final_qtd = abs(qtd)
            
            if 'venda' in tipo:
                final_val = -final_val
                final_qtd = -final_qtd
            
            transactions_list.append({
                'Data': row['data'],
                'Ticker': row['ticker'],
                'Tipo': tipo,
                'Qtd': final_qtd,
                'Valor': final_val
            })

# Process RF
if not df_rf.empty:
    # RF structure: Compra (Data), Ticker, Tipo, Valor (Fluxo?)
    # RF usually has 'Valor' directly.
    cols_rf = df_rf.columns
    # Map logic
    # Compra -> Flow +
    # Venda/Resgate -> Flow -
    
    # Check column names
    date_col = 'Compra' if 'Compra' in cols_rf else 'Data'
    
    for _, row in df_rf.iterrows():
        tipo = str(row.get('Tipo', '')).lower()
        val = float(row.get('Valor', 0))
        # RF Qty? Usually 1 'unit' of fixed income logic or Nominal Qty.
        # If we don't have Qty, we can't calculate NAV = Qty * Price.
        # UNLESS Price is 'Value of Holding' and Qty is 1.
        # db_cotacoes for RF: User likely updates 'Current Value'. 
        # So Price = PU (Unit Price). We need Qty.
        # If user logs RF as 'Money In', Qty = Money / 1.0? 
        # Assumption: For RF, Qty = Valor Investido (at start) / 1.0. Price = Multiplier?
        # OR: User tracks Unit Price (PU).
        # Let's assume standard Qty = 1 for simplicity if not provided, implies Price = Full Value.
        # Or: Qty = Val / 1.0. Price restarts at 1.0 and grows?
        
        q = row.get('Quantidade', row.get('Qtd', 0))
        if q == 0 and val != 0: q = val # Fallback Qty = Financial Volume (implies Price=1.0 base)
        
        final_val = abs(val)
        final_q = abs(q)
        
        if 'venda' in tipo or 'resgate' in tipo or 'vencimento' in tipo:
            final_val = -final_val
            final_q = -final_q
            
        transactions_list.append({
            'Data': row[date_col],
            'Ticker': row['Ticker'],
            'Tipo': tipo,
            'Qtd': final_q,
            'Valor': final_val
        })

df_transacoes_unif = pd.DataFrame(transactions_list)

# 3. RUN ENGINE
st.subheader("📊 Resultado Consolidado")

if not df_transacoes_unif.empty:
    df_result = calculate_local_twr(df_prices, df_transacoes_unif)
    
    if df_result.empty:
        st.warning("Não foi possível calcular TWR. Verifique se as datas de 'db_cotacoes' cobrem as transações.")
    else:
        # Metrics
        last_row = df_result.iloc[-1]
        
        col1, col2, col3, col4 = st.columns(4)
        col1.metric("Patrimônio (NAV)", f"R$ {format_decimal_br(last_row['NAV'])}")
        col1.metric("Fluxo Total", f"R$ {format_decimal_br(df_result['Flow'].sum())}")
        
        twr_total = last_row['TWR_Acum'] * 100
        col2.metric("Rentabilidade Acum. (TWR)", f"{format_decimal_br(twr_total)}%", delta_color="normal")
        
        dd = last_row['Drawdown'] * 100
        col3.metric("Drawdown Atual", f"{format_decimal_br(dd)}%", delta_color="inverse")
        
        # Plots
        st.markdown("### Evolução")
        
        # TWR Chart
        fig_twr = go.Figure()
        fig_twr.add_trace(go.Scatter(x=df_result.index, y=df_result['TWR_Acum']*100, name='TWR %', line=dict(color='#4f46e5', width=2)))
        fig_twr.update_layout(title="Rentabilidade Acumulada (%)", template="plotly_dark", yaxis_ticksuffix="%")
        st.plotly_chart(fig_twr, use_container_width=True)
        
        # NAV Chart
        fig_nav = go.Figure()
        fig_nav.add_trace(go.Scatter(x=df_result.index, y=df_result['NAV'], name='Patrimônio', fill='tozeroy', line=dict(color='#10b981')))
        fig_nav.update_layout(title="Evolução Patrimonial (R$)", template="plotly_dark")
        st.plotly_chart(fig_nav, use_container_width=True)
        
        with st.expander("Ver Dados Detalhados"):
            st.dataframe(df_result)
else:
    st.info("Nenhuma transação encontrada para processar.")

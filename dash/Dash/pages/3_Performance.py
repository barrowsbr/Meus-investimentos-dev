import streamlit as st
from core.auth import require_auth

# --- AUTH CHECK ---
require_auth()

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, date, timedelta
import numpy as np

# --- CORE IMPORTS ---
from core.data_loader import load_assets, load_proventos, load_fixed_income, load_cambio
from core.market_data import fetch_historical_data
from core.engine import reconstruct_history_multicurrency
from core.twr_canonical import calculate_canonical_twr, DEFAULT_PREMISES
from core.twr_engine_v2 import calculate_twr_v2, TWRConfig, diagnose_series

# --- NOVOS IMPORTS (v2.1) - Visualizações e Validações Otimizadas ---
from core.twr_corrections import validate_twr_continuity
from core.twr_visualizations import (
    plot_nav_vs_twr,
    plot_drawdown_volatility,
    create_attribution_table,
    create_status_badge
)
from config import BASE_DIR

# --- CONFIG ---
st.set_page_config(
    page_title="Performance (GIPS)",
    page_icon="🚀",
    layout="wide",
    initial_sidebar_state="expanded" 
)

# --- CSS / THEME ---
# Imports global theme from .streamlit/config.toml implicitly, 
# but we add specific overrides here if needed.
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'Outfit', sans-serif;
    }
    
    /* Custom Card container */
    .perf-card {
        background: rgba(255, 255, 255, 0.05); /* Light glass */
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 20px;
        backdrop-filter: blur(10px);
    }
    
    h1, h2, h3 { color: #f1f5f9; }
</style>
""", unsafe_allow_html=True)

# --- HELPER FUNCTIONS ---
# Reusing the compatibility wrapper from Investimentos to allow smooth migration
def run_performance_engine_compat(df_input_frozen):
    """
    Wrapper de alto nivel para o motor GIPS (Canonical).
    """
    from dataclasses import dataclass, field
    from typing import List
    
    if not isinstance(df_input_frozen, pd.DataFrame):
        df = pd.DataFrame(df_input_frozen)
    else:
        df = df_input_frozen.copy()
    
    if not isinstance(df.index, pd.DatetimeIndex):
        df.index = pd.to_datetime(df.index)
    
    canonical_result = calculate_canonical_twr(df, DEFAULT_PREMISES)
    
    @dataclass
    class CompatibleResult:
        total_twr: float
        annualized_twr: float
        daily_returns: pd.Series
        cumulative_series: pd.Series
        drawdown_series: pd.Series
        max_drawdown: float
        nav_series: pd.Series
        volatility: float
        total_flow: float
        total_pnl: float
        simple_return_series: pd.Series = None
        validation: object = None
        flow_dates: List[str] = field(default_factory=list)
        period_breakdown: List = field(default_factory=list)
        currency: str = 'BRL'
        is_consolidated: bool = False
    
    # nav_series logic: use true NAV from input
    return CompatibleResult(
        total_twr=canonical_result.total_twr,
        annualized_twr=canonical_result.annualized_twr,
        daily_returns=canonical_result.daily_returns,
        cumulative_series=canonical_result.cumulative_series,
        drawdown_series=canonical_result.drawdown_series,
        max_drawdown=canonical_result.max_drawdown,
        nav_series=df['nav'],
        volatility=canonical_result.volatility,
        total_flow=canonical_result.total_flow,
        total_pnl=canonical_result.total_pnl,
        simple_return_series=None,
        validation=canonical_result.validation,
        flow_dates=[sp.date for sp in canonical_result.sub_periods if abs(sp.flow) > 0.01],
        period_breakdown=canonical_result.sub_periods
    )

# --- MAIN PAGE LOGIC ---

def main():
    col_h1, col_h2 = st.columns([3,1])
    with col_h1:
        st.title("🚀 Análise de Performance")
        st.caption("Rentabilidade Time-Weighted Return (GIPS Compliant)")
    with col_h2:
        if st.button("🏠 Voltar para Home", use_container_width=True):
            st.switch_page("Home.py")

    # 1. LOAD DATA
    with st.spinner("Carregando dados..."):
        df_assets = load_assets()
        df_proventos = load_proventos()
        df_rf_raw = load_fixed_income()
    
    if df_assets.empty and df_rf_raw.empty:
        st.warning("Sem dados de transações para calcular performance.")
        st.stop()

    # 2. FILTERS (SimplifiedSidebar for Performance)
    with st.sidebar:
        st.header("Filtros de Portfolio")
        
        # Filtros de Ativos
        all_tickers = []
        if not df_assets.empty:
            all_tickers += df_assets['ticker'].unique().tolist()
        if not df_rf_raw.empty:
            if 'Ticker' in df_rf_raw.columns:
                all_tickers += df_rf_raw['Ticker'].unique().tolist()
        
        all_tickers = sorted(list(set(all_tickers)))
        
        sel_tickers = st.multiselect("Filtrar Ativos:", all_tickers)
        
        if st.button("🔄 Recalcular", use_container_width=True):
            st.cache_data.clear()
            st.rerun()

    # 3. ENGINE EXECUTION
    # Apply filters
    df_rv_final = df_assets.copy()
    df_rf_final = df_rf_raw.copy()
    
    if sel_tickers:
        if not df_rv_final.empty:
            df_rv_final = df_rv_final[df_rv_final['ticker'].isin(sel_tickers)]
        if not df_rf_final.empty:
            df_rf_final = df_rf_final[df_rf_final['Ticker'].isin(sel_tickers)]

    # Fetch History
    with st.spinner("Sincronizando mercado..."):
        tickers_download = []
        if not df_rv_final.empty:
            tickers_carteira = df_rv_final['ticker'].unique().tolist()
            termos_excluir = ['TESOURO', 'CDB', 'LCI', 'LCA', 'IPCA', 'CAIXA', 'SALDO','CDI']
            tickers_download = [t for t in tickers_carteira if not any(x in t.upper() for x in termos_excluir)]
            tickers_download += ['BRL=X', 'EURBRL=X', 'CADBRL=X'] # Currencies
        
        min_date = datetime.now() - timedelta(days=365*5) # 5 years default
        if not df_rv_final.empty:
            min_date = min(min_date, df_rv_final['data'].min())
        
        df_hist_prices = pd.DataFrame()
        if tickers_download:
            df_hist_prices = fetch_historical_data(list(set(tickers_download)), min_date)

    # Run Engine
    try:
        df_cambio = load_cambio()
        
        # Days lookback: Use max available
        days_lookback = (datetime.now() - min_date).days + 10
        
        multi_result = reconstruct_history_multicurrency(
            df_bruto=df_rv_final,
            df_proventos=df_proventos,
            days_lookback=days_lookback,
            df_prices_external=df_hist_prices,
            df_rf_raw=df_rf_final,
            df_cambio=df_cambio
        )
        
        # Consolidation Logic
        # For simplicity in this v1 of separate page, we default to Consolidated BRL view
        # unless user drills down (future feature)
        from core.consolidator import consolidate_to_brl
        
        if not multi_result.buckets:
            st.warning("Não foi possível reconstruir o histórico com os filtros atuais.")
            st.stop()
            
        consolidated = consolidate_to_brl(multi_result.buckets, multi_result.fx_rates)
        df_engine_input = consolidated.to_engine_input()

        # =====================================================================
        # FIX: Filtrar período para começar apenas quando há patrimônio real
        # Isso evita que o gráfico comece antes das primeiras transações
        # =====================================================================

        # Encontrar primeira data com NAV > 0
        if 'nav' in df_engine_input.columns:
            first_valid_nav = df_engine_input[df_engine_input['nav'] > 0].first_valid_index()
            if first_valid_nav is not None:
                df_engine_input = df_engine_input.loc[first_valid_nav:]

        # Forward-fill NAV para evitar gaps de zero no meio da série
        if 'nav' in df_engine_input.columns:
            # Substituir zeros no meio por forward-fill (mantém último valor conhecido)
            df_engine_input['nav'] = df_engine_input['nav'].replace(0, np.nan).ffill().fillna(0)

        # Calculate TWR
        resultado = run_performance_engine_compat(df_engine_input)
        resultado.currency = 'BRL'
        resultado.is_consolidated = True
        
    except Exception as e:
        st.error(f"Erro no motor de cálculo: {e}")
        st.stop()

    # 4. VISUALIZATION
    # Time Selection
    st.markdown("---")
    
    # Calculate Date Range
    data_max = df_engine_input.index.max()
    data_min_global = df_engine_input.index.min()
    
    c_per, c_ano = st.columns([3, 1])
    with c_per:
        periodos = ["1M", "3M", "6M", "YTD", "1Y", "2Y", "MAX"]
        sel_periodo = st.radio("Período:", periodos, index=6, horizontal=True)
    
    with c_ano:
        anos = sorted(df_engine_input.index.year.unique(), reverse=True)
        sel_ano = st.selectbox("Ano:", ["Todos"] + [str(a) for a in anos])

    # Filter Logic (Date Slicing)
    if sel_ano != "Todos":
        start_date = pd.Timestamp(int(sel_ano), 1, 1)
        end_date = pd.Timestamp(int(sel_ano), 12, 31)
    else:
        end_date = data_max
        if sel_periodo == "1M": start_date = data_max - pd.DateOffset(months=1)
        elif sel_periodo == "3M": start_date = data_max - pd.DateOffset(months=3)
        elif sel_periodo == "6M": start_date = data_max - pd.DateOffset(months=6)
        elif sel_periodo == "YTD": start_date = pd.Timestamp(data_max.year, 1, 1)
        elif sel_periodo == "1Y": start_date = data_max - pd.DateOffset(years=1)
        elif sel_periodo == "2Y": start_date = data_max - pd.DateOffset(years=2)
        else: start_date = data_min_global

    # Apply Slice
    mask = (df_engine_input.index >= start_date) & (df_engine_input.index <= end_date)
    df_slice = df_engine_input[mask]
    
    if df_slice.empty:
        st.error("Período vazio.")
        st.stop()
        
    # Re-run TWR on slice
    res_period = run_performance_engine_compat(df_slice)
    
    # --- METRICS ---
    
    # Calculate MTM Return (Simple ROI)
    # Profit / (Initial + Net Flows)
    nav_inicial = res_period.nav_series.iloc[0] if not res_period.nav_series.empty else 0.0
    total_flow = res_period.total_flow
    total_pnl = res_period.total_pnl
    
    # "Invested Capital" proxy: Initial Capital + Net Flows
    # Note: This is an approximation. For exact ROI, we'd need time-weighted capital base, but "Simple ROI" usually implies this.
    invested_capital = nav_inicial + total_flow
    
    retorno_mtm = 0.0
    if invested_capital > 0:
        retorno_mtm = total_pnl / invested_capital
        
    k1, k2, k3, k4, k5 = st.columns(5)
    with k1: st.metric("TWR Período", f"{res_period.total_twr:.2%}", help="Retorno Ponderado pelo Tempo (Gestão)")
    with k2: st.metric("Retorno MTM", f"{retorno_mtm:.2%}", help="Retorno sobre Capital Investido (ROI Simples)")
    with k3: st.metric("Patrimônio Final", f"R$ {res_period.nav_series.iloc[-1]:,.2f}")
    with k4: st.metric("Drawdown Max", f"{res_period.max_drawdown:.2%}")
    with k5: st.metric("Volatilidade", f"{res_period.volatility:.2%}")
    
    st.markdown("---")
    
    # --- CHARTS ---
    # 1. Evolution (Dual Axis) - VERSÃO OTIMIZADA v2.1
    fig_evol = plot_nav_vs_twr(
        df_slice,
        res_period.cumulative_series,
        df_slice['flow'],
        title=f"Evolução Patrimonial vs Rentabilidade ({sel_periodo})"
    )
    fig_evol.update_layout(template="plotly_dark")
    st.plotly_chart(fig_evol, use_container_width=True)

    # --- STATUS DE VALIDAÇÃO v2.1 ---
    val_result = validate_twr_continuity(df_slice)
    st.markdown(create_status_badge(val_result), unsafe_allow_html=True)
    
    # --- DEBUG: Diagnóstico Completo ---
    with st.expander("🔍 Diagnóstico de Dados e Retornos", expanded=False):
        tab1, tab2, tab3 = st.tabs(["Retornos Extremos", "Variações de NAV", "Dados Brutos"])

        with tab1:
            # Identificar retornos extremos (> 15% ou < -15% em um dia)
            extreme_threshold = 0.15
            daily_rets = res_period.daily_returns
            extreme_days = daily_rets[abs(daily_rets) > extreme_threshold]

            if not extreme_days.empty:
                st.warning(f"⚠️ Encontradas {len(extreme_days)} datas com retornos extremos (>{extreme_threshold:.0%}):")

                # Criar tabela de diagnóstico
                diag_data = []
                for dt, ret in extreme_days.items():
                    nav_val = res_period.nav_series.get(dt, 0)
                    # Buscar sub-período correspondente
                    note = ""
                    for sp in res_period.period_breakdown:
                        if sp.date == str(dt.date()) if hasattr(dt, 'date') else str(dt):
                            note = sp.notes
                            break
                    diag_data.append({
                        'Data': dt.strftime('%Y-%m-%d') if hasattr(dt, 'strftime') else str(dt),
                        'Retorno': f"{ret:.2%}",
                        'NAV': f"R$ {nav_val:,.0f}",
                        'Nota': note
                    })

                st.dataframe(pd.DataFrame(diag_data), use_container_width=True)
                st.info("💡 Retornos extremos geralmente indicam: gaps de preço, splits não ajustados, ou erros de dados.")
            else:
                st.success("✅ Nenhum retorno extremo detectado no período.")

        with tab2:
            # Variações bruscas no NAV
            nav_pct = res_period.nav_series.pct_change()
            large_nav_changes = nav_pct[abs(nav_pct) > 0.20]

            if not large_nav_changes.empty:
                st.warning(f"⚠️ Encontradas {len(large_nav_changes)} variações de NAV > 20%:")

                nav_diag = []
                for dt, pct in large_nav_changes.items():
                    flow_day = df_slice['flow'].get(dt, 0) if 'flow' in df_slice.columns else 0
                    nav_diag.append({
                        'Data': dt.strftime('%Y-%m-%d') if hasattr(dt, 'strftime') else str(dt),
                        'Variação NAV': f"{pct:.2%}",
                        'NAV': f"R$ {res_period.nav_series.get(dt, 0):,.0f}",
                        'Fluxo': f"R$ {flow_day:,.0f}"
                    })

                st.dataframe(pd.DataFrame(nav_diag), use_container_width=True)
            else:
                st.success("✅ Nenhuma variação brusca de NAV detectada.")

        with tab3:
            # Dados brutos do período
            st.write(f"**Período:** {df_slice.index.min().date()} a {df_slice.index.max().date()}")
            st.write(f"**Total de dias:** {len(df_slice)}")
            st.write(f"**NAV inicial:** R$ {df_slice['nav'].iloc[0]:,.2f}")
            st.write(f"**NAV final:** R$ {df_slice['nav'].iloc[-1]:,.2f}")
            st.write(f"**Total de fluxos:** R$ {df_slice['flow'].sum():,.2f}")

            # Dias com fluxo
            days_with_flow = df_slice[df_slice['flow'] != 0]
            st.write(f"**Dias com fluxo:** {len(days_with_flow)}")

            if st.checkbox("Mostrar dados brutos"):
                st.dataframe(df_slice.tail(50), use_container_width=True)

            # Análise detalhada de dias com fluxo
            if st.checkbox("Analisar dias com fluxo (debug TWR)"):
                st.subheader("Verificação da Fórmula TWR em Dias de Aporte")

                df_debug = df_slice.copy()
                df_debug['nav_start'] = df_debug['nav'].shift(1).fillna(0)
                df_debug['economic_gain'] = df_debug['nav'] + df_debug.get('income', 0) - df_debug['nav_start'] - df_debug['flow']
                df_debug['return_calc'] = np.where(
                    df_debug['nav_start'] > 100,
                    df_debug['economic_gain'] / df_debug['nav_start'],
                    0
                )

                # Filtrar dias com fluxo
                flow_days = df_debug[df_debug['flow'] != 0][['nav', 'nav_start', 'flow', 'economic_gain', 'return_calc']]

                if not flow_days.empty:
                    st.dataframe(flow_days.style.format({
                        'nav': 'R$ {:,.0f}',
                        'nav_start': 'R$ {:,.0f}',
                        'flow': 'R$ {:,.0f}',
                        'economic_gain': 'R$ {:,.0f}',
                        'return_calc': '{:.2%}'
                    }), use_container_width=True)

                    # Verificar se há problema
                    problematic = flow_days[abs(flow_days['return_calc']) > 0.05]
                    if not problematic.empty:
                        st.error(f"⚠️ {len(problematic)} dias com aporte têm retorno > 5%!")
                        st.write("**Diagnóstico:** Se o aporte fosse neutro, o retorno deveria ser ~0%.")
                        st.write("Possíveis causas:")
                        st.write("1. NAV não aumentou proporcionalmente ao fluxo")
                        st.write("2. Fluxo e NAV estão em dias diferentes")
                        st.write("3. Preço de transação diferente do preço de mercado")
                    else:
                        st.success("✅ Aportes parecem neutros (retorno < 5% nos dias de fluxo)")
                else:
                    st.info("Nenhum dia com fluxo no período selecionado.")

    # 2. Drawdown + Volatilidade - VERSÃO OTIMIZADA v2.1
    if len(df_slice) > 20:  # Mínimo para rolling window
        fig_risk = plot_drawdown_volatility(
            df_slice,
            res_period.drawdown_series,
            res_period.daily_returns,
            rolling_window=20
        )
        fig_risk.update_layout(template="plotly_dark")
        st.plotly_chart(fig_risk, use_container_width=True)
    else:
        # Fallback para períodos curtos
        fig_dd = go.Figure()
        fig_dd.add_trace(go.Scatter(
            x=res_period.drawdown_series.index,
            y=res_period.drawdown_series * 100,
            fill='tozeroy',
            line=dict(color='#ef4444'),
            name='Drawdown'
        ))
        fig_dd.update_layout(title="Underwater Plot (Drawdown)", template="plotly_dark", yaxis_ticksuffix="%")
        st.plotly_chart(fig_dd, use_container_width=True)

    # --- TABELA DE ATTRIBUTION v2.1 ---
    st.subheader("Attribution Diário")
    if res_period.period_breakdown:
        att_table = create_attribution_table(
            df_slice,
            res_period.period_breakdown,
            max_rows=30
        )
        st.dataframe(att_table, use_container_width=True)
    else:
        st.info("Sem dados de attribution disponíveis.")

    # --- DIAGNÓSTICO RF ---
    with st.expander("📊 Diagnóstico de Renda Fixa (RF)", expanded=False):
        st.subheader("Verificação de Integração RF")

        if df_rf_raw.empty:
            st.warning("❌ Sem dados de Renda Fixa carregados. Verifique a aba 'Renda_Fixa' na planilha.")
        else:
            st.success(f"✅ {len(df_rf_raw)} eventos de RF carregados")

            # Mostrar eventos brutos
            st.write("**Eventos RF brutos:**")
            st.dataframe(df_rf_raw.head(10), use_container_width=True)

            # Tentar calcular curva RF
            try:
                from core.fixed_income_engine import FixedIncomeEngine

                rf_engine = FixedIncomeEngine(df_rf_raw)
                rf_result = rf_engine.build_daily_curve()

                col1, col2, col3 = st.columns(3)
                with col1:
                    st.metric("Eventos Processados", len(rf_engine.events))
                with col2:
                    st.metric("Posições Fechadas", len(rf_engine.closed_positions))
                with col3:
                    st.metric("Posições Abertas", len(rf_engine.open_positions_data))

                st.write(f"**Fluxos Externos (para TWR):** {len(rf_result.external_flows)}")

                if rf_result.external_flows:
                    flows_data = []
                    for f in rf_result.external_flows:
                        flows_data.append({
                            'Data': f.date.strftime('%Y-%m-%d') if hasattr(f.date, 'strftime') else str(f.date),
                            'Tipo': f.flow_type,
                            'Valor': f"R$ {f.amount:,.2f}",
                            'Ticker': f.ticker
                        })
                    st.dataframe(pd.DataFrame(flows_data), use_container_width=True)

                if not rf_result.daily_curve.empty:
                    st.write("**Curva RF (últimos 10 dias):**")
                    st.dataframe(rf_result.daily_curve.tail(10), use_container_width=True)

                    st.write(f"**Valor Atual RF:** R$ {rf_result.current_value:,.2f}")
                    st.write(f"**Retorno RF:** {rf_result.total_return_pct:.2f}%")
                    st.write(f"**Hipótese:** {rf_result.hypothesis_note}")

                    # Plotar curva RF
                    fig_rf = go.Figure()
                    fig_rf.add_trace(go.Scatter(
                        x=rf_result.daily_curve.index,
                        y=rf_result.daily_curve['total'],
                        name="Patrimônio RF",
                        line=dict(color='#10b981', width=2)
                    ))
                    fig_rf.update_layout(
                        title="Evolução Patrimônio Renda Fixa",
                        template="plotly_dark",
                        yaxis_tickprefix="R$ "
                    )
                    st.plotly_chart(fig_rf, use_container_width=True)
                else:
                    st.warning("Curva RF vazia após processamento")

            except Exception as e:
                st.error(f"Erro ao processar RF: {e}")
                import traceback
                st.code(traceback.format_exc())

        # Verificar se RF foi integrado ao consolidado
        st.markdown("---")
        st.subheader("Verificação de Integração no Consolidado")

        if 'BRL' in multi_result.buckets:
            brl_bucket = multi_result.buckets['BRL']
            st.write(f"**Tickers no bucket BRL:** {brl_bucket.tickers}")

            if 'RF_AGGREGATED' in brl_bucket.tickers:
                st.success("✅ RF está integrado ao bucket BRL")
            else:
                st.warning("⚠️ RF_AGGREGATED não encontrado no bucket BRL")

            st.write(f"**NAV final BRL:** R$ {brl_bucket.nav_series.iloc[-1]:,.2f}")
            st.write(f"**Total flows BRL:** R$ {brl_bucket.flow_series.sum():,.2f}")
        else:
            st.warning("❌ Bucket BRL não encontrado")

if __name__ == "__main__":
    main()

"""
Módulo de Visualizações Otimizadas para TWR
=============================================

Fornece funções para criar gráficos melhorados de:
1. Evolução Patrimonial vs Rentabilidade
2. Retornos Diários com Heatmap
3. Drawdown + Volatilidade Rolling
4. Attribution Table

Data: 2026-01-29
"""

import pandas as pd
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import streamlit as st
from typing import Optional, Tuple


# =============================================================================
# GRÁFICO 1: EVOLUÇÃO PATRIMONIAL VS RENTABILIDADE
# =============================================================================

def plot_nav_vs_twr(
    df: pd.DataFrame,
    twr_series: pd.Series,
    flow_series: pd.Series,
    title: str = "Evolução Patrimonial vs Rentabilidade"
) -> go.Figure:
    """
    Cria gráfico dual-axis de NAV (esquerda, R$) vs TWR (direita, %).
    
    Args:
        df: DataFrame com coluna 'nav'
        twr_series: Série de TWR acumulado
        flow_series: Série de fluxos (para anotações)
        title: Título do gráfico
        
    Returns:
        go.Figure (Plotly)
    """
    
    fig = make_subplots(specs=[[{"secondary_y": True}]])
    
    # Série 1: NAV (esquerda)
    fig.add_trace(
        go.Scatter(
            x=df.index,
            y=df['nav'],
            name='Patrimônio (R$)',
            mode='lines',
            fill='tozeroy',
            line=dict(color='#1f77b4', width=2),
            fillcolor='rgba(31, 119, 180, 0.1)',
            hovertemplate='<b>Data:</b> %{x|%d/%m/%Y}<br>' +
                         '<b>Patrimônio:</b> R$ %{y:,.2f}<extra></extra>'
        ),
        secondary_y=False,
    )
    
    # Série 2: TWR (direita)
    fig.add_trace(
        go.Scatter(
            x=twr_series.index,
            y=twr_series * 100,  # Converter para percentual
            name='TWR Acumulado (%)',
            mode='lines+markers',
            line=dict(color='#2ca02c', width=2),
            marker=dict(size=4),
            hovertemplate='<b>Data:</b> %{x|%d/%m/%Y}<br>' +
                         '<b>TWR:</b> %{y:.2f}%<extra></extra>'
        ),
        secondary_y=True,
    )
    
    # Adicionar anotações de fluxos significativos
    large_flows = flow_series[abs(flow_series) > flow_series.abs().quantile(0.75)]
    for date, flow_value in large_flows.items():
        color = '#d62728' if flow_value < 0 else '#ff7f0e'  # Vermelho (saque), Laranja (aporte)
        symbol = '▼' if flow_value < 0 else '▲'
        
        fig.add_annotation(
            x=date,
            y=df.loc[date, 'nav'] if date in df.index else None,
            text=f'{symbol}<br>R$ {abs(flow_value):,.0f}',
            showarrow=True,
            arrowhead=2,
            arrowcolor=color,
            arrowsize=1,
            font=dict(size=8, color=color),
            yshift=20,
            xshift=0,
            secondary_y=False
        )
    
    # Layout
    fig.update_xaxes(title_text='Data', showgrid=True, gridwidth=1, gridcolor='rgba(128,128,128,0.2)')
    fig.update_yaxes(title_text='Patrimônio (R$)', secondary_y=False, tickformat='$,.0f')
    fig.update_yaxes(title_text='TWR Acumulado (%)', secondary_y=True, tickformat='.1f%')
    
    fig.update_layout(
        title=title,
        hovermode='x unified',
        plot_bgcolor='rgba(240,240,240,0.5)',
        height=500,
        font=dict(family='Arial, sans-serif', size=10),
        legend=dict(x=0.01, y=0.99, bgcolor='rgba(255,255,255,0.8)'),
        margin=dict(l=80, r=80, t=60, b=60)
    )
    
    return fig


# =============================================================================
# GRÁFICO 2: RETORNOS DIÁRIOS COMO HEATMAP
# =============================================================================

def plot_returns_heatmap(
    daily_returns: pd.Series,
    period_name: str = "Retornos Diários"
) -> go.Figure:
    """
    Cria heatmap de retornos diários.
    
    Positivos em verde, negativos em vermelho.
    Intensidade proporcional ao valor.
    
    Args:
        daily_returns: Série de retornos diários
        period_name: Nome do período
        
    Returns:
        go.Figure (Plotly)
    """
    
    # Criar matriz de 52 semanas x 7 dias (année visão)
    df_returns = daily_returns.copy()
    df_returns.index = pd.to_datetime(df_returns.index)
    
    # Resampling por semana
    weekly_returns = df_returns.resample('W').mean()
    
    # Mapear para array 2D (ano x semana)
    dates = df_returns.index
    years = sorted(dates.year.unique())
    
    fig = go.Figure()
    
    # Cada ano como uma série
    for year in years[-3:]:  # Mostrar últimos 3 anos
        df_year = df_returns[df_returns.index.year == year]
        
        # Converter para valores de 1-52 (semana do ano)
        week_of_year = df_year.index.isocalendar().week
        day_of_week = df_year.index.dayofweek
        
        fig.add_trace(
            go.Scatter(
                x=df_year.index,
                y=df_year * 100,  # Percentual
                name=f'{year}',
                mode='markers',
                marker=dict(
                    size=8,
                    color=df_year * 100,
                    colorscale='RdYlGn',
                    cmid=0,
                    showscale=(year == years[-1]),
                    colorbar=dict(title='Retorno %'),
                    line=dict(width=0.5, color='white')
                ),
                hovertemplate='<b>%{x|%d/%m/%Y}</b><br>' +
                             'Retorno: %{y:.2f}%<extra></extra>'
            )
        )
    
    fig.update_layout(
        title=period_name,
        xaxis_title='Data',
        yaxis_title='Retorno Diário (%)',
        hovermode='closest',
        height=300,
        plot_bgcolor='rgba(240,240,240,0.5)',
        margin=dict(l=60, r=60, t=60, b=60)
    )
    
    return fig


# =============================================================================
# GRÁFICO 3: DRAWDOWN + VOLATILIDADE ROLLING
# =============================================================================

def plot_drawdown_volatility(
    df: pd.DataFrame,
    drawdown_series: pd.Series,
    daily_returns: pd.Series,
    rolling_window: int = 20
) -> go.Figure:
    """
    Cria gráfico com:
    - Drawdown como área preenchida
    - Volatilidade rolling como linha
    
    Args:
        df: DataFrame com série de dados
        drawdown_series: Série de drawdown (%)
        daily_returns: Série de retornos diários
        rolling_window: Janela para volatilidade rolling (dias)
        
    Returns:
        go.Figure (Plotly)
    """
    
    # Volatilidade rolling
    vol_rolling = daily_returns.rolling(window=rolling_window).std() * np.sqrt(252) * 100
    
    fig = make_subplots(specs=[[{"secondary_y": False}]])
    
    # Drawdown (área)
    fig.add_trace(
        go.Scatter(
            x=drawdown_series.index,
            y=drawdown_series * 100,
            name='Drawdown',
            mode='lines',
            fill='tozeroy',
            line=dict(color='#d62728', width=1),
            fillcolor='rgba(214, 39, 40, 0.3)',
            hovertemplate='<b>Data:</b> %{x|%d/%m/%Y}<br>' +
                         '<b>Drawdown:</b> %{y:.2f}%<extra></extra>'
        )
    )
    
    # Volatilidade rolling (linha)
    fig.add_trace(
        go.Scatter(
            x=vol_rolling.index,
            y=vol_rolling,
            name=f'Volatilidade {rolling_window}d (anual)',
            mode='lines',
            line=dict(color='#ff7f0e', width=2),
            hovertemplate='<b>Data:</b> %{x|%d/%m/%Y}<br>' +
                         '<b>Volatilidade:</b> %{y:.2f}%<extra></extra>'
        )
    )
    
    fig.update_xaxes(title_text='Data', showgrid=True, gridwidth=1, gridcolor='rgba(128,128,128,0.2)')
    fig.update_yaxes(title_text='Drawdown / Volatilidade (%)', tickformat='.1f%')
    
    fig.update_layout(
        title='Drawdown vs Volatilidade',
        hovermode='x unified',
        plot_bgcolor='rgba(240,240,240,0.5)',
        height=400,
        margin=dict(l=80, r=60, t=60, b=60)
    )
    
    return fig


# =============================================================================
# TABELA: ATTRIBUTION DIÁRIO
# =============================================================================

def create_attribution_table(
    df: pd.DataFrame,
    sub_periods: list,
    max_rows: int = 50
) -> pd.DataFrame:
    """
    Cria tabela de attribution com detalhamento diário.
    
    Colunas:
    - Data
    - NAV Início
    - NAV Fim
    - Retorno %
    - Ganho R$
    - Fluxo R$
    - Notas
    
    Args:
        df: DataFrame com dados diários
        sub_periods: Lista de TWRSubPeriod
        max_rows: Máximo de linhas a exibir
        
    Returns:
        pd.DataFrame formatado
    """
    
    rows = []
    
    for period in sub_periods[-max_rows:]:  # Últimos N dias
        rows.append({
            'Data': period.date,
            'NAV Início (R$)': f"R$ {period.nav_start:,.2f}",
            'NAV Fim (R$)': f"R$ {period.nav_end:,.2f}",
            'Retorno (%)': f"{period.daily_return:.4%}",
            'Ganho (R$)': f"R$ {period.economic_gain:,.2f}",
            'Fluxo (R$)': f"R$ {period.flow:,.2f}",
            'Status': '✓' if period.daily_return >= 0 else '✗'
        })
    
    return pd.DataFrame(rows)


# =============================================================================
# STATUS BADGE COM DIAGNOSTICO
# =============================================================================

def create_status_badge(
    validation_result: dict,
    gap_report=None
) -> str:
    """
    Cria HTML badge de status com informações de validação.
    
    Args:
        validation_result: Dict com chave 'is_valid'
        gap_report: GapHealingReport (opcional)
        
    Returns:
        HTML string para st.markdown()
    """
    
    is_valid = validation_result.get('is_valid', False)
    issues = validation_result.get('issues', [])
    
    status_icon = "✅" if is_valid else "⚠️"
    status_color = "#10B981" if is_valid else "#F59E0B"
    status_text = "Dados válidos" if is_valid else "Anomalias detectadas"
    
    html = f"""
    <div style="
        background: {status_color}15;
        border-left: 4px solid {status_color};
        padding: 12px;
        border-radius: 6px;
        margin: 10px 0;
        font-family: monospace;
    ">
        <p style="margin: 0; font-weight: bold; color: {status_color};">
            {status_icon} {status_text}
        </p>
    """
    
    if gap_report:
        html += f"<p style='margin: 5px 0; font-size: 12px;'>Gaps corrigidos: {gap_report.gaps_healed}/{gap_report.total_gaps}</p>"
    
    if issues:
        html += f"<p style='margin: 5px 0; font-size: 12px;'>Issues: {len(issues)}</p>"
        for issue in issues[:2]:
            html += f"<p style='margin: 2px 0; font-size: 11px; color: #666;'>• {issue}</p>"
    
    html += "</div>"
    
    return html


if __name__ == "__main__":
    # Teste das visualizações
    print("[TWR Visualizations] Teste de funções")
    
    # Criar dados de teste
    dates = pd.date_range('2025-01-01', periods=100, freq='D')
    df_test = pd.DataFrame({
        'nav': np.linspace(100000, 120000, 100) + np.random.randn(100) * 1000
    }, index=dates)
    
    twr_test = pd.Series(
        np.linspace(0, 0.20, 100) + np.random.randn(100) * 0.01,
        index=dates
    )
    
    flow_test = pd.Series(0, index=dates)
    flow_test.iloc[20] = 10000
    flow_test.iloc[50] = -5000
    
    print(f"✓ Dados de teste criados: {len(df_test)} dias")


import pandas as pd
import numpy as np
import plotly.graph_objects as go
import plotly.express as px
from datetime import datetime

def plot_nav_vs_twr(df_full, cumulative_twr, flow_series, title="Evolução Patrimonial"):
    """
    Gera gráfico de dois eixos: NAV (Esq) vs TWR Acumulado (Dir).
    """
    fig = go.Figure()

    # 1. NAV (Eixo Primário) - Área preenchida
    fig.add_trace(go.Scatter(
        x=df_full.index,
        y=df_full['nav'],
        name="Patrimônio (R$)",
        fill='tozeroy',
        line=dict(color='#6366f1', width=2),
        fillcolor='rgba(99, 102, 241, 0.08)',
        hovertemplate='Data: %{x|%d/%m/%Y}<br>Patrimônio: R$ %{y:,.2f}<extra></extra>',
        yaxis='y'
    ))

    # 2. TWR Acumulado (Eixo Secundário) - Linha sólida
    fig.add_trace(go.Scatter(
        x=cumulative_twr.index,
        y=cumulative_twr * 100,
        name="Rentabilidade (%)",
        line=dict(color='#10b981', width=3),
        hovertemplate='Data: %{x|%d/%m/%Y}<br>TWR: %{y:.2f}%<extra></extra>',
        yaxis='y2'
    ))

    # 3. Marks para fluxos (opcional, se houver muitos ruídos)
    df_flows = df_full[abs(df_full['flow']) > 100] # Mostrar apenas fluxos relevantes
    if not df_flows.empty:
        fig.add_trace(go.Scatter(
            x=df_flows.index,
            y=df_flows['nav'],
            mode='markers',
            name="Aporte/Retirada",
            marker=dict(
                symbol='triangle-up', 
                size=8, 
                color='#f59e0b',
                line=dict(width=1, color='white')
            ),
            hovertemplate='Fluxo: R$ %{text:,.2f}<extra></extra>',
            text=df_flows['flow'],
            yaxis='y'
        ))

    fig.update_layout(
        title=title,
        template="plotly_dark",
        hovermode='x unified',
        margin=dict(t=40, b=40, l=60, r=60),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        yaxis=dict(
            title="Patrimônio (BRL)",
            gridcolor='rgba(255, 255, 255, 0.05)',
            showgrid=True,
            zeroline=False
        ),
        yaxis2=dict(
            title="Rentabilidade (%)",
            overlaying='y',
            side='right',
            showgrid=False,
            zeroline=False,
            ticksuffix="%"
        ),
        xaxis=dict(
            gridcolor='rgba(255, 255, 255, 0.05)',
            showgrid=True
        )
    )

    return fig

def plot_drawdown_volatility(df_slice, drawdown_series, daily_returns, rolling_window=20):
    """
    Gera gráfico de Risco: Drawdown (Esq) vs Volatilidade Rolling (Dir).
    """
    # Calcular Volatilidade Rolling (Anualizada)
    rolling_vol = daily_returns.rolling(window=rolling_window).std() * np.sqrt(252)

    fig = go.Figure()

    # 1. Drawdown (Eixo Primário)
    fig.add_trace(go.Scatter(
        x=drawdown_series.index,
        y=drawdown_series * 100,
        name="Drawdown",
        fill='tozeroy',
        line=dict(color='#ef4444', width=1.5),
        fillcolor='rgba(239, 68, 68, 0.1)',
        hovertemplate='Drawdown: %{y:.2f}%<extra></extra>',
        yaxis='y'
    ))

    # 2. Volatilidade (Eixo Secundário)
    fig.add_trace(go.Scatter(
        x=rolling_vol.index,
        y=rolling_vol * 100,
        name=f"Volatilidade ({rolling_window}d)",
        line=dict(color='#eab308', width=2, dash='dot'),
        hovertemplate='Volatilidade: %{y:.2f}%<extra></extra>',
        yaxis='y2'
    ))

    fig.update_layout(
        template="plotly_dark",
        hovermode='x unified',
        margin=dict(t=20, b=40, l=60, r=60),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        yaxis=dict(
            title="Queda do Pico (%)",
            gridcolor='rgba(255, 255, 255, 0.05)',
            showgrid=True,
            zeroline=False,
            ticksuffix="%"
        ),
        yaxis2=dict(
            title="Volatilidade (%)",
            overlaying='y',
            side='right',
            showgrid=False,
            zeroline=False,
            ticksuffix="%"
        ),
        xaxis=dict(gridcolor='rgba(255, 255, 255, 0.05)', showgrid=True),
        height=350
    )

    return fig

def create_attribution_table(df_slice, sub_periods, max_rows=30):
    """
    Formata sub-períodos TWR em uma tabela legível de attribution.
    """
    data_list = []
    
    # Pegar os últimos sub-períodos
    for sp in sub_periods[-max_rows:]:
        data_list.append({
            'Data': sp.date,
            'NAV Final': f"R$ {sp.nav_end:,.0f}",
            'Fluxo': f"R$ {sp.flow:,.0f}" if abs(sp.flow) > 0.01 else "—",
            'Ganho Econ.': f"R$ {sp.economic_gain:,.0f}",
            'Mtd (%)': f"{sp.daily_return:+.2%}",
            'Notas': sp.notes if sp.notes else "—"
        })
    
    df_att = pd.DataFrame(data_list)
    # Inverter para mostrar os mais recentes primeiro
    return df_att.iloc[::-1]

def create_status_badge(label, status="info"):
    """
    Cria um badge HTML estilizado para o painel.
    """
    colors = {
        "success": ("#10b981", "#d1fae5"),
        "warning": ("#f59e0b", "#fef3c7"),
        "danger": ("#ef4444", "#fee2e2"),
        "info": ("#3b82f6", "#dbeafe")
    }
    
    fg, bg = colors.get(status, colors["info"])
    
    return f"""
    <span style="
        background-color: {bg};
        color: {fg};
        padding: 4px 10px;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        border: 1px solid {fg}44;
    ">
        {label}
    </span>
    """


import pandas as pd
import numpy as np
import plotly.graph_objects as go
import plotly.express as px
from datetime import datetime

# ═══════════════════════════════════════════════════════════════════════════════
# PREMIUM CHART VISUALIZATIONS v2.0
# Professional, glassmorphism-inspired financial charts
# ═══════════════════════════════════════════════════════════════════════════════

# Color Palette - Premium Dark Theme
COLORS = {
    'primary': '#818cf8',        # Indigo-400 (main accent)
    'primary_dark': '#4f46e5',   # Indigo-600
    'success': '#34d399',        # Emerald-400
    'success_dark': '#10b981',   # Emerald-500
    'danger': '#f87171',         # Red-400
    'danger_dark': '#ef4444',    # Red-500
    'warning': '#fbbf24',        # Amber-400
    'warning_dark': '#f59e0b',   # Amber-500
    'text': '#e2e8f0',           # Slate-200
    'text_muted': '#94a3b8',     # Slate-400
    'grid': 'rgba(148, 163, 184, 0.08)',  # Subtle grid
    'grid_major': 'rgba(148, 163, 184, 0.15)',
}


def plot_nav_vs_twr(df_full, cumulative_twr, flow_series, title="Evolução Patrimonial"):
    """
    Premium dual-axis chart: NAV (Left) vs Cumulative TWR (Right).
    Enhanced with gradient fills, glow effects, and professional styling.
    """
    fig = go.Figure()

    # ─────────────────────────────────────────────────────────────────────────
    # 1. NAV AREA CHART (Primary Axis) - Gradient Fill with Glow
    # ─────────────────────────────────────────────────────────────────────────
    
    # Add a subtle glow layer underneath
    fig.add_trace(go.Scatter(
        x=df_full.index,
        y=df_full['nav'],
        name="_glow",
        showlegend=False,
        fill='tozeroy',
        line=dict(color='rgba(129, 140, 248, 0)', width=0),
        fillcolor='rgba(129, 140, 248, 0.03)',
        hoverinfo='skip',
        yaxis='y'
    ))
    
    # Main NAV area with gradient-like fill
    fig.add_trace(go.Scatter(
        x=df_full.index,
        y=df_full['nav'],
        name="Patrimônio",
        fill='tozeroy',
        line=dict(
            color=COLORS['primary'],
            width=2.5,
            shape='spline',
            smoothing=0.8
        ),
        fillcolor='rgba(129, 140, 248, 0.12)',
        hovertemplate=(
            '<b style="color: #818cf8;">Patrimônio</b><br>'
            '<span style="color: #94a3b8;">%{x|%d %b %Y}</span><br>'
            '<b>R$ %{y:,.0f}</b>'
            '<extra></extra>'
        ),
        yaxis='y'
    ))

    # ─────────────────────────────────────────────────────────────────────────
    # 2. TWR LINE (Secondary Axis) - Sleek gradient line
    # ─────────────────────────────────────────────────────────────────────────
    
    twr_values = cumulative_twr * 100
    
    # Determine color based on final value
    twr_color = COLORS['success'] if twr_values.iloc[-1] >= 0 else COLORS['danger']
    
    fig.add_trace(go.Scatter(
        x=cumulative_twr.index,
        y=twr_values,
        name="Rentabilidade",
        line=dict(
            color=twr_color,
            width=3,
            shape='spline',
            smoothing=0.6
        ),
        hovertemplate=(
            '<b style="color: #34d399;">Rentabilidade</b><br>'
            '<span style="color: #94a3b8;">%{x|%d %b %Y}</span><br>'
            '<b>%{y:+.2f}%</b>'
            '<extra></extra>'
        ),
        yaxis='y2'
    ))

    # ─────────────────────────────────────────────────────────────────────────
    # 3. FLOW MARKERS - Elegant markers for contributions/withdrawals
    # ─────────────────────────────────────────────────────────────────────────
    
    # Filter significant flows only
    df_flows = df_full[abs(df_full['flow']) > 500].copy()
    
    if not df_flows.empty:
        # Positive flows (contributions)
        df_positive = df_flows[df_flows['flow'] > 0]
        if not df_positive.empty:
            fig.add_trace(go.Scatter(
                x=df_positive.index,
                y=df_positive['nav'],
                mode='markers',
                name="Aporte",
                marker=dict(
                    symbol='triangle-up',
                    size=10,
                    color=COLORS['success'],
                    line=dict(width=1.5, color='rgba(255,255,255,0.8)')
                ),
                hovertemplate=(
                    '<b style="color: #34d399;">⬆ Aporte</b><br>'
                    '<span style="color: #94a3b8;">%{x|%d %b %Y}</span><br>'
                    '<b>R$ %{text:,.0f}</b>'
                    '<extra></extra>'
                ),
                text=df_positive['flow'],
                yaxis='y'
            ))
        
        # Negative flows (withdrawals)
        df_negative = df_flows[df_flows['flow'] < 0]
        if not df_negative.empty:
            fig.add_trace(go.Scatter(
                x=df_negative.index,
                y=df_negative['nav'],
                mode='markers',
                name="Retirada",
                marker=dict(
                    symbol='triangle-down',
                    size=10,
                    color=COLORS['danger'],
                    line=dict(width=1.5, color='rgba(255,255,255,0.8)')
                ),
                hovertemplate=(
                    '<b style="color: #f87171;">⬇ Retirada</b><br>'
                    '<span style="color: #94a3b8;">%{x|%d %b %Y}</span><br>'
                    '<b>R$ %{text:,.0f}</b>'
                    '<extra></extra>'
                ),
                text=abs(df_negative['flow']),
                yaxis='y'
            ))

    # ─────────────────────────────────────────────────────────────────────────
    # 4. ANNOTATIONS - Key milestones
    # ─────────────────────────────────────────────────────────────────────────
    
    # Add final value annotation
    final_nav = df_full['nav'].iloc[-1]
    final_twr = twr_values.iloc[-1]
    
    fig.add_annotation(
        x=df_full.index[-1],
        y=final_nav,
        text=f"R$ {final_nav:,.0f}",
        showarrow=False,
        yshift=25,
        font=dict(color=COLORS['text'], size=11, weight='bold'),
        bgcolor='rgba(30, 41, 59, 0.9)',
        bordercolor=COLORS['primary'],
        borderwidth=1,
        borderpad=6,
        yref='y'
    )

    # ─────────────────────────────────────────────────────────────────────────
    # 5. LAYOUT - Premium dark theme styling
    # ─────────────────────────────────────────────────────────────────────────
    
    fig.update_layout(
        template="plotly_dark",
        hovermode='x unified',
        hoverlabel=dict(
            bgcolor='rgba(30, 41, 59, 0.95)',
            bordercolor='rgba(148, 163, 184, 0.2)',
            font=dict(family='Outfit, sans-serif', size=12, color=COLORS['text']),
            align='left'
        ),
        margin=dict(t=20, b=20, l=10, r=10),
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1,
            bgcolor='rgba(0,0,0,0)',
            font=dict(size=10, color=COLORS['text_muted'])
        ),
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        font=dict(family='Outfit, sans-serif'),
        yaxis=dict(
            title=dict(text="Patrimônio", font=dict(size=10, color=COLORS['text_muted'])),
            gridcolor=COLORS['grid'],
            griddash='dot',
            showgrid=True,
            zeroline=False,
            tickfont=dict(size=10, color=COLORS['text_muted']),
            tickprefix="R$ ",
            tickformat=".2s",  # Simplified format: 1.5M, 150k
            side='left',
            automargin=True
        ),
        yaxis2=dict(
            title=dict(text="Rentabilidade", font=dict(size=10, color=COLORS['text_muted'])),
            overlaying='y',
            side='right',
            showgrid=False,
            zeroline=True,
            zerolinecolor=COLORS['grid_major'],
            zerolinewidth=1,
            tickfont=dict(size=10, color=COLORS['text_muted']),
            ticksuffix="%",
            automargin=True
        ),
        xaxis=dict(
            gridcolor=COLORS['grid'],
            griddash='dot',
            showgrid=True,
            tickfont=dict(size=10, color=COLORS['text_muted']),
            tickformat="%b'%y",  # Shorter date format: Jan'24
            dtick="M3",
            rangeslider=dict(visible=False),
            automargin=True
        ),
        height=420
    )

    return fig


def plot_drawdown_volatility(df_slice, drawdown_series, daily_returns, rolling_window=21):
    """
    Premium risk analysis chart: Drawdown (Left) vs Rolling Volatility (Right).
    Enhanced with gradient fills and professional styling.
    """
    # Calculate Rolling Volatility (Annualized)
    rolling_vol = daily_returns.rolling(window=rolling_window).std() * np.sqrt(252)

    fig = go.Figure()

    # ─────────────────────────────────────────────────────────────────────────
    # 1. DRAWDOWN AREA (Primary Axis) - Red gradient fill
    # ─────────────────────────────────────────────────────────────────────────
    
    dd_values = drawdown_series * 100
    
    # Glow layer
    fig.add_trace(go.Scatter(
        x=drawdown_series.index,
        y=dd_values,
        name="_dd_glow",
        showlegend=False,
        fill='tozeroy',
        line=dict(color='rgba(239, 68, 68, 0)', width=0),
        fillcolor='rgba(239, 68, 68, 0.03)',
        hoverinfo='skip',
        yaxis='y'
    ))
    
    # Main drawdown area
    fig.add_trace(go.Scatter(
        x=drawdown_series.index,
        y=dd_values,
        name="Drawdown",
        fill='tozeroy',
        line=dict(
            color=COLORS['danger'],
            width=1.5,
            shape='spline',
            smoothing=0.5
        ),
        fillcolor='rgba(248, 113, 113, 0.15)',
        hovertemplate=(
            '<b style="color: #f87171;">Drawdown</b><br>'
            '<span style="color: #94a3b8;">%{x|%d %b %Y}</span><br>'
            '<b>%{y:.2f}%</b>'
            '<extra></extra>'
        ),
        yaxis='y'
    ))

    # ─────────────────────────────────────────────────────────────────────────
    # 2. VOLATILITY LINE (Secondary Axis) - Amber dashed line
    # ─────────────────────────────────────────────────────────────────────────
    
    vol_values = rolling_vol * 100
    
    fig.add_trace(go.Scatter(
        x=rolling_vol.index,
        y=vol_values,
        name=f"Volatilidade ({rolling_window}d)",
        line=dict(
            color=COLORS['warning'],
            width=2,
            dash='dot',
            shape='spline',
            smoothing=0.6
        ),
        hovertemplate=(
            '<b style="color: #fbbf24;">Volatilidade</b><br>'
            '<span style="color: #94a3b8;">%{x|%d %b %Y}</span><br>'
            '<b>%{y:.1f}% a.a.</b>'
            '<extra></extra>'
        ),
        yaxis='y2'
    ))

    # ─────────────────────────────────────────────────────────────────────────
    # 3. MAX DRAWDOWN MARKER
    # ─────────────────────────────────────────────────────────────────────────
    
    min_dd_idx = drawdown_series.idxmin()
    min_dd_val = drawdown_series.min() * 100
    
    fig.add_trace(go.Scatter(
        x=[min_dd_idx],
        y=[min_dd_val],
        mode='markers+text',
        name="Max DD",
        marker=dict(
            symbol='x',
            size=12,
            color=COLORS['danger'],
            line=dict(width=2, color='white')
        ),
        text=[f"{min_dd_val:.1f}%"],
        textposition="bottom center",
        textfont=dict(size=10, color=COLORS['danger']),
        hovertemplate=(
            '<b style="color: #ef4444;">📉 Max Drawdown</b><br>'
            '<span style="color: #94a3b8;">%{x|%d %b %Y}</span><br>'
            '<b>%{y:.2f}%</b>'
            '<extra></extra>'
        ),
        yaxis='y'
    ))

    # ─────────────────────────────────────────────────────────────────────────
    # 4. LAYOUT - Premium styling
    # ─────────────────────────────────────────────────────────────────────────
    
    fig.update_layout(
        template="plotly_dark",
        hovermode='x unified',
        hoverlabel=dict(
            bgcolor='rgba(30, 41, 59, 0.95)',
            bordercolor='rgba(148, 163, 184, 0.2)',
            font=dict(family='Outfit, sans-serif', size=12, color=COLORS['text']),
            align='left'
        ),
        margin=dict(t=20, b=20, l=10, r=10),
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1,
            bgcolor='rgba(0,0,0,0)',
            font=dict(size=10, color=COLORS['text_muted'])
        ),
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        font=dict(family='Outfit, sans-serif'),
        yaxis=dict(
            title=dict(text="Drawdown", font=dict(size=10, color=COLORS['text_muted'])),
            gridcolor=COLORS['grid'],
            griddash='dot',
            showgrid=True,
            zeroline=True,
            zerolinecolor=COLORS['grid_major'],
            zerolinewidth=1,
            tickfont=dict(size=10, color=COLORS['text_muted']),
            ticksuffix="%",
            range=[min(dd_values.min() * 1.2, -5), 2],  # Dynamic range with some padding
            automargin=True
        ),
        yaxis2=dict(
            title=dict(text="Volatilidade (a.a.)", font=dict(size=10, color=COLORS['text_muted'])),
            overlaying='y',
            side='right',
            showgrid=False,
            zeroline=False,
            tickfont=dict(size=10, color=COLORS['text_muted']),
            ticksuffix="%",
            automargin=True
        ),
        xaxis=dict(
            gridcolor=COLORS['grid'],
            griddash='dot',
            showgrid=True,
            tickfont=dict(size=10, color=COLORS['text_muted']),
            tickformat="%b'%y",  # Shorter date format
            dtick="M3",
            automargin=True
        ),
        height=320
    )

    return fig


def create_attribution_table(df_slice, sub_periods, max_rows=30):
    """
    Formats sub-periods into a readable attribution table.
    """
    data_list = []
    
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
    return df_att.iloc[::-1]


def create_status_badge(label, status="info"):
    """
    Creates a styled HTML badge.
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

import streamlit as st
import pandas as pd
from core.auth import require_auth
from core.data.provider import DataProvider
from core.utils import parse_decimal_br
from core.theme import inject_global_theme, render_page_header, render_back_button, COLORS
from core.ui import render_fab

# --- AUTH CHECK ---
require_auth()

# --- PAGE CONFIG ---
st.set_page_config(
    page_title="Histórico Patrimonial",
    page_icon="🏛️",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- APPLY GLOBAL THEME ---
inject_global_theme()

# --- PAGE-SPECIFIC STYLES ---
C = COLORS
st.markdown(f"""
<style>
    /* ═══ SUMMARY CARDS ═══ */
    .summary-row {{
        display: flex;
        gap: 16px;
        margin-bottom: 32px;
        flex-wrap: wrap;
    }}

    .summary-card {{
        flex: 1;
        min-width: 200px;
        background: {C['card_bg']};
        backdrop-filter: blur(16px);
        border: 1px solid {C['border']};
        border-radius: 16px;
        padding: 20px 24px;
        text-align: center;
    }}

    .summary-label {{
        font-size: 0.8rem;
        color: {C['text_muted']};
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
    }}

    .summary-value {{
        font-size: 1.8rem;
        font-weight: 700;
        color: {C['text_primary']};
    }}

    .summary-value.positive {{ color: {C['positive']}; }}
    .summary-value.accent {{ color: {C['accent']}; }}

    /* ═══ HISTORY TABLE ═══ */
    .history-table {{
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        background: {C['card_bg']};
        backdrop-filter: blur(16px);
        border: 1px solid {C['border']};
        border-radius: 16px;
        overflow: hidden;
    }}

    .history-table thead {{
        background: rgba(99, 102, 241, 0.1);
    }}

    .history-table th {{
        padding: 16px 20px;
        text-align: left;
        font-size: 0.75rem;
        font-weight: 600;
        color: {C['text_muted']};
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-bottom: 1px solid {C['border']};
    }}

    .history-table th.year-col {{
        text-align: right;
    }}

    .history-table td {{
        padding: 14px 20px;
        font-size: 0.9rem;
        color: {C['text_primary']};
        border-bottom: 1px solid {C['divider']};
    }}

    .history-table tr:last-child td {{
        border-bottom: none;
    }}

    .history-table tr:hover {{
        background: rgba(99, 102, 241, 0.05);
    }}

    .history-table td.institution {{
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 10px;
    }}

    .history-table td.value {{
        text-align: right;
        font-family: 'JetBrains Mono', 'Consolas', monospace;
        font-size: 0.85rem;
    }}

    .history-table tr.total-row {{
        background: rgba(99, 102, 241, 0.08);
    }}

    .history-table tr.total-row td {{
        font-weight: 700;
        color: {C['text_primary']};
        border-top: 2px solid {C['border']};
    }}

    .owner-badge {{
        display: inline-block;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 0.65rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
    }}

    .owner-lucas {{ background: rgba(129, 140, 248, 0.2); color: #a5b4fc; }}
    .owner-maria {{ background: rgba(244, 114, 182, 0.2); color: #f9a8d4; }}
    .owner-conjunto {{ background: rgba(45, 212, 191, 0.2); color: #5eead4; }}

    /* ═══ EMPTY STATE ═══ */
    .empty-state {{
        text-align: center;
        padding: 60px 20px;
        color: {C['text_muted']};
    }}

    .empty-state-icon {{
        font-size: 3rem;
        margin-bottom: 16px;
        opacity: 0.5;
    }}
</style>
""", unsafe_allow_html=True)

# --- HEADER ---
render_fab()
render_back_button()
render_page_header("Legado Patrimonial", "Registro histórico da construção de riqueza", "🏛️")

# --- HELPERS ---
def fmt_brl(v):
    """Format value as BRL currency."""
    if pd.isna(v) or v == 0:
        return "—"
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def classify_owner(name):
    """Classify owner based on institution name."""
    n = str(name).lower()
    if 'lucas' in n:
        return 'lucas'
    if 'maria' in n:
        return 'maria'
    return 'conjunto'

# --- DATA LOADING ---
try:
    df_raw = DataProvider.fetch_data('lb_historic')

    if df_raw.empty:
        st.markdown("""
        <div class="empty-state">
            <div class="empty-state-icon">🏛️</div>
            <h3>Nenhum registro histórico</h3>
            <p>A aba 'lb_historic' está vazia ou não foi encontrada.</p>
        </div>
        """, unsafe_allow_html=True)
    else:
        # --- PROCESS DATA ---
        first_col = df_raw.columns[0]
        year_cols = [c for c in df_raw.columns if str(c).strip().isdigit()]
        year_cols_sorted = sorted(year_cols, key=lambda x: int(x))

        # Clean data
        df_clean = df_raw[
            (df_raw[first_col].notna()) &
            (df_raw[first_col].astype(str).str.strip() != '')
        ].copy()

        # Convert values
        for yc in year_cols:
            df_clean[yc] = df_clean[yc].apply(parse_decimal_br)

        # Separate totals row
        df_data = df_clean[df_clean[first_col].astype(str).str.lower() != 'total'].copy()
        df_total = df_clean[df_clean[first_col].astype(str).str.lower() == 'total']

        # Calculate totals if not present
        if df_total.empty:
            totals = {first_col: 'Total'}
            for yc in year_cols:
                totals[yc] = df_data[yc].sum()
            df_total = pd.DataFrame([totals])

        # --- SUMMARY CARDS ---
        min_year = year_cols_sorted[0] if year_cols_sorted else None
        max_year = year_cols_sorted[-1] if year_cols_sorted else None

        if min_year and max_year:
            total_start = df_data[min_year].sum()
            total_current = df_data[max_year].sum()
            growth_pct = ((total_current / total_start) - 1) * 100 if total_start > 0 else 0
            years_span = int(max_year) - int(min_year)

            st.markdown(f"""
            <div class="summary-row">
                <div class="summary-card">
                    <div class="summary-label">Patrimônio Atual ({max_year})</div>
                    <div class="summary-value">{fmt_brl(total_current)}</div>
                </div>
                <div class="summary-card">
                    <div class="summary-label">Crescimento Total</div>
                    <div class="summary-value positive">+{growth_pct:,.0f}%</div>
                </div>
                <div class="summary-card">
                    <div class="summary-label">Período Registrado</div>
                    <div class="summary-value accent">{years_span} anos</div>
                </div>
                <div class="summary-card">
                    <div class="summary-label">Patrimônio Inicial ({min_year})</div>
                    <div class="summary-value">{fmt_brl(total_start)}</div>
                </div>
            </div>
            """, unsafe_allow_html=True)

        # --- HISTORY TABLE ---
        # Build HTML table
        table_html = '<table class="history-table">'

        # Header
        table_html += '<thead><tr>'
        table_html += f'<th style="width: 280px;">Instituição</th>'
        for year in year_cols_sorted:
            table_html += f'<th class="year-col">{year}</th>'
        table_html += '</tr></thead>'

        # Body
        table_html += '<tbody>'

        for _, row in df_data.iterrows():
            institution = str(row[first_col]).strip()
            owner = classify_owner(institution)
            badge_class = f"owner-{owner}"

            table_html += '<tr>'
            table_html += f'''
                <td class="institution">
                    <span class="owner-badge {badge_class}">{owner.upper()}</span>
                    {institution}
                </td>
            '''

            for year in year_cols_sorted:
                val = row[year]
                formatted = fmt_brl(val)
                table_html += f'<td class="value">{formatted}</td>'

            table_html += '</tr>'

        # Total row
        if not df_total.empty:
            total_row = df_total.iloc[0]
            table_html += '<tr class="total-row">'
            table_html += '<td class="institution">TOTAL GERAL</td>'

            for year in year_cols_sorted:
                val = total_row[year] if year in df_total.columns else df_data[year].sum()
                formatted = fmt_brl(val)
                table_html += f'<td class="value">{formatted}</td>'

            table_html += '</tr>'

        table_html += '</tbody></table>'

        st.markdown(table_html, unsafe_allow_html=True)

        # --- FOOTER ---
        st.markdown("<div style='height: 32px'></div>", unsafe_allow_html=True)

        st.caption(f"Dados atualizados manualmente. Período: {min_year} a {max_year}.")

except Exception as e:
    st.error(f"Erro ao carregar dados históricos: {e}")

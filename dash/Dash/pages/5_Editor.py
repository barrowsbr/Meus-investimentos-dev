import streamlit as st
from core.auth import require_auth

# --- AUTH CHECK ---
require_auth()

import pandas as pd
import datetime as dt
from datetime import datetime, date
from core.ui_config import get_editor_config
from core.ui import render_fab

# --- 1. CONFIGURAÇÃO DA PÁGINA ---
st.set_page_config(
    page_title="Editor de Dados",
    layout="wide",
    initial_sidebar_state="collapsed",
    page_icon="📝"
)

# --- CSS PERSONALIZADO (GLOBAL THEME) ---
# --- CSS PERSONALIZADO (GLOBAL THEME) ---
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');

    /* Reset & Base */
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

    /* Hero Styles (Barroots Branding) */
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
        padding: 0 10px;
    }

    /* GLASS EXPANDER STYLE */
    [data-testid="stExpander"] {
        background: rgba(30, 41, 59, 0.4);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 16px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        margin-bottom: 20px;
    }

    /* Hover Effect - Neon & Lift */
    [data-testid="stExpander"]:hover {
        transform: translateY(-5px);
        border-color: rgba(99, 102, 241, 0.5); /* Neon Purple/Blue */
        box-shadow: 0 15px 30px -10px rgba(99, 102, 241, 0.3);
    }
    
    /* Summary (Header) Styling */
    [data-testid="stExpander"] summary {
        color: #f1f5f9 !important;
        font-weight: 600;
        font-size: 1.1rem;
        padding-top: 15px;
        padding-bottom: 15px;
    }
    
    [data-testid="stExpander"] summary:hover {
        color: #a5b4fc !important;
    }
    
    /* Remove default border of expands */
    .streamlit-expanderContent {
        border: none !important;
    }

    /* Table Styling */
    .stDataFrame {
         border: 1px solid rgba(255, 255, 255, 0.1);
         background-color: rgba(15, 23, 42, 0.6);
         border-radius: 8px;
    }
    
    /* HIDE SIDEBAR */
    section[data-testid="stSidebar"],
    [data-testid="collapsedControl"] {
        display: none !important;
    }

    h1, h2, h3 { color: #f1f5f9; }
    
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>
""", unsafe_allow_html=True)

# --- FUNÇÃO DO EDITOR DE DADOS ---
def exibir_editor_dados():
    render_fab()
    # Botao voltar no topo
    if st.button("← Voltar para Home", type="secondary"):
        st.switch_page("Home.py")

    # Styled Hero Header
    st.markdown("""
    <div class="hero-container">
        <div class="hero-title">Editor de Dados</div>
        <div class="hero-subtitle">Registros & Lançamentos</div>
    </div>
    """, unsafe_allow_html=True)

    # === CAIXA QUICK EDITOR ===
    st.markdown("""
    <style>
    .caixa-card {
        background: rgba(30, 41, 59, 0.5);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(52, 211, 153, 0.15);
        border-radius: 16px;
        padding: 20px 24px;
        margin-bottom: 24px;
        transition: all 0.3s ease;
    }
    .caixa-card:hover {
        border-color: rgba(52, 211, 153, 0.35);
        box-shadow: 0 12px 32px -8px rgba(52, 211, 153, 0.15);
    }
    .caixa-title {
        font-size: 1.1rem;
        font-weight: 700;
        color: #34d399;
        margin-bottom: 4px;
        letter-spacing: -0.5px;
    }
    .caixa-subtitle {
        font-size: 0.78rem;
        color: #64748b;
        margin-bottom: 12px;
    }
    .caixa-current {
        font-size: 0.75rem;
        color: #94a3b8;
        margin-top: 4px;
    }
    .caixa-current span {
        color: #34d399;
        font-weight: 700;
        font-size: 0.85rem;
    }
    </style>
    """, unsafe_allow_html=True)

    with st.expander("💰 Caixa Rápido — Atualizar Saldo", expanded=False):
        try:
            from core.data.provider import DataProvider
            from core.data.gsheets import get_worksheet
            from core.utils import format_decimal_br, parse_decimal_br

            df_rf = DataProvider.get_fixed_income()

            if not df_rf.empty and 'Ticker' in df_rf.columns and 'Valor' in df_rf.columns:
                # Find all CAIXA rows
                mask = df_rf['Ticker'].astype(str).str.upper().str.contains('CAIXA', na=False)
                caixa_rows = df_rf[mask]

                if caixa_rows.empty:
                    st.info("Nenhuma linha 'CAIXA' encontrada na aba renda_fixa.")
                else:
                    for idx, row in caixa_rows.iterrows():
                        ticker_name = str(row['Ticker'])
                        current_val = row.get('Valor', 0)
                        try:
                            current_float = float(current_val) if current_val else 0.0
                        except (ValueError, TypeError):
                            current_float = parse_decimal_br(str(current_val)) if current_val else 0.0

                        moeda = str(row.get('Moeda', 'BRL'))
                        prefix = "R$" if moeda == "BRL" else "$"

                        st.markdown(
                            f'<div class="caixa-current">{ticker_name} — Saldo atual: '
                            f'<span>{prefix} {current_float:,.2f}</span></div>',
                            unsafe_allow_html=True,
                        )

                        col_input, col_btn = st.columns([3, 1])
                        with col_input:
                            new_val = st.number_input(
                                f"Novo saldo — {ticker_name}",
                                value=current_float,
                                min_value=0.0,
                                step=100.0,
                                format="%.2f",
                                key=f"caixa_input_{idx}",
                                label_visibility="collapsed",
                            )
                        with col_btn:
                            if st.button("💾 Salvar", key=f"caixa_save_{idx}", type="primary", use_container_width=True):
                                try:
                                    ws = get_worksheet('gdados', 'renda_fixa')
                                    if ws:
                                        # idx is 0-based DataFrame index, sheet is 1-based + header
                                        sheet_row = int(idx) + 2  # +1 for header, +1 for 1-based

                                        # Find "Valor" column index
                                        headers = ws.row_values(1)
                                        col_idx = headers.index('Valor') + 1  # 1-based

                                        ws.update_cell(sheet_row, col_idx, new_val)
                                        st.cache_data.clear()
                                        st.toast(f"✅ {ticker_name} atualizado para {prefix} {new_val:,.2f}", icon="💰")
                                        st.rerun()
                                    else:
                                        st.error("Não foi possível acessar a planilha.")
                                except Exception as e:
                                    st.error(f"Erro ao salvar: {e}")
            else:
                st.warning("Aba renda_fixa não encontrada ou sem colunas esperadas (Ticker, Valor).")
        except Exception as e:
            st.error(f"Erro ao carregar dados do caixa: {e}")

    tabs_config = get_editor_config()

    col_sel, col_stats = st.columns([1, 2])
    with col_sel:
        selected_key = st.selectbox(
            "Selecione a Tabela:", 
            list(tabs_config.keys()),
            format_func=lambda x: f"{tabs_config[x]['icon']} {tabs_config[x]['label']}"
        )
    
    # Reload logic stored in session state to handle page reruns
    if 'editor_key' not in st.session_state or st.session_state.editor_key != selected_key:
        st.session_state.editor_key = selected_key
        st.session_state.pop('editor_df', None)

    cfg = tabs_config[selected_key]
    
    # Helper for robust date conversion (Handles Excel Serials + Strings)
    def convert_smart_date(x):
        if pd.isnull(x) or str(x).strip() == '': return pd.NaT
        try:
            # Check if it's already datetime
            if isinstance(x, (pd.Timestamp, datetime, date)): return x
            
            # Try numeric (Excel Serial)
            x_float = float(x)
            if 30000 < x_float < 70000: # Reasonable range for modern dates
                return pd.to_datetime(x_float, unit='D', origin='1899-12-30')
        except:
            pass
            
        # Fallback to string parsing
        try:
            return pd.to_datetime(x, dayfirst=True, errors='coerce')
        except:
            return pd.NaT

    # Lazy loading of data
    if 'editor_df' not in st.session_state or st.session_state.editor_df is None:
        try:
            from core.data.provider import DataProvider
            from core.utils import format_decimal_br
            
            df = DataProvider.fetch_data(selected_key)
            
            # --- PRE-PROCESSING & CLEANING ---
            
            # 1. Date Conversion
            for col in cfg.get("date_cols", []):
                if col in df.columns:
                    df[col] = df[col].apply(convert_smart_date)
            
            # 2. Special Logic for "Proventos"
            if selected_key == "meus_proventos":
                if 'data' in df.columns:
                    meses = {1:'jan', 2:'fev', 3:'mar', 4:'abr', 5:'mai', 6:'jun', 
                             7:'jul', 8:'ago', 9:'set', 10:'out', 11:'nov', 12:'dez'}
                    
                    def get_mes_ref(d):
                        if pd.isnull(d): return ""
                        try:
                            return f"{meses.get(d.month, '')}/{str(d.year)[-2:]}"
                        except: return ""

                    df['mes'] = df['data'].apply(get_mes_ref)
                    df['ano'] = df['data'].apply(lambda x: x.year if pd.notnull(x) else 0).astype(int)
            
            st.session_state.editor_df = df
        except Exception as e:
            st.error(f"Erro ao carregar dados: {e}")
            st.session_state.editor_df = pd.DataFrame()

    df_current = st.session_state.editor_df
    
    # --- LOCALIZE NUMBERS FOR DISPLAY/EDIT (BRL FORMAT) ---
    from core.utils import format_decimal_br, parse_decimal_br
    
    # Identify numeric columns from config
    fields_cfg = cfg.get("form_fields", {})
    numeric_cols = [k for k, v in fields_cfg.items() if v in ["currency", "number"]]
    
    # Create a COPY for display (Strings)
    df_display = df_current.copy() if df_current is not None else pd.DataFrame()
    
    if not df_display.empty:
        for col in numeric_cols:
            if col in df_display.columns:
                # Decide decimals based on config if possible, else default 2
                # Quantidade usually 4/8, defaults to 2 in utils, let's try to be smart
                decimals = 2
                if 'Quantidade' in col or 'Qtd' in col or 'VET' in col: decimals = 4
                
                # Apply formatting: Float -> String "1.000,00"
                df_display[col] = df_display[col].apply(lambda x: format_decimal_br(x, decimals))

    
    df_hidden = pd.DataFrame()
    df_visible = pd.DataFrame()
    
    if df_display is not None and not df_display.empty:
        if len(df_display) > 10:
            df_hidden_disp = df_display.iloc[:-10]
            df_visible = df_display.iloc[-10:]
            
            # Keep track of original hidden part (though we re-parse everything on save usually)
            # Actually, to save correctly, we need to apply changes to the FULL dataset or valid subset.
            # Here we are editing specs. If we edit strings, we must parse them back.
        else:
            df_visible = df_display
            df_hidden_disp = pd.DataFrame()
    
    if df_visible is not None:
        
        # --- ADICIONAR NOVO LANÇAMENTO (FORMULÁRIO) ---
        with st.expander("⚡ Adicionar Novo Lançamento", expanded=False):
            with st.form(key=f"form_add_{selected_key}", clear_on_submit=False):
                form_cols = st.columns(4)
                input_data = {}
                
                history_tickers = []
                if not df_display.empty:
                    possible_cols = ["Ticker", "Símbolo", "ticker", "Símbolo (Symbol)"]
                    for c in possible_cols:
                        if c in df_display.columns:
                            history_tickers = df_display[c].dropna().unique().tolist()
                            break
                
                idx = 0
                for field_name, field_type in fields_cfg.items():
                    c = form_cols[idx % 4]
                    idx += 1
                    
                    key_widget = f"in_{selected_key}_{field_name}" 
                    
                    if field_type == "text_suggest":
                        opts = [""] + sorted([str(x) for x in history_tickers])
                        val_sel = c.selectbox(f"{field_name}", options=opts, key=key_widget)
                        if val_sel == "":
                            input_data[field_name] = c.text_input(f"Novo {field_name}?", key=f"{key_widget}_new")
                        else:
                            input_data[field_name] = val_sel
                    
                    elif isinstance(field_type, list):
                        input_data[field_name] = c.selectbox(field_name, options=field_type, key=key_widget)
                    
                    elif field_type == "text":
                        input_data[field_name] = c.text_input(field_name, key=key_widget)
                    
                    elif field_type == "date":
                        input_data[field_name] = c.date_input(field_name, value="today", format="DD/MM/YYYY", key=key_widget)
                    
                    elif field_type == "currency" or field_type == "number":
                        # CHANGED: Text Input for BRL Format compatibility
                        val_str = c.text_input(field_name, value="0,00", key=key_widget, help="Use vírgula como separador decimal")
                        # Parse immediately to validate or verify? No, keep as is, parse later.
                        input_data[field_name] = val_str
                        # We store the raw input (string) and parse it when adding to DF.

                submit_btn = st.form_submit_button("➕ Adicionar Linha", type="primary")
            
            if submit_btn:
                if any(str(v).strip() == "" for v in input_data.values()):
                    st.warning("Preencha todos os campos obrigatorios.")
                else:
                    # Clean/Parse Input Data before creating row
                    parsed_data = input_data.copy()

                    # Parse Numerics
                    for k, v in parsed_data.items():
                        if k in numeric_cols:
                            f_val = parse_decimal_br(v)
                            decimals = 4 if ('Quantidade' in k or 'Qtd' in k or 'VET' in k) else 2
                            parsed_data[k] = format_decimal_br(f_val, decimals)

                    # =========================================================
                    # MEUS_ATIVOS: Calcular Valor bruto e Valor liquido
                    # Ordem: Data | Tipo | Simbolo | Qtd | Preco | Bruto | Taxas | Liquido | Moeda | Corretora
                    # =========================================================
                    if selected_key == "meus_ativos":
                        qtd_f = parse_decimal_br(parsed_data.get('Quantidade', '0'))
                        preco_f = parse_decimal_br(parsed_data.get('Preço', '0'))
                        taxas_f = parse_decimal_br(parsed_data.get('Taxa de corretagem', '0'))

                        valor_bruto = qtd_f * preco_f
                        valor_liq = valor_bruto + taxas_f

                        ordered_data = {
                            'Data': parsed_data.get('Data'),
                            'Tipo de transação': parsed_data.get('Tipo de transação'),
                            'Símbolo': parsed_data.get('Símbolo'),
                            'Quantidade': parsed_data.get('Quantidade'),
                            'Preço': parsed_data.get('Preço'),
                            'Valor bruto': format_decimal_br(valor_bruto, 2),
                            'Taxa de corretagem': format_decimal_br(taxas_f, 2),
                            'Valor líquido': format_decimal_br(valor_liq, 2),
                            'Moeda': parsed_data.get('Moeda'),
                            'Corretora': parsed_data.get('Corretora'),
                        }
                        parsed_data = ordered_data

                    # =========================================================
                    # MEUS_PROVENTOS: Calcular mes, ano e decisao
                    # Ordem: ticker | data | lancamento | categoria | valor | moeda | mes | ano | decisao
                    # =========================================================
                    elif selected_key == "meus_proventos":
                        d_obj = pd.to_datetime(input_data['data'])
                        meses_dict = {1:'jan', 2:'fev', 3:'mar', 4:'abr', 5:'mai', 6:'jun',
                                 7:'jul', 8:'ago', 9:'set', 10:'out', 11:'nov', 12:'dez'}

                        ordered_data = {
                            'ticker': parsed_data.get('ticker'),
                            'data': parsed_data.get('data'),
                            'lancamento': parsed_data.get('lancamento'),
                            'categoria': parsed_data.get('categoria'),
                            'valor': parsed_data.get('valor'),
                            'moeda': parsed_data.get('moeda'),
                            'mes': f"{meses_dict.get(d_obj.month, '')}/{str(d_obj.year)[-2:]}",
                            'ano': d_obj.year,
                            'decisao': parsed_data.get('lancamento', ''),
                        }
                        parsed_data = ordered_data

                    # =========================================================
                    # RENDA_FIXA: Ordem correta
                    # Ordem: Ticker | Compra | Tipo de transacao | Valor | Valor atual | Moeda
                    # =========================================================
                    elif selected_key == "renda_fixa":
                        ordered_data = {
                            'Ticker': parsed_data.get('Ticker'),
                            'Compra': parsed_data.get('Compra'),
                            'Tipo de transação': parsed_data.get('Tipo de transação'),
                            'Valor': parsed_data.get('Valor'),
                            'Valor atual': parsed_data.get('Valor atual'),
                            'Moeda': parsed_data.get('Moeda'),
                        }
                        parsed_data = ordered_data

                    # =========================================================
                    # CAMBIO: Ordem correta
                    # Ordem: Data | Moeda Origem | Moeda Destino | Entrada | Saida | VET | Corretora
                    # =========================================================
                    elif selected_key == "cambio":
                        ordered_data = {
                            'Data': parsed_data.get('Data'),
                            'Moeda Origem': parsed_data.get('Moeda Origem'),
                            'Moeda Destino': parsed_data.get('Moeda Destino'),
                            'Valor Total entrada': parsed_data.get('Valor Total entrada'),
                            'Valor Total saída': parsed_data.get('Valor Total saída'),
                            'VET': parsed_data.get('VET'),
                            'Corretora destino': parsed_data.get('Corretora destino'),
                        }
                        parsed_data = ordered_data

                    new_row = pd.DataFrame([parsed_data])

                    for d_col in cfg.get("date_cols", []):
                        if d_col in new_row.columns:
                            new_row[d_col] = pd.to_datetime(new_row[d_col])

                    # Prepare Row with FLOATS for internal storage
                    row_floats = new_row.copy()

                    # Parse numeric columns back to float
                    all_numeric = list(numeric_cols) + ['Valor bruto', 'Valor líquido', 'Taxa de corretagem', 'VET']
                    for col in all_numeric:
                        if col in row_floats.columns:
                            row_floats[col] = row_floats[col].apply(parse_decimal_br)

                    # Match columns with existing DataFrame (sheet order)
                    if not st.session_state.editor_df.empty:
                        existing_cols = st.session_state.editor_df.columns.tolist()
                        row_floats = row_floats.reindex(columns=existing_cols)

                    st.session_state.editor_df = pd.concat([st.session_state.editor_df, row_floats], ignore_index=True)
                    st.success("Linha adicionada!")
                    st.rerun()
        
        st.markdown("---")
        
        # Override Column Configs for Numerics to be TextColumn (Editable as String)
        final_col_config = cfg.get("column_types", {}).copy()
        
        # Helper to safely get attributes from either dict or object
        def get_conf_attr(obj, attr, default=None):
            if isinstance(obj, dict):
                return obj.get(attr, default)
            return getattr(obj, attr, default)

        for nc in numeric_cols:
            if nc in final_col_config:
                orig_conf = final_col_config[nc]
                
                current_label = get_conf_attr(orig_conf, 'label')
                current_width = get_conf_attr(orig_conf, 'width')
                current_help = get_conf_attr(orig_conf, 'help', '')
                
                # Replace with TextColumn
                final_col_config[nc] = st.column_config.TextColumn(
                    label=current_label,
                    width=current_width,
                    help=f"{current_help} (Formato: 1.000,00)",
                    validate="^[0-9.,]+$" # Basic validation
                )
        
        st.info("ℹ️ Exibindo apenas as últimas 10 entradas para melhor performance.")
        
        # Ensure Date Columns are Datetime Objects before passing to Editor
        # This prevents "string incompatible with DateColumn" errors
        for d_col in cfg.get("date_cols", []):
            if d_col in df_visible.columns:
                df_visible[d_col] = pd.to_datetime(df_visible[d_col], errors='coerce')

        # Grid Edits Strings
        df_edited = st.data_editor(
            df_visible,
            column_config=final_col_config,
            num_rows="dynamic",
            use_container_width=True,
            height=400,
            key=f"grid_{selected_key}"
        )
        
        st.markdown("### 💾 Ações")
        col_save, col_discard = st.columns([1, 4])
        
        with col_save:
            if st.button("Gravar Alterações", type="primary", use_container_width=True):
                try:
                    # Merge Hidden + Edited
                    if not df_hidden_disp.empty:
                        df_full_str = pd.concat([df_hidden_disp, df_edited], ignore_index=True)
                    else:
                        df_full_str = df_edited.copy()
                    
                    # CONVERT BACK TO FLOATS
                    df_to_save = df_full_str.copy()
                    for col in numeric_cols:
                        if col in df_to_save.columns:
                            df_to_save[col] = df_to_save[col].apply(parse_decimal_br)
                    
                    if selected_key == 'meus_proventos':
                        # ... (existing logic) ...
                        if 'data' in df_to_save.columns:
                            dates = pd.to_datetime(df_to_save['data'], errors='coerce')
                            meses = {1:'jan', 2:'fev', 3:'mar', 4:'abr', 5:'mai', 6:'jun', 
                                     7:'jul', 8:'ago', 9:'set', 10:'out', 11:'nov', 12:'dez'}
                            
                            def get_mes_ref(d):
                                if pd.isnull(d): return ""
                                return f"{meses.get(d.month, '')}/{str(d.year)[-2:]}"
                                
                            df_to_save['mes'] = dates.apply(get_mes_ref)
                            df_to_save['ano'] = dates.dt.year.fillna(0).astype(int)

                    # Date string format for Saving (Sheet needs strings)
                    for d_col in cfg.get("date_cols", []):
                        if d_col in df_to_save.columns:
                            s_dates = pd.to_datetime(df_to_save[d_col], errors='coerce')
                            df_to_save[d_col] = s_dates.dt.strftime('%Y-%m-%d').replace('NaT', '')

                    from core.data.provider import DataProvider
                    if DataProvider.save_data(selected_key, df_to_save):
                        st.toast("Dados salvos com sucesso!", icon="✅")
                        st.balloons()
                        # Clear session to force reload with correct types
                        st.session_state.pop('editor_df', None)
                        st.rerun()
                    else:
                        st.error("Falha ao salvar. Verifique logs.")
                        
                except Exception as e:
                    st.error(f"Erro durante salvamento: {e}")
        
        with col_discard:
            if st.button("❌ Descartar"):
                st.session_state.pop('editor_df', None)
                st.rerun()

def main():
    exibir_editor_dados()

if __name__ == "__main__":
    main()

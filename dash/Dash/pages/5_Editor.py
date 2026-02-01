import streamlit as st
from core.auth import require_auth

# --- AUTH CHECK ---
require_auth()

import pandas as pd
import datetime as dt
from datetime import datetime, date
from core.ui_config import get_editor_config

# --- 1. CONFIGURAÇÃO DA PÁGINA ---
st.set_page_config(
    page_title="Editor de Dados",
    layout="wide",
    initial_sidebar_state="expanded",
    page_icon="📝"
)

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

    /* Table Styling */
    .stDataFrame {
         border: 1px solid rgba(255, 255, 255, 0.1);
         background-color: rgba(15, 23, 42, 0.6);
         border-radius: 8px;
    }
    
    /* Sidebar */
    section[data-testid="stSidebar"] {
        background-color: #0f1724;
        border-right: 1px solid rgba(255,255,255,0.05);
    }
    
    h1, h2, h3 { color: #f1f5f9; }
</style>
""", unsafe_allow_html=True)

# --- FUNÇÃO DO EDITOR DE DADOS ---
def exibir_editor_dados():
    st.header("📝 Editor de Registros & Lançamentos")
    st.caption("Adicione, edite ou corrija transações. Os dados são salvos diretamente no Google Sheets.")

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
            df = DataProvider.fetch_data(selected_key)
            
            # --- PRE-PROCESSING & CLEANING ---
            
            # 1. Date Conversion
            for col in cfg.get("date_cols", []):
                if col in df.columns:
                    df[col] = df[col].apply(convert_smart_date)
            
            # 2. Special Logic for "Proventos" (Fill Derived Columns)
            if selected_key == "meus_proventos":
                # Ensure 'data' is the source of truth
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
    
    df_hidden = pd.DataFrame()
    df_visible = pd.DataFrame()
    
    if df_current is not None and not df_current.empty:
        if len(df_current) > 10:
            df_hidden = df_current.iloc[:-10]
            df_visible = df_current.iloc[-10:]
        else:
            df_visible = df_current
    
    if df_visible is not None:
        
        # --- RESTORED: ADICIONAR NOVO LANÇAMENTO (FORMULÁRIO) ---
        with st.expander("⚡ Adicionar Novo Lançamento", expanded=False):
            with st.form(key=f"form_add_{selected_key}", clear_on_submit=False):
                form_cols = st.columns(4)
                input_data = {}
                
                history_tickers = []
                if not df_current.empty:
                    possible_cols = ["Ticker", "Símbolo", "ticker", "Símbolo (Symbol)"]
                    for c in possible_cols:
                        if c in df_current.columns:
                            history_tickers = df_current[c].dropna().unique().tolist()
                            break
                
                fields = cfg.get("form_fields", {})
                idx = 0
                for field_name, field_type in fields.items():
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
                        input_data[field_name] = c.number_input(field_name, min_value=0.0, step=0.01, format="%.2f", key=key_widget)

                submit_btn = st.form_submit_button("➕ Adicionar Linha", type="primary")
            
            if submit_btn:
                if any(str(v).strip() == "" for v in input_data.values()):
                    st.warning("⚠️ Preencha todos os campos obrigatórios.")
                else:
                    new_row = pd.DataFrame([input_data])
                    
                    if selected_key == "meus_proventos":
                        d_obj = pd.to_datetime(input_data['data'])
                        meses_dict = {1:'jan', 2:'fev', 3:'mar', 4:'abr', 5:'mai', 6:'jun', 
                                 7:'jul', 8:'ago', 9:'set', 10:'out', 11:'nov', 12:'dez'}
                        try:
                            new_row['mes'] = f"{meses_dict[d_obj.month]}/{str(d_obj.year)[-2:]}"
                            new_row['ano'] = d_obj.year
                        except: pass 
                        
                        if 'decisao' in df_current.columns: 
                            new_row['decisao'] = input_data.get('lancamento', '')

                    for d_col in cfg.get("date_cols", []):
                        if d_col in new_row.columns: 
                            new_row[d_col] = pd.to_datetime(new_row[d_col])

                    st.session_state.editor_df = pd.concat([st.session_state.editor_df, new_row], ignore_index=True)
                    st.success("Linha adicionada! Não esqueça de clicar em 'Gravar Alterações' para salvar.")
                    st.rerun()

        st.markdown("---")
        
        final_col_config = cfg.get("column_types", {}).copy()
        
        st.info("ℹ️ Exibindo apenas as últimas 10 entradas para melhor performance.")
        
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
                    if not df_hidden.empty:
                        df_to_save = pd.concat([df_hidden, df_edited], ignore_index=True)
                    else:
                        df_to_save = df_edited.copy()
                    
                    if selected_key == 'meus_proventos':
                        if 'data' in df_to_save.columns:
                            dates = pd.to_datetime(df_to_save['data'], errors='coerce')
                            meses = {1:'jan', 2:'fev', 3:'mar', 4:'abr', 5:'mai', 6:'jun', 
                                     7:'jul', 8:'ago', 9:'set', 10:'out', 11:'nov', 12:'dez'}
                            
                            def get_mes_ref(d):
                                if pd.isnull(d): return ""
                                return f"{meses.get(d.month, '')}/{str(d.year)[-2:]}"
                                
                            df_to_save['mes'] = dates.apply(get_mes_ref)
                            df_to_save['ano'] = dates.dt.year.fillna(0).astype(int)

                    for d_col in cfg.get("date_cols", []):
                        if d_col in df_to_save.columns:
                            s_dates = pd.to_datetime(df_to_save[d_col], errors='coerce')
                            df_to_save[d_col] = s_dates.dt.strftime('%Y-%m-%d').replace('NaT', '')

                    from core.data.provider import DataProvider
                    if DataProvider.save_data(selected_key, df_to_save):
                        st.toast("Dados salvos com sucesso!", icon="✅")
                        st.balloons()
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
    with st.sidebar:
        st.header("📝 Editor")
        st.caption("Gerenciamento de tabelas brutas")
        if st.button("🏠 Voltar para Início", use_container_width=True):
            st.switch_page("Home.py")

    exibir_editor_dados()

if __name__ == "__main__":
    main()

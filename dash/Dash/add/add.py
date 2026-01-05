import streamlit as st
import pandas as pd
import os
import shutil
import sqlite3
from datetime import datetime

# --- CONFIGURAÇÃO ---
PASTA_DADOS = "Dash" # Caminho onde está o investimentos.db
NOME_DB = "investimentos.db"
CAMINHO_DB = os.path.join(PASTA_DADOS, NOME_DB)

st.set_page_config(page_title="Investment Editor SQL", layout="wide", page_icon="🗄️")

# --- CSS CUSTOMIZADO ---
st.markdown("""
<style>
    .stButton>button { width: 100%; border-radius: 5px; height: 3em; }
    div[data-testid="stExpander"] details summary { font-weight: bold; color: #444; }
</style>
""", unsafe_allow_html=True)

# --- 1. CONFIGURAÇÃO (AGORA MAPEANDO TABELAS DO BANCO) ---
# Removemos configurações de CSV (sep, decimal) pois o SQL não precisa.
TABLES_CONFIG = {
    "meus_ativos": {
        "icon": "📈", 
        "label": "Ações & ETFs",
        "date_cols": ["Data"],
        "form_fields": {
            "Símbolo": "text_suggest", "Tipo de transação": ["Compra", "Venda"], 
            "Quantidade": "number", "Preço": "currency", "Corretora": ["IBKR", "XP", "Avenue", "Binance"],
            "Moeda": ["USD", "BRL"], "Data": "date"
        },
        "column_types": {
            "Data": st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
            "Tipo de transação": st.column_config.SelectboxColumn("Operação", options=["Compra", "Venda"]),
            "Símbolo": st.column_config.TextColumn("Ticker", width="small", validate="^[A-Za-z0-9.]+$"),
            "Quantidade": st.column_config.NumberColumn("Qtd", format="%.4f"),
            "Preço": st.column_config.NumberColumn("Preço", format="$ %.2f"),
            "Valor líquido": st.column_config.NumberColumn("Total", format="$ %.2f"),
            "Moeda": st.column_config.SelectboxColumn("Moeda", options=["USD", "BRL", "EUR"]),
        }
    },
    "meus_proventos": {
        "icon": "💵",
        "label": "Proventos",
        "date_cols": ["data"],
        "form_fields": {
            "ticker": "text_suggest", "data": "date",
            "lancamento": ["Dividendo", "JUROS S/ CAPITAL", "Rendimento", "Imposto"],
            "categoria": ["Ação", "Ação Internacional", "FII", "ETF", "BDR"],
            "valor": "currency", "moeda": ["USD", "BRL", "EUR"]
        },
        "column_types": {
            "data": st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
            "ticker": st.column_config.TextColumn("Ticker", width="small"),
            "lancamento": st.column_config.SelectboxColumn("Lançamento", options=["Dividendo", "JUROS S/ CAPITAL", "Rendimento", "Imposto"]),
            "categoria": st.column_config.SelectboxColumn("Categoria", options=["Ação", "Ação Internacional", "FII"]),
            "valor": st.column_config.NumberColumn("Valor", format="%.2f"),
            "mes": st.column_config.TextColumn("Mês Ref", disabled=True)
        }
    },
    "renda_fixa": {
        "icon": "💰",
        "label": "Renda Fixa",
        "date_cols": ["Compra"],
        "form_fields": {
            "Ticker": "text_suggest", "Valor": "currency", "Valor atual": "currency",
            "Tipo de transação": ["Compra", "Venda", "Resgate", "Vencimento"], "Compra": "date"
        },
        "column_types": {
            "Compra": st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
            "Valor": st.column_config.NumberColumn("Investido", format="R$ %.2f"),
            "Valor atual": st.column_config.NumberColumn("Atual", format="R$ %.2f"),
            "Tipo de transação": st.column_config.SelectboxColumn("Tipo", options=["Compra", "Venda", "Resgate", "Vencimento"]),
        }
    },
    "cambio": {
        "icon": "💱",
        "label": "Câmbio",
        "date_cols": ["Data"],
        "form_fields": {
            "Moeda Origem": ["BRL", "USD", "EUR"], "Moeda Destino": ["USD", "BRL", "EUR"],
            "Valor Total entrada": "currency", "Valor Total saída": "currency", "Data": "date"
        },
        "column_types": {
            "Data": st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
            "VET": st.column_config.NumberColumn("VET", format="%.4f"),
            "Valor Total entrada": st.column_config.NumberColumn("Entrada", format="%.2f"),
            "Valor Total saída": st.column_config.NumberColumn("Saída", format="%.2f")
        }
    },
    "composicao": {
        "icon": "📊",
        "label": "Composição (Carteira)",
        "date_cols": [],
        "form_fields": {
            "Símbolo (Symbol)": "text", "Descrição (Description)": "text", 
            "Valor Líquido (Net Value)": "currency", 
            "Setor (Sector)": ["Technology", "Financials", "Healthcare", "Consumer", "Cash"]
        },
        "column_types": {
            "Valor Líquido (Net Value)": st.column_config.NumberColumn("Valor Líquido", format="$ %.2f"),
            "Setor (Sector)": st.column_config.SelectboxColumn("Setor", options=["Technology", "Financials", "Consumer", "Cash"])
        }
    }
}

# --- 2. FUNÇÕES DE BACKEND (SQLITE) ---

def get_db_connection():
    """Cria conexão com o banco e retorna o objeto conexão."""
    if not os.path.exists(CAMINHO_DB):
        st.error(f"❌ Banco de dados não encontrado em: {CAMINHO_DB}")
        return None
    try:
        return sqlite3.connect('Dash/investimentos.db')
    except Exception as e:
        st.error(f"Erro ao conectar no banco: {e}")
        return None

def backup_db():
    """Faz backup do arquivo .db inteiro antes de salvar."""
    if os.path.exists(CAMINHO_DB):
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_dir = os.path.join(PASTA_DADOS, "backups_db")
            os.makedirs(backup_dir, exist_ok=True)
            shutil.copy(CAMINHO_DB, os.path.join(backup_dir, f"{NOME_DB}_{timestamp}.bak"))
        except Exception as e:
            print(f"Erro no backup: {e}") # Apenas loga no console para não travar a UI

def load_data_sql(table_name, config):
    """Lê a tabela do SQL e converte datas."""
    conn = get_db_connection()
    if conn is None: return None
    
    try:
        # Lê tudo da tabela
        df = pd.read_sql(f"SELECT * FROM {table_name}", conn)
        conn.close()
        
        # Converte colunas de data (SQLite salva como string YYYY-MM-DD)
        for col in config.get("date_cols", []):
            # Procura a coluna ignorando maiúsculas/minúsculas
            match_col = next((c for c in df.columns if c.lower() == col.lower()), None)
            if match_col:
                df[match_col] = pd.to_datetime(df[match_col], errors='coerce')
        
        return df
    except Exception as e:
        st.error(f"Erro ao ler tabela '{table_name}': {e}")
        return None

# --- 3. INTERFACE PRINCIPAL ---

with st.sidebar:
    st.title("Editor SQL")
    # Seleciona a Tabela (Chave do Dict)
    selected_table = st.radio(
        "Selecione a Tabela:", list(TABLES_CONFIG.keys()),
        format_func=lambda x: f"{TABLES_CONFIG[x]['icon']} {TABLES_CONFIG[x]['label']}"
    )
    st.divider()
    if st.button("🔄 Recarregar Dados"):
        for key in list(st.session_state.keys()): del st.session_state[key]
        st.rerun()

# Lógica de Carregamento (Session State)
if 'current_df' not in st.session_state or st.session_state.get('loaded_table') != selected_table:
    st.session_state.loaded_table = selected_table
    st.session_state.current_df = load_data_sql(selected_table, TABLES_CONFIG[selected_table])

df = st.session_state.current_df
cfg = TABLES_CONFIG[selected_table]

col_tit, col_act = st.columns([4, 1])
with col_tit: st.subheader(f"{cfg['icon']} Tabela: {cfg['label']}")
with col_act: st.caption(f"DB: {NOME_DB}")

if df is not None:
    
    # --- ÁREA DE INPUT (ADICIONAR LINHA) ---
    with st.expander("⚡ Adicionar Novo Registro", expanded=False):
        form_cols = st.columns(4)
        input_data = {}
        
        # Histórico para sugestões (Autocomplete)
        history_tickers = []
        if not df.empty:
            possible_ticker_cols = ["Ticker", "Símbolo", "ticker", "Símbolo (Symbol)", "Ativo"]
            for col in possible_ticker_cols:
                # Busca case-insensitive
                match_c = next((c for c in df.columns if c.lower() == col.lower()), None)
                if match_c:
                    history_tickers = df[match_c].dropna().unique().tolist()
                    break
        
        fields = cfg.get("form_fields", {})
        idx = 0
        
        for field_name, field_type in fields.items():
            c = form_cols[idx % 4]
            idx += 1
            
            if field_type == "text_suggest":
                input_data[field_name] = c.selectbox(
                    f"{field_name}", 
                    options=[""] + sorted([str(x) for x in history_tickers]),
                    key=f"in_{field_name}"
                )
                if input_data[field_name] == "":
                    input_data[field_name] = c.text_input(f"Novo {field_name}", key=f"in_new_{field_name}")
            
            elif isinstance(field_type, list):
                input_data[field_name] = c.selectbox(field_name, options=field_type, key=f"in_{field_name}")
                
            elif field_type == "text":
                input_data[field_name] = c.text_input(field_name, key=f"in_{field_name}")

            elif field_type == "date":
                input_data[field_name] = c.date_input(field_name, value="today", format="DD/MM/YYYY", key=f"in_{field_name}")
                
            elif field_type == "currency" or field_type == "number":
                input_data[field_name] = c.number_input(field_name, min_value=0.0, step=0.01, format="%.2f", key=f"in_{field_name}")

        if st.button("➕ Adicionar Linha", use_container_width=True):
            if any(str(v).strip() == "" for v in input_data.values()):
                st.toast("⚠️ Preencha todos os campos!", icon="⚠️")
            else:
                new_row = pd.DataFrame([input_data])
                
                # Regras de Negócio (Ex: Proventos)
                if selected_table == "meus_proventos":
                    d_obj = pd.to_datetime(input_data['data'])
                    meses = {1:'jan', 2:'fev', 3:'mar', 4:'abr', 5:'mai', 6:'jun', 
                             7:'jul', 8:'ago', 9:'set', 10:'out', 11:'nov', 12:'dez'}
                    new_row['mes'] = f"{meses[d_obj.month]}/{str(d_obj.year)[-2:]}"
                    new_row['ano'] = d_obj.year
                    if 'decisao' in df.columns: # Se existir coluna legado
                        new_row['decisao'] = input_data['lancamento']

                # Converter datas para datetime para ficar compatível com o DF atual
                for d_col in cfg.get("date_cols", []):
                    match_col = next((c for c in new_row.columns if c.lower() == d_col.lower()), None)
                    if match_col:
                        new_row[match_col] = pd.to_datetime(new_row[match_col])

                st.session_state.current_df = pd.concat([st.session_state.current_df, new_row], ignore_index=True)
                st.rerun()

    st.divider()

    # --- TABELA DE EDIÇÃO ---
    df_edited = st.data_editor(
        st.session_state.current_df,
        column_config=cfg.get("column_types", {}),
        num_rows="dynamic",
        use_container_width=True,
        height=500,
        key=f"editor_grid_{selected_table}"
    )

    # --- SALVAR NO BANCO ---
    st.markdown("---")
    c1, c2, c3 = st.columns([1, 1, 3])
    
    with c1:
        if st.button("💾 SALVAR NO BANCO", type="primary", use_container_width=True):
            try:
                # 1. Backup
                backup_db()
                
                # 2. Conectar
                conn = get_db_connection()
                final_df = df_edited.copy()
                
                @st.cache_data(ttl=60)
                def carregar_tabela_sql_padrao(nome_tabela):
                    conn = get_db_connection()
                    if conn is None: return pd.DataFrame()
                    
                    try:
                        df = pd.read_sql(f"SELECT * FROM {nome_tabela}", conn)
                        conn.close()
                        
                        if df.empty: return pd.DataFrame()

                        # TRUQUE DE MESTRE: Padroniza todas colunas para minúsculo e sem espaços
                        # Isso resolve 90% dos erros de "KeyError"
                        df.columns = df.columns.str.strip().str.lower()
                        
                        return df
                    except Exception as e:
                        st.error(f"Erro ao ler {nome_tabela}: {e}")
                        return pd.DataFrame()                # 4. Salvar (Replace = apaga tabela antiga e cria nova com os dados editados)
                final_df.to_sql(selected_table, conn, if_exists='replace', index=False)
                conn.close()
                
                st.session_state.current_df = df_edited
                st.toast("Tabela atualizada no Banco de Dados!", icon="✅")
                
                # Limpa cache do Streamlit para o Dashboard principal atualizar também
                st.cache_data.clear()
                
            except Exception as e:
                st.error(f"Erro ao gravar no banco: {e}")
    
    with c2:
        if st.button("❌ Descartar"):
            st.session_state.pop('current_df', None)
            st.rerun()

else:
    st.info(f"A tabela '{selected_table}' não foi encontrada no banco de dados ou está vazia.")
    st.warning("Verifique se o arquivo 'investimentos.db' está na pasta correta.")
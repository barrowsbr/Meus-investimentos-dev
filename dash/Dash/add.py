import streamlit as st
import pandas as pd
import os
import shutil
from datetime import datetime

# --- CONFIGURAÇÃO ---
PASTA_DADOS = 'Dash'
st.set_page_config(page_title="Investment Pro", layout="wide", page_icon="🏦")

# --- CSS CUSTOMIZADO PARA VISUAL "PRO" ---
st.markdown("""
<style>
    .stButton>button { width: 100%; border-radius: 5px; height: 3em; }
    div[data-testid="stExpander"] details summary { font-weight: bold; color: #444; }
</style>
""", unsafe_allow_html=True)

# --- 1. CONFIGURAÇÃO DOS METADADOS (INTELIGÊNCIA DO SISTEMA) ---
FILES_CONFIG = {
    "renda_fixa.csv": {
        "sep": ";", "decimal": ",", "encoding": "utf-8", "thousands": None,
        "icon": "💰",
        "label": "Renda Fixa",
        "date_cols": ["Compra"],
        # Mapeamento para o formulário inteligente saber quais campos pedir
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
    "meus_ativos.csv": {
        "sep": ";", "decimal": ".", "encoding": "utf-8", "thousands": None,
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
    "meus_proventos.csv": {
        "sep": ";", "decimal": ".", "encoding": "utf-8", "thousands": None,
        "icon": "💵",
        "label": "Proventos",
        "date_cols": ["data"],
        "form_fields": {
            "ticker": "text_suggest", "decisao": ["Dividendo", "JUROS S/ CAPITAL", "Rendimento", "Imposto"],
            "valor": "currency", "moeda": ["USD", "BRL", "EUR"], "data": "date"
        },
        "column_types": {
            "data": st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
            "valor": st.column_config.NumberColumn("Valor", format="%.2f"),
            "decisao": st.column_config.SelectboxColumn("Tipo", options=["Dividendo", "JUROS S/ CAPITAL", "Rendimento"])
        }
    },
    "cambio.csv": {
        "sep": ";", "decimal": ",", "encoding": "utf-8", "thousands": None,
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
    "composicao.csv": {
        "sep": ";", "decimal": ".", "thousands": ",", "encoding": "utf-8",
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

# --- 2. FUNÇÕES DE BACKEND ---
def get_file_path(filename):
    return os.path.join(PASTA_DADOS, filename)

def backup_file(filepath):
    if os.path.exists(filepath):
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_dir = os.path.join(PASTA_DADOS, "backups")
            os.makedirs(backup_dir, exist_ok=True)
            shutil.copy(filepath, os.path.join(backup_dir, f"{os.path.basename(filepath)}_{timestamp}.bak"))
        except: pass

def load_data_safe(filename, config):
    filepath = get_file_path(filename)
    if not os.path.exists(filepath): return None
    try:
        df = pd.read_csv(filepath, sep=config["sep"], decimal=config["decimal"], 
                         thousands=config.get("thousands"), encoding=config["encoding"])
        # Conversão Silenciosa de Datas
        for col in config.get("date_cols", []):
            if col in df.columns:
                df[col] = pd.to_datetime(df[col], dayfirst=True, errors='coerce')
        return df
    except Exception as e:
        st.error(f"Erro leitura: {e}"); return None

# --- 3. INTERFACE PRINCIPAL ---

# Menu Lateral Compacto
with st.sidebar:
    st.title("InvesTool Pro")
    selected_key = st.radio(
        "Selecione o Módulo:", list(FILES_CONFIG.keys()),
        format_func=lambda x: f"{FILES_CONFIG[x]['icon']} {FILES_CONFIG[x]['label']}"
    )
    st.divider()
    
    # Botão de Pânico (Recarregar)
    if st.button("🔄 Forçar Recarga dos Dados"):
        for key in st.session_state.keys(): del st.session_state[key]
        st.rerun()

# Estado da Sessão
if 'current_df' not in st.session_state or st.session_state.get('loaded_file') != selected_key:
    st.session_state.loaded_file = selected_key
    st.session_state.current_df = load_data_safe(selected_key, FILES_CONFIG[selected_key])

df = st.session_state.current_df
cfg = FILES_CONFIG[selected_key]
filepath = get_file_path(selected_key)

# Cabeçalho Limpo
col_tit, col_act = st.columns([4, 1])
with col_tit: st.subheader(f"{cfg['icon']} Gestão de {cfg['label']}")
with col_act: st.caption(f"Arquivo: {selected_key}")

if df is not None:
    
    # --- ÁREA DE SMART INPUT (A GRANDE NOVIDADE) ---
    with st.expander("⚡ Adicionar Novo Lançamento Rápido", expanded=False):
        # Aqui criamos inputs dinâmicos baseados no tipo de arquivo
        form_cols = st.columns(4) # Grid de 4 colunas
        input_data = {}
        
        # Analisa o histórico para sugestões inteligentes
        history_tickers = df.iloc[:, 0].unique().tolist() if not df.empty else [] # Assume 1a coluna como chave principal
        if "Ticker" in df.columns: history_tickers = df["Ticker"].unique().tolist()
        if "Símbolo" in df.columns: history_tickers = df["Símbolo"].unique().tolist()
        
        # Renderiza campos
        fields = cfg.get("form_fields", {})
        idx = 0
        
        for field_name, field_type in fields.items():
            c = form_cols[idx % 4]
            idx += 1
            
            # 1. Campo com Sugestão (Ticker)
            if field_type == "text_suggest":
                input_data[field_name] = c.selectbox(
                    f"{field_name} (Histórico)", 
                    options=[""] + sorted([str(x) for x in history_tickers]),
                    key=f"input_{field_name}"
                )
                # Se for um novo ticker, permite digitar
                if input_data[field_name] == "":
                    input_data[field_name] = c.text_input(f"Ou digite novo {field_name}", key=f"input_new_{field_name}")
            
            # 2. Selectbox Simples
            elif isinstance(field_type, list):
                # Tenta pré-selecionar baseado no ticker escolhido (Inteligência)
                default_idx = 0
                input_data[field_name] = c.selectbox(field_name, options=field_type, index=default_idx)
                
            # 3. Data
            elif field_type == "date":
                input_data[field_name] = c.date_input(field_name, value="today", format="DD/MM/YYYY")
                
            # 4. Dinheiro/Números
            elif field_type == "currency" or field_type == "number":
                input_data[field_name] = c.number_input(field_name, min_value=0.0, step=0.01, format="%.2f")

        # Botão de Ação do Form
        if st.button("➕ Adicionar à Tabela", use_container_width=True):
            # Validação simples
            if any(str(v).strip() == "" for v in input_data.values()):
                st.toast("⚠️ Preencha todos os campos obrigatórios!", icon="⚠️")
            else:
                # Converte inputs para formato do DF
                new_row = pd.DataFrame([input_data])
                
                # Tratamento de datas para datetime antes de concatenar
                for d_col in cfg.get("date_cols", []):
                    if d_col in new_row.columns:
                        new_row[d_col] = pd.to_datetime(new_row[d_col])

                # Concatena
                st.session_state.current_df = pd.concat([st.session_state.current_df, new_row], ignore_index=True)
                st.toast("Lançamento adicionado à memória! Clique em Salvar para persistir.", icon="✅")
                st.rerun()

    st.divider()

    # --- TABELA DE EDIÇÃO (EDITOR PRINCIPAL) ---
    df_edited = st.data_editor(
        st.session_state.current_df,
        column_config=cfg.get("column_types", {}),
        num_rows="dynamic",
        use_container_width=True,
        height=500,
        key=f"editor_{selected_key}"
    )

    # --- RODAPÉ DE AÇÕES ---
    st.markdown("---")
    c1, c2, c3 = st.columns([1, 1, 3])
    
    with c1:
        if st.button("💾 SALVAR DEFINITIVO", type="primary", use_container_width=True):
            try:
                backup_file(filepath)
                
                # Prepara para salvar (Converte datas volta para string)
                final_df = df_edited.copy()
                for d_col in cfg.get("date_cols", []):
                    if d_col in final_df.columns:
                         final_df[d_col] = final_df[d_col].dt.strftime('%d/%m/%Y')
                
                final_df.to_csv(filepath, sep=cfg["sep"], decimal=cfg["decimal"], index=False, encoding=cfg["encoding"])
                st.session_state.current_df = df_edited # Atualiza memória
                st.toast("Arquivo salvo com sucesso no Disco!", icon="💾")
            except Exception as e:
                st.error(f"Erro crítico: {e}")
    
    with c2:
        if st.button("❌ Descartar Mudanças"):
            st.session_state.current_df = None
            st.rerun()

else:
    st.warning(f"Arquivo não encontrado: {filepath}")   
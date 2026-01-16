import streamlit as st
import pandas as pd
import yfinance as yf
import plotly.express as px
import plotly.graph_objects as go
import os
import numpy as np
import datetime as dt
import shutil
from datetime import datetime, date, timedelta
from typing import Optional

# --- CORE IMPORTS ---
from core.data_loader import load_assets, load_proventos, load_fixed_income, summarize_fixed_income, normalize_ticker, load_cambio
from core.market_data import fetch_market_data
from core.performance_engine import PerformanceEngine
from core.engine import reconstruct_history
from core.ui_config import get_editor_config

from core.attribution import calculate_contribution, group_contributions
from core.risk_analytics import calculate_correlation_matrix, calculate_risk_contribution
from config import BASE_DIR, FILE_ASSETS, FILE_COMPOSICAO, FILE_CAMBIO, FILE_PTAX

# --- 1. CONFIGURAÇÃO DA PÁGINA ---
st.set_page_config(
    page_title="Carteira de Investimentos",
    layout="wide",
    initial_sidebar_state="expanded",
    page_icon="💎"
)

# --- CSS PERSONALIZADO ---
st.markdown("""
<style>
    [data-testid="stMetricValue"] {font-size: 30px; color: #2E7D32;}
    [data-testid="stMetricDelta"] {font-size: 25px;}
    .stDataFrame {border: 1px solid #f0f2f6;}
    /* Oculta índices da tabela */
    thead tr th:first-child {display:none}
    tbody th {display:none}
</style>
""", unsafe_allow_html=True)


# --- 2. LOCALIZAÇÃO E CARREGAMENTO (MODULARIZADO) ---

# Funções Auxiliares de Carga
@st.cache_data(show_spinner=False)
def carregar_composicao_extra():
    if not os.path.exists(FILE_COMPOSICAO): return pd.DataFrame()
    try:
        df = pd.read_csv(FILE_COMPOSICAO, sep=';')
        return df 
    except: return pd.DataFrame()

@st.cache_data(show_spinner=False)
def carregar_cambio():
    if not os.path.exists(FILE_CAMBIO): return pd.DataFrame()
    try:
        df = pd.read_csv(FILE_CAMBIO, sep=';')
        return df
    except: return pd.DataFrame()
    
# ==============================================================================
# 🧠 MOTOR DE CÁLCULO DE PERFORMANCE (GIPS COMPLIANT)
# ==============================================================================

# Wrapper para compatibilidade
@st.cache_data(show_spinner=False)
def run_performance_engine(df_input_frozen):
    """
    Wrapper de alto nível para o motor GIPS.
    Recebe um DataFrame (transformado em hashable/frozen se necessário) e roda o cálculo.
    """
    # Reconverte para DataFrame se vier como dict/json
    if not isinstance(df_input_frozen, pd.DataFrame):
        df = pd.DataFrame(df_input_frozen)
    else:
        df = df_input_frozen
        
    engine = PerformanceEngine(df)
    return engine.calculate_twr()

@st.cache_data(show_spinner=False)
def calcular_contribuicao_cache(df_holdings_mtm, df_asset_returns):
    return calculate_contribution(df_holdings_mtm, df_asset_returns)

@st.cache_data(show_spinner=False)
def calcular_correlacao_cache(df_returns):
    return calculate_correlation_matrix(df_returns)

@st.cache_data(show_spinner=False)
def calcular_risco_cache(df_holdings_mtm, df_returns):
    return calculate_risk_contribution(df_holdings_mtm, df_returns)


# ==============================================================================    
    

# --- LÓGICA DE SETORIZAÇÃO ---
def identificar_setor_ativo(ticker):
    t = str(ticker).upper().strip()
    t_clean = t.replace('.SA', '')
    
    lista_cripto_exata = ['BTC', 'ETH', 'SOL', 'USDT', 'USDC', 'HBAR', 'ADA', 'BTC-USD', 'ETH-USD']
    if t_clean in lista_cripto_exata: return 'Cripto'
    if t_clean.startswith('BTC') and len(t_clean) < 8: return 'Cripto'
    if t_clean.startswith('ETH') and len(t_clean) < 8: return 'Cripto'

    etfs_br = ['IVVB11', 'BOVA11', 'SMAL11', 'HASH11', 'XINA11', 'EURP11', 'GOLD11', 'B5P211']
    if t_clean in etfs_br: return 'ETF'

    lista_commodities = ['IAU', 'SIVR', 'SLV', 'GLD', 'DBC', 'USO']
    if t_clean in lista_commodities: return 'Commodities'
    
    etfs_usa = ['SPY', 'QQQ', 'VWRA', 'VOO', 'VNQ', 'SCHD', 'VT']
    if t_clean in etfs_usa: return 'ETF USA'

    termos_rf = ['TESOURO', 'NTN', 'LCI', 'LCA', 'CDB', 'LC', 'DEBENTURE', 'CASH', 'CAIXA']
    if any(x in t_clean for x in termos_rf): return 'Renda Fixa'

    if t_clean[-1].isdigit():
        units_acoes = ['KLBN11', 'SAPR11', 'TAEE11', 'ALUP11', 'SANB11', 'BPAC11', 'ITUB11', 'BBAS11', 'EGIE11']
        if t_clean.endswith('3') or t_clean.endswith('4') or t_clean.endswith('5') or t_clean.endswith('6'):
            return 'Ações Brasil'
        elif t_clean.endswith('11'):
            if t_clean in units_acoes:
                return 'Ações Brasil'
            else:
                return 'FIIs'
        elif t_clean.endswith('32') or t_clean.endswith('33') or t_clean.endswith('34'):
            return 'BDRs'

    return 'Ações Internacional'

# --- CÁLCULO DE POSIÇÃO RV ---
def calcular_carteira(df):
    df = df.copy()
    df['ticker'] = df['ticker'].apply(normalize_ticker)
    df['tipo'] = df['tipo'].astype(str).str.lower().str.strip()
    df['moeda'] = df.get('moeda', 'BRL').astype(str).str.upper().str.strip()
    for c in ['quantidade', 'preco', 'taxas']:
        if c in df.columns: df[c] = pd.to_numeric(df[c], errors='coerce').fillna(0)
    df = df.sort_values('data')
    portfolio = {}
    lucro_realizado_por_moeda = {}
    for _, row in df.iterrows():
        t = row['ticker']
        moeda = row['moeda']
        qtd = float(abs(row['quantidade']))
        preco = float(row['preco'])
        taxas = float(row.get('taxas', 0) or 0)
        if t not in portfolio: portfolio[t] = {"lotes": [], "lucro_realizado": 0.0, "moeda": moeda}
        ativo = portfolio[t]
        if "compra" in row['tipo']:
            custo_total = qtd * preco + taxas
            pm_lote = custo_total / qtd if qtd > 0 else 0
            ativo["lotes"].append({"qtd": qtd, "pm": pm_lote})
        elif "venda" in row['tipo']:
            qtd_vender = qtd
            preco_venda = preco
            lucro = 0.0
            while qtd_vender > 0 and ativo["lotes"]:
                lote = ativo["lotes"][0]
                if lote["qtd"] <= qtd_vender:
                    qtd_consumida = lote["qtd"]
                    ativo["lotes"].pop(0)
                else:
                    qtd_consumida = qtd_vender
                    lote["qtd"] -= qtd_consumida
                lucro += (preco_venda - lote["pm"]) * qtd_consumida
                qtd_vender -= qtd_consumida
            ativo["lucro_realizado"] += lucro
            lucro_realizado_por_moeda[moeda] = lucro_realizado_por_moeda.get(moeda, 0) + lucro
    posicao = []
    for t, dados in portfolio.items():
        qtd_total = sum(l["qtd"] for l in dados["lotes"])
        custo_total = sum(l["qtd"] * l["pm"] for l in dados["lotes"])
        pm_final = (custo_total / qtd_total) if qtd_total > 0 else 0
        posicao.append({
            "Ticker": t, "Setor": identificar_setor_ativo(t), "Qtd": qtd_total,
            "Moeda": dados["moeda"], "PM_Origem": pm_final,
            "Lucro_Realizado_Nativo": dados["lucro_realizado"]
        })
    return pd.DataFrame(posicao), lucro_realizado_por_moeda





# --- FUNÇÃO DA NOVA TAB: EDITOR DE DADOS ---
def exibir_editor_dados():
    st.header("📝 Editor de Registros & Lançamentos")
    st.caption("Adicione, edite ou corrija transações. O sistema fará um backup automático antes de salvar.")

    FILES_CONFIG = get_editor_config()

    def get_file_path(filename):
        return os.path.join(BASE_DIR, filename)

    def backup_file(filepath):
        if os.path.exists(filepath):
            try:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                backup_dir = os.path.join(BASE_DIR, "backups")
                os.makedirs(backup_dir, exist_ok=True)
                shutil.copy(filepath, os.path.join(backup_dir, f"{os.path.basename(filepath)}_{timestamp}.bak"))
            except: pass

    def load_data_editor(filename, config):
        filepath = get_file_path(filename)
        if not os.path.exists(filepath): return None
        try:
            df = pd.read_csv(filepath, sep=config["sep"], decimal=config["decimal"], 
                           thousands=config.get("thousands"), encoding=config["encoding"])
            for col in config.get("date_cols", []):
                if col in df.columns:
                    df[col] = pd.to_datetime(df[col], dayfirst=True, errors='coerce')
            return df
        except Exception as e:
            st.error(f"Erro leitura: {e}"); return None

    col_sel, col_btn = st.columns([3, 1])
    with col_sel:
        selected_key = st.selectbox(
            "Selecione o Arquivo para Editar:", list(FILES_CONFIG.keys()),
            format_func=lambda x: f"{FILES_CONFIG[x]['icon']} {FILES_CONFIG[x]['label']}"
        )
    with col_btn:
        st.write("") 
        st.write("") 
        if st.button("🔄 Recarregar Tabela", use_container_width=True):
            st.session_state.pop('editor_df', None)
            st.rerun()

    if 'editor_df' not in st.session_state or st.session_state.get('editor_file') != selected_key:
        st.session_state.editor_file = selected_key
        st.session_state.editor_df = load_data_editor(selected_key, FILES_CONFIG[selected_key])

    df = st.session_state.editor_df
    cfg = FILES_CONFIG[selected_key]
    filepath = get_file_path(selected_key)

    if df is not None:
        with st.expander("⚡ Adicionar Novo Lançamento", expanded=False):
            form_cols = st.columns(4)
            input_data = {}
            
            history_tickers = []
            if not df.empty:
                possible_cols = ["Ticker", "Símbolo", "ticker", "Símbolo (Symbol)"]
                for c in possible_cols:
                    if c in df.columns:
                        history_tickers = df[c].dropna().unique().tolist()
                        break
            
            fields = cfg.get("form_fields", {})
            idx = 0
            for field_name, field_type in fields.items():
                c = form_cols[idx % 4]
                idx += 1
                
                if field_type == "text_suggest":
                    val_sel = c.selectbox(f"{field_name}", options=[""] + sorted([str(x) for x in history_tickers]), key=f"in_{field_name}")
                    if val_sel == "":
                        input_data[field_name] = c.text_input(f"Novo {field_name}?", key=f"in_new_{field_name}")
                    else:
                        input_data[field_name] = val_sel
                elif isinstance(field_type, list):
                    input_data[field_name] = c.selectbox(field_name, options=field_type, key=f"in_{field_name}")
                elif field_type == "text":
                    input_data[field_name] = c.text_input(field_name, key=f"in_{field_name}")
                elif field_type == "date":
                    input_data[field_name] = c.date_input(field_name, value="today", format="DD/MM/YYYY", key=f"in_{field_name}")
                elif field_type == "currency" or field_type == "number":
                    input_data[field_name] = c.number_input(field_name, min_value=0.0, step=0.01, format="%.2f", key=f"in_{field_name}")

            if st.button("➕ Adicionar Linha", type="primary"):
                if any(str(v).strip() == "" for v in input_data.values()):
                    st.warning("Preencha todos os campos.")
                else:
                    new_row = pd.DataFrame([input_data])
                    if selected_key == "meus_proventos.csv":
                        d_obj = pd.to_datetime(input_data['data'])
                        meses = {1:'jan', 2:'fev', 3:'mar', 4:'abr', 5:'mai', 6:'jun', 7:'jul', 8:'ago', 9:'set', 10:'out', 11:'nov', 12:'dez'}
                        new_row['mes'] = f"{meses[d_obj.month]}/{str(d_obj.year)[-2:]}"
                        new_row['ano'] = d_obj.year
                        if 'decisao' in df.columns: new_row['decisao'] = input_data['lancamento']

                    for d_col in cfg.get("date_cols", []):
                        if d_col in new_row.columns: new_row[d_col] = pd.to_datetime(new_row[d_col])

                    st.session_state.editor_df = pd.concat([st.session_state.editor_df, new_row], ignore_index=True)
                    st.rerun()

        st.markdown("---")
        
        df_edited = st.data_editor(
            st.session_state.editor_df,
            column_config=cfg.get("column_types", {}),
            num_rows="dynamic",
            use_container_width=True,
            height=500,
            key=f"editor_grid_{selected_key}"
        )

        col_save, col_discard = st.columns([1, 4])
        with col_save:
            if st.button("💾 SALVAR DEFINITIVO", type="primary", use_container_width=True):
                try:
                    backup_file(filepath)
                    final_df = df_edited.copy()
                    
                    for d_col in cfg.get("date_cols", []):
                        if d_col in final_df.columns:
                             final_df[d_col] = pd.to_datetime(final_df[d_col]).dt.strftime('%d/%m/%Y')
                    
                    final_df.to_csv(filepath, sep=cfg["sep"], decimal=cfg["decimal"], index=False, encoding=cfg["encoding"])
                    st.session_state.editor_df = df_edited
                    st.cache_data.clear()
                    st.toast("Arquivo salvo com sucesso! Dashboard atualizado.", icon="✅")
                    
                except Exception as e:
                    st.error(f"Erro ao salvar: {e}")
        
        with col_discard:
            if st.button("❌ Descartar Alterações"):
                st.session_state.pop('editor_df', None)
                st.rerun()
    else:
        st.error(f"Arquivo {selected_key} não encontrado na pasta: {BASE_DIR}")


# --- DASHBOARD PRINCIPAL ---
def main():
    with st.sidebar:
        st.header("🔍 Filtros Globais")
        if st.button("🔄 Atualizar Dados", key="btn_sidebar_refresh_master"):
            st.cache_data.clear()
            st.rerun()
        
        # 1. CARREGAMENTO DE DADOS BRUTOS
        df_bruto = load_assets()
        df_proventos_bruto = load_proventos()
        df_rf_raw = load_fixed_income()
        
        # 2. DEFINIÇÃO DE VARIÁVEIS TEMPORAIS (Correção 'data_primeira_transacao')
        if not df_bruto.empty:
            df_bruto['setor_calc'] = df_bruto['ticker'].apply(identificar_setor_ativo)
            if 'moeda' not in df_bruto.columns: df_bruto['moeda'] = 'BRL'
            df_bruto['moeda'] = df_bruto['moeda'].str.upper().str.strip()
            df_bruto['ticker'] = df_bruto['ticker'].str.upper().str.strip()
            
            data_primeira_transacao = df_bruto['data'].min()
        else:
            data_primeira_transacao = datetime.now() - timedelta(days=365)

        # 3. FILTROS LATERAIS (CASCATA)
        df_rv_cascata = df_bruto.copy() if not df_bruto.empty else pd.DataFrame(columns=['ticker', 'moeda', 'setor_calc'])
        df_rf_cascata = df_rf_raw.copy() if not df_rf_raw.empty else pd.DataFrame(columns=['Ticker', 'Moeda'])

        st.markdown("### 🎚️ Macro Filtros")
        filtro_macro = st.multiselect(
            "Classe de Ativo:", 
            ["Renda Variável", "Renda Fixa"], 
            default=["Renda Variável", "Renda Fixa"],
            key="sidebar_macro_class"
        )
        
        # Aplica Macro Filtro
        if filtro_macro and "Renda Variável" not in filtro_macro: df_rv_cascata = df_rv_cascata[0:0]
        if filtro_macro and "Renda Fixa" not in filtro_macro: df_rf_cascata = df_rf_cascata[0:0]

        opcoes_moeda = ['Todas'] + sorted(df_rv_cascata['moeda'].unique())
        filtro_moeda = st.selectbox("Moeda (RV):", opcoes_moeda, key="sidebar_moeda")
        if filtro_moeda != 'Todas': df_rv_cascata = df_rv_cascata[df_rv_cascata['moeda'] == filtro_moeda]

        opcoes_setor = sorted(df_rv_cascata['setor_calc'].unique())
        filtro_setor = st.multiselect("Filtrar por Tipo (RV):", opcoes_setor, key="sidebar_setor")
        if filtro_setor: df_rv_cascata = df_rv_cascata[df_rv_cascata['setor_calc'].isin(filtro_setor)]

        # Filtro de Ticker Unificado
        tickers_rv_disp = df_rv_cascata['ticker'].unique().tolist()
        tickers_rf_disp = df_rf_cascata['Ticker'].unique().tolist() if 'Ticker' in df_rf_cascata.columns else []
        opcoes_ticker = sorted(list(set(tickers_rv_disp + tickers_rf_disp)))
        
        filtro_ticker = st.multiselect("Filtrar Ativos Específicos:", opcoes_ticker, key="sidebar_filtro_ticker")

        lista_rf_permitidos = tickers_rf_disp # Padrão: todos
        if filtro_ticker:
            df_rv_cascata = df_rv_cascata[df_rv_cascata['ticker'].isin(filtro_ticker)]
            lista_rf_permitidos = [t for t in filtro_ticker if t in tickers_rf_disp]

        opcao_ativo = st.selectbox("Ativo na carteira?", ["Todos", "Sim", "Não"], index=0, key="sidebar_ativo_status")

        # Preparação final de RV
        df_aux = df_rv_cascata.copy()
        df_posicao, _ = calcular_carteira(df_bruto)
        ativos_vivos = set(df_posicao[df_posicao['Qtd'] > 0]['Ticker'])
        
        if opcao_ativo == "Sim": df_aux = df_aux[df_aux['ticker'].isin(ativos_vivos)]
        elif opcao_ativo == "Não": df_aux = df_aux[~df_aux['ticker'].isin(ativos_vivos)]
            
        lista_tickers_final = df_aux['ticker'].unique().tolist()
        
        st.markdown("---")
        
        
        # 4. SELETOR DE PERÍODO (Removido filtro, usa todo o período)
        dias = (datetime.now() - data_primeira_transacao).days + 10  # Todo o período
        


    # --- FIM DO SIDEBAR / INÍCIO DO CORPO PRINCIPAL ---
    


# 5. PROCESSAMENTO DE RENDA FIXA (Corrigido: 'Data' e 'Rent. %' restaurados)
    df_rf_completo = pd.DataFrame()
    df_rf_filtrado = pd.DataFrame() # Inicialização segura

    
    if not df_rf_raw.empty:
        df_rf_completo = summarize_fixed_income(df_rf_raw)
    else:
        df_rf_completo = pd.DataFrame(columns=['Ticker', 'Ativo', 'Status', 'Data', 'Investido', 'Atual', 'Lucro', 'Rent. %', 'Moeda'])
        
    # Aplica filtros em df_rf_filtrado
    df_rf_filtrado = df_rf_completo.copy()
    
    if filtro_ticker: 
        df_rf_filtrado = df_rf_filtrado[df_rf_filtrado['Ativo'].isin(lista_rf_permitidos)]
    
    if filtro_macro and "Renda Fixa" not in filtro_macro: 
        df_rf_filtrado = df_rf_filtrado[0:0]
            
        if opcao_ativo == "Sim": 
            df_rf_filtrado = df_rf_filtrado[df_rf_filtrado['Status'] == 'Ativo']
        elif opcao_ativo == "Não": 
            df_rf_filtrado = df_rf_filtrado[df_rf_filtrado['Status'] == 'Encerrado']        


    # 6. DADOS PARA O RESTANTE DO CÓDIGO (Precos e Proventos)
    if 'mapa_precos' not in locals():
        # Se tiver dados, baixa. Se não, dicionário vazio.
        if not df_bruto.empty:
            mapa_precos, mapa_variacao = fetch_market_data(df_bruto['ticker'].unique().tolist())
        else:
            mapa_precos, mapa_variacao = {}, {}
            
    usd = mapa_precos.get('BRL=X', 5.50)
    cad = mapa_precos.get('CADBRL=X', 4.00)
    eur = mapa_precos.get('EURBRL=X', 6.00)
    prov_por_ticker = {}
    if not df_proventos_bruto.empty:
        for _, r in df_proventos_bruto.iterrows():
            t_prov_raw = str(r['ticker']).strip().upper()
            t_prov = normalize_ticker(t_prov_raw) # <--- APLICA PADRONIZAÇÃO

            m_prov = str(r['moeda']).strip().upper()
            val_prov = r['valor']
            
            fator_prov = 1.0
            if m_prov == 'USD': fator_prov = usd
            elif m_prov == 'CAD': fator_prov = cad
            elif m_prov == 'EUR': fator_prov = eur
            
            prov_por_ticker[t_prov] = prov_por_ticker.get(t_prov, 0.0) + (val_prov * fator_prov)

# 7. MOTOR DE CÁLCULO GIPS (Setup das variáveis para a Tab Performance)
    resultado = None
    v_pat = pd.Series(dtype=float)
    v_flux = pd.Series(dtype=float)
    v_cus = pd.Series(dtype=float)
    
    if not df_bruto.empty:
        with st.spinner("Sincronizando mercado e reconstruindo histórico..."):
            
            # Chama o Engine para reconstruir histórico e aplicar fixes
            v_pat, v_flux, v_income, v_force_zero, extra_data = reconstruct_history(
                df_bruto,
                df_proventos_bruto,
                dias
            )
            
            if not v_pat.empty:
                dados_ok = True
                df_prices = extra_data.get("prices", pd.DataFrame())
                s_usd = extra_data.get("usd", None)
                s_eur = extra_data.get("eur", None)
                serie_patrimonio = extra_data.get("full_patrimonio", None)
                tickers_yahoo = extra_data.get("tickers_yahoo", [])
                custodia_diaria = extra_data.get("custodia_diaria", pd.DataFrame())

                # 4. Engine Input (Com Flag de Supressão e Timing)
                v_flow_timing = extra_data.get("flow_timing", pd.Series(0, index=v_pat.index))
                
                df_engine_input = pd.DataFrame({
                    'nav': v_pat,      # NAV Original (Sem alteração)
                    'flow': v_flux,
                    'income': v_income,
                    'force_return_zero': v_force_zero,
                    'flow_timing': v_flow_timing
                }).sort_index()
                
                resultado = run_performance_engine(df_engine_input)
    # --- TABS ---

    # ==============================================================================
    # 8. CONSOLIDAÇÃO DA VISÃO ATUAL (Recuperando df_view)
    # ==============================================================================
    df_view = pd.DataFrame() # Inicializa vazio para evitar o erro
    
    if not df_bruto.empty:
        # Recupera posição de custódia (Qtd)
        df_posicao, _ = calcular_carteira(df_bruto)
        
        # Filtra apenas tickers selecionados nos filtros laterais
        if 'lista_tickers_final' not in locals(): lista_tickers_final = df_posicao['Ticker'].unique().tolist()
        
        lista_final = []
        
        # Preparação de auxiliares de venda e proventos
        vendas_por_ticker = {}
        for _, row in df_bruto.iterrows():
            if 'venda' in str(row['tipo']).lower():
                t_v = str(row['ticker']).strip().upper()
                val_v = row['quantidade'] * row['preco']
                vendas_por_ticker[t_v] = vendas_por_ticker.get(t_v, 0.0) + val_v

        # Loop Principal de Precificação Atual
        for _, row in df_posicao.iterrows():
            t = row['Ticker']
            if t not in lista_tickers_final: continue
            
            m = row['Moeda']
            qtd = row['Qtd']
            pm = row['PM_Origem']
            
            # Recupera Preço Atual (Yahoo ou PM se não tiver)
            preco_atual = mapa_precos.get(t, 0.0)
            usou_estimativa = False
            
            # Regras de precificação para RF ou Ativos sem cotação
            if preco_atual <= 0 or 'TESOURO' in t or 'CDB' in t:
                preco_atual = pm
                usou_estimativa = True
            
            # Câmbio para conversão
            fator_conversao = 1.0
            if m == 'USD': fator_conversao = usd
            elif m == 'EUR': fator_conversao = eur
            elif m == 'CAD': fator_conversao = cad
            
            # Cálculos Financeiros
            valor_hoje_brl = qtd * preco_atual * fator_conversao
            custo_hoje_brl = qtd * pm * fator_conversao
            lucro_aberto_brl = valor_hoje_brl - custo_hoje_brl
            
            # Dados auxiliares (Vendas e Proventos)
            # Nota: prov_por_ticker deve ter sido calculado lá no início (Carregamento)
            # Se não existir, assume 0
            prov_val = prov_por_ticker.get(t, 0.0) if 'prov_por_ticker' in locals() else 0.0
            
            vol_vendas = vendas_por_ticker.get(t, 0.0)
            lucro_realizado_brl = row['Lucro_Realizado_Nativo'] * fator_conversao
            
            # Rentabilidade Simples (%)
            rent_pct = ((preco_atual - pm) / pm * 100) if pm > 0 else 0.0
            
            status_ativo = "🟢 Carteira" if qtd > 0 else "🏁 Encerrado"
            
            lista_final.append({
                'Ticker': t, 
                'Status': status_ativo, 
                'Setor': row['Setor'],
                'Qtd': qtd, 
                'Moeda': m, 
                'Preço Atual': preco_atual,
                'PM Compra': pm, 
                'Valor Hoje (R$)': valor_hoje_brl,
                'Volume Vendas (R$)': vol_vendas * fator_conversao, 
                'Lucro Realiz. (R$)': lucro_realizado_brl,
                'Lucro Aberto (R$)': lucro_aberto_brl, 
                'Proventos (R$)': prov_val,
                'Rent. (%)': rent_pct
            })
            
        df_view = pd.DataFrame(lista_final)
        
        # Filtra duplicidade com Renda Fixa se necessário
        if not df_view.empty and not df_rf_filtrado.empty:
            tickers_rv_existentes = set(df_view['Ticker'].unique())
            df_rf_filtrado = df_rf_filtrado[~df_rf_filtrado['Ticker'].isin(tickers_rv_existentes)]

    # --- AGORA SIM AS TABS PODEM SER CRIADAS ---

    tab_cap, tab_perf, tab_risk, tab1, tab2, tab3, tab4, tab5, tab6, tab7, tab8 = st.tabs([
        "💼 Capa",
        "🚀 Performance",
        "⚠️ Risco",
        "💎 Composição", 
        "📊 Renda Variável", 
        "₿ Cripto", 
        "💱 Câmbio", 
        "💰 Proventos", 
        "🦁 Imposto", 
        "🏦 Renda Fixa", 
        "📝 Editor"
    ])

    with tab_cap:
        st.markdown("## 🧭 Guia de Navegação")
        st.markdown("Bem-vindo ao seu **Sistema de Gestão Patrimonial**. Abaixo, o que você encontra em cada seção:")
        
        c1, c2 = st.columns(2)
        
        with c1:
            st.info("### 📊 Análise & Estratégia")
            st.markdown("""
            *   **🚀 Performance**: Motor de cálculo institucional (GIPS). Analise seu retorno real (TWR) vs retorno financeiro (MWR) e entenda os drivers de lucro (Atribuição).
            *   **⚠️ Risco**: A gestão de defesa. Matriz de correlações, contribuição de risco por ativo e *Testes de Estresse* para simular crises de mercado.
            *   **💎 Composição**: A visão macro "Big Picture". Alocação por Classe, Moeda e Setor. Onde está o seu dinheiro?
            """)
            
            st.warning("### 🔧 Ferramentas & Controle")
            st.markdown("""
            *   **📝 Editor**: Onde tudo começa. Adicione, edite ou corrija transações manuais (Compras, Vendas, Renda Fixa) diretamente na base de dados.
            *   **🦁 Imposto**: Auxiliar para cálculo de IRPF e controle de isenções (20k).
            *   **💱 Câmbio**: Monitor de remessas e estoque de moedas (USD/EUR).
            """)

        with c2:
            st.success("### 📂 Classes de Ativos")
            st.markdown("""
            *   **📊 Renda Variável**: Ações Brasil, Stocks, REITs e ETFs. Tabela detalhada com Preço Médio e Resultado.
            *   **🏦 Renda Fixa**: Controle de Tesouro Direto, CDBs, LCIs/LCAs e Debêntures.
            *   **₿ Cripto**: Monitoramento de ativos digitais (Bitcoin, Ethereum, etc.).
            *   **💰 Proventos**: Calendário de Dividendos e Juros sobre Capital Próprio.
            """)
        
        st.divider()
        st.caption("v4.0 - Institutional Grade | Phase 4: Polish & Optimization")

# -------------------------------------------------------------------------
    # ABA DE PERFORMANCE (STRATEGY VIEW PRO - GIPS COMPLIANT)
    # -------------------------------------------------------------------------
    # -------------------------------------------------------------------------
    # ABA DE PERFORMANCE (REBUILT - PHASE 5)
    # -------------------------------------------------------------------------
    with tab_perf:
        st.markdown("### 🏛️ Institutional Performance (GIPS)")
        
        if 'resultado' in locals() and resultado is not None:
            # KPIS PRINCIPAIS
            k1, k2, k3, k4 = st.columns(4)
            
            with k1:
                st.metric("TWR Acumulado", f"{resultado.total_twr:+.2f}%", help="Retorno Ponderado pelo Tempo (Rentabilidade Real do Gestor)")
            with k2:
                st.metric("TWR Anualizado", f"{resultado.annualized_twr:+.2f}%", help="Taxa Geométrica Anual")
            with k3:
                st.metric("Max Drawdown", f"{resultado.max_drawdown:+.2f}%", help="Pior queda do topo ao fundo no período")
            with k4:
                ult_ret = resultado.daily_returns.iloc[-1] * 100
                st.metric("Retorno Último Dia", f"{ult_ret:+.2f}%")
                
            st.divider()
            
            # GRÁFICO 1: EVOLUÇÃO WEALTH (TWR)
            st.markdown("##### 📈 Curva de Evolução (Fator Acumulado)")
            
            # Prepara dados para plotar
            df_plot = resultado.cumulative_series.to_frame("Strategy TWR")
            
            fig_twr = px.line(df_plot, y="Strategy TWR", title="Crescimento de R$ 100 (Indexado)")
            fig_twr.update_layout(
                template="plotly_dark", 
                yaxis_tickformat="+.1f", 
                hovermode="x unified",
                yaxis_title="Retorno Acumulado (%)"
            )
            # Adiciona linha zero
            fig_twr.add_hline(y=0, line_dash="dash", line_color="gray")
            
            st.plotly_chart(fig_twr, use_container_width=True)
            
            # GRÁFICO 2: UNDERWATER PLOT (DRAWDOWN)
            st.markdown("##### 🌊 Underwater Plot (Drawdown)")
            
            df_dd = resultado.drawdown_series.to_frame("Drawdown")
            
            fig_dd = px.area(df_dd, y="Drawdown", title="Profundidade das Quedas")
            fig_dd.update_layout(
                template="plotly_dark", 
                yaxis_tickformat=".1f", 
                hovermode="x unified",
                yaxis_title="Queda do Topo (%)"
            )
            fig_dd.update_traces(fillcolor="rgba(255, 0, 0, 0.2)", line_color="red")
            
            st.plotly_chart(fig_dd, use_container_width=True)
            
            st.divider()
            
            # --- ÁREA DE ATRIBUIÇÃO (Reconstrução Simplificada) ---
            if 'v_pat' in locals() and not v_pat.empty:
                 st.markdown("### 🧩 Atribuição de Retorno (Contribuição)")
                 # Recalcula MTM detalhado (necessário pois serie_patrimonio era agregado)
                 # Usamos as series cortadas 'mask' definidas anteriormente
                 
                 idx_slice = v_pat.index
                 df_holdings_mtm = pd.DataFrame(index=idx_slice, columns=tickers_yahoo)
                 df_asset_returns = pd.DataFrame(index=idx_slice, columns=tickers_yahoo)
                 
                 for t in tickers_yahoo:
                    if t in df_prices.columns and t in custodia_diaria.columns:
                        # Dados Brutos
                        q = custodia_diaria.loc[idx_slice, t]
                        p = df_prices.loc[idx_slice, t]
                        
                        # Moeda
                        m_ativo = df_bruto[df_bruto['ticker']==t]['moeda'].iloc[-1]
                        if m_ativo == 'USD': fx = s_usd.loc[idx_slice]
                        elif m_ativo == 'EUR': fx = s_eur.loc[idx_slice]
                        else: fx = 1.0
                        
                        # MTM
                        df_holdings_mtm[t] = q * p * fx
                        
                        # Retorno
                        p_base = p * fx
                        df_asset_returns[t] = p_base.pct_change().fillna(0.0)
                 
                 df_holdings_mtm = df_holdings_mtm.fillna(0.0)
                 df_asset_returns = df_asset_returns.fillna(0.0)
                 
                 # Core Calc
                 df_contrib = calcular_contribuicao_cache(df_holdings_mtm, df_asset_returns)
                 
                 if not df_contrib.empty:
                    # Mapa Ticker -> Setor/Classe
                    map_setor = dict(zip(df_bruto['ticker'], df_bruto['setor_calc']))
                    df_contrib_setor = group_contributions(df_contrib, map_setor)
                    
                    # Resample Mensal Somado
                    df_contrib_month = df_contrib_setor.resample('ME').apply(lambda x: (1 + x).prod() - 1) * 100
                    
                    # Chart
                    df_melt = df_contrib_month.reset_index().melt(id_vars=df_contrib_month.index.name or 'index', 
                                                                  var_name='Classe', value_name='Contribuição')
                    col_date = df_melt.columns[0]
                    
                    fig_attr = px.bar(
                        df_melt, x=col_date, y='Contribuição', color='Classe', 
                        title="Drivers de Retorno Mensal (Pontos p.p.)",
                        color_discrete_sequence=px.colors.qualitative.Safe
                    )
                    fig_attr.update_layout(template="plotly_dark", hovermode="x unified", legend=dict(orientation="h"))
                    st.plotly_chart(fig_attr, use_container_width=True)
                 else:
                    st.caption("Sem dados suficientes para atribuição granular.")
            
        else:
            st.warning("Dados insuficientes para cálculo de performance.")
            
    # -------------------------------------------------------------------------
    # ABA DE RISCO & ALOCAÇÃO (NOVO PHASE 3)
    # -------------------------------------------------------------------------
    with tab_risk:
        st.markdown("### ⚠️ Anatomia do Risco")
        st.caption("Entenda de onde vem a volatilidade do seu portfólio.")
        
        # Recálculo isolado de dados para garantir integridade nesta aba
        if 'dados_ok' in locals() and dados_ok and 'v_pat' in locals():
            idx_risk = v_pat.index[-126:] if len(v_pat) > 126 else v_pat.index # Últimos 6 meses
            
            # Reconstroi dados MTM e Returns para janela de risco
            df_h_risk = pd.DataFrame(index=idx_risk, columns=tickers_yahoo)
            df_r_risk = pd.DataFrame(index=idx_risk, columns=tickers_yahoo)
            
            ativos_validos_risk = []
            
            for t in tickers_yahoo:
                if t in df_prices.columns and t in custodia_diaria.columns:
                    q = custodia_diaria.loc[idx_risk, t]
                    p = df_prices.loc[idx_risk, t]
                    
                    # Moeda
                    m_ativo = df_bruto[df_bruto['ticker']==t]['moeda'].iloc[-1]
                    if m_ativo == 'USD': fx = s_usd.loc[idx_risk]
                    elif m_ativo == 'EUR': fx = s_eur.loc[idx_risk]
                    else: fx = 1.0
                    
                    mtm = q * p * fx
                    df_h_risk[t] = mtm.fillna(0)
                    
                    # Preço Base para retorno
                    p_base = p * fx
                    df_r_risk[t] = p_base.pct_change().fillna(0)
                    
                    if mtm.iloc[-1] > 100: # Apenas ativos com saldo relevante hoje
                        ativos_validos_risk.append(t)
            
            if ativos_validos_risk:
                df_h_risk = df_h_risk[ativos_validos_risk]
                df_r_risk = df_r_risk[ativos_validos_risk]
                
                # 1. Matriz de Correlação
                st.markdown("##### 🔥 Mapa de Calor (Correlações)")
                corr_matrix = calcular_correlacao_cache(df_r_risk)
                
                fig_corr = px.imshow(
                    corr_matrix, 
                    text_auto=".2f", 
                    aspect="auto", 
                    color_continuous_scale="RdBu_r", 
                    zmin=-1, zmax=1,
                    title="Correlação (6 Meses)"
                )
                st.plotly_chart(fig_corr, use_container_width=True)
                
                st.divider()
                
                # 2. Contribuição Marginal ao Risco
                st.markdown("##### 💣 De onde vem o Risco? (Risk Contribution)")
                st.caption("Quanto cada ativo contribui para a volatilidade total do portfolio.")
                
                df_risk_contrib = calcular_risco_cache(df_h_risk, df_r_risk)
                
                if not df_risk_contrib.empty:
                    df_risk_contrib['Pct_Risk_Contrib'] *= 100
                    
                    # Gráfico de Barras
                    fig_rc = px.bar(
                        df_risk_contrib, 
                        x=df_risk_contrib.index, 
                        y='Pct_Risk_Contrib',
                        color='Pct_Risk_Contrib',
                        color_continuous_scale='OrRd',
                        title="Contribuição % para o Risco Total"
                    )
                    fig_rc.update_layout(yaxis_title="% do Risco Total")
                    st.plotly_chart(fig_rc, use_container_width=True)
                    
                    # Insight Textual
                    top_risk = df_risk_contrib.index[0]
                    top_val = df_risk_contrib.iloc[0]['Pct_Risk_Contrib']
                    st.info(f"💡 O ativo **{top_risk}** é responsável por **{top_val:.1f}%** do risco total da carteira neste momento.")
                
            else:
                st.warning("Poucos ativos com saldo para análise de risco.")
        else:
            st.info("Dados insuficientes para análise de risco.")
            
        st.divider()
        st.markdown("### 🌪️ Simulador de Estresse")
        st.caption("O que acontece com seu patrimônio se o mercado cair?")
        
        # Stress Test
        shock_pct = st.slider("Choque no Mercado de Renda Variável (Ações/FIIs/Exterior)", min_value=-50, max_value=50, value=-10, step=5, format="%d%%")
        
        if 'v_pat' in locals() and not v_pat.empty:
            # Tenta identificar ativos de risco (RV)
            # Regra: Não contém 'TESOURO' nem 'CDB' nem 'LCI' nem 'LCA'e não é Caixa
            # Ou usar o df_bruto['classe'] se mapeado. Vamos usar uma heurística simples baseada em nomes comuns de RF.
            
            nav_atual = v_pat.iloc[-1]
            
            # Filtra ativos de risco no ultimo df_posicao (que é df_custodia? Não, df_posicao calculado no inicio)
            # Vamos usar df_liquidez e df_custodia que já estão separados na Tab RF, mas aqui podem não estar disponíveis se não rodamos a Tab RF ainda.
            # Melhor usar df_holdings_mtm.iloc[-1] que calculamos acima
            
            if 'df_h_risk' in locals() and not df_h_risk.empty:
                posicao_atual = df_h_risk.iloc[-1]
                
                # Definição simplificada de "Risco" (Exclui RF explícita)
                # Assumindo que o que veio do Yahoo é Risco (pois RF geralmente n tem cotação yahoo neste sistema, exceto se mapeado)
                # Mas o sistema puxa cotacao de tudo.
                # Vamos checar o Tipo/Classe df_bruto
                
                risco_total_exp = 0.0
                for t, val in posicao_atual.items():
                    # Verifica tipo no df_bruto
                    tipo = str(df_bruto[df_bruto['ticker'] == t]['tipo'].iloc[-1]).lower()
                    
                    # Heurística: Considera Risco tudo que NÃO é Renda Fixa clara ou Caixa
                    # Como df_h_risk já vem de tickers_yahoo (que geralmente são RV), assumimos Risco por padrão.
                    
                    # Exceções (Ativos que não devem sofrer choque de Equity):
                    if 'caixa' in tipo or 'tesouro' in tipo or 'cdb' in tipo or 'lci' in tipo or 'lca' in tipo or t in ['BRL=X', 'USD=X', 'EUR=X', 'USDBRL=X', 'EURBRL=X']:
                        pass 
                    else:
                        risco_total_exp += val
                
                impacto = risco_total_exp * (shock_pct / 100)
                nav_stress = nav_atual + impacto
                pct_total_impact = (impacto / nav_atual) * 100 if nav_atual > 0 else 0
                
                c1, c2, c3 = st.columns(3)
                c1.metric("Exposição ao Choque", f"R$ {risco_total_exp:,.2f}")
                c2.metric("Impacto Estimado", f"R$ {impacto:,.2f}", delta=f"{pct_total_impact:.2f}% (no NAV)", delta_color="inverse")
                c3.metric("Patrimônio Simulado", f"R$ {nav_stress:,.2f}")


        else:
            # TELA DE ERRO AMIGÁVEL (ZERO STATE)
            st.warning("⚠️ **Dados Insuficientes para Análise.**")
            st.markdown("""
            O sistema não encontrou dados suficientes no período selecionado para gerar o relatório GIPS.
            
            **Possíveis causas:**
            1. O filtro de data (barra lateral) é anterior ao início da sua carteira.
            2. Não há cotações atualizadas (o download do Yahoo falhou).
            3. A planilha de ativos está vazia.
            
            👉 *Tente aumentar o período na barra lateral ou clicar em 'Atualizar Dados'.*
            """)
            
    with tab1:
            st.subheader("💎 Visão do Gestor (Portfólio Global)")
        
            lista_global_graficos = []
            
            if not df_view.empty:
                df_rv_g = df_view[df_view['Valor Hoje (R$)'] > 1.0].copy()
                commodities_list = ['IAU', 'SIVR', 'SLV', 'GLD', 'DBC', 'SIVIR']
                cripto_list = ['BTC', 'ETH', 'SOL', 'USDT', 'USDC', 'BTC-USD', 'HBAR']
                
                df_rv_g.loc[df_rv_g['Ticker'].isin(commodities_list), 'Setor'] = 'Commodities'
                df_rv_g.loc[df_rv_g['Ticker'].isin(cripto_list), 'Setor'] = 'Cripto'
                
                lista_global_graficos.append(df_rv_g[['Ticker', 'Setor', 'Moeda', 'Valor Hoje (R$)', 'Rent. (%)']])

            if 'df_rf_filtrado' in locals() and not df_rf_filtrado.empty:
                df_rf_g = df_rf_filtrado[df_rf_filtrado['Status'] == 'Ativo'].copy()
                
                if not df_rf_g.empty:
                    df_rf_g['Ticker'] = df_rf_g['Ativo']
                    df_rf_g['Valor Hoje (R$)'] = df_rf_g['Atual']
                    df_rf_g['Rent. (%)'] = df_rf_g['Rent. %']
                    df_rf_g['Moeda'] = 'BRL'
                    
                    mask_cx = df_rf_g['Ativo'].str.contains('Caixa|Cash|Disponivel|Saldo', case=False, na=False)
                    df_rf_g.loc[mask_cx, 'Setor'] = 'Caixa/Liquidez'
                    df_rf_g.loc[~mask_cx, 'Setor'] = 'Renda Fixa'
                    
                    lista_global_graficos.append(df_rf_g[['Ticker', 'Setor', 'Moeda', 'Valor Hoje (R$)', 'Rent. (%)']])

            if lista_global_graficos:
                df_grafico = pd.concat(lista_global_graficos, ignore_index=True)
            else:
                df_grafico = pd.DataFrame()

            if not df_grafico.empty:
                total_view = df_grafico['Valor Hoje (R$)'].sum()
                
                with st.container(border=True):
                    k1, k2, k3 = st.columns(3)
                    ativo_top = df_grafico.loc[df_grafico['Rent. (%)'].idxmax()]
                    ativo_low = df_grafico.loc[df_grafico['Rent. (%)'].idxmin()]
                    
                    k1.metric("🚀 Maior Rentabilidade", ativo_top['Ticker'], f"{ativo_top['Rent. (%)']:.1f}%")
                    k2.metric("🐢 Menor Rentabilidade", ativo_low['Ticker'], f"{ativo_low['Rent. (%)']:.1f}%", delta_color="inverse")
                    k3.metric("📊 Patrimônio Gráfico", f"R$ {total_view:,.2f}", help="Total considerado nestes gráficos")

                st.markdown("### 🗺️ Mapa de Calor Global (Risco & Retorno)")
                max_rent = df_grafico['Rent. (%)'].max()
                min_rent = df_grafico['Rent. (%)'].min()
                scale_range = max(abs(max_rent), abs(min_rent), 15)

                fig_tree = px.treemap(
                    df_grafico, 
                    path=[px.Constant("Portfólio Global"), 'Setor', 'Ticker'], 
                    values='Valor Hoje (R$)',
                    color='Rent. (%)', 
                    color_continuous_scale='RdYlGn', 
                    range_color=[-scale_range, scale_range],
                    hover_data={'Valor Hoje (R$)':':.2f', 'Rent. (%)':':.2f'}
                )
                fig_tree.update_layout(margin=dict(t=30, l=0, r=0, b=0), height=500)
                st.plotly_chart(fig_tree, use_container_width=True)

                st.markdown("---")

                col_esq, col_dir = st.columns([1, 1])
                with col_esq:
                    st.markdown("#### 🍩 Distribuição Estratégica (Geo & Classe)")
                    
                    def classificar_camadas(row):
                        macro = 'Renda Variável'
                        if row['Setor'] in ['Renda Fixa', 'Caixa/Liquidez']:
                            macro = 'Renda Fixa'
                        
                        sub = row['Setor']
                        tkr = str(row['Ticker']).upper()
                        
                        if macro == 'Renda Fixa':
                            if 'CAIXA' in tkr or 'SALDO' in tkr or 'CASH' in tkr or row['Setor'] == 'Caixa/Liquidez': 
                                sub = 'Caixa'
                            elif 'CDB' in tkr: sub = 'CDBs'
                            elif 'LCI' in tkr or 'LCA' in tkr: sub = 'LCI/LCA'
                            elif 'DEBENTURE' in tkr: sub = 'Debêntures'
                            else: 
                                sub = 'Tesouro Direto'
                            
                        elif sub == 'Ações Internacional':
                            ativos_mundo = ['VWRA', 'WRLD', 'ACWI', 'VT', 'URTH', 'ASML', 'DPM', 'TSM']
                            
                            if any(x in tkr for x in ativos_mundo) or '.TO' in tkr: 
                                sub = 'Ações Mundo'
                            else:
                                sub = 'Ações EUA' 
                        
                        return pd.Series([macro, sub])

                    df_grafico[['Layer1', 'Layer2']] = df_grafico.apply(classificar_camadas, axis=1)
                    
                    fig_sun = px.sunburst(
                        df_grafico, 
                        path=['Layer1', 'Layer2', 'Ticker'], 
                        values='Valor Hoje (R$)', 
                        color='Layer2', 
                        color_discrete_sequence=px.colors.qualitative.Prism
                    )
                    
                    fig_sun.update_layout(margin=dict(t=10, l=10, r=10, b=10), height=700)
                    fig_sun.update_traces(textinfo="label+percent entry", insidetextorientation='radial') 
                    st.plotly_chart(fig_sun, use_container_width=True)

                with col_dir:
                    st.markdown("#### 💱 Exposição Cambial Global")
                    fig_moeda = px.pie(
                        df_grafico, 
                        values='Valor Hoje (R$)', 
                        names='Moeda', 
                        hole=0.5, 
                        color_discrete_sequence=['#2E7D32', '#1565C0', '#F9A825', '#757575']
                    )
                    fig_moeda.update_layout(margin=dict(t=10, l=10, r=10, b=10), height=300, showlegend=True)
                    st.plotly_chart(fig_moeda, use_container_width=True)
                    
                    st.markdown("---")
                    
                    st.markdown("#### 🏦 Custódia (Brasil vs Exterior)")
                    df_grafico['Local'] = df_grafico['Moeda'].apply(lambda x: 'Exterior' if x != 'BRL' else 'Brasil')
                    
                    fig_local = px.pie(
                        df_grafico, 
                        values='Valor Hoje (R$)', 
                        names='Local', 
                        hole=0.5, 
                        color_discrete_sequence=px.colors.qualitative.Safe
                    )
                    fig_local.update_layout(margin=dict(t=10, l=10, r=10, b=10), height=300, showlegend=True)
                    st.plotly_chart(fig_local, use_container_width=True)

                st.markdown("---")


                st.markdown("#### 🏆 Ranking de Rentabilidade (Carteira Completa)")
                
                if not df_grafico.empty:
                    df_podium = df_grafico.sort_values('Rent. (%)', ascending=True).copy()
                    
                    df_podium['Cor'] = df_podium['Rent. (%)'].apply(lambda x: '#4CAF50' if x >= 0 else '#FF5252')
                    
                    altura_dinamica = max(450, len(df_podium) * 30)

                    fig_bar = px.bar(
                        df_podium, 
                        x='Rent. (%)', 
                        y='Ticker', 
                        orientation='h', 
                        text='Rent. (%)', 
                        hover_data=['Valor Hoje (R$)', 'Setor']
                    )
                    
                    fig_bar.update_traces(
                        marker_color=df_podium['Cor'], 
                        texttemplate='%{text:.1f}%', 
                        textposition='outside'
                    )
                    
                    fig_bar.update_layout(
                        yaxis={'categoryorder':'total ascending'}, 
                        height=altura_dinamica, 
                        margin=dict(r=50), 
                        xaxis_title="Rentabilidade (%)",
                        yaxis_title=None
                    )
                    
                    st.plotly_chart(fig_bar, use_container_width=True)
                else:
                    st.info("Nenhum ativo encontrado com os filtros atuais.")        


                st.markdown("#### 🎯 Risco x Retorno (Scatter)")
                fig_scat = px.scatter(
                    df_grafico, 
                    x='Valor Hoje (R$)', 
                    y='Rent. (%)', 
                    size='Valor Hoje (R$)', 
                    color='Setor', 
                    hover_name='Ticker', 
                    size_max=40
                )
                fig_scat.add_hline(y=0, line_dash="dash", line_color="gray")
                fig_scat.update_layout(height=450, showlegend=False, xaxis_title="Volume Financeiro", yaxis_title="Rentabilidade %")
                st.plotly_chart(fig_scat, use_container_width=True)

                with st.expander("🐋 Análise de Concentração (Pareto Global)", expanded=True):
                    df_pareto = df_grafico.sort_values('Valor Hoje (R$)', ascending=False).copy()
                    total_pareto = df_pareto['Valor Hoje (R$)'].sum()
                    df_pareto['Acumulado (%)'] = (df_pareto['Valor Hoje (R$)'].cumsum() / total_pareto) * 100
                    
                    df_pareto_view = df_pareto.head(25)
                    
                    fig_pareto = go.Figure()
                    fig_pareto.add_trace(go.Bar(
                        x=df_pareto_view['Ticker'], y=df_pareto_view['Valor Hoje (R$)'], 
                        name='Valor (R$)', marker_color='#2196F3'
                    ))
                    fig_pareto.add_trace(go.Scatter(
                        x=df_pareto_view['Ticker'], y=df_pareto_view['Acumulado (%)'], 
                        name='Acumulado %', yaxis='y2', 
                        mode='lines+markers', line=dict(color='#FF5252', width=3)
                    ))
                    fig_pareto.update_layout(
                        title="Concentração de Ativos (Top 25)",
                        yaxis=dict(title="Valor Investido (R$)"),
                        yaxis2=dict(title="Acumulado (%)", overlaying='y', side='right', range=[0, 110], showgrid=False),
                        height=500, legend=dict(x=0.5, y=1.1, orientation='h')
                    )
                    st.plotly_chart(fig_pareto, use_container_width=True)

                st.markdown("---")
                st.header("📂 Composição Detalhada (Extra - USD)")
                df_comp = carregar_composicao_extra()
                if not df_comp.empty:
                    # Normalização de Colunas Essenciais
                    col_mapping = {
                        'Símbolo (Symbol)': 'Ativo',
                        'Descrição (Description)': 'Nome',
                        'Setor (Sector)': 'Classe',
                        'Valor Líquido (Net Value)': 'Valor (USD)'
                    }
                    df_comp.rename(columns=lambda x: col_mapping.get(x, x), inplace=True)
                    
                    # Garante que as colunas existam
                    if 'Classe' not in df_comp.columns: 
                        df_comp['Classe'] = df_comp.get('Setor', 'Indefinido')
                    
                    if 'Ativo' not in df_comp.columns:
                        df_comp['Ativo'] = df_comp.get('Símbolo', 'Desconhecido')
                        
                    if 'Valor (USD)' not in df_comp.columns:
                        # Tenta encontrar alguma coluna de valor
                        cols_val = [c for c in df_comp.columns if 'Valor' in c or 'Value' in c]
                        if cols_val: df_comp['Valor (USD)'] = df_comp[cols_val[0]]
                        else: df_comp['Valor (USD)'] = 0.0

                    col_valor = 'Valor (USD)'
                    
                    # Filtra valores positivos
                    df_comp = df_comp[df_comp[col_valor] > 0]
                    df_comp = df_comp.sort_values(by=col_valor, ascending=False)
                    
                    total_comp = df_comp[col_valor].sum()
                    df_comp['Peso (%)'] = (df_comp[col_valor] / total_comp) * 100
                    
                    col_c1, col_c2 = st.columns(2)
                    with col_c1:
                        st.subheader("🍩 Por Classe")
                        fig_comp = px.pie(df_comp, values=col_valor, names='Classe', hole=0.5, color_discrete_sequence=px.colors.qualitative.Vivid)
                        fig_comp.update_traces(textinfo="percent+label")
                        fig_comp.update_layout(margin=dict(t=20, l=20, r=20, b=20), height=400)
                        st.plotly_chart(fig_comp, use_container_width=True)
                    with col_c2:
                        st.subheader("🍩 Por Ativo")
                        fig_ativo = px.pie(df_comp, values=col_valor, names='Ativo', hole=0.5, color_discrete_sequence=px.colors.qualitative.Prism)
                        fig_ativo.update_traces(textinfo="percent+label")
                        fig_ativo.update_layout(margin=dict(t=20, l=20, r=20, b=20), height=400)
                        st.plotly_chart(fig_ativo, use_container_width=True)
                    
                    st.subheader("📋 Tabela de Ativos (Decrescente)")
                    altura_tabela = min((len(df_comp) + 1) * 35, 1200)
                    st.dataframe(df_comp.style.format({col_valor: 'US$ {:,.2f}', 'Peso (%)': '{:.2f}%'}), use_container_width=True, height=altura_tabela)
                else: 
                    st.info("Arquivo 'composicao.csv' não encontrado ou vazio.")
            else:
                st.info("Nenhum ativo com saldo positivo para gerar gráficos globais.")

    with tab2:
        st.subheader("🌍 Renda Variável - Detalhamento")
        if not df_view.empty:
            df_detalhes = df_view[df_view['Setor'].isin(['Ações Brasil', 'Ações Internacional', 'ETF', 'FIIs', 'Cripto', 'Commodities', 'REITs'])].copy()
            
            if not df_detalhes.empty:
                usd = mapa_precos.get('BRL=X', 5.00)
                cad = mapa_precos.get('CADBRL=X', 3.70)
                eur = mapa_precos.get('EURBRL=X', 5.40)
                fx_map = {"USD": usd, "CAD": cad, "EUR": eur, "BRL": 1}
                
                mapa_var_local = locals().get('mapa_variacao', globals().get('mapa_variacao', {}))

                for col in ['PM Compra', 'Preço Atual', 'Qtd']: 
                    df_detalhes[col] = pd.to_numeric(df_detalhes[col], errors='coerce').fillna(0)
                
                df_detalhes['FX'] = df_detalhes['Moeda'].map(fx_map).fillna(1)
                df_detalhes['Valor Atual BRL'] = df_detalhes['Qtd'] * df_detalhes['Preço Atual'] * df_detalhes['FX']
                df_detalhes['Custo BRL'] = df_detalhes['Qtd'] * df_detalhes['PM Compra'] * df_detalhes['FX']
                
                def calc_daily_profit(row):
                    tkr = row['Ticker']
                    var_unit = mapa_var_local.get(tkr, 0.0)
                    return row['Qtd'] * var_unit * row['FX']
                df_detalhes['Lucro Diário (R$)'] = df_detalhes.apply(calc_daily_profit, axis=1)

                df_detalhes['Lucro Não Realizado (BRL)'] = df_detalhes['Valor Atual BRL'] - df_detalhes['Custo BRL']
                
                if 'Lucro Realiz. (R$)' in df_detalhes.columns: 
                    df_detalhes['Lucro Realizado (BRL)'] = df_detalhes['Lucro Realiz. (R$)']
                else: 
                    df_detalhes['Lucro Realizado (BRL)'] = 0
                
                df_kpi = df_detalhes[df_detalhes['Qtd'] > 0]
                total_valor = df_kpi['Valor Atual BRL'].sum()
                
                st.markdown("---")
                st.markdown("### 🏅 Destaques — Lucro NÃO Realizado (BRL)")
                df_rank = df_kpi.sort_values('Lucro Não Realizado (BRL)', ascending=False)
                col_top, col_bottom = st.columns(2)
                with col_top:
                    st.write("**Top 5 (Aberto)**")
                    st.dataframe(df_rank[['Ticker', 'Moeda', 'Lucro Não Realizado (BRL)']].head(5).style.format({'Lucro Não Realizado (BRL)': 'R$ {:,.2f}'}), use_container_width=True)
                with col_bottom:
                    st.write("**Bottom 5 (Aberto)**")
                    st.dataframe(df_rank[['Ticker', 'Moeda', 'Lucro Não Realizado (BRL)']].tail(5).style.format({'Lucro Não Realizado (BRL)': 'R$ {:,.2f}'}), use_container_width=True)

                st.markdown("---")
                
                df_detalhes['Resultado Total (R$)'] = (
                    df_detalhes['Lucro Não Realizado (BRL)'].fillna(0) + 
                    df_detalhes['Lucro Realizado (BRL)'].fillna(0) + 
                    df_detalhes['Proventos (R$)'].fillna(0)
                )

                def calcular_rentabilidade_total(row):
                    custo = row['Custo BRL']
                    if custo <= 0: 
                        custo = row['Volume Vendas (R$)'] - row['Lucro Realizado (BRL)']
                    if custo > 0:
                        return (row['Resultado Total (R$)'] / custo) * 100
                    return 0.0

                df_detalhes['Rent. BRL (%)'] = df_detalhes.apply(calcular_rentabilidade_total, axis=1)

                st.markdown("### 📊 Tabela Consolidada — Ativos Atuais + Encerrados")

                tabela = df_detalhes.rename(columns={'Valor Atual BRL': 'Valor Mercado (R$)'})[[ 
                    'Ticker', 'Setor', 'Moeda', 'Qtd', 'PM Compra', 'Preço Atual',
                    'Lucro Diário (R$)',
                    'Custo BRL', 'Valor Mercado (R$)', 'Volume Vendas (R$)',
                    'Lucro Não Realizado (BRL)', 'Lucro Realizado (BRL)', 'Proventos (R$)', 
                    'Resultado Total (R$)', 'Rent. BRL (%)'
                ]].copy()

                tabela = tabela.sort_values('Valor Mercado (R$)', ascending=False)

                def color_diario(val):
                    color = '#2E7D32' if val >= 0 else '#C62828'
                    return f'color: {color}; font-weight: bold'

                st.dataframe(
                    tabela.style.format({
                        'Qtd': '{:,.2f}', 
                        'PM Compra': '{:,.2f}', 
                        'Preço Atual': '{:,.2f}',
                        'Lucro Diário (R$)': 'R$ {:,.2f}',
                        'Custo BRL': 'R$ {:,.2f}', 
                        'Valor Mercado (R$)': 'R$ {:,.2f}', 
                        'Volume Vendas (R$)': 'R$ {:,.2f}', 
                        'Lucro Não Realizado (BRL)': 'R$ {:,.2f}',
                        'Lucro Realizado (BRL)': 'R$ {:,.2f}', 
                        'Proventos (R$)': 'R$ {:,.2f}', 
                        'Resultado Total (R$)': 'R$ {:,.2f}'
                    })
                    .map(color_diario, subset=['Lucro Diário (R$)'])
                    .background_gradient(subset=['Resultado Total (R$)'], cmap='RdYlGn', vmin=-total_valor*0.1, vmax=total_valor*0.1)
                    .apply(lambda x: ['font-weight: bold; background-color: #f0f2f6' if x['Ticker'] == 'TOTAL 💰' else '' for i in x], axis=1),
                    
                    column_config={
                        "Rent. BRL (%)": st.column_config.ProgressColumn(
                            "Rentabilidade",
                            format="%.2f%%",
                            min_value=-100,
                            max_value=100
                        ),
                        "Ticker": st.column_config.TextColumn("Ativo", width="small"),
                    },
                    use_container_width=True, 
                    height=600
                )

                st.markdown("### 🧬 Rentabilidade Total por Ativo (Composição)")
                st.caption("Barra Sólida: Valorização Não Realizada | Barra Clara: Lucro Realizado + Proventos")

                df_chart = df_detalhes.sort_values('Rent. BRL (%)', ascending=True).copy()

                df_chart['Resultado_Bolso_Abs'] = df_chart['Proventos (R$)'].fillna(0) + df_chart['Lucro Realizado (BRL)'].fillna(0)
                df_chart['Resultado_NaoRealizado_Abs'] = df_chart['Resultado Total (R$)'] - df_chart['Resultado_Bolso_Abs']

                df_chart['Custo_Estimado'] = df_chart.apply(
                    lambda x: x['Resultado Total (R$)'] / (x['Rent. BRL (%)'] / 100) if x['Rent. BRL (%)'] != 0 else 0, 
                    axis=1
                )

                df_chart['Pct_Nao_Realizado'] = df_chart.apply(
                    lambda x: (x['Resultado_NaoRealizado_Abs'] / x['Custo_Estimado'] * 100) if x['Custo_Estimado'] != 0 else 0, 
                    axis=1
                )
                df_chart['Pct_Bolso'] = df_chart.apply(
                    lambda x: (x['Resultado_Bolso_Abs'] / x['Custo_Estimado'] * 100) if x['Custo_Estimado'] != 0 else 0, 
                    axis=1
                )

                cores_base = [
                    '#4CAF50' if x > 0 else '#FF5252' if x < 0 else '#FFEB3B' 
                    for x in df_chart['Rent. BRL (%)']
                ]

                altura_grafico = max(500, len(df_chart) * 30)

                fig_perf = go.Figure()

                fig_perf.add_trace(go.Bar(
                    y=df_chart['Ticker'],
                    x=df_chart['Pct_Nao_Realizado'],
                    name='Não Realizado (Valoriação)',
                    orientation='h',
                    marker_color=cores_base,
                    marker_opacity=1.0, 
                    customdata=np.stack((
                        df_chart['Resultado_NaoRealizado_Abs'], 
                        df_chart['Rent. BRL (%)']
                    ), axis=-1),
                    hovertemplate="<b>Não Realizado:</b> %{x:.1f}%<br>R$ %{customdata[0]:.2f}<extra></extra>"
                ))

                fig_perf.add_trace(go.Bar(
                    y=df_chart['Ticker'],
                    x=df_chart['Pct_Bolso'],
                    name='Realizado + Proventos',
                    orientation='h',
                    marker_color=cores_base,
                    marker_opacity=0.3, 
                    text=df_chart['Rent. BRL (%)'], 
                    texttemplate='%{text:.1f}%',
                    textposition='outside',
                    customdata=np.stack((
                        df_chart['Resultado_Bolso_Abs'], 
                        df_chart['Proventos (R$)'], 
                        df_chart['Lucro Realizado (BRL)']
                    ), axis=-1),
                    hovertemplate=(
                        "<b>Bolso (Realizado + Prov):</b> %{x:.1f}%<br>"
                        "Total Bolso: R$ %{customdata[0]:.2f}<br>"
                        "<i>(Div: %{customdata[1]:.2f} + Realiz: %{customdata[2]:.2f})</i><extra></extra>"
                    )
                ))

                fig_perf.update_layout(
                    barmode='relative', 
                    height=altura_grafico,
                    xaxis_title="Rentabilidade Total (%)",
                    yaxis_title=None,
                    showlegend=True,
                    legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
                    margin=dict(l=0, r=40, t=30, b=30),
                    yaxis=dict(type='category')
                )

                fig_perf.add_vline(x=0, line_width=1, line_color="gray", line_dash="dot")

                st.plotly_chart(fig_perf, use_container_width=True)
                st.markdown("---")

            else: 
                st.info("Nenhuma posição de Renda Variável encontrada.")
        else: 
            st.info("Nenhum dado disponível para visualização.")


    with tab3:
        col_head, col_logo = st.columns([5, 1])
        with col_head:
            st.header("₿ Cripto Command Center")
            st.caption("Monitoramento de ativos digitais, volatilidade e custódia.")
        
        st.divider()

        if not df_view.empty:
            df_cripto = df_view[df_view['Setor'] == 'Cripto'].copy()
            
            if not df_cripto.empty:
                df_cripto['Custo BRL'] = df_cripto['Valor Hoje (R$)'] - df_cripto['Lucro Aberto (R$)']

                total_cripto = df_cripto['Valor Hoje (R$)'].sum()
                custo_cripto = df_cripto['Custo BRL'].sum()
                pnl_cripto = df_cripto['Lucro Aberto (R$)'].sum()
                pnl_pct_cripto = (pnl_cripto / custo_cripto * 100) if custo_cripto > 0 else 0
                
                top_asset = df_cripto.loc[df_cripto['Rent. (%)'].idxmax()]
                
                k1, k2, k3, k4 = st.columns(4)
                k1.metric("Patrimônio Cripto", f"R$ {total_cripto:,.2f}", help="Valor de mercado atual consolidado")
                k2.metric("Resultado (PnL)", f"R$ {pnl_cripto:,.2f}", f"{pnl_pct_cripto:.2f}%")
                k3.metric("Custo de Aquisição", f"R$ {custo_cripto:,.2f}")
                k4.metric("🚀 Top Performer", top_asset['Ticker'], f"{top_asset['Rent. (%)']:.1f}%")
                
                st.divider()

                col_chart, col_dist = st.columns([2, 1])

                with col_chart:
                    lista_ativos = df_cripto['Ticker'].unique().tolist()
                    index_def = next((i for i, x in enumerate(lista_ativos) if 'BTC' in x), 0)
                    
                    st.markdown("##### 🔎 Análise Técnica do Ativo")
                    ativo_sel = st.selectbox("Selecione o Ativo:", lista_ativos, index=index_def, label_visibility="collapsed")
                    
                    row_ativo = df_cripto[df_cripto['Ticker'] == ativo_sel].iloc[0]
                    pm_ativo = row_ativo['PM Compra']
                    
                    @st.cache_data(ttl=3600)
                    def get_crypto_chart(tkr):
                        try:
                            if '-' not in tkr: 
                                symbol = f"{tkr}-USD"
                            else:
                                symbol = tkr
                                
                            d = yf.download(symbol, period="1y", interval="1d", progress=False)
                            if isinstance(d.columns, pd.MultiIndex): d.columns = d.columns.get_level_values(0)
                            return d[['Close']]
                        except: return pd.DataFrame()

                    df_chart = get_crypto_chart(ativo_sel)

                    # Exibir preço atual no topo
                    if not df_chart.empty:
                        current_price = df_chart['Close'].iloc[-1]
                        st.metric(f"Preço Atual de {ativo_sel}", f"${current_price:,.2f}", help="Cotação em USD do ativo selecionado.")
                    else:
                        st.warning("Não foi possível obter o preço atual.")

                    if not df_chart.empty:
                        current_price = df_chart['Close'].iloc[-1]
                        
                        df_chart['SMA21'] = df_chart['Close'].rolling(21).mean()
                        
                        y_min = df_chart['Close'].min()
                        y_max = df_chart['Close'].max()
                        margin = (y_max - y_min) * 0.1 
                        range_y = [y_min - margin, y_max + margin]
                        
                        fig_c = go.Figure()
                        
                        fig_c.add_trace(go.Scatter(
                            x=df_chart.index, y=df_chart['Close'], 
                            mode='lines', name='Preço',
                            fill='tozeroy',
                            line=dict(color='#F7931A' if 'BTC' in ativo_sel else '#627EEA', width=2), 
                            fillcolor='rgba(247, 147, 26, 0.1)' if 'BTC' in ativo_sel else 'rgba(98, 126, 234, 0.1)'
                        ))
                        
                        fig_c.add_trace(go.Scatter(x=df_chart.index, y=df_chart['SMA21'], mode='lines', name='MM 21d', line=dict(color='white', width=1, dash='dot')))

                        if pm_ativo > 0:
                            ratio = abs(pm_ativo - current_price) / current_price
                            if ratio < 50: 
                                color_pm = "#4CAF50" if current_price >= pm_ativo else "#FF5252"
                                fig_c.add_hline(
                                    y=pm_ativo, line_dash="dash", line_color=color_pm, line_width=2,
                                    annotation_text=f"Seu PM: {pm_ativo:,.2f}", annotation_position="top right", annotation_font_color=color_pm
                                )

                        fig_c.update_layout(
                            height=350, 
                            hovermode="x unified", 
                            margin=dict(l=0, r=0, t=10, b=0),
                            template="plotly_dark",
                            showlegend=False,
                            yaxis=dict(range=range_y)
                        )
                        st.plotly_chart(fig_c, use_container_width=True)

                        

                with col_dist:
                    st.markdown("##### 🍰 Alocação")
                    fig_pie = px.pie(
                        df_cripto, 
                        values='Valor Hoje (R$)', 
                        names='Ticker', 
                        hole=0.6,
                        color_discrete_sequence=px.colors.qualitative.Bold
                    )
                    fig_pie.update_layout(
                        showlegend=True, 
                        legend=dict(orientation="h", y=-0.2), 
                        margin=dict(t=0, b=0, l=0, r=0), 
                        height=380
                    )
                    fig_pie.update_traces(textinfo='percent+label', textposition='inside')
                    st.plotly_chart(fig_pie, use_container_width=True)

                st.divider()

                st.subheader("📋 Detalhamento de Posições")
                
                cols_show = ['Ticker', 'Qtd', 'PM Compra', 'Preço Atual', 'Valor Hoje (R$)', 'Lucro Aberto (R$)', 'Rent. (%)', 'Custo BRL']
                
                st.dataframe(
                    df_cripto[cols_show].sort_values('Valor Hoje (R$)', ascending=False),
                    column_config={
                        "Ticker": st.column_config.TextColumn("Ativo"),
                        "Qtd": st.column_config.NumberColumn("Qtd", format="%.6f"),
                        "PM Compra": st.column_config.NumberColumn("PM Médio", format="%.2f"),
                        "Preço Atual": st.column_config.NumberColumn("Cotação", format="%.2f"),
                        "Valor Hoje (R$)": st.column_config.NumberColumn("Saldo (R$)", format="R$ %.2f"),
                        "Lucro Aberto (R$)": st.column_config.NumberColumn("PnL (R$)", format="R$ %.2f"),
                        "Custo BRL": st.column_config.NumberColumn("Investido (R$)", format="R$ %.2f"),
                        "Rent. (%)": st.column_config.ProgressColumn(
                            "Rentabilidade", 
                            format="%.1f%%", 
                            min_value=-100, 
                            max_value=100
                        ),
                    },
                    use_container_width=True,
                    height=max(200, len(df_cripto) * 35 + 38)
                )

            else:
                st.info("ℹ️ Nenhuma criptomoeda encontrada na sua carteira. Adicione transações com setor 'Cripto'.")
        else:
            st.info("Carregando dados...")


    with tab4:
        c_head, c_refresh = st.columns([5,1])
        with c_head:
            st.header("💱 FX Command Center")
        
        st.divider()

        carteiras = {}
        moedas_encontradas = set()    
        
        def init_wallet(moeda):
            if moeda not in carteiras:
                carteiras[moeda] = {
                    'moeda_base': 'BRL',
                    'pm_cambio': 0.0,
                    'investido_rv': 0.0,
                    'atual_rv': 0.0,
                    'investido_rf': 0.0,
                    'atual_rf': 0.0,
                    'caixa': 0.0
                }

        with st.container(border=True):
            cols = st.columns(6)
            
            tickers_monitor = [
                ('🇺🇸 USD', 'BRL=X'), 
                ('🇪🇺 EUR', 'EURBRL=X'), 
                ('🇨🇦 CAD', 'CADBRL=X'), 
                ('🇨🇭 CHF/USD', 'CHFUSD=X')
            ]
            
            for i, (label, ticker) in enumerate(tickers_monitor):
                val = mapa_precos.get(ticker, 0.0)
                var = mapa_variacao.get(ticker, 0.0)
                simbolo = "US$" if ticker == 'CHFUSD=X' else "R$"
                cols[i].metric(label, f"{simbolo} {val:.3f}", f"{var:.3f}", delta_color="normal")

        # Removed try-except to debug UI
        df_cambio = load_cambio()
        
        if not df_cambio.empty:
            df_cambio['moeda_origem'] = df_cambio['moeda_origem'].str.upper().str.strip()
            df_cambio['moeda_destino'] = df_cambio['moeda_destino'].str.upper().str.strip()
            # Debug: st.dataframe(df_cambio.head()) 
            
            todas_moedas = set(df_cambio['moeda_origem'].unique()) | set(df_cambio['moeda_destino'].unique())
            moedas_encontradas.update(todas_moedas - {'BRL'})

            for moeda in moedas_encontradas:
                init_wallet(moeda)
                # Case 1: BRL -> Moeda (Buy FX)
                filt_entrada = df_cambio[(df_cambio['moeda_destino'] == moeda) & (df_cambio['moeda_origem'] == 'BRL')]
                if not filt_entrada.empty:
                    carteiras[moeda]['moeda_base'] = 'BRL'
                    reais_gastos = filt_entrada['valor_origem'].sum()
                    moeda_recebida = filt_entrada['valor_destino'].sum()
                    carteiras[moeda]['pm_cambio'] = reais_gastos / moeda_recebida if moeda_recebida > 0 else 0
                
                # Case 2: USD -> Moeda (Cross FX, e.g. USD -> CHF)
                filt_cross = df_cambio[(df_cambio['moeda_destino'] == moeda) & (df_cambio['moeda_origem'] == 'USD')]
                if not filt_cross.empty:
                    carteiras[moeda]['moeda_base'] = 'USD'
                    usd_gasto = filt_cross['valor_origem'].sum()
                    moeda_rec = filt_cross['valor_destino'].sum()
                    carteiras[moeda]['pm_cambio'] = usd_gasto / moeda_rec if moeda_rec > 0 else 0

        if 'df_view' in locals() and not df_view.empty:
            for _, row in df_view.iterrows():
                moeda_ativo = str(row['Moeda']).upper().strip()
                if moeda_ativo in ['BRL', 'NAN', 'NONE', '']: continue
                moedas_encontradas.add(moeda_ativo)
                init_wallet(moeda_ativo)
                qtd = row.get('Qtd', 0.0)
                if qtd > 0:
                    pm_compra = row.get('PM Compra', 0.0)
                    preco_mkt = row.get('Preço Atual', 0.0) 
                    if preco_mkt <= 0: preco_mkt = row.get('Preco Atual', pm_compra)
                    carteiras[moeda_ativo]['investido_rv'] += (qtd * pm_compra)
                    carteiras[moeda_ativo]['atual_rv'] += (qtd * preco_mkt)

        if 'df_rf_filtrado' in locals() and not df_rf_filtrado.empty:
             rf_ativos_fx = df_rf_filtrado[df_rf_filtrado['Status'] == 'Ativo']
             for _, row in rf_ativos_fx.iterrows():
                 m_rf = str(row.get('Moeda', 'BRL')).upper().strip()
                 if m_rf in ['BRL', 'NAN', 'NONE', '']: continue
                 moedas_encontradas.add(m_rf)
                 init_wallet(m_rf)
                 nome_ativo = str(row.get('Ativo', '')).upper()
                 investido = row.get('Investido', 0.0)
                 atual = row.get('Atual', 0.0)
                 if atual <= 0: atual = investido
                 if 'CAIXA' in nome_ativo or 'SALDO' in nome_ativo or 'CASH' in nome_ativo or 'DISPONIVEL' in nome_ativo:
                     carteiras[m_rf]['caixa'] += atual
                 else:
                     carteiras[m_rf]['investido_rf'] += investido
                     carteiras[m_rf]['atual_rf'] += atual

        lista_moedas = sorted(list(moedas_encontradas))

        if not lista_moedas:
            st.info("Nenhuma exposição em moeda estrangeira identificada.")
        else:
            c_sel, _ = st.columns([2, 5])
            with c_sel:
                idx_ini = lista_moedas.index('USD') if 'USD' in lista_moedas else 0
                moeda_sel = st.selectbox("🏳️ Selecione a Carteira:", lista_moedas, index=idx_ini)

            d = carteiras[moeda_sel]
            
            caixa = d['caixa']
            total_investido_ativos = d['investido_rv'] + d['investido_rf']
            total_atual_ativos = d['atual_rv'] + d['atual_rf']
            
            exposicao_total = total_atual_ativos + caixa
            pm_usuario = d['pm_cambio']
            simbolo_base = "R$" if d['moeda_base'] == 'BRL' else "US$"

            ticker_yahoo = f"{moeda_sel}{d['moeda_base']}=X"
            if d['moeda_base'] == 'USD': ticker_yahoo = f"{moeda_sel}=X"

            @st.cache_data(ttl=3600)
            def get_history_fx(t):
                try: return yf.download(t, period="1y", interval="1d", progress=False)['Close']
                except: return pd.DataFrame()

            df_hist = get_history_fx(ticker_yahoo)
            cotacao_raw = mapa_precos.get(ticker_yahoo, 0.0)
            
            if cotacao_raw <= 0 and not df_hist.empty:
                try: cotacao_raw = float(df_hist.iloc[-1].iloc[0] if isinstance(df_hist, pd.DataFrame) else df_hist.iloc[-1])
                except: cotacao_raw = 1.0
            if cotacao_raw <= 0: cotacao_raw = 1.0

            is_indirect = False 
            if d['moeda_base'] == 'USD' and moeda_sel in ['CAD', 'JPY', 'CHF', 'SEK', 'EUR', 'GBP', 'AUD']:
                is_indirect = True
            
            if is_indirect:
                valor_base_hoje = exposicao_total / cotacao_raw 
                valor_base_custo = (exposicao_total / pm_usuario) if pm_usuario > 0 else 0.0
                
                cotacao_exib = 1 / cotacao_raw
                pm_visual = 1 / pm_usuario if pm_usuario > 0 else 0.0

            else:
                valor_base_hoje = exposicao_total * cotacao_raw
                valor_base_custo = exposicao_total * pm_usuario
                
                cotacao_exib = cotacao_raw
                pm_visual = pm_usuario

            pnl_valor = valor_base_hoje - valor_base_custo
            
            if valor_base_custo > 0:
                pnl_pct = (pnl_valor / valor_base_custo) * 100
            else:
                pnl_pct = 0.0

            st.markdown(f"#### 🎯 Performance Cambial ({moeda_sel} $\\to$ {d['moeda_base']})")
            
            k1, k2, k3, k4 = st.columns(4)
            
            k1.metric(f"Posição ({moeda_sel})", f"{exposicao_total:,.2f}")
            k2.metric(f"PnL Cambial ({d['moeda_base']})", f"{simbolo_base} {pnl_valor:,.2f}", f"{pnl_pct:.2f}%", delta_color="normal")
            k3.metric(f"PM Ajustado", f"{simbolo_base} {pm_visual:.4f}", help="Preço Médio ajustado.")
            k4.metric(f"Cotação Atual", f"{simbolo_base} {cotacao_exib:.4f}", help=f"Ticker: {ticker_yahoo}")

            st.markdown("---")
            
            # Transaction History (The missing "View of Contributions")
            with st.expander("📜 Histórico de Aportes (Trades)", expanded=False):
                # Filter for ANY trade involving this currency (Source or Destination)
                cols_show = ['data', 'corretora destino', 'moeda_origem', 'valor_origem', 'taxa', 'valor_destino', 'moeda_destino']
                
                df_show = df_cambio[
                    (df_cambio['moeda_destino'] == moeda_sel) | 
                    (df_cambio['moeda_origem'] == moeda_sel)
                ].copy()
                
                if not df_show.empty:
                    df_show = df_show.sort_values('data', ascending=False)
                    
                    # Calculate PnL for Inflows (Buying the currency)
                    df_show['valor_atual_base'] = 0.0
                    df_show['pnl_valor'] = 0.0
                    df_show['pnl_pct'] = 0.0
                    
                    # Only calculate for rows where we BOUGHT the selected currency (Inflow)
                    mask_inflow = df_show['moeda_destino'] == moeda_sel
                    
                    if is_indirect:
                        # Indirect: Value Now = Amount(Currency) / Rate
                        # Rate expected is Currency/Base (e.g. USD/EUR). 
                        # If Quote is "Base per Currency" (e.g. EURUSD), divide.
                        # Using proven app logic: valor_base_hoje = exposicao_total / cotacao_raw
                        df_show.loc[mask_inflow, 'valor_atual_base'] = df_show.loc[mask_inflow, 'valor_destino'] / cotacao_raw
                    else:
                        # Direct: Value Now = Amount(Currency) * Rate
                        df_show.loc[mask_inflow, 'valor_atual_base'] = df_show.loc[mask_inflow, 'valor_destino'] * cotacao_raw
                        
                    # PnL = Value Now - Cost (valor_origem)
                    # Note: valor_origem is the Cost in Source Currency. If Source != Base, this is approximate.
                    # Assuming Source is usually Base (BRL).
                    df_show.loc[mask_inflow, 'pnl_valor'] = df_show.loc[mask_inflow, 'valor_atual_base'] - df_show.loc[mask_inflow, 'valor_origem']
                    
                    # PnL %
                    df_show.loc[mask_inflow, 'pnl_pct'] = (df_show.loc[mask_inflow, 'pnl_valor'] / df_show.loc[mask_inflow, 'valor_origem']).fillna(0.0)
                    
                    # --- Summary KPIs ---
                    total_purchased_dest = df_show.loc[mask_inflow, 'valor_destino'].sum()
                    
                    # Logic Requested: PnL = (Total Volume * Current Rate) - (Total Volume * PM User)
                    # This ensures consistency with the "PM Ajustado" displayed above.
                    
                    if is_indirect:
                        # Indirect (e.g. USD/EUR): PM is in USD/EUR. 
                        # Cost in Base = Volume / PM. Current in Base = Volume / Rate.
                        theoretical_cost_base = total_purchased_dest / pm_usuario if pm_usuario > 0 else 0.0
                        current_val_base = total_purchased_dest / cotacao_raw
                    else:
                        # Direct (e.g. BRL/USD): PM is in BRL.
                        # Cost in Base = Volume * PM. Current in Base = Volume * Rate.
                        theoretical_cost_base = total_purchased_dest * pm_usuario
                        current_val_base = total_purchased_dest * cotacao_raw
                        
                    total_pnl_hist = current_val_base - theoretical_cost_base
                    total_pnl_pct_hist = (total_pnl_hist / theoretical_cost_base * 100) if theoretical_cost_base > 0 else 0.0
                    
                    c_kpi1, c_kpi2 = st.columns(2)
                    c_kpi1.metric(f"💰 Total Comprado ({moeda_sel})", f"{simbolo} {total_purchased_dest:,.2f}")
                    c_kpi2.metric("💸 Lucro/Prejuízo (Histórico)", f"R$ {total_pnl_hist:,.2f}", f"{total_pnl_pct_hist:.2f}%", delta_color="normal")
                    
                    st.divider()
                    # --------------------

                    cols_show = ['data', 'corretora destino', 'moeda_origem', 'valor_origem', 'taxa', 'valor_destino', 'moeda_destino', 'pnl_valor', 'pnl_pct']

                    st.dataframe(
                        df_show[cols_show],
                        column_config={
                            "data": st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
                            "corretora destino": "Corretora",
                            "moeda_origem": "Origem",
                            "valor_origem": st.column_config.NumberColumn("Investido (R$)", format="R$ %.2f"),
                            "taxa": st.column_config.NumberColumn("Taxa (VET)", format="%.4f"),
                            "valor_destino": st.column_config.NumberColumn("Recebido", format="%.2f"),
                            "moeda_destino": "Destino",
                            "pnl_valor": st.column_config.NumberColumn("Lucro/Prej (R$)", format="R$ %.2f"),
                            "pnl_pct": st.column_config.NumberColumn("Rentab. (%)", format="%.2f%%"),
                        },
                        use_container_width=True,
                        hide_index=True
                    )
                else:
                    st.info(f"Nenhum registro encontrado para {moeda_sel}.")
            
            inverter = is_indirect

            if d['investido_rv'] > 0 and pm_usuario > 0:
                with st.expander("🌊 Decomposição de Lucro (Ativos vs. Câmbio)", expanded=True):
                    
                    total_rv_original_moeda = d['investido_rv']
                    total_rv_atual_moeda = d['atual_rv']
                    
                    if is_indirect:
                        investido_base = total_rv_original_moeda / pm_usuario
                        delta_ativo_base = (total_rv_atual_moeda - total_rv_original_moeda) / pm_usuario
                        val_atual_convertido_hoje = total_rv_atual_moeda / cotacao_raw
                        val_atual_convertido_pm = total_rv_atual_moeda / pm_usuario
                        delta_cambio_base = val_atual_convertido_hoje - val_atual_convertido_pm
                        valor_final_base = val_atual_convertido_hoje
                    else:
                        investido_base = total_rv_original_moeda * pm_usuario
                        delta_ativo_base = (total_rv_atual_moeda - total_rv_original_moeda) * pm_usuario
                        delta_cambio_base = total_rv_atual_moeda * (cotacao_raw - pm_usuario)
                        valor_final_base = total_rv_atual_moeda * cotacao_raw

                    fig_water = go.Figure(go.Waterfall(
                        name="Atribuição", orientation="v",
                        measure=["relative", "relative", "relative", "total"],
                        x=["Investido Inicial", "Resultado Papéis", "Variação Cambial", "Valor Atual"],
                        textposition="outside",
                        text=[
                            f"{simbolo_base} {investido_base/1000:.1f}k",
                            f"{'+' if delta_ativo_base > 0 else ''}{simbolo_base} {delta_ativo_base/1000:.1f}k",
                            f"{'+' if delta_cambio_base > 0 else ''}{simbolo_base} {delta_cambio_base/1000:.1f}k",
                            f"{simbolo_base} {valor_final_base/1000:.1f}k"
                        ],
                        y=[investido_base, delta_ativo_base, delta_cambio_base, valor_final_base],
                        connector={"line": {"color": "rgb(63, 63, 63)"}},
                        decreasing={"marker": {"color": "#FF4B4B"}},
                        increasing={"marker": {"color": "#00C805"}},
                        totals={"marker": {"color": "#2979FF"}}
                    ))

                    fig_water.update_layout(
                        title=dict(text=f"Origem do Retorno em {d['moeda_base']}", font=dict(size=14)),
                        waterfallgap=0.1, template="plotly_dark", height=350,
                        margin=dict(l=20, r=20, t=40, b=20)
                    )
                    st.plotly_chart(fig_water, use_container_width=True)

            col_grafico, col_dados = st.columns([2, 1])

            with col_grafico:
                st.subheader(f"📈 Análise Técnica: {moeda_sel} vs {d['moeda_base']}")
                
                if not df_hist.empty:
                    if isinstance(df_hist, pd.Series): df_hist = df_hist.to_frame()
                    if isinstance(df_hist.columns, pd.MultiIndex): df_hist.columns = df_hist.columns.get_level_values(0)
                    
                    series_plot = df_hist.iloc[:, 0]
                    if inverter: 
                        series_plot = 1 / series_plot

                    sma = series_plot.rolling(window=21).mean()
                    
                    y_min = series_plot.min()
                    y_max = series_plot.max()
                    margin = (y_max - y_min) * 0.1
                    range_y = [y_min - margin, y_max + margin]

                    fig = go.Figure()
                    fig.add_trace(go.Scatter(
                        x=series_plot.index, y=series_plot.values,
                        mode='lines', name='Cotação',
                        fill='tozeroy', line=dict(color='#00B0FF', width=2),
                        fillcolor='rgba(0, 176, 255, 0.1)'
                    ))

                    fig.add_trace(go.Scatter(
                        x=sma.index, y=sma.values,
                        mode='lines', name='Média 21d',
                        line=dict(color='white', width=1, dash='dot')
                    ))

                    pm_usuario_val = d['pm_cambio']
                    if inverter and pm_usuario_val > 0:
                        pm_visual_g = 1 / pm_usuario_val
                    else:
                        pm_visual_g = pm_usuario_val

                    if pm_visual_g > 0:
                        cor_pm = '#00E676' if cotacao_exib >= pm_visual_g else '#FF5252' 
                        fig.add_hline(y=pm_visual_g, line_width=2, line_dash="dash", line_color=cor_pm)
                        fig.add_annotation(
                            x=series_plot.index[-1], y=pm_visual_g,
                            text=f"Seu PM: {pm_visual_g:.4f}",
                            showarrow=False, yshift=10, font=dict(color=cor_pm, size=12)
                        )

                    fig.update_layout(
                        template="plotly_dark", height=400,
                        margin=dict(l=20, r=20, t=30, b=20),
                        hovermode="x unified", showlegend=True,
                        legend=dict(orientation="h", y=1.02, xanchor="right", x=1),
                        yaxis=dict(range=range_y)
                    )
                    st.plotly_chart(fig, use_container_width=True)
                else:
                    st.warning("Dados históricos indisponíveis.")

            with col_dados:
                st.subheader("📊 Alocação")
                
                labels = ['Caixa', 'Renda Variável', 'Renda Fixa']
                values = [caixa, d['atual_rv'], d['atual_rf']]
                
                clean_data = [(l, v) for l, v in zip(labels, values) if v > 0]
                
                if clean_data:
                    labels_c, values_c = zip(*clean_data)
                    fig_pie = px.pie(values=values_c, names=labels_c, hole=0.5, color_discrete_sequence=['#00E676', '#2979FF', '#FFCA28'])
                    fig_pie.update_layout(showlegend=True, margin=dict(t=0, b=0, l=0, r=0), height=250, legend=dict(orientation="h"))
                    st.plotly_chart(fig_pie, use_container_width=True)

                st.markdown("###### Detalhamento Patrimonial")
                df_break = pd.DataFrame({
                    'Categoria': ['Caixa Livre', 'Renda Variável', 'Renda Fixa'],
                    'Investido': [caixa, d['investido_rv'], d['investido_rf']],
                    'Valor Atual': [caixa, d['atual_rv'], d['atual_rf']]
                })
                df_break = df_break[df_break['Valor Atual'] > 0]
                
                st.dataframe(
                    df_break.style.format({'Investido': '{:,.2f}', 'Valor Atual': '{:,.2f}'}), 
                    hide_index=True, use_container_width=True
                )

            st.markdown("---")

            with st.container(border=True):
                st.subheader("⚡ Stress Test & Cenários")
                st.caption(f"Simule o impacto da variação cambial sobre o seu patrimônio total em {moeda_sel}.")
                
                shock = st.slider(f"Ajuste a Variação da Cotação ({moeda_sel})", -50, 50, 0, format="%+d%%")
                
                cotacao_base_sim = cotacao_exib if cotacao_exib > 0 else 1.0
                cotacao_simulada = cotacao_base_sim * (1 + shock/100)
                patrimonio_convertido_hoje = exposicao_total * cotacao_base_sim
                patrimonio_convertido_sim = exposicao_total * cotacao_simulada
                diff_financeira = patrimonio_convertido_sim - patrimonio_convertido_hoje
                
                sc1, sc2, sc3 = st.columns(3)
                sc1.metric("Cotação Simulada", f"{simbolo_base} {cotacao_simulada:.4f}", delta=f"{shock}%", delta_color="off")
                sc2.metric(f"Patrimônio Convertido ({d['moeda_base']})", f"{simbolo_base} {patrimonio_convertido_sim:,.2f}")
                cor_delta = "normal" if diff_financeira >= 0 else "inverse"
                sc3.metric("Impacto Financeiro Estimado", f"{simbolo_base} {diff_financeira:,.2f}", delta="Ganho Potencial" if diff_financeira > 0 else "Perda Potencial", delta_color=cor_delta)

    with tab5:
        if not df_proventos_bruto.empty:
            df_p = df_proventos_bruto.copy()
            
            if filtro_moeda != 'Todas': 
                df_p = df_p[df_p['moeda'] == filtro_moeda]
            
            df_p['setor_calc'] = df_p['ticker'].apply(identificar_setor_ativo)

            if filtro_setor:
                df_p = df_p[df_p['setor_calc'].isin(filtro_setor)]
            
            if lista_tickers_final:
                def limpar_sufixo_prov(t): return str(t).replace('.SA', '').replace('.TO', '').replace('.L', '').strip().upper()
                tickers_permitidos = {limpar_sufixo_prov(t) for t in lista_tickers_final}
                df_p = df_p[df_p['ticker'].apply(limpar_sufixo_prov).isin(tickers_permitidos)]
            else: 
                df_p = df_p[0:0]

            def conv_brl(row):
                m = str(row['moeda']).strip().upper()
                v = row['valor']
                if m == 'USD': return v * usd
                if m == 'CAD': return v * cad
                if m == 'EUR': return v * eur
                return v
            
            if not df_p.empty: 
                df_p['valor_brl'] = df_p.apply(conv_brl, axis=1)

            st.subheader("💰 Extrato de Proventos (Consolidado R$)")
            
            if not df_p.empty:
                df_p['ano_real'] = df_p['data'].dt.year
                df_p['mes_real'] = df_p['data'].dt.month
                anos_disponiveis = sorted(df_p['ano_real'].unique().tolist(), reverse=True)
                meses_map = {1:'Jan', 2:'Fev', 3:'Mar', 4:'Abr', 5:'Mai', 6:'Jun', 7:'Jul', 8:'Ago', 9:'Set', 10:'Out', 11:'Nov', 12:'Dez'}
                
                col_ano, col_mes = st.columns(2)
                with col_ano: 
                    anos_sel = st.multiselect("📅 Filtrar Anos:", anos_disponiveis, placeholder="Todos os anos")
                with col_mes:
                    opcoes_meses = list(meses_map.values())
                    meses_sel_nomes = st.multiselect("📅 Filtrar Meses:", opcoes_meses, placeholder="Todos os meses")
                    meses_sel = [k for k,v in meses_map.items() if v in meses_sel_nomes]
                
                df_filter = df_p.copy()
                if anos_sel: df_filter = df_filter[df_filter['ano_real'].isin(anos_sel)]
                if meses_sel: df_filter = df_filter[df_filter['mes_real'].isin(meses_sel)]

                if not df_filter.empty:
                    container_kpi = st.container()
                    st.markdown("---")
                    
                    col_evolucao, col_proporcao = st.columns([2, 1])
                    
                    with col_proporcao:
                        st.write("🏆 **Top Pagadores**")
                        grp = st.radio("Agrupar:", ["Ativo", "Categoria", "Tipo"], horizontal=True, label_visibility="collapsed", key="radio_pie_group")
                        col_grp = 'ticker'
                        if grp == "Categoria" and 'categoria' in df_filter.columns: col_grp = 'categoria'
                        elif grp == "Tipo" and 'lancamento' in df_filter.columns: col_grp = 'lancamento'
                        
                        df_pie = df_filter.groupby(col_grp)['valor_brl'].apply(lambda x: x[x>0].sum()).reset_index().sort_values('valor_brl', ascending=False)
                        if not df_pie.empty:
                            fig_p = px.pie(df_pie, values='valor_brl', names=col_grp, hole=0.4, color_discrete_sequence=px.colors.qualitative.Prism)
                            fig_p.update_traces(textinfo='percent+label', textposition='inside')
                            fig_p.update_layout(showlegend=False, margin=dict(t=20, b=0, l=0, r=0), height=350)
                            st.plotly_chart(fig_p, use_container_width=True)
                        else: 
                            st.info("Sem valores positivos para gráfico.")

                    with container_kpi:
                        bruto = df_filter[df_filter['valor_brl'] > 0]['valor_brl'].sum()
                        imposto_val = abs(df_filter[df_filter['valor_brl'] < 0]['valor_brl'].sum())
                        liq = df_filter['valor_brl'].sum()
                        qtd_meses = len(df_filter['data'].dt.to_period('M').unique())
                        media = liq / qtd_meses if qtd_meses > 0 else 0
                        
                        k1, k2, k3, k4 = st.columns(4)
                        k1.metric("Total Bruto", f"R$ {bruto:,.2f}")
                        k2.metric("Impostos", f"R$ {imposto_val:,.2f}", delta="-Retido", delta_color="normal")
                        k3.metric("Líquido (Caixa)", f"R$ {liq:,.2f}")
                        k4.metric("Média Mensal", f"R$ {media:,.2f}")

                    st.markdown("### 🧾 Resumo por Ativo")
                    df_resumo_simples = df_filter.groupby('ticker')['valor_brl'].sum().reset_index().sort_values('valor_brl', ascending=False)
                    st.dataframe(df_resumo_simples.style.format({'valor_brl': 'R$ {:,.2f}'}), use_container_width=True, height=250)
                    
                    st.markdown("---")
                    
                    with col_evolucao:
                        df_filter['pos'] = df_filter['valor_brl'].apply(lambda x: x if x > 0 else 0)
                        df_filter['neg'] = df_filter['valor_brl'].apply(lambda x: x if x < 0 else 0)
                        df_filter['sort'] = df_filter['data'].dt.strftime('%Y-%m')
                        df_filter['mes'] = df_filter['data'].dt.strftime('%b/%Y')
                        df_time = df_filter.groupby(['sort', 'mes']).agg({'valor_brl':'sum', 'pos':'sum', 'neg':'sum'}).reset_index().sort_values('sort')
                        
                        if not df_time.empty:
                            fig_t = px.bar(df_time, x='mes', y='valor_brl', title="Evolução Mensal (Líquido)", custom_data=['pos', 'neg'])
                            fig_t.update_traces(marker_color='#00CC96', hovertemplate="<b>%{x}</b><br>Líq: R$ %{y:,.2f}<br>Bruto: %{customdata[0]:,.2f}<br>Imp: %{customdata[1]:,.2f}")
                            fig_t.update_layout(hovermode="x unified", xaxis={'type':'category'}, height=450)
                            st.plotly_chart(fig_t, use_container_width=True)


                    st.markdown("### 🌊 Fluxo de Capital (Ticker ➔ Setor ➔ Moeda)")
                    
                    df_L1 = df_filter.groupby(['ticker', 'setor_calc'])['valor_brl'].sum().reset_index()
                    df_L1.columns = ['source', 'target', 'value']
                    
                    df_L2 = df_filter.groupby(['setor_calc', 'moeda'])['valor_brl'].sum().reset_index()
                    df_L2.columns = ['source', 'target', 'value']

                    df_L1 = df_L1[df_L1['value'] > 0]
                    df_L2 = df_L2[df_L2['value'] > 0]

                    if not df_L1.empty and not df_L2.empty:
                        labels_tickers = sorted(df_L1['source'].unique().tolist())
                        labels_sectors = sorted(df_L1['target'].unique().tolist())
                        labels_moedas  = sorted(df_L2['target'].unique().tolist())
                        
                        all_labels = labels_tickers + labels_sectors + labels_moedas
                        
                        id_map = {label: i for i, label in enumerate(all_labels)}
                        
                        sources = []
                        targets = []
                        values = []
                        colors = []

                        for _, row in df_L1.iterrows():
                            sources.append(id_map[row['source']])
                            targets.append(id_map[row['target']])
                            values.append(row['value'])
                            colors.append('rgba(33, 150, 243, 0.4)') 

                        for _, row in df_L2.iterrows():
                            sources.append(id_map[row['source']]) 
                            targets.append(id_map[row['target']])
                            values.append(row['value'])
                            colors.append('rgba(76, 175, 80, 0.4)') 

                        node_colors = []
                        for label in all_labels:
                            if label in labels_tickers: node_colors.append("#2196F3") 
                            elif label in labels_sectors: node_colors.append("#4CAF50") 
                            else: node_colors.append("#FF9800") 

                        fig_sankey = go.Figure(data=[go.Sankey(
                            node = dict(
                              pad = 20,
                              thickness = 20,
                              line = dict(color = "black", width = 0.5),
                              label = all_labels,
                              color = node_colors,
                              hovertemplate='%{label}<br>Total: R$ %{value:,.2f}<extra></extra>'
                            ),
                            link = dict(
                              source = sources,
                              target = targets,
                              value = values,
                              color = colors,
                              hovertemplate='Fluxo: R$ %{value:,.2f}<extra></extra>'
                            )
                        )])

                        fig_sankey.update_layout(
                            height=600, 
                            font=dict(size=12, color="white"),
                            template="plotly_dark",
                            margin=dict(l=10, r=10, t=30, b=30),
                            paper_bgcolor='rgba(0,0,0,0)', 
                            plot_bgcolor='rgba(0,0,0,0)'
                        )
                        
                        st.plotly_chart(fig_sankey, use_container_width=True)
                        
                    else:
                        st.info("Dados insuficientes para gerar o fluxo de 3 níveis.")
                    
                    st.markdown("---")
                    st.subheader("📋 Detalhamento")
                    def st_neg(v): return 'color: #ff4b4b' if v < 0 else 'color: #4CAF50'
                    cols = ['data','ticker','lancamento','valor','moeda','valor_brl']
                    cols = [c for c in cols if c in df_filter.columns]
                    st.dataframe(df_filter[cols].sort_values('data', ascending=False).style.format({'valor':'{:,.2f}', 'valor_brl':'R$ {:,.2f}', 'data':'{:%d/%m/%Y}'}).map(st_neg, subset=['valor','valor_brl']), use_container_width=True)
                else: 
                    st.warning("Sem dados para o período selecionado.")
            else: 
                st.warning("Nenhum provento encontrado para os ativos filtrados.")
        else: 
            st.info("Arquivo de proventos vazio.")
            
    with tab6:
        c_head, c_conf = st.columns([4, 1])
        with c_head:
            st.subheader("🦁 Central Fiscal Inteligente")
            st.caption("Regime de Competência | Cesta Swing Unificada | FIIs Isolados")
        
        with c_conf:
            with st.popover("⚙️ Configurações"):
                FORCAR_COMPENSACAO_20K = st.checkbox(
                    "Compensar prejuízo Swing < 20k?", 
                    value=True, 
                    key="chk_fiscal_20k_surgical"
                )

        @st.cache_data
        def carregar_ptax_csv():
            caminho_arquivo = FILE_PTAX
            
            if not os.path.exists(caminho_arquivo): 
                return pd.DataFrame()
            
            try:
                df = pd.read_csv(caminho_arquivo, sep=',')
                df.columns = df.columns.str.strip().str.title() 
                df['Data'] = pd.to_datetime(df['Data'])
                df['Taxa'] = pd.to_numeric(df['Taxa'], errors='coerce')
                return df.dropna().sort_values('Data').set_index('Data')
            except Exception as e:
                st.error(f"Erro PTAX: {e}")
                return pd.DataFrame()

        df_ptax_index = carregar_ptax_csv()

        def obter_ptax(data_op):
            if df_ptax_index.empty: return 1.0 
            try:
                idx = df_ptax_index.index.asof(data_op)
                return df_ptax_index.loc[idx]['Taxa'] if not pd.isna(idx) else 1.0
            except: return 1.0

        df_tax = df_bruto.sort_values('data').copy() if 'df_bruto' in locals() and not df_bruto.empty else pd.DataFrame()
        
        if not df_tax.empty and 'data' in df_tax.columns:
            df_tax = df_tax.dropna(subset=['data'])

        dt_map = set()
        if not df_tax.empty:
            for (d, t), g in df_tax.groupby(['data', 'ticker']):
                if pd.isna(d): continue
                ops = set(g['tipo'].str.lower().str.strip())
                if any('compra' in x for x in ops) and any('venda' in x for x in ops): 
                    dt_map.add((d, t))

        def classificar_ativo(tkr, mercado):
            t = str(tkr).upper().strip().replace('.SA', '')
            if len(t) > 4 and t.endswith('F') and t[-2].isdigit(): t = t[:-1]
            if mercado == 'BR':
                lista_etfs = ['IVVB11', 'BOVA11', 'SMAL11', 'HASH11', 'WRLD11', 'XINA11', 'NASD11', 'GOLD11', 'EURP11', 'B5P211', 'ETH11', 'BIT11', 'HETE11', 'IMAB11', 'IBOB11', 'SPXI11', 'GOVE11', 'MATB11', 'USTK11', 'TECK11', 'BBSD11', 'XFIX11', 'ALUG11', 'FIND11', 'BRAX11', 'ECOO11', 'DIVO11']
                if t in lista_etfs: return 'ETF'
                if t.endswith(('32','33','34')): return 'BDR'
                if t.endswith('11'):
                    units = ['KLBN11', 'SAPR11', 'TAEE11', 'ALUP11', 'SANB11', 'BPAC11', 'ITUB11', 'BBAS11', 'SANB11', 'TIET11', 'CPFE11', 'EGIE11', 'ENGI11']
                    return 'Ações BR' if t in units else 'FII'
                return 'Ações BR'
            return 'Ativos Financeiros Exterior'

        carteira_pm = {} 
        transacoes = []  
        dolar_hoje = mapa_precos.get('BRL=X', 5.50) if 'mapa_precos' in locals() else 5.50

        if not df_tax.empty:
            for _, row in df_tax.iterrows():
                data = row['data']
                if pd.isna(data): continue 

                tkr = row['ticker']
                tipo = str(row['tipo']).lower()
                qtd = float(row['quantidade'])
                preco = float(row['preco'])
                
                eh_exterior = False
                if '.SA' not in str(tkr) and (len(str(tkr)) <= 5 or tkr in ['VT', 'VNQ', 'VOO', 'DPM', 'ASML', 'TSM']): 
                    eh_exterior = True
                mercado = 'EX' if eh_exterior else 'BR'
                
                ptax_op = obter_ptax(data) if mercado == 'EX' else 1.0
                classe_orig = classificar_ativo(tkr, mercado)
                is_dt = (mercado == 'BR' and (data, tkr) in dt_map)
                classe_final = 'FII' if (is_dt and classe_orig == 'FII') else ('Day Trade' if is_dt else classe_orig)

                key = f"{mercado}_{tkr}"
                if key not in carteira_pm: carteira_pm[key] = {'qtd': 0.0, 'custo_brl': 0.0, 'custo_usd': 0.0}

                val_op_brl = (qtd * preco) * ptax_op
                val_op_usd = (qtd * preco)
                taxas = float(row.get('taxas', 0))

                if 'compra' in tipo:
                    carteira_pm[key]['qtd'] += qtd
                    carteira_pm[key]['custo_brl'] += (val_op_brl + taxas)
                    carteira_pm[key]['custo_usd'] += val_op_usd
                
                elif 'venda' in tipo:
                    dados = carteira_pm[key]
                    pm_brl = (dados['custo_brl'] / dados['qtd']) if dados['qtd'] > 0 else 0
                    pm_usd = (dados['custo_usd'] / dados['qtd']) if dados['qtd'] > 0 else 0
                    ptax_compra_avg = (pm_brl / pm_usd) if pm_usd > 0 else 0.0

                    custo_venda_brl = qtd * pm_brl
                    val_liq_venda_brl = val_op_brl - taxas
                    lucro_brl = val_liq_venda_brl - custo_venda_brl
                    lucro_ativo_usd = (preco - pm_usd) * qtd
                    lucro_hoje_brl = ((qtd * preco) * dolar_hoje) - custo_venda_brl

                    carteira_pm[key]['qtd'] -= qtd
                    carteira_pm[key]['custo_brl'] -= custo_venda_brl
                    carteira_pm[key]['custo_usd'] -= (qtd * pm_usd)
                    
                    transacoes.append({
                        'data': data,
                        'mes_ref': data.strftime('%Y-%m'),
                        'ano': data.year,
                        'ticker': tkr,
                        'mercado': mercado,
                        'classe': classe_final,
                        'venda_total': val_liq_venda_brl,
                        'resultado': lucro_brl,
                        'ptax': ptax_op,                
                        'ptax_compra': ptax_compra_avg, 
                        'lucro_ativo_usd': lucro_ativo_usd,
                        'lucro_hoje_sim': lucro_hoje_brl
                    })

            df_fisc = pd.DataFrame(transacoes)

        if not df_fisc.empty:
            anos = sorted(df_fisc['ano'].unique(), reverse=True)
            col_sel, _ = st.columns([1, 5])
            ano_view = col_sel.selectbox("📅 Selecione o Ano Fiscal:", anos, key="sel_ano_fiscal_surgical")
            
            df_view = df_fisc[df_fisc['ano'] == ano_view].copy()
            
            t1, t2 = st.tabs(["🇧🇷 Brasil", "🇺🇸 Exterior"])
            
            with t1:
                df_br = df_view[df_view['mercado'] == 'BR'].copy()
                if not df_br.empty:
                    meses = sorted(df_br['mes_ref'].unique())
                    t_swing, t_fii, t_dt = [], [], []
                    loss_swing, loss_fii, loss_dt = 0.0, 0.0, 0.0
                    
                    tot_vendas_ano, tot_prej_usado, tot_darf_ano = 0.0, 0.0, 0.0

                    for mes in meses:
                        df_m = df_br[df_br['mes_ref'] == mes]
                        
                        acoes = df_m[df_m['classe'] == 'Ações BR']
                        v_ac, r_ac = acoes['venda_total'].sum(), acoes['resultado'].sum()
                        outros = df_m[df_m['classe'].isin(['ETF', 'BDR'])]
                        v_out, r_out = outros['venda_total'].sum(), outros['resultado'].sum()
                        
                        r_ac_valido, st_ac = 0.0, "Isento"
                        if v_ac >= 20000: r_ac_valido, st_ac = r_ac, "Tributável"
                        else:
                            if r_ac < 0 and FORCAR_COMPENSACAO_20K: r_ac_valido, st_ac = r_ac, "Prej. Compensável"
                            elif r_ac > 0: st_ac = "Lucro Isento (<20k)"
                            else: st_ac = "Prej. Ignorado"
                        
                        lucro_bruto = r_ac_valido + r_out
                        uso_prej = min(lucro_bruto, abs(loss_swing)) if lucro_bruto > 0 and loss_swing < 0 else 0.0
                        
                        base_sw = lucro_bruto + loss_swing
                        imp_sw = base_sw * 0.15 if base_sw > 0 else 0.0
                        loss_swing = 0.0 if base_sw > 0 else base_sw
                        
                        t_swing.append({'Mês': mes, 'Venda Ações': v_ac, 'Res. Ações': r_ac, 'Status': st_ac, 'Res. ETF/BDR': r_out, 'Base Calc': base_sw, 'Prejuízo Acum': loss_swing, 'DARF': imp_sw})

                        fiis = df_m[df_m['classe'] == 'FII']
                        r_fii, v_fii = fiis['resultado'].sum(), fiis['venda_total'].sum()
                        uso_prej_fii = min(r_fii, abs(loss_fii)) if r_fii > 0 and loss_fii < 0 else 0.0
                        
                        base_f = r_fii + loss_fii
                        imp_f = base_f * 0.20 if base_f > 0 else 0.0
                        loss_fii = 0.0 if base_f > 0 else base_f
                        
                        t_fii.append({'Mês': mes, 'Venda FII': v_fii, 'Res. FII': r_fii, 'Base Calc': base_f, 'Prejuízo Acum': loss_fii, 'DARF': imp_f})

                        dts = df_m[df_m['classe'] == 'Day Trade']
                        r_dt, v_dt = dts['resultado'].sum(), dts['venda_total'].sum()
                        uso_prej_dt = min(r_dt, abs(loss_dt)) if r_dt > 0 and loss_dt < 0 else 0.0
                        base_d = r_dt + loss_dt
                        imp_d = base_d * 0.20 if base_d > 0 else 0.0
                        loss_dt = 0.0 if base_d > 0 else base_d
                        
                        if v_dt > 0 or loss_dt < 0 or imp_d > 0:
                            t_dt.append({'Mês': mes, 'Vendas DT': v_dt, 'Res. DT': r_dt, 'Base Calc': base_d, 'Prejuízo Acum': loss_dt, 'DARF': imp_d})

                        tot_vendas_ano += (v_ac + v_out + v_fii + v_dt)
                        tot_prej_usado += (uso_prej + uso_prej_fii + uso_prej_dt)
                        tot_darf_ano += (imp_sw + imp_f + imp_d)

                    df_ts, df_tf, df_td = pd.DataFrame(t_swing), pd.DataFrame(t_fii), pd.DataFrame(t_dt)

                    st.markdown(f"### 📊 Resumo Executivo - {ano_view}")
                    with st.container(border=True):
                        k1, k2, k3, k4 = st.columns(4)
                        k1.metric("Total Vendas", f"R$ {tot_vendas_ano:,.2f}")
                        k2.metric("Saldo Utilizado", f"R$ {tot_prej_usado:,.2f}", delta="Abatido", delta_color="normal")
                        k3.metric("Saldo Restante", f"R$ {loss_swing + loss_fii + loss_dt:,.2f}", delta="Crédito", delta_color="off" if (loss_swing+loss_fii)==0 else "inverse")
                        k4.metric("DARF Total", f"R$ {tot_darf_ano:,.2f}", delta="Pagar", delta_color="inverse")

                    st.write("")

                    with st.expander("🔎 Filtros de Visualização", expanded=False):
                        sel_meses = st.multiselect("Filtrar Meses:", options=df_ts['Mês'].unique(), default=df_ts['Mês'].unique(), key="f_mes_br")
                    
                    df_ts_v = df_ts[df_ts['Mês'].isin(sel_meses)]
                    df_tf_v = df_tf[df_tf['Mês'].isin(sel_meses)]
                    df_td_v = df_td[df_td['Mês'].isin(sel_meses)] if not df_td.empty else pd.DataFrame()

                    col_main, col_guide = st.columns([2.5, 1], gap="medium")
                    with col_main:
                        st.markdown("##### 📉 Swing Trade")
                        st.dataframe(
                            df_ts_v.style.map(lambda x: 'color: #ef5350' if x<0 else 'color: #66bb6a', subset=['Res. Ações', 'Res. ETF/BDR', 'Prejuízo Acum']).map(lambda x: 'background-color: #ffcdd2; color: #b71c1c; font-weight: bold' if x>0.01 else '', subset=['DARF']),
                            use_container_width=True, column_config={"Mês": st.column_config.TextColumn("Mês"), "Venda Ações": st.column_config.NumberColumn(format="R$ %.2f"), "Res. Ações": st.column_config.NumberColumn(format="R$ %.2f"), "Res. ETF/BDR": st.column_config.NumberColumn(format="R$ %.2f"), "Base Calc": st.column_config.NumberColumn(format="R$ %.2f"), "Prejuízo Acum": st.column_config.NumberColumn(format="R$ %.2f"), "DARF": st.column_config.NumberColumn(format="R$ %.2f")}
                        )
                        st.divider()
                        st.markdown("##### 🏢 Fundos Imobiliários")
                        st.dataframe(
                            df_tf_v.style.map(lambda x: 'color: #ef5350' if x<0 else 'color: #66bb6a', subset=['Res. FII', 'Prejuízo Acum']).map(lambda x: 'background-color: #ffcdd2; color: #b71c1c; font-weight: bold' if x>0.01 else '', subset=['DARF']),
                            use_container_width=True, column_config={"Mês": st.column_config.TextColumn("Mês"), "Venda FII": st.column_config.NumberColumn(format="R$ %.2f"), "Res. FII": st.column_config.NumberColumn(format="R$ %.2f"), "Base Calc": st.column_config.NumberColumn(format="R$ %.2f"), "Prejuízo Acum": st.column_config.NumberColumn(format="R$ %.2f"), "DARF": st.column_config.NumberColumn(format="R$ %.2f")}
                        )
                        if not df_td_v.empty:
                            st.divider()
                            st.markdown("##### ⚡ Day Trade")
                            st.dataframe(df_td_v.style.format("{:.2f}"), use_container_width=True)

                    with col_guide:
                        st.markdown("### 📚 Guia Fiscal")
                        with st.expander("📉 Swing Trade", expanded=True):
                            st.markdown("**Cesta Única:** Ações + ETFs + BDRs. Lucro de um paga prejuízo de outro.\n\n**Isenção 20k:** Apenas p/ LUCRO de Ações BR. Prejuízo sempre compensa (se ativado).")
                        with st.expander("🏢 FIIs"):
                            st.markdown("**Cesta Isolada:** Não mistura.\n**Alíquota:** 20%.\n**Isenção:** Nenhuma.")
                        with st.expander("⚡ Day Trade"):
                            st.markdown("**Cesta Isolada:** Compra/Venda no mesmo dia.\n**Alíquota:** 20%.")
                        st.link_button("🌐 SicalcWeb", "https://sicalc.receita.economia.gov.br/sicalc/principal", use_container_width=True, type="primary")
                else:
                    st.info("Sem operações BR.")

            with t2:
                col_ex_main, col_ex_side = st.columns([3, 1], gap="medium")
                
                col_mercado = 'mercado' if 'mercado' in df_view.columns else 'Mercado'
                df_ex = df_view[df_view[col_mercado] == 'EX'].copy()
                
                with col_ex_main:
                    st.info("ℹ️ **Análise Cambial:** Compara a Taxa PTAX do dia da liquidação (Venda) com a Taxa PTAX do dia da aquisição.")
                    
                    if not df_ex.empty:
                        st.markdown("##### 🌎 Detalhamento da Composição do Lucro")
                        
                        mapa_cols = {
                            'Data': 'data' if 'data' in df_ex.columns else 'Data',
                            'Ticker': 'ticker' if 'ticker' in df_ex.columns else 'Ticker',
                            'PTAX Aquisição': 'PTAX Compra' if 'PTAX Compra' in df_ex.columns else 'ptax_compra',
                            'PTAX Venda': 'PTAX Venda' if 'PTAX Venda' in df_ex.columns else 'ptax',
                            'Venda Total (R$)': 'Venda Total (R$)' if 'Venda Total (R$)' in df_ex.columns else 'venda_total',
                            'Lucro (R$)': 'Lucro (R$)' if 'Lucro (R$)' in df_ex.columns else 'resultado',
                            'Lucro USD': 'Lucro USD' if 'Lucro USD' in df_ex.columns else 'lucro_ativo_usd',
                            'Lucro Hoje Sim': 'Lucro Hoje Sim' if 'Lucro Hoje Sim' in df_ex.columns else 'lucro_hoje_sim'
                        }

                        df_ex_show = pd.DataFrame()
                        for nome_visual, nome_real in mapa_cols.items():
                            if nome_real in df_ex.columns:
                                df_ex_show[nome_visual] = df_ex[nome_real]
                        
                        if 'Lucro (R$)' in df_ex_show.columns and 'Lucro USD' in df_ex_show.columns and 'PTAX Venda' in df_ex_show.columns:
                            df_ex_show['Impacto Câmbio'] = df_ex_show['Lucro (R$)'] - (df_ex_show['Lucro USD'] * df_ex_show['PTAX Venda'])
                        
                        st.dataframe(
                            df_ex_show,
                            use_container_width=True,
                            column_config={
                                "Data": st.column_config.DateColumn("Data", format="DD/MM/YYYY"),
                                "Ticker": "Ativo",
                                "PTAX Aquisição": st.column_config.NumberColumn("PTAX Aquisição", format="%.4f", help="Taxa do dia da compra (Custo Histórico)."),
                                "PTAX Venda": st.column_config.NumberColumn("PTAX Venda", format="%.4f", help="Taxa do dia da venda."),
                                "Venda Total (R$)": st.column_config.NumberColumn("Venda Total (R$)", format="R$ %.2f"),
                                "Lucro (R$)": st.column_config.NumberColumn("Lucro Fiscal (R$)", format="R$ %.2f", help="Base para imposto."),
                                "Lucro USD": st.column_config.NumberColumn("Ganho Ativo ($)", format="$ %.2f"),
                                "Impacto Câmbio": st.column_config.NumberColumn("Efeito Câmbio (R$)", format="R$ %.2f"),
                                "Lucro Hoje Sim": st.column_config.NumberColumn("Lucro (Dólar Hoje)", format="R$ %.2f")
                            }
                        )
                        
                        st.markdown("---")
                        st.markdown("##### 🌊 Decomposição Financeira")
                        c1, c2, c3 = st.columns(3)
                        
                        col_res = mapa_cols['Lucro (R$)']
                        col_hoje = mapa_cols['Lucro Hoje Sim']
                        
                        total_fiscal = df_ex[col_res].sum() if col_res in df_ex.columns else 0
                        total_gerencial = df_ex[col_hoje].sum() if col_hoje in df_ex.columns else 0
                        diff_timing = total_gerencial - total_fiscal
                        
                        c1.metric("Lucro Fiscal (Realizado)", f"R$ {total_fiscal:,.2f}", help="Base real de tributação.")
                        c2.metric("Lucro Gerencial (Cotação Atual)", f"R$ {total_gerencial:,.2f}", help="Se convertesse hoje.")
                        c3.metric("Diferença (Timing)", f"R$ {diff_timing:,.2f}", delta_color="off")
                        
                    else:
                        st.warning("Sem operações no Exterior neste ano.")

                with col_ex_side:
                    col_res = 'resultado' if 'resultado' in df_ex.columns else 'Lucro (R$)'
                    if not df_ex.empty and col_res in df_ex.columns:
                        lucro_total = df_ex[col_res].sum()
                        imposto = max(0, lucro_total * 0.15) 
                        
                        st.markdown("### 🧾 Tributação")
                        with st.container(border=True):
                            st.metric("Base Cálculo", f"R$ {lucro_total:,.2f}")
                            st.divider()
                            st.metric("Imposto (15%)", f"R$ {imposto:,.2f}", delta="DARF (Cód 8528)", delta_color="inverse")
                    else:
                        st.info("Sem dados.")

                    st.markdown("### 📚 Guia Fiscal")
                    
                    with st.expander("🌎 Regra Geral (2024+)", expanded=True):
                        st.markdown("""
                        **Alíquota Única:** 15% sobre o lucro anual.
                        **Isenção:** ❌ **Não existe mais** a isenção de R$ 35k. Todo lucro é tributável.
                        **Apuração:** Anual (na Declaração de Ajuste), mas recomenda-se reservar o valor.
                        """)
                    
                    with st.expander("💱 Variação Cambial"):
                        st.markdown("""
                        A variação do dólar agora compõe o lucro.
                        **Custo:** PTAX do dia da compra.
                        **Venda:** PTAX do dia da venda.
                        Se o dólar subiu, você paga imposto sobre essa valorização também.
                        """)

                    with st.expander("📉 Compensação"):
                        st.markdown("""
                        Prejuízos em ativos no exterior podem abater lucros de outros ativos no exterior dentro do **mesmo ano**.
                        """)
                    
                    st.link_button("🌐 SicalcWeb", "https://sicalc.receita.economia.gov.br/sicalc/principal", use_container_width=True)                                      
                                        
    with tab7:
        st.subheader("🏦 Gestão de Renda Fixa & Liquidez")
        
        mask_caixa = df_rf_filtrado['Ticker'].str.contains('Caixa|Cash|Disponivel|Saldo', case=False, na=False)
        
        df_liquidez = df_rf_filtrado[mask_caixa]
        df_alocacao = df_rf_filtrado[~mask_caixa]

        df_custodia = df_alocacao[df_alocacao['Status'] == 'Ativo']
        df_realizado = df_alocacao[df_alocacao['Status'] == 'Encerrado']

        saldo_caixa = df_liquidez[df_liquidez['Status'] == 'Ativo']['Atual'].sum()
        
        if saldo_caixa > 0:
            st.info(f"💵 **Disponível em Caixa / Conta Corrente:** R$ {saldo_caixa:,.2f}")

        if not df_custodia.empty:
            st.markdown("### 🟢 Custódia de Títulos (Posição Atual)")
            
            principal = df_custodia['Investido'].sum()
            valor_mercado = df_custodia['Atual'].sum()
            resultado_latente = df_custodia['Lucro'].sum()
            
            retorno_medio = (resultado_latente / principal * 100) if principal > 0 else 0
            
            df_custodia_view = df_custodia.copy()
            
            data_hoje = datetime.now()

            def calcular_anualizado(row):
                try:
                    investido = float(row['Investido'])
                    atual = float(row['Atual'])
                    data_ini = pd.to_datetime(row['Data'], dayfirst=True)
                    
                    if investido <= 0 or atual <= 0: return 0.0

                    dias = (data_hoje - data_ini).days
                    if dias < 1: dias = 1 
                    
                    rent_anual = ((atual / investido) ** (365 / dias)) - 1
                    return rent_anual * 100
                except:
                    return 0.0

            df_custodia_view['Rent. Anual (%)'] = df_custodia_view.apply(calcular_anualizado, axis=1)

            # Cálculo do TWR ponderado
            if not df_custodia_view.empty and df_custodia['Investido'].sum() > 0:
                twr_ponderado = (df_custodia['Investido'] * df_custodia_view['Rent. Anual (%)']).sum() / df_custodia['Investido'].sum()
            else:
                twr_ponderado = 0.0

            k1, k2, k3, k4 = st.columns(4)
            k1.metric("Principal Aplicado", f"R$ {principal:,.2f}", help="Valor original aportado")
            k2.metric("Posição Marcada (MtM)", f"R$ {valor_mercado:,.2f}", help="Valor atualizado (Mark-to-Market)")
            k3.metric("Resultado Latente", f"R$ {resultado_latente:,.2f}", help="Lucro bruto não realizado")
            k4.metric("TWR Ponderado", f"{twr_ponderado:.2f}%", help="Time-Weighted Return ponderado pelas aplicações")

            st.dataframe(
                df_custodia_view[['Ativo', 'Data', 'Investido', 'Atual', 'Lucro', 'Rent. %', 'Rent. Anual (%)']]
                .rename(columns={'Data': 'Data Aplicação', 'Investido': 'Principal', 'Atual': 'Valor Líquido', 'Lucro': 'Resultado R$'})
                .style.format({
                    'Principal': 'R$ {:,.2f}', 
                    'Valor Líquido': 'R$ {:,.2f}',
                    'Resultado R$': 'R$ {:,.2f}', 
                    'Rent. %': '{:.2f}%', 
                    'Rent. Anual (%)': '{:.2f}%', 
                    'Data Aplicação': '{:%d/%m/%Y}'
                })
                .background_gradient(subset=['Resultado R$'], cmap='Greens')
                .background_gradient(subset=['Rent. Anual (%)'], cmap='Blues'),
                use_container_width=True
            )                   

                
        elif opcao_ativo == "Sim":
            st.warning("⚠️ Nenhuma custódia de Títulos de Renda Fixa encontrada. (Verifique se há apenas Caixa)")

        if not df_realizado.empty:
            st.markdown("---")
            st.markdown("### 🏁 Histórico de Realizações (Vencimentos & Resgates)")
            
            lucro_bolso = df_realizado['Lucro'].sum()
            volume_movimentado = df_realizado['Atual'].sum() 
            
            c_h1, c_h2 = st.columns([1, 3])
            c_h1.metric("Resultado Realizado", f"R$ {lucro_bolso:,.2f}", delta="Lucro no Bolso", delta_color="normal")
            c_h2.metric("Volume Resgatado Total", f"R$ {volume_movimentado:,.2f}", help="Soma total dos valores líquidos recebidos")
            
            st.dataframe(
                df_realizado[['Ativo', 'Data', 'Investido', 'Atual', 'Lucro', 'Rent. %']]
                .rename(columns={'Data': 'Data Baixa', 'Investido': 'Aplicação Original', 'Atual': 'Valor Resgate', 'Lucro': 'Resultado Final'})
                .style.format({
                    'Aplicação Original': 'R$ {:,.2f}', 
                    'Valor Resgate': 'R$ {:,.2f}',
                    'Resultado Final': 'R$ {:,.2f}', 
                    'Rent. %': '{:.2f}%', 
                    'Data Baixa': '{:%d/%m/%Y}'
                })
                .map(lambda x: 'color: #D32F2F; font-weight: bold' if x < 0 else 'color: #388E3C; font-weight: bold', subset=['Resultado Final']),
                use_container_width=True
            )
        elif opcao_ativo == "Não" and df_realizado.empty:
            st.info("Nenhum histórico de operações finalizadas encontrado.")

        st.markdown("---") 
        st.subheader("📊 Alocação de Recursos (RF + Caixa)")
        
        df_grafico_rf = pd.concat([df_custodia, df_liquidez[df_liquidez['Status']=='Ativo']])
        
        if not df_grafico_rf.empty:
            fig_rf = px.pie(
                df_grafico_rf, 
                values='Atual', 
                names='Ativo', 
                hole=0.4, 
                color_discrete_sequence=px.colors.qualitative.Pastel
            )
            fig_rf.update_traces(textposition='outside', textinfo='percent+label')
            fig_rf.update_layout(margin=dict(t=20, b=20, l=20, r=20), height=500, showlegend=False)
            st.plotly_chart(fig_rf, use_container_width=True)
    with tab8:
        exibir_editor_dados()

if __name__ == "__main__":
    main()
import streamlit as st
import pandas as pd
import yfinance as yf
import plotly.express as px
import plotly.graph_objects as go  
import os
import numpy as np
from datetime import datetime, date


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

# --- 2. LOCALIZAÇÃO E CARREGAMENTO ---
PASTA_ATUAL = os.path.dirname(os.path.abspath(__file__))
CAMINHO_CSV = os.path.join(PASTA_ATUAL, 'meus_ativos.csv')
CAMINHO_PROVENTOS = os.path.join(PASTA_ATUAL, 'meus_proventos.csv')
CAMINHO_CAMBIO = os.path.join(PASTA_ATUAL, 'cambio.csv')
CAMINHO_COMPOSICAO = os.path.join(PASTA_ATUAL, 'composicao.csv')
CAMINHO_FIXA = os.path.join(PASTA_ATUAL, 'renda_fixa.csv')

# 1. Carrega Ativos (Transações RV)
@st.cache_data
def carregar_dados():
    if not os.path.exists(CAMINHO_CSV):
        st.error(f"❌ Arquivo não encontrado: {CAMINHO_CSV}")
        return pd.DataFrame()

    try:
        df = pd.read_csv(CAMINHO_CSV, sep=';')
        df.columns = df.columns.str.strip().str.lower()

        rename_map = {
            'símbolo': 'ticker', 'tipo de transação': 'tipo', 'preço': 'preco',
            'data': 'data', 'quantidade': 'quantidade', 'moeda': 'moeda',
            'taxa de corretagem': 'taxas', 'valor líquido': 'total'
        }
        df.rename(columns=rename_map, inplace=True)
        
        colunas_necessarias = {'ticker', 'tipo', 'quantidade', 'preco'}
        if not colunas_necessarias.issubset(df.columns):
            return pd.DataFrame()

        df['data'] = pd.to_datetime(df['data'], format='%d/%m/%Y', errors='coerce')
        
        cols_numericas = ['quantidade', 'preco', 'taxas', 'total']
        for col in cols_numericas:
            if col in df.columns:
                if df[col].dtype == 'object':
                    df[col] = df[col].astype(str).str.replace('R$', '', regex=False).str.strip()
                    df[col] = df[col].str.replace('.', '', regex=False).str.replace(',', '.', regex=False)
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
            elif col == 'taxas':
                 df[col] = 0.0
            
        return df.sort_values(by='data')
    except Exception as e:
        st.error(f"Erro ao ler CSV de Ativos: {e}")
        return pd.DataFrame()

# 2. Carrega Proventos
@st.cache_data
def carregar_proventos():
    if not os.path.exists(CAMINHO_PROVENTOS):
        return pd.DataFrame()

    try:
        df = pd.read_csv(CAMINHO_PROVENTOS, sep=';')
        if len(df.columns) < 2: df = pd.read_csv(CAMINHO_PROVENTOS, sep=',')

        df.columns = df.columns.str.strip().str.lower()
        if 'ticker' not in df.columns or 'valor' not in df.columns: return pd.DataFrame()

        df['data'] = pd.to_datetime(df['data'], dayfirst=True, errors='coerce')
        df['ticker'] = df['ticker'].astype(str).str.upper().str.strip()
        
        if df['valor'].dtype == 'object':
            df['valor'] = df['valor'].str.replace(',', '.', regex=False)
        df['valor'] = pd.to_numeric(df['valor'], errors='coerce').fillna(0)
        
        if 'moeda' not in df.columns: df['moeda'] = 'BRL'
        else: df['moeda'] = df['moeda'].str.upper().str.strip()
            
        return df.sort_values(by='data', ascending=False)
    except:
        return pd.DataFrame()

# 3. Carrega Composição Extra
@st.cache_data
def carregar_composicao_extra():
    if not os.path.exists(CAMINHO_COMPOSICAO):
        return pd.DataFrame()
    
    try:
        df = pd.read_csv(CAMINHO_COMPOSICAO, sep=';')
        df.columns = df.columns.str.strip().str.lower()
        
        col_ativo = next((c for c in df.columns if c in ['símbolo (symbol)', 'símbolo', 'symbol', 'ativo', 'ticker']), None)
        col_valor = next((c for c in df.columns if c in ['valor líquido (net value)', 'valor líquido', 'net value', 'valor', 'total']), None)
        col_classe = next((c for c in df.columns if c in ['setor (sector)', 'setor', 'sector', 'classe', 'categoria']), 'Outros')
        
        if col_ativo and col_valor:
            if df[col_valor].dtype == 'object':
                df[col_valor] = df[col_valor].astype(str).str.replace('R$', '', regex=False).str.replace('$', '', regex=False).str.strip()
                df[col_valor] = df[col_valor].str.replace(',', '', regex=False)
            
            df[col_valor] = pd.to_numeric(df[col_valor], errors='coerce').fillna(0)
            df = df.rename(columns={col_ativo: 'Ativo', col_valor: 'Valor (R$)', col_classe: 'Classe'})
            if 'Classe' not in df.columns: df['Classe'] = 'Geral'
            
            return df[['Ativo', 'Classe', 'Valor (R$)']].copy()
            
        return pd.DataFrame()
    except Exception as e:
        st.error(f"Erro ao ler composição: {e}")
        return pd.DataFrame()

# 4. Carrega Renda Fixa
@st.cache_data
def carregar_renda_fixa():
    if not os.path.exists(CAMINHO_FIXA):
        return pd.DataFrame()
    
    try:
        df = pd.read_csv(CAMINHO_FIXA, sep=';')
        df.columns = df.columns.str.strip().str.lower()
        
        rename_map = {
            'compra': 'data', 'ticker': 'ativo', 'valor': 'valor_investido', 
            'valor atual': 'valor_atual', 'tipo de transação': 'tipo'
        }
        df.rename(columns=rename_map, inplace=True)
        
        df['data'] = pd.to_datetime(df['data'], dayfirst=True, errors='coerce')
        df['ativo'] = df['ativo'].str.strip()
        df['tipo'] = df['tipo'].str.strip().str.title() 
        
        cols_num = ['valor_investido', 'valor_atual']
        for col in cols_num:
            if col in df.columns:
                if df[col].dtype == 'object':
                    df[col] = df[col].astype(str).str.replace('R$', '', regex=False).str.strip()
                    df[col] = df[col].str.replace('.', '', regex=False).str.replace(',', '.', regex=False)
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
                
        return df.sort_values(by='data')
    except Exception as e:
        st.error(f"Erro ao ler Renda Fixa: {e}")
        return pd.DataFrame()

# --- LÓGICA DE SETORIZAÇÃO ---
def identificar_setor_ativo(ticker):
    t = str(ticker).upper().strip()
    lista_commodities = ['IAU', 'SIVR', 'SLV', 'GLD', 'DBC', 'USO', 'GSG', 'SIVIR'] 
    if t in lista_commodities: return 'Commodities'
    lista_cripto = ['BTC', 'ETH', 'SOL', 'USDT', 'USDC', 'ADA', 'DOT', 'MATIC', 'LINK', 'LTC', 'BTC-USD', 'ETH-USD']
    if t in lista_cripto: return 'Cripto'
    lista_reits = ['O', 'VNQ', 'AMT', 'PLD', 'CCI', 'VICI', 'STAG', 'MAIN', 'EQIX']
    if t in lista_reits: return 'REITs'
    termos_rf = ['TESOURO', 'NTN-B', 'LCI', 'LCA', 'CDB', 'LC', 'DEBENTURE']
    if any(x in t for x in termos_rf): return 'Renda Fixa'
    etfs_usa = ['IVVB11', 'SPY', 'QQQ', 'VWRA', 'VOO', 'VNQ', 'SCHD', 'VT']
    if any(e in t for e in etfs_usa): return 'ETF'
    eh_brasil = '.SA' in t or (len(t) >= 5 and t[:4].isalpha() and t[-1].isdigit())
    if eh_brasil:
        codigo = t.replace('.SA', '')
        etfs_br = ['BOVA11', 'SMAL11', 'IVVB11', 'HASH11', 'XINA11']
        if codigo in etfs_br: return 'ETF'
        if codigo.endswith('3') or codigo.endswith('4') or codigo.endswith('5') or codigo.endswith('6'): return 'Ações Brasil'
        if codigo.endswith('11'): 
            units = ['KLBN11', 'SAPR11', 'TAEE11', 'ALUP11', 'SANB11', 'BPAC11']
            if codigo in units: return 'Ações Brasil'
            return 'FIIs'
        return 'Ações Brasil'
    return 'Ações Internacional'

# --- CÁLCULO DE POSIÇÃO RV ---
def calcular_carteira(df):
    df = df.copy()
    def padronizar_ticker(t):
        t = str(t).upper().strip()
        if (t.endswith('3') or t.endswith('4') or t.endswith('5') or t.endswith('6') or t.endswith('11')):
            if not t.endswith('.SA'): return t + '.SA'
        return t
    df['ticker'] = df['ticker'].apply(padronizar_ticker)
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

# --- MOTOR DE COTAÇÕES (CORRIGIDO PARA FIM DE SEMANA) ---
@st.cache_data(ttl=3600)
def obter_precos_online(tickers):
    # Lista de moedas para garantir conversão
    tickers_moedas = ['BRL=X', 'CADBRL=X', 'EURBRL=X', 'CHF=X', 'JPY=X', 'EURUSD=X', 'CADUSD=X', 'CHFUSD=X', 'JPYUSD=X', 'BRLUSD=X']
    todos_tickers = list(set(tickers + tickers_moedas))
    
    # Filtra tickers que não são do Yahoo
    lista_yahoo = [t for t in todos_tickers if 'TESOURO' not in t and 'CDB' not in t and 'LCI' not in t and 'LCA' not in t]
    
    if not lista_yahoo: return {}, {} # RETORNA DOIS DICIONÁRIOS VAZIOS
    
    mapa_precos = {t: 0.0 for t in todos_tickers} 
    mapa_variacao = {t: 0.0 for t in todos_tickers} # NOVO
    
    grupos = {
        'BR': [t for t in lista_yahoo if t.endswith('.SA')],
        'US': [t for t in lista_yahoo if not t.endswith('.SA') and not '.' in t and '=' not in t],
        'EU/OUTROS': [t for t in lista_yahoo if '.' in t and not t.endswith('.SA')],
        'FX': [t for t in lista_yahoo if '=' in t]
    }
    
    for nome_grupo, lista_grupo in grupos.items():
        if len(lista_grupo) > 0:
            try:
                # Pega dados para calcular variação (hoje e ontem)
                dados = yf.download(lista_grupo, period="5d", progress=False)['Close'] # Pegamos 5d para garantir feriados
                
                if dados.empty: continue
                if isinstance(dados, pd.Series): dados = dados.to_frame(name=lista_grupo[0])
                
                dados = dados.ffill() # Preenche buracos

                for col in dados.columns:
                    try:
                        serie = dados[col].dropna()
                        serie = serie[serie > 0]
                        
                        if not serie.empty:
                            ultimo = float(serie.iloc[-1])
                            mapa_precos[col] = ultimo
                            
                            # CÁLCULO DA DIFERENÇA (HOJE - ONTEM)
                            if len(serie) >= 2:
                                penultimo = float(serie.iloc[-2])
                                mapa_variacao[col] = ultimo - penultimo
                            else:
                                mapa_variacao[col] = 0.0
                    except: pass
            except: pass
                
    return mapa_precos, mapa_variacao
    
    for nome_grupo, lista_grupo in grupos.items():
        if len(lista_grupo) > 0:
            try:
                # Pega 1 mês para garantir histórico em feriados longos
                # progress=False evita sujeira no terminal
                dados = yf.download(lista_grupo, period="1mo", progress=False)['Close']
                
                if dados.empty: continue
                
                # Se for apenas 1 ticker, o yfinance retorna Series. Convertemos para DF para o código abaixo funcionar igual.
                if isinstance(dados, pd.Series):
                    dados = dados.to_frame(name=lista_grupo[0])

                # TRUQUE DO FIM DE SEMANA:
                # ffill() -> Forward Fill: Se hoje for NaN, copia o valor de ontem.
                dados = dados.ffill()

                # Itera coluna por coluna para garantir o último valor de CADA ativo individualmente
                for col in dados.columns:
                    try:
                        serie = dados[col]
                        # Remove explicitamente dias que ainda assim ficaram vazios ou Zero
                        serie_valida = serie.dropna()
                        serie_valida = serie_valida[serie_valida > 0]
                        
                        if not serie_valida.empty:
                            # Pega o último item da série limpa (ou seja, o fechamento de sexta-feira/ontem)
                            ultimo_valor = float(serie_valida.iloc[-1])
                            mapa_precos[col] = ultimo_valor
                    except:
                        pass
            except: 
                pass
                
    return mapa_precos

# --- DASHBOARD PRINCIPAL ---
def main():
    with st.sidebar:
        st.header("🔍 Filtros Globais")
        if st.button("🔄 Atualizar Dados"):
            st.cache_data.clear()
            st.rerun()
        
        # --- CARREGAMENTO INICIAL ---
        df_bruto = carregar_dados()
        df_proventos_bruto = carregar_proventos()
        df_rf_raw = carregar_renda_fixa()
        
        # Pré-processamento leve para filtros
        if not df_bruto.empty:
            df_bruto['setor_calc'] = df_bruto['ticker'].apply(identificar_setor_ativo)
            if 'moeda' not in df_bruto.columns: df_bruto['moeda'] = 'BRL'
            df_bruto['moeda'] = df_bruto['moeda'].str.upper().str.strip()
            df_bruto['ticker'] = df_bruto['ticker'].str.upper().str.strip()

        # Dataframes de trabalho para a Cascata (RV e RF)
        df_rv_cascata = df_bruto.copy() if not df_bruto.empty else pd.DataFrame(columns=['ticker', 'moeda', 'setor_calc'])
        df_rf_cascata = df_rf_raw.copy() if not df_rf_raw.empty else pd.DataFrame(columns=['ativo'])

        # --- 1. MACRO FILTRO (Raiz da Cascata) ---
        st.markdown("### 🎚️ Macro Filtros")
        filtro_macro = st.multiselect(
            "Classe de Ativo:", 
            ["Renda Variável", "Renda Fixa"], 
            default=["Renda Variável", "Renda Fixa"],
            key="sidebar_macro_class"
        )
        
        # Aplica Nível 1: Remove dados dos dataframes de cascata se desmarcado
        if filtro_macro and "Renda Variável" not in filtro_macro:
            df_rv_cascata = df_rv_cascata[0:0]
        if filtro_macro and "Renda Fixa" not in filtro_macro:
            df_rf_cascata = df_rf_cascata[0:0]

        # --- 2. MOEDA (Aplica apenas em RV, pois RF é padrão BRL) ---
        opcoes_moeda = ['Todas'] + sorted(df_rv_cascata['moeda'].unique())
        filtro_moeda = st.selectbox("Moeda (RV):", opcoes_moeda, key="sidebar_moeda")
        
        # Aplica Nível 2
        if filtro_moeda != 'Todas': 
            df_rv_cascata = df_rv_cascata[df_rv_cascata['moeda'] == filtro_moeda]

        # --- 3. SETOR (Apenas RV - RF não tem setorização complexa aqui) ---
        opcoes_setor = sorted(df_rv_cascata['setor_calc'].unique())
        filtro_setor = st.multiselect("Filtrar por Tipo (RV):", opcoes_setor, key="sidebar_setor")
        
        # Aplica Nível 3
        if filtro_setor: 
            df_rv_cascata = df_rv_cascata[df_rv_cascata['setor_calc'].isin(filtro_setor)]

        # --- 4. TICKER / ATIVO (Unificado RV + RF) ---
        # Pega o que sobrou de RV e o que sobrou de RF para montar a lista
        tickers_rv_disp = df_rv_cascata['ticker'].unique().tolist()
        tickers_rf_disp = df_rf_cascata['ativo'].unique().tolist()
        opcoes_ticker = sorted(list(set(tickers_rv_disp + tickers_rf_disp)))
        
        filtro_ticker = st.multiselect("Filtrar Ativos Específicos:", opcoes_ticker, key="sidebar_filtro_ticker")

        # Aplica Nível 4 (Final)
        if filtro_ticker:
            df_rv_cascata = df_rv_cascata[df_rv_cascata['ticker'].isin(filtro_ticker)]
            # Para RF, salvaremos uma lista de ativos permitidos para usar depois
            lista_rf_permitidos = [t for t in filtro_ticker if t in tickers_rf_disp]
        else:
            lista_rf_permitidos = tickers_rf_disp # Se não filtrou, permite todos os disponíveis no macro

        # --- 5. STATUS (Carteira vs Encerrado) ---
        # Esse filtro fica por último pois depende do cálculo de posição (que é pesado para rodar na cascata)
        # Vamos manter a lógica original de filtrar o resultado final
        opcao_ativo = st.selectbox("Ativo na carteira?", ["Todos", "Sim", "Não"], index=1, key="sidebar_ativo_status")

        # --- PREPARAÇÃO PARA O RESTO DO CÓDIGO ---
        # O resto do seu código espera 'df_aux' para RV e vamos precisar filtrar RF manualmente depois
        df_aux = df_rv_cascata.copy()
        
        # Filtragem de Status na RV (mantendo sua lógica original)
        # Filtragem de Status na RV (mantendo sua lógica original)
        df_posicao, _ = calcular_carteira(df_bruto) # <--- Agora chama df_posicao
        ativos_vivos = set(df_posicao[df_posicao['Qtd'] > 0]['Ticker'])
        
        if opcao_ativo == "Sim": 
            df_aux = df_aux[df_aux['ticker'].isin(ativos_vivos)]
        elif opcao_ativo == "Não": 
            df_aux = df_aux[~df_aux['ticker'].isin(ativos_vivos)]
            
        lista_tickers_final = df_aux['ticker'].unique().tolist()
        
        st.markdown("---")
        st.caption("Mega pro ultimate blaster Versão Estável")

        # --- CÁLCULOS FINAIS (VARIAVEIS GLOBAIS) ---
        # Garante que mapa_precos existe
        if 'mapa_precos' not in locals():
            mapa_precos, mapa_variacao = obter_precos_online(df_bruto['ticker'].unique().tolist()) if not df_bruto.empty else ({}, {})
        usd = mapa_precos.get('BRL=X', 5.00)
        cad = mapa_precos.get('CADBRL=X', 3.70)
        eur = mapa_precos.get('EURBRL=X', 5.40)

        prov_por_ticker = {}
        if not df_proventos_bruto.empty:
            for _, r in df_proventos_bruto.iterrows():
                t = str(r['ticker']).strip().upper()
                m = str(r['moeda']).strip().upper()
                val = r['valor']
                
                fator_prov = 1.0
                if m == 'USD': fator_prov = usd
                elif m == 'CAD': fator_prov = cad
                elif m == 'EUR': fator_prov = eur
                
                prov_por_ticker[t] = prov_por_ticker.get(t, 0.0) + (val * fator_prov)

        # --- 1. PROCESSAMENTO DA RENDA FIXA (Bloco Restaurado) ---
        lista_rf_completa = []
        
        if not df_rf_raw.empty:
            grupos_rf = df_rf_raw.groupby('ativo')
            for ativo, dados in grupos_rf:
                dados = dados.sort_values('data')
                dados_validos = dados[dados['tipo'] != 'Imposto']
                
                if not dados_validos.empty:
                    ultimo_tipo = dados_validos.iloc[-1]['tipo']
                    status = 'Ativo' if ultimo_tipo == 'Compra' else 'Encerrado'
                    
                    if status == 'Ativo':
                        compras = dados[dados['tipo'] == 'Compra']
                        investido = compras['valor_investido'].sum()
                        atual = compras['valor_atual'].sum()
                        lucro = atual - investido
                        data_ref = dados_validos.iloc[0]['data']
                    else:
                        entradas = dados[dados['tipo'].isin(['Venda', 'Vencimento'])]['valor_investido'].sum()
                        saidas = dados[dados['tipo'] == 'Compra']['valor_investido'].sum()
                        investido = saidas
                        atual = entradas 
                        lucro = entradas - saidas
                        data_ref = dados_validos.iloc[-1]['data']
                    
                    lista_rf_completa.append({
                        'Ativo': ativo, 'Status': status, 'Data': data_ref,
                        'Investido': investido, 'Atual': atual, 'Lucro': lucro,
                        'Rent. %': ((lucro)/investido * 100) if investido > 0 else 0
                    })

    df_rf_completo = pd.DataFrame(lista_rf_completa)
    # --- CÁLCULOS FINAIS (VARIAVEIS GLOBAIS) ---
    usd = mapa_precos.get('BRL=X', 5.00)
    cad = mapa_precos.get('CADBRL=X', 3.70)
    eur = mapa_precos.get('EURBRL=X', 5.40)

    prov_por_ticker = {}
    if not df_proventos_bruto.empty:
        for _, r in df_proventos_bruto.iterrows():
            t = str(r['ticker']).strip().upper()
            m = str(r['moeda']).strip().upper()
            val = r['valor']
            
            fator_prov = 1.0
            if m == 'USD': fator_prov = usd
            elif m == 'CAD': fator_prov = cad
            elif m == 'EUR': fator_prov = eur
            
            prov_por_ticker[t] = prov_por_ticker.get(t, 0.0) + (val * fator_prov)

    # --- 1. PROCESSAMENTO DA RENDA FIXA (Bloco Restaurado) ---
    lista_rf_completa = []
    
    if not df_rf_raw.empty:
        grupos_rf = df_rf_raw.groupby('ativo')
        for ativo, dados in grupos_rf:
            dados = dados.sort_values('data')
            dados_validos = dados[dados['tipo'] != 'Imposto']
            
            if not dados_validos.empty:
                ultimo_tipo = dados_validos.iloc[-1]['tipo']
                status = 'Ativo' if ultimo_tipo == 'Compra' else 'Encerrado'
                
                if status == 'Ativo':
                    compras = dados[dados['tipo'] == 'Compra']
                    investido = compras['valor_investido'].sum()
                    atual = compras['valor_atual'].sum()
                    lucro = atual - investido
                    data_ref = dados_validos.iloc[0]['data']
                else:
                    entradas = dados[dados['tipo'].isin(['Venda', 'Vencimento'])]['valor_investido'].sum()
                    saidas = dados[dados['tipo'] == 'Compra']['valor_investido'].sum()
                    investido = saidas
                    atual = entradas 
                    lucro = entradas - saidas
                    data_ref = dados_validos.iloc[-1]['data']
                
                lista_rf_completa.append({
                    'Ativo': ativo, 'Status': status, 'Data': data_ref,
                    'Investido': investido, 'Atual': atual, 'Lucro': lucro,
                    'Rent. %': ((lucro)/investido * 100) if investido > 0 else 0
                })

    df_rf_completo = pd.DataFrame(lista_rf_completa)

    # --- 2. CÁLCULO DE TOTAIS GLOBAIS DE RF ---
    patrimonio_rf = 0.0
    custo_total_rf = 0.0
    lucro_aberto_rf = 0.0
    lucro_realizado_rf_historico = 0.0
    
    if not df_rf_completo.empty:
        # Para Top KPIs (Patrimônio), somamos apenas o que está ATIVO, independente do filtro visual
        ativos_reais = df_rf_completo[df_rf_completo['Status'] == 'Ativo']
        patrimonio_rf = ativos_reais['Atual'].sum()
        custo_total_rf = ativos_reais['Investido'].sum()
        lucro_aberto_rf = ativos_reais['Lucro'].sum()
        
        # Lucro já realizado (encerrados)
        encerrados_reais = df_rf_completo[df_rf_completo['Status'] == 'Encerrado']
        lucro_realizado_rf_historico = encerrados_reais['Lucro'].sum()

# --- 3. FILTRAGEM PARA TAB 7 (VISUALIZAÇÃO) ---
    df_rf_filtrado = df_rf_completo.copy()
    
    # 1. Aplica Filtro de Ticker (vindo da Cascata lateral)
    if 'lista_rf_permitidos' in locals() and filtro_ticker:
         df_rf_filtrado = df_rf_filtrado[df_rf_filtrado['Ativo'].isin(lista_rf_permitidos)]

    # 2. Aplica Macro Filtro (Se desmarcar Renda Fixa, zera tudo)
    if filtro_macro and "Renda Fixa" not in filtro_macro:
        df_rf_filtrado = df_rf_filtrado[0:0]

    # 3. Aplica Filtro de Status (Sim/Não) - Mantendo a lógica original
    if not df_rf_filtrado.empty:
        if opcao_ativo == "Sim":
            df_rf_filtrado = df_rf_filtrado[df_rf_filtrado['Status'] == 'Ativo']
        elif opcao_ativo == "Não":
            df_rf_filtrado = df_rf_filtrado[df_rf_filtrado['Status'] == 'Encerrado']

    # --- 4. GERAÇÃO DO DF_VIEW (RENDA VARIÁVEL) ---
    vendas_por_ticker = {}
    for _, row in df_bruto.iterrows():
        if 'venda' in str(row['tipo']).lower():
            t_v = str(row['ticker']).strip().upper()
            val_v = row['quantidade'] * row['preco']
            vendas_por_ticker[t_v] = vendas_por_ticker.get(t_v, 0.0) + val_v

    lista_final = []
    for _, row in df_posicao.iterrows():
        if row['Ticker'] not in lista_tickers_final: continue
        t, m = row['Ticker'], row['Moeda']
        
        p1 = prov_por_ticker.get(t, 0.0)
        t_limpo = t.replace('.SA', '').strip()
        p2 = prov_por_ticker.get(t_limpo, 0.0)
        proventos_ativo = (p1 + p2) if t != t_limpo else p1
        
        v1 = vendas_por_ticker.get(t, 0.0)
        v2 = vendas_por_ticker.get(t_limpo, 0.0)
        vol_vendas_ativo = (v1 + v2) if t != t_limpo else v1

        if 'TESOURO' in t or 'CDB' in t or 'LCI' in t:
             preco_atual = row['PM_Origem']
             usou_estimativa = False
        else:
             preco_yahoo = mapa_precos.get(t, 0.0)
             if preco_yahoo > 0:
                 preco_atual = preco_yahoo
                 usou_estimativa = False
             else:
                 preco_atual = row['PM_Origem']
                 usou_estimativa = True
        
        fator_conversao = 1.0
        if m == 'USD': fator_conversao = usd
        elif m == 'CAD': fator_conversao = cad
        elif m == 'EUR': fator_conversao = eur
        
        valor_hoje_brl = row['Qtd'] * preco_atual * fator_conversao
        custo_hoje_brl = row['Qtd'] * row['PM_Origem'] * fator_conversao
        lucro_aberto_brl = valor_hoje_brl - custo_hoje_brl
        lucro_realizado_brl = row['Lucro_Realizado_Nativo'] * fator_conversao
        vol_vendas_brl = vol_vendas_ativo * fator_conversao
        
        rent_pct = 0.0
        if row['Qtd'] > 0 and row['PM_Origem'] > 0:
            rent_pct = ((preco_atual - row['PM_Origem']) / row['PM_Origem']) * 100
            
        status_ativo = "🟢 Carteira" if row['Qtd'] > 0 else "🏁 Encerrado"
        if usou_estimativa and row['Qtd'] > 0: status_ativo = "⚠️ Custo (S/ Cot)"

        lista_final.append({
            'Ticker': t, 'Status': status_ativo, 'Setor': row['Setor'],
            'Qtd': row['Qtd'], 'Moeda': m, 'Preço Atual': preco_atual,
            'PM Compra': row['PM_Origem'], 'Valor Hoje (R$)': valor_hoje_brl,
            'Volume Vendas (R$)': vol_vendas_brl, 'Lucro Realiz. (R$)': lucro_realizado_brl,
            'Lucro Aberto (R$)': lucro_aberto_brl, 'Proventos (R$)': proventos_ativo,
            'Rent. (%)': rent_pct
        })

    df_view = pd.DataFrame(lista_final)    
    
    # --- 5. CÁLCULO DOS KPIs GLOBAIS (RV + RF) ---
    if not df_view.empty:
        lucro_nao_realizado_rv = df_view['Lucro Aberto (R$)'].sum()
        lucro_ja_realizado_kpi = df_view['Lucro Realiz. (R$)'].sum()
        total_proventos_kpi = df_view['Proventos (R$)'].sum()
        patrimonio_rv = df_view['Valor Hoje (R$)'].sum()
        
        # RV - Custo dos ativos vivos para cálculo de %
        custo_ativos_vivos_rv = df_view[df_view['Qtd'] > 0]['Valor Hoje (R$)'].sum() - df_view[df_view['Qtd'] > 0]['Lucro Aberto (R$)'].sum()
    else:
        lucro_nao_realizado_rv = 0; lucro_ja_realizado_kpi = 0; total_proventos_kpi = 0; patrimonio_rv = 0; custo_ativos_vivos_rv = 0

    # --- CORREÇÃO AQUI: Recalcula RF baseado EXATAMENTE no filtro visual (df_rf_filtrado) ---
    kpi_rf_patrimonio = 0.0
    kpi_rf_lucro_aberto = 0.0
    kpi_rf_lucro_realizado = 0.0
    kpi_rf_custo = 0.0

    if 'df_rf_filtrado' in locals() and not df_rf_filtrado.empty:
        # Separa os dados filtrados em dois grupos
        rf_ativos_view = df_rf_filtrado[df_rf_filtrado['Status'] == 'Ativo']
        rf_encerrados_view = df_rf_filtrado[df_rf_filtrado['Status'] == 'Encerrado']

        # --- CORREÇÃO AQUI (Linha que estava errada antes) ---
        # Agora somamos APENAS o 'Atual' de quem ainda está Ativo.
        # Antes estava df_rf_filtrado['Atual'].sum(), o que somava resgates antigos no Patrimônio.
        kpi_rf_patrimonio = rf_ativos_view['Atual'].sum()

        # 2. Lucro Aberto e Custo (Apenas dos Ativos Visíveis)
        kpi_rf_lucro_aberto = rf_ativos_view['Lucro'].sum()
        kpi_rf_custo = rf_ativos_view['Investido'].sum()

        # 3. Lucro Realizado (Apenas dos Encerrados Visíveis)
        kpi_rf_lucro_realizado = rf_encerrados_view['Lucro'].sum()

    # [SOMATÓRIA GERAL: RV + RF FILTRADOS]
    patrimonio_total = patrimonio_rv + kpi_rf_patrimonio
    lucro_aberto_total = lucro_nao_realizado_rv + kpi_rf_lucro_aberto
    custo_total_global = custo_ativos_vivos_rv + kpi_rf_custo
    
    # Lucro Realizado Total = RV Realizado + RF Realizado (Respeitando filtro)
    lucro_realizado_total_global = lucro_ja_realizado_kpi + kpi_rf_lucro_realizado
    
    # -----------------------------------------------------------
    
    # Lucro Total do Projeto (Tudo que ganhou na vida)
    lucro_total_absoluto = lucro_aberto_total + lucro_realizado_total_global + total_proventos_kpi

    # Deltas
    delta_lucro = f"{(lucro_aberto_total/custo_total_global)*100:.1f}%" if custo_total_global > 0 else None
    
    rend_real_pct = f"{(lucro_ja_realizado_kpi / custo_total_global * 100):.1f}%" if custo_total_global > 0 else None
    rend_prov_pct = f"{(total_proventos_kpi / custo_total_global * 100):.1f}%" if custo_total_global > 0 else None
    rend_tot_pct = f"{(lucro_total_absoluto / custo_total_global * 100):.1f}%" if custo_total_global > 0 else None

# --- 6. EXIBIÇÃO KPIs (ATUALIZADO COM VARIAÇÃO DIÁRIA) ---
    
    # 1. Calcular Variação Diária em Reais (Apenas ativos em carteira)
    lucro_diario_brl = 0.0
    if not df_view.empty and 'mapa_variacao' in locals():
        for _, row in df_view.iterrows():
            if row['Qtd'] > 0: # Só calcula se tiver posição
                tkr = row['Ticker']
                var_unitaria = mapa_variacao.get(tkr, 0.0)
                
                # Fator moeda
                fator = 1.0
                if row['Moeda'] == 'USD': fator = usd
                elif row['Moeda'] == 'CAD': fator = cad
                elif row['Moeda'] == 'EUR': fator = eur
                
                # Qtd * (Preço Hoje - Preço Ontem) * Câmbio
                lucro_diario_brl += (row['Qtd'] * var_unitaria * fator)

    # 2. Calcular % Relativa ao Patrimônio TOTAL
    pct_dia_total = 0.0
    if patrimonio_total > 0:
        pct_dia_total = (lucro_diario_brl / patrimonio_total) * 100

    st.title("🚀 Dashboard de Investimentos 🚀")
    
    # Layout Ajustado: Lucro Diário ao lado do Patrimônio Total
    c1, c2, c3, c4, c5 = st.columns(5)
    
    c1.metric("Patrimônio Total", f"R$ {patrimonio_total:,.2f}")
    
    # AQUI ESTÁ A MÁGICA: O Delta é a % sobre o TOTAL do patrimônio
    cor_delta = "normal" if lucro_diario_brl >= 0 else "inverse"
    c2.metric("Lucro/Prej. Diário", f"R$ {lucro_diario_brl:,.2f}", delta=f"{pct_dia_total:.2f}% (do Total)")
    
    c3.metric("Lucro Aberto (RV+RF)", f"R$ {lucro_aberto_total:,.2f}", delta=delta_lucro)
    c4.metric("Proventos Totais", f"R$ {total_proventos_kpi:,.2f}", delta=rend_prov_pct)
    c5.metric("Lucro Realizado", f"R$ {lucro_realizado_total_global:,.2f}", delta=rend_real_pct)

    st.markdown("---")

    tab1, tab2, tab3, tab4, tab5, tab6, tab7 = st.tabs([
        "📊 Consolidado", "📋 Renda Variável - Detalhamento", "₿ Cripto/Específico", "💱 Câmbio", "💰 Proventos", "🦁 Imposto", "🏦 Renda Fixa"
    ])
    
    with tab1:
        st.subheader("💎 Visão do Gestor (Portfólio Global)")
    
        # --- 0. UNIFICAÇÃO DE DADOS (RV + RF + CAIXA) PARA GRÁFICOS ---
        lista_global_graficos = []
        
        # A. Adiciona Renda Variável (Filtro > 1.0 para limpar resíduos)
        if not df_view.empty:
            df_rv_g = df_view[df_view['Valor Hoje (R$)'] > 1.0].copy()
            # Ajuste de Setores Visuais
            commodities_list = ['IAU', 'SIVR', 'SLV', 'GLD', 'DBC', 'SIVIR']
            cripto_list = ['BTC', 'ETH', 'SOL', 'USDT', 'USDC', 'BTC-USD', 'HBAR']
            
            df_rv_g.loc[df_rv_g['Ticker'].isin(commodities_list), 'Setor'] = 'Commodities'
            df_rv_g.loc[df_rv_g['Ticker'].isin(cripto_list), 'Setor'] = 'Cripto'
            
            lista_global_graficos.append(df_rv_g[['Ticker', 'Setor', 'Moeda', 'Valor Hoje (R$)', 'Rent. (%)']])

        # B. Adiciona Renda Fixa e Caixa (Se existirem e estiverem ativos)
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

        # Concatena tudo
        if lista_global_graficos:
            df_grafico = pd.concat(lista_global_graficos, ignore_index=True)
        else:
            df_grafico = pd.DataFrame()

        if not df_grafico.empty:
            total_view = df_grafico['Valor Hoje (R$)'].sum()
            
            # --- 1. HUD (Global) ---
            with st.container(border=True):
                k1, k2, k3 = st.columns(3)
                ativo_top = df_grafico.loc[df_grafico['Rent. (%)'].idxmax()]
                ativo_low = df_grafico.loc[df_grafico['Rent. (%)'].idxmin()]
                
                k1.metric("🚀 Maior Rentabilidade", ativo_top['Ticker'], f"{ativo_top['Rent. (%)']:.1f}%")
                k2.metric("🐢 Menor Rentabilidade", ativo_low['Ticker'], f"{ativo_low['Rent. (%)']:.1f}%", delta_color="inverse")
                k3.metric("📊 Patrimônio Gráfico", f"R$ {total_view:,.2f}", help="Total considerado nestes gráficos")

            # --- 2. HEATMAP (GLOBAL) ---
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

            # --- 3. ALOCAÇÃO ESTRATÉGICA (EVOLUÍDO - 3 CAMADAS) ---
            col_esq, col_dir = st.columns([1, 1])
            with col_esq:
                st.markdown("#### 🍩 Distribuição Estratégica (Geo & Classe)")
                
                # --- LÓGICA DE CLASSIFICAÇÃO PARA 3 CAMADAS (ATUALIZADA COM TSM) ---
                def classificar_camadas(row):
                    # CAMADA 1: Macro Alocação
                    macro = 'Renda Variável'
                    if row['Setor'] in ['Renda Fixa', 'Caixa/Liquidez']:
                        macro = 'Renda Fixa'
                    
                    # CAMADA 2: Detalhamento Tático
                    sub = row['Setor']
                    tkr = str(row['Ticker']).upper()
                    
                    if macro == 'Renda Fixa':
                        # Lógica RF: Prioriza Tesouro Direto conforme solicitado
                        if 'CAIXA' in tkr or 'SALDO' in tkr or 'CASH' in tkr or row['Setor'] == 'Caixa/Liquidez': 
                            sub = 'Caixa'
                        elif 'CDB' in tkr: sub = 'CDBs'
                        elif 'LCI' in tkr or 'LCA' in tkr: sub = 'LCI/LCA'
                        elif 'DEBENTURE' in tkr: sub = 'Debêntures'
                        else: 
                            # Qualquer "Outros RF" vira Tesouro Direto por padrão
                            sub = 'Tesouro Direto'
                        
                    elif sub == 'Ações Internacional':
                        # Lógica RV: Separação Geográfica (EUA vs Mundo)
                        # Lista de ativos EX-US (Europa, Global, Canadá, Ásia/Taiwan)
                        # ADICIONADO: TSM
                        ativos_mundo = ['VWRA', 'WRLD', 'ACWI', 'VT', 'URTH', 'ASML', 'DPM', 'TSM']
                        
                        # Verifica se está na lista ou se é .TO (Toronto/Canadá)
                        if any(x in tkr for x in ativos_mundo) or '.TO' in tkr: 
                            sub = 'Ações Mundo'
                        else:
                            sub = 'Ações EUA' # Padrão para internacional (NVDA, GOOGL, etc)
                    
                    # Outros setores (FIIs, Ações Brasil, Cripto) mantêm o nome original
                    
                    return pd.Series([macro, sub])

                # Aplica a lógica
                df_grafico[['Layer1', 'Layer2']] = df_grafico.apply(classificar_camadas, axis=1)
                
                fig_sun = px.sunburst(
                    df_grafico, 
                    path=['Layer1', 'Layer2', 'Ticker'], 
                    values='Valor Hoje (R$)', 
                    color='Layer2', 
                    color_discrete_sequence=px.colors.qualitative.Prism
                )
                
                fig_sun.update_layout(margin=dict(t=10, l=10, r=10, b=10), height=500)
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

            # --- 4. DESEMPENHO E EFICIÊNCIA (GLOBAL) ---
            c1, c2 = st.columns([3, 2])
            with c1:
                st.markdown("#### 🏆 Top Movers (Global)")
                top5 = df_grafico.nlargest(5, 'Rent. (%)')
                bot5 = df_grafico.nsmallest(5, 'Rent. (%)').sort_values('Rent. (%)', ascending=False)
                df_podium = pd.concat([top5, bot5]).drop_duplicates()
                
                if not df_podium.empty:
                    df_podium['Cor'] = df_podium['Rent. (%)'].apply(lambda x: '#4CAF50' if x >= 0 else '#FF5252')
                    fig_bar = px.bar(
                        df_podium, 
                        x='Rent. (%)', 
                        y='Ticker', 
                        orientation='h', 
                        text='Rent. (%)', 
                        hover_data=['Valor Hoje (R$)', 'Setor']
                    )
                    fig_bar.update_traces(marker_color=df_podium['Cor'], texttemplate='%{text:.1f}%', textposition='outside')
                    fig_bar.update_layout(yaxis={'categoryorder':'total ascending'}, height=450)
                    st.plotly_chart(fig_bar, use_container_width=True)
            
            with c2:
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

            # --- 5. CONCENTRAÇÃO (PARETO GLOBAL) ---
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

            # --- 6. COMPOSIÇÃO EXTRA (MANTER COMO PEDIDO) ---
            st.markdown("---")
            st.header("📂 Composição Detalhada (Extra - USD)")
            df_comp = carregar_composicao_extra()
            if not df_comp.empty:
                if 'Valor (R$)' in df_comp.columns:
                    df_comp = df_comp.rename(columns={'Valor (R$)': 'Valor (USD)'})
                col_valor = 'Valor (USD)' if 'Valor (USD)' in df_comp.columns else df_comp.columns[-1]
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
                
                # Acesso seguro ao mapa de variação
                mapa_var_local = locals().get('mapa_variacao', globals().get('mapa_variacao', {}))

                for col in ['PM Compra', 'Preço Atual', 'Qtd']: 
                    df_detalhes[col] = pd.to_numeric(df_detalhes[col], errors='coerce').fillna(0)
                
                df_detalhes['FX'] = df_detalhes['Moeda'].map(fx_map).fillna(1)
                df_detalhes['Valor Atual BRL'] = df_detalhes['Qtd'] * df_detalhes['Preço Atual'] * df_detalhes['FX']
                df_detalhes['Custo BRL'] = df_detalhes['Qtd'] * df_detalhes['PM Compra'] * df_detalhes['FX']
                
                # --- CÁLCULO LUCRO DIÁRIO ---
                def calc_daily_profit(row):
                    tkr = row['Ticker']
                    var_unit = mapa_var_local.get(tkr, 0.0)
                    return row['Qtd'] * var_unit * row['FX']
                df_detalhes['Lucro Diário (R$)'] = df_detalhes.apply(calc_daily_profit, axis=1)

                # --- CÁLCULOS FINANCEIROS BÁSICOS ---
                df_detalhes['Lucro Não Realizado (BRL)'] = df_detalhes['Valor Atual BRL'] - df_detalhes['Custo BRL']
                
                if 'Lucro Realiz. (R$)' in df_detalhes.columns: 
                    df_detalhes['Lucro Realizado (BRL)'] = df_detalhes['Lucro Realiz. (R$)']
                else: 
                    df_detalhes['Lucro Realizado (BRL)'] = 0
                
                # --- KPIs GERAIS ---
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
                
                # ==============================================================================
                # CÁLCULOS FINAIS PARA TABELA E GRÁFICO
                # ==============================================================================
                
                # 1. Resultado Total Absoluto
                df_detalhes['Resultado Total (R$)'] = (
                    df_detalhes['Lucro Não Realizado (BRL)'].fillna(0) + 
                    df_detalhes['Lucro Realizado (BRL)'].fillna(0) + 
                    df_detalhes['Proventos (R$)'].fillna(0)
                )

                # 2. Rentabilidade Real (%)
                def calcular_rentabilidade_total(row):
                    custo = row['Custo BRL']
                    if custo <= 0: # Se ativo encerrado, tenta estimar custo histórico
                        custo = row['Volume Vendas (R$)'] - row['Lucro Realizado (BRL)']
                    if custo > 0:
                        return (row['Resultado Total (R$)'] / custo) * 100
                    return 0.0

                df_detalhes['Rent. BRL (%)'] = df_detalhes.apply(calcular_rentabilidade_total, axis=1)

                # ==============================================================================
                # 📊 NOVO GRÁFICO: PERFORMANCE TOTAL POR ATIVO
                # ==============================================================================
                st.markdown("### 🧬 Rentabilidade Total por Ativo (N realizado, realizado + proventos))")
                st.caption("Considera: Valorização + Lucro Realizado + Dividendos / Custo Total")

                # Prepara dados para o gráfico (Ordena do maior para o menor retorno)
                df_chart = df_detalhes.sort_values('Rent. BRL (%)', ascending=True).copy()
                
                # Altura dinâmica: Se tiver muitos ativos, o gráfico cresce para não ficar espremido
                altura_grafico = max(500, len(df_chart) * 25)

                fig_perf = px.bar(
                    df_chart, 
                    x='Rent. BRL (%)', 
                    y='Ticker',
                    orientation='h',
                    text='Rent. BRL (%)',
                    hover_data=['Resultado Total (R$)', 'Proventos (R$)', 'Lucro Realizado (BRL)'],
                    color='Rent. BRL (%)',
                    color_continuous_scale=['#FF5252', '#FFEB3B', '#4CAF50'], # Vermelho -> Amarelo -> Verde
                    color_continuous_midpoint=0
                )

                fig_perf.update_traces(
                    texttemplate='%{text:.1f}%', 
                    textposition='outside',
                    marker_line_width=0,
                    opacity=0.9
                )
                
                fig_perf.update_layout(
                    height=altura_grafico,
                    xaxis_title="Rentabilidade Total (%)",
                    yaxis_title=None,
                    showlegend=False,
                    coloraxis_showscale=False, # Esconde a barra de cores lateral para limpar o visual
                    margin=dict(l=0, r=40, t=30, b=30),
                    yaxis=dict(type='category') # Garante que mostre todos os tickers
                )
                
                # Linha vertical no zero para referência
                fig_perf.add_vline(x=0, line_width=1, line_color="gray", line_dash="dot")

                st.plotly_chart(fig_perf, use_container_width=True)
                
                st.markdown("---")

                # ==============================================================================
                # TABELA CONSOLIDADA
                # ==============================================================================
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
                
                def color_rent(val):
                    color = '#2E7D32' if val >= 0 else '#C62828'
                    return f'color: {color}'

                st.dataframe(tabela.style.format({
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
                    'Resultado Total (R$)': 'R$ {:,.2f}', 
                    'Rent. BRL (%)': '{:.2f}%'
                })
                .map(color_diario, subset=['Lucro Diário (R$)'])
                .map(color_rent, subset=['Rent. BRL (%)'])
                .background_gradient(subset=['Resultado Total (R$)'], cmap='RdYlGn', vmin=-total_valor*0.1, vmax=total_valor*0.1)
                .apply(lambda x: ['font-weight: bold; background-color: #f0f2f6' if x['Ticker'] == 'TOTAL 💰' else '' for i in x], axis=1), use_container_width=True, height=600)
            else: 
                st.info("Nenhuma posição de Renda Variável encontrada.")
        else: 
            st.info("Nenhum dado disponível para visualização.")

    with tab3:
        if not df_view.empty:
            df_cripto = df_view[df_view['Setor'] == 'Cripto'].copy()
            if not df_cripto.empty:
                st.subheader("₿ Criptomoedas")
                altura_cripto = (len(df_cripto) + 1) * 35 + 3
                st.dataframe(df_cripto, use_container_width=True, height=altura_cripto)
                st.markdown("---")
                row_btc = df_cripto[df_cripto['Ticker'].str.contains('BTC')].head(1)
                if not row_btc.empty:
                    ticker_btc = row_btc['Ticker'].values[0]
                    pm_btc = row_btc['PM Compra'].values[0]
                    st.markdown(f"### 📈 Evolução BTC ({ticker_btc})")
                    @st.cache_data(ttl=3600)
                    def get_btc_chart(tkr):
                        try:
                            d = yf.download(tkr, period="1y", interval="1d", progress=False)
                            if isinstance(d.columns, pd.MultiIndex): d.columns = d.columns.get_level_values(0)
                            return d[['Close']]
                        except: return pd.DataFrame()
                    df_btc_chart = get_btc_chart(ticker_btc)
                    if not df_btc_chart.empty:
                        fig_btc = px.line(df_btc_chart, x=df_btc_chart.index, y='Close', title=f"Histórico 1 Ano - {ticker_btc}")
                        fig_btc.update_traces(line_color='#F7931A', name='Preço BTC')
                        if pm_btc > 0:
                            fig_btc.add_hline(y=pm_btc, line_dash="dash", line_color="green", annotation_text=f"Meu Preço: {pm_btc:,.2f}", annotation_position="top left")
                        fig_btc.update_layout(height=450, hovermode="x unified", yaxis_title="Preço (USD/BRL)")
                        st.plotly_chart(fig_btc, use_container_width=True)
                    else: 
                        st.warning("Não foi possível carregar o gráfico do Yahoo Finance.")
                else: 
                    st.info("Ativo BTC não encontrado.")
            else: 
                st.info("Nenhuma cripto nos filtros atuais.")

    with tab4:
        st.subheader("💱 Terminal de Câmbio Global & Hedge (Caixa + Custódia)")
        
        # --- 1. ENGINE DE DADOS (CARGA E INTEGRAÇÃO DE CUSTÓDIA) ---
        carteiras = {}
        moedas_encontradas = set()
        
        # A. Processamento do Fluxo de Caixa (Câmbio Realizado - APORTE)
        # O PM é sagrado: vem estritamente do dinheiro que você enviou (cambio.csv)
        try:
            if os.path.exists(CAMINHO_CAMBIO) and os.path.getsize(CAMINHO_CAMBIO) > 0:
                df_cambio = pd.read_csv(CAMINHO_CAMBIO, sep=";")
                
                # Limpeza Numérica
                cols_num = ['Valor Total entrada', 'Valor Total saída', 'VET']
                for col in cols_num:
                    if col in df_cambio.columns:
                        df_cambio[col] = df_cambio[col].astype(str).str.replace('.', '', regex=False).str.replace(',', '.', regex=False)
                        df_cambio[col] = pd.to_numeric(df_cambio[col], errors='coerce').fillna(0)
                
                df_cambio['Moeda Origem'] = df_cambio['Moeda Origem'].str.upper().str.strip()
                df_cambio['Moeda Destino'] = df_cambio['Moeda Destino'].str.upper().str.strip()
                df_cambio['Data'] = pd.to_datetime(df_cambio['Data'], dayfirst=True, errors='coerce')
                
                todas_moedas_cambio = set(df_cambio['Moeda Origem'].unique()) | set(df_cambio['Moeda Destino'].unique())
                moedas_encontradas = set(todas_moedas_cambio - {'BRL'})
                
                # Cálculo Inicial (Apenas Caixa)
                for moeda in moedas_encontradas:
                    # Saldo Financeiro (Cash)
                    entradas = df_cambio[df_cambio['Moeda Destino'] == moeda]['Valor Total saída'].sum()
                    saidas = df_cambio[df_cambio['Moeda Origem'] == moeda]['Valor Total entrada'].sum()
                    saldo_cash = entradas - saidas
                    
                    # Definição de Moeda Base (BRL ou USD) para PM
                    filt_entrada = df_cambio[df_cambio['Moeda Destino'] == moeda]
                    moeda_base_calculo = 'BRL'
                    if moeda != 'USD':
                        if not filt_entrada[filt_entrada['Moeda Origem'] == 'USD'].empty:
                            moeda_base_calculo = 'USD'
                    
                    # PM Financeiro (Custo de Aquisição da Moeda - APORTE REAL)
                    aportes_origem = filt_entrada[filt_entrada['Moeda Origem'] == moeda_base_calculo]
                    investido_base = aportes_origem['Valor Total entrada'].sum()
                    qtd_comprada_base = aportes_origem['Valor Total saída'].sum()
                    
                    pm = investido_base / qtd_comprada_base if qtd_comprada_base > 0 else 0
                    
                    carteiras[moeda] = {
                        'saldo': saldo_cash, # Saldo APENAS de caixa por enquanto
                        'saldo_equity': 0.0, # Será preenchido abaixo
                        'pm': pm, 
                        'investido': investido_base,
                        'moeda_base': moeda_base_calculo
                    }
        except Exception as e:
            st.error(f"Erro no processamento de câmbio: {e}")

        # B. Integração de Custódia (Mark-to-Market dos Ativos)
        # Soma o valor das ações (ASML, DPM) ao saldo da moeda para ver a EXPOSIÇÃO TOTAL
        if 'df_view' in locals() and not df_view.empty:
            for index, row in df_view.iterrows():
                tkr = str(row['Ticker']).upper()
                val_r = row['Valor Hoje (R$)']
                
                # Regras de Negócio (Geografia do Ativo)
                moeda_asset = 'USD' # Default global
                
                # 1. Tenta identificar pela coluna Moeda se existir
                if 'Moeda' in df_view.columns:
                     m_temp = str(row['Moeda']).upper()
                     if m_temp in ['EUR', 'CAD', 'GBP', 'CHF', 'JPY']: moeda_asset = m_temp
                
                # 2. Overrides Específicos (Solicitação do Cliente)
                if 'ASML' in tkr: moeda_asset = 'EUR'
                if 'DPM' in tkr or '.TO' in tkr: moeda_asset = 'CAD'
                if 'TSM' in tkr: moeda_asset = 'USD'
                
                if moeda_asset == 'BRL': continue
                
                # Adiciona moeda à lista de encontradas se for nova
                moedas_encontradas.add(moeda_asset)
                
                # Inicializa carteira se não existir no câmbio
                if moeda_asset not in carteiras:
                    carteiras[moeda_asset] = {'saldo': 0.0, 'saldo_equity': 0.0, 'pm': 0.0, 'investido': 0.0, 'moeda_base': 'BRL'}
                
                # Conversão Reversa (R$ -> Moeda) para estimar "Quantidade Nocional"
                ticker_pair = f"{moeda_asset}BRL=X"
                rate = mapa_precos.get(ticker_pair, 0)
                if rate == 0: 
                    if moeda_asset == 'USD': rate = 5.0
                    elif moeda_asset == 'EUR': rate = 5.5
                    elif moeda_asset == 'CAD': rate = 4.0
                    else: rate = 1.0
                
                qtd_nocional = val_r / rate
                carteiras[moeda_asset]['saldo_equity'] += qtd_nocional

        # Atualiza lista final ordenada
        lista_moedas_final = sorted(list(moedas_encontradas))

        # --- 2. CONTROLE DE MESA ---
        col_sel, col_kpi_top = st.columns([1, 4])
        with col_sel:
            idx_def = 0
            if 'USD' in lista_moedas_final: idx_def = lista_moedas_final.index('USD')
            st.markdown("##### Ativo Objeto")
            moeda_sel = st.pills("Selecione:", lista_moedas_final, default=lista_moedas_final[idx_def] if lista_moedas_final else None)
        
        # Recupera dados completos
        dados = carteiras.get(moeda_sel, {'saldo':0, 'saldo_equity':0, 'pm':0, 'investido':0, 'moeda_base':'BRL'})
        
        # Exposição Total = Caixa + Ações
        saldo_caixa = dados['saldo']
        saldo_equity = dados['saldo_equity']
        saldo_total = saldo_caixa + saldo_equity
        
        pm = dados['pm']
        moeda_base = dados['moeda_base']

        # Definição de Ticker e Símbolo
        if moeda_base == 'USD':
            if moeda_sel == 'CAD': ticker_atual = 'CADUSD=X'
            elif moeda_sel == 'EUR': ticker_atual = 'EURUSD=X'
            elif moeda_sel == 'GBP': ticker_atual = 'GBPUSD=X'
            else: ticker_atual = f'{moeda_sel}{moeda_base}=X'
            
            # Ajuste fino Yahoo
            if moeda_sel == 'CAD': ticker_atual = 'CAD=X'
            
            simbolo_ref = "US$"
        else:
            ticker_atual = f'{moeda_sel}BRL=X'
            simbolo_ref = "R$"

        cotacao_atual = mapa_precos.get(ticker_atual, 0.0)
        if cotacao_atual == 0:
             try:
                 temp = yf.Ticker(ticker_atual).history(period='1d')
                 if not temp.empty: cotacao_atual = temp['Close'].iloc[-1]
             except: pass
        
        # Lógica de Inversão (Para CAD/USD onde o Yahoo manda invertido)
        # O PM é (USD gastos / CAD comprados), ex: 0.70. O Ticker CAD=X é 1.40.
        # Precisamos inverter o ticker para comparar bananas com bananas.
        cotacao_calculo = cotacao_atual
        inverter_grafico = False
        
        if moeda_sel == 'CAD' and moeda_base == 'USD' and cotacao_atual > 1:
             cotacao_calculo = 1 / cotacao_atual
             inverter_grafico = True

        # --- 3. DASHBOARD DE POSIÇÃO (Total View) ---
        if saldo_total > 0.01:
            val_mercado = saldo_total * cotacao_calculo
            custo_posicao = saldo_total * pm
            lucro = val_mercado - custo_posicao
            pct_retorno = ((cotacao_calculo - pm) / pm * 100) if pm > 0 else 0
            
            with col_kpi_top:
                st.markdown(f"##### Exposição Total ({moeda_sel} via {moeda_base})")
                k1, k2, k3, k4 = st.columns(4)
                
                help_saldo = f"Caixa: {saldo_caixa:,.2f} | Ativos: {saldo_equity:,.2f}"
                k1.metric(f"Exposição Nominal", f"{saldo_total:,.2f}", help=help_saldo)
                k2.metric(f"Preço Médio ({moeda_base})", f"{simbolo_ref} {pm:,.4f}", help="Baseado no histórico de conversão (cambio.csv)")
                k3.metric(f"Mark-to-Market ({moeda_base})", f"{simbolo_ref} {val_mercado:,.2f}")
                k4.metric("Unrealized PnL", f"{simbolo_ref} {lucro:,.2f}", f"{pct_retorno:.2f}%", delta_color="normal")
            
            st.markdown("---")
            
            # --- 4. VISUALIZAÇÃO TÉCNICA ---
            col_gauge, col_chart = st.columns([1, 2])
            
            with col_gauge:
                st.markdown("###### 🧭 Termômetro (Spot vs PM)")
                max_g = max(cotacao_calculo, pm) * 1.25 if pm > 0 else (cotacao_calculo * 1.2 if cotacao_calculo > 0 else 1)
                min_g = pm * 0.75 if pm > 0 else 0
                
                fig_g = go.Figure(go.Indicator(
                    mode="gauge+number+delta", value=cotacao_calculo,
                    title={'text': f"Cotação ({moeda_base})"},
                    delta={'reference': pm, 'increasing':{'color':'#4CAF50'}, 'decreasing':{'color':'#FF5252'}} if pm > 0 else None,
                    gauge={
                        'axis': {'range': [min_g, max_g]},
                        'bar': {'color': "#2196F3"},
                        'steps': [{'range': [min_g, pm], 'color': '#FFEBEE'}, {'range': [pm, max_g], 'color': '#E8F5E9'}] if pm > 0 else [],
                        'threshold': {'line': {'color': "black", 'width': 4}, 'thickness': 0.75, 'value': pm} if pm > 0 else None
                    }
                ))
                fig_g.update_layout(height=280, margin=dict(l=30,r=30,t=40,b=20))
                st.plotly_chart(fig_g, use_container_width=True)

            with col_chart:
                st.markdown(f"###### 📈 Histórico: {ticker_atual}")
                @st.cache_data(ttl=3600)
                def get_chart_data_fx(t):
                    try:
                        d = yf.download(t, period="1y", interval="1d", progress=False)
                        if isinstance(d.columns, pd.MultiIndex): d.columns = d.columns.get_level_values(0)
                        return d[['Close']]
                    except: return pd.DataFrame()
                
                df_chart = get_chart_data_fx(ticker_atual)
                
                if not df_chart.empty:
                    # Aplica a inversão no gráfico também, para bater com o PM e Cotação de Cálculo
                    if inverter_grafico:
                        df_chart['Close'] = 1 / df_chart['Close']

                    df_chart['SMA50'] = df_chart['Close'].rolling(50).mean()
                    
                    fig_line = px.line(df_chart, x=df_chart.index, y='Close')
                    fig_line.update_traces(line_color='#1976D2', name=f'Spot ({moeda_base})')
                    fig_line.add_trace(go.Scatter(x=df_chart.index, y=df_chart['SMA50'], mode='lines', name='Média 50d', line=dict(color='#FF9800', dash='dot')))
                    
                    # LINHA DE PM (Ajustada e Garantida)
                    if pm > 0: 
                        fig_line.add_hline(
                            y=pm, 
                            line_dash="solid", 
                            line_color="#4CAF50", 
                            line_width=2,
                            annotation_text=f"Seu PM: {simbolo_ref}{pm:.3f}", 
                            annotation_position="bottom right",
                            annotation_font_color="green"
                        )
                    
                    fig_line.update_layout(height=280, hovermode="x unified", margin=dict(l=0, r=0, t=20, b=0), legend=dict(orientation="h", y=1.1))
                    st.plotly_chart(fig_line, use_container_width=True)
                else:
                    st.warning("Dados históricos indisponíveis.")

            # --- 5. STRESS TEST (Sobre EXPOSIÇÃO TOTAL) ---
            st.markdown("---")
            st.markdown(f"### 🔬 Stress Test (Cash + Equity)")
            st.caption(f"Aplicando choque sobre **{simbolo_ref} {val_mercado:,.2f}** (Valor de Mercado Total).")
            
            with st.container(border=True):
                c_risk1, c_risk2 = st.columns([1, 2])
                with c_risk1:
                    cenario_fx = st.slider(f"Choque {moeda_sel} vs {moeda_base}", -30, 30, 0, format="%d%%")
                    if pm > 0:
                        dist = (cotacao_calculo - pm) / cotacao_calculo * 100
                        cor_s = "green" if dist > 0 else "red"
                        lbl = "Margem Segurança" if dist > 0 else "Drawdown p/ PM"
                        st.markdown(f"<span style='color:{cor_s}; font-weight:bold'>{lbl}: {dist:+.2f}%</span>", unsafe_allow_html=True)
                
                with c_risk2:
                    cot_sim = cotacao_calculo * (1 + cenario_fx / 100)
                    val_sim = saldo_total * cot_sim
                    pnl_sim = val_sim - custo_posicao
                    delta = val_sim - val_mercado
                    
                    c1, c2, c3 = st.columns(3)
                    c1.metric("Cotação Simulada", f"{simbolo_ref} {cot_sim:.3f}")
                    c2.metric("Impacto Financeiro", f"{simbolo_ref} {delta:,.2f}", delta=f"{cenario_fx}%")
                    c3.metric("PnL Projetado", f"{simbolo_ref} {pnl_sim:,.2f}")
                    st.progress(min(max((50 + cenario_fx), 0), 100) / 100)

            # --- 6. EXTRATO (Apenas Caixa) ---
            st.markdown("---")
            with st.expander("📂 Histórico Financeiro (Fluxo de Caixa)", expanded=False):
                if 'df_cambio' in locals():
                     df_filt = df_cambio[(df_cambio['Moeda Origem'] == moeda_sel) | (df_cambio['Moeda Destino'] == moeda_sel)].sort_values('Data', ascending=False)
                     st.dataframe(df_filt[['Data', 'Moeda Origem', 'Valor Total entrada', 'Moeda Destino', 'Valor Total saída']], use_container_width=True, hide_index=True)
        else:
            with col_kpi_top:
                st.info(f"Sem exposição identificada em {moeda_sel}.")
                st.metric("Cotação", f"{simbolo_ref} {cotacao_calculo:.3f}")

        # --- 7. MONITOR GLOBAL ---
        st.markdown("### 🌐 Monitor de Paridades")
        cols_m = st.columns(6)
        lista_paineis = [('USD', 'BRL=X'), ('EUR', 'EURBRL=X'), ('CAD', 'CADBRL=X'), ('GBP', 'GBPBRL=X'), ('CHF', 'CHFBRL=X'), ('JPY', 'JPYBRL=X')]
        for i, (nome, tkr) in enumerate(lista_paineis):
            p = mapa_precos.get(tkr, 0.0)
            cols_m[i].metric(nome, f"R$ {p:.3f}")

    with tab5:
        if not df_proventos_bruto.empty:
            df_p = df_proventos_bruto.copy()
            if filtro_moeda != 'Todas': 
                df_p = df_p[df_p['moeda'] == filtro_moeda]
            if filtro_setor:
                df_p['setor_calc'] = df_p['ticker'].apply(identificar_setor_ativo)
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
        st.subheader("🦁 Calculadora de Imposto (Estimativa DARF)")
        st.info("ℹ️ **Nota:** O cálculo abaixo reconstrói seu histórico para encontrar o **Lucro Real** de cada venda. Prejuízos passados podem ser abatidos de lucros futuros da mesma classe, mas este painel mostra o imposto devido no mês (competência).")

        # --- 1. MOTOR DE CÁLCULO DE LUCRO (Reconstrução Histórica) ---
        # Precisamos recalcular o PM histórico para saber o lucro exato na data da venda
        df_tax = df_bruto.sort_values('data').copy()
        
        # Dicionário para controlar PM e Qtd dinamicamente
        carteira_tax = {}
        transacoes_tax = []

        def classificar_ativo_fiscal(ticker, mercado='BR'):
            t = str(ticker).upper().strip()
            # FIIs
            lista_fiis = ['KNCR11', 'HGCR11', 'HGLG11', 'MXRF11', 'XPML11', 'HCTR11', 'DEVA11', 'CPTS11', 'KNIP11', 'VISC11', 'VGHF11']
            if any(fii in t for fii in lista_fiis) or (t.endswith('11') and 'FII' in t): 
                return 'FII', 0.20
            # ETFs
            etfs_br = ['BOVA11', 'SMAL11', 'IVVB11', 'HASH11', 'XINA11', 'NASD11', 'WRLD11', 'GOLD11']
            codigo = t.replace('.SA', '')
            if codigo in etfs_br or t in etfs_br: 
                return 'ETF', 0.15
            # Cripto (Regra simplificada: isento até 35k, mas vamos tratar como ativo geral 15% para segurança ou separar)
            cripto_list = ['BTC', 'ETH', 'SOL', 'USDT', 'USDC']
            if t in cripto_list:
                return 'Cripto', 0.15
            # Ações (Padrão)
            return 'Ações', 0.15

        for _, row in df_tax.iterrows():
            tkr = row['ticker']
            tipo = str(row['tipo']).lower()
            qtd = row['quantidade']
            preco = row['preco']
            custo_op = (qtd * preco) + row.get('taxas', 0)
            
            # Inicializa ativo na carteira virtual
            if tkr not in carteira_tax: carteira_tax[tkr] = {'qtd': 0.0, 'custo_total': 0.0}
            
            if 'compra' in tipo:
                carteira_tax[tkr]['qtd'] += qtd
                carteira_tax[tkr]['custo_total'] += custo_op
            
            elif 'venda' in tipo:
                pm_atual = (carteira_tax[tkr]['custo_total'] / carteira_tax[tkr]['qtd']) if carteira_tax[tkr]['qtd'] > 0 else 0
                
                # Custo da parte vendida
                custo_venda = qtd * pm_atual
                valor_venda = (qtd * preco)
                lucro_venda = valor_venda - custo_venda
                
                # Atualiza carteira
                carteira_tax[tkr]['qtd'] -= qtd
                carteira_tax[tkr]['custo_total'] -= custo_venda # Abate proporcionalmente
                
                classe, aliquota = get_classe_imposto(tkr)
                
                transacoes_tax.append({
                    'data': row['data'],
                    'mes_ano': row['data'].strftime('%Y-%m'),
                    'ticker': tkr,
                    'classe': classe,
                    'aliquota': aliquota,
                    'volume_venda': valor_venda,
                    'lucro': lucro_venda
                })

        df_transacoes_tax = pd.DataFrame(transacoes_tax)

        if not df_transacoes_tax.empty:
            # --- 2. AGRUPAMENTO POR MÊS ---
            # Agrupa por Mês e Classe para aplicar as regras de isenção
            df_mes = df_transacoes_tax.groupby(['mes_ano', 'classe']).agg({
                'volume_venda': 'sum',
                'lucro': 'sum',
                'aliquota': 'first' # A alíquota é constante por classe
            }).reset_index()

            # Lógica de Cálculo do Imposto
            def calcular_darf(row):
                lucro = row['lucro']
                venda = row['volume_venda']
                classe = row['classe']
                rate = row['aliquota']
                
                # Regra 1: Se teve prejuízo no mês, imposto é zero (idealmente acumula prejuízo, aqui simplificamos)
                if lucro <= 0: return 0.0
                
                # Regra 2: Ações só pagam se vender > 20k
                if classe == 'Ações':
                    if venda > 20000:
                        return lucro * rate
                    else:
                        return 0.0 # Isento
                
                # Regra 3: FIIs, ETFs e outros não tem isenção de 20k
                return lucro * rate

            df_mes['imposto_estimado'] = df_mes.apply(calcular_darf, axis=1)

            # Filtro de Ano para Visualização
            anos_fiscais = sorted(pd.to_datetime(df_mes['mes_ano']).dt.year.unique(), reverse=True)
            ano_view = st.selectbox("📅 Selecione o Ano Fiscal:", anos_fiscais)
            
            # Filtra DF
            df_view_tax = df_mes[df_mes['mes_ano'].str.startswith(str(ano_view))].copy()
            df_view_tax = df_view_tax.sort_values('mes_ano', ascending=False)

            # --- 3. EXIBIÇÃO ---
            
            # KPI Anual
            total_darf_ano = df_view_tax['imposto_estimado'].sum()
            lucro_tributavel_ano = df_view_tax[df_view_tax['imposto_estimado'] > 0]['lucro'].sum()
            
            k1, k2 = st.columns(2)
            k1.metric(f"💸 DARF Estimado ({ano_view})", f"R$ {total_darf_ano:,.2f}", help="Soma dos impostos devidos mês a mês")
            k2.metric(f"Lucro Tributável Total", f"R$ {lucro_tributavel_ano:,.2f}", help="Soma dos lucros que geraram imposto")
            
            st.markdown("---")
            st.subheader(f"🗓️ Detalhamento Mensal ({ano_view})")
            
            # Formatação visual da tabela
            df_display = df_view_tax[['mes_ano', 'classe', 'volume_venda', 'lucro', 'imposto_estimado']].copy()
            df_display.columns = ['Mês', 'Classe', 'Volume Vendas', 'Lucro/Prejuízo', 'Imposto a Pagar']
            
            def highlight_imposto(val):
                return 'color: #ff4b4b; font-weight: bold' if val > 0 else 'color: #aaa'

            st.dataframe(
                df_display.style.format({
                    'Volume Vendas': 'R$ {:,.2f}',
                    'Lucro/Prejuízo': 'R$ {:,.2f}',
                    'Imposto a Pagar': 'R$ {:,.2f}'
                })
                .map(highlight_imposto, subset=['Imposto a Pagar']),
                use_container_width=True,
                height=400
            )
            
            # --- 4. DETALHAMENTO DAS VENDAS ---
            with st.expander("🔎 Ver Vendas que geraram esses valores"):
                df_detalhe_vendas = df_transacoes_tax[df_transacoes_tax['mes_ano'].str.startswith(str(ano_view))].copy()
                st.dataframe(
                    df_detalhe_vendas[['data', 'ticker', 'classe', 'volume_venda', 'lucro']].sort_values('data', ascending=False)
                    .style.format({'volume_venda': 'R$ {:,.2f}', 'lucro': 'R$ {:,.2f}', 'data':'{:%d/%m/%Y}'})
                    .apply(lambda x: ['background-color: #ffe6e6' if x['lucro'] > 0 and x['classe'] != 'Ações' else '' for i in x], axis=1),
                    use_container_width=True
                )

        else:
            st.info("Nenhuma venda com lucro ou passível de imposto encontrada nos registros.")

    with tab7:
        st.subheader("🏦 Gestão de Renda Fixa & Liquidez")
        
        # --- 1. SEGMENTAÇÃO DE CARTEIRA (PROFESSIONAL VIEW) ---
        # Separa o que é "Caixa/Disponível" do que é "Investimento/Título"
        # Filtra por palavras-chave comuns para caixa
        mask_caixa = df_rf_filtrado['Ativo'].str.contains('Caixa|Cash|Disponivel|Saldo', case=False, na=False)
        
        df_liquidez = df_rf_filtrado[mask_caixa]
        df_alocacao = df_rf_filtrado[~mask_caixa]

        # Dentro da Alocação (Títulos), separa Custódia (Ativo) de Histórico (Encerrado)
        df_custodia = df_alocacao[df_alocacao['Status'] == 'Ativo']
        df_realizado = df_alocacao[df_alocacao['Status'] == 'Encerrado']

        # --- SEÇÃO A: GESTÃO DE LIQUIDEZ ---
        # Soma apenas o caixa que está com status 'Ativo' (saldo atual)
        saldo_caixa = df_liquidez[df_liquidez['Status'] == 'Ativo']['Atual'].sum()
        
        if saldo_caixa > 0:
            st.info(f"💵 **Disponível em Caixa / Conta Corrente:** R$ {saldo_caixa:,.2f}")

        # --- SEÇÃO B: CUSTÓDIA DE TÍTULOS (EM CARTEIRA) ---
        if not df_custodia.empty:
            st.markdown("### 🟢 Custódia de Títulos (Posição Atual)")
            
            # Métricas de Gestão
            principal = df_custodia['Investido'].sum()
            valor_mercado = df_custodia['Atual'].sum()
            resultado_latente = df_custodia['Lucro'].sum() # Lucro se resgatasse hoje
            
            # Cálculo de retorno ponderado da carteira de RF
            retorno_medio = (resultado_latente / principal * 100) if principal > 0 else 0
            
            k1, k2, k3, k4 = st.columns(4)
            k1.metric("Principal Aplicado", f"R$ {principal:,.2f}", help="Valor original aportado")
            k2.metric("Posição Marcada (MtM)", f"R$ {valor_mercado:,.2f}", help="Valor atualizado (Mark-to-Market)")
            k3.metric("Resultado Latente", f"R$ {resultado_latente:,.2f}", help="Lucro bruto não realizado")
            k4.metric("Retorno Ponderado", f"{retorno_medio:.2f}%")
            
            # Tabela Detalhada (View Gestor)
            st.dataframe(
                df_custodia[['Ativo', 'Data', 'Investido', 'Atual', 'Lucro', 'Rent. %']]
                .rename(columns={'Data': 'Data Aplicação', 'Investido': 'Principal', 'Atual': 'Valor Líquido', 'Lucro': 'Resultado R$'})
                .style.format({
                    'Principal': 'R$ {:,.2f}', 
                    'Valor Líquido': 'R$ {:,.2f}',
                    'Resultado R$': 'R$ {:,.2f}', 
                    'Rent. %': '{:.2f}%', 
                    'Data Aplicação': '{:%d/%m/%Y}'
                })
                .background_gradient(subset=['Resultado R$'], cmap='Greens'),
                use_container_width=True
            )
            
            st.markdown("---")
            
            # Gráfico de Alocação (Inclui o Caixa para visão total da classe Renda Fixa)
            st.subheader("📊 Alocação de Recursos (RF + Caixa)")
            
            # Junta Títulos + Caixa Ativo para o gráfico
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
                
        elif opcao_ativo == "Sim":
            st.warning("⚠️ Nenhuma custódia de Títulos de Renda Fixa encontrada. (Verifique se há apenas Caixa)")

        # --- SEÇÃO C: PERFORMANCE REALIZADA (HISTÓRICO) ---
        if not df_realizado.empty:
            st.markdown("---")
            st.markdown("### 🏁 Histórico de Realizações (Vencimentos & Resgates)")
            
            lucro_bolso = df_realizado['Lucro'].sum()
            volume_movimentado = df_realizado['Atual'].sum() # Valor total que voltou para a conta
            
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

if __name__ == "__main__":
    main()

import streamlit as st
import pandas as pd
import yfinance as yf
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime

# --- CONFIGURAÇÃO DA PÁGINA ---
st.set_page_config(page_title="Dashboard Pro", layout="wide", page_icon="📈")

# --- CLASSE DE GESTÃO DA CARTEIRA ---
class PortfolioManager:
    def __init__(self, df_ativos, df_proventos):
        self.df_ativos = df_ativos
        self.df_proventos = df_proventos
        self.tickers = self.df_ativos['Ticker'].unique().tolist()
        
        # Adiciona sufixo .SA se for ação brasileira e não tiver (para o Yahoo Finance achar)
        self.yahoo_tickers = [t + ".SA" if isinstance(t, str) and not t.endswith('.SA') and len(t) < 6 else t for t in self.tickers]
        
    def get_market_data(self):
        """Baixa preços atuais e históricos do Yahoo Finance"""
        if not self.tickers:
            return pd.Series(), pd.DataFrame()
            
        with st.spinner(f'Baixando cotações de {len(self.tickers)} ativos...'):
            # Baixa dados do último ano para gerar gráfico de história
            dados = yf.download(self.yahoo_tickers, period="1y", progress=False)['Close']
            
            # Se for apenas 1 ativo, o pandas retorna Series, precisamos de DataFrame
            if len(self.tickers) == 1:
                dados = pd.DataFrame(dados)
                dados.columns = self.tickers

            # Mapeamento de volta para o nome original (remove .SA visualmente)
            dados.columns = [c.replace('.SA', '') for c in dados.columns]
            
            # Preço atual (última linha válida)
            precos_atuais = dados.ffill().iloc[-1]
            return precos_atuais, dados

    def calcular_posicao(self):
        """Cruza seus dados (qtd/custo) com o mercado (preço atual)"""
        precos_atuais, historico_precos = self.get_market_data()
        
        df_final = self.df_ativos.copy()
        
        # Cria colunas de preço atual e valor de mercado
        # Map usa o ticker para buscar o preço na Series precos_atuais
        df_final['Preco_Atual'] = df_final['Ticker'].map(precos_atuais)
        
        # Se não achou preço (ex: Fundo novo ou erro no ticker), usa o preço médio para não quebrar
        df_final['Preco_Atual'] = df_final['Preco_Atual'].fillna(df_final['Preco_Medio'])
        
        df_final['Saldo_Atual'] = df_final['Quantidade'] * df_final['Preco_Atual']
        df_final['Custo_Total'] = df_final['Quantidade'] * df_final['Preco_Medio']
        
        # Rentabilidade R$ e %
        df_final['Lucro_RS'] = df_final['Saldo_Atual'] - df_final['Custo_Total']
        df_final['Rentabilidade_%'] = ((df_final['Saldo_Atual'] / df_final['Custo_Total']) - 1) * 100
        
        return df_final, historico_precos

# --- FUNÇÕES AUXILIARES ---
def tratar_valores(valor):
    if isinstance(valor, str):
        return float(valor.replace('R$', '').replace('.', '').replace(',', '.'))
    return valor

@st.cache_data
def load_data():
    try:
        # Carrega Ativos
        df_a = pd.read_csv("meus_ativos.csv", sep=',') # Tente sep=';' se der erro
        cols_num = ['Quantidade', 'Preco_Medio']
        for c in cols_num:
            if c in df_a.columns: df_a[c] = df_a[c].apply(tratar_valores)
            
        # Carrega Proventos
        df_p = pd.read_csv("meus_proventos.csv", sep=',') # Tente sep=';' se der erro
        if 'Valor' in df_p.columns: df_p['Valor'] = df_p['Valor'].apply(tratar_valores)
        if 'Data' in df_p.columns: df_p['Data'] = pd.to_datetime(df_p['Data'], dayfirst=True)
            
        return df_a, df_p
    except Exception as e:
        st.error(f"Erro ao ler CSVs: {e}")
        return pd.DataFrame(), pd.DataFrame()

# --- APP PRINCIPAL ---
st.title("🚀 Dashboard de Rentabilidade Inteligente")

# 1. Carregar Dados Locais
df_ativos, df_proventos = load_data()

if not df_ativos.empty:
    # 2. Processar Dados de Mercado (Yahoo Finance)
    pm = PortfolioManager(df_ativos, df_proventos)
    df_consolidado, df_historico = pm.calcular_posicao()

    # --- KPIs GERAIS ---
    total_investido = df_consolidado['Custo_Total'].sum()
    saldo_atual = df_consolidado['Saldo_Atual'].sum()
    lucro_total = saldo_atual - total_investido
    rentabilidade_geral = (lucro_total / total_investido * 100) if total_investido > 0 else 0
    total_proventos = df_proventos['Valor'].sum() if not df_proventos.empty else 0

    # Exibição dos Cards
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("💰 Saldo Bruto", f"R$ {saldo_atual:,.2f}", delta=f"{lucro_total:,.2f} (Lucro)")
    c2.metric("📉 Custo de Aquisição", f"R$ {total_investido:,.2f}")
    c3.metric("📈 Rentabilidade Carteira", f"{rentabilidade_geral:.2f}%")
    c4.metric("💵 Proventos Recebidos", f"R$ {total_proventos:,.2f}")

    st.markdown("---")

    # --- ABAS DE ANÁLISE ---
    tab1, tab2, tab3 = st.tabs(["📊 Visão Geral", "📈 Detalhe por Ativo", "📅 Proventos"])

    with tab1:
        col_g1, col_g2 = st.columns([2,1])
        
        with col_g1:
            st.subheader("Evolução Histórica (Estimada)")
            # Simulação simples: Pega a quantidade ATUAL x Preço Histórico
            # (Para ser exato precisaria do histórico de transações data a data, mas isso já dá uma ótima visão)
            evolucao = pd.DataFrame()
            for ticker in df_consolidado['Ticker']:
                qtd = df_consolidado.loc[df_consolidado['Ticker'] == ticker, 'Quantidade'].values[0]
                # Verifica se o ticker existe no histórico baixado
                nome_col = ticker.replace('.SA', '')
                if nome_col in df_historico.columns:
                    evolucao[ticker] = df_historico[nome_col] * qtd
            
            evolucao['Patrimonio_Total'] = evolucao.sum(axis=1)
            
            fig_evol = px.area(evolucao, x=evolucao.index, y='Patrimonio_Total', 
                               title="Variação do Patrimônio (Baseado na carteira atual)")
            st.plotly_chart(fig_evol, use_container_width=True)

        with col_g2:
            st.subheader("Alocação Atual")
            fig_pizza = px.donut(df_consolidado, values='Saldo_Atual', names='Ticker', hole=0.4)
            st.plotly_chart(fig_pizza, use_container_width=True)

    with tab2:
        st.subheader("Rentabilidade Detalhada por Ativo")
        
        # Tabela estilizada
        st.dataframe(
            df_consolidado[['Ticker', 'Quantidade', 'Preco_Medio', 'Preco_Atual', 'Saldo_Atual', 'Rentabilidade_%']]
            .sort_values('Rentabilidade_%', ascending=False)
            .style.format({
                'Preco_Medio': 'R$ {:.2f}',
                'Preco_Atual': 'R$ {:.2f}',
                'Saldo_Atual': 'R$ {:.2f}',
                'Rentabilidade_%': '{:.2f}%'
            })
            .background_gradient(subset=['Rentabilidade_%'], cmap='RdYlGn'),
            use_container_width=True
        )
        
        # Gráfico de Barras de Rentabilidade
        fig_bar = px.bar(df_consolidado, x='Ticker', y='Rentabilidade_%', 
                         color='Rentabilidade_%', color_continuous_scale='RdYlGn',
                         title="Ranking de Rentabilidade (%)")
        st.plotly_chart(fig_bar, use_container_width=True)

    with tab3:
        if not df_proventos.empty:
            st.subheader("Calendário de Pagamentos")
            df_proventos['Mes_Ano'] = df_proventos['Data'].dt.strftime('%Y-%m')
            agrupado = df_proventos.groupby('Mes_Ano')['Valor'].sum().reset_index()
            
            fig_prov = px.bar(agrupado, x='Mes_Ano', y='Valor', text_auto=True, title="Dividendos por Mês")
            st.plotly_chart(fig_prov, use_container_width=True)
        else:
            st.info("Sem dados de proventos.")

else:
    st.warning("⚠️ Aguardando arquivos 'meus_ativos.csv' e 'meus_proventos.csv'.")
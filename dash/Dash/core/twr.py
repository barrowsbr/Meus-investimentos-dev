import pandas as pd
import numpy as np

def calculate_local_twr(df_prices: pd.DataFrame, df_transacoes: pd.DataFrame) -> pd.DataFrame:
    """
    Calcula Rentabilidade Time-Weighted Return (TWR) usando dados locais.
    
    Args:
        df_prices: DataFrame indexado por DATA (datetime), colunas=Tickers.
        df_transacoes: DataFrame com colunas [Data, Ticker, Tipo, Qtd, Valor].
        
    Returns:
        pd.DataFrame com colunas:
        - Patrimônio (NAV)
        - Retorno_Diario
        - TWR_Acumulado
        - Drawdown
    """
    if df_prices.empty or df_transacoes.empty:
        return pd.DataFrame()
        
    # 1. Padronizar Transações
    df_t = df_transacoes.copy()
    if 'Data' in df_t.columns: df_t['Data'] = pd.to_datetime(df_t['Data'])
    
    # Mapear colunas se necessário
    cols_map = {'ticker': 'Ticker', 'valor': 'Valor', 'tipo': 'Tipo', 'quantidade': 'Qtd', 'data': 'Data'}
    df_t.rename(columns={k:v for k,v in cols_map.items() if k in df_t.columns}, inplace=True)
    df_t['Ticker'] = df_t['Ticker'].astype(str).str.strip().str.upper()
    df_t.sort_values('Data', inplace=True)

    # 2. Definir Range de Datas
    start_date = df_t['Data'].min()
    end_date = df_prices.index.max()
    
    if pd.isna(start_date) or pd.isna(end_date) or start_date > end_date:
        return pd.DataFrame()
        
    all_dates = pd.date_range(start=start_date, end=end_date, freq='D')
    
    # 3. Reconstruir Posição Diária (Quantity per Ticker)
    # Pivotar transações: Index=Data, Columns=Ticker, Values=Qtd
    # Agrupar por dia/ticker primeiro
    
    df_qtd_change = df_t.pivot_table(index='Data', columns='Ticker', values='Qtd', aggfunc='sum').fillna(0)
    
    # Reindexar para todos os dias e somar acumulado (cumsum)
    df_position = df_qtd_change.reindex(all_dates, fill_value=0).cumsum()
    
    # 4. Calcular Fluxo Financeiro Diário (Cash Flow)
    # Aporte (+) / Resgate (-)
    # Assumimos que 'Valor' positivo = Entrada de dinheiro no ativo (Compra) -> Fluxo Positivo para cálculo de TWR?
    # TWR: Retorno = (Valor_Final - Valor_Inicial - Fluxo) / (Valor_Inicial + Fluxo) ou similar.
    # Fluxo EXTERNO. Compra é Fluxo + (entra dinheiro na carteira de ativos). Venda (se sacar) é Fluxo -.
    # Dividendos (reinvestidos ou não): Se não reinvestidos, é saída?
    # Vamos simplificar: Fluxo = Soma(Valor) das transações do dia.
    # Compra: Valor > 0. Venda: Valor < 0 (assumindo sinal financeiro).
    # Verificar sinal do 'Valor' no df_transacoes. Geralmente Compra custa dinheiro (+ inv), Venda devolve (- inv).
    
    df_flow_day = df_t.pivot_table(index='Data', columns='Ticker', values='Valor', aggfunc='sum').fillna(0)
    series_flow_total = df_flow_day.sum(axis=1).reindex(all_dates, fill_value=0)

    # 5. Calcular NAV Diário (Mark-to-Market)
    # NAV = Hora de cruzar Posição (Qtd) x Preço (Prices)
    # Alinhar preços
    df_prices_aligned = df_prices.reindex(all_dates).ffill() 
    
    # Garante que temos preços para todos os tickers da posição
    common_tickers = df_position.columns.intersection(df_prices_aligned.columns)
    
    nav_series = (df_position[common_tickers] * df_prices_aligned[common_tickers]).sum(axis=1)
    
    # 6. Calcular Retorno Diário (TWR)
    # R_t = (NAV_t - NAV_{t-1} - Flow_t) / (NAV_{t-1})
    # Ajuste para Flow no inicio ou fim do dia?
    # Método Modificado Dietz simples diário: NAV_start = NAV_prev + Flow.
    # Se Flow acontece no começo do dia e participa da valorização:
    #   Retorno = (NAV_end - (NAV_prev + Flow)) / (NAV_prev + Flow)
    
    df_result = pd.DataFrame(index=all_dates)
    df_result['NAV'] = nav_series
    df_result['Flow'] = series_flow_total
    
    # Shift NAV para pegar dia anterior
    df_result['NAV_prev'] = df_result['NAV'].shift(1).fillna(0)
    
    # Retorno
    # Evitar divisão por zero
    # Denominador = NAV_prev + Flow
    df_result['Denom'] = df_result['NAV_prev'] + df_result['Flow']
    
    # Numerador = NAV_now - Denom (Ganho de capital puro)
    df_result['Gain'] = df_result['NAV'] - df_result['Denom']
    
    # Ret %
    df_result['Ret_Day'] = np.where(df_result['Denom'] > 0.01, df_result['Gain'] / df_result['Denom'], 0.0)
    
    # Accumulate TWR
    # (1 + r1) * (1 + r2) ...
    df_result['TWR_Acum'] = (1 + df_result['Ret_Day']).cumprod() - 1
    
    # Drawdown
    running_max = df_result['TWR_Acum'].cummax()
    df_result['Drawdown'] = df_result['TWR_Acum'] - running_max
    
    return df_result[['NAV', 'Flow', 'Ret_Day', 'TWR_Acum', 'Drawdown']]

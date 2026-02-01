import pandas as pd
from core.logic import identificar_setor_ativo, normalize_ticker

def calcular_carteira_fechada(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """
    Processa o histórico de transações para calcular a posição atual (FIFO)
    e o lucro realizado histórico.
    
    Retorna:
        - pd.DataFrame com a posição atual (Ticker, Qtd, PM, etc.)
        - dict com lucro realizado por moeda.
    """
    if df.empty:
        cols = ["Ticker", "Setor", "Qtd", "Moeda", "PM_Origem", "Lucro_Realizado_Nativo"]
        return pd.DataFrame(columns=cols), {}
        
    # Validation
    required_cols = ['ticker', 'tipo', 'quantidade', 'preco']
    for col in required_cols:
        if col not in df.columns:
            # Fallback empty
            cols = ["Ticker", "Setor", "Qtd", "Moeda", "PM_Origem", "Lucro_Realizado_Nativo"]
            return pd.DataFrame(columns=cols), {}

    # Local processing copy
    local_df = df.copy()
    
    # Ensure types
    local_df['tipo'] = local_df['tipo'].astype(str).str.lower().str.strip()
    local_df['moeda'] = local_df.get('moeda', 'BRL').astype(str).str.upper().str.strip()
    
    # Sort for Time Travel (FIFO requires strict order)
    if 'data' in local_df.columns:
        local_df = local_df.sort_values('data')

    portfolio = {}
    lucro_realizado_por_moeda = {}
    
    for _, row in local_df.iterrows():
        t = row['ticker']
        moeda = row['moeda']
        qtd = float(abs(row['quantidade']))
        preco = float(row['preco'])
        taxas = float(row.get('taxas', 0) or 0) # Handle NaN/None
        
        if t not in portfolio:
            portfolio[t] = {"lotes": [], "lucro_realizado": 0.0, "moeda": moeda}
            
        ativo = portfolio[t]
        
        tipo_op = row['tipo']
        
        if "compra" in tipo_op or "entrada" in tipo_op or "aporte" in tipo_op:
            custo_total = (qtd * preco) + taxas
            pm_lote = custo_total / qtd if qtd > 0 else 0
            ativo["lotes"].append({"qtd": qtd, "pm": pm_lote})
            
        elif "venda" in tipo_op or "saida" in tipo_op or "resgate" in tipo_op:
            qtd_vender = qtd
            preco_venda = preco
            # Taxas na venda reduzem o lucro líquido (ou aumentam prejuízo)
            # Mas aqui o calculo de lucro costuma ser (PrecoVenda - PM) * Qty - Taxas
            # Vamos simplificar mantendo a lógica original do user, apenas adaptando.
            
            lucro_op = 0.0
            
            while qtd_vender > 0 and ativo["lotes"]:
                lote = ativo["lotes"][0] # FIFO: Pega o primeiro
                
                if lote["qtd"] <= qtd_vender:
                    # Consome lote inteiro
                    qtd_consumida = lote["qtd"]
                    ativo["lotes"].pop(0)
                else:
                    # Consome parcial
                    qtd_consumida = qtd_vender
                    lote["qtd"] -= qtd_consumida
                    
                lucro_op += (preco_venda - lote["pm"]) * qtd_consumida
                qtd_vender -= qtd_consumida
                
            ativo["lucro_realizado"] += lucro_op
            
            # Acumula por moeda
            lucro_realizado_por_moeda[moeda] = lucro_realizado_por_moeda.get(moeda, 0) + lucro_op

    # Montar DataFrame Final
    posicao = []
    for t, dados in portfolio.items():
        qtd_total = sum(l["qtd"] for l in dados["lotes"])
        
        if qtd_total > 0.000001: # Filter tiny floating point residuals
            custo_total = sum(l["qtd"] * l["pm"] for l in dados["lotes"])
            pm_final = (custo_total / qtd_total) if qtd_total > 0 else 0
            
            posicao.append({
                "Ticker": t,
                "Setor": identificar_setor_ativo(t),
                "Qtd": qtd_total,
                "Moeda": dados["moeda"],
                "PM_Origem": pm_final,
                "Lucro_Realizado_Nativo": dados["lucro_realizado"]
            })
            
    return pd.DataFrame(posicao), lucro_realizado_por_moeda


def summarize_fixed_income(df_rf_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Resumo dos investimentos em Renda Fixa consolidando posicoes por Ticker.
    Lida com 'Ativo' (em carteira) vs 'Encerrado' (ja vencido/resgatado).
    
    REFATORADO v5.0:
    - Usa coluna 'Compra' para datas (nova estrutura)
    - SELIC 15% a.a. para ativos em carteira
    - Consistente com FixedIncomeEngine v5.0
    """
    from datetime import datetime
    
    if df_rf_raw.empty:
        return pd.DataFrame(columns=['Ticker', 'Ativo', 'Status', 'Data', 'Investido', 'Atual', 'Lucro', 'Rent. %', 'Moeda'])
    
    # Constantes SELIC (mesmas de FixedIncomeEngine)
    SELIC_ANNUAL = 0.15  # 15% ao ano
    BUSINESS_DAYS_YEAR = 252
    
    lista_rf_proc = []
    
    # Determina coluna de data (nova estrutura usa 'Compra')
    date_col = 'Compra' if 'Compra' in df_rf_raw.columns else 'Data'
    
    # Ensure correct sorting
    df_sorted = df_rf_raw.sort_values(date_col)
    
    # GROUP BY TICKER AND MOEDA (FIX MULTI-CURRENCY)
    # Fill NA Moeda before grouping
    df_sorted['Moeda'] = df_sorted['Moeda'].fillna('BRL')
    
    for (ativo, moeda_grupo), dados in df_sorted.groupby(['Ticker', 'Moeda']):
        # Identifica tipos de operação
        # Na nova estrutura: Compra, Venda, Imposto
        tipos_validos = dados['Tipo'].str.lower().str.strip()
        
        # Separa compras, vendas e impostos
        mask_compra = tipos_validos.str.contains('compra|aporte|entrada', na=False)
        mask_venda = tipos_validos.str.contains('venda|resgate|vencimento', na=False)
        mask_imposto = tipos_validos.str.contains('imposto|ir', na=False)
        
        compras = dados[mask_compra]
        vendas = dados[mask_venda]
        impostos = dados[mask_imposto]
        
        # Total investido
        inv = compras['Valor'].sum() if not compras.empty else 0
        
        # Determina status: tem venda = encerrado
        if not vendas.empty:
            status = 'Encerrado'
            
            # Valor de saída - imposto
            total_saida = vendas['Valor'].sum()
            total_imposto = impostos['Valor'].sum() if not impostos.empty else 0
            
            atl = total_saida - total_imposto  # Líquido
            luc = atl - inv
            
            # Data de referência é a última venda
            data_ref = vendas[date_col].max()
        else:
            status = 'Ativo'
            
            # Check for manual override
            manual_val = 0.0
            if 'Valor Atual' in dados.columns:
                 m_val = pd.to_numeric(dados['Valor Atual'], errors='coerce').max()
                 if pd.notnull(m_val) and m_val > 0:
                     manual_val = m_val

            if manual_val > 0:
                atl = manual_val
                luc = atl - inv
                # We need data_ref. Try to find date of manual update? 
                # Ideally manual update row has a date. We use max date of data.
                if date_col in dados.columns:
                    data_ref = dados[date_col].max()
                else:
                    data_ref = datetime.now()
            else:
                # Calcula valor atual usando SELIC
                atl = 0.0
                data_primeira_compra = None
                
                for _, compra in compras.iterrows():
                    valor_compra = compra['Valor']
                    data_compra = pd.to_datetime(compra[date_col])
                    
                    if data_primeira_compra is None or data_compra < data_primeira_compra:
                        data_primeira_compra = data_compra
                    
                    # Dias desde a compra
                    dias_corridos = (datetime.now() - data_compra).days
                    dias_uteis = int(dias_corridos * BUSINESS_DAYS_YEAR / 365)
                    
                    # Capitaliza pela SELIC (apenas se BRL, se for USD deveria usar rate USD... mas aqui é simples)
                    # TODO: Parametrizar taxa por moeda se necessário. Por enquanto BRL = Selic, USD = 0?
                    if moeda_grupo == 'USD':
                         taxa_diaria = 0 # USD sem yield por enquanto nesta view simples
                    else:
                         taxa_diaria = (1 + SELIC_ANNUAL) ** (1 / BUSINESS_DAYS_YEAR) - 1
                         
                    valor_corrigido = valor_compra * ((1 + taxa_diaria) ** dias_uteis)
                    
                    atl += valor_corrigido
                
                data_ref = data_primeira_compra if data_primeira_compra else datetime.now()
                luc = atl - inv
        
        rent_pct = (luc / inv) * 100 if inv > 0 else 0.0
        
        # Moeda (Já temos no loop)
        moeda = moeda_grupo
        
        lista_rf_proc.append({
            'Ticker': ativo, 
            'Ativo': ativo, 
            'Status': status, 
            'Data': data_ref,
            'Investido': inv, 
            'Atual': atl, 
            'Lucro': luc, 
            'Rent. %': rent_pct,
            'Moeda': moeda
        })
            
    if not lista_rf_proc:
        return pd.DataFrame(columns=['Ticker', 'Ativo', 'Status', 'Data', 'Investido', 'Atual', 'Lucro', 'Rent. %', 'Moeda'])
        
    return pd.DataFrame(lista_rf_proc)

def summarize_fixed_income_hybrid(df_saldos: pd.DataFrame, df_transacoes: pd.DataFrame, df_proventos: pd.DataFrame = None) -> pd.DataFrame:
    """
    Motor Híbrido de Renda Fixa:
    1. Investido = Histórico de Transações.
    2. Atual = Input Manual (Fixa Aberta).
    3. Retorno = (Atual + Proventos Recebidos) - Investido.
    """
    
    # 1. Processar Histórico para obter 'Investido' por Ticker
    lista_investido = []
    
    if not df_transacoes.empty:
        # Standardize cols
        cols_map = {'ticker': 'Ticker', 'valor': 'Valor', 'tipo': 'Tipo', 'moeda': 'Moeda'}
        df_t = df_transacoes.rename(columns={k:v for k,v in cols_map.items() if k in df_transacoes.columns}, inplace=False)
        
        if 'Moeda' not in df_t.columns: df_t['Moeda'] = 'BRL'
        df_t['Moeda'] = df_t['Moeda'].fillna('BRL')
            
        for (ticker, moeda), grupo in df_t.groupby(['Ticker', 'Moeda']):
            t_str = str(ticker).strip().upper()
            m_str = str(moeda).strip().upper()
            
            tipos = grupo['Tipo'].astype(str).str.lower()
            compras = grupo[tipos.str.contains('compra|aporte|entrada')]
             
            total_invest = compras['Valor'].sum()
            
            lista_investido.append({'Ticker': t_str, 'Moeda': m_str, 'Investido': total_invest})
            
    df_inv = pd.DataFrame(lista_investido)
    
    # 2. Processar Proventos (Juros de Renda Fixa)
    lista_provs = []
    if df_proventos is not None and not df_proventos.empty:
        # Normalize proventos
        cols_map_p = {'ticker': 'Ticker', 'valor': 'Valor', 'lancamento': 'Tipo'}
        df_p = df_proventos.rename(columns={k:v for k,v in cols_map_p.items() if k in df_proventos.columns}, inplace=False)
        
        # Filter for Fixed Income Interest
        if 'Tipo' in df_p.columns:
            mask_juros = df_p['Tipo'].astype(str).str.upper().str.contains('JUROS|RENDIMENTO|CUPOM', na=False)
            df_p_filt = df_p[mask_juros]
            
            # Agrupa apenas por Ticker (proventos não costumam ter moeda explícita na base simples, assumimos match pelo Ticker)
            # SE tiver moeda, ideal seria usar.
            for ticker, grupo in df_p_filt.groupby('Ticker'):
                 t_str = str(ticker).strip().upper()
                 total_juros = grupo['Valor'].sum()
                 lista_provs.append({'Ticker': t_str, 'Proventos_RF': total_juros})
                 
    df_provs_agg = pd.DataFrame(lista_provs)
    
    # 3. Processar Saldos (Fonte da Verdade para Valor Atual)
    if df_saldos.empty:
         pass
    
    # Agrupa saldos por Ticker E Moeda
    if not df_saldos.empty:
        if 'Moeda' not in df_saldos.columns: df_saldos['Moeda'] = 'BRL'
        
        df_saldos_agg = df_saldos.groupby(['Ticker', 'Moeda'], as_index=False).agg({
            'Atual': 'sum',
            'Data': 'max'
        })
        df_saldos_agg['Ticker'] = df_saldos_agg['Ticker'].str.strip().str.upper()
        df_saldos_agg['Moeda'] = df_saldos_agg['Moeda'].str.strip().str.upper()
    else:
        df_saldos_agg = pd.DataFrame(columns=['Ticker', 'Moeda', 'Atual', 'Data'])

    # 4. Merge All
    # Base is Saldos (Active)
    df_final = df_saldos_agg.copy()
    
    # Merge Investido on Ticker AND Moeda
    if not df_inv.empty:
        df_final = pd.merge(df_final, df_inv, on=['Ticker', 'Moeda'], how='left')
    else:
        df_final['Investido'] = 0.0
        
    # Merge Proventos (on Ticker only, usually BRL)
    if not df_provs_agg.empty:
        df_final = pd.merge(df_final, df_provs_agg, on='Ticker', how='left')
    else:
        df_final['Proventos_RF'] = 0.0

    # Fill NaNs
    df_final['Investido'] = df_final['Investido'].fillna(0.0)
    df_final['Proventos_RF'] = df_final['Proventos_RF'].fillna(0.0)
    
    # 5. Cálculos Finais
    # Retorno Total = (Atual + Proventos_Recebidos) - Investido
    df_final['Lucro'] = (df_final['Atual'] + df_final['Proventos_RF']) - df_final['Investido']
    
    def calc_rent(row):
        if row['Investido'] > 0:
            return (row['Lucro'] / row['Investido']) * 100
        return 0.0
        
    df_final['Rent. %'] = df_final.apply(calc_rent, axis=1)
    df_final['Status'] = 'Ativo'
    df_final['Ativo'] = df_final['Ticker']
    
    # Seleção de Colunas
    cols = ['Ticker', 'Ativo', 'Status', 'Data', 'Investido', 'Proventos_RF', 'Atual', 'Lucro', 'Rent. %', 'Moeda']
    for c in cols:
        if c not in df_final.columns: df_final[c] = 0
        
    return df_final[cols]


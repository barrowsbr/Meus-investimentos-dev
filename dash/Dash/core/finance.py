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
    
    for ativo, dados in df_sorted.groupby('Ticker'):
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
                
                # Capitaliza pela SELIC
                taxa_diaria = (1 + SELIC_ANNUAL) ** (1 / BUSINESS_DAYS_YEAR) - 1
                valor_corrigido = valor_compra * ((1 + taxa_diaria) ** dias_uteis)
                
                atl += valor_corrigido
            
            luc = atl - inv
            data_ref = data_primeira_compra if data_primeira_compra else datetime.now()
        
        rent_pct = (luc / inv) * 100 if inv > 0 else 0.0
        
        # Moeda (primeira encontrada)
        moeda = 'BRL'
        if 'Moeda' in dados.columns and not dados['Moeda'].empty:
            moeda = dados['Moeda'].iloc[0]
        
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


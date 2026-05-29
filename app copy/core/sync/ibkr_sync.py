"""
IBKR Sync Module — Simples e Robusto
Sincroniza proventos (dividendos e impostos) do CSV do Interactive Brokers
com o Google Sheets. Importação idempotente: pode rodar N vezes sem duplicar.
"""

import pandas as pd
import os
from datetime import datetime
from typing import Tuple, List, Dict, Optional


# ── Constantes ──────────────────────────────────────────────

MESES_PT = {
    1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr', 5: 'mai', 6: 'jun',
    7: 'jul', 8: 'ago', 9: 'set', 10: 'out', 11: 'nov', 12: 'dez'
}

# Colunas na ordem do GSheets
COLS_GSHEETS = ['ticker', 'data', 'decisao', 'mes', 'ano', 'lancamento', 'categoria', 'valor', 'moeda']


# ── Helpers ─────────────────────────────────────────────────

def _format_mes_ano(data_str: str) -> str:
    """Converte 'YYYY-MM-DD' para 'mmm/aa' (ex: jan/25)."""
    try:
        dt = datetime.strptime(data_str, '%Y-%m-%d')
        return f"{MESES_PT[dt.month]}/{str(dt.year)[2:]}"
    except:
        return ""


def _format_valor_br(valor: float) -> str:
    """Float para formato BR com vírgula: 2.39 → '2,39'."""
    return str(round(valor, 2)).replace('.', ',')


def _normalize_date(d) -> str:
    """Normaliza qualquer formato de data para 'YYYY-MM-DD'."""
    if d is None:
        return ''
    try:
        if pd.isna(d):
            return ''
    except (ValueError, TypeError):
        pass
    if hasattr(d, 'strftime'):
        return d.strftime('%Y-%m-%d')
    s = str(d).strip()
    if not s:
        return ''
    # Tentar YYYY-MM-DD primeiro (formato ISO, mais comum no IBKR e backup)
    try:
        dt = datetime.strptime(s[:10], '%Y-%m-%d')
        return dt.strftime('%Y-%m-%d')
    except ValueError:
        pass
    # Fallback: dd/mm/yyyy
    try:
        dt = datetime.strptime(s[:10], '%d/%m/%Y')
        return dt.strftime('%Y-%m-%d')
    except ValueError:
        pass
    # Fallback: dd-mm-yyyy (IBKR usa hifens às vezes)
    try:
        dt = datetime.strptime(s[:10], '%d-%m-%Y')
        return dt.strftime('%Y-%m-%d')
    except ValueError:
        pass
    return s[:10]



def _normalize_ticker(t: str) -> str:
    """Remove sufixos de bolsa e normaliza."""
    return (str(t).replace('.SA', '').replace('.TO', '')
            .replace('.L', '').replace('.AS', '')
            .strip().upper())


def _parse_valor(v) -> float:
    """Parse robusto de valor (BR ou US format)."""
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    try:
        return float(s.replace(',', '.'))
    except:
        return 0.0


# ── Parser do CSV IBKR ──────────────────────────────────────

def parse_ibkr_csv(file_path: str) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Parseia o CSV do IBKR e extrai APENAS dividendos e impostos.
    Ignora: compras, vendas, câmbio, transferências, juros de margem, etc.

    Returns: (df_dividendos, df_impostos)
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    dividendos = []
    impostos = []

    for line in lines:
        # Só processar linhas de dados de transação
        if not line.startswith('Histórico de transações,Data,'):
            continue

        parts = line.strip().split(',')
        if len(parts) < 13:
            continue

        tipo = parts[5].strip()
        descricao = parts[4].strip()
        simbolo = parts[6].strip()
        data = parts[2].strip()
        valor_str = parts[10].strip()

        # ⚠️ FILTRO CRÍTICO: aceitar APENAS dividendos e retenção de imposto
        if tipo == 'Dividendo':
            try:
                valor = float(valor_str)
            except:
                continue

            # Extrair moeda da descrição
            moeda = 'USD'
            for m in ['CAD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD']:
                if m in descricao:
                    moeda = m
                    break

            dividendos.append({
                'data': data,
                'ticker': simbolo,
                'valor': valor,
                'moeda': moeda,
                'tipo': 'Dividendo'
            })

        elif tipo == 'Retenção de imposto estrangeiro':
            try:
                valor = float(valor_str)  # Já vem negativo
            except:
                continue

            moeda = 'USD'
            for m in ['CAD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD']:
                if m in descricao:
                    moeda = m
                    break

            impostos.append({
                'data': data,
                'ticker': simbolo,
                'valor': valor,
                'moeda': moeda,
                'tipo': 'IMPOSTO'
            })

    return pd.DataFrame(dividendos), pd.DataFrame(impostos)


# ── Transformação para formato GSheets ──────────────────────

def transform_to_gsheets_format(df_div: pd.DataFrame, df_imp: pd.DataFrame) -> pd.DataFrame:
    """Transforma dividendos e impostos do IBKR para o formato GSheets."""
    rows = []

    for _, row in df_div.iterrows():
        try:
            dt = datetime.strptime(row['data'], '%Y-%m-%d')
            rows.append({
                'ticker': row['ticker'],
                'data': row['data'],
                'decisao': 'Dividendo',
                'mes': _format_mes_ano(row['data']),
                'ano': str(dt.year),
                'lancamento': 'Dividendo',
                'categoria': 'Ação Internacional',
                'valor': _format_valor_br(row['valor']),
                'moeda': row['moeda']
            })
        except Exception as e:
            print(f"[ibkr_sync] Erro ao processar dividendo: {e}")

    for _, row in df_imp.iterrows():
        try:
            dt = datetime.strptime(row['data'], '%Y-%m-%d')
            rows.append({
                'ticker': row['ticker'],
                'data': row['data'],
                'decisao': 'IMPOSTO',
                'mes': _format_mes_ano(row['data']),
                'ano': str(dt.year),
                'lancamento': 'IMPOSTO',
                'categoria': 'Ação Internacional',
                'valor': _format_valor_br(row['valor']),
                'moeda': row['moeda']
            })
        except Exception as e:
            print(f"[ibkr_sync] Erro ao processar imposto: {e}")

    return pd.DataFrame(rows)


# ── Detecção de Faltantes (Dedup Idempotente) ───────────────

def find_missing_proventos(df_gsheets: pd.DataFrame, df_ibkr: pd.DataFrame) -> pd.DataFrame:
    """
    Compara proventos do IBKR com GSheets e retorna os faltantes.
    Chave de dedup: data + ticker_normalizado + tipo(decisao) + valor_arredondado
    Tolerância de ±3 dias na data para cobrir variações de relatório.

    Pode ser executado infinitas vezes sem criar duplicatas.
    """
    if df_ibkr.empty:
        return pd.DataFrame()

    # Construir set de chaves existentes no GSheets
    existing_keys = set()

    for _, row in df_gsheets.iterrows():
        ticker = _normalize_ticker(str(row.get('ticker', '')))
        data = _normalize_date(row.get('data', ''))
        decisao = str(row.get('decisao', '')).strip().upper()
        valor = round(_parse_valor(row.get('valor', 0)), 1)

        # Determinar tipo simplificado
        tipo = 'IMPOSTO' if 'IMPOSTO' in decisao else 'DIVIDENDO'

        # Gerar chaves com janela de ±3 dias
        try:
            dt = datetime.strptime(data, '%Y-%m-%d')
            for offset in range(-3, 4):  # -3 a +3 dias
                d = dt + pd.Timedelta(days=offset)
                key = f"{d.strftime('%Y-%m-%d')}|{ticker}|{tipo}|{valor}"
                existing_keys.add(key)
        except:
            # Fallback: chave exata
            key = f"{data}|{ticker}|{tipo}|{valor}"
            existing_keys.add(key)

    # Verificar cada evento IBKR contra as chaves existentes
    faltantes = []
    for _, row in df_ibkr.iterrows():
        ticker = _normalize_ticker(str(row.get('ticker', '')))
        data = str(row.get('data', '')).strip()
        decisao = str(row.get('decisao', '')).strip().upper()
        valor = round(_parse_valor(row.get('valor', 0)), 1)

        tipo = 'IMPOSTO' if 'IMPOSTO' in decisao else 'DIVIDENDO'
        key = f"{data}|{ticker}|{tipo}|{valor}"

        if key not in existing_keys:
            faltantes.append(row.to_dict())

    return pd.DataFrame(faltantes)



# ── Backup ──────────────────────────────────────────────────

def create_backup(df: pd.DataFrame, backup_dir: str, prefix: str = 'backup') -> str:
    """Cria backup do DataFrame atual em CSV."""
    os.makedirs(backup_dir, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    path = os.path.join(backup_dir, f'{prefix}_{timestamp}.csv')
    df.to_csv(path, index=False, encoding='utf-8-sig')
    return path


def backup_gsheet_tab(client, spreadsheet: str, tab_name: str,
                      backup_dir: str, prefix: str) -> tuple:
    """
    Lê aba do GSheets, cria backup CSV e retorna (df_prod, headers, ws, backup_path).
    Deve ser chamado ANTES de qualquer escrita — garante backup sempre.
    """
    sh = client.open(spreadsheet)
    ws = sh.worksheet(tab_name)
    data = ws.get_all_values()

    if not data:
        return pd.DataFrame(), [], ws, ""

    headers = data[0]
    df = pd.DataFrame(data[1:], columns=headers) if len(data) > 1 else pd.DataFrame(columns=headers)
    backup_path = create_backup(df, backup_dir, prefix=prefix) if not df.empty else ""
    return df, headers, ws, backup_path


# ── GSheets I/O ─────────────────────────────────────────────

def _get_gsheets_client():
    """Autenticação com Google Sheets — reutiliza cliente cacheado."""
    from core.data.gsheets import connect_to_gsheets
    return connect_to_gsheets()


# ── API Pública: IBKRSyncManager ────────────────────────────

class IBKRSyncManager:
    """
    Gerenciador de sincronização IBKR → GSheets.
    Simples: parseia CSV, compara com base, insere faltantes.
    """

    def __init__(self, csv_path: str = None, backup_dir: str = None):
        self.csv_path = csv_path
        self.backup_dir = backup_dir or os.path.join(os.path.dirname(__file__), '..', 'backups')
        self.df_dividendos = None
        self.df_impostos = None
        self.df_ibkr_formatted = None
        self.df_faltantes = None

    def load_csv(self, csv_path: str = None) -> Tuple[int, int]:
        """Carrega e parseia o CSV do IBKR. Retorna (qtd_div, qtd_imp)."""
        path = csv_path or self.csv_path
        if not path:
            raise ValueError("Caminho do CSV não especificado")

        self.csv_path = path
        self.df_dividendos, self.df_impostos = parse_ibkr_csv(path)
        self.df_ibkr_formatted = transform_to_gsheets_format(
            self.df_dividendos, self.df_impostos
        )
        return len(self.df_dividendos), len(self.df_impostos)

    def find_missing(self, df_gsheets: pd.DataFrame) -> pd.DataFrame:
        """Encontra proventos faltantes comparando IBKR vs GSheets."""
        if self.df_ibkr_formatted is None:
            raise ValueError("CSV não carregado. Execute load_csv() primeiro.")

        self.df_faltantes = find_missing_proventos(df_gsheets, self.df_ibkr_formatted)
        return self.df_faltantes

    def apply_to_production(self) -> Tuple[bool, str, str]:
        """Aplica faltantes diretamente em produção com backup garantido."""
        if self.df_faltantes is None or self.df_faltantes.empty:
            return True, "Nenhum provento faltante", ""
        return self._sync_direct(self.df_faltantes)

    def _sync_direct(self, df_new: pd.DataFrame) -> Tuple[bool, str, str]:
        """Sincroniza direto para produção — sempre faz backup antes de escrever."""
        try:
            client = _get_gsheets_client()
            if not client:
                return False, "Falha na autenticação", ""

            df_prod, headers, ws, backup_path = backup_gsheet_tab(
                client, 'gdados', 'meus_proventos', self.backup_dir, 'meus_proventos_backup'
            )
            if not headers:
                return False, "Aba vazia", ""

            df_merged = pd.concat([df_prod, df_new[COLS_GSHEETS]], ignore_index=True)
            df_merged['_sort'] = pd.to_datetime(df_merged['data'], errors='coerce')
            df_merged = df_merged.sort_values('_sort', ascending=False).drop(columns=['_sort'])

            ws.clear()
            ws.update('A1', [headers] + df_merged.values.tolist())

            return True, f"Adicionados {len(df_new)} proventos", backup_path
        except Exception as e:
            return False, f"Erro: {e}", ""

    def get_summary(self) -> Dict:
        """Resumo dos proventos a serem adicionados."""
        if self.df_faltantes is None or self.df_faltantes.empty:
            return {'total': 0, 'dividendos': 0, 'impostos': 0, 'valor_bruto': 0, 'valor_impostos': 0, 'valor_liquido': 0, 'por_ticker': {}}

        df = self.df_faltantes.copy()
        df['_val'] = df['valor'].apply(_parse_valor)

        divs = df[df['decisao'] == 'Dividendo']
        imps = df[df['decisao'] == 'IMPOSTO']

        return {
            'total': len(df),
            'dividendos': len(divs),
            'impostos': len(imps),
            'valor_bruto': divs['_val'].sum(),
            'valor_impostos': abs(imps['_val'].sum()),
            'valor_liquido': df['_val'].sum(),
            'por_ticker': df.groupby('ticker')['_val'].sum().to_dict()
        }

    def get_reconciliation_report(self) -> str:
        """Relatório textual da reconciliação."""
        s = self.get_summary()
        return "\n".join([
            "═══ Reconciliação IBKR ═══",
            f"  CSV: {len(self.df_dividendos)} div + {len(self.df_impostos)} imp",
            f"  Faltantes: {s['total']}  (div: {s['dividendos']}, imp: {s['impostos']})",
            f"  Valor bruto: {s['valor_bruto']:.2f}",
            f"  Impostos: {s['valor_impostos']:.2f}",
            f"  Líquido: {s['valor_liquido']:.2f}",
        ])


# ══════════════════════════════════════════════════════════════
# IBKR TRADES (ATIVOS) — Compra e Venda
# ══════════════════════════════════════════════════════════════

# Colunas na ordem do GSheets meus_ativos
COLS_ATIVOS = ['Data', 'Tipo de transação', 'Símbolo', 'Quantidade', 'Preço',
               'Valor bruto', 'Taxa de corretagem', 'Valor líquido', 'Moeda', 'Corretora']


def parse_ibkr_trades(file_path: str) -> pd.DataFrame:
    """
    Parseia o CSV do IBKR e extrai APENAS compras e vendas de ativos.
    Ignora: dividendos, impostos, câmbio, transferências, etc.

    Returns: DataFrame com trades
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    trades = []

    for line in lines:
        if not line.startswith('Histórico de transações,Data,'):
            continue

        parts = line.strip().split(',')
        if len(parts) < 13:
            continue

        tipo = parts[5].strip()
        descricao = parts[4].strip()
        simbolo = parts[6].strip()
        data = parts[2].strip()
        valor_str = parts[10].strip()

        # Aceitar APENAS compras e vendas
        if tipo not in ('Compra', 'Venda', 'Buy', 'Sell'):
            continue

        # Ignorar se não tem símbolo
        if not simbolo:
            continue

        try:
            valor = float(valor_str)
        except (ValueError, TypeError):
            continue

        # Tentar extrair quantidade e preço da descrição ou campos adicionais
        quantidade = 0.0
        preco = 0.0

        # Campo 7 geralmente é quantidade, campo 8 é preço no IBKR CSV
        try:
            quantidade = abs(float(parts[7].strip()))
        except (ValueError, TypeError, IndexError):
            pass

        try:
            preco = abs(float(parts[8].strip()))
        except (ValueError, TypeError, IndexError):
            pass

        # Se quantidade e preço vieram zerados, tentar extrair da descrição
        # Formato: "BOT 10 MSFT@420.50" ou "SLD 5 MSFT@430.00"
        if quantidade == 0 and preco == 0:
            import re
            match = re.search(r'(?:BOT|SLD|BOUGHT|SOLD)\s+([\d.]+)\s+\w+@([\d.]+)', descricao)
            if match:
                quantidade = float(match.group(1))
                preco = float(match.group(2))

        # Extrair comissão (campo 11 ou 12)
        comissao = 0.0
        for idx in [11, 12]:
            try:
                val = float(parts[idx].strip())
                if val < 0:  # Comissão vem negativa
                    comissao = abs(val)
                    break
            except (ValueError, TypeError, IndexError):
                continue

        # Extrair moeda da descrição
        moeda = 'USD'
        for m in ['CAD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD']:
            if m in descricao:
                moeda = m
                break

        # Normalizar tipo
        tipo_norm = 'Compra' if tipo in ('Compra', 'Buy') else 'Venda'

        # Calcular valor bruto e líquido
        valor_bruto = abs(valor)
        if valor_bruto == 0 and quantidade > 0 and preco > 0:
            valor_bruto = round(quantidade * preco, 2)

        valor_liquido = valor_bruto + comissao if tipo_norm == 'Compra' else valor_bruto - comissao

        trades.append({
            'Data': _normalize_date(data),
            'Tipo de transação': tipo_norm,
            'Símbolo': simbolo,
            'Quantidade': quantidade,
            'Preço': preco,
            'Valor bruto': valor_bruto,
            'Taxa de corretagem': comissao,
            'Valor líquido': round(valor_liquido, 2),
            'Moeda': moeda,
            'Corretora': 'IBKR'
        })

    return pd.DataFrame(trades)


def find_missing_trades(df_gsheets: pd.DataFrame, df_ibkr: pd.DataFrame) -> pd.DataFrame:
    """
    Compara trades do IBKR com GSheets meus_ativos e retorna os faltantes.
    Chave de dedup: ticker + tipo + quantidade + preço (arredondado para inteiro)
    Usa tolerância de centavos para cobrir diferenças de arredondamento.
    Não usa data na chave porque entradas manuais podem ter dia/mês invertido.

    Pode ser executado infinitas vezes sem criar duplicatas.
    """
    if df_ibkr.empty:
        return pd.DataFrame()

    # Construir lista de trades existentes com dados para matching flexível
    from collections import Counter
    existing_trades = []

    for _, row in df_gsheets.iterrows():
        ticker = _normalize_ticker(str(row.get('Símbolo', row.get('ticker', ''))))
        tipo = str(row.get('Tipo de transação', '')).strip()
        qty = round(float(_parse_valor(row.get('Quantidade', 0))), 2)
        preco = float(_parse_valor(row.get('Preço', row.get('Preco', 0))))

        existing_trades.append({
            'ticker': ticker,
            'tipo': tipo,
            'qty': qty,
            'preco': preco,
            'matched': False
        })

    def find_match(ticker, tipo, qty, preco):
        """Procura um match com tolerância de 1% no preço."""
        for trade in existing_trades:
            if trade['matched']:
                continue
            if trade['ticker'] != ticker:
                continue
            if trade['tipo'] != tipo:
                continue
            if abs(trade['qty'] - qty) > 0.01:  # Tolerância de 0.01 na quantidade
                continue
            # Tolerância de 1% no preço OU diferença absoluta de até 1
            preco_diff = abs(trade['preco'] - preco)
            preco_pct = preco_diff / max(trade['preco'], preco, 1) * 100
            if preco_pct <= 1 or preco_diff <= 1:
                return trade
        return None



    def find_split_or_correction(ticker, tipo, valor_total_ibkr, ibkr_row):
        """
        Procura se existe algum trade no GSheets com mesmo Ticker e Tipo,
        mas com Quantidade/Preço diferentes, porem Valor Total *similar* (Split ou Agrupamento).
        """
        candidates = []
        for trade in existing_trades:
            if trade['matched']: continue
            if trade['ticker'] != ticker: continue
            if trade['tipo'] != tipo: continue
            
            # Calcular valor total no GSheets (Qty * Preco)
            # Preço no GSheets pode estar zerado se for bonificação, mas aqui estamos buscando Splits
            valor_total_gs = trade['qty'] * trade['preco']
            
            # Tolerância de $5 ou 1% no valor total (pra cobrir arredondamentos de taxas/preço medio)
            diff = abs(valor_total_gs - valor_total_ibkr)
            if diff < 5 or (valor_total_ibkr > 0 and diff / valor_total_ibkr < 0.01):
                 candidates.append(trade)
        
        return candidates



    
    # 0. Agrupamento (Fragmented Orders)
    # IBKR manda 1+1, GSheets tem 2. Vamos agrupar IBKR por Ticker/Data/Tipo para ver se bate.
    
    # Criar coluna auxiliar de data normalizada (sem horas) para agrupamento
    # O df_ibkr já tem 'Data' normalizada pela função _normalize_date
    df_ibkr['_group_key'] = df_ibkr.apply(lambda r: f"{r['Símbolo']}|{r['Tipo de transação']}|{r['Data']}", axis=1)
    
    # Identificar quais grupos têm > 1 transação (potenciais fragmentados)
    group_counts = df_ibkr['_group_key'].value_counts()
    fragmented_groups = group_counts[group_counts > 1].index.tolist()
    
    # Dicionário para marcar quais rows do IBKR já foram "consumidas" por um match agrupado
    processed_indices = set()
    
    # Lista de faltantes finais
    faltantes = []
    
    # A. Processar Agrupados Primeiro
    for group_key in fragmented_groups:
        # Pegar as linhas desse grupo
        group_rows = df_ibkr[df_ibkr['_group_key'] == group_key]
        
        # Calcular os totais do grupo
        total_qty = group_rows['Quantidade'].sum()
        avg_price = (group_rows['Quantidade'] * group_rows['Preço']).sum() / total_qty if total_qty > 0 else 0
        total_val = group_rows['Valor bruto'].sum() # Melhor usar o valor bruto total
        
        # Dados para busca
        first_row = group_rows.iloc[0]
        ticker = _normalize_ticker(str(first_row.get('Símbolo', '')))
        tipo = str(first_row.get('Tipo de transação', '')).strip()
        
        # Tentar match do GRUPO com um item ÚNICO do GSheets
        # Ex: IBKR (1, 1) -> Virtual (2). GSheets (2). Match!
        match = find_match(ticker, tipo, round(total_qty, 2), float(avg_price))
        
        if match:
            # SUCESSO! O grupo todo corresponde a um item do GSheets.
            match['matched'] = True
            # Marcar todas as linhas originais como processadas (não são faltantes)
            processed_indices.update(group_rows.index.tolist())
            # (Opcional) Poderíamos logar que houve um match agrupado
        else:
            # Se não bateu o grupo inteiro, solta para o processamento individual
            pass

    # B. Processamento Individual (para o que sobrou)
    for idx, row in df_ibkr.iterrows():
        if idx in processed_indices:
            continue
            
        ticker = _normalize_ticker(str(row.get('Símbolo', '')))
        tipo = str(row.get('Tipo de transação', '')).strip()
        qty = round(float(row.get('Quantidade', 0)), 2)
        preco = float(row.get('Preço', 0))
        valor_total = qty * preco

        # 1. Tenta encontrar Match Exato (ou com pequena tolerância de preço)
        match = find_match(ticker, tipo, qty, preco)
        
        if match:
            match['matched'] = True
        else:
            # 2. Se não achou exato, tenta encontrar "Split/Ajuste" (Valor Total bate, mas Qty/Preço não)
            possible_splits = find_split_or_correction(ticker, tipo, valor_total, row)
            
            row_dict = row.to_dict()
            if '_group_key' in row_dict: del row_dict['_group_key']
            
            if possible_splits:
                # Encontrou um possível split/ajuste manual
                row_dict['status_match'] = 'POTENTIAL_SPLIT'
                row_dict['match_details'] = [
                    f"{s['qty']} x {s['preco']} (Total: {s['qty']*s['preco']:.2f})" for s in possible_splits
                ]
            else:
                # Realmente novo
                row_dict['status_match'] = 'MISSING'
            
            faltantes.append(row_dict)

    return pd.DataFrame(faltantes)


# ── API Pública: IBKRTradesManager ──────────────────────────

class IBKRTradesManager:
    """
    Gerenciador de sincronização IBKR Trades → GSheets meus_ativos.
    Mesmo padrão do IBKRSyncManager: parseia, compara, insere.
    """

    def __init__(self, csv_path: str = None, backup_dir: str = None):
        self.csv_path = csv_path
        self.backup_dir = backup_dir or os.path.join(os.path.dirname(__file__), '..', 'backups')
        self.df_trades = None
        self.df_faltantes = None

    def load_csv(self, csv_path: str = None) -> Tuple[int, int]:
        """Carrega e parseia trades do CSV. Retorna (qtd_compras, qtd_vendas)."""
        path = csv_path or self.csv_path
        if not path:
            raise ValueError("Caminho do CSV não especificado")

        self.csv_path = path
        self.df_trades = parse_ibkr_trades(path)

        # Lidar com DataFrame vazio (sem colunas)
        if self.df_trades.empty or 'Tipo de transação' not in self.df_trades.columns:
            return 0, 0

        n_compras = len(self.df_trades[self.df_trades['Tipo de transação'] == 'Compra'])
        n_vendas = len(self.df_trades[self.df_trades['Tipo de transação'] == 'Venda'])

        return n_compras, n_vendas

    def find_missing(self, df_gsheets: pd.DataFrame) -> pd.DataFrame:
        """Encontra trades faltantes comparando IBKR vs GSheets."""
        if self.df_trades is None:
            raise ValueError("CSV não carregado. Execute load_csv() primeiro.")

        self.df_faltantes = find_missing_trades(df_gsheets, self.df_trades)
        return self.df_faltantes

    def apply_to_production(self) -> Tuple[bool, str, str]:
        """Aplica faltantes diretamente em produção — sempre faz backup antes de escrever."""
        if self.df_faltantes is None or self.df_faltantes.empty:
            return True, "Nenhum trade faltante", ""

        try:
            client = _get_gsheets_client()
            if not client:
                return False, "Falha na autenticação", ""

            df_prod, headers, ws, backup_path = backup_gsheet_tab(
                client, 'gdados', 'meus_ativos', self.backup_dir, 'meus_ativos_backup'
            )
            if not headers:
                return False, "Aba vazia", ""

            # Preparar novos registros
            cols_to_use = [c for c in COLS_ATIVOS if c in self.df_faltantes.columns]
            new_rows = self.df_faltantes[cols_to_use].copy()
            for c in COLS_ATIVOS:
                if c not in new_rows.columns:
                    new_rows[c] = ''
            for col in ['Quantidade', 'Preço', 'Valor bruto', 'Taxa de corretagem', 'Valor líquido']:
                if col in new_rows.columns:
                    new_rows[col] = new_rows[col].apply(
                        lambda v: str(round(float(v), 2)).replace('.', ',') if pd.notna(v) else '0'
                    )

            df_merged = pd.concat([df_prod, new_rows], ignore_index=True)
            df_merged['_sort'] = pd.to_datetime(df_merged['Data'], errors='coerce')
            df_merged = df_merged.sort_values('_sort', ascending=False).drop(columns=['_sort'])

            ws.clear()
            ws.update('A1', [headers] + df_merged.values.tolist())

            return True, f"Adicionados {len(self.df_faltantes)} trades", backup_path
        except Exception as e:
            return False, f"Erro: {e}", ""

    def get_summary(self) -> Dict:
        """Resumo dos trades a serem adicionados."""
        if self.df_faltantes is None or self.df_faltantes.empty:
            return {'total': 0, 'compras': 0, 'vendas': 0, 'por_ticker': {}}

        # Verificar se colunas existem antes de acessá-las
        if 'Tipo de transação' not in self.df_faltantes.columns:
            return {'total': len(self.df_faltantes), 'compras': 0, 'vendas': 0, 'por_ticker': {}}

        compras = self.df_faltantes[self.df_faltantes['Tipo de transação'] == 'Compra']
        vendas = self.df_faltantes[self.df_faltantes['Tipo de transação'] == 'Venda']

        por_ticker = {}
        if 'Símbolo' in self.df_faltantes.columns:
            por_ticker = self.df_faltantes.groupby('Símbolo').size().to_dict()

        return {
            'total': len(self.df_faltantes),
            'compras': len(compras),
            'vendas': len(vendas),
            'por_ticker': por_ticker
        }




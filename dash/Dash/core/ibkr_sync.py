"""
IBKR Sync Module
Sincroniza proventos do CSV do Interactive Brokers com o Google Sheets.
"""

import pandas as pd
import os
from datetime import datetime
from typing import Tuple, List, Dict, Optional
import re


def parse_ibkr_csv(file_path: str) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Parseia o CSV do IBKR e extrai dividendos e impostos.

    Returns:
        Tuple[dividendos_df, impostos_df]
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    dividendos = []
    impostos = []

    for line in lines:
        if line.startswith('Histórico de transações,Data,'):
            parts = line.strip().split(',')
            if len(parts) >= 13:
                tipo = parts[5]
                descricao = parts[4]
                simbolo = parts[6]
                data = parts[2]
                valor_bruto = parts[10]

                # Extrair moeda da descrição
                moeda = 'USD'  # default
                if 'CAD' in descricao:
                    moeda = 'CAD'
                elif 'EUR' in descricao:
                    moeda = 'EUR'
                elif 'JPY' in descricao:
                    moeda = 'JPY'

                if tipo == 'Dividendo':
                    dividendos.append({
                        'data': data,
                        'ticker': simbolo,
                        'valor': float(valor_bruto),
                        'moeda': moeda,
                        'tipo': 'Dividendo'
                    })
                elif tipo == 'Retenção de imposto estrangeiro':
                    impostos.append({
                        'data': data,
                        'ticker': simbolo,
                        'valor': float(valor_bruto),  # Já vem negativo
                        'moeda': moeda,
                        'tipo': 'IMPOSTO'
                    })

    return pd.DataFrame(dividendos), pd.DataFrame(impostos)


def format_mes_ano(data_str: str) -> str:
    """
    Converte data YYYY-MM-DD para formato 'mmm/aa' (ex: jan/25).
    """
    meses = {
        1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr', 5: 'mai', 6: 'jun',
        7: 'jul', 8: 'ago', 9: 'set', 10: 'out', 11: 'nov', 12: 'dez'
    }
    try:
        dt = datetime.strptime(data_str, '%Y-%m-%d')
        mes_nome = meses[dt.month]
        ano_curto = str(dt.year)[2:]
        return f"{mes_nome}/{ano_curto}"
    except:
        return ""


def format_valor_br(valor: float) -> str:
    """
    Formata valor para padrão brasileiro (vírgula como decimal).
    """
    # Arredondar para 2 casas decimais
    valor_arredondado = round(valor, 2)
    # Converter para string com vírgula
    return str(valor_arredondado).replace('.', ',')


def transform_to_gsheets_format(df_dividendos: pd.DataFrame, df_impostos: pd.DataFrame) -> pd.DataFrame:
    """
    Transforma os dataframes do IBKR para o formato do GSheets.

    Formato GSheets: ticker, data, decisao, mes, ano, lancamento, categoria, valor, moeda
    """
    rows = []

    # Processar dividendos
    for _, row in df_dividendos.iterrows():
        try:
            dt = datetime.strptime(row['data'], '%Y-%m-%d')
            rows.append({
                'ticker': row['ticker'],
                'data': row['data'],  # Manter formato YYYY-MM-DD
                'decisao': 'Dividendo',
                'mes': format_mes_ano(row['data']),
                'ano': str(dt.year),
                'lancamento': 'Dividendo',
                'categoria': 'Ação Internacional',
                'valor': format_valor_br(row['valor']),
                'moeda': row['moeda']
            })
        except Exception as e:
            print(f"Erro ao processar dividendo: {e}")

    # Processar impostos
    for _, row in df_impostos.iterrows():
        try:
            dt = datetime.strptime(row['data'], '%Y-%m-%d')
            rows.append({
                'ticker': row['ticker'],
                'data': row['data'],
                'decisao': 'IMPOSTO',
                'mes': format_mes_ano(row['data']),
                'ano': str(dt.year),
                'lancamento': 'IMPOSTO',
                'categoria': 'Ação Internacional',
                'valor': format_valor_br(row['valor']),  # Já vem negativo
                'moeda': row['moeda']
            })
        except Exception as e:
            print(f"Erro ao processar imposto: {e}")

    return pd.DataFrame(rows)


def find_missing_proventos(
    df_gsheets: pd.DataFrame,
    df_ibkr: pd.DataFrame,
    tickers_ignorar: List[str] = None
) -> pd.DataFrame:
    """
    Encontra proventos do IBKR que não estão no GSheets.

    Args:
        df_gsheets: DataFrame com proventos do GSheets
        df_ibkr: DataFrame com proventos do IBKR (já no formato GSheets)
        tickers_ignorar: Lista de tickers para ignorar (ex: ativos brasileiros)

    Returns:
        DataFrame com proventos faltantes
    """
    if tickers_ignorar is None:
        tickers_ignorar = []

    # Normalizar tickers para comparação
    def normalize_ticker(t):
        return str(t).replace('.SA', '').replace('.TO', '').replace('.L', '').replace('.AS', '').strip().upper()

    # Normalizar data para string YYYY-MM-DD
    def normalize_date(d):
        if pd.isna(d):
            return ''
        try:
            # Tentar converter para datetime e formatar
            dt = pd.to_datetime(d, dayfirst=True, errors='coerce')
            if pd.isna(dt):
                # Tentar formato americano
                dt = pd.to_datetime(d, dayfirst=False, errors='coerce')
            if pd.notna(dt):
                return dt.strftime('%Y-%m-%d')
        except:
            pass
        # Fallback: retornar string limpa
        return str(d)[:10]

    # Criar chave única: data + ticker + tipo (Dividendo/IMPOSTO)
    def create_key(row):
        ticker_norm = normalize_ticker(row.get('ticker', ''))
        data = normalize_date(row.get('data', ''))
        tipo = str(row.get('decisao', row.get('lancamento', ''))).upper()
        # Normalizar tipo
        if 'DIV' in tipo:
            tipo = 'DIVIDENDO'
        elif 'IMPOSTO' in tipo:
            tipo = 'IMPOSTO'
        return f"{data}|{ticker_norm}|{tipo}"

    # Chaves existentes no GSheets
    gsheets_keys = set()
    tickers_ignorar_norm = {normalize_ticker(t) for t in tickers_ignorar}

    for _, row in df_gsheets.iterrows():
        ticker_norm = normalize_ticker(row.get('ticker', ''))
        # Ignorar tickers da lista
        if ticker_norm in tickers_ignorar_norm:
            continue
        gsheets_keys.add(create_key(row))

    # Encontrar faltantes
    faltantes = []
    for _, row in df_ibkr.iterrows():
        ticker_norm = normalize_ticker(row.get('ticker', ''))
        # Ignorar tickers da lista
        if ticker_norm in tickers_ignorar_norm:
            continue

        key = create_key(row)
        if key not in gsheets_keys:
            faltantes.append(row.to_dict())

    return pd.DataFrame(faltantes)


def create_backup(df: pd.DataFrame, backup_dir: str) -> str:
    """
    Cria backup do DataFrame atual em CSV.

    Returns:
        Caminho do arquivo de backup
    """
    os.makedirs(backup_dir, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = os.path.join(backup_dir, f'meus_proventos_backup_{timestamp}.csv')
    df.to_csv(backup_path, index=False, encoding='utf-8-sig')
    return backup_path


def sync_proventos_to_test_tab(
    df_faltantes: pd.DataFrame,
    spreadsheet_name: str = 'gdados',
    test_tab_name: str = 'meus_proventos_test'
) -> Tuple[bool, str]:
    """
    Sincroniza proventos faltantes para uma aba de teste no GSheets.

    Returns:
        Tuple[sucesso, mensagem]
    """
    try:
        from core.data.gsheets import get_worksheet, _authenticate_no_cache
        import gspread

        # Autenticar
        client = _authenticate_no_cache()
        if not client:
            return False, "Falha na autenticação com Google Sheets"

        # Abrir planilha
        try:
            sh = client.open(spreadsheet_name)
        except Exception as e:
            return False, f"Erro ao abrir planilha '{spreadsheet_name}': {e}"

        # Verificar/criar aba de teste
        try:
            ws_test = sh.worksheet(test_tab_name)
        except gspread.WorksheetNotFound:
            # Criar aba de teste copiando estrutura
            ws_test = sh.add_worksheet(title=test_tab_name, rows=1000, cols=10)
            # Adicionar cabeçalhos
            headers = ['ticker', 'data', 'decisao', 'mes', 'ano', 'lancamento', 'categoria', 'valor', 'moeda']
            ws_test.update('A1:I1', [headers])

        # Ler dados existentes na aba de teste
        existing_data = ws_test.get_all_values()

        if len(existing_data) <= 1:
            # Apenas cabeçalho, inserir todos
            next_row = 2
        else:
            next_row = len(existing_data) + 1

        # Preparar dados para inserção
        cols_order = ['ticker', 'data', 'decisao', 'mes', 'ano', 'lancamento', 'categoria', 'valor', 'moeda']
        rows_to_add = []

        for _, row in df_faltantes.iterrows():
            row_data = [str(row.get(col, '')) for col in cols_order]
            rows_to_add.append(row_data)

        if rows_to_add:
            # Inserir no GSheets
            range_start = f'A{next_row}'
            range_end = f'I{next_row + len(rows_to_add) - 1}'
            ws_test.update(f'{range_start}:{range_end}', rows_to_add)

            return True, f"Adicionados {len(rows_to_add)} registros na aba '{test_tab_name}'"
        else:
            return True, "Nenhum registro novo para adicionar"

    except Exception as e:
        return False, f"Erro na sincronização: {e}"


def merge_test_to_production(
    spreadsheet_name: str = 'gdados',
    test_tab_name: str = 'meus_proventos_test',
    prod_tab_name: str = 'meus_proventos',
    backup_dir: str = None
) -> Tuple[bool, str, str]:
    """
    Mescla dados da aba de teste para produção.

    Returns:
        Tuple[sucesso, mensagem, backup_path]
    """
    try:
        from core.data.gsheets import _authenticate_no_cache

        client = _authenticate_no_cache()
        if not client:
            return False, "Falha na autenticação", ""

        sh = client.open(spreadsheet_name)

        # Ler aba de produção
        ws_prod = sh.worksheet(prod_tab_name)
        prod_data = ws_prod.get_all_values()

        if len(prod_data) < 1:
            return False, "Aba de produção vazia ou sem cabeçalhos", ""

        headers = prod_data[0]
        df_prod = pd.DataFrame(prod_data[1:], columns=headers)

        # Criar backup
        backup_path = ""
        if backup_dir:
            backup_path = create_backup(df_prod, backup_dir)

        # Ler aba de teste
        try:
            ws_test = sh.worksheet(test_tab_name)
            test_data = ws_test.get_all_values()

            if len(test_data) <= 1:
                return True, "Aba de teste vazia, nada a mesclar", backup_path

            df_test = pd.DataFrame(test_data[1:], columns=test_data[0])

        except Exception:
            return True, "Aba de teste não existe, nada a mesclar", backup_path

        # Mesclar DataFrames
        df_merged = pd.concat([df_prod, df_test], ignore_index=True)

        # Ordenar por data (mais recente primeiro)
        df_merged['data_sort'] = pd.to_datetime(df_merged['data'], errors='coerce')
        df_merged = df_merged.sort_values('data_sort', ascending=False)
        df_merged = df_merged.drop(columns=['data_sort'])

        # Atualizar produção
        data_to_write = [headers] + df_merged.values.tolist()
        ws_prod.clear()
        ws_prod.update('A1', data_to_write)

        # Limpar aba de teste
        ws_test.clear()
        ws_test.update('A1', [headers])

        return True, f"Mesclados {len(df_test)} registros para produção", backup_path

    except Exception as e:
        return False, f"Erro ao mesclar: {e}", ""


class IBKRSyncManager:
    """
    Gerenciador de sincronização IBKR -> GSheets.
    """

    def __init__(self, csv_path: str = None, backup_dir: str = None):
        self.csv_path = csv_path
        self.backup_dir = backup_dir or os.path.join(os.path.dirname(__file__), '..', 'backups')
        self.df_dividendos = None
        self.df_impostos = None
        self.df_ibkr_formatted = None
        self.df_faltantes = None

        # Tickers brasileiros para ignorar (não vêm do IBKR internacional)
        self.tickers_br = [
            'KNCR11', 'HGCR11', 'TAEE11', 'VALE3', 'CMIG4', 'HGLG11',
            'ITUB4', 'XPML11', 'IVVB11'
        ]

    def load_csv(self, csv_path: str = None) -> Tuple[int, int]:
        """
        Carrega e parseia o CSV do IBKR.

        Returns:
            Tuple[qtd_dividendos, qtd_impostos]
        """
        path = csv_path or self.csv_path
        if not path:
            raise ValueError("Caminho do CSV não especificado")

        self.csv_path = path
        self.df_dividendos, self.df_impostos = parse_ibkr_csv(path)
        self.df_ibkr_formatted = transform_to_gsheets_format(
            self.df_dividendos,
            self.df_impostos
        )

        return len(self.df_dividendos), len(self.df_impostos)

    def find_missing(self, df_gsheets: pd.DataFrame) -> pd.DataFrame:
        """
        Encontra proventos faltantes.
        """
        if self.df_ibkr_formatted is None:
            raise ValueError("CSV não carregado. Execute load_csv() primeiro.")

        self.df_faltantes = find_missing_proventos(
            df_gsheets,
            self.df_ibkr_formatted,
            self.tickers_br
        )

        return self.df_faltantes

    def sync_to_test(self) -> Tuple[bool, str]:
        """
        Sincroniza faltantes para aba de teste.
        """
        if self.df_faltantes is None or self.df_faltantes.empty:
            return True, "Nenhum provento faltante para sincronizar"

        return sync_proventos_to_test_tab(self.df_faltantes)

    def apply_to_production(self) -> Tuple[bool, str, str]:
        """
        Aplica mudanças da aba de teste para produção.
        """
        return merge_test_to_production(backup_dir=self.backup_dir)

    def sync_direct_to_production(self) -> Tuple[bool, str, str]:
        """
        Sincroniza proventos faltantes DIRETAMENTE para produção (sem aba de teste).

        Returns:
            Tuple[sucesso, mensagem, backup_path]
        """
        if self.df_faltantes is None or self.df_faltantes.empty:
            return True, "Nenhum provento faltante para sincronizar", ""

        try:
            from core.data.gsheets import _authenticate_no_cache

            client = _authenticate_no_cache()
            if not client:
                return False, "Falha na autenticação com Google Sheets", ""

            sh = client.open('gdados')
            ws_prod = sh.worksheet('meus_proventos')

            # Ler dados atuais
            prod_data = ws_prod.get_all_values()
            if len(prod_data) < 1:
                return False, "Aba de produção vazia ou sem cabeçalhos", ""

            headers = prod_data[0]
            df_prod = pd.DataFrame(prod_data[1:], columns=headers)

            # Criar backup
            backup_path = create_backup(df_prod, self.backup_dir)

            # Preparar dados para inserção
            cols_order = ['ticker', 'data', 'decisao', 'mes', 'ano', 'lancamento', 'categoria', 'valor', 'moeda']

            # Converter df_faltantes para o formato correto
            df_new = self.df_faltantes[cols_order].copy()

            # Mesclar com produção
            df_merged = pd.concat([df_prod, df_new], ignore_index=True)

            # Ordenar por data (mais recente primeiro)
            df_merged['data_sort'] = pd.to_datetime(df_merged['data'], errors='coerce')
            df_merged = df_merged.sort_values('data_sort', ascending=False)
            df_merged = df_merged.drop(columns=['data_sort'])

            # Atualizar produção
            data_to_write = [headers] + df_merged.values.tolist()
            ws_prod.clear()
            ws_prod.update('A1', data_to_write)

            return True, f"Adicionados {len(self.df_faltantes)} proventos diretamente em produção", backup_path

        except Exception as e:
            return False, f"Erro ao sincronizar: {e}", ""

    def get_summary(self) -> Dict:
        """
        Retorna resumo dos proventos a serem adicionados.
        """
        if self.df_faltantes is None or self.df_faltantes.empty:
            return {'total': 0, 'dividendos': 0, 'impostos': 0, 'por_ticker': {}}

        df = self.df_faltantes.copy()

        # Converter valor de string BR para float
        def parse_valor_br(v):
            try:
                return float(str(v).replace(',', '.'))
            except:
                return 0.0

        df['valor_float'] = df['valor'].apply(parse_valor_br)

        dividendos = df[df['decisao'] == 'Dividendo']
        impostos = df[df['decisao'] == 'IMPOSTO']

        return {
            'total': len(df),
            'dividendos': len(dividendos),
            'impostos': len(impostos),
            'valor_bruto': dividendos['valor_float'].sum(),
            'valor_impostos': abs(impostos['valor_float'].sum()),
            'valor_liquido': df['valor_float'].sum(),
            'por_ticker': df.groupby('ticker')['valor_float'].sum().to_dict()
        }

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
    if pd.isna(d) if not isinstance(d, str) else False:
        return ''
    if hasattr(d, 'strftime'):
        return d.strftime('%Y-%m-%d')
    s = str(d).strip()
    try:
        dt = pd.to_datetime(s, dayfirst=True, errors='coerce')
        if pd.notna(dt):
            return dt.strftime('%Y-%m-%d')
    except:
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

def create_backup(df: pd.DataFrame, backup_dir: str) -> str:
    """Cria backup do DataFrame atual em CSV."""
    os.makedirs(backup_dir, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    path = os.path.join(backup_dir, f'meus_proventos_backup_{timestamp}.csv')
    df.to_csv(path, index=False, encoding='utf-8-sig')
    return path


# ── GSheets I/O ─────────────────────────────────────────────

def _get_gsheets_client():
    """Autenticação com Google Sheets."""
    from core.data.gsheets import _authenticate_no_cache
    return _authenticate_no_cache()


def sync_to_test_tab(df_faltantes, spreadsheet='gdados', tab='meus_proventos_test'):
    """Envia faltantes para aba de teste."""
    try:
        import gspread
        client = _get_gsheets_client()
        if not client:
            return False, "Falha na autenticação"

        sh = client.open(spreadsheet)
        try:
            ws = sh.worksheet(tab)
        except gspread.WorksheetNotFound:
            ws = sh.add_worksheet(title=tab, rows=1000, cols=10)
            ws.update('A1:I1', [COLS_GSHEETS])

        existing = ws.get_all_values()
        next_row = max(len(existing) + 1, 2)

        rows = []
        for _, row in df_faltantes.iterrows():
            rows.append([str(row.get(c, '')) for c in COLS_GSHEETS])

        if rows:
            ws.update(f'A{next_row}:I{next_row + len(rows) - 1}', rows)
            return True, f"Adicionados {len(rows)} registros na aba '{tab}'"
        return True, "Nenhum registro novo"

    except Exception as e:
        return False, f"Erro: {e}"


def merge_test_to_production(spreadsheet='gdados', test_tab='meus_proventos_test',
                              prod_tab='meus_proventos', backup_dir=None):
    """Mescla aba de teste para produção."""
    try:
        client = _get_gsheets_client()
        if not client:
            return False, "Falha na autenticação", ""

        sh = client.open(spreadsheet)
        ws_prod = sh.worksheet(prod_tab)
        prod_data = ws_prod.get_all_values()

        if len(prod_data) < 1:
            return False, "Aba de produção vazia", ""

        headers = prod_data[0]
        df_prod = pd.DataFrame(prod_data[1:], columns=headers)

        backup_path = create_backup(df_prod, backup_dir) if backup_dir else ""

        try:
            ws_test = sh.worksheet(test_tab)
            test_data = ws_test.get_all_values()
            if len(test_data) <= 1:
                return True, "Aba de teste vazia", backup_path
            df_test = pd.DataFrame(test_data[1:], columns=test_data[0])
        except:
            return True, "Aba de teste não existe", backup_path

        df_merged = pd.concat([df_prod, df_test], ignore_index=True)
        df_merged['_sort'] = pd.to_datetime(df_merged['data'], errors='coerce')
        df_merged = df_merged.sort_values('_sort', ascending=False).drop(columns=['_sort'])

        ws_prod.clear()
        ws_prod.update('A1', [headers] + df_merged.values.tolist())
        ws_test.clear()
        ws_test.update('A1', [headers])

        return True, f"Mesclados {len(df_test)} registros", backup_path

    except Exception as e:
        return False, f"Erro: {e}", ""


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

    def sync_to_test(self) -> Tuple[bool, str]:
        """Envia faltantes para aba de teste."""
        if self.df_faltantes is None or self.df_faltantes.empty:
            return True, "Nenhum provento faltante"
        return sync_to_test_tab(self.df_faltantes)

    def apply_to_production(self) -> Tuple[bool, str, str]:
        """Aplica faltantes diretamente em produção."""
        if self.df_faltantes is not None and not self.df_faltantes.empty:
            return self._sync_direct(self.df_faltantes)
        return merge_test_to_production(backup_dir=self.backup_dir)

    def _sync_direct(self, df_new: pd.DataFrame) -> Tuple[bool, str, str]:
        """Sincroniza direto para produção com backup."""
        try:
            client = _get_gsheets_client()
            if not client:
                return False, "Falha na autenticação", ""

            sh = client.open('gdados')
            ws = sh.worksheet('meus_proventos')
            prod_data = ws.get_all_values()

            if len(prod_data) < 1:
                return False, "Aba vazia", ""

            headers = prod_data[0]
            df_prod = pd.DataFrame(prod_data[1:], columns=headers)
            backup_path = create_backup(df_prod, self.backup_dir)

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
            return {'total': 0, 'dividendos': 0, 'impostos': 0, 'por_ticker': {}}

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

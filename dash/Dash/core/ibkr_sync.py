"""
IBKR Reconciliation Engine
Reconcilia proventos do CSV do Interactive Brokers com o Google Sheets.

Não é um importador ingênuo — é um reconciliador de eventos financeiros.
Cada provento é transformado em um EVENTO CANÔNICO com fingerprint único.
O import pode ser executado infinitas vezes sem criar duplicatas.

Regras:
  1. Nunca confiar no texto da descrição
  2. Ignorar diferenças de arredondamento < 0.5%
  3. Eventos ±3 dias com mesmo fingerprint = mesmo provento
  4. Se valor total diverge mas valor/ação coincide → mesmo evento, posição diferente
  5. Withholding tax pertence ao mesmo evento do dividendo correspondente
"""

import pandas as pd
import hashlib
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Tuple, List, Dict, Optional


# ══════════════════════════════════════════════════════════
# CANONICAL EVENT
# ══════════════════════════════════════════════════════════

@dataclass
class CanonicalEvent:
    """Representação canônica de um evento de provento."""
    ticker: str              # Ticker normalizado (sem sufixos, UPPER)
    event_type: str          # dividend | interest | withholding_tax | payment_in_lieu
    event_date: datetime     # Data ex (prioridade) ou pagamento (fallback)
    amount: float            # Valor total do evento
    per_share: float         # Valor por ação (6 casas), 0.0 se indisponível
    currency: str            # Moeda original (USD, CAD, EUR...)
    quantity: float          # Quantidade base, 0.0 se indisponível
    description: str = ""    # Descrição original (só para debug, nunca para matching)
    fingerprint: str = ""    # Hash canônico computado

    # Campos de output (para GSheets)
    decisao: str = ""        # Dividendo / IMPOSTO
    lancamento: str = ""     # Dividendo / IMPOSTO / JCP / etc.
    categoria: str = ""      # Ação Internacional / FII / etc.

    def __post_init__(self):
        self.fingerprint = self._compute_fingerprint()

    def _compute_fingerprint(self) -> str:
        """
        Gera hash determinístico do evento canônico.
        Usado para bucket rápido — matching final é fuzzy.
        """
        raw = "|".join([
            self.ticker,
            self.event_type,
            f"{round(self.amount, 6):.6f}",
            self.currency,
        ])
        return hashlib.sha256(raw.encode()).hexdigest()[:16]


# ══════════════════════════════════════════════════════════
# CONSTANTS & HELPERS
# ══════════════════════════════════════════════════════════

DATE_TOLERANCE_DAYS = 3
VALUE_TOLERANCE_PCT = 0.005  # 0.5%

MESES_PT = {
    1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr', 5: 'mai', 6: 'jun',
    7: 'jul', 8: 'ago', 9: 'set', 10: 'out', 11: 'nov', 12: 'dez'
}

# Tickers brasileiros para ignorar (não vêm do IBKR internacional)
TICKERS_BR_IGNORAR = {
    'KNCR11', 'HGCR11', 'TAEE11', 'VALE3', 'CMIG4', 'HGLG11',
    'ITUB4', 'XPML11', 'IVVB11'
}


def normalize_ticker(t: str) -> str:
    """Normaliza ticker removendo sufixos de bolsa."""
    return (str(t)
            .replace('.SA', '').replace('.TO', '')
            .replace('.L', '').replace('.AS', '')
            .strip().upper())


def format_mes_ano(dt: datetime) -> str:
    """Converte datetime para formato 'mmm/aa' (ex: jan/25)."""
    try:
        return f"{MESES_PT[dt.month]}/{str(dt.year)[2:]}"
    except:
        return ""


def format_valor_br(valor: float) -> str:
    """Formata valor para padrão brasileiro (vírgula como decimal)."""
    return str(round(valor, 2)).replace('.', ',')


def values_match(a: float, b: float) -> bool:
    """Verifica se dois valores estão dentro da tolerância de 0.5%."""
    if a == 0 and b == 0:
        return True
    denom = max(abs(a), abs(b))
    if denom == 0:
        return True
    return abs(a - b) / denom < VALUE_TOLERANCE_PCT


def dates_match(d1: datetime, d2: datetime) -> bool:
    """Verifica se duas datas estão dentro da janela de ±3 dias."""
    if d1 is None or d2 is None:
        return False
    return abs((d1 - d2).days) <= DATE_TOLERANCE_DAYS


def parse_date_safe(d) -> Optional[datetime]:
    """Parse robusto de data em múltiplos formatos."""
    if d is None or (isinstance(d, float) and pd.isna(d)):
        return None
    if isinstance(d, datetime):
        return d
    if isinstance(d, pd.Timestamp):
        return d.to_pydatetime()
    s = str(d).strip()
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%Y%m%d'):
        try:
            return datetime.strptime(s[:10], fmt)
        except ValueError:
            continue
    try:
        return pd.to_datetime(s, dayfirst=True).to_pydatetime()
    except:
        return None


def classify_event_type(tipo_raw: str, descricao: str = "") -> str:
    """
    Classifica tipo de evento a partir de campos do IBKR.
    Nunca confia apenas na descrição — usa regex robusto.
    """
    t = str(tipo_raw).lower().strip()
    d = str(descricao).lower().strip()

    # Withholding tax patterns
    if any(x in t for x in ['retenção', 'retencao', 'withholding', 'imposto', 'tax']):
        return 'withholding_tax'

    # Payment in lieu
    if any(x in t for x in ['payment in lieu', 'lieu', 'pil']):
        return 'payment_in_lieu'
    if 'payment in lieu' in d:
        return 'payment_in_lieu'

    # Interest
    if any(x in t for x in ['juros', 'interest', 'jcp', 'jscp']):
        return 'interest'
    if any(x in d for x in ['interest', 'bond coupon']):
        return 'interest'

    # Default: dividend
    if any(x in t for x in ['dividendo', 'dividend', 'provento', 'rendimento']):
        return 'dividend'

    # Fallback heurístico pela descrição
    if 'dividend' in d or 'cash' in d:
        return 'dividend'

    return 'dividend'


def extract_per_share(descricao: str) -> float:
    """
    Tenta extrair valor por ação da descrição do IBKR.
    Ex: "VT(US9220427424) Cash Dividend USD 0.8453 per Share"
    """
    patterns = [
        r'(\d+\.?\d*)\s*per\s*share',
        r'per share.*?(\d+\.?\d*)',
        r'dividend\s+\w{3}\s+(\d+\.?\d*)',
    ]
    d = str(descricao)
    for p in patterns:
        m = re.search(p, d, re.IGNORECASE)
        if m:
            try:
                return round(float(m.group(1)), 6)
            except:
                pass
    return 0.0


def extract_currency(descricao: str, default: str = 'USD') -> str:
    """Extrai moeda da descrição do IBKR."""
    d = str(descricao).upper()
    for curr in ['CAD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'SEK', 'NOK', 'DKK']:
        if curr in d:
            return curr
    if 'USD' in d:
        return 'USD'
    return default


# ══════════════════════════════════════════════════════════
# IBKR CSV PARSER (ROBUSTO)
# ══════════════════════════════════════════════════════════

def parse_ibkr_report(file_path: str) -> List[CanonicalEvent]:
    """
    Parseia o relatório CSV do IBKR e retorna lista de CanonicalEvents.
    Detecta seções por header, extrai per-share, e classifica tipo de evento.
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    events: List[CanonicalEvent] = []

    for line in lines:
        # Detectar linhas de transação de proventos
        if not line.startswith('Histórico de transações,Data,'):
            continue

        parts = line.strip().split(',')
        if len(parts) < 13:
            continue

        tipo_raw = parts[5]         # Tipo do evento
        descricao = parts[4]        # Descrição completa
        simbolo = parts[6]          # Ticker
        data_str = parts[2]         # Data YYYY-MM-DD
        valor_str = parts[10]       # Valor total

        ticker_norm = normalize_ticker(simbolo)

        # Ignorar tickers brasileiros
        if ticker_norm in TICKERS_BR_IGNORAR:
            continue

        # Parse data
        event_date = parse_date_safe(data_str)
        if event_date is None:
            continue

        # Parse valor
        try:
            amount = float(valor_str)
        except (ValueError, TypeError):
            continue

        # Classificar tipo
        event_type = classify_event_type(tipo_raw, descricao)

        # Extrair per-share
        per_share = extract_per_share(descricao)

        # Extrair moeda
        currency = extract_currency(descricao)

        # Extrair quantidade (se per_share > 0)
        quantity = 0.0
        if per_share > 0:
            try:
                quantity = round(abs(amount) / per_share, 2)
            except ZeroDivisionError:
                pass

        # Mapear para campos GSheets
        if event_type == 'withholding_tax':
            decisao = 'IMPOSTO'
            lancamento = 'IMPOSTO'
        elif event_type == 'payment_in_lieu':
            decisao = 'Dividendo'
            lancamento = 'Payment in Lieu'
        elif event_type == 'interest':
            decisao = 'Dividendo'
            lancamento = 'Juros/JCP'
        else:
            decisao = 'Dividendo'
            lancamento = 'Dividendo'

        event = CanonicalEvent(
            ticker=ticker_norm,
            event_type=event_type,
            event_date=event_date,
            amount=amount,
            per_share=per_share,
            currency=currency,
            quantity=quantity,
            description=descricao,
            decisao=decisao,
            lancamento=lancamento,
            categoria='Ação Internacional',
        )
        events.append(event)

    return events


# ══════════════════════════════════════════════════════════
# GSHEETS → CANONICAL EVENTS
# ══════════════════════════════════════════════════════════

def gsheets_to_canonical(df: pd.DataFrame) -> List[CanonicalEvent]:
    """
    Converte DataFrame do GSheets em lista de CanonicalEvents para matching.
    """
    events: List[CanonicalEvent] = []

    for _, row in df.iterrows():
        ticker_norm = normalize_ticker(str(row.get('ticker', '')))

        # Ignorar tickers brasileiros (não conciliamos com IBKR)
        if ticker_norm in TICKERS_BR_IGNORAR:
            continue

        # Parse data
        event_date = parse_date_safe(row.get('data'))
        if event_date is None:
            continue

        # Parse valor
        valor = row.get('valor', 0)
        if isinstance(valor, str):
            try:
                amount = float(valor.replace(',', '.'))
            except:
                amount = 0.0
        else:
            amount = float(valor) if pd.notna(valor) else 0.0

        # Classificar tipo pelo decisao/lancamento existente
        decisao = str(row.get('decisao', '')).strip()
        lancamento_raw = str(row.get('lancamento', '')).strip()

        if decisao.upper() == 'IMPOSTO' or 'imposto' in lancamento_raw.lower():
            event_type = 'withholding_tax'
        elif 'juro' in lancamento_raw.lower() or 'jcp' in lancamento_raw.lower():
            event_type = 'interest'
        elif 'lieu' in lancamento_raw.lower():
            event_type = 'payment_in_lieu'
        else:
            event_type = 'dividend'

        currency = str(row.get('moeda', 'BRL')).upper().strip()
        if currency in ('', 'NAN', 'NONE'):
            currency = 'BRL'

        event = CanonicalEvent(
            ticker=ticker_norm,
            event_type=event_type,
            event_date=event_date,
            amount=amount,
            per_share=0.0,  # GSheets não tem per-share
            currency=currency,
            quantity=0.0,
            decisao=decisao,
            lancamento=lancamento_raw,
            categoria=str(row.get('categoria', '')),
        )
        events.append(event)

    return events


# ══════════════════════════════════════════════════════════
# RECONCILIATION ENGINE
# ══════════════════════════════════════════════════════════

def _is_same_event(new: CanonicalEvent, existing: CanonicalEvent) -> bool:
    """
    Determina se dois eventos canônicos representam o mesmo provento.

    Regras:
      1. Mesmo ticker (normalizado)
      2. Mesmo tipo de evento
      3. Mesma moeda
      4. Datas dentro de ±3 dias
      5. Valores dentro de 0.5% OU per-share coincide
    """
    # Must match: ticker, type, currency
    if new.ticker != existing.ticker:
        return False
    if new.event_type != existing.event_type:
        return False
    if new.currency != existing.currency:
        return False

    # Date window
    if not dates_match(new.event_date, existing.event_date):
        return False

    # Value matching (fuzzy)
    if values_match(new.amount, existing.amount):
        return True

    # Per-share fallback: se ambos têm per_share, comparar
    if new.per_share > 0 and existing.per_share > 0:
        if values_match(new.per_share, existing.per_share):
            return True  # Mesmo evento, posição diferente

    # Se valor total diverge significativamente mas per-share coincide
    # (posição mudou entre exports), ainda é o mesmo evento
    if new.per_share > 0 and existing.amount != 0:
        implied_per_share = existing.amount / new.quantity if new.quantity > 0 else 0
        if implied_per_share > 0 and values_match(new.per_share, implied_per_share):
            return True

    return False


def reconcile(
    new_events: List[CanonicalEvent],
    existing_events: List[CanonicalEvent]
) -> Tuple[List[CanonicalEvent], List[CanonicalEvent], List[CanonicalEvent]]:
    """
    Reconcilia eventos novos contra existentes.

    Returns:
        Tuple[to_insert, to_update, skipped]
        - to_insert: eventos genuinamente novos
        - to_update: eventos existentes com metadata atualizada
        - skipped: eventos duplicados descartados
    """
    to_insert: List[CanonicalEvent] = []
    to_update: List[CanonicalEvent] = []
    skipped: List[CanonicalEvent] = []

    # Index existentes por ticker para busca eficiente
    existing_by_ticker: Dict[str, List[CanonicalEvent]] = {}
    for ev in existing_events:
        existing_by_ticker.setdefault(ev.ticker, []).append(ev)

    # Track quais existentes já foram matchados (evitar double-match)
    matched_existing: set = set()

    for new_ev in new_events:
        candidates = existing_by_ticker.get(new_ev.ticker, [])
        found_match = False

        for i, existing_ev in enumerate(candidates):
            existing_id = id(existing_ev)
            if existing_id in matched_existing:
                continue

            if _is_same_event(new_ev, existing_ev):
                matched_existing.add(existing_id)
                found_match = True

                # Se o novo tem mais metadata (per_share), marcar para update
                if new_ev.per_share > 0 and existing_ev.per_share == 0:
                    to_update.append(new_ev)
                else:
                    skipped.append(new_ev)
                break

        if not found_match:
            to_insert.append(new_ev)

    return to_insert, to_update, skipped


# ══════════════════════════════════════════════════════════
# CANONICAL → GSHEETS FORMAT
# ══════════════════════════════════════════════════════════

def events_to_gsheets_df(events: List[CanonicalEvent]) -> pd.DataFrame:
    """Converte lista de CanonicalEvents para DataFrame no formato GSheets."""
    rows = []
    for ev in events:
        rows.append({
            'ticker': ev.ticker,
            'data': ev.event_date.strftime('%Y-%m-%d'),
            'decisao': ev.decisao,
            'mes': format_mes_ano(ev.event_date),
            'ano': str(ev.event_date.year),
            'lancamento': ev.lancamento,
            'categoria': ev.categoria,
            'valor': format_valor_br(ev.amount),
            'moeda': ev.currency,
        })
    return pd.DataFrame(rows)


# ══════════════════════════════════════════════════════════
# BACKUP
# ══════════════════════════════════════════════════════════

def create_backup(df: pd.DataFrame, backup_dir: str) -> str:
    """Cria backup do DataFrame atual em CSV."""
    os.makedirs(backup_dir, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = os.path.join(backup_dir, f'meus_proventos_backup_{timestamp}.csv')
    df.to_csv(backup_path, index=False, encoding='utf-8-sig')
    return backup_path


# ══════════════════════════════════════════════════════════
# GSHEETS I/O
# ══════════════════════════════════════════════════════════

def sync_to_test_tab(
    df_faltantes: pd.DataFrame,
    spreadsheet_name: str = 'gdados',
    test_tab_name: str = 'meus_proventos_test'
) -> Tuple[bool, str]:
    """Sincroniza proventos faltantes para aba de teste no GSheets."""
    try:
        from core.data.gsheets import _authenticate_no_cache
        import gspread

        client = _authenticate_no_cache()
        if not client:
            return False, "Falha na autenticação com Google Sheets"

        sh = client.open(spreadsheet_name)

        try:
            ws_test = sh.worksheet(test_tab_name)
        except gspread.WorksheetNotFound:
            ws_test = sh.add_worksheet(title=test_tab_name, rows=1000, cols=10)
            headers = ['ticker', 'data', 'decisao', 'mes', 'ano', 'lancamento', 'categoria', 'valor', 'moeda']
            ws_test.update('A1:I1', [headers])

        existing_data = ws_test.get_all_values()
        next_row = max(len(existing_data) + 1, 2)

        cols_order = ['ticker', 'data', 'decisao', 'mes', 'ano', 'lancamento', 'categoria', 'valor', 'moeda']
        rows_to_add = []

        for _, row in df_faltantes.iterrows():
            row_data = [str(row.get(col, '')) for col in cols_order]
            rows_to_add.append(row_data)

        if rows_to_add:
            range_start = f'A{next_row}'
            range_end = f'I{next_row + len(rows_to_add) - 1}'
            ws_test.update(f'{range_start}:{range_end}', rows_to_add)
            return True, f"Adicionados {len(rows_to_add)} registros na aba '{test_tab_name}'"

        return True, "Nenhum registro novo para adicionar"

    except Exception as e:
        return False, f"Erro na sincronização: {e}"


def sync_direct_to_production(
    df_faltantes: pd.DataFrame,
    backup_dir: str,
    spreadsheet_name: str = 'gdados',
    prod_tab_name: str = 'meus_proventos'
) -> Tuple[bool, str, str]:
    """Sincroniza proventos diretamente para produção com backup."""
    try:
        from core.data.gsheets import _authenticate_no_cache

        client = _authenticate_no_cache()
        if not client:
            return False, "Falha na autenticação com Google Sheets", ""

        sh = client.open(spreadsheet_name)
        ws_prod = sh.worksheet(prod_tab_name)

        prod_data = ws_prod.get_all_values()
        if len(prod_data) < 1:
            return False, "Aba de produção vazia ou sem cabeçalhos", ""

        headers = prod_data[0]
        df_prod = pd.DataFrame(prod_data[1:], columns=headers)

        backup_path = create_backup(df_prod, backup_dir)

        cols_order = ['ticker', 'data', 'decisao', 'mes', 'ano', 'lancamento', 'categoria', 'valor', 'moeda']
        df_new = df_faltantes[cols_order].copy()

        df_merged = pd.concat([df_prod, df_new], ignore_index=True)
        df_merged['data_sort'] = pd.to_datetime(df_merged['data'], errors='coerce')
        df_merged = df_merged.sort_values('data_sort', ascending=False)
        df_merged = df_merged.drop(columns=['data_sort'])

        data_to_write = [headers] + df_merged.values.tolist()
        ws_prod.clear()
        ws_prod.update('A1', data_to_write)

        return True, f"Adicionados {len(df_faltantes)} proventos em produção", backup_path

    except Exception as e:
        return False, f"Erro ao sincronizar: {e}", ""


def merge_test_to_production(
    spreadsheet_name: str = 'gdados',
    test_tab_name: str = 'meus_proventos_test',
    prod_tab_name: str = 'meus_proventos',
    backup_dir: str = None
) -> Tuple[bool, str, str]:
    """Mescla dados da aba de teste para produção."""
    try:
        from core.data.gsheets import _authenticate_no_cache

        client = _authenticate_no_cache()
        if not client:
            return False, "Falha na autenticação", ""

        sh = client.open(spreadsheet_name)

        ws_prod = sh.worksheet(prod_tab_name)
        prod_data = ws_prod.get_all_values()

        if len(prod_data) < 1:
            return False, "Aba de produção vazia ou sem cabeçalhos", ""

        headers = prod_data[0]
        df_prod = pd.DataFrame(prod_data[1:], columns=headers)

        backup_path = ""
        if backup_dir:
            backup_path = create_backup(df_prod, backup_dir)

        try:
            ws_test = sh.worksheet(test_tab_name)
            test_data = ws_test.get_all_values()

            if len(test_data) <= 1:
                return True, "Aba de teste vazia, nada a mesclar", backup_path

            df_test = pd.DataFrame(test_data[1:], columns=test_data[0])

        except Exception:
            return True, "Aba de teste não existe, nada a mesclar", backup_path

        df_merged = pd.concat([df_prod, df_test], ignore_index=True)
        df_merged['data_sort'] = pd.to_datetime(df_merged['data'], errors='coerce')
        df_merged = df_merged.sort_values('data_sort', ascending=False)
        df_merged = df_merged.drop(columns=['data_sort'])

        data_to_write = [headers] + df_merged.values.tolist()
        ws_prod.clear()
        ws_prod.update('A1', data_to_write)

        ws_test.clear()
        ws_test.update('A1', [headers])

        return True, f"Mesclados {len(df_test)} registros para produção", backup_path

    except Exception as e:
        return False, f"Erro ao mesclar: {e}", ""


# ══════════════════════════════════════════════════════════
# PUBLIC API — IBKRSyncManager
# ══════════════════════════════════════════════════════════

class IBKRSyncManager:
    """
    Gerenciador de reconciliação IBKR → GSheets.
    API pública mantida compatível com versão anterior.
    """

    def __init__(self, csv_path: str = None, backup_dir: str = None):
        self.csv_path = csv_path
        self.backup_dir = backup_dir or os.path.join(os.path.dirname(__file__), '..', 'backups')

        # State
        self._ibkr_events: List[CanonicalEvent] = []
        self._existing_events: List[CanonicalEvent] = []
        self._to_insert: List[CanonicalEvent] = []
        self._to_update: List[CanonicalEvent] = []
        self._skipped: List[CanonicalEvent] = []
        self._reconciled = False

        # Output: formato GSheets
        self.df_faltantes: Optional[pd.DataFrame] = None

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
        self._ibkr_events = parse_ibkr_report(path)

        n_div = sum(1 for e in self._ibkr_events if e.event_type in ('dividend', 'payment_in_lieu', 'interest'))
        n_tax = sum(1 for e in self._ibkr_events if e.event_type == 'withholding_tax')

        return n_div, n_tax

    def find_missing(self, df_gsheets: pd.DataFrame) -> pd.DataFrame:
        """
        Reconcilia proventos do CSV com a base existente (GSheets).
        Retorna DataFrame com proventos genuinamente novos.
        """
        if not self._ibkr_events:
            raise ValueError("CSV não carregado. Execute load_csv() primeiro.")

        # Converter GSheets para eventos canônicos
        self._existing_events = gsheets_to_canonical(df_gsheets)

        # Reconciliar
        self._to_insert, self._to_update, self._skipped = reconcile(
            self._ibkr_events,
            self._existing_events
        )
        self._reconciled = True

        # Converter para formato GSheets
        if self._to_insert:
            self.df_faltantes = events_to_gsheets_df(self._to_insert)
        else:
            self.df_faltantes = pd.DataFrame()

        return self.df_faltantes

    def sync_to_test(self) -> Tuple[bool, str]:
        """Sincroniza faltantes para aba de teste."""
        if self.df_faltantes is None or self.df_faltantes.empty:
            return True, "Nenhum provento faltante para sincronizar"
        return sync_to_test_tab(self.df_faltantes)

    def apply_to_production(self) -> Tuple[bool, str, str]:
        """
        Aplica mudanças: pode vir da aba de teste ou direto da reconciliação.
        """
        if self.df_faltantes is not None and not self.df_faltantes.empty:
            return sync_direct_to_production(self.df_faltantes, self.backup_dir)
        return merge_test_to_production(backup_dir=self.backup_dir)

    def get_summary(self) -> Dict:
        """Retorna resumo detalhado da reconciliação."""
        if not self._reconciled:
            return {
                'total_csv': len(self._ibkr_events),
                'total_existentes': 0,
                'novos': 0, 'atualizados': 0, 'duplicados': 0,
                'dividendos_novos': 0, 'impostos_novos': 0,
                'valor_bruto': 0, 'valor_impostos': 0, 'valor_liquido': 0,
                'por_ticker': {}
            }

        novos_div = [e for e in self._to_insert if e.event_type != 'withholding_tax']
        novos_tax = [e for e in self._to_insert if e.event_type == 'withholding_tax']

        valor_bruto = sum(e.amount for e in novos_div)
        valor_impostos = sum(abs(e.amount) for e in novos_tax)

        por_ticker: Dict[str, float] = {}
        for e in self._to_insert:
            por_ticker[e.ticker] = por_ticker.get(e.ticker, 0) + e.amount

        return {
            'total_csv': len(self._ibkr_events),
            'total_existentes': len(self._existing_events),
            'novos': len(self._to_insert),
            'atualizados': len(self._to_update),
            'duplicados': len(self._skipped),
            'dividendos_novos': len(novos_div),
            'impostos_novos': len(novos_tax),
            'valor_bruto': valor_bruto,
            'valor_impostos': valor_impostos,
            'valor_liquido': valor_bruto - valor_impostos,
            'por_ticker': por_ticker,
        }

    def get_reconciliation_report(self) -> str:
        """Gera relatório textual da reconciliação para debug/log."""
        s = self.get_summary()
        lines = [
            "═══ Relatório de Reconciliação IBKR ═══",
            f"  CSV: {s['total_csv']} eventos parseados",
            f"  Base: {s['total_existentes']} eventos existentes",
            f"  ──────────────────────────────────────",
            f"  ✅ Novos: {s['novos']}  (div: {s['dividendos_novos']}, imp: {s['impostos_novos']})",
            f"  🔄 Atualizados: {s['atualizados']}",
            f"  ⏭️  Duplicados: {s['duplicados']}",
            f"  ──────────────────────────────────────",
            f"  💰 Valor bruto: {s['valor_bruto']:.2f}",
            f"  🧾 Impostos: {s['valor_impostos']:.2f}",
            f"  🏁 Líquido: {s['valor_liquido']:.2f}",
        ]

        if s['por_ticker']:
            lines.append(f"  ──────────────────────────────────────")
            lines.append(f"  Por ticker:")
            for ticker, val in sorted(s['por_ticker'].items()):
                lines.append(f"    {ticker}: {val:.2f}")

        return "\n".join(lines)

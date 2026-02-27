import pandas as pd
import streamlit as st
import re
from datetime import datetime

# Mesmas colunas usadas pelo ibkr_sync.py
COLS_GSHEETS = ['ticker', 'data', 'decisao', 'mes', 'ano', 'lancamento', 'categoria', 'valor', 'moeda']

class B3SyncManager:
    """
    Gerenciador de importação de Proventos da B3 (Excel).
    Segue o mesmo padrão do IBKRSyncManager: parse → find_missing → test → prod.
    """
    def __init__(self):
        self.df_faltantes = None
        self.backup_dir = None
        
    def extract_ticker(self, produto_str: str) -> str:
        """
        Extracts ticker from B3 'Produto' column.
        B3 format: "TICKER - FULL NAME"
        Examples:
        - "KNCR11 - KINEA RENDIMENTOS IMOBILIÁRIOS FDO INV IMOB - FII" -> "KNCR11"
        - "ITUB4 - ITAU UNIBANCO HOLDING S/A" -> "ITUB4"
        - "VALE3 - VALE S.A." -> "VALE3"
        - "XPML11 - XP MALLS FDO INV IMOB FII" -> "XPML11"
        """
        if not isinstance(produto_str, str): 
            return "UNKNOWN"
        
        s = produto_str.strip()
        
        # Pattern: TICKER is BEFORE the first " - "
        # e.g. "KNCR11 - KINEA..." → split on " - " and take first part
        if ' - ' in s:
            candidate = s.split(' - ')[0].strip()
            # Validate: should look like a ticker (3-6 alphanumeric chars)
            if re.match(r'^[A-Z]{3,6}[0-9]{1,2}[A-Z]?$', candidate):
                return candidate
        
        # Fallback: return cleaned string
        return s.upper()

    def _format_mes_ano(self, data_str: str) -> str:
        """Converte 'YYYY-MM-DD' para 'mmm/aa' (ex: jan/25)."""
        meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
        try:
            dt = pd.Timestamp(data_str)
            return f"{meses[dt.month - 1]}/{str(dt.year)[-2:]}"
        except:
            return ""

    def process_file(self, uploaded_file) -> tuple:
        """
        Lê Excel da B3, filtra proventos e padroniza no formato COLS_GSHEETS.
        Retorna (df_preview, msg_erro).
        """
        try:
            # Read Excel
            df_raw = pd.read_excel(uploaded_file)
            
            # Required columns
            req_cols = ['Entrada/Saída', 'Data', 'Movimentação', 'Produto', 'Valor da Operação']
            missing = [c for c in req_cols if c not in df_raw.columns]
            if missing:
                return pd.DataFrame(), f"Colunas não encontradas: {missing}. Colunas do arquivo: {df_raw.columns.tolist()}"

            # Filter: Credito only
            df = df_raw[df_raw['Entrada/Saída'].astype(str).str.strip().str.lower() == 'credito'].copy()
            
            # Filter: Proventos types
            tipo_permitidos = ['Dividendo', 'Juros Sobre Capital Próprio', 'Rendimento']
            df = df[df['Movimentação'].isin(tipo_permitidos)].copy()
            
            if df.empty:
                return pd.DataFrame(), "Nenhum provento (Crédito: Dividendo/JCP/Rendimento) encontrado no arquivo."

            # Parse Data (DD/MM/YYYY ou outros formatos)
            from core.utils import parse_date_br
            df['data_dt'] = parse_date_br(df['Data'])
            df = df.dropna(subset=['data_dt'])
            
            # Extract Ticker
            df['ticker'] = df['Produto'].apply(self.extract_ticker)
            
            # Valor
            from core.utils import parse_decimal_br
            df['valor_num'] = df['Valor da Operação'].apply(parse_decimal_br)
            
            # Map 'Movimentação' to decisao/lancamento
            decisao_map = {
                'Juros Sobre Capital Próprio': 'JCP',
                'Dividendo': 'Dividendo',
                'Rendimento': 'Dividendo'
            }
            df['decisao'] = df['Movimentação'].map(decisao_map).fillna('Outros')
            
            # Determinar categoria (FII vs Ação)
            def categorize(row):
                ticker = row['ticker']
                # FII tickers end with 11 or 11B
                if re.match(r'^[A-Z]{4}11[B]?$', ticker):
                    return 'FII'
                return 'Ação Nacional'
            df['categoria'] = df.apply(categorize, axis=1)
            
            # Build final DF matching COLS_GSHEETS format
            df_final = pd.DataFrame()
            df_final['ticker'] = df['ticker']
            df_final['data'] = df['data_dt'].dt.strftime('%Y-%m-%d')
            df_final['decisao'] = df['decisao']
            df_final['mes'] = df['data_dt'].apply(lambda d: self._format_mes_ano(d))
            df_final['ano'] = df['data_dt'].dt.year.astype(str)
            df_final['lancamento'] = df['decisao']  # Same as decisao for B3
            df_final['categoria'] = df['categoria']
            df_final['valor'] = df['valor_num'].apply(lambda v: str(v).replace('.', ','))
            df_final['moeda'] = 'BRL'
            
            df_final = df_final.reset_index(drop=True)
            
            # --- Deduplicação contra existente ---
            from core.data.loader import load_proventos
            st.cache_data.clear()
            df_existing = load_proventos()
            
            df_missing = self._find_missing(df_final, df_existing)
            
            self.df_faltantes = df_missing
            return df_missing, ""

        except Exception as e:
            import traceback
            return pd.DataFrame(), f"Erro interno: {str(e)}\n{traceback.format_exc()}"

    def _find_missing(self, df_new: pd.DataFrame, df_existing: pd.DataFrame) -> pd.DataFrame:
        """
        Compara proventos novos da B3 com existentes no GSheets.
        Chave de dedup: data + ticker_normalizado + valor_arredondado
        
        NÃO usa tipo/decisao na chave porque:
        - GSheets usa 'DIvidendo' para TUDO (FIIs, ações)
        - B3 usa 'Rendimento' para FIIs, 'Dividendo' para ações, 'JCP' para JCP
        - Isso causa falsos negativos na dedup
        
        data + ticker + valor é suficiente para identificar unicamente um provento.
        """
        if df_existing.empty:
            return df_new
        
        def normalize_ticker(t):
            """Remove .SA, .F, etc e normaliza para uppercase"""
            s = str(t).upper().strip()
            for suffix in ['.SA', '.F', '.DE']:
                if s.endswith(suffix):
                    s = s[:-len(suffix)]
            return s
        
        def parse_valor(v):
            """Converte valor para float."""
            try:
                return float(str(v).replace(',', '.'))
            except:
                return 0.0
            
        def create_sig(row, cols):
            """Gera assinatura: YYYYMMDD_TICKER_VALOR"""
            try:
                # Data
                d = row.get(cols['data'], '')
                if hasattr(d, 'strftime'):
                    d_str = d.strftime('%Y%m%d')
                else:
                    d_str = str(d).replace('-', '')[:8]
                
                # Ticker (sem .SA)
                t = normalize_ticker(row.get(cols['ticker'], ''))
                
                # Valor (float arredondado para inteiro)
                v = parse_valor(row.get(cols['valor'], 0))
                v_str = f"{v:.0f}"
                
                return f"{d_str}_{t}_{v_str}"
            except:
                return "INVALID"
        
        # Colunas do existente (lowercase, via loader.py)
        existing_cols = {'data': 'data', 'ticker': 'ticker', 'valor': 'valor'}
        
        # Colunas do novo (nosso formato)
        new_cols = {'data': 'data', 'ticker': 'ticker', 'valor': 'valor'}
        
        existing_sigs = set()
        try:
            existing_sigs = set(df_existing.apply(lambda r: create_sig(r, existing_cols), axis=1))
        except:
            pass
        
        df_new['_sig'] = df_new.apply(lambda r: create_sig(r, new_cols), axis=1)
        df_missing = df_new[~df_new['_sig'].isin(existing_sigs)].copy()
        df_missing = df_missing.drop(columns=['_sig'])
        
        return df_missing

    def sync_to_test(self) -> tuple:
        """Envia faltantes para aba de teste (meus_proventos_test)."""
        from core.sync.ibkr_sync import sync_to_test_tab
        if self.df_faltantes is None or self.df_faltantes.empty:
            return True, "Nenhum provento faltante"
        return sync_to_test_tab(self.df_faltantes)

    def apply_to_production(self) -> tuple:
        """Aplica faltantes diretamente em produção."""
        from core.sync.ibkr_sync import merge_test_to_production
        if self.df_faltantes is not None and not self.df_faltantes.empty:
            return self._sync_direct(self.df_faltantes)
        return merge_test_to_production(backup_dir=self.backup_dir)

    def _sync_direct(self, df_new: pd.DataFrame) -> tuple:
        """Sincroniza direto para produção com backup."""
        try:
            from core.sync.ibkr_sync import _get_gsheets_client, create_backup
            import os
            
            client = _get_gsheets_client()
            if not client:
                return False, "Falha na autenticação", ""

            sh = client.open('gdados')
            ws = sh.worksheet('meus_proventos')
            
            prod_data = ws.get_all_values()
            headers = prod_data[0] if prod_data else COLS_GSHEETS
            df_prod = pd.DataFrame(prod_data[1:], columns=headers) if len(prod_data) > 1 else pd.DataFrame(columns=headers)

            # Backup
            backup_dir = self.backup_dir or os.path.join(os.path.dirname(__file__), '..', 'backups')
            backup_path = create_backup(df_prod, backup_dir, prefix='meus_proventos_b3_backup')

            # Merge
            df_merged = pd.concat([df_prod, df_new[COLS_GSHEETS]], ignore_index=True)
            df_merged['_sort'] = pd.to_datetime(df_merged['data'], errors='coerce')
            df_merged = df_merged.sort_values('_sort', ascending=False).drop(columns=['_sort'])

            ws.clear()
            ws.update('A1', [headers] + df_merged.values.tolist())

            return True, f"{len(df_new)} proventos B3 adicionados!", backup_path

        except Exception as e:
            return False, f"Erro: {e}", ""


# ══════════════════════════════════════════════════════════════
# B3 TRADES (ATIVOS) — Compra e Venda de Ações/FIIs
# ══════════════════════════════════════════════════════════════

# Mesmas colunas usadas pelo ibkr_sync.py para meus_ativos
COLS_ATIVOS = ['Data', 'Tipo de transação', 'Símbolo', 'Quantidade', 'Preço',
               'Valor bruto', 'Taxa de corretagem', 'Valor líquido', 'Moeda', 'Corretora']


class B3TradesManager:
    """
    Gerenciador de importação de Trades (Compra/Venda) da B3.
    Filtra apenas 'Transferência - Liquidação' (ações/FIIs reais).
    Exclui futuros (WIN*) que são day trades.
    """
    def __init__(self):
        self.df_faltantes = None
        self.backup_dir = None
    
    def extract_ticker(self, produto_str: str) -> str:
        """Extrai ticker do campo Produto da B3."""
        if not isinstance(produto_str, str):
            return "UNKNOWN"
        s = produto_str.strip()
        if ' - ' in s:
            candidate = s.split(' - ')[0].strip()
            if re.match(r'^[A-Z]{3,6}[0-9]{1,2}[A-Z]?$', candidate):
                return candidate
        return s.upper()
    
    def process_trades(self, uploaded_file) -> tuple:
        """
        Lê Excel da B3, filtra trades reais e padroniza no formato COLS_ATIVOS.
        Retorna (df_preview, msg_erro).
        """
        try:
            df_raw = pd.read_excel(uploaded_file)
            
            # Required columns
            req_cols = ['Entrada/Saída', 'Data', 'Movimentação', 'Produto',
                        'Quantidade', 'Preço unitário', 'Valor da Operação']
            missing = [c for c in req_cols if c not in df_raw.columns]
            if missing:
                return pd.DataFrame(), f"Colunas não encontradas: {missing}"

            # Filter: APENAS Transferência - Liquidação (ações/FIIs reais)
            df = df_raw[df_raw['Movimentação'] == 'Transferência - Liquidação'].copy()
            
            if df.empty:
                return pd.DataFrame(), "Nenhuma 'Transferência - Liquidação' encontrada no arquivo."

            # Extract Ticker
            df['ticker'] = df['Produto'].apply(self.extract_ticker)
            
            # Excluir futuros (WIN*, WDO*, IND*, DOL*, etc.)
            futures_pattern = r'^(WIN|WDO|IND|DOL|WSP|BGI)'
            df = df[~df['ticker'].str.match(futures_pattern, na=False)].copy()
            
            if df.empty:
                return pd.DataFrame(), "Nenhum trade de ação/FII encontrado (apenas futuros)."

            # Map Entrada/Saída → Tipo
            # Credito = Compra (ações entram na custódia)
            # Debito = Venda (ações saem da custódia)
            df['tipo'] = df['Entrada/Saída'].apply(
                lambda x: 'Venda' if str(x).strip().lower() == 'debito' else 'Compra'
            )
            
            # Parse Data
            from core.utils import parse_date_br, parse_decimal_br
            df['data_dt'] = parse_date_br(df['Data'])
            df = df.dropna(subset=['data_dt'])
            
            # Filtrar: apenas trades a partir de 01/10/2025
            data_minima = pd.Timestamp('2025-10-01')
            df = df[df['data_dt'] >= data_minima].copy()
            
            if df.empty:
                return pd.DataFrame(), f"Nenhum trade encontrado a partir de {data_minima.strftime('%d/%m/%Y')}."
            
            # Parse numeric values
            df['qtd'] = df['Quantidade'].apply(parse_decimal_br)
            df['preco'] = df['Preço unitário'].apply(parse_decimal_br)
            df['valor_op'] = df['Valor da Operação'].apply(parse_decimal_br)
            
            # Build final DF matching COLS_ATIVOS format
            df_final = pd.DataFrame()
            df_final['Data'] = df['data_dt'].dt.strftime('%d/%m/%Y')
            df_final['Tipo de transação'] = df['tipo']
            df_final['Símbolo'] = df['ticker']
            df_final['Quantidade'] = df['qtd']
            df_final['Preço'] = df['preco']
            df_final['Valor bruto'] = df['valor_op']
            df_final['Taxa de corretagem'] = 0.0  # B3 doesn't report fees per trade
            df_final['Valor líquido'] = df['valor_op']  # Same as bruto (no separate fee)
            df_final['Moeda'] = 'BRL'
            df_final['Corretora'] = df['Instituição'] if 'Instituição' in df.columns else 'B3'
            
            df_final = df_final.reset_index(drop=True)
            
            # --- Deduplicação contra existente ---
            from core.data.loader import load_assets
            st.cache_data.clear()
            df_existing = load_assets()
            
            df_missing = self._find_missing_trades(df_final, df_existing)
            
            self.df_faltantes = df_missing
            return df_missing, ""

        except Exception as e:
            import traceback
            return pd.DataFrame(), f"Erro interno: {str(e)}\n{traceback.format_exc()}"

    def _find_missing_trades(self, df_new: pd.DataFrame, df_existing: pd.DataFrame) -> pd.DataFrame:
        """
        Compara trades novos da B3 com existentes.
        Chave: ticker + tipo + quantidade + preço (arredondado)
        """
        if df_existing.empty:
            return df_new
        
        def normalize_ticker(t):
            s = str(t).upper().strip()
            for suffix in ['.SA', '.F', '.DE']:
                if s.endswith(suffix):
                    s = s[:-len(suffix)]
            return s
        
        def create_sig(ticker, tipo, qty, preco):
            """Signature: TICKER_TIPO_QTD_PRECO"""
            t = normalize_ticker(ticker)
            tp = str(tipo).lower().strip()
            if 'compra' in tp or 'buy' in tp:
                tp = 'compra'
            elif 'venda' in tp or 'sell' in tp:
                tp = 'venda'
            try:
                q = int(float(qty))
            except:
                q = 0
            try:
                p = int(float(str(preco).replace(',', '.')))
            except:
                p = 0
            return f"{t}_{tp}_{q}_{p}"
        
        # Build existing sigs
        existing_sigs = set()
        try:
            for _, row in df_existing.iterrows():
                ticker = row.get('ticker', row.get('Símbolo', ''))
                tipo = row.get('tipo', row.get('Tipo de transação', ''))
                qty = row.get('quantidade', row.get('Quantidade', 0))
                preco = row.get('preco', row.get('Preço', 0))
                sig = create_sig(ticker, tipo, qty, preco)
                existing_sigs.add(sig)
        except:
            pass
        
        # Build new sigs
        df_new['_sig'] = df_new.apply(
            lambda r: create_sig(r['Símbolo'], r['Tipo de transação'], r['Quantidade'], r['Preço']),
            axis=1
        )
        
        df_missing = df_new[~df_new['_sig'].isin(existing_sigs)].copy()
        df_missing = df_missing.drop(columns=['_sig'])
        
        return df_missing

    def sync_to_test(self) -> tuple:
        """Envia faltantes para aba de teste (meus_ativos_test)."""
        from core.sync.ibkr_sync import _sync_trades_to_tab
        if self.df_faltantes is None or self.df_faltantes.empty:
            return True, "Nenhum trade faltante"
        return _sync_trades_to_tab(self.df_faltantes, 'meus_ativos_test')

    def apply_to_production(self) -> tuple:
        """Aplica faltantes diretamente em produção com backup."""
        if self.df_faltantes is None or self.df_faltantes.empty:
            return True, "Nenhum trade faltante", ""
        
        try:
            from core.sync.ibkr_sync import _get_gsheets_client, create_backup, COLS_ATIVOS as IBKR_COLS
            import os
            
            client = _get_gsheets_client()
            if not client:
                return False, "Falha na autenticação", ""

            sh = client.open('gdados')
            ws = sh.worksheet('meus_ativos')
            prod_data = ws.get_all_values()

            if len(prod_data) < 1:
                return False, "Aba vazia", ""

            headers = prod_data[0]
            df_prod = pd.DataFrame(prod_data[1:], columns=headers)
            
            backup_dir = self.backup_dir or os.path.join(os.path.dirname(__file__), '..', 'backups')
            backup_path = create_backup(df_prod, backup_dir, prefix='meus_ativos_b3_backup')

            # Preparar novos registros
            new_rows = self.df_faltantes[COLS_ATIVOS].copy()
            for col in ['Quantidade', 'Preço', 'Valor bruto', 'Taxa de corretagem', 'Valor líquido']:
                if col in new_rows.columns:
                    new_rows[col] = new_rows[col].apply(
                        lambda v: str(round(float(v), 2)).replace('.', ',') if pd.notna(v) else '0'
                    )

            df_merged = pd.concat([df_prod, new_rows], ignore_index=True)
            df_merged['_sort'] = pd.to_datetime(df_merged['Data'], dayfirst=True, errors='coerce')
            df_merged = df_merged.sort_values('_sort', ascending=False).drop(columns=['_sort'])

            ws.clear()
            ws.update('A1', [headers] + df_merged.values.tolist())

            return True, f"{len(self.df_faltantes)} trades B3 adicionados!", backup_path

        except Exception as e:
            return False, f"Erro: {e}", ""

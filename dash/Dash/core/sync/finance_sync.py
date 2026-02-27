import re
import pandas as pd
from datetime import datetime
import streamlit as st

def parse_ofx(file_content: str) -> pd.DataFrame:
    """
    Parses an OFX file content (string) and returns a DataFrame with transactions.
    Extracts: DTPOSTED, TRNAMT, FITID, MEMO, TRNTYPE.
    """
    # Robust Regex Extraction to avoid XML parsing issues with SGML headers
    transactions = []
    
    # Split by transaction tag
    raw_txns = re.findall(r'<STMTTRN>(.*?)</STMTTRN>', file_content, re.DOTALL)
    
    for raw in raw_txns:
        data = {}
        
        # Extract fields
        # Note: OFX tags might not have closing tags in some versions, but usually do in block.
        # We assume standard fields.
        
        # Date: <DTPOSTED>20260116000000[-3:BRT]</DTPOSTED>
        dt_match = re.search(r'<DTPOSTED>(.*?)<', raw) or re.search(r'<DTPOSTED>(.*)', raw)
        if dt_match:
            dt_str = dt_match.group(1).strip()
            # Parse YYYYMMDD
            try:
                data['date'] = datetime.strptime(dt_str[:8], '%Y%m%d').date()
            except:
                data['date'] = None
                
        # Amount: <TRNAMT>-81.97</TRNAMT>
        amt_match = re.search(r'<TRNAMT>(.*?)<', raw) or re.search(r'<TRNAMT>(.*)', raw)
        if amt_match:
            try:
                data['amount'] = float(amt_match.group(1).strip().replace(',', '.'))
            except:
                data['amount'] = 0.0
                
        # FITID: <FITID>...</FITID>
        id_match = re.search(r'<FITID>(.*?)<', raw) or re.search(r'<FITID>(.*)', raw)
        data['fitid'] = id_match.group(1).strip() if id_match else None
        
        # Memo: <MEMO>...</MEMO>
        memo_match = re.search(r'<MEMO>(.*?)<', raw) or re.search(r'<MEMO>(.*)', raw)
        data['memo'] = memo_match.group(1).strip() if memo_match else ""
        
        # Type: <TRNTYPE>...</TRNTYPE>
        type_match = re.search(r'<TRNTYPE>(.*?)<', raw) or re.search(r'<TRNTYPE>(.*)', raw)
        data['type'] = type_match.group(1).strip() if type_match else ""
        
        transactions.append(data)
        
    return pd.DataFrame(transactions)

def standardize_finance_df(df_ofx: pd.DataFrame, conta: str, tipo_conta: str) -> pd.DataFrame:
    """
    Maps OFX DataFrame to the application's Finance Schema.
    Schema: [data, valor, descricao, categoria, conta, tipo_conta, status, id_transacao]
    """
    if df_ofx.empty:
        return pd.DataFrame()
    
    df = df_ofx.copy()
    
    # Rename and Map
    df['data'] = df['date']
    df['valor'] = df['amount']
    df['descricao'] = df['memo'].fillna('Sem descrição').str.title()
    df['id_transacao'] = df['fitid']
    
    # Metadata
    df['conta'] = conta
    df['tipo_conta'] = tipo_conta
    
    # Default Defaults
    # Default Defaults
    df['categoria'] = df['descricao'].apply(infer_category)
    df['status'] = 'Pago' # Extrato = realizado
    
    # Try to extract installments from description (e.g. "Parcela 1/3")
    def extract_parcelas(desc):
        if not isinstance(desc, str): return '1'
        match = re.search(r'(\d+)/(\d+)', desc)
        if match:
            return f"{match.group(1)}/{match.group(2)}"
        return '1'
        
    df['parcelas'] = df['descricao'].apply(extract_parcelas)
    
    # Clean description (remove " - Parcela X/Y" or similar)
    def clean_desc(desc):
        if not isinstance(desc, str): return desc
        # Remove patterns like " - Parcela 1/3", " Parcela 1/3", etc.
        # This regex looks for optional space/dash, "Parcela", optional space, digits/digits
        d = re.sub(r'[\s-]*Parcela\s*\d+/\d+', '', desc, flags=re.IGNORECASE)
        # Also could be cleaner
        return d.strip()

    df['descricao'] = df['descricao'].apply(clean_desc).str.title()
    
    # Select cols
    cols = ['data', 'valor', 'descricao', 'categoria', 'conta', 'tipo_conta', 'parcelas', 'status', 'id_transacao']
    
    # Ensure all exist
    for c in cols:
        if c not in df.columns:
            df[c] = None
            
    return df[cols]

def infer_category(desc: str) -> str:
    """
    Infer category based on description keywords.
    """
    if not isinstance(desc, str): return 'Geral'
    d = desc.lower()
    
    keywords = {
        'Transporte': ['uber', '99', 'taxi', 'azul', 'latam', 'posto', 'combustivel', 'estacionamento', 'sem parar', 'veloe'],
        'Alimentação': ['ifood', 'rappi', 'restaurante', 'padaria', 'supermercado', 'mercado', 'assai', 'carrefour', 'pao de acucar', 'mambo', 'box da fruta', 'ifd*'],
        'Lazer': ['netflix', 'spotify', 'amazon prime', 'cinema', 'ingress', 'smart fit', 'youtube', 'hbo', 'disney'],
        'Serviços': ['apple', 'google', 'microsoft', 'aws', 'godaddy'],
        'Compras': ['amazon', 'mercadolivre', 'shoppee', 'shein', 'magalu', 'lojas americanas', 'leroy merlin', 'store'],
        'Saúde': ['farmacia', 'drogasil', 'drogaria', 'hospital', 'medico', 'unimed', 'petlove', 'veterinario'],
        'Educação': ['curso', 'udemy', 'alura', 'escola', 'faculdade'],
        'Moradia': ['condominio', 'luz', 'agua', 'gas', 'internet', 'claro', 'vivo', 'tim']
    }
    
    for cat, keys in keywords.items():
        for k in keys:
            if k in d:
                return cat
                
    return 'Geral'

def reconciliate_finance(df_new: pd.DataFrame, df_existing: pd.DataFrame) -> pd.DataFrame:
    """
    Compares new transactions with existing ones.
    Tries 'id_transacao' first, falls back to (data, valor, descricao).
    """
    if df_existing.empty:
        return df_new
        
    
    # Strategy 1: ID Match
    has_id_col = 'id_transacao' in df_existing.columns
    if has_id_col and not df_existing['id_transacao'].dropna().empty:
        existing_ids = set(df_existing['id_transacao'].dropna().astype(str).unique())
        if 'id_transacao' in df_new.columns:
            df_new['id_transacao'] = df_new['id_transacao'].astype(str)
            df_new = df_new[~df_new['id_transacao'].isin(existing_ids)]
    elif not has_id_col:
        # Informative but not warning
        st.caption("ℹ️ Coluna 'id_transacao' não encontrada. Usando verificação por conteúdo (Data + Valor + Descrição).")
            
    # Strategy 2: Content Match (Fallback or Additional Filter)
    # create signature: YYYYMMDD_VAL_DESC
    def create_sig(row):
        d = pd.to_datetime(row['data'], errors='coerce')
        d_str = d.strftime('%Y%m%d') if pd.notnull(d) else ''
        v = str(row['valor']).replace('.', ',')
        desc = str(row['descricao']).strip().lower()[:15] # First 15 chars
        return f"{d_str}_{v}_{desc}"

    # We need to ensure cols exist in both
    for c in ['data', 'valor', 'descricao']:
        if c not in df_existing.columns:
            return df_new # Cannot compare

    existing_sigs = set(df_existing.apply(create_sig, axis=1))
    
    # Filter by signature
    df_new['sig'] = df_new.apply(create_sig, axis=1)
    df_final = df_new[~df_new['sig'].isin(existing_sigs)].drop(columns=['sig'])
    
    return df_final

class FinanceSyncManager:
    """
    Gerenciador de importação OFX para a aba 'financas'.
    """
    def __init__(self):
        self.df_new = None
        
    def process_file(self, uploaded_file, conta: str, tipo_conta: str) -> tuple[pd.DataFrame, str]:
        """
        Lê OFX, padroniza e compara com dados existentes.
        Retorna (df_final_para_importar, mensagem_erro).
        """
        try:
            # Read
            content = uploaded_file.getvalue().decode('utf-8', errors='ignore')
            
            # Parse
            df_ofx = parse_ofx(content)
            if df_ofx.empty:
                return pd.DataFrame(), "Nenhuma transação encontrada no arquivo OFX."
                
            # Standardize
            df_std = standardize_finance_df(df_ofx, conta, tipo_conta)
            
            # Load Existing
            from core.data.provider import DataProvider
            # Force refresh to ensure we have latest IDs
            st.cache_data.clear() 
            df_existing = DataProvider.get_financas()
            
            # Dedup
            df_final = reconciliate_finance(df_std, df_existing)
            
            self.df_new = df_final
            return df_final, ""
            
        except Exception as e:
            return pd.DataFrame(), f"Erro ao processar arquivo: {str(e)}"
            
    def save_to_gsheets(self) -> tuple[bool, str]:
        """
        Salva o dataframe processado na aba 'financas'.
        """
        if self.df_new is None or self.df_new.empty:
            return False, "Nada para salvar."
            
        try:
            from core.data.gsheets import _authenticate_no_cache
            client = _authenticate_no_cache()
            if not client: return False, "Falha na autenticação com Google Sheets."
            
            sh = client.open('gdados')
            ws = sh.worksheet('financas')
            
            # Check headers to ensure id_transacao exists
            headers = ws.row_values(1)
            headers_clean = [str(h).lower().strip() for h in headers]
            
            # If id_transacao is missing, add it to header
            if 'id_transacao' not in headers_clean:
                # Add it to the next column
                next_col = len(headers) + 1
                try:
                    # 'A1' notation for next col is tricky without helpers, 
                    # but update cell by row/col is safer.
                    ws.update_cell(1, next_col, 'id_transacao')
                    st.toast("Coluna 'id_transacao' adicionada automaticamente à planilha.", icon="🔧")
                except Exception as e:
                    # If fails, we proceed, but alignment might be off if we append data with ID
                    # Actually, if we append a row with 8 items but sheet has 7, GSheets handles it.
                    pass
            
            # Prepare rows
            rows = []
            for _, row in self.df_new.iterrows():
                # Convert date to string YYYY-MM-DD or standard GSheets format
                dt = row['data']
                dt_str = dt.strftime('%Y-%m-%d') if dt else ''
                
                # Format float to BR string if needed, or keep as float for GSheets to format?
                # Usually string with comma is safer for existing logic unless we consistently use raw.
                val = str(row['valor']).replace('.', ',')
                
                rows.append([
                    dt_str,
                    row['descricao'],
                    val,
                    row['categoria'],
                    row['conta'],
                    row['tipo_conta'],
                    row['parcelas'],
                    row['status'],
                    row['id_transacao']
                ])
                
            # Append
            ws.append_rows(rows, value_input_option='USER_ENTERED')
            
            return True, f"Sucesso! {len(rows)} novas transações importadas."
            
        except Exception as e:
            return False, f"Erro ao salvar no Google Sheets: {str(e)}"

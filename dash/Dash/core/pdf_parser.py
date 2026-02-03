"""
PDF Bank Statement Parser
Extrai transações de PDFs de faturas bancárias (Bradesco, Nubank, etc)
"""

import pdfplumber
import re
import pandas as pd
from datetime import datetime, date
from typing import List, Dict, Optional, Tuple
from pathlib import Path


# === CATEGORY CLASSIFIER ===
CATEGORY_RULES = {
    # Alimentação / Delivery
    'Alimentacao': [
        'IFD*', 'IFOOD', 'RAPPI', 'UBER EATS', 'UBER EAT', '99FOOD',
        'PIZZA', 'SUSHI', 'RESTAURANTE', 'LANCHONETE', 'BURGER', 'MCDONALDS',
        'SUBWAY', 'STARBUCKS', 'PADARIA', 'CAFE', 'AÇAI', 'ACAI',
        'MARIA JOAO', 'PASQUALE', 'GRSA', 'BAGUETTE', 'HAYAI', 'SPAZIO',
        'CARREFOUR', 'SUPERMERCADO', 'MERCADO', 'HORTIFRUTI', 'PAO DE ACUCAR',
        'EXTRA', 'ASSAI', 'ATACADAO', 'BIG', 'SAMS CLUB', 'SBK'
    ],
    # Transporte
    'Transporte': [
        'UBER', 'CABIFY', '99APP', '99 APP', 'TAXI', 'INDRIVER',
        'POSTO', 'AUTO POSTO', 'AUTO ', 'SHELL', 'IPIRANGA', 'BR DISTRIBUIDORA',
        'ESTACIONAMENTO', 'PARKIMETRO', 'PARKING', 'ESTAPAR',
        'PEDAGIO', 'AUTOBAN', 'ECOVIAS', 'CCR', 'FAZENDINHA', 'BORBA GATO', 'BORBA',
        'AV VICENTE', 'VICENTE RAO'
    ],
    # Assinaturas
    'Assinaturas': [
        'NETFLIX', 'SPOTIFY', 'AMAZON PRIME', 'PRIME VIDEO', 'DISNEY',
        'HBO', 'GLOBOPLAY', 'YOUTUBE', 'APPLE', 'GOOGLE', 'MICROSOFT',
        'DEEZER', 'CRUNCHYROLL', 'TWITCH', 'STEAM', 'PLAYSTATION', 'XBOX'
    ],
    # Saúde
    'Saude': [
        'FARMACIA', 'DROGARIA', 'DROGASIL', 'DROGA RAIA', 'ULTRAFARMA',
        'PACHECO', 'SAO PAULO DRUG', 'PANVEL', 'HOSPITAL', 'CLINICA',
        'LABORATORIO', 'CONSULTA', 'DENTISTA', 'MEDICO', 'EXAME',
        'RDSAUDE', 'RD SAUDE'
    ],
    # Pet
    'Pet': [
        'PETZ', 'COBASI', 'PET SHOP', 'PETSHOP', 'PETLOVE', 'PET LOVE', 'PET CENTER'
    ],
    # Moradia
    'Moradia': [
        'ALUGUEL', 'CONDOMINIO', 'IPTU', 'LUZ', 'ENERGIA', 'ENEL', 'ELETRO',
        'AGUA', 'SABESP', 'GAS', 'COMGAS', 'INTERNET', 'NET ', 'CLARO', 'VIVO', 'TIM'
    ],
    # Compras
    'Compras': [
        'AMAZON', 'MERCADO LIVRE', 'MAGALU', 'MAGAZINE LUIZA', 'CASAS BAHIA',
        'AMERICANAS', 'SHOPEE', 'ALIEXPRESS', 'SHEIN', 'RENNER', 'C&A',
        'RIACHUELO', 'HAVAN', 'LOJAS', 'SHOPPING', '3M DIGITAL', '3M '
    ],
    # Lazer / Entretenimento
    'Lazer': [
        'CINEMA', 'CINEMARK', 'KINOPLEX', 'TEATRO', 'SHOW', 'INGRESSO',
        'PARQUE', 'MUSEU', 'ZOOLOGICO', 'CLUB', 'ACADEMIA', 'SMART FIT', 'BLUEFIT'
    ],
    # Viagem
    'Viagem': [
        'HOTEL', 'AIRBNB', 'BOOKING', 'DECOLAR', 'LATAM', 'GOL', 'AZUL',
        'RODOVIARIA', 'PASSAGEM', '123MILHAS', 'HURB'
    ],
}


def classify_category(description: str) -> str:
    """Classifica a categoria baseado na descrição da transação"""
    desc_upper = description.upper()
    
    for category, keywords in CATEGORY_RULES.items():
        for keyword in keywords:
            if keyword.upper() in desc_upper:
                return category
    
    return 'Outros'


def detect_installments(description: str) -> Tuple[str, str]:
    """
    Detecta se é parcelado e retorna (descrição_limpa, parcelas)
    Formatos: 01/10, 02/12, PARC 1/3
    """
    # Padrão: NN/NN no final ou meio
    match = re.search(r'(\d{2})/(\d{2})', description)
    if match:
        current, total = match.groups()
        if int(total) > 1:
            # Remove o padrão de parcela da descrição
            clean_desc = re.sub(r'\s*\d{2}/\d{2}\s*', ' ', description).strip()
            return clean_desc, f"{current}/{total}"
    
    return description, 'à vista'


def parse_bradesco_pdf(pdf_path: str) -> List[Dict]:
    """
    Extrai transações de PDF de fatura Bradesco
    Retorna lista de dicts com: data, descricao, valor, categoria, conta, tipo_conta, parcelas
    """
    transactions = []
    
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            # Usa extract_tables() para maior precisão
            tables = page.extract_tables()
            
            for table in tables:
                for cell_row in table:
                    if not cell_row or not cell_row[0]:
                        continue
                    
                    # Cada célula pode ter múltiplas linhas
                    cell_text = cell_row[0]
                    lines = cell_text.split('\n')
                    
                    for line in lines:
                        # Padrão Bradesco: DD/MM DESCRICAO CIDADE VALOR
                        # Exemplo: 12/01 PASQUALE DE SIMONE SAO PAULO 7,50
                        # Também: 18/01 CARREFOUR 358 SBK 01/10 SAO PAULO 329,90
                        match = re.match(
                            r'^(\d{2}/\d{2})\s+(.+?)\s+([A-Z][A-Z\s]+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})$',
                            line.strip()
                        )
                        
                        if match:
                            date_str, desc_raw, cidade, value_str = match.groups()
                            
                            # Ignora linhas de totais
                            if 'total' in desc_raw.lower():
                                continue
                            
                            # Parse date (adiciona ano atual)
                            current_year = date.today().year
                            day, month = date_str.split('/')
                            full_date = f"{day}/{month}/{current_year}"
                            
                            # Parse value
                            value = float(value_str.replace('.', '').replace(',', '.'))
                            
                            # Detecta parcelas (ex: 01/10)
                            desc_clean, parcelas = detect_installments(desc_raw)
                            
                            # Limpa descrição (remove cidade se ficou grudada)
                            desc_clean = desc_clean.strip()
                            
                            # Classifica categoria
                            categoria = classify_category(desc_clean)
                            
                            transactions.append({
                                'data': full_date,
                                'descricao': desc_clean,
                                'valor': value,
                                'categoria': categoria,
                                'conta': 'Bradesco',
                                'tipo_conta': 'Cartao',
                                'parcelas': parcelas
                            })
    
    return transactions


def parse_pdf(pdf_path: str, bank: str = 'auto') -> List[Dict]:
    """
    Parser genérico - detecta banco automaticamente
    """
    path = Path(pdf_path)
    filename = path.name.lower()
    
    # Detecta banco pelo nome do arquivo
    if bank == 'auto':
        if 'bradesco' in filename:
            bank = 'bradesco'
        elif 'nubank' in filename:
            bank = 'nubank'
        elif 'itau' in filename or 'itaú' in filename:
            bank = 'itau'
        elif 'inter' in filename:
            bank = 'inter'
        else:
            bank = 'bradesco'  # default
    
    # Chama parser específico
    if bank == 'bradesco':
        return parse_bradesco_pdf(pdf_path)
    else:
        # Por enquanto só Bradesco implementado
        return parse_bradesco_pdf(pdf_path)


def transactions_to_dataframe(transactions: List[Dict]) -> pd.DataFrame:
    """Converte lista de transações para DataFrame"""
    if not transactions:
        return pd.DataFrame(columns=['data', 'descricao', 'valor', 'categoria', 'conta', 'tipo_conta', 'parcelas'])
    
    return pd.DataFrame(transactions)


# === TEST ===
if __name__ == '__main__':
    import sys
    
    if len(sys.argv) > 1:
        pdf_path = sys.argv[1]
    else:
        pdf_path = r'G:\Meu Drive\Projetos\Dash\arquivos\Bradesco_Fatura-Sat Jan 31 2026 22 45 46 GMT-0300 (Horário Padrão de Brasília).pdf'
    
    print(f"Parsing: {pdf_path}")
    print("="*60)
    
    transactions = parse_pdf(pdf_path)
    
    print(f"\nFound {len(transactions)} transactions:\n")
    
    df = transactions_to_dataframe(transactions)
    print(df.to_string(index=False))
    
    print("\n\nBy Category:")
    print(df.groupby('categoria')['valor'].agg(['count', 'sum']))

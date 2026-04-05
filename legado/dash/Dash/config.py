import os

# Base Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = BASE_DIR

# Tab Names (Google Sheets)
TAB_ASSETS = 'meus_ativos'
TAB_PROVENTOS = 'meus_proventos'
TAB_CAMBIO = 'cambio'
TAB_COMPOSICAO = 'composicao'
TAB_RENDA_FIXA = 'renda_fixa'
TAB_PTAX = 'p_tax' # Optional/Missing

# Business Rules
CURRENCY_FALLBACK = {'BRL': 1.0, 'USD': 5.50, 'EUR': 6.00}

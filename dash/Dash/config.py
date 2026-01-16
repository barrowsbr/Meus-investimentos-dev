import os

# Base Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = BASE_DIR

# File Names
FILE_ASSETS = os.path.join(DATA_DIR, 'meus_ativos.csv')
FILE_PROVENTOS = os.path.join(DATA_DIR, 'meus_proventos.csv')
FILE_CAMBIO = os.path.join(DATA_DIR, 'cambio.csv')
FILE_COMPOSICAO = os.path.join(DATA_DIR, 'composicao.csv')
FILE_RENDA_FIXA = os.path.join(DATA_DIR, 'renda_fixa.csv')
FILE_PTAX = os.path.join(DATA_DIR, 'ptax.csv')

# Business Rules
CURRENCY_FALLBACK = {'BRL': 1.0, 'USD': 5.50, 'EUR': 6.00}

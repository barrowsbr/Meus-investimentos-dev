
import pandas as pd
from datetime import datetime, timedelta
import random

def generate_mock_transactions():
    """Generates a realistic transaction history for testing."""
    categories = ['Alimentação', 'Transporte', 'Lazer', 'Assinaturas', 'Supermercado', 'Saúde', 'Outros']
    descriptions = {
        'Alimentação': ['Restaurante Japonês', 'Ifood', 'Padaria da Esquina', 'Burger King'],
        'Transporte': ['Uber Trip', 'Posto Ipiranga', 'Sem Parar', 'Estacionamento'],
        'Lazer': ['Netflix', 'Cinema', 'Steam Game', 'Bar do Zé'],
        'Assinaturas': ['Spotify', 'Amazon Prime', 'Youtube Premium'],
        'Supermercado': ['Carrefour', 'Pão de Açúcar', 'Dia Market'],
        'Saúde': ['Drogasil', 'Consulta Médica', 'Academia'],
        'Outros': ['Amazon Compra', 'Mercado Livre']
    }
    
    data = []
    
    # Generate for last 3 months + future
    start_date = datetime.now() - timedelta(days=90)
    for i in range(120): # 4 months horizon
        d = start_date + timedelta(days=i)
        
        # Random daily transactions
        if random.random() > 0.3: # 70% chance of transaction
            num_tx = random.randint(1, 4)
            for _ in range(num_tx):
                cat = random.choice(categories)
                desc = random.choice(descriptions[cat])
                amt = round(random.uniform(20, 500), 2)
                installments = 1
                
                # Occasional high ticket item with installments
                if random.random() > 0.95:
                    amt = round(random.uniform(1000, 5000), 2)
                    installments = random.randint(2, 10)
                    desc = f"{desc} (Compra Grande)"
                
                data.append({
                    'date': d.strftime('%Y-%m-%d'),
                    'description': desc,
                    'category': cat,
                    'amount': amt,
                    'installments': installments
                })
                
    return pd.DataFrame(data)

def get_finance_data():
    """Wrapper to get data (Mock for now, easy to swap for DataProvider later)"""
    return generate_mock_transactions()

"""
Diagnostic script to compare Composição vs Performance RF values
Run: python diagnose_rf.py
"""
import sys
import os
sys.path.insert(0, os.getcwd())

import pandas as pd
from datetime import datetime

# Load data using same functions as the pages
from core.data.loader import load_fixed_income, load_fixed_income_manual, load_assets, load_proventos
from core.finance import summarize_fixed_income_hybrid, summarize_fixed_income
from core.data.market import fetch_market_data

print("=" * 60)
print("DIAGNOSTIC: Composição vs Performance RF Values")
print("=" * 60)

# 1. Load raw data
df_rf_raw = load_fixed_income()
df_rf_manual = load_fixed_income_manual()
df_proventos = load_proventos()
df_assets = load_assets()

print(f"\n[1] RAW RF TRANSACTIONS: {len(df_rf_raw)} rows")
if not df_rf_raw.empty:
    print(df_rf_raw[['Ticker', 'Tipo', 'Valor', 'Moeda']].to_string())

print(f"\n[2] MANUAL RF BALANCES: {len(df_rf_manual)} rows")
if not df_rf_manual.empty:
    print(df_rf_manual.to_string())

# 2. Calculate Composição total (using summarize_fixed_income_hybrid)
print("\n" + "=" * 60)
print("[3] COMPOSIÇÃO CALCULATION (summarize_fixed_income_hybrid)")
print("=" * 60)

if not df_rf_raw.empty:
    if df_rf_manual.empty:
        df_rf_composicao = summarize_fixed_income(df_rf_raw)
    else:
        df_rf_composicao = summarize_fixed_income_hybrid(df_rf_manual, df_rf_raw, df_proventos)
    
    print("\nRF Summary from Composição:")
    print(df_rf_composicao[['Ticker', 'Atual', 'Moeda']].to_string())
    
    # Get FX rates
    tickers_cambio = ['BRL=X', 'EURBRL=X']
    mapa_precos, _ = fetch_market_data(tickers_cambio)
    usd = mapa_precos.get('BRL=X', 5.50)
    
    print(f"\nUSD Rate: {usd}")
    
    # Calculate total in BRL
    total_brl = 0
    for _, row in df_rf_composicao.iterrows():
        valor = row['Atual']
        moeda = row.get('Moeda', 'BRL')
        if moeda == 'USD':
            valor_brl = valor * usd
        else:
            valor_brl = valor
        total_brl += valor_brl
        print(f"  {row['Ticker']}: {valor:.2f} {moeda} = R$ {valor_brl:.2f}")
    
    print(f"\n>>> TOTAL RF (Composição): R$ {total_brl:,.2f}")
else:
    total_brl = 0
    print("No RF data")

# 3. Calculate RV total
print("\n" + "=" * 60)
print("[4] RV CALCULATION")
print("=" * 60)

from core.finance import calcular_carteira_fechada
if not df_assets.empty:
    df_posicao, _ = calcular_carteira_fechada(df_assets)
    
    # Get all prices
    tickers = df_posicao['Ticker'].unique().tolist() + ['BRL=X']
    mapa_precos, _ = fetch_market_data(tickers)
    usd = mapa_precos.get('BRL=X', 5.50)
    
    total_rv = 0
    for _, row in df_posicao.iterrows():
        if row['Qtd'] <= 0:
            continue
        ticker = row['Ticker']
        qtd = row['Qtd']
        preco = mapa_precos.get(ticker, row['PM_Origem'])
        moeda = row['Moeda']
        
        if preco <= 0:
            preco = row['PM_Origem']
        
        fator = usd if moeda == 'USD' else 1.0
        valor_brl = qtd * preco * fator
        total_rv += valor_brl
        print(f"  {ticker}: {qtd:.4f} x {preco:.2f} {moeda} = R$ {valor_brl:,.2f}")
    
    print(f"\n>>> TOTAL RV: R$ {total_rv:,.2f}")
else:
    total_rv = 0
    print("No RV data")

# 4. Compare with manual_rf_values used in Performance
print("\n" + "=" * 60)
print("[5] MANUAL RF VALUES (as sent to engine)")
print("=" * 60)

if not df_rf_manual.empty:
    manual_rf_values = {}
    for _, row in df_rf_manual.iterrows():
        ticker = str(row.get('Ticker', 'Unknown')).upper()
        atual = float(row.get('Atual', 0))
        if atual > 0:
            manual_rf_values[ticker] = atual
    
    print("manual_rf_values dict:")
    for k, v in manual_rf_values.items():
        print(f"  {k}: R$ {v:,.2f}")
    print(f"\n>>> SUM of manual_rf_values: R$ {sum(manual_rf_values.values()):,.2f}")

# 5. Summary
print("\n" + "=" * 60)
print("[SUMMARY]")
print("=" * 60)
print(f"RV Total:               R$ {total_rv:,.2f}")
print(f"RF Total (Composição):  R$ {total_brl:,.2f}")
print(f"EXPECTED TOTAL:         R$ {total_rv + total_brl:,.2f}")
print(f"Performance shows:      R$ 199,338")
print(f"Difference:             R$ {199338 - (total_rv + total_brl):,.2f}")

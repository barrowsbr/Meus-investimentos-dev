"""
Debug script to compare RF values between Composição and Performance
"""
import sys
import os
sys.path.append(os.getcwd())

import pandas as pd
from datetime import datetime, timedelta

# Load data the same way both pages do
from core.data.loader import load_fixed_income, load_fixed_income_manual, load_proventos
from core.finance import summarize_fixed_income_hybrid

print("="*60)
print("DEBUG: Comparing RF Values")
print("="*60)

# 1. Load raw data
df_rf_raw = load_fixed_income()
df_rf_manual = load_fixed_income_manual()
df_proventos = load_proventos()

print(f"\n1. RAW RF TRANSACTIONS: {len(df_rf_raw)} rows")
if not df_rf_raw.empty:
    print(df_rf_raw[['Ticker', 'Valor', 'Tipo', 'Moeda']].to_string())

print(f"\n2. MANUAL RF BALANCES: {len(df_rf_manual)} rows")
if not df_rf_manual.empty:
    print(df_rf_manual.to_string())

# 2. Calculate as Composição does
print("\n" + "="*60)
print("3. COMPOSIÇÃO CALCULATION (summarize_fixed_income_hybrid)")
print("="*60)

if not df_rf_raw.empty and not df_rf_manual.empty:
    df_rf_composicao = summarize_fixed_income_hybrid(df_rf_manual, df_rf_raw, df_proventos)
    print(df_rf_composicao[['Ticker', 'Investido', 'Atual', 'Moeda']].to_string())
    
    total_composicao = df_rf_composicao['Atual'].sum()
    print(f"\n>>> TOTAL COMPOSIÇÃO RF: R$ {total_composicao:,.2f}")
else:
    total_composicao = 0
    print("No data to calculate")

# 3. Calculate as Performance does
print("\n" + "="*60)
print("4. PERFORMANCE CALCULATION (FixedIncomeEngine)")
print("="*60)

from core.fixed_income_engine import FixedIncomeEngine

# Build manual_rf_values dict (same as Performance page)
manual_rf_values = {}
if not df_rf_manual.empty:
    for _, row in df_rf_manual.iterrows():
        t = str(row['Ticker']).strip().upper()
        v = float(row.get('Atual', 0))
        if pd.notna(v) and v > 0:
            manual_rf_values[t] = v

print(f"Manual RF Values dict: {manual_rf_values}")
print(f">>> TOTAL Manual dict: R$ {sum(manual_rf_values.values()):,.2f}")

# Run engine
rf_engine = FixedIncomeEngine(df_rf_raw, manual_values=manual_rf_values)
rf_result = rf_engine.build_daily_curve()

if not rf_result.daily_curve.empty:
    rf_total_engine = rf_result.daily_curve['total'].iloc[-1]
    print(f"\n>>> TOTAL ENGINE RF: R$ {rf_total_engine:,.2f}")
else:
    rf_total_engine = 0
    print("Engine curve is empty!")

# 4. Summary
print("\n" + "="*60)
print("5. SUMMARY")
print("="*60)
print(f"Composição RF Total:  R$ {total_composicao:,.2f}")
print(f"Performance RF Total: R$ {rf_total_engine:,.2f}")
print(f"Difference:           R$ {total_composicao - rf_total_engine:,.2f}")
print("="*60)

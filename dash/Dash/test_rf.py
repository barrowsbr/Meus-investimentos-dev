import sys
sys.path.insert(0, r'g:\Meu Drive\Finanças\Investimentos\Meus-investimentos\dash\Dash')

from core.fixed_income_engine import FixedIncomeEngine
import pandas as pd

# Dados do usuário
df_test = pd.DataFrame({
    'Compra': [
        '2023-06-26', '2024-12-06', '2024-12-06',
        '2023-08-04',
        '2024-04-22',
        '2026-01-01',
    ],
    'Ticker': [
        'CDB BMG', 'CDB BMG', 'CDB BMG',
        'CDB BCO Master pos',
        'NTN-B',
        'Caixa',
    ],
    'Tipo': [
        'Compra', 'Venda', 'Imposto',
        'Compra',
        'Compra',
        'Compra',
    ],
    'Valor': [5000.09, 5943.28, 165.06, 6000, 8753.53, 24000]
})

engine = FixedIncomeEngine(df_test)
result = engine.build_daily_curve()

print('=== RESULTADO DO MOTOR RF v5.0 ===')
print(f'Encerrados: {len(engine.closed_positions)}')
for cp in engine.closed_positions:
    print(f'  {cp.ticker}: {cp.total_return_pct:.2f}% total')

print(f'Abertos: {len(engine.open_positions_data)}')
for t, d in engine.open_positions_data.items():
    vi = d["valor_inicial"]
    va = d["valor_atual"]
    tr = d["total_return"] * 100
    print(f'  {t}: R$ {vi:,.2f} -> R$ {va:,.2f} ({tr:.1f}%)')

print(f'\nRetorno Total RF: {result.total_return_pct:.2f}%')
print(f'Hipotese: {result.hypothesis_note}')

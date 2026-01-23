"""
Diagnóstico do TWR para NVIDIA - Ver dados enviados ao motor
"""
import sys
sys.path.insert(0, r'g:\Meu Drive\Finanças\Investimentos\Meus-investimentos\dash\Dash')

import pandas as pd
from datetime import datetime, timedelta
from core.data_loader import load_assets, load_proventos
from core.market_data import fetch_historical_data
from core.engine import reconstruct_history
from core.twr_canonical import calculate_canonical_twr, DEFAULT_PREMISES

print("=" * 70)
print(" DIAGNÓSTICO: NVIDIA TWR - Dados enviados ao motor")
print("=" * 70)

# 1. Carregar dados
df_bruto = load_assets()
df_proventos = load_proventos()

# 2. Filtrar NVIDIA
nvda = df_bruto[df_bruto['ticker'].str.contains('NVDA|NVIDIA', case=False, na=False)]
prov_nvda = df_proventos[df_proventos['ticker'].str.contains('NVDA|NVIDIA', case=False, na=False)] if not df_proventos.empty else pd.DataFrame()

print(f"\n[1] TRANSAÇÕES NVIDIA: {len(nvda)}")
if not nvda.empty:
    print(nvda[['data', 'ticker', 'tipo', 'quantidade', 'preco', 'moeda']].to_string())

print(f"\n[2] PROVENTOS NVIDIA: {len(prov_nvda)}")
if not prov_nvda.empty:
    print(prov_nvda[['data', 'ticker', 'valor', 'moeda']].to_string())

# 3. Buscar histórico de preços
if not nvda.empty:
    tickers = ['NVDA', 'BRL=X']
    data_inicio = nvda['data'].min()
    print(f"\n[3] Buscando preços desde {data_inicio.date()}...")
    df_prices = fetch_historical_data(tickers, data_inicio)
    
    # 4. Reconstruir histórico (apenas NVIDIA)
    print(f"\n[4] Reconstruindo histórico NVIDIA...")
    v_pat, v_flux, v_income, v_force_zero, extra_data = reconstruct_history(
        df_bruto=nvda,
        df_proventos=prov_nvda,
        days_lookback=365,
        df_prices_external=df_prices,
        df_rf_raw=pd.DataFrame()
    )
    
    if not v_pat.empty:
        print(f"\n[5] SÉRIE DE PATRIMÔNIO (últimos 10 dias):")
        print(f"    Primeiro dia: {v_pat.index[0].date()} = R$ {v_pat.iloc[0]:,.2f}")
        print(f"    Último dia: {v_pat.index[-1].date()} = R$ {v_pat.iloc[-1]:,.2f}")
        
        print(f"\n[6] SÉRIE DE FLUXOS (não-zero):")
        fluxos_nz = v_flux[v_flux != 0]
        for idx, val in fluxos_nz.items():
            print(f"    {idx.date()}: R$ {val:,.2f}")
        
        print(f"\n[7] SÉRIE DE INCOME (não-zero):")
        income_nz = v_income[v_income != 0]
        for idx, val in income_nz.items():
            print(f"    {idx.date()}: R$ {val:,.2f}")
        
        # 5. Calcular TWR
        df_engine = pd.DataFrame({
            'nav': v_pat,
            'flow': v_flux,
            'income': v_income
        })
        
        result = calculate_canonical_twr(df_engine, DEFAULT_PREMISES)
        
        print(f"\n[8] RESULTADO TWR:")
        print(f"    TWR Total: {result.total_twr:.2%}")
        print(f"    TWR Anualizado: {result.annualized_twr:.2%}")
        print(f"    Total Flow: R$ {result.total_flow:,.2f}")
        print(f"    Total Income: R$ {result.total_income:,.2f}")
        print(f"    Total PnL: R$ {result.total_pnl:,.2f}")
        
        # 6. Mostrar subperíodos suspeitos
        print(f"\n[9] SUBPERÍODOS COM RETORNO EXTREMO (>5%):")
        for sp in result.sub_periods:
            if abs(sp.daily_return) > 0.05:
                print(f"    {sp.date}: {sp.daily_return:.2%} - NAV {sp.nav_start:.0f} -> {sp.nav_end:.0f}, Flow={sp.flow:.0f}, Notes={sp.notes}")
    else:
        print("   Série de patrimônio vazia!")

print("\n" + "=" * 70)

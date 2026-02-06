"""
Script de Validação do Custo Médio de Câmbio (FX Cost Basis)
============================================================
Este script permite verificar se o cálculo do preço médio de remessas
está funcionando corretamente.

Execute com: python validate_fx_cost.py
"""

import pandas as pd
import sys
from datetime import datetime

# Adicionar o diretório ao path
sys.path.insert(0, '.')

from core.data.loader import load_cambio
from core.fx_cost_basis import (
    build_fx_cost_series, 
    get_latest_cost_basis, 
    get_cost_basis_summary,
    calculate_period_costs
)


def format_currency(value, currency='BRL'):
    """Formata valor como moeda."""
    if pd.isna(value) or value == 0:
        return "-"
    if currency == 'BRL':
        return f"R$ {value:,.2f}"
    return f"{value:,.4f}"


def main():
    print("=" * 70)
    print("VALIDACAO DO CUSTO MEDIO DE CAMBIO (FX COST BASIS)")
    print("=" * 70)
    print()
    
    # 1. Carregar dados de cambio
    print("[*] Carregando dados de cambio...")
    df_cambio = load_cambio()
    
    if df_cambio.empty:
        print("[X] Nenhum dado de cambio encontrado!")
        return
    
    print(f"[OK] {len(df_cambio)} remessas carregadas\n")
    
    # 2. Mostrar todas as remessas
    print("=" * 70)
    print("HISTORICO DE REMESSAS")
    print("=" * 70)
    
    cols_show = ['data', 'moeda_origem', 'moeda_destino', 'valor_origem', 'valor_destino', 'taxa']
    cols_available = [c for c in cols_show if c in df_cambio.columns]
    
    df_display = df_cambio[cols_available].copy()
    if 'data' in df_display.columns:
        df_display['data'] = pd.to_datetime(df_display['data']).dt.strftime('%d/%m/%Y')
    
    # Calcular taxa implícita para cada remessa
    if 'valor_origem' in df_display.columns and 'valor_destino' in df_display.columns:
        df_display['Taxa Implícita'] = df_cambio['valor_origem'] / df_cambio['valor_destino']
        df_display['Taxa Implícita'] = df_display['Taxa Implícita'].round(4)
    
    print(df_display.to_string(index=False))
    print()
    
    # 3. Sumario por moeda
    print("=" * 70)
    print("SUMARIO POR MOEDA")
    print("=" * 70)
    
    summary = get_cost_basis_summary(df_cambio)
    if not summary.empty:
        print(summary.to_string(index=False))
    else:
        print("Sem dados para sumário")
    print()
    
    # 4. Custo medio atual (latest)
    print("=" * 70)
    print("CUSTO MEDIO ATUAL (ACUMULADO)")
    print("=" * 70)
    
    latest_costs = get_latest_cost_basis(df_cambio)
    for currency, cost in latest_costs.items():
        if not pd.isna(cost):
            print(f"  {currency}: R$ {cost:.4f} por unidade")
    print()
    
    # 5. Verificacao detalhada - recalcular manualmente
    print("=" * 70)
    print("VALIDACAO MANUAL (RECALCULO)")
    print("=" * 70)
    
    for currency in ['USD', 'EUR', 'CAD']:
        print(f"\n--- {currency} ---")
        
        # Filtrar remessas BRL -> Currency
        mask = (df_cambio['moeda_destino'].astype(str).str.upper() == currency)
        if 'moeda_origem' in df_cambio.columns:
            mask &= (df_cambio['moeda_origem'].astype(str).str.upper() == 'BRL')
        
        df_curr = df_cambio[mask].copy()
        
        if df_curr.empty:
            print(f"  Nenhuma remessa BRL -> {currency}")
            continue
        
        # Ordenar por data
        df_curr = df_curr.sort_values('data')
        
        # Calcular progressivamente
        total_brl = 0.0
        total_foreign = 0.0
        
        print(f"\n  {'Data':<12} {'BRL Enviado':>15} {'Recebido':>12} {'Taxa':>8} {'Custo Médio Acum.':>18}")
        print("  " + "-" * 68)
        
        for _, row in df_curr.iterrows():
            val_origem = float(row.get('valor_origem', 0))
            val_destino = float(row.get('valor_destino', 0))
            data_str = pd.to_datetime(row['data']).strftime('%d/%m/%Y')
            taxa = val_origem / val_destino if val_destino > 0 else 0
            
            total_brl += val_origem
            total_foreign += val_destino
            custo_medio = total_brl / total_foreign if total_foreign > 0 else 0
            
            print(f"  {data_str:<12} R$ {val_origem:>12,.2f} {val_destino:>10,.2f} {taxa:>8.4f} R$ {custo_medio:>15.4f}")
        
        print("  " + "-" * 68)
        print(f"  {'TOTAL':<12} R$ {total_brl:>12,.2f} {total_foreign:>10,.2f} {'':>8} R$ {total_brl/total_foreign:>15.4f}")
        
        # Comparar com função
        expected = latest_costs.get(currency, 0)
        calculated = total_brl / total_foreign if total_foreign > 0 else 0
        
        print(f"\n  Custo médio calculado manualmente: R$ {calculated:.4f}")
        print(f"  Custo médio da função:             R$ {expected:.4f}")
        
        if abs(calculated - expected) < 0.001:
            print("  [OK] VALIDACAO OK - Valores conferem!")
        else:
            print(f"  [X] DIVERGENCIA! Diferenca: R$ {abs(calculated - expected):.4f}")
    
    # 6. Serie temporal (ultimos 6 meses)
    print("\n" + "=" * 70)
    print("EVOLUCAO DO CUSTO MEDIO (ULTIMOS 6 MESES)")
    print("=" * 70)
    
    # Criar índice de datas
    end_date = datetime.now()
    start_date = end_date - pd.DateOffset(months=6)
    idx = pd.date_range(start=start_date, end=end_date, freq='MS')  # Início de cada mês
    
    cost_series = build_fx_cost_series(df_cambio, idx)
    
    print(f"\n  {'Mês':<12} {'USD':>12} {'EUR':>12} {'CAD':>12}")
    print("  " + "-" * 50)
    
    for dt in idx:
        usd = cost_series.get('USD', pd.Series()).get(dt, float('nan'))
        eur = cost_series.get('EUR', pd.Series()).get(dt, float('nan'))
        cad = cost_series.get('CAD', pd.Series()).get(dt, float('nan'))
        
        usd_str = f"R$ {usd:.4f}" if not pd.isna(usd) else "-"
        eur_str = f"R$ {eur:.4f}" if not pd.isna(eur) else "-"
        cad_str = f"R$ {cad:.4f}" if not pd.isna(cad) else "-"
        
        print(f"  {dt.strftime('%b/%Y'):<12} {usd_str:>12} {eur_str:>12} {cad_str:>12}")
    
    print("\n" + "=" * 70)
    print("FIM DA VALIDAÇÃO")
    print("=" * 70)


if __name__ == "__main__":
    main()

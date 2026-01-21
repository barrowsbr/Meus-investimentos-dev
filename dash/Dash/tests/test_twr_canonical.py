"""
Testes Canonicos de TWR
=======================

Estes testes sao IMUTAVEIS e definem o comportamento CORRETO do sistema.
Se algum destes testes falhar, a implementacao esta QUEBRADA.

REGRA: Nenhum destes testes pode ser modificado sem revisao formal.
       Eles representam a definicao matematica do TWR.

Executar com: python tests/test_twr_canonical.py
"""

import sys
import os

# Adiciona o diretorio raiz ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
import numpy as np
from core.twr_canonical import (
    calculate_canonical_twr,
    FlowTiming,
    IncomePolicy,
    RFValuationMode,
    TWRPremises,
    DEFAULT_PREMISES,
    CanonicalTWRResult
)


def run_all_tests():
    """Executa todos os testes canonicos."""
    all_passed = True
    
    print("=" * 60)
    print("TESTES CANONICOS DE TWR")
    print("=" * 60)
    
    # =========================================================================
    # TESTE 1: Retorno Simples (Baseline)
    # =========================================================================
    print("\n[Teste 1] Retorno Simples 10%")
    print("  Cenario: R$100 -> R$110 sem fluxo intermediario")
    
    df = pd.DataFrame({
        'nav': [100.0, 110.0],
        'flow': [100.0, 0.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02']))
    
    result = calculate_canonical_twr(df)
    
    if abs(result.total_twr - 0.10) < 1e-6:
        print(f"  [OK] PASSOU: TWR = {result.total_twr:.4%}")
    else:
        print(f"  [ERRO] FALHOU: Esperado 10%, obtido {result.total_twr:.4%}")
        all_passed = False
    
    # =========================================================================
    # TESTE 2: Aporte Neutro
    # =========================================================================
    print("\n[Teste 2] Aporte Neutro = 0%")
    print("  Cenario: R$100 + Aporte R$100 = R$200, mercado parado")
    
    df = pd.DataFrame({
        'nav': [100.0, 200.0],
        'flow': [100.0, 100.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02']))
    
    result = calculate_canonical_twr(df)
    
    if abs(result.total_twr - 0.0) < 1e-6:
        print(f"  [OK] PASSOU: TWR = {result.total_twr:.4%}")
    else:
        print(f"  [ERRO] FALHOU: Esperado 0%, obtido {result.total_twr:.4%}")
        all_passed = False
    
    # =========================================================================
    # TESTE 3: Dividendo Compensa Queda
    # =========================================================================
    print("\n[Teste 3] Queda de Preco + Dividendo = 0%")
    print("  Cenario: NAV cai R$100 -> R$90, mas recebeu R$10 de dividendo")
    
    df = pd.DataFrame({
        'nav': [100.0, 90.0],
        'flow': [100.0, 0.0],
        'income': [0.0, 10.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02']))
    
    result = calculate_canonical_twr(df)
    
    if abs(result.total_twr - 0.0) < 1e-6:
        print(f"  [OK] PASSOU: TWR = {result.total_twr:.4%}")
    else:
        print(f"  [ERRO] FALHOU: Esperado 0%, obtido {result.total_twr:.4%}")
        all_passed = False
    
    # =========================================================================
    # TESTE 4: Dividendo Gera Retorno Positivo
    # =========================================================================
    print("\n[Teste 4] Preco Estavel + Dividendo = Retorno Positivo")
    print("  Cenario: NAV estavel R$100, dividendo R$5")
    
    df = pd.DataFrame({
        'nav': [100.0, 100.0],
        'flow': [100.0, 0.0],
        'income': [0.0, 5.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02']))
    
    result = calculate_canonical_twr(df)
    
    if abs(result.total_twr - 0.05) < 1e-6:
        print(f"  [OK] PASSOU: TWR = {result.total_twr:.4%}")
    else:
        print(f"  [ERRO] FALHOU: Esperado 5%, obtido {result.total_twr:.4%}")
        all_passed = False
    
    # =========================================================================
    # TESTE 5: Encadeamento Geometrico (21%)
    # =========================================================================
    print("\n[Teste 5] Encadeamento Geometrico")
    print("  Cenario: D0=100, D1=110(+10%), D2=220(+100 aporte), D3=242(+10%)")
    
    df = pd.DataFrame({
        'nav': [100.0, 110.0, 220.0, 242.0],
        'flow': [100.0, 0.0, 110.0, 0.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04']))
    
    result = calculate_canonical_twr(df)
    
    if abs(result.total_twr - 0.21) < 1e-6:
        print(f"  [OK] PASSOU: TWR = {result.total_twr:.4%}")
    else:
        print(f"  [ERRO] FALHOU: Esperado 21%, obtido {result.total_twr:.4%}")
        all_passed = False
    
    # =========================================================================
    # TESTE 6: Determinismo
    # =========================================================================
    print("\n[Teste 6] Determinismo")
    print("  Cenario: Mesmo input deve produzir mesmo output")
    
    result_a = calculate_canonical_twr(df)
    result_b = calculate_canonical_twr(df)
    
    if result_a.total_twr == result_b.total_twr:
        print(f"  [OK] PASSOU: Resultados identicos")
    else:
        print(f"  [ERRO] FALHOU: Resultados diferentes ({result_a.total_twr} vs {result_b.total_twr})")
        all_passed = False
    
    # =========================================================================
    # TESTE 7: Proventos Nao Sao Fluxo
    # =========================================================================
    print("\n[Teste 7] Proventos Nao Sao Fluxo")
    print("  Cenario: Provento como income vs como flow deve ser diferente")
    
    # Com provento como income (correto)
    df_correto = pd.DataFrame({
        'nav': [100.0, 100.0],
        'flow': [100.0, 0.0],
        'income': [0.0, 10.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02']))
    
    # Com provento como flow (ERRADO - simulacao)
    df_errado = pd.DataFrame({
        'nav': [100.0, 110.0],
        'flow': [100.0, 10.0],
        'income': [0.0, 0.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02']))
    
    result_correto = calculate_canonical_twr(df_correto)
    result_errado = calculate_canonical_twr(df_errado)
    
    if abs(result_correto.total_twr - 0.10) < 1e-6 and \
       abs(result_errado.total_twr - 0.0) < 1e-6 and \
       result_correto.total_twr != result_errado.total_twr:
        print(f"  [OK] PASSOU: Income={result_correto.total_twr:.2%}, Flow={result_errado.total_twr:.2%}")
    else:
        print(f"  [ERRO] FALHOU")
        all_passed = False
    
    # =========================================================================
    # TESTE 8: Timing EOD vs SOD
    # =========================================================================
    print("\n[Teste 8] Timing EOD vs SOD")
    print("  Cenario: Grande aporte com ganho - timing afeta resultado")
    
    df = pd.DataFrame({
        'nav': [100.0, 1110.0],
        'flow': [100.0, 1000.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02']))
    
    result_eod = calculate_canonical_twr(df, TWRPremises(
        flow_timing_default=FlowTiming.END_OF_DAY
    ))
    
    result_sod = calculate_canonical_twr(df, TWRPremises(
        flow_timing_default=FlowTiming.START_OF_DAY
    ))
    
    if abs(result_eod.total_twr - 0.10) < 1e-6 and \
       abs(result_sod.total_twr - (10/1100)) < 1e-6 and \
       result_eod.total_twr > result_sod.total_twr:
        print(f"  [OK] PASSOU: EOD={result_eod.total_twr:.2%}, SOD={result_sod.total_twr:.2%}")
    else:
        print(f"  [ERRO] FALHOU")
        all_passed = False
    
    # =========================================================================
    # TESTE 9: Premissas Default Documentadas
    # =========================================================================
    print("\n[Teste 9] Premissas Default Documentadas")
    
    if DEFAULT_PREMISES.flow_timing_default == FlowTiming.END_OF_DAY and \
       DEFAULT_PREMISES.income_policy == IncomePolicy.INCLUDE and \
       DEFAULT_PREMISES.rf_valuation_mode == RFValuationMode.CURVA_PROXY:
        print(f"  [OK] PASSOU: Premissas conforme esperado")
    else:
        print(f"  [ERRO] FALHOU")
        all_passed = False
    
    # =========================================================================
    # TESTE 10: Resultado Contem Premissas Usadas
    # =========================================================================
    print("\n[Teste 10] Resultado Contem Premissas Usadas")
    
    df = pd.DataFrame({
        'nav': [100.0, 110.0],
        'flow': [100.0, 0.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02']))
    
    result = calculate_canonical_twr(df)
    
    if result.premises_used is not None and \
       result.premises_used.flow_timing_default == FlowTiming.END_OF_DAY:
        print(f"  [OK] PASSOU: Premissas presentes no resultado")
    else:
        print(f"  [ERRO] FALHOU")
        all_passed = False
    
    # =========================================================================
    # TESTE 11: Resgate Parcial
    # =========================================================================
    print("\n[Teste 11] Resgate Parcial")
    print("  Cenario: R$200 -> Resgate R$100 -> R$105 (+5% sobre R$100)")
    
    df = pd.DataFrame({
        'nav': [200.0, 100.0, 105.0],
        'flow': [200.0, -100.0, 0.0]  # Resgate de R$100
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02', '2024-01-03']))
    
    result = calculate_canonical_twr(df)
    # Dia 1: (100 - 200 - (-100)) / 200 = 0% 
    # Dia 2: (105 - 100 - 0) / 100 = 5%
    # TWR = (1 + 0) * (1 + 0.05) - 1 = 5%
    
    if abs(result.total_twr - 0.05) < 1e-6:
        print(f"  [OK] PASSOU: TWR = {result.total_twr:.4%}")
    else:
        print(f"  [ERRO] FALHOU: Esperado 5%, obtido {result.total_twr:.4%}")
        all_passed = False
    
    # =========================================================================
    # TESTE 12: Retorno Negativo
    # =========================================================================
    print("\n[Teste 12] Retorno Negativo")
    print("  Cenario: R$100 -> R$80 (perda de 20%)")
    
    df = pd.DataFrame({
        'nav': [100.0, 80.0],
        'flow': [100.0, 0.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02']))
    
    result = calculate_canonical_twr(df)
    
    if abs(result.total_twr - (-0.20)) < 1e-6:
        print(f"  [OK] PASSOU: TWR = {result.total_twr:.4%}")
    else:
        print(f"  [ERRO] FALHOU: Esperado -20%, obtido {result.total_twr:.4%}")
        all_passed = False
    
    # =========================================================================
    # TESTE 13: Multiplos Aportes
    # =========================================================================
    print("\n[Teste 13] Multiplos Aportes Consecutivos")
    print("  Cenario: 100, +100(200), +100(300), +50% = 450")
    
    df = pd.DataFrame({
        'nav': [100.0, 200.0, 300.0, 450.0],
        'flow': [100.0, 100.0, 100.0, 0.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04']))
    
    result = calculate_canonical_twr(df)
    # Dia 1: (200 - 100 - 100) / 100 = 0%
    # Dia 2: (300 - 200 - 100) / 200 = 0%
    # Dia 3: (450 - 300 - 0) / 300 = 50%
    # TWR = (1 + 0) * (1 + 0) * (1 + 0.50) - 1 = 50%
    
    if abs(result.total_twr - 0.50) < 1e-6:
        print(f"  [OK] PASSOU: TWR = {result.total_twr:.4%}")
    else:
        print(f"  [ERRO] FALHOU: Esperado 50%, obtido {result.total_twr:.4%}")
        all_passed = False
    
    # =========================================================================
    # TESTE 14: Volatilidade e Max Drawdown
    # =========================================================================
    print("\n[Teste 14] Calculo de Max Drawdown")
    print("  Cenario: 100 -> 120 -> 90 -> 100 (drawdown -25%)")
    
    df = pd.DataFrame({
        'nav': [100.0, 120.0, 90.0, 100.0],
        'flow': [100.0, 0.0, 0.0, 0.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04']))
    
    result = calculate_canonical_twr(df)
    # Max drawdown: do pico 120 caiu para 90 = -25%
    
    if abs(result.max_drawdown - (-0.25)) < 1e-6:
        print(f"  [OK] PASSOU: Max DD = {result.max_drawdown:.4%}")
    else:
        print(f"  [ERRO] FALHOU: Esperado -25%, obtido {result.max_drawdown:.4%}")
        all_passed = False
    
    # =========================================================================
    # TESTE 15: Capital Minimo (Edge Case)
    # =========================================================================
    print("\n[Teste 15] Capital Minimo (Edge Case)")
    print("  Cenario: Capital < R$100 deve retornar 0%")
    
    df = pd.DataFrame({
        'nav': [50.0, 55.0],  # Capital abaixo do minimo
        'flow': [50.0, 0.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02']))
    
    result = calculate_canonical_twr(df)
    # Capital abaixo do minimo (R$100), retorno deve ser 0
    
    if abs(result.total_twr - 0.0) < 1e-6:
        print(f"  [OK] PASSOU: TWR = {result.total_twr:.4%} (zerado por capital minimo)")
    else:
        print(f"  [ERRO] FALHOU: Esperado 0% (capital minimo), obtido {result.total_twr:.4%}")
        all_passed = False
    
    # =========================================================================
    # RESULTADO FINAL
    # =========================================================================
    print("\n" + "=" * 60)
    if all_passed:
        print("[OK] TODOS OS 15 TESTES CANONICOS PASSARAM")
    else:
        print("[ERRO] ALGUNS TESTES FALHARAM - IMPLEMENTACAO QUEBRADA")
    print("=" * 60)
    
    return all_passed


# =============================================================================
# Execucao standalone
# =============================================================================
if __name__ == "__main__":
    run_all_tests()

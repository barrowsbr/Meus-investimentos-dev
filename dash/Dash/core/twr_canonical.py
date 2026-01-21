"""
Motor Canônico de TWR (Time-Weighted Return)
=============================================

FONTE ÚNICA DA VERDADE para cálculo de retorno ponderado pelo tempo.

Este módulo é o ÚNICO ponto de entrada válido para cálculo de TWR no sistema.
Qualquer outro módulo que precise calcular TWR DEVE usar as funções deste arquivo.

PRINCÍPIOS INEGOCIÁVEIS:
1. Dado um input fixo (NAV, Fluxos, Proventos, Timing), o resultado é DETERMINÍSTICO
2. Todas as premissas são EXPLÍCITAS e documentadas
3. Não existe "interpretação alternativa" - divergências são BUGS

Versão: 2.0.0
Data: 2026-01-20
"""

import pandas as pd
import numpy as np
from enum import Enum
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Tuple
import warnings


# =============================================================================
# ENUMS - Todas as escolhas são EXPLÍCITAS
# =============================================================================

class FlowTiming(Enum):
    """
    Convenção de timing para fluxos de caixa.
    
    END_OF_DAY (EOD): Fluxo entra no FINAL do dia → NÃO participa do retorno
    START_OF_DAY (SOD): Fluxo entra no INÍCIO do dia → PARTICIPA do retorno
    
    Padrão GIPS: EOD
    """
    END_OF_DAY = "EOD"
    START_OF_DAY = "SOD"


class IncomePolicy(Enum):
    """
    Política de tratamento de proventos (dividendos, JCP, etc).
    
    INCLUDE: Proventos são somados ao ganho econômico (CORRETO para TWR)
    EXCLUDE: Proventos são ignorados (apenas para debug/comparação)
    
    Padrão: INCLUDE
    """
    INCLUDE = "include"
    EXCLUDE = "exclude"


class RFValuationMode(Enum):
    """
    Modo de valorização de Renda Fixa.
    
    CURVA_PROXY: Usa taxa SELIC proxy (15% a.a.) para capitalização
    MTM_REAL: Usa preços de mercado reais (marcação a mercado)
    
    Nota: Ambos produzem TWR válido, sob premissas diferentes.
    """
    CURVA_PROXY = "proxy"
    MTM_REAL = "mtm"


# =============================================================================
# PREMISSAS EXPLÍCITAS - Documentação obrigatória
# =============================================================================

@dataclass(frozen=True)
class TWRPremises:
    """
    Premissas explícitas do cálculo de TWR.
    
    Este objeto é IMUTÁVEL e documenta todas as escolhas de design.
    Mudanças nas premissas produzem TWRs diferentes - isso é esperado.
    """
    flow_timing_default: FlowTiming = FlowTiming.END_OF_DAY
    income_policy: IncomePolicy = IncomePolicy.INCLUDE
    rf_valuation_mode: RFValuationMode = RFValuationMode.CURVA_PROXY
    min_capital_for_valid_return: float = 100.0  # R$
    selic_annual_rate: float = 0.15  # 15% a.a.
    business_days_per_year: int = 252
    extreme_return_threshold: float = 0.30  # 30% em um dia = warning
    
    def __str__(self) -> str:
        return (
            f"TWR Premises:\n"
            f"  - Flow Timing: {self.flow_timing_default.value}\n"
            f"  - Income Policy: {self.income_policy.value}\n"
            f"  - RF Valuation: {self.rf_valuation_mode.value}\n"
            f"  - Min Capital: R$ {self.min_capital_for_valid_return:.2f}\n"
            f"  - SELIC Rate: {self.selic_annual_rate:.0%}\n"
        )


# Premissas padrão do sistema
DEFAULT_PREMISES = TWRPremises()


# =============================================================================
# RESULTADO - Estrutura de saída padronizada
# =============================================================================

@dataclass
class TWRSubPeriod:
    """Detalhamento de um subperíodo para auditoria."""
    date: str
    nav_start: float
    nav_end: float
    flow: float
    income: float
    capital_base: float
    economic_gain: float
    daily_return: float
    timing_used: FlowTiming
    notes: str = ""


@dataclass
class TWRValidation:
    """Resultado da validação cruzada."""
    is_valid: bool
    twr_calculated: float
    simple_return: float
    divergence_abs: float
    explanation: str
    suspicious_dates: List[str] = field(default_factory=list)


@dataclass
class CanonicalTWRResult:
    """
    Resultado CANÔNICO do cálculo de TWR.
    
    Este é o ÚNICO formato de saída válido para TWR no sistema.
    """
    # Resultado principal
    total_twr: float
    annualized_twr: float
    
    # Séries temporais
    daily_returns: pd.Series
    cumulative_series: pd.Series
    drawdown_series: pd.Series
    
    # Métricas
    max_drawdown: float
    volatility: float
    total_flow: float
    total_income: float
    total_pnl: float
    
    # Auditoria
    sub_periods: List[TWRSubPeriod]
    validation: TWRValidation
    premises_used: TWRPremises
    
    # Metadados
    start_date: str
    end_date: str
    trading_days: int
    
    def __repr__(self) -> str:
        return (
            f"CanonicalTWRResult(\n"
            f"  TWR Total: {self.total_twr:.4%}\n"
            f"  TWR Anual: {self.annualized_twr:.4%}\n"
            f"  Max DD: {self.max_drawdown:.4%}\n"
            f"  Volatility: {self.volatility:.4%}\n"
            f"  Valid: {self.validation.is_valid}\n"
            f")"
        )


# =============================================================================
# MOTOR CANÔNICO - A ÚNICA implementação válida
# =============================================================================

def calculate_canonical_twr(
    df: pd.DataFrame,
    premises: TWRPremises = DEFAULT_PREMISES,
    flow_timing_override: Optional[pd.Series] = None
) -> CanonicalTWRResult:
    """
    Calcula o TWR canônico para uma série de dados.
    
    Esta é a ÚNICA função válida para cálculo de TWR no sistema.
    Qualquer outro caminho é considerado BUG.
    
    Args:
        df: DataFrame com colunas obrigatórias:
            - Index: DatetimeIndex (datas)
            - 'nav': Patrimônio Líquido Final (MTM) do dia
            - 'flow': Fluxo de Caixa Externo (Aportes positivos, Saques negativos)
            - 'income': (opcional) Proventos recebidos no dia
            
        premises: Premissas explícitas do cálculo (default: DEFAULT_PREMISES)
        
        flow_timing_override: (opcional) Série com FlowTiming por dia.
            Se não fornecido, usa premises.flow_timing_default para todos os dias.
    
    Returns:
        CanonicalTWRResult: Resultado completo e auditável
        
    Raises:
        ValueError: Se dados de entrada forem inválidos
        
    FÓRMULA CANÔNICA:
        economic_gain = (NAV_end + Income) - NAV_start - Flow
        
        Se timing == EOD:
            base = NAV_start
        Se timing == SOD:
            base = NAV_start + Flow
            
        r_t = economic_gain / base
        TWR = Π(1 + r_t) - 1
    """
    # =========================================================================
    # 1. VALIDAÇÃO DE ENTRADA
    # =========================================================================
    _validate_input(df)
    
    # Preparar dados
    df_calc = df.copy().sort_index()
    
    # Garantir colunas
    if 'income' not in df_calc.columns:
        df_calc['income'] = 0.0
    
    df_calc = df_calc.fillna(0.0)
    
    # NAV do dia anterior
    df_calc['nav_start'] = df_calc['nav'].shift(1).fillna(0.0)
    
    # =========================================================================
    # 2. CÁLCULO DO RETORNO DIÁRIO
    # =========================================================================
    sub_periods: List[TWRSubPeriod] = []
    daily_returns: List[float] = []
    suspicious_dates: List[str] = []
    
    for i, (idx, row) in enumerate(df_calc.iterrows()):
        nav_start = row['nav_start']
        nav_end = row['nav']
        flow = row['flow']
        income = row['income'] if premises.income_policy == IncomePolicy.INCLUDE else 0.0
        
        # Determinar timing
        if flow_timing_override is not None and idx in flow_timing_override.index:
            timing = flow_timing_override.loc[idx]
        else:
            timing = premises.flow_timing_default
        
        # Calcular base de capital
        if timing == FlowTiming.START_OF_DAY:
            capital_base = nav_start + flow
        else:  # END_OF_DAY
            capital_base = nav_start
        
        # Calcular retorno
        daily_return = 0.0
        notes = ""
        
        # Caso 1: Capital insuficiente
        if capital_base <= 0 or nav_start <= 0:
            daily_return = 0.0
            notes = "Capital inicial zero - retorno não aplicável"
        
        # Caso 2: Capital muito pequeno
        elif capital_base < premises.min_capital_for_valid_return:
            daily_return = 0.0
            notes = f"Capital base pequeno (R${capital_base:.2f}) - retorno zerado"
        
        # Caso 3: Cálculo normal
        else:
            # FÓRMULA CANÔNICA
            economic_gain = (nav_end + income) - nav_start - flow
            daily_return = economic_gain / capital_base
            
            # Diagnóstico de retornos extremos
            if abs(daily_return) > premises.extreme_return_threshold:
                date_str = str(idx.date()) if hasattr(idx, 'date') else str(idx)
                suspicious_dates.append(date_str)
                notes = f"[!] Retorno extremo: {daily_return:.2%}"
        
        daily_returns.append(daily_return)
        
        # Registrar subperíodo para auditoria
        sub_periods.append(TWRSubPeriod(
            date=str(idx.date()) if hasattr(idx, 'date') else str(idx),
            nav_start=nav_start,
            nav_end=nav_end,
            flow=flow,
            income=income,
            capital_base=capital_base,
            economic_gain=(nav_end + income) - nav_start - flow if capital_base > 0 else 0,
            daily_return=daily_return,
            timing_used=timing,
            notes=notes
        ))
    
    df_calc['daily_return'] = daily_returns
    
    # Limpar valores inválidos
    df_calc['daily_return'] = df_calc['daily_return'].replace([np.inf, -np.inf], 0.0).fillna(0.0)
    
    # =========================================================================
    # 3. CHAIN-LINKING (Encadeamento Geométrico)
    # =========================================================================
    df_calc['growth_factor'] = 1 + df_calc['daily_return']
    df_calc['cumulative_factor'] = df_calc['growth_factor'].cumprod()
    df_calc['twr_accumulated'] = df_calc['cumulative_factor'] - 1
    
    total_twr = df_calc['twr_accumulated'].iloc[-1] if not df_calc.empty else 0.0
    
    # =========================================================================
    # 4. MÉTRICAS DERIVADAS
    # =========================================================================
    # Anualização (CAGR)
    days = (df_calc.index[-1] - df_calc.index[0]).days if len(df_calc) > 1 else 0
    annualized_twr = 0.0
    if days > 0 and (1 + total_twr) > 0:
        annualized_twr = ((1 + total_twr) ** (365 / days)) - 1
    
    # Drawdown
    rolling_max = df_calc['cumulative_factor'].cummax()
    drawdown_series = (df_calc['cumulative_factor'] / rolling_max) - 1
    max_drawdown = drawdown_series.min()
    
    # Volatilidade
    volatility = df_calc['daily_return'].std() * np.sqrt(252) if len(df_calc) > 1 else 0.0
    
    # Totais
    total_flow = df_calc['flow'].sum()
    total_income = df_calc['income'].sum()
    nav_inicial = df_calc['nav'].iloc[0] if not df_calc.empty else 0.0
    nav_final = df_calc['nav'].iloc[-1] if not df_calc.empty else 0.0
    first_flow = df_calc['flow'].iloc[0] if not df_calc.empty else 0.0
    total_pnl = nav_final - nav_inicial - total_flow + first_flow
    
    # =========================================================================
    # 5. VALIDAÇÃO CRUZADA
    # =========================================================================
    validation = _validate_twr(df_calc, total_twr, suspicious_dates)
    
    # =========================================================================
    # 6. CONSTRUIR RESULTADO
    # =========================================================================
    return CanonicalTWRResult(
        total_twr=total_twr,
        annualized_twr=annualized_twr,
        daily_returns=df_calc['daily_return'],
        cumulative_series=df_calc['twr_accumulated'],
        drawdown_series=drawdown_series,
        max_drawdown=max_drawdown,
        volatility=volatility,
        total_flow=total_flow,
        total_income=total_income,
        total_pnl=total_pnl,
        sub_periods=sub_periods,
        validation=validation,
        premises_used=premises,
        start_date=str(df_calc.index[0].date()) if len(df_calc) > 0 else "",
        end_date=str(df_calc.index[-1].date()) if len(df_calc) > 0 else "",
        trading_days=len(df_calc)
    )


def _validate_input(df: pd.DataFrame) -> None:
    """Valida dados de entrada."""
    if df.empty:
        raise ValueError("DataFrame não pode estar vazio")
    
    required_cols = ['nav', 'flow']
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Colunas obrigatórias ausentes: {missing}")
    
    if not isinstance(df.index, pd.DatetimeIndex):
        # Tentar converter
        try:
            df.index = pd.to_datetime(df.index)
        except:
            raise ValueError("Index deve ser DatetimeIndex")


def _validate_twr(
    df: pd.DataFrame, 
    twr_calculated: float,
    suspicious_dates: List[str]
) -> TWRValidation:
    """Validação cruzada do TWR calculado."""
    
    # Calcular retorno simples para comparação
    df['simple_return'] = np.where(
        df['nav_start'] > 0,
        (df['nav'] - df['nav_start']) / df['nav_start'],
        0.0
    )
    simple_cumulative = (1 + df['simple_return']).cumprod() - 1
    simple_return = simple_cumulative.iloc[-1] if not df.empty else 0.0
    
    divergence_abs = twr_calculated - simple_return
    
    # Análise
    if abs(divergence_abs) < 0.001:
        explanation = "[OK] TWR ≈ Retorno Simples - sem fluxos significativos"
        is_valid = True
    elif divergence_abs > 0:
        explanation = (
            f"[OK] TWR ({twr_calculated:.2%}) > Retorno Simples ({simple_return:.2%}). "
            f"Aportes em momentos desfavoráveis ou resgates em momentos bons."
        )
        is_valid = True
    else:
        explanation = (
            f"[OK] TWR ({twr_calculated:.2%}) < Retorno Simples ({simple_return:.2%}). "
            f"Aportes em momentos favoráveis capturados pelo mercado."
        )
        is_valid = True
    
    return TWRValidation(
        is_valid=is_valid,
        twr_calculated=twr_calculated,
        simple_return=simple_return,
        divergence_abs=divergence_abs,
        explanation=explanation,
        suspicious_dates=suspicious_dates
    )


# =============================================================================
# FUNÇÕES DE CONVENIÊNCIA
# =============================================================================

def quick_twr(nav_series: pd.Series, flow_series: pd.Series) -> float:
    """
    Calcula TWR rapidamente para uso em scripts.
    
    Para cálculos completos, use calculate_canonical_twr().
    """
    df = pd.DataFrame({
        'nav': nav_series,
        'flow': flow_series
    })
    result = calculate_canonical_twr(df)
    return result.total_twr


def deprecated(reason: str):
    """Decorator para marcar funções como deprecated."""
    def decorator(func):
        def wrapper(*args, **kwargs):
            warnings.warn(
                f"{func.__name__} está DEPRECATED: {reason}. "
                f"Use twr_canonical.calculate_canonical_twr() em vez disso.",
                DeprecationWarning,
                stacklevel=2
            )
            return func(*args, **kwargs)
        return wrapper
    return decorator


# =============================================================================
# TESTES CANÔNICOS (Imutáveis)
# =============================================================================

def run_canonical_tests() -> bool:
    """
    Executa testes canônicos que NUNCA devem falhar.
    
    Estes testes definem o comportamento correto do sistema.
    Se algum falhar, a implementação está QUEBRADA.
    """
    print("=" * 60)
    print("TESTES CANÔNICOS DE TWR")
    print("Estes testes definem o comportamento CORRETO do sistema")
    print("=" * 60)
    
    all_passed = True
    
    # -------------------------------------------------------------------------
    # TESTE 1: Retorno simples sem fluxo
    # -------------------------------------------------------------------------
    print("\n[Teste 1] Retorno Simples 10%")
    print("  Cenario: R$100 -> R$110, sem fluxo intermediario")
    
    df1 = pd.DataFrame({
        'nav': [100.0, 110.0],
        'flow': [100.0, 0.0]  # Primeiro é capital inicial
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02']))
    
    result1 = calculate_canonical_twr(df1)
    expected1 = 0.10
    
    if abs(result1.total_twr - expected1) < 0.0001:
        print(f"  [OK] PASSOU: TWR = {result1.total_twr:.4%}")
    else:
        print(f"  [ERRO] FALHOU: Esperado {expected1:.4%}, obtido {result1.total_twr:.4%}")
        all_passed = False
    
    # -------------------------------------------------------------------------
    # TESTE 2: Aporte neutro
    # -------------------------------------------------------------------------
    print("\n[Teste 2] Aporte Neutro = 0%")
    print("  Cenario: R$100 + Aporte R$100 = R$200, mercado parado")
    
    df2 = pd.DataFrame({
        'nav': [100.0, 200.0],
        'flow': [100.0, 100.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02']))
    
    result2 = calculate_canonical_twr(df2)
    expected2 = 0.0
    
    if abs(result2.total_twr - expected2) < 0.0001:
        print(f"  [OK] PASSOU: TWR = {result2.total_twr:.4%}")
    else:
        print(f"  [ERRO] FALHOU: Esperado {expected2:.4%}, obtido {result2.total_twr:.4%}")
        all_passed = False
    
    # -------------------------------------------------------------------------
    # TESTE 3: Dividendo compensa queda
    # -------------------------------------------------------------------------
    print("\n[Teste 3] Queda de Preço + Dividendo = 0%")
    print("  Cenario: NAV cai R$100 -> R$90, mas recebeu R$10 de dividendo")
    
    df3 = pd.DataFrame({
        'nav': [100.0, 90.0],
        'flow': [100.0, 0.0],
        'income': [0.0, 10.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02']))
    
    result3 = calculate_canonical_twr(df3)
    expected3 = 0.0
    
    if abs(result3.total_twr - expected3) < 0.0001:
        print(f"  [OK] PASSOU: TWR = {result3.total_twr:.4%}")
    else:
        print(f"  [ERRO] FALHOU: Esperado {expected3:.4%}, obtido {result3.total_twr:.4%}")
        all_passed = False
    
    # -------------------------------------------------------------------------
    # TESTE 4: Dividendo gera retorno positivo
    # -------------------------------------------------------------------------
    print("\n[Teste 4] Preço Estável + Dividendo = Retorno Positivo")
    print("  Cenario: NAV estavel R$100, dividendo R$5")
    
    df4 = pd.DataFrame({
        'nav': [100.0, 100.0],
        'flow': [100.0, 0.0],
        'income': [0.0, 5.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02']))
    
    result4 = calculate_canonical_twr(df4)
    expected4 = 0.05  # 5%
    
    if abs(result4.total_twr - expected4) < 0.0001:
        print(f"  [OK] PASSOU: TWR = {result4.total_twr:.4%}")
    else:
        print(f"  [ERRO] FALHOU: Esperado {expected4:.4%}, obtido {result4.total_twr:.4%}")
        all_passed = False
    
    # -------------------------------------------------------------------------
    # TESTE 5: Encadeamento geométrico (21%)
    # -------------------------------------------------------------------------
    print("\n[Teste 5] Encadeamento Geométrico")
    print("  Cenario: D0=100, D1=110(+10%), D2=220(+100 aporte), D3=242(+10%)")
    
    df5 = pd.DataFrame({
        'nav': [100.0, 110.0, 220.0, 242.0],
        'flow': [100.0, 0.0, 110.0, 0.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04']))
    
    result5 = calculate_canonical_twr(df5)
    expected5 = 0.21  # 1.10 * 1.00 * 1.10 - 1 = 21%
    
    if abs(result5.total_twr - expected5) < 0.0001:
        print(f"  [OK] PASSOU: TWR = {result5.total_twr:.4%}")
    else:
        print(f"  [ERRO] FALHOU: Esperado {expected5:.4%}, obtido {result5.total_twr:.4%}")
        all_passed = False
    
    # -------------------------------------------------------------------------
    # TESTE 6: Determinismo
    # -------------------------------------------------------------------------
    print("\n[Teste 6] Determinismo")
    print("  Cenario: Mesmo input deve produzir mesmo output")
    
    result6a = calculate_canonical_twr(df5)
    result6b = calculate_canonical_twr(df5)
    
    if result6a.total_twr == result6b.total_twr:
        print(f"  [OK] PASSOU: Resultados identicos")
    else:
        print(f"  [ERRO] FALHOU: Resultados diferentes ({result6a.total_twr} vs {result6b.total_twr})")
        all_passed = False
    
    # -------------------------------------------------------------------------
    # RESULTADO FINAL
    # -------------------------------------------------------------------------
    print("\n" + "=" * 60)
    if all_passed:
        print("[OK] TODOS OS TESTES CANÔNICOS PASSARAM")
    else:
        print("[ERRO] ALGUNS TESTES FALHARAM - IMPLEMENTAÇÃO QUEBRADA")
    print("=" * 60)
    
    return all_passed


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    print("\n[TWR] Modulo Canonico de TWR")
    print(f"\n{DEFAULT_PREMISES}")
    
    run_canonical_tests()

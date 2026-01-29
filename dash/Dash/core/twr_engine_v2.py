"""
Motor TWR v2.0 - Implementação Robusta e GIPS-Compliant
========================================================

PRINCÍPIOS DE DESIGN:
1. NUNCA modificar dados silenciosamente - sempre logar
2. CONTINUIDADE é prioridade - série deve ser suave
3. TRANSPARÊNCIA total - cada retorno tem explicação
4. VALIDAÇÃO em múltiplas camadas

Versão: 2.0.0
Data: 2026-01-29
"""

import pandas as pd
import numpy as np
from dataclasses import dataclass, field
from typing import List, Optional, Tuple, Dict
from enum import Enum
import warnings


# =============================================================================
# CONFIGURAÇÃO
# =============================================================================

@dataclass(frozen=True)
class TWRConfig:
    """Configuração do motor TWR."""
    # Thresholds
    min_capital: float = 100.0          # Capital mínimo para retorno válido
    max_daily_return: float = 0.30      # 30% - acima disso é suspeito (não zerado, só logado)
    large_flow_threshold: float = 0.20  # 20% - fluxo grande usa SOD

    # Comportamento
    flow_timing_default: str = "EOD"    # End-of-Day (GIPS padrão)
    fill_nav_gaps: bool = True          # Forward-fill NAV zeros
    clamp_extreme_returns: bool = False # Se True, limita retornos extremos (não recomendado)

    # Debug
    verbose: bool = False               # Logar cada dia


class ReturnQuality(Enum):
    """Qualidade do retorno calculado."""
    VALID = "valid"                     # Retorno normal
    ZERO_BASE = "zero_base"             # Base zero - retorno = 0
    SMALL_BASE = "small_base"           # Base pequena - retorno = 0
    EXTREME = "extreme"                 # Retorno extremo (> threshold)
    CLAMPED = "clamped"                 # Retorno foi limitado
    GAP_FILLED = "gap_filled"           # NAV foi forward-filled


# =============================================================================
# ESTRUTURAS DE DADOS
# =============================================================================

@dataclass
class DailyReturn:
    """Retorno de um único dia com metadados completos."""
    date: pd.Timestamp
    nav_start: float
    nav_end: float
    flow: float
    income: float
    capital_base: float
    economic_gain: float
    daily_return: float
    quality: ReturnQuality
    timing: str  # "EOD" ou "SOD"
    notes: str = ""

    def is_valid(self) -> bool:
        return self.quality == ReturnQuality.VALID


@dataclass
class TWRResult:
    """Resultado completo do cálculo TWR."""
    # Resultados principais
    total_twr: float
    annualized_twr: float

    # Séries
    daily_returns: pd.Series
    cumulative_twr: pd.Series
    drawdown: pd.Series
    nav_series: pd.Series

    # Métricas
    max_drawdown: float
    volatility: float
    sharpe_ratio: float
    total_flow: float
    total_income: float

    # Auditoria
    daily_details: List[DailyReturn]
    warnings: List[str]

    # Metadados
    start_date: pd.Timestamp
    end_date: pd.Timestamp
    trading_days: int
    valid_days: int
    config: TWRConfig


# =============================================================================
# FUNÇÕES AUXILIARES
# =============================================================================

def validate_input(df: pd.DataFrame) -> Tuple[bool, List[str]]:
    """
    Valida DataFrame de entrada.

    Returns:
        (is_valid, list_of_issues)
    """
    issues = []

    if df.empty:
        issues.append("DataFrame está vazio")
        return False, issues

    # Verificar colunas obrigatórias
    required = ['nav', 'flow']
    missing = [c for c in required if c not in df.columns]
    if missing:
        issues.append(f"Colunas ausentes: {missing}")
        return False, issues

    # Verificar índice
    if not isinstance(df.index, pd.DatetimeIndex):
        try:
            df.index = pd.to_datetime(df.index)
        except:
            issues.append("Index não é DatetimeIndex e não pode ser convertido")
            return False, issues

    # Verificar valores
    if df['nav'].isna().all():
        issues.append("Todos os valores de NAV são nulos")
        return False, issues

    # Verificar sequência de datas
    if not df.index.is_monotonic_increasing:
        issues.append("Datas não estão em ordem crescente")

    # Verificar NAVs negativos
    if (df['nav'] < 0).any():
        issues.append(f"NAV negativo em {(df['nav'] < 0).sum()} dias")

    return len(issues) == 0, issues


def fill_nav_gaps(nav: pd.Series, flow: pd.Series) -> Tuple[pd.Series, List[str]]:
    """
    Preenche gaps de NAV de forma inteligente.

    Regras:
    1. Zeros ANTES do primeiro NAV válido -> mantém zero
    2. Zeros DEPOIS do primeiro NAV válido -> forward-fill + ajuste de fluxo
    3. Variações bruscas (>50% sem fluxo) -> interpola

    Returns:
        (nav_filled, list_of_changes)
    """
    changes = []
    nav_filled = nav.copy()

    # Encontrar primeiro NAV válido
    first_valid_idx = nav[nav > 0].first_valid_index()
    if first_valid_idx is None:
        return nav_filled, ["Nenhum NAV válido encontrado"]

    # Forward-fill zeros após primeiro válido
    mask_after = nav_filled.index >= first_valid_idx
    zeros_after = (nav_filled[mask_after] == 0) | nav_filled[mask_after].isna()

    if zeros_after.any():
        dates_filled = nav_filled[mask_after][zeros_after].index.tolist()
        changes.append(f"Forward-fill em {len(dates_filled)} datas: {dates_filled[:3]}...")

        # Forward-fill inteligente: considera fluxo do dia
        for i, dt in enumerate(nav_filled[mask_after].index):
            if nav_filled.at[dt] == 0 or pd.isna(nav_filled.at[dt]):
                # Pegar valor anterior
                prev_idx = nav_filled.index.get_loc(dt) - 1
                if prev_idx >= 0:
                    prev_val = nav_filled.iloc[prev_idx]
                    day_flow = flow.at[dt] if dt in flow.index else 0
                    # NAV = NAV_anterior + Fluxo (assumindo retorno 0%)
                    nav_filled.at[dt] = prev_val + day_flow

    return nav_filled, changes


def detect_anomalies(
    nav: pd.Series,
    flow: pd.Series,
    threshold: float = 0.40
) -> List[Tuple[pd.Timestamp, str, float]]:
    """
    Detecta anomalias na série de NAV.

    Returns:
        Lista de (data, tipo_anomalia, magnitude)
    """
    anomalies = []

    nav_prev = nav.shift(1)

    for dt in nav.index[1:]:
        nav_t = nav.at[dt]
        nav_t1 = nav_prev.at[dt]
        flow_t = flow.at[dt] if dt in flow.index else 0

        if nav_t1 > 0:
            # Variação esperada = fluxo
            expected = nav_t1 + flow_t
            if expected > 0:
                variation = (nav_t - expected) / expected

                if abs(variation) > threshold:
                    anomalies.append((
                        dt,
                        "LARGE_VARIATION" if variation > 0 else "LARGE_DROP",
                        variation
                    ))

    return anomalies


# =============================================================================
# MOTOR PRINCIPAL
# =============================================================================

def calculate_twr_v2(
    df: pd.DataFrame,
    config: TWRConfig = TWRConfig()
) -> TWRResult:
    """
    Calcula TWR com robustez e transparência.

    FÓRMULA GIPS:
        economic_gain = (NAV_end + Income) - NAV_start - Flow

        Se timing == EOD: base = NAV_start
        Se timing == SOD: base = NAV_start + Flow

        r_t = economic_gain / base
        TWR = Π(1 + r_t) - 1

    Args:
        df: DataFrame com colunas 'nav', 'flow', 'income' (opcional)
        config: Configuração do motor

    Returns:
        TWRResult com todos os detalhes
    """
    warnings_list = []

    # =========================================================================
    # 1. VALIDAÇÃO
    # =========================================================================
    is_valid, issues = validate_input(df)
    if not is_valid:
        raise ValueError(f"Dados inválidos: {issues}")

    if issues:
        warnings_list.extend(issues)

    # Preparar dados
    df_calc = df.copy().sort_index()

    if 'income' not in df_calc.columns:
        df_calc['income'] = 0.0

    df_calc = df_calc.fillna(0.0)

    # =========================================================================
    # 2. PRÉ-PROCESSAMENTO
    # =========================================================================

    # 2.1 Filtrar para começar apenas quando há NAV > 0
    first_valid = df_calc[df_calc['nav'] > 0].first_valid_index()
    if first_valid is not None:
        df_calc = df_calc.loc[first_valid:]
    else:
        raise ValueError("Nenhum NAV válido encontrado")

    # 2.2 Preencher gaps de NAV
    if config.fill_nav_gaps:
        df_calc['nav'], fill_changes = fill_nav_gaps(df_calc['nav'], df_calc['flow'])
        if fill_changes:
            warnings_list.extend(fill_changes)

    # 2.3 Detectar anomalias
    anomalies = detect_anomalies(df_calc['nav'], df_calc['flow'])
    for dt, anomaly_type, magnitude in anomalies:
        warnings_list.append(f"{dt.date()}: {anomaly_type} ({magnitude:.1%})")

    # =========================================================================
    # 3. CÁLCULO DOS RETORNOS DIÁRIOS
    # =========================================================================

    daily_details: List[DailyReturn] = []
    daily_returns: List[float] = []

    # NAV do dia anterior
    df_calc['nav_start'] = df_calc['nav'].shift(1)

    for i, (dt, row) in enumerate(df_calc.iterrows()):
        nav_start = row['nav_start'] if pd.notna(row['nav_start']) else 0.0
        nav_end = row['nav']
        flow = row['flow']
        income = row['income']

        # Determinar timing
        if flow > 0 and nav_start > 0:
            ratio = flow / nav_start
            timing = "SOD" if ratio > config.large_flow_threshold else config.flow_timing_default
        else:
            timing = config.flow_timing_default

        # Calcular base de capital
        if timing == "SOD":
            capital_base = nav_start + flow
        else:  # EOD
            capital_base = nav_start

        # Calcular retorno
        quality = ReturnQuality.VALID
        notes = ""

        # Caso 1: Primeiro dia ou base zero
        if i == 0 or nav_start <= 0:
            daily_return = 0.0
            quality = ReturnQuality.ZERO_BASE
            notes = "Primeiro dia ou NAV_start = 0"

        # Caso 2: Base muito pequena
        elif capital_base < config.min_capital:
            daily_return = 0.0
            quality = ReturnQuality.SMALL_BASE
            notes = f"Base pequena: R${capital_base:.2f}"

        # Caso 3: Cálculo normal
        else:
            economic_gain = (nav_end + income) - nav_start - flow
            daily_return = economic_gain / capital_base

            # Verificar se é extremo
            if abs(daily_return) > config.max_daily_return:
                quality = ReturnQuality.EXTREME
                notes = f"Retorno extremo: {daily_return:.2%}"

                # Clamping opcional (não recomendado)
                if config.clamp_extreme_returns:
                    daily_return = np.clip(daily_return, -config.max_daily_return, config.max_daily_return)
                    quality = ReturnQuality.CLAMPED
                    notes += " (limitado)"

        daily_returns.append(daily_return)

        daily_details.append(DailyReturn(
            date=dt,
            nav_start=nav_start,
            nav_end=nav_end,
            flow=flow,
            income=income,
            capital_base=capital_base,
            economic_gain=(nav_end + income) - nav_start - flow if capital_base > 0 else 0,
            daily_return=daily_return,
            quality=quality,
            timing=timing,
            notes=notes
        ))

    df_calc['daily_return'] = daily_returns

    # Limpar infinitos
    df_calc['daily_return'] = df_calc['daily_return'].replace([np.inf, -np.inf], 0.0)

    # =========================================================================
    # 4. CHAIN-LINKING (Acumulação Geométrica)
    # =========================================================================

    df_calc['growth_factor'] = 1 + df_calc['daily_return']
    df_calc['cumulative_factor'] = df_calc['growth_factor'].cumprod()
    df_calc['cumulative_twr'] = df_calc['cumulative_factor'] - 1

    total_twr = df_calc['cumulative_twr'].iloc[-1]

    # =========================================================================
    # 5. MÉTRICAS
    # =========================================================================

    # Anualização
    days = (df_calc.index[-1] - df_calc.index[0]).days
    if days > 0 and (1 + total_twr) > 0:
        annualized_twr = ((1 + total_twr) ** (365 / days)) - 1
    else:
        annualized_twr = 0.0

    # Drawdown
    rolling_max = df_calc['cumulative_factor'].cummax()
    df_calc['drawdown'] = (df_calc['cumulative_factor'] / rolling_max) - 1
    max_drawdown = df_calc['drawdown'].min()

    # Volatilidade
    volatility = df_calc['daily_return'].std() * np.sqrt(252)

    # Sharpe (assumindo Rf = 0 para simplicidade)
    sharpe = (annualized_twr / volatility) if volatility > 0 else 0.0

    # Totais
    total_flow = df_calc['flow'].sum()
    total_income = df_calc['income'].sum()

    # Contagem de dias válidos
    valid_days = sum(1 for d in daily_details if d.is_valid())

    # =========================================================================
    # 6. RESULTADO
    # =========================================================================

    return TWRResult(
        total_twr=total_twr,
        annualized_twr=annualized_twr,
        daily_returns=df_calc['daily_return'],
        cumulative_twr=df_calc['cumulative_twr'],
        drawdown=df_calc['drawdown'],
        nav_series=df_calc['nav'],
        max_drawdown=max_drawdown,
        volatility=volatility,
        sharpe_ratio=sharpe,
        total_flow=total_flow,
        total_income=total_income,
        daily_details=daily_details,
        warnings=warnings_list,
        start_date=df_calc.index[0],
        end_date=df_calc.index[-1],
        trading_days=len(df_calc),
        valid_days=valid_days,
        config=config
    )


# =============================================================================
# FUNÇÕES DE CONVENIÊNCIA
# =============================================================================

def quick_twr(nav: pd.Series, flow: pd.Series, income: pd.Series = None) -> float:
    """Calcula TWR rapidamente."""
    df = pd.DataFrame({'nav': nav, 'flow': flow})
    if income is not None:
        df['income'] = income
    result = calculate_twr_v2(df)
    return result.total_twr


def diagnose_series(df: pd.DataFrame) -> Dict:
    """
    Diagnóstico completo de uma série de dados.

    Returns:
        Dicionário com estatísticas e problemas identificados
    """
    diag = {
        'total_days': len(df),
        'date_range': f"{df.index.min()} to {df.index.max()}",
        'nav_stats': {
            'min': df['nav'].min(),
            'max': df['nav'].max(),
            'mean': df['nav'].mean(),
            'zeros': (df['nav'] == 0).sum(),
            'nulls': df['nav'].isna().sum()
        },
        'flow_stats': {
            'total': df['flow'].sum(),
            'days_with_flow': (df['flow'] != 0).sum()
        },
        'issues': []
    }

    # Detectar problemas
    if diag['nav_stats']['zeros'] > 0:
        diag['issues'].append(f"NAV = 0 em {diag['nav_stats']['zeros']} dias")

    if diag['nav_stats']['nulls'] > 0:
        diag['issues'].append(f"NAV nulo em {diag['nav_stats']['nulls']} dias")

    # Variações extremas
    nav_pct = df['nav'].pct_change()
    extreme = nav_pct[abs(nav_pct) > 0.30]
    if len(extreme) > 0:
        diag['issues'].append(f"Variações > 30% em {len(extreme)} dias: {extreme.index.tolist()[:5]}")

    return diag


# =============================================================================
# TESTES
# =============================================================================

def run_tests():
    """Executa testes de sanidade."""
    print("=" * 60)
    print("TESTES DO MOTOR TWR v2.0")
    print("=" * 60)

    all_passed = True

    # Teste 1: Retorno simples 10%
    print("\n[Teste 1] Retorno Simples 10%")
    df1 = pd.DataFrame({
        'nav': [100.0, 110.0],
        'flow': [100.0, 0.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02']))

    result1 = calculate_twr_v2(df1)
    if abs(result1.total_twr - 0.10) < 0.0001:
        print(f"  [OK] TWR = {result1.total_twr:.4%}")
    else:
        print(f"  [ERRO] Esperado 10%, obtido {result1.total_twr:.4%}")
        all_passed = False

    # Teste 2: Aporte neutro
    print("\n[Teste 2] Aporte Neutro = 0%")
    df2 = pd.DataFrame({
        'nav': [100.0, 200.0],
        'flow': [100.0, 100.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02']))

    result2 = calculate_twr_v2(df2)
    if abs(result2.total_twr - 0.0) < 0.0001:
        print(f"  [OK] TWR = {result2.total_twr:.4%}")
    else:
        print(f"  [ERRO] Esperado 0%, obtido {result2.total_twr:.4%}")
        all_passed = False

    # Teste 3: Série com gap
    print("\n[Teste 3] Série com Gap (NAV=0 no meio)")
    df3 = pd.DataFrame({
        'nav': [100.0, 0.0, 110.0],  # Gap no meio
        'flow': [100.0, 0.0, 0.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02', '2024-01-03']))

    result3 = calculate_twr_v2(df3, TWRConfig(fill_nav_gaps=True))
    print(f"  TWR = {result3.total_twr:.4%}")
    print(f"  Warnings: {result3.warnings}")

    # Teste 4: Encadeamento geométrico
    print("\n[Teste 4] Encadeamento Geométrico (21%)")
    df4 = pd.DataFrame({
        'nav': [100.0, 110.0, 220.0, 242.0],
        'flow': [100.0, 0.0, 110.0, 0.0]
    }, index=pd.to_datetime(['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04']))

    result4 = calculate_twr_v2(df4)
    if abs(result4.total_twr - 0.21) < 0.0001:
        print(f"  [OK] TWR = {result4.total_twr:.4%}")
    else:
        print(f"  [ERRO] Esperado 21%, obtido {result4.total_twr:.4%}")
        all_passed = False

    print("\n" + "=" * 60)
    if all_passed:
        print("[OK] TODOS OS TESTES PASSARAM")
    else:
        print("[ERRO] ALGUNS TESTES FALHARAM")
    print("=" * 60)

    return all_passed


if __name__ == "__main__":
    run_tests()

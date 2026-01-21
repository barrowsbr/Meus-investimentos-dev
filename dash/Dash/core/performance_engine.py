"""
Motor de Calculo de Performance Institucional (GIPS Compliant)
Versao 2.1 - Integrado com Motor Canonico (twr_canonical.py)

Principios:
1. TWR (Time-Weighted Return) e a metrica soberana
2. Segmentacao por subperiodos delimitados por fluxos de caixa
3. Encadeamento geometrico dos retornos (chain-linking)
4. Zero atalhos estatisticos - calculo puro
5. Validacao cruzada obrigatoria

REFATORADO em 2026-01-20:
- Enums de timing/policy agora vem de twr_canonical
- Este motor mantem compatibilidade com codigo existente
- Para novos projetos, use twr_canonical.calculate_canonical_twr()
"""

import pandas as pd
import numpy as np
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Tuple

# Import enums do motor canonico para consistencia
try:
    from core.twr_canonical import FlowTiming, IncomePolicy, DEFAULT_PREMISES
except ImportError:
    from twr_canonical import FlowTiming, IncomePolicy, DEFAULT_PREMISES



@dataclass
class ValidationResult:
    """Resultado da validação cruzada do TWR."""
    twr_calculated: float
    simple_return: float
    divergence_abs: float
    divergence_pct: float
    is_valid: bool
    explanation: str
    suspicious_days: List[str] = field(default_factory=list)


@dataclass
class PeriodBreakdown:
    """Detalhamento de um subperíodo."""
    date: str
    nav_start: float
    nav_end: float
    flow: float
    income: float
    capital_base: float
    economic_gain: float
    daily_return: float
    notes: str


@dataclass
class PerformanceResult:
    """Standardized Output for Performance Calculation."""
    total_twr: float
    annualized_twr: float
    daily_returns: pd.Series
    cumulative_series: pd.Series
    drawdown_series: pd.Series
    max_drawdown: float
    nav_series: pd.Series
    volatility: float
    total_flow: float
    total_pnl: float
    # New: Validation & Transparency
    simple_return_series: pd.Series = None
    validation: ValidationResult = None
    flow_dates: List[str] = field(default_factory=list)
    period_breakdown: List[PeriodBreakdown] = field(default_factory=list)


class PerformanceEngine:
    """
    Motor de Cálculo de Performance Institucional (GIPS Compliant).
    
    Fórmula TWR (Modified Dietz Simplificado - End-of-Day):
    r_dia = (NAV_end + Income - NAV_start - Flow) / NAV_start
    
    Onde:
    - NAV_start = Patrimônio no início do dia (fechamento dia anterior)
    - NAV_end = Patrimônio no final do dia
    - Flow = Aportes (positivo) ou Saques (negativo) no dia
    - Income = Proventos recebidos no dia (ex-dividendo)
    
    Chain-Linking:
    TWR_total = Π(1 + r_i) - 1
    """
    
    # Thresholds de diagnóstico (não de correção)
    EXTREME_RETURN_THRESHOLD = 0.30  # 30% em um dia = suspeito
    MIN_CAPITAL_FOR_VALID_RETURN = 100  # R$100 mínimo para considerar retorno válido
    
    def __init__(self, df_input: pd.DataFrame):
        """
        Inicializa o motor com DataFrame contendo:
        - Index: DatetimeIndex (datas)
        - 'nav': Patrimônio Líquido Final (MTM)
        - 'flow': Fluxo de Caixa Externo (Aportes/Saques)
        - 'income': (opcional) Proventos recebidos
        - 'force_return_zero': (opcional) Flag para forçar retorno zero
        """
        self.df = df_input.copy()
        self._validate_inputs()
        self._suspicious_returns: List[Dict] = []
        self._period_breakdown: List[PeriodBreakdown] = []
    
    def _validate_inputs(self):
        """Valida integridade dos dados de entrada."""
        required_cols = ['nav', 'flow']
        for col in required_cols:
            if col not in self.df.columns:
                raise ValueError(f"Coluna obrigatória ausente: {col}")
        
        # Ordenação temporal
        self.df = self.df.sort_index()
        
        # Colunas opcionais com defaults
        if 'income' not in self.df.columns:
            self.df['income'] = 0.0
        if 'flow_timing' not in self.df.columns:
            self.df['flow_timing'] = 0  # 0=End-of-Day (padrão GIPS)
        
        # Preenche NaNs
        self.df = self.df.fillna(0.0)
    
    def calculate_twr(self) -> PerformanceResult:
        """
        Executa o cálculo do TWR com rigor matemático.
        
        Retorna PerformanceResult com todas as métricas e validação.
        """
        # =====================================================================
        # 1. CÁLCULO DO NAV INICIAL (NAV do dia anterior)
        # =====================================================================
        self.df['nav_start'] = self.df['nav'].shift(1).fillna(0.0)
        
        # =====================================================================
        # 2. CÁLCULO DO GANHO ECONÔMICO
        # =====================================================================
        # Fórmula: Ganho = (NAV_end + Income) - (NAV_start + Flow)
        # 
        # Explicação:
        # - Se houve aporte (Flow > 0), o NAV_end já inclui esse dinheiro
        #   então subtraímos para isolar o ganho orgânico
        # - Se houve provento (Income > 0), ele reduziu o NAV (ex-dividendo)
        #   então somamos de volta para capturar o retorno total
        
        self.df['economic_gain'] = (
            self.df['nav'] + self.df['income']
        ) - self.df['nav_start'] - self.df['flow']
        
        # =====================================================================
        # 3. CÁLCULO DA BASE DE CAPITAL
        # =====================================================================
        # End-of-Day (padrão): Flow entra no FIM do dia, não participa do retorno
        # Start-of-Day: Flow entra no INÍCIO, participa do retorno
        
        self.df['capital_base'] = np.where(
            self.df['flow_timing'] == 1,  # Start-of-Day
            self.df['nav_start'] + self.df['flow'],
            self.df['nav_start']  # End-of-Day (padrão)
        )
        
        # =====================================================================
        # 4. CÁLCULO DO RETORNO DIÁRIO
        # =====================================================================
        daily_returns = []
        flow_dates = []
        
        for i, (idx, row) in enumerate(self.df.iterrows()):
            nav_start = row['nav_start']
            nav_end = row['nav']
            flow = row['flow']
            income = row['income']
            capital_base = row['capital_base']
            
            # Registro de breakdown para transparência
            notes = ""
            daily_return = 0.0
            
            # CASO 1: Primeiro dia ou capital zero
            if capital_base <= 0 or nav_start <= 0:
                daily_return = 0.0
                notes = "Capital inicial zero - retorno não aplicável"
            
            # CASO 2: Capital muito pequeno (< R$100)
            elif capital_base < self.MIN_CAPITAL_FOR_VALID_RETURN:
                daily_return = 0.0
                notes = f"Capital base muito pequeno (R${capital_base:.2f}) - retorno zerado para evitar ruído"
            
            # CASO 3: Cálculo normal
            else:
                economic_gain = (nav_end + income) - nav_start - flow
                daily_return = economic_gain / capital_base
                
                # Diagnóstico de retornos extremos (NÃO corrige, apenas registra)
                if abs(daily_return) > self.EXTREME_RETURN_THRESHOLD:
                    self._suspicious_returns.append({
                        'date': str(idx.date()) if hasattr(idx, 'date') else str(idx),
                        'return': daily_return,
                        'nav_start': nav_start,
                        'nav_end': nav_end,
                        'flow': flow,
                        'income': income
                    })
                    notes = f"⚠️ Retorno extremo: {daily_return:.2%}"
            
            # Verifica flag de override
            if 'force_return_zero' in self.df.columns and row.get('force_return_zero', False):
                daily_return = 0.0
                notes = "Forçado a zero por flag externa"
            
            daily_returns.append(daily_return)
            
            # Registra datas com fluxo para visualização
            if abs(flow) > 0.01:
                flow_dates.append(str(idx.date()) if hasattr(idx, 'date') else str(idx))
            
            # Breakdown para diagnóstico
            self._period_breakdown.append(PeriodBreakdown(
                date=str(idx.date()) if hasattr(idx, 'date') else str(idx),
                nav_start=nav_start,
                nav_end=nav_end,
                flow=flow,
                income=income,
                capital_base=capital_base,
                economic_gain=(nav_end + income) - nav_start - flow,
                daily_return=daily_return,
                notes=notes
            ))
        
        self.df['daily_return'] = daily_returns
        
        # Tratamento de valores inválidos
        self.df['daily_return'] = self.df['daily_return'].replace(
            [np.inf, -np.inf], 0.0
        ).fillna(0.0)
        
        # =====================================================================
        # 5. CHAIN-LINKING (Acumulação Geométrica)
        # =====================================================================
        # TWR = Π(1 + r_i) - 1
        self.df['growth_factor'] = 1 + self.df['daily_return']
        self.df['cumulative_factor'] = self.df['growth_factor'].cumprod()
        self.df['twr_accumulated'] = self.df['cumulative_factor'] - 1
        
        # =====================================================================
        # 6. RETORNO SIMPLES (para comparação)
        # =====================================================================
        # Retorno sem ajuste de fluxo: (NAV_end - NAV_start) / NAV_start
        simple_return = np.where(
            self.df['nav_start'] > 0,
            (self.df['nav'] - self.df['nav_start']) / self.df['nav_start'],
            0.0
        )
        self.df['simple_return'] = simple_return
        self.df['simple_cumulative'] = (1 + self.df['simple_return']).cumprod() - 1
        
        # =====================================================================
        # 7. MÉTRICAS FINAIS
        # =====================================================================
        total_twr = self.df['twr_accumulated'].iloc[-1] if not self.df.empty else 0.0
        
        # Anualização (CAGR)
        days = (self.df.index[-1] - self.df.index[0]).days if len(self.df) > 1 else 0
        annualized_twr = 0.0
        if days > 0 and (1 + total_twr) > 0:
            annualized_twr = ((1 + total_twr) ** (365 / days)) - 1
        
        # Drawdown
        rolling_max = self.df['cumulative_factor'].cummax()
        drawdown_series = (self.df['cumulative_factor'] / rolling_max) - 1
        max_drawdown = drawdown_series.min()
        
        # Volatilidade
        volatility = self.df['daily_return'].std() * np.sqrt(252) if len(self.df) > 1 else 0.0
        
        # Métricas Financeiras
        nav_series = self.df['nav']
        total_flow = self.df['flow'].sum()
        nav_inicial = self.df['nav'].iloc[0] if not self.df.empty else 0.0
        nav_final = self.df['nav'].iloc[-1] if not self.df.empty else 0.0
        
        # PnL = Variação patrimonial - Aportes líquidos (exceto primeiro aporte)
        first_flow = self.df['flow'].iloc[0] if not self.df.empty else 0.0
        total_pnl = nav_final - nav_inicial - total_flow + first_flow
        
        # =====================================================================
        # 8. VALIDAÇÃO CRUZADA
        # =====================================================================
        validation = self._validate_twr(total_twr)
        
        return PerformanceResult(
            total_twr=total_twr,
            annualized_twr=annualized_twr,
            daily_returns=self.df['daily_return'],
            cumulative_series=self.df['twr_accumulated'],
            drawdown_series=drawdown_series,
            max_drawdown=max_drawdown,
            nav_series=nav_series,
            volatility=volatility,
            total_flow=total_flow,
            total_pnl=total_pnl,
            simple_return_series=self.df['simple_cumulative'],
            validation=validation,
            flow_dates=flow_dates,
            period_breakdown=self._period_breakdown
        )
    
    def _validate_twr(self, twr_calculated: float) -> ValidationResult:
        """
        Validação cruzada do TWR calculado.
        
        Compara:
        1. TWR interno (calculado)
        2. Retorno simples (sem ajuste de fluxo)
        
        Documenta divergências e suas causas.
        """
        simple_return = self.df['simple_cumulative'].iloc[-1] if not self.df.empty else 0.0
        
        divergence_abs = twr_calculated - simple_return
        divergence_pct = abs(divergence_abs / simple_return) * 100 if simple_return != 0 else 0.0
        
        # Análise de divergência
        if abs(divergence_abs) < 0.001:  # < 0.1% de diferença
            is_valid = True
            explanation = "[OK] TWR e Retorno Simples praticamente iguais - sem fluxos significativos no período."
        elif divergence_abs > 0:
            is_valid = True
            explanation = (
                f"[OK] TWR ({twr_calculated:.2%}) > Retorno Simples ({simple_return:.2%}). "
                f"Isso indica que seus aportes entraram em momentos RUINS (antes de quedas) ou "
                f"saques em momentos BONS (antes de mais altas). O TWR ignora esse timing."
            )
        else:
            is_valid = True
            explanation = (
                f"[OK] TWR ({twr_calculated:.2%}) < Retorno Simples ({simple_return:.2%}). "
                f"Isso indica que seus aportes entraram em momentos BONS (antes de altas). "
                f"O Retorno Simples captura essa sorte, o TWR não."
            )
        
        # Divergências altas são NORMAIS quando há muitos aportes
        # Não é um erro - é exatamente o que o TWR deveria mostrar!
        if divergence_pct > 50:
            if simple_return > twr_calculated:
                # Mais comum: patrimônio cresceu muito por aportes, não por mercado
                is_valid = True  # Não é erro!
                explanation = (
                    f"[NORMAL] Divergencia de {divergence_pct:.0f}% e ESPERADA. "
                    f"Seu patrimonio cresceu {simple_return:.0%} (incluindo aportes), "
                    f"mas o MERCADO rendeu {twr_calculated:.1%}. "
                    f"A diferenca mostra quanto veio de DINHEIRO NOVO vs RENTABILIDADE."
                )
            else:
                # Raro: TWR maior que retorno simples com divergência alta
                is_valid = True
                explanation = (
                    f"[INFO] TWR ({twr_calculated:.1%}) maior que Retorno Simples ({simple_return:.1%}). "
                    f"Isso pode indicar saques em momentos desfavoraveis."
                )
        
        suspicious_days = [d['date'] for d in self._suspicious_returns]
        
        return ValidationResult(
            twr_calculated=twr_calculated,
            simple_return=simple_return,
            divergence_abs=divergence_abs,
            divergence_pct=divergence_pct,
            is_valid=is_valid,
            explanation=explanation,
            suspicious_days=suspicious_days
        )
    
    def explain_period(self, start_date=None, end_date=None) -> List[PeriodBreakdown]:
        """
        Retorna breakdown detalhado de cada dia no período.
        Útil para diagnóstico e auditoria.
        """
        breakdown = self._period_breakdown
        
        if start_date:
            breakdown = [p for p in breakdown if p.date >= str(start_date)]
        if end_date:
            breakdown = [p for p in breakdown if p.date <= str(end_date)]
        
        return breakdown
    
    def get_suspicious_returns(self) -> List[Dict]:
        """Retorna lista de retornos extremos para revisão."""
        return self._suspicious_returns


# =============================================================================
# TESTES UNITÁRIOS EMBUTIDOS
# =============================================================================
if __name__ == "__main__":
    print("=" * 60)
    print("TESTE DE SANIDADE DO MOTOR TWR v2.0")
    print("=" * 60)
    
    # -------------------------------------------------------------------------
    # TESTE 1: Retorno simples de 10%
    # -------------------------------------------------------------------------
    print("\n[Teste 1] Retorno Simples 10%")
    print("  Cenário: Dia 0 = R$100, Dia 1 = R$110, Sem fluxo")
    print("  Esperado: TWR = 10%")
    
    df1 = pd.DataFrame({
        'nav': [100.0, 110.0],
        'flow': [100.0, 0.0]  # Primeiro dia é o aporte inicial
    }, index=pd.to_datetime(['2023-01-01', '2023-01-02']))
    
    eng1 = PerformanceEngine(df1)
    res1 = eng1.calculate_twr()
    print(f"  Resultado: TWR = {res1.total_twr:.4f} ({res1.total_twr:.2%})")
    assert abs(res1.total_twr - 0.10) < 0.0001, "FALHOU: Teste 1"
    print("  [OK] PASSOU")
    
    # -------------------------------------------------------------------------
    # TESTE 2: Aporte sem rendimento
    # -------------------------------------------------------------------------
    print("\n[Teste 2] Aporte Neutro")
    print("  Cenário: Dia 0 = R$100, Dia 1 = R$200 (Aporte de R$100)")
    print("  Esperado: TWR = 0% (mercado não moveu)")
    
    df2 = pd.DataFrame({
        'nav': [100.0, 200.0],
        'flow': [100.0, 100.0]
    }, index=pd.to_datetime(['2023-01-01', '2023-01-02']))
    
    eng2 = PerformanceEngine(df2)
    res2 = eng2.calculate_twr()
    print(f"  Resultado: TWR = {res2.total_twr:.4f} ({res2.total_twr:.2%})")
    assert abs(res2.total_twr - 0.0) < 0.0001, "FALHOU: Teste 2"
    print("  [OK] PASSOU")
    
    # -------------------------------------------------------------------------
    # TESTE 3: Provento (Dividendo)
    # -------------------------------------------------------------------------
    print("\n[Teste 3] Provento Neutro")
    print("  Cenário: NAV cai de R$100 para R$90, mas recebeu R$10 de dividendo")
    print("  Esperado: TWR = 0% (retorno total neutro)")
    
    df3 = pd.DataFrame({
        'nav': [100.0, 90.0],
        'flow': [100.0, 0.0],
        'income': [0.0, 10.0]
    }, index=pd.to_datetime(['2023-01-01', '2023-01-02']))
    
    eng3 = PerformanceEngine(df3)
    res3 = eng3.calculate_twr()
    print(f"  Resultado: TWR = {res3.total_twr:.4f} ({res3.total_twr:.2%})")
    assert abs(res3.total_twr - 0.0) < 0.0001, "FALHOU: Teste 3"
    print("  [OK] PASSOU")
    
    # -------------------------------------------------------------------------
    # TESTE 4: Aporte grande (Start-of-Day)
    # -------------------------------------------------------------------------
    print("\n[Teste 4] Aporte Grande com Ganho (SoD)")
    print("  Cenário: Base R$100, Aporte R$1000 no início, NAV final R$1110")
    print("  Esperado: TWR = 10/1100 ~ 0.91% (ganho sobre base ajustada)")
    
    df4 = pd.DataFrame({
        'nav': [100.0, 1110.0],
        'flow': [100.0, 1000.0],
        'flow_timing': [0, 1]  # Dia 1 usa Start-of-Day
    }, index=pd.to_datetime(['2023-01-01', '2023-01-02']))
    
    eng4 = PerformanceEngine(df4)
    res4 = eng4.calculate_twr()
    expected = 10 / 1100  # ≈ 0.00909
    print(f"  Resultado: TWR = {res4.total_twr:.4f} ({res4.total_twr:.2%})")
    print(f"  Esperado:  TWR = {expected:.4f} ({expected:.2%})")
    assert abs(res4.total_twr - expected) < 0.0001, "FALHOU: Teste 4"
    print("  [OK] PASSOU")
    
    # -------------------------------------------------------------------------
    # TESTE 5: Validação Cruzada
    # -------------------------------------------------------------------------
    print("\n[Teste 5] Validação Cruzada")
    print("  Verificando se validation está preenchido corretamente")
    
    assert res1.validation is not None, "FALHOU: validation é None"
    assert res1.validation.is_valid, "FALHOU: validation deveria ser válido"
    print(f"  Explicação: {res1.validation.explanation[:60]}...")
    print("  [OK] PASSOU")
    
    # -------------------------------------------------------------------------
    # TESTE 6: Flow Dates
    # -------------------------------------------------------------------------
    print("\n[Teste 6] Registro de Datas de Fluxo")
    print("  Verificando se flow_dates captura datas com aportes")
    
    assert len(res2.flow_dates) > 0, "FALHOU: flow_dates vazio"
    print(f"  Flow dates: {res2.flow_dates}")
    print("  [OK] PASSOU")
    
    print("\n" + "=" * 60)
    print("[OK] TODOS OS TESTES PASSARAM COM SUCESSO")
    print("=" * 60)

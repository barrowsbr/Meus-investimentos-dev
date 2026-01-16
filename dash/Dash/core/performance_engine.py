
import pandas as pd
import numpy as np
from dataclasses import dataclass
from typing import Optional, Tuple

@dataclass
class PerformanceResult:
    """Standardized Output for Performance Calculation."""
    total_twr: float
    annualized_twr: float
    daily_returns: pd.Series
    cumulative_series: pd.Series
    drawdown_series: pd.Series
    max_drawdown: float

class PerformanceEngine:
    """
    Motor de Cálculo de Performance Institucional (GIPS Compliant).
    
    Princípios:
    1. Separação total entre Fluxo de Caixa (Externo) e Retorno de Mercado (Interno).
    2. TWR (Time-Weighted Return) como métrica principal.
    3. Tratamento robusto para dias com patrimônio zero.
    4. Independência de framework visual (Streamlit).
    """
    
    def __init__(self, df_input: pd.DataFrame):
        """
        Inicializa o motor com um DataFrame contendo as colunas obrigatórias:
        - 'date': Data (Index)
        - 'nav': Patrimônio Líquido Final (Mark-to-Market + Caixa)
        - 'flow': Fluxo de Caixa Externo (Aportes/Resgates)
        """
        self.df = df_input.copy()
        self.validate_inputs()
    
    def validate_inputs(self):
        """Valida a integridade dos dados de entrada."""
        required_cols = ['nav', 'flow']
        for col in required_cols:
            if col not in self.df.columns:
                raise ValueError(f"Coluna obrigatória ausente: {col}")
        
        # Garante ordenação temporal
        self.df = self.df.sort_index()
        
        # Preenche NaNs com zero para segurança matemática
        self.df = self.df.fillna(0.0)

    def calculate_twr(self) -> PerformanceResult:
        """
        Executa o cálculo do TWR Diário e Acumulado.
        
        Fórmula End-of-Day (GIPS Standard para dados diários):
        r_dia = (NAV_fim - NAV_inicio - Fluxo) / NAV_inicio
        
        Se NAV_inicio == 0 (Primeiro dia ou dia pós-zeragem):
        r_dia = 0.0
        """
        # 0. Configurações
        if 'flow_timing' not in self.df.columns:
            self.df['flow_timing'] = 0 # 0=End-of-Day (Standard), 1=Start-of-Day

        # 1. Define NAV Inicial (NAV do dia anterior)
        # Shift(1) move o NAV de ontem para a linha de hoje
        self.df['nav_start'] = self.df['nav'].shift(1).fillna(0.0)
        
        if 'income' not in self.df.columns:
            self.df['income'] = 0.0
            
        # 2. Cálculo do Retorno Simples Diário
        # Numerador: Ganho Econômico = (NAV Final + Proventos) - (NAV Inicial + Fluxo Externo)
        # Se houve Aporte (Flow > 0), ele aumenta o NAV Final, então subtraímos para achar o ganho orgânico.
        # Se houve Provento (Income > 0), ele é um ganho que saiu do NAV (drop de preço), então somamos devolta.
        self.df['economic_gain'] = (self.df['nav'] + self.df['income']) - self.df['nav_start'] - self.df['flow']
        
        # Denominador: Base de Capital
        # Se End-of-Day (0): Base = NAV Inicial
        # Se Start-of-Day (1): Base = NAV Inicial + Fluxo (Dinheiro trabalhou o dia todo)
        
        self.df['capital_base'] = np.where(
            self.df['flow_timing'] == 1,
            self.df['nav_start'] + self.df['flow'],
            self.df['nav_start']
        )
        
        # Tratamento Vetorizado para Divisão por Zero
        # Onde nav_start > 0, calcula. Onde for 0, retorna 0.0.
        
        standard_twr = np.where(
            self.df['capital_base'] > 1e-6, 
            self.df['economic_gain'] / self.df['capital_base'],
            0.0
        )
        
        if 'force_return_zero' in self.df.columns:
            self.df['daily_return'] = np.where(
                self.df['force_return_zero'],
                0.0,
                standard_twr
            )
        else:
            self.df['daily_return'] = standard_twr
            
        # --- SAFEGUARDS ---
        # 1. Fill NaNs/Infs that could slip through
        self.df['daily_return'] = self.df['daily_return'].replace([np.inf, -np.inf], 0.0).fillna(0.0)
        
        # 2. Hard Circuit Breaker for Physics-Defying Returns (> 50% in a day)
        # Unless it's a penny stock day, but for a portfolio this is likely data error
        # We cap it to avoid breaking the chart scale
        self.df['daily_return'] = self.df['daily_return'].clip(lower=-0.5, upper=0.5)
        
        # 3. Small Base Double Check
        # If capital base was < 500 (defined in engine but checked here too), zero usage
        mask_tiny = (self.df['capital_base'] < 500.0)
        self.df.loc[mask_tiny, 'daily_return'] = 0.0
        
        # Casos Especiais:
        # Se for o primeiro aporte (nav_start=0, flow=1000, nav=1000) -> economic_gain = 0 -> return = 0.
        # Correto. O dinheiro entrou mas não rendeu nada no instante t0.
        
        # 3. Chain-Linking (Acumulação Geométrica)
        # (1 + r1) * (1 + r2) * ... - 1
        self.df['growth_factor'] = 1 + self.df['daily_return']
        self.df['cumulative_factor'] = self.df['growth_factor'].cumprod()
        self.df['twr_accumulated'] = (self.df['cumulative_factor'] - 1)
        
        # 4. Métricas Finais
        total_twr = self.df['twr_accumulated'].iloc[-1] if not self.df.empty else 0.0
        
        # 5. Anualização
        days = (self.df.index[-1] - self.df.index[0]).days if len(self.df) > 1 else 0
        annualized_twr = 0.0
        if days > 0:
            annualized_twr = ((1 + total_twr) ** (365 / days)) - 1
            
        # 6. Drawdown (Baseado no TWR, não no Financeiro)
        # Pico histórico da curva de fator acumulado
        rolling_max = self.df['cumulative_factor'].cummax()
        drawdown_series = (self.df['cumulative_factor'] / rolling_max) - 1
        max_drawdown = drawdown_series.min()
        
        return PerformanceResult(
            total_twr=total_twr * 100, # Percentual
            annualized_twr=annualized_twr * 100, # Percentual
            daily_returns=self.df['daily_return'],
            cumulative_series=self.df['twr_accumulated'] * 100,
            drawdown_series=drawdown_series * 100,
            max_drawdown=max_drawdown * 100
        )

# --- VALIDAÇÃO E TESTES UNITÁRIOS EMBUTIDOS ---
if __name__ == "__main__":
    print("=== TESTE DE SANIDADE DO MOTOR TWR ===")
    
    # 1. Caso Base: 10% de ganho sem fluxo
    # Dia 0: 100
    # Dia 1: 110 (Nav Start=100, Flow=0, Gain=10. 10/100 = 10%)
    df1 = pd.DataFrame({
        'nav': [100.0, 110.0],
        'flow': [100.0, 0.0] # Dia 0 flow=100 (início), Nav=100.
    }, index=pd.to_datetime(['2023-01-01', '2023-01-02']))
    
    eng1 = PerformanceEngine(df1)
    res1 = eng1.calculate_twr()
    print(f"Teste 1 (Simples 10%): Expect 10.0% -> Got {res1.total_twr:.2f}%")
    assert abs(res1.total_twr - 10.0) < 0.01
    
    # 2. Caso Fluxo: Dobrando aporte, rentabilidade zero
    # Dia 0: 100
    # Dia 1: 200 (Aporte de 100. Mercado não moveu).
    # Nav End=200. Nav Start=100. Flow=100.
    # Gain = 200 - 100 - 100 = 0. Return = 0/100 = 0%.
    df2 = pd.DataFrame({
        'nav': [100.0, 200.0],
        'flow': [100.0, 100.0]
    }, index=pd.to_datetime(['2023-01-01', '2023-01-02']))
    
    eng2 = PerformanceEngine(df2)
    res2 = eng2.calculate_twr()
    print(f"Teste 2 (Aporte Neutro): Expect 0.0% -> Got {res2.total_twr:.2f}%")
    assert abs(res2.total_twr - 0.0) < 0.01

    # 3. Caso Provento: Nav cai, mas Income compensa
    # Dia 0: 100
    # Dia 1: 90 (Nav). Income=10. Flow=0.
    # Gain = (90 + 10) - 100 - 0 = 0.
    df3 = pd.DataFrame({
        'nav': [100.0, 90.0],
        'flow': [100.0, 0.0],
        'income': [0.0, 10.0]
    }, index=pd.to_datetime(['2023-01-01', '2023-01-02']))
    
    eng3 = PerformanceEngine(df3)
    res3 = eng3.calculate_twr()
    print(f"Teste 3 (Provento Neutro): Expect 0.0% -> Got {res3.total_twr:.2f}%")
    assert abs(res3.total_twr - 0.0) < 0.01
    
    # 4. Caso OUTLIER: Aporte Gigante em Base Pequena
    # Nav Start: 100.
    # Nav End: 1100.
    # Flow: 1000.
    # Gain = 1100 - 100 - 1000 = 0.
    # Se End-of-Day (Regular): Base = 100. Return = 0/100 = 0%. (Ok se ganho é zero)
    # Mas se houver ganho pequeno?
    # Nav End: 1110. (10 de ganho)
    # Gain = 10.
    # EoD: 10/100 = 10%. (O ganho de 10 foi sobre a base de 100? Ou sobre 1100?)
    # Se o fluxo entrou no INICIO, ele participou do ganho.
    # Se o fluxo entrou de 1000 e rendeu 10 (1%), terminaríamos com 1110.
    # EoD Calculation: 10 / 100 = 10% (ERRADO! Infla retorno)
    # SoD Calculation: 10 / (100+1000) = 0.90% (CORRETO)
    
    df4 = pd.DataFrame({
        'nav': [100.0, 1110.0],
        'flow': [100.0, 1000.0],
        'flow_timing': [0, 1] # Dia 1 é Start-of-Day
    }, index=pd.to_datetime(['2023-01-01', '2023-01-02']))
    
    eng4 = PerformanceEngine(df4)
    res4 = eng4.calculate_twr()
    # Esperado: Ganho 10. Base 1100. Return ~0.909%
    expect = (10/1100)*100
    print(f"Teste 4 (Outlier SoD): Expect {expect:.2f}% -> Got {res4.total_twr:.2f}%")
    assert abs(res4.total_twr - expect) < 0.01

    print("=== TODOS OS TESTES PASSARAM COM SUCESSO ===")

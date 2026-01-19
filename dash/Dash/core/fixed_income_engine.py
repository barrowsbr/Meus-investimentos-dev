"""
Motor de Curva de Renda Fixa
Versão 1.0 - Modelagem explícita com SELIC Proxy

PREMISSA FUNDAMENTAL (Hipótese Documentada):
- Taxa Proxy SELIC: 15% ao ano
- Taxa diária: (1 + 0.15)^(1/252) - 1 ≈ 0.0555%
- Esta é uma SIMPLIFICAÇÃO EXPLÍCITA, não uma inferência real
- Todos os ativos ativos rendem esta taxa até vencimento/resgate

Princípios:
1. Onde não há curva real, usamos proxy explícito e documentado
2. Nenhum número mágico - tudo rastreável
3. Rentabilidade precisa de curva no tempo
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import Optional, List, Dict, Tuple


@dataclass
class FixedIncomeEvent:
    """Evento normalizado de renda fixa."""
    date: datetime
    ticker: str
    event_type: str  # 'COMPRA', 'VENDA', 'VENCIMENTO', 'IMPOSTO', 'CAIXA'
    amount: float    # Valor do fluxo (negativo = saída, positivo = entrada)
    original_value: float  # Valor original do evento


@dataclass
class FixedIncomeCurveResult:
    """Resultado do motor de curva RF."""
    daily_curve: pd.DataFrame  # Série diária com invested, corrected, cash
    total_invested: float
    current_value: float
    total_return_pct: float
    annualized_return_pct: float
    total_taxes_paid: float
    hypothesis_note: str  # Documentação da hipótese


class FixedIncomeEngine:
    """
    Motor de Cálculo de Curva de Renda Fixa.
    
    Transforma eventos discretos (Compra/Venda/Vencimento/Imposto)
    em uma curva diária contínua usando taxa SELIC proxy.
    """
    
    # =========================================================================
    # HIPÓTESE DOCUMENTADA - NÃO É NÚMERO MÁGICO
    # =========================================================================
    SELIC_ANNUAL = 0.15  # 15% ao ano
    BUSINESS_DAYS_YEAR = 252
    
    # Taxa diária calculada: (1 + 0.15)^(1/252) - 1
    DAILY_RATE = (1 + SELIC_ANNUAL) ** (1 / BUSINESS_DAYS_YEAR) - 1
    
    HYPOTHESIS_NOTE = (
        "Projeção baseada em SELIC proxy de 15% a.a. "
        "Ativos ativos crescem a (1 + 0.15)^(dias/252). "
        "Esta é uma simplificação documentada - não reflete taxas reais dos títulos."
    )
    
    def __init__(self, df_events: pd.DataFrame):
        """
        Inicializa o motor com DataFrame de eventos RF.
        
        Esperado:
        - Data: data do evento
        - Ticker: identificador do ativo
        - Tipo: 'Compra', 'Venda', 'Vencimento', 'Imposto', 'Caixa'
        - Valor: valor do evento
        """
        self.df_raw = df_events.copy()
        self.events: List[FixedIncomeEvent] = []
        self._normalize_events()
    
    def _normalize_events(self):
        """Transforma eventos brutos em fluxos de caixa padronizados."""
        if self.df_raw.empty:
            return
        
        for _, row in self.df_raw.iterrows():
            try:
                date = pd.to_datetime(row.get('Data'), dayfirst=True)
                if pd.isna(date):
                    continue
                
                ticker = str(row.get('Ticker', 'UNKNOWN')).strip()
                tipo = str(row.get('Tipo', '')).strip().upper()
                valor = float(row.get('Valor', 0) or 0)
                
                # Normalização de tipo de evento
                if 'COMPRA' in tipo or 'APORTE' in tipo or 'ENTRADA' in tipo:
                    event_type = 'COMPRA'
                    amount = -abs(valor)  # Fluxo negativo (Dinheiro saiu)
                elif 'VENDA' in tipo or 'RESGATE' in tipo:
                    event_type = 'VENDA'
                    amount = abs(valor)   # Fluxo positivo (Dinheiro voltou)
                elif 'VENCIMENTO' in tipo:
                    event_type = 'VENCIMENTO'
                    amount = abs(valor)   # Fluxo positivo
                elif 'IMPOSTO' in tipo or 'IR' in tipo:
                    event_type = 'IMPOSTO'
                    amount = -abs(valor)  # Fluxo negativo (Pagou imposto)
                elif 'CAIXA' in tipo or 'CASH' in tipo or 'SALDO' in tipo:
                    event_type = 'CAIXA'
                    amount = 0  # Caixa não gera fluxo - é posição
                else:
                    event_type = 'COMPRA'  # Default
                    amount = -abs(valor)
                
                self.events.append(FixedIncomeEvent(
                    date=date,
                    ticker=ticker,
                    event_type=event_type,
                    amount=amount,
                    original_value=valor
                ))
            except Exception:
                continue
        
        # Ordena por data
        self.events.sort(key=lambda e: e.date)
    
    def build_daily_curve(self, 
                          start_date: Optional[datetime] = None, 
                          end_date: Optional[datetime] = None) -> FixedIncomeCurveResult:
        """
        Constrói a curva diária de patrimônio RF.
        
        Para cada dia útil:
        - Aplica eventos do dia
        - Capitaliza ativos ativos pela taxa SELIC proxy
        
        Returns:
            FixedIncomeCurveResult com série diária e métricas
        """
        if not self.events:
            return FixedIncomeCurveResult(
                daily_curve=pd.DataFrame(),
                total_invested=0,
                current_value=0,
                total_return_pct=0,
                annualized_return_pct=0,
                total_taxes_paid=0,
                hypothesis_note=self.HYPOTHESIS_NOTE
            )
        
        # Define período
        if start_date is None:
            start_date = min(e.date for e in self.events)
        if end_date is None:
            end_date = datetime.now()
        
        # Gera range de dias úteis (simplificado - todos os dias de semana)
        date_range = pd.date_range(start=start_date, end=end_date, freq='B')
        
        # Estado interno
        # positions: {ticker: {'invested': valor, 'purchase_date': date}}
        positions: Dict[str, Dict] = {}
        cash_position = 0.0
        total_taxes = 0.0
        
        # Séries de saída
        invested_series = []
        corrected_series = []
        cash_series = []
        dates = []
        
        # Mapeia eventos por data
        events_by_date = {}
        for e in self.events:
            d = e.date.date()
            if d not in events_by_date:
                events_by_date[d] = []
            events_by_date[d].append(e)
        
        for current_date in date_range:
            d_key = current_date.date()
            
            # 1. Processa eventos do dia
            if d_key in events_by_date:
                for event in events_by_date[d_key]:
                    if event.event_type == 'COMPRA':
                        # Novo investimento começa a render
                        if event.ticker not in positions:
                            positions[event.ticker] = {
                                'invested': 0,
                                'purchase_date': current_date,
                                'current_value': 0
                            }
                        positions[event.ticker]['invested'] += event.original_value
                        positions[event.ticker]['current_value'] += event.original_value
                        positions[event.ticker]['purchase_date'] = current_date
                    
                    elif event.event_type in ('VENDA', 'VENCIMENTO'):
                        # Remove do estoque
                        if event.ticker in positions:
                            del positions[event.ticker]
                    
                    elif event.event_type == 'IMPOSTO':
                        total_taxes += abs(event.original_value)
                    
                    elif event.event_type == 'CAIXA':
                        cash_position = event.original_value
            
            # 2. Capitaliza todas as posições ativas
            total_invested = 0.0
            total_corrected = 0.0
            
            for ticker, pos in positions.items():
                # Dias desde a compra
                days_held = (current_date - pos['purchase_date']).days
                business_days = int(days_held * 252 / 365)  # Aproximação
                
                # Valor corrigido pela SELIC proxy
                invested = pos['invested']
                corrected = invested * ((1 + self.DAILY_RATE) ** business_days)
                
                pos['current_value'] = corrected
                total_invested += invested
                total_corrected += corrected
            
            # 3. Registra na série
            dates.append(current_date)
            invested_series.append(total_invested)
            corrected_series.append(total_corrected)
            cash_series.append(cash_position)
        
        # Monta DataFrame
        df_curve = pd.DataFrame({
            'date': dates,
            'invested': invested_series,
            'corrected': corrected_series,
            'cash': cash_series,
            'total': [c + cash for c, cash in zip(corrected_series, cash_series)]
        })
        df_curve.set_index('date', inplace=True)
        
        # Métricas finais
        final_invested = invested_series[-1] if invested_series else 0
        final_corrected = corrected_series[-1] if corrected_series else 0
        
        total_return_pct = 0.0
        if final_invested > 0:
            total_return_pct = ((final_corrected - final_invested) / final_invested) * 100
        
        # Retorno anualizado
        days_total = (end_date - start_date).days
        annualized_return_pct = 0.0
        if days_total > 0 and final_invested > 0:
            factor = final_corrected / final_invested
            annualized_return_pct = ((factor ** (365 / days_total)) - 1) * 100
        
        return FixedIncomeCurveResult(
            daily_curve=df_curve,
            total_invested=final_invested,
            current_value=final_corrected,
            total_return_pct=total_return_pct,
            annualized_return_pct=annualized_return_pct,
            total_taxes_paid=total_taxes,
            hypothesis_note=self.HYPOTHESIS_NOTE
        )
    
    def get_events_for_chart(self) -> pd.DataFrame:
        """Retorna eventos formatados para marcadores no gráfico."""
        if not self.events:
            return pd.DataFrame()
        
        data = []
        for e in self.events:
            if e.event_type != 'CAIXA':  # Não marca caixa
                icon = '▲' if e.event_type == 'COMPRA' else (
                    '▼' if e.event_type in ('VENDA', 'VENCIMENTO') else '🦁'
                )
                color = '#4CAF50' if e.event_type == 'COMPRA' else (
                    '#2196F3' if e.event_type in ('VENDA', 'VENCIMENTO') else '#FF5722'
                )
                data.append({
                    'date': e.date,
                    'ticker': e.ticker,
                    'type': e.event_type,
                    'value': e.original_value,
                    'icon': icon,
                    'color': color,
                    'label': f"{icon} {e.ticker}: R$ {e.original_value:,.0f}"
                })
        
        return pd.DataFrame(data)


# =============================================================================
# TESTES UNITÁRIOS
# =============================================================================
if __name__ == "__main__":
    print("=" * 60)
    print("TESTE DO MOTOR DE RENDA FIXA")
    print("=" * 60)
    
    # Teste 1: Investimento simples por 1 ano
    print("\n[Teste 1] R$ 10.000 por 252 dias uteis")
    print(f"  Taxa SELIC: {FixedIncomeEngine.SELIC_ANNUAL:.0%}")
    print(f"  Taxa Diaria: {FixedIncomeEngine.DAILY_RATE:.6f}")
    
    df_test = pd.DataFrame({
        'Data': ['2024-01-02'],
        'Ticker': ['CDB XYZ'],
        'Tipo': ['Compra'],
        'Valor': [10000.0]
    })
    
    engine = FixedIncomeEngine(df_test)
    result = engine.build_daily_curve(
        start_date=datetime(2024, 1, 2),
        end_date=datetime(2024, 12, 31)
    )
    
    print(f"  Investido: R$ {result.total_invested:,.2f}")
    print(f"  Valor Atual: R$ {result.current_value:,.2f}")
    print(f"  Retorno: {result.total_return_pct:.2f}%")
    print(f"  Retorno Anualizado: {result.annualized_return_pct:.2f}%")
    
    expected_approx = 10000 * (1 + 0.15)  # ~R$ 11.500
    if abs(result.current_value - expected_approx) < 500:
        print("  [OK] PASSOU - Valor proximo do esperado")
    else:
        print(f"  [ERRO] Esperado ~R$ {expected_approx:,.0f}")
    
    # Teste 2: Hipótese documentada
    print("\n[Teste 2] Hipotese documentada")
    print(f"  Nota: {result.hypothesis_note[:50]}...")
    assert "15%" in result.hypothesis_note
    print("  [OK] PASSOU")
    
    print("\n" + "=" * 60)
    print("[OK] TESTES CONCLUIDOS")
    print("=" * 60)

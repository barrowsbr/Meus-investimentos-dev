"""
Motor de Curva de Renda Fixa v5.0
=================================

MODOS DE VALORIZAÇÃO:
1. ENCERRADOS: Ativos com Compra + Venda + Imposto - usa taxa efetiva real
2. EM ABERTO: Ativos só com Compra - usa SELIC acumulada desde a compra

PRINCIPIO:
- Ativos encerrados: taxa efetiva real calculada
- Ativos abertos: valorização pela SELIC (BCB API ou proxy 15% a.a.)
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Tuple

# Import do enum de modo de valorizacao do motor canonico
try:
    from core.twr_canonical import RFValuationMode
except ImportError:
    from twr_canonical import RFValuationMode

from core.utils import parse_decimal_br


@dataclass
class FixedIncomeEvent:
    """Evento normalizado de renda fixa."""
    date: datetime
    ticker: str
    event_type: str  # 'COMPRA', 'VENDA', 'VENCIMENTO', 'IMPOSTO', 'CAIXA'
    amount: float    # Valor do fluxo (negativo = saída, positivo = entrada)
    original_value: float  # Valor original do evento (Valor)


@dataclass
class ClosedPosition:
    """Posição encerrada com taxa efetiva calculada."""
    ticker: str
    entry_date: datetime
    entry_value: float
    exit_date: datetime
    exit_value: float
    tax_paid: float
    net_return: float  # Retorno líquido (saída - imposto)
    total_return_pct: float  # Retorno total %
    annual_rate: float  # Taxa anual efetiva
    daily_rate: float  # Taxa diária efetiva


@dataclass
class ExternalFlow:
    """Fluxo externo para cálculo de TWR."""
    date: datetime
    amount: float  # Positivo = entrada, Negativo = saída
    flow_type: str  # 'ENTRADA_RF', 'SAIDA_RF', 'IMPOSTO_RF'
    ticker: str


@dataclass
class FixedIncomeCurveResult:
    """Resultado do motor de curva RF."""
    daily_curve: pd.DataFrame  # Série diária com invested, corrected, cash
    total_invested: float
    current_value: float
    total_return_pct: float
    annualized_return_pct: float
    total_taxes_paid: float
    hypothesis_note: str
    # NOVO: Listas para integração com TWR
    external_flows: List[ExternalFlow] = field(default_factory=list)
    closed_positions: List[ClosedPosition] = field(default_factory=list)


class FixedIncomeEngine:
    """
    Motor de Cálculo de Curva de Renda Fixa v5.0
    
    LÓGICA DE VALORIZAÇÃO:
    - Ativos ENCERRADOS (com Venda): Usa taxa efetiva real calculada
    - Ativos EM ABERTO: Usa SELIC acumulada desde a data de compra
    
    SELIC: Busca do BCB ou usa proxy de 15% a.a. se falhar.
    """
    
    # =========================================================================
    # CONSTANTES
    # =========================================================================
    BUSINESS_DAYS_YEAR = 252
    SELIC_PROXY_ANNUAL = 0.15  # 15% a.a. como fallback
    
    HYPOTHESIS_NOTES = {
        RFValuationMode.CURVA_PROXY: (
            "Ativos EM ABERTO usam SELIC acumulada. "
            "Ativos ENCERRADOS usam taxa efetiva real. "
        ),
        RFValuationMode.MTM_REAL: (
            "Marcação a mercado com preços reais."
        )
    }
    
    def __init__(
        self, 
        df_events: pd.DataFrame,
        valuation_mode: RFValuationMode = RFValuationMode.CURVA_PROXY,
        mtm_prices: Optional[pd.DataFrame] = None,
        manual_values: Optional[Dict[str, float]] = None
    ):
        self.df_raw = df_events.copy()
        self.valuation_mode = valuation_mode
        self.mtm_prices = mtm_prices
        self.manual_values = manual_values or {}
        self.events: List[FixedIncomeEvent] = []
        self.closed_positions: List[ClosedPosition] = []
        self.external_flows: List[ExternalFlow] = []
        # Mapeamento ticker -> (valor_inicial, data_compra) para abertos
        self.open_positions_data: Dict[str, Dict] = {}
        # Cache da Selic
        self._selic_cache: Optional[pd.Series] = None
        self._selic_daily_rate: float = self.SELIC_PROXY_ANNUAL / self.BUSINESS_DAYS_YEAR
        
        self._normalize_events()
        self._identify_closed_positions()
        self._calculate_open_positions_rates()
    
    def _parse_date(self, raw_date) -> Optional[datetime]:
        """Parse de data com detecção automática de formato."""
        if pd.isna(raw_date):
            return None
        
        if isinstance(raw_date, (pd.Timestamp, datetime)):
            return pd.to_datetime(raw_date)
        elif isinstance(raw_date, str):
            # Formato ISO: YYYY-MM-DD
            if len(raw_date) >= 4 and raw_date[:4].isdigit() and int(raw_date[:4]) > 1900:
                return pd.to_datetime(raw_date, dayfirst=False)
            else:
                # Formato brasileiro: DD/MM/YYYY
                return pd.to_datetime(raw_date, dayfirst=True)
        else:
            return pd.to_datetime(raw_date, dayfirst=True)
    
    def _fetch_selic_history(self) -> Optional[pd.Series]:
        """
        Busca histórico da Selic do BCB.
        Retorna série com data -> taxa diária.
        """
        try:
            import requests
            # API BCB - Série 4390 (Meta Selic % a.a.)
            url = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4390/dados?formato=json"
            response = requests.get(url, timeout=10)
            if response.status_code != 200:
                return None
            
            data = response.json()
            df = pd.DataFrame(data)
            df['data'] = pd.to_datetime(df['data'], dayfirst=True)
            df['valor'] = pd.to_numeric(df['valor'], errors='coerce')
            df = df.set_index('data').sort_index()
            
            # Converte taxa anual para diária
            # Selic vem em % (ex: 12.25 = 12.25% a.a.)
            # Taxa diária = ((1 + selic/100)^(1/252)) - 1
            df['taxa_diaria'] = ((1 + df['valor'] / 100) ** (1 / self.BUSINESS_DAYS_YEAR)) - 1
            
            return df['taxa_diaria']
        except Exception:
            return None
    
    def _get_selic_daily_rate(self, date: datetime) -> float:
        """Retorna taxa Selic diária para uma data."""
        if self._selic_cache is None:
            self._selic_cache = self._fetch_selic_history()
        
        if self._selic_cache is None or self._selic_cache.empty:
            # Fallback: proxy 15% a.a.
            return self.SELIC_PROXY_ANNUAL / self.BUSINESS_DAYS_YEAR
        
        try:
            # Busca taxa para a data (usa última disponível se não encontrar)
            rate = self._selic_cache.asof(date)
            if pd.isna(rate):
                return self.SELIC_PROXY_ANNUAL / self.BUSINESS_DAYS_YEAR
            return rate
        except:
            return self.SELIC_PROXY_ANNUAL / self.BUSINESS_DAYS_YEAR
    
    def _normalize_events(self):
        """
        Transforma eventos brutos em fluxos de caixa padronizados.
        
        Lê as colunas da planilha (nova estrutura):
        - 'Compra': data do evento
        - 'Ticker': nome do ativo
        - 'Valor': valor da operação
        - 'Tipo': tipo de transação (Compra/Venda/Imposto)
        """
        if self.df_raw.empty:
            return
        
        for _, row in self.df_raw.iterrows():
            try:
                # Nova estrutura: coluna 'Compra' é a data
                date = self._parse_date(row.get('Compra')) or self._parse_date(row.get('Data'))
                if date is None or pd.isna(date):
                    continue
                
                ticker = str(row.get('Ticker', 'UNKNOWN')).strip()
                tipo = str(row.get('Tipo', '')).strip().upper()
                
                # Use standardized robust parser
                valor = parse_decimal_br(row.get('Valor', 0))
                
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
                    amount = 0
                else:
                    # DEFAULT: Tipo não especificado = COMPRA (ativo aberto)
                    event_type = 'COMPRA'
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
        
        self.events.sort(key=lambda e: e.date)
    
    def _identify_closed_positions(self):
        """
        Identifica ativos ENCERRADOS (com compra + saída + imposto)
        e calcula taxa efetiva real para cada um.
        """
        # Agrupa eventos por ticker
        events_by_ticker: Dict[str, List[FixedIncomeEvent]] = {}
        for e in self.events:
            if e.ticker not in events_by_ticker:
                events_by_ticker[e.ticker] = []
            events_by_ticker[e.ticker].append(e)
        
        for ticker, events in events_by_ticker.items():
            # Separa por tipo
            compras = [e for e in events if e.event_type == 'COMPRA']
            saidas = [e for e in events if e.event_type in ('VENDA', 'VENCIMENTO')]
            impostos = [e for e in events if e.event_type == 'IMPOSTO']
            
            # Ativo encerrado: tem compra E saída
            if compras and saidas:
                # Usa primeira compra e última saída (simplificação)
                total_entrada = sum(c.original_value for c in compras)
                total_saida = sum(s.original_value for s in saidas)
                total_imposto = sum(i.original_value for i in impostos)
                
                entry_date = min(c.date for c in compras)
                exit_date = max(s.date for s in saidas)
                
                # Cálculo da taxa efetiva
                net_return = total_saida - total_imposto
                
                if total_entrada > 0 and net_return > 0:
                    total_return = (net_return / total_entrada) - 1
                    
                    # Dias entre entrada e saída
                    days = (exit_date - entry_date).days
                    if days > 0:
                        years = days / 365.0
                        annual_rate = (1 + total_return) ** (1 / years) - 1
                        daily_rate = (1 + annual_rate) ** (1 / self.BUSINESS_DAYS_YEAR) - 1
                        
                        self.closed_positions.append(ClosedPosition(
                            ticker=ticker,
                            entry_date=entry_date,
                            entry_value=total_entrada,
                            exit_date=exit_date,
                            exit_value=total_saida,
                            tax_paid=total_imposto,
                            net_return=net_return,
                            total_return_pct=total_return * 100,
                            annual_rate=annual_rate,
                            daily_rate=daily_rate
                        ))
    
    def _calculate_open_positions_rates(self):
        """
        Calcula valores atuais para posições EM ABERTO usando SELIC.
        """
        # Agrupa eventos por ticker
        events_by_ticker: Dict[str, List[FixedIncomeEvent]] = {}
        for e in self.events:
            if e.ticker not in events_by_ticker:
                events_by_ticker[e.ticker] = []
            events_by_ticker[e.ticker].append(e)
        
        today = datetime.now()
        
        for ticker, events in events_by_ticker.items():
            # Ignora se é posição fechada
            if self._is_position_closed(ticker):
                continue
            
            # Pega apenas compras
            compras = [e for e in events if e.event_type == 'COMPRA']
            if not compras:
                continue
            
            # Calcula totais
            total_valor_inicial = sum(c.original_value for c in compras)
            entry_date = min(c.date for c in compras)
            
            # Dias desde a compra
            days = (today - entry_date).days
            if days <= 0:
                days = 1
            
            # Calcula valor atual
            today = datetime.now()
            business_days = int(days * 252 / 365)
            
            # --- LÓGICA HÍBRIDA: Manual vs Selic ---
            # Se temos valor manual e é > 0, usamos para calcular taxa implícita
            valor_manual = self.manual_values.get(ticker, 0.0)
            
            if valor_manual > 0:
                valor_corrigido = valor_manual
                
                # Calcula taxa implícita (CAGR) para atingir este valor
                # V_final = V_inicial * (1 + rate)^business_days
                # rate = (V_final / V_inicial)^(1/business_days) - 1
                if total_valor_inicial > 0 and business_days > 0:
                    try:
                        implied_daily = (valor_corrigido / total_valor_inicial) ** (1 / business_days) - 1
                        used_rate = implied_daily
                    except:
                        used_rate = self._get_selic_daily_rate(today)
                else:
                    used_rate = 0.0
            else:
                # Fallback: Selic
                selic_rate = self._get_selic_daily_rate(today)
                valor_corrigido = total_valor_inicial * ((1 + selic_rate) ** business_days)
                used_rate = selic_rate
            
            # Retorno total
            total_return = (valor_corrigido / total_valor_inicial) - 1 if total_valor_inicial > 0 else 0
            
            # Taxa anual efetiva
            years = days / 365.0
            annual_rate = (1 + total_return) ** (1 / years) - 1 if years > 0 else 0
            
            self.open_positions_data[ticker] = {
                'valor_inicial': total_valor_inicial,
                'valor_atual': valor_corrigido,
                'entry_date': entry_date,
                'total_return': total_return,
                'annual_rate': annual_rate,
                'daily_rate': used_rate  # Taxa para projeção da curva
            }
    
    def _get_ticker_daily_rate(self, ticker: str, date: datetime) -> float:
        """
        Retorna a taxa diária para um ticker.
        
        - Encerrado: taxa efetiva real
        - Aberto: taxa Selic do dia
        """
        # Verifica se é posição encerrada
        for closed in self.closed_positions:
            if closed.ticker == ticker:
                # Verifica se a data está dentro do período da posição
                if closed.entry_date <= date <= closed.exit_date:
                    return closed.daily_rate
        
        # Posição aberta: usa taxa armazenada (pode ser Selic ou implícita manual)
        if ticker in self.open_positions_data:
            return self.open_positions_data[ticker].get('daily_rate', 0.0)
            
        return self._get_selic_daily_rate(date)
    
    def _is_position_closed(self, ticker: str) -> bool:
        """Verifica se o ticker é uma posição encerrada."""
        return any(cp.ticker == ticker for cp in self.closed_positions)
    
    def build_daily_curve(
        self, 
        start_date: Optional[datetime] = None, 
        end_date: Optional[datetime] = None
    ) -> FixedIncomeCurveResult:
        """
        Constrói a curva diária de patrimônio RF.
        
        LÓGICA:
        - Ativos encerrados: usa taxa efetiva real
        - Ativos em aberto: usa SELIC acumulada
        """
        if not self.events:
            return FixedIncomeCurveResult(
                daily_curve=pd.DataFrame(),
                total_invested=0,
                current_value=0,
                total_return_pct=0,
                annualized_return_pct=0,
                total_taxes_paid=0,
                hypothesis_note="Sem eventos RF",
                external_flows=[],
                closed_positions=[]
            )
        
        # Define período
        if start_date is None:
            start_date = min(e.date for e in self.events)
        if end_date is None:
            end_date = datetime.now()
        
        # Range de dias úteis
        date_range = pd.date_range(start=start_date, end=end_date, freq='B')
        
        # Estado interno: lotes individuais
        lots: List[Dict] = []
        cash_position = 0.0
        total_taxes = 0.0
        
        # Séries de saída
        invested_series = []
        corrected_series = []
        cash_series = []
        dates = []
        
        # Mapeia eventos por data (mapeando fins de semana para próximo dia útil)
        events_by_date = {}
        for e in self.events:
            event_date = pd.to_datetime(e.date)
            if event_date.weekday() >= 5:
                days_to_add = 7 - event_date.weekday()
                event_date = event_date + pd.Timedelta(days=days_to_add)
            d = event_date.date()
            if d not in events_by_date:
                events_by_date[d] = []
            events_by_date[d].append(e)
        
        # Registra fluxos externos para TWR
        for e in self.events:
            if e.event_type == 'COMPRA':
                self.external_flows.append(ExternalFlow(
                    date=e.date,
                    amount=e.original_value,  # Positivo = entrada de capital
                    flow_type='ENTRADA_RF',
                    ticker=e.ticker
                ))
            elif e.event_type in ('VENDA', 'VENCIMENTO'):
                self.external_flows.append(ExternalFlow(
                    date=e.date,
                    amount=-e.original_value,  # Negativo = saída de capital
                    flow_type='SAIDA_RF',
                    ticker=e.ticker
                ))
            elif e.event_type == 'IMPOSTO':
                self.external_flows.append(ExternalFlow(
                    date=e.date,
                    amount=-e.original_value,  # Negativo = pagamento
                    flow_type='IMPOSTO_RF',
                    ticker=e.ticker
                ))
        
        for current_date in date_range:
            d_key = current_date.date()
            
            # 1. Processa eventos do dia
            if d_key in events_by_date:
                for event in events_by_date[d_key]:
                    if event.event_type == 'COMPRA':
                        lots.append({
                            'ticker': event.ticker,
                            'invested': event.original_value,
                            'purchase_date': current_date,
                            'current_value': event.original_value
                        })
                    
                    elif event.event_type in ('VENDA', 'VENCIMENTO'):
                        # FIFO Partial Redemption Logic
                        # Removes value from oldest lots first until redemption amount is covered
                        val_redemption = event.original_value
                        
                        # Filter lots for this ticker
                        ticker_lots = [l for l in lots if l['ticker'] == event.ticker]
                        other_lots = [l for l in lots if l['ticker'] != event.ticker]
                        
                        # Sort by purchase date (FIFO)
                        ticker_lots.sort(key=lambda x: x['purchase_date'])
                        
                        remaining_lots = []
                        for lot in ticker_lots:
                            if val_redemption <= 0.01:
                                remaining_lots.append(lot)
                                continue
                                
                            # Calculate approximate current value of this lot for ratio
                            # (Simplified: using invested + time approximation or just invested proportional)
                            # Better: Consume PROPORTIONAL to 'invested' if we assume strict pro-rata?
                            # Or strict value matching?
                            # Default assumption: Redemption Value correlates to Current Value.
                            # We need to estimate lot current value to know how much "Invested" capital to remove.
                            
                            # Estimate current lot value (Recalculate on fly)
                            days_held_est = (current_date - lot['purchase_date']).days
                            bd_est = int(days_held_est * 252 / 365)
                            rate_est = self._get_ticker_daily_rate(lot['ticker'], current_date)
                            curr_val_est = lot['invested'] * ((1 + rate_est) ** bd_est)
                            
                            if curr_val_est <= val_redemption:
                                # Full lot consumption
                                val_redemption -= curr_val_est
                                # Lot removed (not added to remaining)
                            else:
                                # Partial lot consumption
                                # Calculate ratio of exit
                                ratio_exit = val_redemption / curr_val_est
                                
                                # Reduce invested capital proportionally
                                lot['invested'] = lot['invested'] * (1 - ratio_exit)
                                lot['current_value'] = curr_val_est - val_redemption # Approx update
                                
                                val_redemption = 0
                                remaining_lots.append(lot)
                        
                        # Rebuild lots list
                        lots = other_lots + remaining_lots
                    
                    elif event.event_type == 'IMPOSTO':
                        total_taxes += abs(event.original_value)
                    
                    elif event.event_type == 'CAIXA':
                        cash_position = event.original_value
            
            # 2. Calcula valor de cada lote
            total_invested = 0.0
            total_corrected = 0.0
            
            for lot in lots:
                invested = lot['invested']
                ticker = lot['ticker']
                purchase_date = lot['purchase_date']
                
                # Calcula dias úteis desde compra
                days_held = (current_date - purchase_date).days
                business_days = int(days_held * 252 / 365)
                
                # Taxa diária (efetiva para encerrados, Selic para abertos)
                daily_rate = self._get_ticker_daily_rate(ticker, current_date)
                
                # Valor corrigido
                corrected = invested * ((1 + daily_rate) ** business_days)
                
                lot['current_value'] = corrected
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
        
        days_total = (end_date - start_date).days
        annualized_return_pct = 0.0
        if days_total > 0 and final_invested > 0:
            factor = final_corrected / final_invested
            annualized_return_pct = ((factor ** (365 / days_total)) - 1) * 100
        
        # Nota de hipótese
        closed_count = len(self.closed_positions)
        open_count = len(set(e.ticker for e in self.events if e.event_type == 'COMPRA')) - closed_count
        
        # Verifica se usou Selic real ou proxy
        selic_source = "Selic BCB" if self._selic_cache is not None else f"proxy {self.SELIC_PROXY_ANNUAL*100:.0f}%"
        
        hypothesis = (
            f"RF: {closed_count} encerrados (taxa efetiva), "
            f"{max(0, open_count)} em aberto ({selic_source})"
        )
        
        return FixedIncomeCurveResult(
            daily_curve=df_curve,
            total_invested=final_invested,
            current_value=final_corrected,
            total_return_pct=total_return_pct,
            annualized_return_pct=annualized_return_pct,
            total_taxes_paid=total_taxes,
            hypothesis_note=hypothesis,
            external_flows=self.external_flows,
            closed_positions=self.closed_positions
        )
    
    def get_external_flows_df(self) -> pd.DataFrame:
        """Retorna DataFrame com fluxos externos para integração com TWR."""
        if not self.external_flows:
            return pd.DataFrame()
        
        return pd.DataFrame([{
            'date': f.date,
            'amount': f.amount,
            'type': f.flow_type,
            'ticker': f.ticker
        } for f in self.external_flows])
    
    def get_events_for_chart(self) -> pd.DataFrame:
        """Retorna eventos formatados para marcadores no gráfico."""
        if not self.events:
            return pd.DataFrame()
        
        data = []
        for e in self.events:
            if e.event_type != 'CAIXA':
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
# TESTES
# =============================================================================
if __name__ == "__main__":
    print("=" * 60)
    print("TESTE DO MOTOR DE RENDA FIXA v5.0 - SELIC")
    print("=" * 60)
    
    # Teste com dados reais do usuário
    df_test = pd.DataFrame({
        'Compra': [
            '2023-06-26', '2024-12-06', '2024-12-06',  # CDB BMG (encerrado)
            '2023-08-04',  # CDB BCO Master pos (aberto)
            '2024-04-22',  # NTN-B (aberto)
        ],
        'Ticker': [
            'CDB BMG', 'CDB BMG', 'CDB BMG',
            'CDB BCO Master pos',
            'NTN-B',
        ],
        'Tipo': [
            'Compra', 'Venda', 'Imposto',
            'Compra',
            'Compra',
        ],
        'Valor': [5000.09, 5943.28, 165.06, 6000, 8753.53]
    })
    
    engine = FixedIncomeEngine(df_test)
    
    print("\n[1] Eventos processados:")
    for e in engine.events:
        print(f"    {e.date.date()} | {e.ticker[:20]:20} | {e.event_type:10} | R$ {e.original_value:,.2f}")
    
    print(f"\n[2] Posições encerradas: {len(engine.closed_positions)}")
    for cp in engine.closed_positions:
        print(f"    {cp.ticker}: {cp.total_return_pct:.2f}% total, {cp.annual_rate*100:.2f}% a.a.")
    
    print(f"\n[3] Posições abertas: {len(engine.open_positions_data)}")
    for ticker, data in engine.open_positions_data.items():
        print(f"    {ticker[:20]:20}: R$ {data['valor_inicial']:,.2f} -> R$ {data['valor_atual']:,.2f} ({data['total_return']*100:.2f}%)")
    
    result = engine.build_daily_curve()
    print(f"\n[4] Resultado:")
    print(f"    Investido: R$ {result.total_invested:,.2f}")
    print(f"    Atual: R$ {result.current_value:,.2f}")
    print(f"    Retorno: {result.total_return_pct:.2f}%")
    print(f"    Anualizado: {result.annualized_return_pct:.2f}%")
    print(f"    Hipótese: {result.hypothesis_note}")
    
    print("\n" + "=" * 60)
    print("[OK] TESTE CONCLUÍDO")
    print("=" * 60)

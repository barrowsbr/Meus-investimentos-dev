"""
Flow Ledger — Registro Tipado de Fluxos de Caixa
=================================================

Constrói um ledger auditável de todos os eventos financeiros do portfólio:
aportes BRL, conversões FX, compras/vendas de ativos, dividendos e taxas.

Cada fluxo é armazenado com: data, valor, moeda, tipo, ativo, taxa FX,
e valor equivalente em BRL.

Versão: 1.0.0
Data: 2026-02-11
"""

import pandas as pd
import numpy as np
from enum import Enum
from dataclasses import dataclass, field
from typing import List, Dict, Optional


# =============================================================================
# TYPES
# =============================================================================

class FlowType(Enum):
    """Tipo de evento financeiro."""
    APORTE_BRL = "aporte_brl"
    CONVERSAO_FX = "conversao_fx"
    COMPRA_ATIVO = "compra_ativo"
    VENDA_ATIVO = "venda_ativo"
    DIVIDENDO = "dividendo"
    TAXA = "taxa"
    ENTRADA_RF = "entrada_rf"
    SAIDA_RF = "saida_rf"


@dataclass
class CashFlow:
    """Um fluxo de caixa individual, completamente tipado."""
    date: pd.Timestamp
    amount: float           # Valor na moeda original
    currency: str           # Moeda do fluxo ('BRL', 'USD', etc.)
    flow_type: FlowType     # Tipo do evento
    ticker: Optional[str] = None        # Ativo relacionado (se aplicável)
    fx_rate: Optional[float] = None     # Taxa FX no momento
    amount_brl: Optional[float] = None  # Valor equivalente em BRL
    notes: str = ""                     # Observações

    def to_dict(self) -> dict:
        return {
            'date': self.date,
            'amount': self.amount,
            'currency': self.currency,
            'flow_type': self.flow_type.value,
            'ticker': self.ticker or '',
            'fx_rate': self.fx_rate,
            'amount_brl': self.amount_brl,
            'notes': self.notes,
        }


@dataclass
class FlowLedger:
    """Ledger completo de fluxos, com métodos de consulta."""
    flows: List[CashFlow] = field(default_factory=list)

    def add(self, flow: CashFlow):
        self.flows.append(flow)

    def to_dataframe(self) -> pd.DataFrame:
        if not self.flows:
            return pd.DataFrame(columns=[
                'date', 'amount', 'currency', 'flow_type',
                'ticker', 'fx_rate', 'amount_brl', 'notes'
            ])
        return pd.DataFrame([f.to_dict() for f in self.flows]).sort_values('date').reset_index(drop=True)

    def filter_by_type(self, flow_type: FlowType) -> 'FlowLedger':
        return FlowLedger(flows=[f for f in self.flows if f.flow_type == flow_type])

    def filter_by_ticker(self, ticker: str) -> 'FlowLedger':
        return FlowLedger(flows=[f for f in self.flows if f.ticker == ticker])

    def filter_by_currency(self, currency: str) -> 'FlowLedger':
        return FlowLedger(flows=[f for f in self.flows if f.currency == currency])

    def filter_by_period(self, start: pd.Timestamp, end: pd.Timestamp) -> 'FlowLedger':
        return FlowLedger(flows=[
            f for f in self.flows
            if start <= f.date <= end
        ])

    def total_brl(self) -> float:
        return sum(f.amount_brl or 0 for f in self.flows)

    def total_native(self) -> float:
        return sum(f.amount for f in self.flows)

    @property
    def signed_cashflows_brl(self) -> List[tuple]:
        """
        Retorna fluxos em formato (data, valor_brl) para MWR/IRR.
        Convenção: aportes = negativo (saída do investidor), resgates = positivo.
        """
        result = []
        for f in sorted(self.flows, key=lambda x: x.date):
            val_brl = f.amount_brl if f.amount_brl is not None else f.amount
            if f.flow_type in (FlowType.APORTE_BRL, FlowType.COMPRA_ATIVO,
                               FlowType.CONVERSAO_FX, FlowType.ENTRADA_RF):
                result.append((f.date, -abs(val_brl)))
            elif f.flow_type in (FlowType.VENDA_ATIVO, FlowType.DIVIDENDO,
                                 FlowType.SAIDA_RF):
                result.append((f.date, abs(val_brl)))
            elif f.flow_type == FlowType.TAXA:
                result.append((f.date, -abs(val_brl)))
        return result

    def __len__(self):
        return len(self.flows)


# =============================================================================
# BUILDER — Constrói ledger a partir dos dados do portfólio
# =============================================================================

def build_flow_ledger(
    df_assets: pd.DataFrame,
    df_proventos: pd.DataFrame,
    df_cambio: pd.DataFrame,
    fx_rates: Dict[str, pd.Series],
    df_rf_raw: pd.DataFrame = None,
) -> FlowLedger:
    """
    Constrói o FlowLedger completo a partir dos dados brutos.

    Parameters
    ----------
    df_assets : DataFrame com transações de ativos (compra/venda)
    df_proventos : DataFrame com dividendos/JCP
    df_cambio : DataFrame com remessas FX
    fx_rates : Dict com séries de câmbio {'USD': Series, 'EUR': Series}
    df_rf_raw : DataFrame com renda fixa (opcional)

    Returns
    -------
    FlowLedger com todos os fluxos tipados
    """
    ledger = FlowLedger()

    # ── 1. CONVERSÕES FX (remessas) ──────────────────────────────────────
    if df_cambio is not None and not df_cambio.empty:
        df_c = df_cambio.copy()
        df_c['data'] = pd.to_datetime(df_c['data'], dayfirst=True, errors='coerce')
        df_c = df_c.dropna(subset=['data'])

        for _, row in df_c.iterrows():
            try:
                valor_brl = float(row.get('valor_brl', 0) or 0)
                valor_foreign = float(row.get('valor_usd', 0) or row.get('valor', 0) or 0)
                moeda_dest = str(row.get('moeda_destino', row.get('moeda', 'USD'))).upper().strip()
                taxa = valor_brl / valor_foreign if valor_foreign != 0 else None

                ledger.add(CashFlow(
                    date=row['data'],
                    amount=valor_foreign,
                    currency=moeda_dest,
                    flow_type=FlowType.CONVERSAO_FX,
                    fx_rate=taxa,
                    amount_brl=valor_brl,
                    notes=f"Remessa BRL→{moeda_dest}",
                ))
            except (ValueError, TypeError, KeyError):
                continue

    # ── 2. COMPRAS E VENDAS DE ATIVOS ────────────────────────────────────
    if df_assets is not None and not df_assets.empty:
        df_a = df_assets.copy()
        df_a['data'] = pd.to_datetime(df_a['data'], dayfirst=True, errors='coerce')
        df_a = df_a.dropna(subset=['data'])

        for _, row in df_a.iterrows():
            try:
                ticker = str(row['ticker']).strip()
                moeda = str(row.get('moeda', 'BRL')).upper().strip()
                tipo = str(row.get('tipo', '')).lower()
                preco = float(row.get('preco', 0))
                qtd = float(row.get('quantidade', 0))
                valor = preco * qtd

                is_compra = 'compra' in tipo
                flow_type = FlowType.COMPRA_ATIVO if is_compra else FlowType.VENDA_ATIVO

                # Get FX rate for this date
                fx = 1.0
                if moeda != 'BRL' and moeda in fx_rates:
                    fx_series = fx_rates[moeda]
                    fx = fx_series.asof(row['data'])
                    if pd.isna(fx):
                        fx = fx_series.dropna().iloc[-1] if not fx_series.dropna().empty else 1.0

                ledger.add(CashFlow(
                    date=row['data'],
                    amount=valor,
                    currency=moeda,
                    flow_type=flow_type,
                    ticker=ticker,
                    fx_rate=fx if moeda != 'BRL' else None,
                    amount_brl=valor * fx,
                    notes=f"{'Compra' if is_compra else 'Venda'} {qtd:.0f}x {ticker} @ {preco:.2f} {moeda}",
                ))
            except (ValueError, TypeError, KeyError):
                continue

    # ── 3. DIVIDENDOS / PROVENTOS ────────────────────────────────────────
    if df_proventos is not None and not df_proventos.empty:
        df_p = df_proventos.copy()
        df_p['data'] = pd.to_datetime(df_p['data'], dayfirst=True, errors='coerce')
        df_p = df_p.dropna(subset=['data'])

        for _, row in df_p.iterrows():
            try:
                valor = float(row['valor'])
                moeda = str(row.get('moeda', 'BRL')).upper().strip()
                ticker = str(row.get('ticker', '')).strip()

                fx = 1.0
                if moeda != 'BRL' and moeda in fx_rates:
                    fx_series = fx_rates[moeda]
                    fx = fx_series.asof(row['data'])
                    if pd.isna(fx):
                        fx = 1.0

                ledger.add(CashFlow(
                    date=row['data'],
                    amount=valor,
                    currency=moeda,
                    flow_type=FlowType.DIVIDENDO,
                    ticker=ticker,
                    fx_rate=fx if moeda != 'BRL' else None,
                    amount_brl=valor * fx,
                    notes=f"Dividendo {ticker}",
                ))
            except (ValueError, TypeError, KeyError):
                continue

    # ── 4. RENDA FIXA ────────────────────────────────────────────────────
    if df_rf_raw is not None and not df_rf_raw.empty:
        df_rf = df_rf_raw.copy()
        date_col = 'Compra' if 'Compra' in df_rf.columns else 'Data'
        df_rf[date_col] = pd.to_datetime(df_rf[date_col], dayfirst=True, errors='coerce')
        df_rf = df_rf.dropna(subset=[date_col])

        for _, row in df_rf.iterrows():
            try:
                ticker = str(row.get('Ticker', 'RF')).strip()
                valor = float(row.get('Valor', 0))
                moeda = str(row.get('Moeda', 'BRL')).upper().strip()

                fx = 1.0
                if moeda != 'BRL' and moeda in fx_rates:
                    fx_series = fx_rates[moeda]
                    fx = fx_series.asof(row[date_col])
                    if pd.isna(fx):
                        fx = 1.0

                ledger.add(CashFlow(
                    date=row[date_col],
                    amount=valor,
                    currency=moeda,
                    flow_type=FlowType.ENTRADA_RF,
                    ticker=ticker,
                    fx_rate=fx if moeda != 'BRL' else None,
                    amount_brl=valor * fx,
                    notes=f"Entrada RF: {ticker}",
                ))
            except (ValueError, TypeError, KeyError):
                continue

    return ledger

"""
Motor de TWR Unificado da Vida Financeira
Versao 2.0 - Curva Mestra (RV + RF + Cash) com Motor Canonico

PRINCIPIO INEGOCIAVEL:
- TWR é calculado sobre patrimonio TOTAL, nao por classe isolada
- Nao existe soma de TWRs ou media ponderada
- A unica forma valida: Curva Unica -> TWR Unico

Arquitetura:
1. Recebe curvas diarias separadas (RV mark-to-market, RF sintetica, Cash)
2. Merge em curva mestra unica sem buracos
3. Classifica fluxos: externo (aporte/resgate) vs interno (RV<->RF)
4. DELEGA calculo de TWR para twr_canonical.calculate_canonical_twr()

REFATORADO em 2026-01-20: Agora usa motor canonico como FONTE UNICA DA VERDADE.
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Tuple

# Import do motor canonico - FONTE UNICA DA VERDADE
try:
    from core.twr_canonical import calculate_canonical_twr, DEFAULT_PREMISES, FlowTiming
except ImportError:
    from twr_canonical import calculate_canonical_twr, DEFAULT_PREMISES, FlowTiming


@dataclass
class FlowEvent:
    """Fluxo de caixa classificado."""
    date: datetime
    amount: float           # Positivo = entrada, Negativo = saída
    flow_type: str          # 'EXTERNAL_IN', 'EXTERNAL_OUT', 'INTERNAL', 'TAX'
    description: str
    asset_class: str        # 'RV', 'RF', 'CASH', 'GLOBAL'
    is_external: bool       # True = impacta TWR, False = ignorar


@dataclass
class UnifiedTWRResult:
    """Resultado do motor unificado."""
    # Curva mestra
    master_curve: pd.DataFrame  # date, rv, rf, cash, total
    
    # TWR Global
    twr_global: float
    twr_annualized: float
    
    # TWR por classe (para comparação)
    twr_rv: float
    twr_rf: float
    
    # Validação
    validation_passed: bool
    validation_notes: List[str]
    
    # Fluxos
    total_external_flows: float
    external_flow_dates: List[str]
    
    # Transparência
    hypothesis_notes: Dict[str, str]


class UnifiedPerformanceEngine:
    """
    Motor de Performance Unificado.
    
    Combina RV (mark-to-market) + RF (sintético) + Cash em uma
    curva mestra única e calcula TWR global GIPS-compliant.
    """
    
    # Hipóteses documentadas
    HYPOTHESIS = {
        "rv": "RV usa preços mark-to-market (Yahoo Finance)",
        "rf": "RF usa proxy SELIC 15% a.a. (capitalização diária)",
        "twr": "TWR global elimina efeito de aportes/resgates externos"
    }
    
    def __init__(
        self,
        rv_curve: pd.DataFrame,      # index=date, columns=['nav'] ou valor único
        rf_curve: pd.DataFrame,      # index=date, columns=['corrected'] ou similar
        cash_series: pd.Series,      # index=date, values=saldo
        rv_flows: pd.DataFrame,      # date, amount, tipo
        rf_flows: pd.DataFrame,      # date, amount, tipo
        external_deposits: Optional[pd.DataFrame] = None  # Aportes externos puros
    ):
        """
        Inicializa o motor unificado.
        
        Args:
            rv_curve: Série diária de patrimônio RV (mark-to-market)
            rf_curve: Série diária de patrimônio RF (sintético)
            cash_series: Série diária de saldo em caixa
            rv_flows: Fluxos de RV (compras, vendas, dividendos)
            rf_flows: Fluxos de RF (compras, vencimentos, impostos)
            external_deposits: Aportes/resgates externos (opcional)
        """
        self.rv_curve = rv_curve.copy() if not rv_curve.empty else pd.DataFrame()
        self.rf_curve = rf_curve.copy() if not rf_curve.empty else pd.DataFrame()
        self.cash_series = cash_series.copy() if not cash_series.empty else pd.Series(dtype=float)
        self.rv_flows = rv_flows.copy() if rv_flows is not None and not rv_flows.empty else pd.DataFrame()
        self.rf_flows = rf_flows.copy() if rf_flows is not None and not rf_flows.empty else pd.DataFrame()
        self.external_deposits = external_deposits
        
        # Estado interno
        self._master_curve = pd.DataFrame()
        self._unified_flows: List[FlowEvent] = []
        self._validation_notes: List[str] = []
    
    def build_master_curve(self) -> pd.DataFrame:
        """
        Constrói a curva mestra diária unificando RV + RF + Cash.
        
        IMPORTANTE: 
        - RF valores são 0 antes do primeiro investimento RF
        - Forward-fill só acontece DEPOIS que os dados começam
        - Isso evita propagar valores RF para datas antes do primeiro investimento
        """
        # Determina range de datas
        all_dates = set()
        
        if not self.rv_curve.empty:
            all_dates.update(pd.to_datetime(self.rv_curve.index))
        if not self.rf_curve.empty:
            all_dates.update(pd.to_datetime(self.rf_curve.index))
        if not self.cash_series.empty:
            all_dates.update(pd.to_datetime(self.cash_series.index))
        
        if not all_dates:
            return pd.DataFrame()
        
        # Range contínuo
        date_range = pd.date_range(
            start=min(all_dates),
            end=max(all_dates),
            freq='D'
        )
        
        # Extrai RV - pode usar forward-fill porque RV sempre tem dados desde o início
        rv_values = pd.Series(0.0, index=date_range)
        if not self.rv_curve.empty:
            self.rv_curve.index = pd.to_datetime(self.rv_curve.index)
            rv_col = 'nav' if 'nav' in self.rv_curve.columns else self.rv_curve.columns[0]
            rv_source = self.rv_curve[rv_col].reindex(date_range)
            rv_values = rv_source.ffill().fillna(0)
        
        # Extrai RF - NÃO faz forward-fill antes do primeiro dado!
        rf_values = pd.Series(0.0, index=date_range)
        if not self.rf_curve.empty:
            self.rf_curve.index = pd.to_datetime(self.rf_curve.index)
            rf_col = 'corrected' if 'corrected' in self.rf_curve.columns else self.rf_curve.columns[0]
            rf_source = self.rf_curve[rf_col]
            
            # Encontra a primeira data com valor RF
            first_rf_date = rf_source.first_valid_index()
            
            if first_rf_date is not None:
                # Só reindexa e forward-fill a partir da primeira data RF
                rf_reindexed = rf_source.reindex(date_range)
                rf_values = rf_reindexed.ffill().fillna(0)
                # Garante que é 0 antes do primeiro investimento
                rf_values.loc[rf_values.index < first_rf_date] = 0
        
        # Cash
        cash_values = pd.Series(0.0, index=date_range)
        if not self.cash_series.empty:
            self.cash_series.index = pd.to_datetime(self.cash_series.index)
            cash_values = self.cash_series.reindex(date_range).ffill().fillna(0)
        
        # Curva mestra
        self._master_curve = pd.DataFrame({
            'rv': rv_values.values,
            'rf': rf_values.values,
            'cash': cash_values.values,
            'total': rv_values.values + rf_values.values + cash_values.values
        }, index=date_range)
        
        return self._master_curve
    
    def classify_flows(self) -> List[FlowEvent]:
        """
        Classifica todos os fluxos em externos vs internos.
        
        EXTERNOS (impactam TWR):
        - Aportes novos vindos de fora do sistema
        - Resgates para fora do sistema
        - Impostos pagos
        
        INTERNOS (ignorados no TWR):
        - Movimentação RV → RF
        - Movimentação RF → RV
        - Rebalanceamentos
        - Reinvestimentos de dividendos
        """
        self._unified_flows = []
        
        # Processa fluxos de RV
        if not self.rv_flows.empty:
            for _, row in self.rv_flows.iterrows():
                date = pd.to_datetime(row.get('data', row.get('date', row.get('Data'))))
                amount = float(row.get('valor', row.get('flow', row.get('amount', 0))) or 0)
                tipo = str(row.get('tipo', row.get('type', ''))).upper()
                
                if pd.isna(date):
                    continue
                
                # Classificação heurística
                # Compra grande pode ser aporte externo, compra pequena pode ser reinvestimento
                # Por simplicidade: Compras/Vendas são sempre externas no RV
                if 'COMPRA' in tipo or 'ENTRADA' in tipo:
                    is_external = True
                    flow_type = 'EXTERNAL_IN'
                elif 'VENDA' in tipo or 'SAIDA' in tipo:
                    is_external = True
                    flow_type = 'EXTERNAL_OUT'
                elif 'DIVIDENDO' in tipo or 'JCP' in tipo:
                    is_external = False  # Reinvestido internamente
                    flow_type = 'INTERNAL'
                else:
                    is_external = True
                    flow_type = 'EXTERNAL_IN' if amount > 0 else 'EXTERNAL_OUT'
                
                self._unified_flows.append(FlowEvent(
                    date=date,
                    amount=amount,
                    flow_type=flow_type,
                    description=tipo,
                    asset_class='RV',
                    is_external=is_external
                ))
        
        # Processa fluxos de RF
        if not self.rf_flows.empty:
            for _, row in self.rf_flows.iterrows():
                date = pd.to_datetime(row.get('Data', row.get('date')))
                amount = float(row.get('Valor', row.get('amount', 0)) or 0)
                tipo = str(row.get('Tipo', row.get('type', ''))).upper()
                
                if pd.isna(date):
                    continue
                
                if 'COMPRA' in tipo:
                    is_external = True
                    flow_type = 'EXTERNAL_IN'
                elif 'VENDA' in tipo or 'VENCIMENTO' in tipo or 'RESGATE' in tipo:
                    # Vencimento de RF normalmente é resgate externo
                    is_external = True
                    flow_type = 'EXTERNAL_OUT'
                elif 'IMPOSTO' in tipo or 'IR' in tipo:
                    is_external = True
                    flow_type = 'TAX'
                else:
                    is_external = True
                    flow_type = 'EXTERNAL_IN' if amount > 0 else 'EXTERNAL_OUT'
                
                self._unified_flows.append(FlowEvent(
                    date=date,
                    amount=amount,
                    flow_type=flow_type,
                    description=tipo,
                    asset_class='RF',
                    is_external=is_external
                ))
        
        # Ordena por data
        self._unified_flows.sort(key=lambda f: f.date)
        
        return self._unified_flows
    
    def calculate_global_twr(self) -> UnifiedTWRResult:
        """
        Calcula o TWR global sobre a curva mestra.
        
        REFATORADO: Agora DELEGA para twr_canonical.calculate_canonical_twr()
        como FONTE UNICA DA VERDADE.
        
        Este metodo:
        1. Constroi a curva mestra (NAV total)
        2. Classifica fluxos (externos vs internos)
        3. Monta DataFrame para o motor canonico
        4. DELEGA calculo para calculate_canonical_twr()
        """
        # Garante que curva mestra existe
        if self._master_curve.empty:
            self.build_master_curve()
        
        if self._master_curve.empty:
            return self._empty_result()
        
        # Classifica fluxos
        if not self._unified_flows:
            self.classify_flows()
        
        # Filtra apenas fluxos externos
        external_flows = [f for f in self._unified_flows if f.is_external]
        
        # Agrupa fluxos por data
        flows_by_date = {}
        first_date = self._master_curve.index[0].date()
        
        for f in external_flows:
            d = f.date.date() if hasattr(f.date, 'date') else f.date
            
            # IMPORTANTE: Ignora fluxos no primeiro dia (capital inicial)
            if d == first_date:
                continue
            
            if d not in flows_by_date:
                flows_by_date[d] = 0
            
            # Compra = fluxo que entra no sistema
            # Venda = fluxo que sai do sistema
            if f.flow_type == 'EXTERNAL_IN':
                flows_by_date[d] += abs(f.amount)  # Entrada positiva
            else:
                flows_by_date[d] -= abs(f.amount)  # Saída negativa
        
        # =====================================================================
        # DELEGAR PARA MOTOR CANONICO
        # =====================================================================
        curve = self._master_curve['total']
        
        if len(curve) < 2:
            return self._empty_result()
        
        # Monta DataFrame no formato esperado pelo motor canonico
        flow_series = pd.Series(0.0, index=curve.index)
        for d, amount in flows_by_date.items():
            # Encontra o indice correspondente
            matching_idx = [idx for idx in curve.index if idx.date() == d]
            if matching_idx:
                flow_series.loc[matching_idx[0]] = amount
        
        # Adiciona primeiro fluxo (capital inicial)
        flow_series.iloc[0] = curve.iloc[0]  # Primeiro NAV é o deposito inicial
        
        df_for_canonical = pd.DataFrame({
            'nav': curve,
            'flow': flow_series,
            'income': 0.0  # Proventos ja estao incorporados no NAV das curvas
        })
        
        # CALCULA USANDO MOTOR CANONICO
        try:
            canonical_result = calculate_canonical_twr(df_for_canonical, DEFAULT_PREMISES)
            twr_global = canonical_result.total_twr
            twr_annualized = canonical_result.annualized_twr
        except Exception as e:
            # Fallback em caso de erro
            twr_global = 0.0
            twr_annualized = 0.0
        
        # Calcula TWR por classe para comparacao (retorno simples, nao TWR puro)
        twr_rv = self._calculate_class_twr('rv')
        twr_rf = self._calculate_class_twr('rf')
        
        # Validacao cruzada
        validation_passed, validation_notes = self._validate_cross_check(twr_global, twr_rv, twr_rf)
        
        # Adiciona nota sobre uso do motor canonico
        validation_notes.append("[INFO] TWR calculado via twr_canonical (FONTE UNICA)")
        
        # Total de fluxos externos (excluindo primeiro dia)
        total_external = sum(abs(flows_by_date.get(d, 0)) for d in flows_by_date)
        external_dates = sorted([str(d) for d in flows_by_date.keys()])
        
        return UnifiedTWRResult(
            master_curve=self._master_curve,
            twr_global=twr_global,
            twr_annualized=twr_annualized,
            twr_rv=twr_rv,
            twr_rf=twr_rf,
            validation_passed=validation_passed,
            validation_notes=validation_notes,
            total_external_flows=total_external,
            external_flow_dates=external_dates,
            hypothesis_notes=self.HYPOTHESIS
        )
    
    def _calculate_class_twr(self, asset_class: str) -> float:
        """
        Calcula TWR para uma classe individual usando chain-linking diário.
        
        Importante: Este é o retorno SIMPLES da curva, não o TWR puro
        (que precisaria dos fluxos específicos da classe).
        Serve para comparação relativa, não absoluta.
        """
        if self._master_curve.empty or asset_class not in self._master_curve.columns:
            return 0.0
        
        series = self._master_curve[asset_class]
        
        # Remove zeros iniciais
        first_nonzero = series[series > 0].first_valid_index()
        if first_nonzero is None:
            return 0.0
        
        series = series.loc[first_nonzero:]
        
        if len(series) < 2:
            return 0.0
        
        # Chain-linking diário (sem fluxos - simplificação)
        # Isso mostra apenas a variação patrimonial, não TWR puro
        daily_returns = []
        
        for i in range(1, len(series)):
            nav_start = series.iloc[i - 1]
            nav_end = series.iloc[i]
            
            if nav_start > 0:
                r = (nav_end - nav_start) / nav_start
                
                # Sanity check: retornos diários > 50% são suspeitos
                if abs(r) < 0.5:
                    daily_returns.append(1 + r)
        
        if not daily_returns:
            return 0.0
        
        # Encadeia
        twr = 1.0
        for r in daily_returns:
            twr *= r
        twr -= 1
        
        # Sanity check final: TWR > 500% é quase certamente erro de dados
        if abs(twr) > 5.0:  # > 500%
            return 0.0  # Retorna 0 em vez de valor absurdo
        
        return twr
    
    def _validate_cross_check(
        self, 
        twr_global: float, 
        twr_rv: float, 
        twr_rf: float
    ) -> Tuple[bool, List[str]]:
        """Valida consistência entre TWRs."""
        notes = []
        passed = True
        
        # Verifica se TWR global está entre os TWRs das classes
        if twr_rv != 0 and twr_rf != 0:
            min_twr = min(twr_rv, twr_rf)
            max_twr = max(twr_rv, twr_rf)
            
            # Tolerância de 5%
            if twr_global < min_twr - 0.05 or twr_global > max_twr + 0.05:
                notes.append(
                    f"[AVISO] TWR Global ({twr_global:.2%}) fora do range esperado "
                    f"[{min_twr:.2%}, {max_twr:.2%}]"
                )
                passed = False
            else:
                notes.append(f"[OK] TWR Global dentro do range das classes")
        
        elif twr_rv != 0 and twr_rf == 0:
            # Só RV - TWR global deveria ser ≈ TWR RV
            diff = abs(twr_global - twr_rv)
            if diff > 0.05:
                notes.append(
                    f"[AVISO] TWR Global ({twr_global:.2%}) diverge de TWR RV ({twr_rv:.2%})"
                )
                passed = False
            else:
                notes.append(f"[OK] TWR Global ~ TWR RV (período sem RF)")
        
        elif twr_rf != 0 and twr_rv == 0:
            # Só RF - TWR global deveria ser ≈ TWR RF
            diff = abs(twr_global - twr_rf)
            if diff > 0.05:
                notes.append(
                    f"[AVISO] TWR Global ({twr_global:.2%}) diverge de TWR RF ({twr_rf:.2%})"
                )
                passed = False
            else:
                notes.append(f"[OK] TWR Global ~ TWR RF (período sem RV)")
        
        return passed, notes
    
    def _empty_result(self) -> UnifiedTWRResult:
        """Retorna resultado vazio."""
        return UnifiedTWRResult(
            master_curve=pd.DataFrame(),
            twr_global=0.0,
            twr_annualized=0.0,
            twr_rv=0.0,
            twr_rf=0.0,
            validation_passed=False,
            validation_notes=["Sem dados suficientes"],
            total_external_flows=0.0,
            external_flow_dates=[],
            hypothesis_notes=self.HYPOTHESIS
        )
    
    def get_stacked_chart_data(self) -> pd.DataFrame:
        """Retorna dados formatados para gráfico stacked."""
        if self._master_curve.empty:
            self.build_master_curve()
        
        return self._master_curve[['rv', 'rf', 'cash']].copy()


# =============================================================================
# TESTES UNITÁRIOS
# =============================================================================
if __name__ == "__main__":
    print("=" * 60)
    print("TESTE DO MOTOR TWR UNIFICADO")
    print("=" * 60)
    
    # Teste 1: Cenário puro RV
    print("\n[Teste 1] Cenario puro RV (10% de retorno)")
    
    dates = pd.date_range('2024-01-01', periods=252, freq='D')
    rv_curve = pd.DataFrame({
        'nav': np.linspace(100000, 110000, 252)  # 10% no ano
    }, index=dates)
    
    rv_flows = pd.DataFrame({
        'data': ['2024-01-01'],
        'valor': [100000],
        'tipo': ['Compra']
    })
    
    engine = UnifiedPerformanceEngine(
        rv_curve=rv_curve,
        rf_curve=pd.DataFrame(),
        cash_series=pd.Series(dtype=float),
        rv_flows=rv_flows,
        rf_flows=pd.DataFrame()
    )
    
    result = engine.calculate_global_twr()
    
    print(f"  TWR Global: {result.twr_global:.2%}")
    print(f"  TWR RV: {result.twr_rv:.2%}")
    print(f"  Validacao: {result.validation_passed}")
    
    if 0.08 < result.twr_global < 0.12:
        print("  [OK] PASSOU")
    else:
        print("  [ERRO] TWR fora do esperado")
    
    # Teste 2: Cenário misto 50/50
    print("\n[Teste 2] Cenario misto RV (10%) + RF (15%)")
    
    rf_curve = pd.DataFrame({
        'corrected': np.linspace(100000, 115000, 252)  # 15% no ano
    }, index=dates)
    
    rf_flows = pd.DataFrame({
        'Data': ['2024-01-01'],
        'Valor': [100000],
        'Tipo': ['Compra']
    })
    
    engine2 = UnifiedPerformanceEngine(
        rv_curve=rv_curve,
        rf_curve=rf_curve,
        cash_series=pd.Series(dtype=float),
        rv_flows=rv_flows,
        rf_flows=rf_flows
    )
    
    result2 = engine2.calculate_global_twr()
    
    print(f"  TWR Global: {result2.twr_global:.2%}")
    print(f"  TWR RV: {result2.twr_rv:.2%}")
    print(f"  TWR RF: {result2.twr_rf:.2%}")
    print(f"  Validacao: {result2.validation_notes}")
    
    # TWR global deveria estar entre 10% e 15%
    if 0.10 < result2.twr_global < 0.15:
        print("  [OK] PASSOU - TWR global entre RV e RF")
    else:
        print("  [AVISO] TWR global fora do range esperado")
    
    # Teste 3: Hipóteses documentadas
    print("\n[Teste 3] Hipoteses documentadas")
    assert "SELIC" in result.hypothesis_notes['rf']
    assert "mark-to-market" in result.hypothesis_notes['rv']
    print(f"  RF: {result.hypothesis_notes['rf'][:50]}...")
    print(f"  RV: {result.hypothesis_notes['rv'][:50]}...")
    print("  [OK] PASSOU")
    
    print("\n" + "=" * 60)
    print("[OK] TESTES CONCLUIDOS")
    print("=" * 60)

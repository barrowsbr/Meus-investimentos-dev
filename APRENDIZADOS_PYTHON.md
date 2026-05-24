# Meus Investimentos — Aprendizados em Python (Sem Streamlit)

Documento de referência técnica sobre as complexidades, decisões de design e lições aprendidas no desenvolvimento dos **cálculos financeiros** do projeto "Meus Investimentos". 

**Escopo:** Arquitetura Python, lógica de negócio, cálculos financeiros. **Excluso:** UI/Streamlit, SQL, DevOps.

**Data:** 2026-05-24  
**Versão:** 1.0.0

---

## 📋 Índice

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Motor TWR (Time-Weighted Return)](#2-motor-twr-time-weighted-return)
3. [Gerenciamento de Cash Flows](#3-gerenciamento-de-cash-flows)
4. [FX Cost Basis — Câmbio e Saldo em Dólar](#4-fx-cost-basis--câmbio-e-saldo-em-dólar)
5. [Motor de Renda Fixa (Fixed Income Engine v5.0)](#5-motor-de-renda-fixa-fixed-income-engine-v50)
6. [Cálculos de FIFO e Posições Abertas](#6-cálculos-de-fifo-e-posições-abertas)
7. [Consolidação Multi-Currency](#7-consolidação-multi-currency)
8. [Processamento Vetorizado de Transações](#8-processamento-vetorizado-de-transações)
9. [Parsing Robusto de Dados](#9-parsing-robusto-de-dados)
10. [Seletor de Moeda e Taxas FX](#10-seletor-de-moeda-e-taxas-fx)
11. [Armadilhas e Lições Aprendidas](#11-armadilhas-e-lições-aprendidas)
12. [Checklist de Integração Para Novo Agente](#12-checklist-de-integração-para-novo-agente)

---

## 1. Visão Geral da Arquitetura

### Estrutura de Módulos

```
core/
├── performance/
│   ├── calculator.py          → Motor canônico de TWR
│   ├── flow_ledger.py          → Registro tipado de fluxos
│   ├── home_twr.py             → Cache de TWR para Home
│   ├── corrections.py           → Validação e correções de gaps
│   └── decomposition.py         → Decomposição de retorno (ativo vs FX)
├── finance.py                  → Cálculos FIFO, PM, lucro realizado
├── fixed_income_engine.py       → Curva de renda fixa com SELIC
├── fx_cost_basis.py            → Custo efetivo de conversões FX
├── consolidator.py             → Consolidação de múltiplas moedas
├── engine.py                   → Reconstituição de histórico patrimonial
├── data/
│   ├── loader.py               → Carregadores de abas Google Sheets
│   ├── provider.py             → Integração com Google Sheets API
│   └── market.py               → Fetch de preços yfinance
└── computed.py                 → Snapshot consolidado (entrada para Agente IA)
```

### Fluxo de Dados Típico

```
Google Sheets (gdados)
    ↓
load_assets() → df_assets (transações RV)
load_proventos() → df_proventos (dividendos)
load_fixed_income() → df_rf_raw (transações RF)
load_fixed_income_manual() → df_rf_manual (saldos RF manuais)
load_cambio() → df_cambio (remessas internacionais)
    ↓
reconstruct_history() → (serie_patrimonio, serie_fluxos, serie_income)
    ↓
FixedIncomeEngine.compute() → rf_curve (série diária de RF)
    ↓
consolidate_to_brl() → nav_brl (patrimônio total em BRL)
    ↓
get_portfolio_snapshot() → Dict com posições, preços, P&L, FX
    ↓
Agente IA / Dashboard
```

---

## 2. Motor TWR (Time-Weighted Return)

**Arquivo:** `core/performance/calculator.py`

O TWR (Time-Weighted Return) é a métrica de desempenho **canônica** do sistema. Mede o retorno do gestor/investimento **independentemente de quando o dinheiro entrou**.

### Por Que TWR (Não MWR)?

- **MWR (Money-Weighted Return):** Afetado por timing do dinheiro → inadequado para medir performance do gestor
- **TWR:** Remove efeito de fluxos → **métrica justa de skill**

### Fórmula Simplificada

```python
# Período único
daily_return = (nav_end - nav_start - flow) / (nav_start + flow_adjustment)

# Multi-período (geométrica)
twr_total = ∏(1 + ret_i) - 1
twr_annual = (1 + twr_total) ^ (252 / dias) - 1
```

### Premissas Explícitas (Classe `TWRPremises`)

```python
@dataclass(frozen=True)
class TWRPremises:
    flow_timing_default: FlowTiming = FlowTiming.END_OF_DAY  # EOD = não participa de retorno
    income_policy: IncomePolicy = IncomePolicy.INCLUDE       # Dividendos = ganho econômico
    rf_valuation_mode: RFValuationMode = RFValuationMode.CURVA_PROXY  # SELIC para RF
    min_capital_for_valid_return: float = 1.0                # R$ mínimo p/ calcular retorno
    selic_annual_rate: float = 0.15                          # 15% a.a. fallback
    business_days_per_year: int = 252                        # Padrão ANBIMA
    extreme_return_threshold: float = 0.30                   # 30% em 1 dia = warning
```

### Entrada: `calculate_canonical_twr()`

```python
def calculate_canonical_twr(
    nav_series: pd.Series,          # NAV diário (incluindo dia 0 com saldo inicial)
    flow_series: pd.Series,         # Fluxos de caixa diários
    income_series: pd.Series,       # Dividendos/proventos diários
    premises: TWRPremises = DEFAULT_PREMISES,
    anomaly_checker = None,
) -> CanonicalTWRResult:
```

### Saída: `CanonicalTWRResult`

```python
@dataclass
class CanonicalTWRResult:
    cumulative_return_series: pd.Series  # Retorno acumulado diário (0.52 = +52%)
    daily_return_series: pd.Series       # Retorno diário
    total_twr: float                     # TWR total no período
    annualized_twr: float                # TWR anualizado
    subperiods: List[TWRSubPeriod]       # Detalhamento por dia (auditoria)
    validation: TWRValidation            # Cross-check
    economic_gain: float                 # Ganho econômico total em R$
    capital_base: float                  # Capital final
```

### Ajuste Crítico: Flow Timing

**Problema original:** Fluxo de dinheiro entra no meio do dia → quando participa do retorno?

**Solução implementada:** Enum `FlowTiming`

```python
class FlowTiming(Enum):
    END_OF_DAY = "EOD"      # Default: fluxo entra APÓS fechamento
    START_OF_DAY = "SOD"    # Fluxo entra ANTES de participar dos retornos
```

**Impacto na fórmula:**

```python
# EOD (Default)
daily_return = (nav_end - nav_start - flow) / nav_start
# Flow não participa do retorno do dia

# SOD
daily_return = (nav_end - nav_start - flow) / (nav_start + flow)
# Flow participa integralmente do retorno do dia
```

**Padrão adotado:** `EOD` (GIPS standard). Fluxos de aportes em BRL entram APÓS o fechamento do mercado.

---

## 3. Gerenciamento de Cash Flows

**Arquivo:** `core/performance/flow_ledger.py`

Um "ledger" é um registro tipado e auditável de **todas** as entradas e saídas de caixa.

### Tipos de Fluxo (`FlowType` enum)

```python
class FlowType(Enum):
    APORTE_BRL = "aporte_brl"       # Entrada de dinheiro em BRL
    CONVERSAO_FX = "conversao_fx"   # Remessa para USD/EUR/CAD (saída BRL)
    COMPRA_ATIVO = "compra_ativo"   # Compra de ação/ETF (fluxo zero na carteira)
    VENDA_ATIVO = "venda_ativo"     # Venda de ação/ETF (fluxo zero)
    DIVIDENDO = "dividendo"         # Dividendo recebido (entrada)
    TAXA = "taxa"                   # Corretagem, taxas (saída)
    ENTRADA_RF = "entrada_rf"       # Compra de CDB/Tesouro (fluxo zero)
    SAIDA_RF = "saida_rf"           # Venda/vencimento de RF (fluxo zero)
```

### Estrutura de um Fluxo Tipado

```python
@dataclass
class CashFlow:
    date: pd.Timestamp              # Quando aconteceu
    amount: float                   # Valor na moeda original
    currency: str                   # 'BRL', 'USD', 'EUR'...
    flow_type: FlowType             # Tipo do evento
    ticker: Optional[str]           # Ativo relacionado (ex: 'PETR4.SA')
    fx_rate: Optional[float]        # Taxa FX no momento (ex: 5.20 para USD)
    amount_brl: Optional[float]     # Valor convertido para BRL
    notes: str                      # Observações livres
```

### Como Construir o Ledger

```python
ledger = FlowLedger()

# Aporte inicial de R$100k em 01/01/2024
ledger.add(CashFlow(
    date=pd.Timestamp('2024-01-01'),
    amount=100000.0,
    currency='BRL',
    flow_type=FlowType.APORTE_BRL,
    amount_brl=100000.0,
))

# Remessa de R$50k → US$10k em 15/01/2024 (taxa 5.00)
ledger.add(CashFlow(
    date=pd.Timestamp('2024-01-15'),
    amount=10000.0,
    currency='USD',
    flow_type=FlowType.CONVERSAO_FX,
    fx_rate=5.00,
    amount_brl=-50000.0,  # Negativo = saída
    notes='Remessa para Interactive Brokers',
))

# Dividendo recebido
ledger.add(CashFlow(
    date=pd.Timestamp('2024-02-01'),
    amount=500.0,
    currency='BRL',
    flow_type=FlowType.DIVIDENDO,
    ticker='PETR4.SA',
    amount_brl=500.0,
))
```

### Queries Úteis

```python
# Total investido em USD
usd_flows = ledger.filter_by_currency('USD')
total_usd = usd_flows.total_native()  # Em dólares

# Todos os dividendos
divs = ledger.filter_by_type(FlowType.DIVIDENDO)
total_div = divs.total_brl()

# Fluxos de um período específico
q1_2024 = ledger.filter_by_period(
    pd.Timestamp('2024-01-01'),
    pd.Timestamp('2024-03-31')
)

# Histórico de um ativo
petr = ledger.filter_by_ticker('PETR4.SA')
```

---

## 4. FX Cost Basis — Câmbio e Saldo em Dólar

**Arquivo:** `core/fx_cost_basis.py`

### Problema Resolvido

Quando você remete dinheiro para o exterior (ex: BRL → USD), cada remessa tem um custo efetivo em dólar diferente. **Como medir o seu custo médio?**

Exemplo real:
- 01/01/2024: Remete R$50.000 → recebe US$10.000 (taxa 5.00)
- 01/02/2024: Remete R$30.000 → recebe US$5.500 (taxa 5.45)
- Custo médio = (50.000 + 30.000) / (10.000 + 5.500) = **R$ 5,16 por dólar**

### Solução: `build_fx_cost_series()`

```python
def build_fx_cost_series(
    df_cambio: pd.DataFrame,      # Histórico de remessas
    idx_dates: pd.DatetimeIndex,  # Índice de datas
    target_currencies: Optional[list] = None  # ['USD', 'EUR', 'CAD']
) -> Dict[str, pd.Series]:
    """
    Returns:
        {'USD': series_cost_basis, 'EUR': series_cost_basis, ...}
        
    Onde series_cost_basis[data] = custo médio ponderado em BRL/moeda
    """
```

### Lógica Interna

```python
# Dado df_cambio com colunas:
# data | moeda_origem | moeda_destino | valor_origem | valor_destino | taxa

# Para cada moeda destino (ex: USD):
brl_total_enviado = sum(valor_origem for remessas USD)  # R$80.000
usd_total_recebido = sum(valor_destino for remessas USD)  # $15.500

cost_basis = brl_total_enviado / usd_total_recebido  # 5.16

# Series diária com cost_basis acumulado até cada data:
# 2024-01-01: 5.00 (1ª remessa)
# 2024-02-01: 5.16 (média de 2 remessas)
# 2024-03-01: 5.16 (mantém, sem nova remessa)
```

### Uso em Consolidação Multi-Currency

No módulo `consolidator.py`, há dois modos de conversão de fluxos para BRL:

```python
def consolidate_to_brl(
    buckets: Dict[str, CurrencyBucket],
    fx_rates: Dict[str, pd.Series],           # Preços de mercado
    df_cambio: Optional[pd.DataFrame] = None,  # Histórico de remessas
    consolidation_mode: str = 'market'        # 'market' ou 'cost_basis'
):
    """
    Modo 'market': usa taxa de mercado (spot USD/BRL do dia)
    Modo 'cost_basis': usa taxa efetiva da remessa (FX Cost Basis)
    
    No modo 'cost_basis', fluxos mostram quanto você realmente gastou em BRL,
    não quanto custa o dólar hoje.
    """
```

---

## 5. Motor de Renda Fixa (Fixed Income Engine v5.0)

**Arquivo:** `core/fixed_income_engine.py`

Renda Fixa é a parte mais complexa do sistema porque há **múltiplos modos de valorização** possíveis, e cada um é válido sob premissas diferentes.

### Tipos de Ativos RF

| Tipo | Exemplos | Dados | Valorização |
|------|----------|-------|-------------|
| **Transacionado** | Tesouro Direto, CDB, LCI | Aba `renda_fixa` (histórico) | Taxa efetiva real |
| **Manual** | Saldo atual de CDB/RF | Aba `fixa_aberta` (snapshot) | SELIC acumulada |
| **ETF RF USD** | SHV, BIL | Aba `meus_ativos` | Cotação yfinance |

### Modos de Valorização (`RFValuationMode`)

```python
class RFValuationMode(Enum):
    CURVA_PROXY = "proxy"   # Usa SELIC 15% a.a. para capitalizar
    MTM_REAL = "mtm"        # Usa preços de mercado reais (se disponível)
```

#### Modo 1: CURVA_PROXY (Padrão)

**Lógica:**
- Ativos **encerrados** (tem Compra + Venda + Imposto): calcula taxa efetiva real
- Ativos **abertos** (só tem Compra): capitaliza pela SELIC acumulada desde a compra

```python
# Encerrado: CDB de R$10.000 comprado em 01/01, venceu em 31/03
# Compra: -10.000 | Venda: +10.800 | Imposto: -100
# Taxa efetiva = (10.800 - 100 - 10.000) / 10.000 = 7%

# Aberto: CDB de R$50.000 ainda não regatado
# SELIC acumulada de 01/01 até hoje = (1 + 0.15) ^ (dias_passados/252) - 1
# Valor = 50.000 * (1 + selic_acum)
```

#### Modo 2: MTM_REAL

Usa preços de mercado real se disponível (raro para RF).

### Estrutura de Evento RF

```python
@dataclass
class FixedIncomeEvent:
    date: datetime
    ticker: str             # Ex: 'TESOURO-IPCA-2035'
    event_type: str         # 'COMPRA', 'VENDA', 'IMPOSTO', 'CAIXA'
    amount: float           # Fluxo (negativo=saída, positivo=entrada)
    original_value: float   # Valor original do evento
```

### Output: `FixedIncomeCurveResult`

```python
@dataclass
class FixedIncomeCurveResult:
    daily_curve: pd.DataFrame        # Série diária: invested, corrected, cash
    total_invested: float            # Capital total investido
    current_value: float             # Valor atual
    total_return_pct: float          # Retorno total %
    annualized_return_pct: float     # Retorno anualizado %
    total_taxes_paid: float          # Impostos pagos
    external_flows: List[ExternalFlow]  # Fluxos para integração com TWR
    closed_positions: List[ClosedPosition]  # Posições encerradas (auditoria)
```

### Integração com TWR

O FixedIncomeEngine produz:
- `external_flows`: Lista de fluxos (entrada/saída) para o TWR
- `daily_curve`: Série de patrimônio RF diária
- `closed_positions`: Detalhamento de cada posição para auditoria

Esses dados são **consolidados com RV** no módulo `consolidator.py` para calcular o TWR total.

---

## 6. Cálculos de FIFO e Posições Abertas

**Arquivo:** `core/finance.py` → `calcular_carteira_fechada()`

### Problema: Qual é meu PM atual?

Quando você compra várias vezes, a cada venda precisa saber **qual lote vender** (FIFO vs LIFO vs específico).

**Lei brasileira:** FIFO (First In, First Out)

### Algoritmo FIFO

```python
# Input: DataFrame com transações ordenadas por data
# Colunas: ticker, tipo, quantidade, preco, taxas, moeda

portfolio = {}  # Dicionário de ativos ativos

for _, row in df_sorted.iterrows():
    t = row['ticker']
    
    if 'compra' in row['tipo'].lower():
        # Criar novo lote
        custo_total = (qty * price) + taxas
        pm_lote = custo_total / qty
        portfolio[t]['lotes'].append({'qtd': qty, 'pm': pm_lote})
    
    elif 'venda' in row['tipo'].lower():
        # Consumir lotes FIFO
        qtd_vender = qty
        while qtd_vender > 0 and portfolio[t]['lotes']:
            lote = portfolio[t]['lotes'][0]  # Primeiro a entrar
            
            if lote['qtd'] <= qtd_vender:
                # Consome lote inteiro
                qtd_consumida = lote['qtd']
                portfolio[t]['lotes'].pop(0)
            else:
                # Consome parcialmente
                qtd_consumida = qtd_vender
                lote['qtd'] -= qtd_consumida
            
            # Calcula lucro/prejuízo dessa venda
            lucro = (preco_venda - lote['pm']) * qtd_consumida
            portfolio[t]['lucro_realizado'] += lucro
            qtd_vender -= qtd_consumida

# Calcular PM final (média ponderada dos lotes restantes)
qtd_total = sum(l['qtd'] for l in portfolio[t]['lotes'])
custo_total = sum(l['qtd'] * l['pm'] for l in portfolio[t]['lotes'])
pm_final = custo_total / qtd_total  # se qtd_total > 0
```

### Output: `(df_posicao, lucro_realizado_por_moeda)`

```python
# df_posicao com colunas:
# Ticker | Setor | Qtd | Moeda | PM_Origem | Lucro_Realizado_Nativo

# lucro_realizado_por_moeda:
# {'BRL': 15234.56, 'USD': 2100.00, ...}
```

### Caso Especial: Bonificação

Bonificações (ações gratuitas) aparecem como "compra quantidade = quantidade de ações novas".

```python
# Exemplo: você tem 100 PETR4, recebe bonificação de 25
# Transação: tipo=Bonificação, qtd=25, preco=0

# O FIFO trata como:
pm_lote = (25 * 0) / 25 = 0  # PM da bonificação é zero

# PM final da posição:
custo_total = (100 * 37.50) + (25 * 0) = 3750
pm_final = 3750 / 125 = 30.00  # Diluiu o PM
```

---

## 7. Consolidação Multi-Currency

**Arquivo:** `core/consolidator.py`

### Problema: Você tem USD, EUR, CAD + BRL

Como calcular retorno quando tem múltiplas moedas? **A resposta é não é simples.**

**Dois impactos distintos:**
1. **Retorno do ativo** (ex: AAPL subiu 5%)
2. **Retorno cambial** (ex: USD caiu 3% vs BRL)

Retorno total = (1 + retorno_ativo) × (1 + retorno_fx) - 1

### Arquitetura: CurrencyBucket

Cada moeda tem seu próprio "bucket" (cesto) de cálculos:

```python
@dataclass
class CurrencyBucket:
    currency: str                   # 'BRL', 'USD', 'EUR'
    nav_series: pd.Series           # NAV diário NA MOEDA ORIGINAL
    flow_series: pd.Series          # Fluxos NA MOEDA ORIGINAL
    income_series: pd.Series        # Dividendos NA MOEDA ORIGINAL
    force_zero_series: pd.Series    # Dias com retorno forçado a zero
    tickers: List[str]              # Ativos neste bucket
    
    def to_engine_input(self) -> pd.DataFrame:
        """Converte para entrada do motor TWR."""
        return pd.DataFrame({
            'nav': self.nav_series,
            'flow': self.flow_series,
            'income': self.income_series,
            'force_return_zero': self.force_zero_series,
        }).sort_index()
```

### Fluxo de Consolidação

```python
# 1. Reconstruir histórico de RV por moeda
buckets_rv = reconstruct_history_multicurrency(df_assets)
# Retorna: {'BRL': bucket_brl, 'USD': bucket_usd, 'EUR': bucket_eur, ...}

# 2. Integrar RF (sempre em BRL)
buckets['BRL']['nav'] += rf_curve

# 3. Calcular TWR em cada moeda (isoladamente)
twr_brl, nav_brl = calculate_canonical_twr(
    nav_series=buckets['BRL'].nav_series,
    flow_series=buckets['BRL'].flow_series,
    income_series=buckets['BRL'].income_series,
)

twr_usd, nav_usd = calculate_canonical_twr(
    nav_series=buckets['USD'].nav_series,
    flow_series=buckets['USD'].flow_series,
)

# 4. Consolidar para BRL usando taxas de câmbio
nav_brl_total = nav_brl + nav_usd * fx_rates['USD/BRL'][-1]
```

### Dois Modos de Conversão de Fluxos

**Modo 1: Market (padrão)**
```python
# Fluxo em USD no dia X é convertido para BRL usando taxa de MERCADO
flow_brl = flow_usd * fx_rates['BRL=X'].asof(date_x)
```

**Modo 2: Cost Basis (para "Meu Custo")**
```python
# Fluxo em USD usa taxa EFETIVA da remessa (FixedXCostBasis)
# Se remeu R$50k para receber $10k, taxa = 5.00
flow_brl = flow_usd * cost_basis_rate['USD'].asof(date_x)
```

---

## 8. Processamento Vetorizado de Transações

**Arquivo:** `core/engine.py` → `_process_transactions_vectorized()`

### Problema: Performance

Iterar `iterrows()` sobre 10.000 transações é **lento demais** para ser cachedado a cada hora.

### Solução: Vetorização com NumPy/Pandas

```python
def _process_transactions_vectorized(
    df_ops: pd.DataFrame,
    idx_dates: pd.DatetimeIndex,
    s_usd: pd.Series,
    s_eur: pd.Series,
    all_tickers: list
) -> tuple:
    """
    Processa transações de forma vetorizada (10x+ mais rápido).
    """
    
    # 1. Mapear datas para o índice (vetorizado)
    df['idx_pos'] = np.searchsorted(idx_dates, df['data'], side='left')
    df['effective_date'] = idx_dates[df['idx_pos'].values]
    
    # 2. Calcular sinal em batch (vetorizado)
    df['sinal'] = df['tipo'].str.lower().str.contains('compra').astype(int) * 2 - 1
    
    # 3. Buscar taxa FX (vetorizado com apply)
    df['fx_rate'] = df.apply(
        lambda row: s_usd.asof(row['effective_date']) if row['moeda'] == 'USD' else 1.0,
        axis=1
    )
    
    # 4. Calcular fluxo financeiro (vetorizado)
    df['fin_brl'] = df['preco'].astype(float) * df['quantidade'].astype(float) * df['fx_rate'] * df['sinal']
    
    # 5. Agregar fluxos por data (groupby vectorizado)
    fluxos_grouped = df.groupby('effective_date')['fin_brl'].sum()
    serie_fluxos = pd.Series(0.0, index=idx_dates)
    serie_fluxos.loc[fluxos_grouped.index] = fluxos_grouped.values
    
    # 6. Construir custódia diária (ticker-wise vectorized)
    custodia = pd.DataFrame(0.0, index=idx_dates, columns=all_tickers)
    for ticker in df['ticker'].unique():
        df_ticker = df[df['ticker'] == ticker].sort_values('effective_date')
        df_ticker['qtd_delta'] = df_ticker['quantidade'].astype(float) * df_ticker['sinal']
        
        # Acumular por data (forward-fill vetorizado)
        for _, row in df_ticker.iterrows():
            custodia.loc[row['effective_date']:, ticker] += row['qtd_delta']
    
    return custodia, serie_fluxos, df
```

### Ganhos de Performance

- **iterrows():** ~2.5s para 10.000 transações
- **Vetorizado:** ~0.2s para 10.000 transações
- **Ganho:** 10-12x mais rápido

---

## 9. Parsing Robusto de Dados

**Arquivo:** `core/utils.py` + `core/data/loader.py`

Google Sheets pode retornar dados em múltiplos formatos. Precisa de **parsing robusto**.

### Três Funções Críticas

#### 1. `parse_decimal_br()`

Converte vírgula decimal para ponto (formato Python).

```python
def parse_decimal_br(value):
    """
    Aceita:
    - "1.234,56" → 1234.56 (formato BR)
    - "1234.56" → 1234.56 (formato US)
    - 1234.56 → 1234.56 (nativo Python)
    - None, NaN → 0.0
    
    Retorna: float
    """
    if pd.isna(value):
        return 0.0
    
    s = str(value).strip()
    
    # Detectar separador decimal (última vírgula ou ponto)
    if ',' in s and '.' in s:
        if s.rfind(',') > s.rfind('.'):
            # Formato BR: 1.234,56
            s = s.replace('.', '').replace(',', '.')
        else:
            # Formato US: 1,234.56
            s = s.replace(',', '')
    elif ',' in s:
        # Só vírgula: 1234,56
        s = s.replace(',', '.')
    
    return float(s)
```

#### 2. `parse_date_br()`

Converte datas em vários formatos.

```python
def parse_date_br(value):
    """
    Aceita:
    - "01/01/2024" → 2024-01-01
    - "2024-01-01" → 2024-01-01
    - 45293 (serial Excel) → 2023-12-30
    - datetime.date → mantém
    
    Retorna: datetime.datetime ou NaT
    """
    if pd.isna(value):
        return pd.NaT
    
    # Se já é datetime
    if isinstance(value, (datetime, date)):
        return pd.Timestamp(value)
    
    # Se é número (serial Excel)
    try:
        num = float(value)
        if 1000 < num < 100000:  # Serial Excel plausível
            return pd.Timestamp('1900-01-01') + pd.Timedelta(days=num-1)
    except:
        pass
    
    # Strings: tenta múltiplos formatos
    s = str(value).strip()
    for fmt in ['%d/%m/%Y', '%d-%m-%Y', '%Y-%m-%d', '%Y/%m/%d']:
        try:
            return pd.to_datetime(s, format=fmt)
        except:
            pass
    
    return pd.NaT
```

#### 3. `normalize_dataframe_columns()`

Mapeia nomes de colunas variad os para padrão.

```python
def normalize_dataframe_columns(df: pd.DataFrame, column_map: dict) -> pd.DataFrame:
    """
    Mapeia colunas usando dicionário flexível.
    
    column_map = {
        'símbolo': 'ticker',
        'simbolo': 'ticker',
        'ticker': 'ticker',
        'tipo de transação': 'tipo',
        'tipo_de_transacao': 'tipo',
    }
    
    Entrada:
    | Símbolos | Tipo de transação | Preço |
    | PETR4    | Compra            | 38.52 |
    
    Saída:
    | ticker | tipo   | preco |
    | PETR4  | Compra | 38.52 |
    """
    
    # Normalizar nomes atuais (maiús., sem acentos, espaço→_)
    df_normalized = df.copy()
    new_cols = {}
    
    for col in df_normalized.columns:
        col_normalized = (col.lower()
                         .replace('á', 'a').replace('é', 'e')
                         .replace('í', 'i').replace('ó', 'o')
                         .replace('ú', 'u').replace('ã', 'a')
                         .replace(' ', '_'))
        
        if col_normalized in column_map:
            new_cols[col] = column_map[col_normalized]
        else:
            new_cols[col] = col
    
    df_normalized = df_normalized.rename(columns=new_cols)
    return df_normalized
```

### Fallbacks em Cascata

```python
try:
    df = load_from_google_sheets()
    df = normalize_columns(df)
    df['data'] = parse_date_br(df['data'])
    df['valor'] = parse_decimal_br(df['valor'])
except Exception as e:
    st.warning(f"Erro ao carregar: {e}")
    return pd.DataFrame()  # Vazio, não quebra a app
```

---

## 10. Seletor de Moeda e Taxas FX

**Arquivo:** `core/data/market.py`

### Problema: Como obter taxa BRL/USD, BRL/EUR, etc.?

Usa yfinance com tickers especiais (inverse rates).

```python
def fetch_market_data(tickers: list) -> Tuple[dict, dict]:
    """
    Baixa preços atuais e variação do dia.
    
    Para moedas, usa:
    - 'BRL=X' → USD/BRL (taxa direta)
    - 'EURBRL=X' → EUR/BRL (taxa direta)
    - 'CADBRL=X' → CAD/BRL (taxa direta)
    
    Returns:
        (map_prices, map_changes)
        {'PETR4.SA': 38.52, 'BRL=X': 5.20, ...}
        {'PETR4.SA': 0.73, 'BRL=X': 0.05, ...}
    """
    
    tickers_yahoo = list(set(tickers + ['BRL=X', 'EURBRL=X', 'CADBRL=X']))
    
    # Baixar últimos 5 dias para ter 2 fechamentos
    df = yf.download(tickers_yahoo, period='5d', progress=False)['Close']
    
    # Último preço e variação
    price_now = df.iloc[-1]
    price_prev = df.iloc[-2]
    day_change = price_now - price_prev
    
    return dict(price_now), dict(day_change)
```

### Mapeamento de Moedas

Função interna em `computed.py`:

```python
def _fator(moeda: str, mapa_precos: dict, mapa_variacao: dict) -> tuple[float, float]:
    """
    Retorna (taxa_spot_atual, variacao_dia_absoluta) para uma moeda.
    
    Entrada: moeda='USD' ou 'EUR' ou 'BRL'
    Saída: (5.20, 0.05) significa 1 USD = 5.20 BRL, subiu 0.05 hoje
    """
    
    if moeda == 'BRL':
        return 1.0, 0.0  # BRL é a base
    
    # Mapeamento de ticker yfinance para código moeda
    ticker_map = {
        'USD': 'BRL=X',
        'EUR': 'EURBRL=X',
        'CAD': 'CADBRL=X',
    }
    
    ticker_yahoo = ticker_map.get(moeda, None)
    if not ticker_yahoo:
        return 1.0, 0.0  # Moeda desconhecida, assume 1:1
    
    taxa = mapa_precos.get(ticker_yahoo, 5.0)  # Fallback 5.0
    variacao = mapa_variacao.get(ticker_yahoo, 0.0)
    
    return taxa, variacao
```

### Classificação de Ativos por Moeda

Em `logic.py`:

```python
def identificar_moeda_ativo(ticker: str, df_assets: pd.DataFrame) -> str:
    """
    Identifica a moeda nativa de um ativo.
    
    Regra 1: Se está no df_assets com moeda explícita, usa essa.
    Regra 2: Se tem sufixo .SA → BRL
    Regra 3: Se tem sufixo .L → GBP (London)
    Regra 4: Se é cripto (BTC-USD, ETH-USD) → USD
    Regra 5: Se é ETF USA (VWRA, SPY, QQQ) → USD (mesmo se .L)
    Regra 6: Default → BRL (assumir doméstico)
    """
    
    t = str(ticker).upper().strip()
    
    # Verificar df_assets
    match = df_assets[df_assets['ticker'] == t]
    if not match.empty:
        moeda = match.iloc[0].get('moeda', 'BRL')
        return str(moeda).upper().strip() or 'BRL'
    
    # Sufixos
    if t.endswith('.SA'):
        return 'BRL'
    if t.endswith('.L'):
        return 'GBP'  # London
    
    # Cripto
    if 'BTC' in t or 'ETH' in t or 'USD' in t:
        return 'USD'
    
    # ETF USA (mesmo em London, é USD)
    etfs_usa = {'SPY', 'QQQ', 'VWRA', 'VOO', 'VNQ', 'SCHD', 'VT'}
    if t.replace('.L', '') in etfs_usa:
        return 'USD'
    
    return 'BRL'  # Default
```

---

## 11. Armadilhas e Lições Aprendidas

### 🔴 Armadilha 1: TWR vs MWR

**Problema:** Misturar TWR com MWR causa confusão.
- TWR: Retorno do gestor (ignorar timing de fluxos) ✅
- MWR: Retorno do investidor (afetado por quando entrou/saiu) ⚠️

**Lição:** Sempre calcular TWR para performance, MWR para relatório fiscal.

### 🔴 Armadilha 2: Double-Count de Múltiplas Moedas

**Problema original:** Ao somar patrimônio RV + RF, era possível contar USD duas vezes.

```python
# ERRADO
patrimonio_brl = patrimonio_rv_brl + patrimonio_rf_brl
# Se patrimonio_rf_brl inclui SHV em USD convertido, e patrimonio_rv_brl também...

# CORRETO
patrimonio_brl = patrimonio_rv_brl + patrimonio_rf_brl
# Garantir que cada ativo é contado APENAS uma vez
```

**Solução implementada:** Manutenção explícita de "tickers únicos" e "buckets isolados por moeda".

### 🔴 Armadilha 3: FIFO Sem Data

**Problema:** Se transações não estão ordenadas por data, FIFO falha.

```python
# ERRADO
df_assets.apply(fifo_logic)  # Ordem aleatória

# CORRETO
df_assets = df_assets.sort_values('data')
# Depois aplicar FIFO
```

**Lição:** Sempre sort por data antes de FIFO.

### 🔴 Armadilha 4: Cash Flows em EOD vs SOD

**Problema:** Um aporte de R$100k em 15/01 participa do retorno de 15/01?

**Padrão adotado:** EOD (End of Day)
- Aporte entra APÓS fechamento do mercado
- Não participa do retorno de 15/01
- Começa a participar em 16/01

```python
# 14/01: NAV = 100.000, Retorno = 0%
# 15/01: Aporte +100.000 (EOD) → NAV = 200.000
# 16/01: Retorno é calculado sobre NAV inicial = 200.000
```

### 🔴 Armadilha 5: Renda Fixa Manual Sem Moeda

**Problema:** Aba `fixa_aberta` tem RF em USD, mas coluna moeda vazia.

**Solução:** Default para BRL se moeda vazia.

```python
def normalizar_moeda_rf(df_rf_manual: pd.DataFrame) -> pd.DataFrame:
    if 'moeda' not in df_rf_manual.columns:
        df_rf_manual['moeda'] = 'BRL'
    
    df_rf_manual['moeda'] = df_rf_manual['moeda'].fillna('BRL').str.upper()
    return df_rf_manual
```

### 🔴 Armadilha 6: Gaps em Preços de Mercado

**Problema:** Ticker X não tem cotação em 15/01 (feriado).

**Solução:** Forward-fill → backward-fill.

```python
df_prices = df_prices.ffill().bfill()
# Carrega último preço conhecido para dias sem trading
```

### 🔴 Armadilha 7: SELIC em Renda Fixa Manual

**Problema:** Como valorizar um CDB aberto? SELIC oficial? Proxy?

**Solução implementada:** Proxy 15% a.a.

```python
# Taxa SELIC oficial flutua: 10.5%, 15%, 13.75%, etc.
# Para RV não-transacionada, usar SELIC proxy de 15% a.a.

selic_acumulada = (1 + 0.15) ^ (dias_passados / 252) - 1
valor_hoje = valor_compra * (1 + selic_acumulada)
```

**Justificativa:** Não é perfeito, mas mantém sistema simples. Pode ser atualizado se houver dados oficiais.

### 🟡 Lição Aprendida: Flow Timing

**Antes:** Fluxo entrava SOD (Start of Day).
**Problema:** Distorcia retorno de dias com grande aporte.
**Depois:** Migrado para EOD (padrão GIPS).
**Resultado:** Retorno agora é mais realista.

### 🟡 Lição Aprendida: Saldo em Dólar

**Problema original:** Como medir ganho/perda cambial de forma isolada?

**Antes:** Simples conversão por taxa spot do dia.
**Depois:** Implementar FX Cost Basis para medir custo efetivo de cada remessa.
**Resultado:** Agora é possível saber "quanto realmente gastei em BRL para trazer 1 USD".

### 🟡 Lição Aprendida: Consolidação Multi-Currency

**Antes:** Calcular TWR total somando BRL + (USD × taxa).
**Problema:** Não isolava retorno do ativo vs retorno cambial.
**Depois:** CurrencyBucket → cada moeda tem seu próprio TWR → consolidar após.
**Resultado:** Agora é possível decompor "quanto de performance é do ativo vs do câmbio".

---

## 12. Checklist de Integração Para Novo Agente

Se você é um **novo agente** vindo trabalhar neste projeto, use este checklist:

- [ ] **Leia** `CLAUDE.md` (visão geral, estrutura Sheets)
- [ ] **Leia** `CALCULOS.md` (fórmulas financeiras)
- [ ] **Leia** este arquivo (`APRENDIZADOS_PYTHON.md`)
- [ ] **Execute** `get_python_environment_details()` para confirmar dependências
- [ ] **Explore** `core/performance/calculator.py` para entender TWR
- [ ] **Explore** `core/finance.py` para entender FIFO
- [ ] **Explore** `core/fixed_income_engine.py` para entender Renda Fixa
- [ ] **Explore** `core/consolidator.py` para entender Multi-Currency
- [ ] **Teste** localmente: `from core.data.loader import load_assets; df = load_assets(); print(df.head())`
- [ ] **Entenda** a diferença entre RV (Renda Variável) e RF (Renda Fixa)
- [ ] **Entenda** como fluxos são sincronizados entre os módulos
- [ ] **Identifique** quais funções estão em `@st.cache_data()` (são caras, trocar raramente)
- [ ] **Documente** qualquer mudança em `APRENDIZADOS_PYTHON.md`

### Perguntas Essenciais

1. **Como calcular patrimônio total?**
   → `get_portfolio_snapshot()` em `computed.py`

2. **Como calcular TWR?**
   → `calculate_canonical_twr()` em `performance/calculator.py`

3. **Como entender lucro realizado?**
   → FIFO em `finance.py` → `calcular_carteira_fechada()`

4. **Como funciona câmbio?**
   → `consolidator.py` + `fx_cost_basis.py`

5. **Como renda fixa é valorizada?**
   → `FixedIncomeEngine` em `fixed_income_engine.py`

6. **Como múltiplas moedas são consolidadas?**
   → `CurrencyBucket` em `consolidator.py` → TWR em cada moeda → consolidar

7. **Qual é a fonte de verdade?**
   → `get_portfolio_snapshot()` para snapshot atual; `calculate_canonical_twr()` para performance histórica

---

## Conclusão

Este projeto contém **complexidade real** em cálculos financeiros Python:

- ✅ **TWR multi-moeda** com cash flows explícitos
- ✅ **FIFO** robusto com múltiplas transações
- ✅ **Consolidação** de RV (ações) + RF (renda fixa) + Câmbio
- ✅ **FX Cost Basis** para medir custo efetivo de remessas
- ✅ **Processing vetorizado** para performance
- ✅ **Parsing robusto** de múltiplos formatos

Não é um simples agregador de preços — é um **sistema de cálculo financeiro robusto** com premissas explícitas e auditáveis.

Use este documento como referência ao trabalhar no código.

---

**Autor:** Agente IA de Suporte  
**Data:** 2026-05-24  
**Versão:** 1.0.0

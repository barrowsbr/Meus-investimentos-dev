# Meus Investimentos — Lógica de Cálculos e Métricas

Referência técnica das lógicas financeiras do projeto.
Use este arquivo antes de implementar qualquer métrica nova — provavelmente já existe a base certa.

---

## Índice

1. [Posições Abertas (FIFO)](#1-posições-abertas-fifo)
2. [Preço de Mercado e Variação Diária](#2-preço-de-mercado-e-variação-diária)
3. [P&L do Dia (posição individual)](#3-pl-do-dia-posição-individual)
4. [P&L Total do Portfólio](#4-pl-total-do-portfólio)
5. [Patrimônio Total (RV + RF)](#5-patrimônio-total-rv--rf)
6. [Renda Fixa — Valor Atual (SELIC)](#6-renda-fixa--valor-atual-selic)
7. [Renda Fixa — Motor Híbrido](#7-renda-fixa--motor-híbrido)
8. [Parsing de Dados Brutos](#8-parsing-de-dados-brutos)
9. [Filtro RF vs RV (tickers)](#9-filtro-rf-vs-rv-tickers)
10. [Snapshot Completo do Portfólio](#10-snapshot-completo-do-portfólio)
11. [Dados Históricos de Preços](#11-dados-históricos-de-preços)
12. [Proventos / Dividendos](#12-proventos--dividendos)
13. [Câmbio e Conversão de Moedas](#13-câmbio-e-conversão-de-moedas)
14. [Receita de Composição (Patrimônio por Classe)](#14-receita-de-composição-patrimônio-por-classe)
15. [Regras Gerais e Armadilhas](#15-regras-gerais-e-armadilhas)
16. [Motor TWR Multi-Moeda](#16-motor-twr-multi-moeda)
17. [Arquitetura Multi-Moeda (Buckets)](#17-arquitetura-multi-moeda-buckets)
18. [Consolidação para BRL + Modos FX](#18-consolidação-para-brl--modos-fx)
19. [Flow Timing (SoD vs EoD)](#19-flow-timing-sod-vs-eod)
20. [Decomposição de Retorno (Ativo vs Cambial)](#20-decomposição-de-retorno-ativo-vs-cambial)
21. [Atribuição de Performance por Ativo](#21-atribuição-de-performance-por-ativo)
22. [FixedIncomeEngine v5.0 — Avançado](#22-fixedincomeengine-v50--avançado)
23. [CAIXA/SALDO — Tratamento Especial](#23-caixasaldo--tratamento-especial)
24. [Constantes Críticas do Sistema](#24-constantes-críticas-do-sistema)
25. [Patrimônio Spot (Página Performance)](#25-patrimônio-spot-página-performance)

---

## 1. Posições Abertas (FIFO)

**Arquivo:** `core/finance.py` → `calcular_carteira_fechada(df)`

**Input:** `df_assets` carregado via `load_assets()` (aba `meus_ativos`)

**Output:** `(df_posicao, lucro_realizado_por_moeda)`
- `df_posicao`: DataFrame com colunas `[Ticker, Setor, Qtd, Moeda, PM_Origem, Lucro_Realizado_Nativo]`
- `lucro_realizado_por_moeda`: `{"BRL": float, "USD": float, ...}`

**Lógica central:**
```python
# Para cada transação ordenada por data:

# COMPRA → cria lote com PM
custo_total = (qtd * preco) + taxas
pm_lote = custo_total / qtd
ativo["lotes"].append({"qtd": qtd, "pm": pm_lote})

# VENDA → consome lotes FIFO, acumula lucro realizado
while qtd_vender > 0 and lotes:
    lote = lotes[0]  # primeiro a entrar, primeiro a sair
    lucro_op += (preco_venda - lote["pm"]) * qtd_consumida

# PM final da posição atual (média ponderada dos lotes restantes)
custo_total = sum(l["qtd"] * l["pm"] for l in lotes)
pm_final = custo_total / qtd_total
```

**Palavras-chave reconhecidas como Compra:** `compra`, `entrada`, `aporte`
**Palavras-chave reconhecidas como Venda:** `venda`, `saida`, `resgate`

**Filtro de ruído float:** posições com `qtd > 0.000001` são consideradas abertas.

**Uso padrão:**
```python
from core.data.loader import load_assets
from core.finance import calcular_carteira_fechada

df_assets = load_assets()
df_posicao, lucro_realizado = calcular_carteira_fechada(df_assets)
df_aberta = df_posicao[df_posicao['Qtd'] > 0]
```

---

## 2. Preço de Mercado e Variação Diária

**Arquivo:** `core/data/market.py` → `fetch_market_data(tickers)`

**Input:** lista de tickers no formato Yahoo Finance (ex: `['PETR4.SA', 'BRL=X', 'AAPL']`)

**Output:** `(map_prices, map_changes)`
- `map_prices`: `{"PETR4.SA": 38.52, ...}` — preço atual (último fechamento)
- `map_changes`: `{"PETR4.SA": 0.73, ...}` — variação absoluta do dia (atual - anterior)

**Lógica:**
```python
# Baixa últimos 5 dias para garantir 2 pontos de fechamento
raw = yf.download(tickers, period="5d", progress=False)

price_now  = close.iloc[-1]
price_prev = close.iloc[-2]
day_change = price_now - price_prev  # variação absoluta (R$ ou US$)
```

**Cache:** 15 minutos via `@st.cache_data(ttl=900)`

**Caso especial:** ticker `'BRL'` retorna `price=1.0, change=0.0` (moeda base).

**Variação percentual a partir do resultado:**
```python
day_pct = (day_change / prev_price) * 100
# onde prev_price = current_price - day_change
prev_price = map_prices[t] - map_changes[t]
```

---

## 3. P&L do Dia (posição individual)

**Arquivo:** `core/computed.py` → dentro de `get_portfolio_snapshot()`

Dado `current_price`, `day_change_abs` (de `fetch_market_data`) e `qty`, `pm`:

```python
prev_price   = current_price - day_change_abs

# Valor de mercado atual
market_value = current_price * qty

# P&L absoluto do dia em moeda nativa
day_pnl_r    = day_change_abs * qty

# P&L percentual do dia
day_pnl_pct  = (day_change_abs / prev_price) * 100   # se prev_price > 0

# P&L total desde entrada (posição inteira)
total_pnl_r  = (current_price - pm) * qty

# P&L total em %
total_pnl_pct = ((current_price / pm) - 1) * 100     # se pm > 0
```

**Fallback sem preço:** se ticker não tem cotação (RF, manual), usa `market_value = pm * qty` e zera todos os P&Ls do dia.

---

## 4. P&L Total do Portfólio

**Arquivo:** `core/computed.py` → `get_portfolio_snapshot()`

Soma dos P&Ls individuais **apenas BRL** (não converte USD aqui):

```python
total_mv_brl       = sum(market_value for posicoes BRL)
total_day_pnl_brl  = sum(day_pnl_r   for posicoes BRL)

prev_total         = total_mv_brl - total_day_pnl_brl
portfolio_day_pct  = (total_day_pnl_brl / prev_total) * 100   # se prev_total > 0
```

**Para incluir USD no portfólio total** (como em `Home.py`):
```python
# Converter USD → BRL antes de somar
dolar_val = map_prices.get('BRL=X', 5.0)
gain_brl  = qty * delta_usd * dolar_val
total_mv  += qty * price_usd * dolar_val
```

---

## 5. Patrimônio Total (RV + RF)

**Arquivo:** `dash/Dash/Home.py` → bloco `# STEP 2`

Combinação de RV (mercado) + RF (manual) com múltiplas moedas:

```python
# 1. RV: posições com Valor Hoje > 1.0 (filtra ruído)
df_rv_g = df_view[df_view['Valor Hoje (R$)'] > 1.0]
rv_patrimonio = df_rv_g['Valor Hoje (R$)'].sum()

# 2. RF: saldo da aba fixa_aberta, converter USD → BRL
df_rf_ativo = df_rf_completo[df_rf_completo['Status'] == 'Ativo']
mask_usd = df_rf_ativo['Moeda'] == 'USD'
df_rf_ativo.loc[mask_usd, 'Atual'] *= dolar_val   # spot USD/BRL
rf_patrimonio = df_rf_ativo['Atual'].sum()

total_patrimonio = rv_patrimonio + rf_patrimonio
```

**Conversão de moedas para valor em BRL:**
```python
fator = {'BRL': 1.0, 'USD': dolar_val, 'EUR': eur_val, 'CAD': cad_val}
valor_brl = qtd * preco_atual * fator[moeda]
```

---

## 6. Renda Fixa — Valor Atual (SELIC)

**Arquivo:** `core/finance.py` → `summarize_fixed_income(df_rf_raw)`

Usado quando **não há valor manual** disponível. Capitaliza compras pela SELIC.

```python
SELIC_ANNUAL        = 0.15          # 15% a.a. — atualizar se necessário
BUSINESS_DAYS_YEAR  = 252

# Para cada compra individual:
dias_corridos = (datetime.now() - data_compra).days
dias_uteis    = int(dias_corridos * BUSINESS_DAYS_YEAR / 365)
taxa_diaria   = (1 + SELIC_ANNUAL) ** (1 / BUSINESS_DAYS_YEAR) - 1
valor_atual   = valor_compra * (1 + taxa_diaria) ** dias_uteis
```

**Regra de status:**
- Tem transação do tipo `venda/resgate/vencimento` → `Status = 'Encerrado'`
- Sem vendas → `Status = 'Ativo'`

**Cálculo de rentabilidade:**
```python
lucro   = atual - investido           # investido = sum(compras)
rent_pct = (lucro / investido) * 100
```

**Para posições encerradas:**
```python
atual = total_saidas - total_impostos
lucro = atual - investido
```

**Coluna de data:** prefere `'Compra'`; fallback `'Data'`.

---

## 7. Renda Fixa — Motor Híbrido

**Arquivo:** `core/finance.py` → `summarize_fixed_income_hybrid(df_saldos, df_transacoes, df_proventos)`

Usa **3 fontes independentes**:

| Fonte | Dado | Aba |
|-------|------|-----|
| `df_transacoes` | Investido (custo histórico) | `renda_fixa` |
| `df_saldos` | Atual (valor corrente verdadeiro) | `fixa_aberta` |
| `df_proventos` | Juros recebidos (JUROS, RENDIMENTO, CUPOM) | `meus_proventos` |

```python
# Investido: soma das compras históricas
investido = df_transacoes[compras].groupby(['Ticker','Moeda'])['Valor'].sum()

# Atual: valor manual da aba fixa_aberta (source of truth)
atual = df_saldos['Atual']

# Proventos RF: apenas tipos de renda fixa
tipos_rf = ['juros', 'rendimento', 'cupom']
proventos_rf = df_proventos[df_proventos['Tipo'].str.lower().isin(tipos_rf)]
proventos_rf = proventos_rf.groupby('Ticker')['Valor'].sum()

# Lucro inclui juros já recebidos
lucro    = (atual + proventos_rf) - investido
rent_pct = (lucro / investido) * 100
```

**Escolha entre os dois motores:**
```python
if df_rf_manual.empty:
    df_rf = summarize_fixed_income(df_rf_raw)          # SELIC automático
else:
    df_rf = summarize_fixed_income_hybrid(             # manual + histórico
        df_saldos=df_rf_manual,
        df_transacoes=df_rf_raw,
        df_proventos=df_proventos
    )
```

---

## 8. Parsing de Dados Brutos

**Arquivo:** `core/utils.py`

### Decimais brasileiros
```python
def parse_decimal_br(value) -> float:
    # "1.234,56" → 1234.56
    # Remove R$, US$, %
    # Remove . (milhar), troca , por .
    s = str(value).strip()
    if ',' in s and '.' in s:
        s = s.replace('.', '').replace(',', '.')
    elif ',' in s:
        s = s.replace(',', '.')
    return float(s)
```

### Datas brasileiras
```python
def parse_date_br(series) -> pd.Series:
    # Prioridade: "YYYY-MM-DD" (sem dayfirst) → "DD/MM/YYYY" (dayfirst)
    # Trata serial Excel: se int entre 1 e 150000 → origin='1899-12-30'
    result = pd.to_datetime(series, dayfirst=True, errors='coerce')
    return result
```

### Normalização de colunas
```python
# Mapeamento padrão de nomes de colunas (lowercase → canônico)
col_map = {
    'símbolo': 'ticker', 'simbolo': 'ticker', 'ativo': 'ticker',
    'tipo de transação': 'tipo', 'tipo de transacao': 'tipo',
    'quantidade': 'quantidade', 'qtd': 'quantidade', 'qty': 'quantidade',
    'preço': 'preco', 'preco unitário': 'preco', 'price': 'preco',
    'moeda': 'moeda', 'currency': 'moeda',
    'taxas': 'taxas', 'fees': 'taxas',
    'data': 'data', 'date': 'data',
}
df.columns = [c.lower().strip() for c in df.columns]
df = df.rename(columns={c: col_map[c] for c in df.columns if c in col_map})
```

---

## 9. Filtro RF vs RV (tickers)

**Arquivo:** `core/computed.py`, `scripts/daily_report.py`

Tickers de Renda Fixa/Caixa **não têm cotação no Yahoo Finance** e devem ser excluídos do `fetch_market_data`.

```python
_RF_KEYWORDS = ['TESOURO', 'CDB', 'LCI', 'LCA', 'IPCA', 'CAIXA', 'SALDO', 'CDI', 'LFT', 'NTN']

def _is_market_ticker(ticker: str) -> bool:
    return not any(kw in ticker.upper() for kw in _RF_KEYWORDS)

# Uso:
tickers_para_yahoo = [t for t in df_posicao['Ticker'] if _is_market_ticker(t)]
```

---

## 10. Snapshot Completo do Portfólio

**Arquivo:** `core/computed.py` → `get_portfolio_snapshot()`
**Arquivo alternativo (standalone):** `scripts/daily_report.py` → `build_snapshot()`

Use `get_portfolio_snapshot()` dentro do Streamlit (tem cache `st.cache_data`).
Use `build_snapshot()` em scripts fora do Streamlit (GitHub Actions, CLI).

**Retorno de `get_portfolio_snapshot()`:**
```python
{
  'positions': [
    {
      'ticker': str, 'setor': str, 'moeda': str,
      'qty': float, 'pm': float,
      'current_price': float | None,
      'market_value': float,
      'day_pnl_r': float,    # P&L dia em moeda nativa
      'day_pnl_pct': float,  # P&L dia em %
      'total_pnl_r': float,  # P&L total em moeda nativa
      'total_pnl_pct': float,
      'has_price': bool,
    }, ...
  ],
  'top_gainers': [...],      # top 3 posições com maior day_pnl_pct
  'top_losers': [...],       # top 3 posições com menor day_pnl_pct
  'portfolio_day_pnl_r': float,
  'portfolio_day_pnl_pct': float,
  'rf_positions': pd.DataFrame,   # aba fixa_aberta raw
  'rf_total': float,              # soma do campo 'Atual' em BRL
  'computed_at': str,             # "HH:MM:SS"
  'errors': [str],
}
```

**Uso em qualquer página:**
```python
from core.computed import get_portfolio_snapshot
snap = get_portfolio_snapshot()
# snap['positions'] já vem ordenado por day_pnl_pct desc
```

---

## 11. Dados Históricos de Preços

**Arquivo:** `core/data/market.py` → `fetch_historical_data(tickers, start_date)`

**Input:** lista de tickers + data de início (padrão: 5 anos atrás)

**Output:** `pd.DataFrame` com DatetimeIndex, colunas = tickers, valores = preço de fechamento ajustado

```python
from core.data.market import fetch_historical_data
from datetime import datetime, timedelta

start = datetime.now() - timedelta(days=5*365)
df_prices = fetch_historical_data(tickers, start_date=start)

# df_prices.loc['2024-01-05', 'PETR4.SA'] → preço naquele dia
# Fins de semana são forward-filled (preço de sexta)
```

**Cache:** 15 minutos. Exclui automaticamente RF keywords.
**FX tickers incluídos automaticamente:** `BRL=X`, `EURBRL=X`, etc.

---

## 12. Proventos / Dividendos

**Arquivo:** `core/data/loader.py` → `load_proventos()`

**Aba Google Sheets:** `meus_proventos`

**Colunas canônicas após load:**
```
ticker | data | valor | lancamento (tipo) | categoria | moeda
```

**Filtrar por período:**
```python
df_prov = load_proventos()
cutoff = datetime.now() - timedelta(days=30)
recentes = df_prov[df_prov['data'] >= cutoff]
total_30d = recentes['valor'].sum()
```

**Tipos de proventos RF** (para não misturar com dividendos de ações):
```python
tipos_rf  = ['juros', 'rendimento', 'cupom']
tipos_rv  = ['dividendo', 'jcp', 'rendimento fii', 'amortização']
```

---

## 13. Câmbio e Conversão de Moedas

**Tickers Yahoo para câmbio:**
```python
'BRL=X'    # USD/BRL  (ex: 5.85 = 1 dólar vale R$ 5.85)
'EURBRL=X' # EUR/BRL
'CADBRL=X' # CAD/BRL
'CAD=X'    # USD/CAD
'JPY=X'    # USD/JPY
'CHFUSD=X' # CHF/USD
```

**Padrão de conversão para BRL:**
```python
dolar_val = map_prices.get('BRL=X', 5.0)
eur_val   = map_prices.get('EURBRL=X', 6.0)
cad_val   = map_prices.get('CADBRL=X', 4.0)

def to_brl(valor: float, moeda: str) -> float:
    rates = {'BRL': 1.0, 'USD': dolar_val, 'EUR': eur_val, 'CAD': cad_val}
    return valor * rates.get(moeda.upper(), 1.0)
```

**Variação percentual do câmbio:**
```python
dolar_change = map_changes.get('BRL=X', 0.0)
prev = dolar_val - dolar_change
dolar_var_pct = (dolar_change / prev) * 100 if prev != 0 else 0.0
```

**Fallbacks de câmbio** (quando Yahoo falha):
```python
CURRENCY_FALLBACK = {'BRL': 1.0, 'USD': 5.50, 'EUR': 6.00, 'CAD': 4.00}
```

---

## 14. Receita de Composição (Patrimônio por Classe)

**Arquivo:** `1_Investimentos.py` → tab "Composição" (seção 8)

Fluxo canônico para construir o `df_view` com valores em BRL:

```python
lista_view = []
for _, row in df_posicao.iterrows():
    t    = row['Ticker']
    m    = row['Moeda']
    qtd  = row['Qtd']
    pm   = row['PM_Origem']

    preco_atual = map_prices.get(t, 0.0)
    if preco_atual <= 0 or 'TESOURO' in t or 'CDB' in t:
        preco_atual = pm   # fallback para PM se sem cotação

    fator = {'BRL': 1.0, 'USD': dolar_val, 'EUR': eur_val, 'CAD': cad_val}.get(m, 1.0)
    valor_brl = qtd * preco_atual * fator

    lista_view.append({
        'Ticker': t,
        'Qtd': qtd,
        'Valor Hoje (R$)': valor_brl,
        'Setor': identificar_setor_ativo(t),
        ...
    })

df_view = pd.DataFrame(lista_view)

# Patrimônio RV: apenas posições com valor > 1 (filtra ruído float)
rv_total = df_view[df_view['Valor Hoje (R$)'] > 1.0]['Valor Hoje (R$)'].sum()
```

---

## 15. Regras Gerais e Armadilhas

### Nunca buscar preço de mercado para RF
```python
# ✅ Correto
tickers_yahoo = [t for t in tickers if _is_market_ticker(t)]

# ❌ Errado — quebra o yf.download silenciosamente
tickers_yahoo = df_posicao['Ticker'].tolist()
```

### PM sempre é o custo médio ponderado dos lotes abertos
```python
# Não é simplesmente o preço médio das compras históricas —
# é a média ponderada dos lotes que AINDA estão em carteira (após vendas FIFO)
pm_final = sum(l["qtd"] * l["pm"] for l in lotes) / sum(l["qtd"] for l in lotes)
```

### P&L percentual do dia usa preço anterior, não PM
```python
# ✅ Variação do dia em relação ao fechamento anterior
day_pnl_pct = (day_change / prev_price) * 100   # prev = current - change

# ❌ Não é a variação em relação ao PM (isso é total_pnl_pct)
total_pnl_pct = ((current_price / pm) - 1) * 100
```

### SELIC para RF sem valor manual
```python
# Taxa diária equivalente (juros compostos)
taxa_diaria = (1 + 0.15) ** (1/252) - 1   # ≈ 0.0553% ao dia útil

# Dias úteis ≈ dias corridos × 252/365
dias_uteis = int(dias_corridos * 252 / 365)
```

### Deduplicação de colunas é obrigatória após rename
```python
# Duplicatas causam falha em .str acessors
df = df.loc[:, ~df.columns.duplicated(keep='first')]
```

### Ordenação por data antes de calcular FIFO
```python
df = df.sort_values('data')   # OBRIGATÓRIO — FIFO depende de ordem cronológica
```

### Fonte única da verdade para o dashboard
- Usar sempre `core/computed.py → get_portfolio_snapshot()` em páginas Streamlit
- Scripts standalone (fora do Streamlit) usam `scripts/daily_report.py → build_snapshot()`
- **Nunca** recalcular posições inline em páginas — divergência garantida

### CAIXA/SALDO nunca entra no motor de retorno
```python
# ❌ Errado — CAIXA capitalizado pela SELIC inflaria retorno
df_rf = df_rf_raw  # passa tudo para o engine

# ✅ Correto — filtrar antes do FixedIncomeEngine
CASH_TICKERS = {'CAIXA', 'SALDO', 'CASH'}
df_rf_engine = df_rf_raw[~df_rf_raw['Ticker'].str.upper().isin(CASH_TICKERS)]
caixa_valor = df_rf_manual[mask_cash]['Atual'].sum()  # soma direto no patrimônio
```

### Nunca usar pesos estáticos na decomposição multi-bucket
```python
# ❌ Errado — pesos do início do período divergem em janelas longas
w = nav_brl_bucket.iloc[0] / total_nav_brl.iloc[0]

# ✅ Correto — pesos dinâmicos start-of-day (chain-linking diário)
w = nav_brl_bucket.shift(1) / total_nav_brl.shift(1)
```

### Fluxos e NAV devem usar a mesma base de preço
```python
# FIX v10.0: antes, fluxo usava preço de transação e NAV usava mercado
# → gerava retorno fictício no dia seguinte ao aporte
# ✅ Ambos usam preço de MERCADO (ou último preço conhecido como fallback)
price = df_prices.at[data, ticker] or last_known_price.get(ticker, preco_transacao)
```

---

## 16. Motor TWR Multi-Moeda

**Arquivo:** `core/engine.py` → `reconstruct_history_multicurrency()`

**Assinatura:**
```python
def reconstruct_history_multicurrency(
    df_bruto: pd.DataFrame,                    # Transações RV — load_assets()
    df_proventos: pd.DataFrame,                # Dividendos — load_proventos()
    days_lookback: int,                        # Janela visual (~1825 = 5 anos)
    df_prices_external: pd.DataFrame = None,  # Preços históricos (otimização)
    df_rf_raw: pd.DataFrame = None,           # Transações RF — load_fixed_income()
    df_cambio: pd.DataFrame = None,           # Remessas — load_cambio()
    manual_rf_values: dict = None             # {Ticker: valor_atual} da fixa_aberta
) -> MultiCurrencyResult
```

**Pipeline interno (ordem de execução):**
1. Agrupa ativos por moeda — excluindo tickers RF de `currency_groups`
2. Monta custódia diária (quantidade × tempo) via FIFO com mapeamento de fins de semana
3. Busca preços históricos (Yahoo Finance) para todos os tickers RV
4. Para cada bucket de moeda: calcula NAV e fluxos usando preço de **mercado**
5. Integra RF via `FixedIncomeEngine` — apenas no bucket BRL
6. Retorna `MultiCurrencyResult` com buckets separados por moeda

**Tickers especiais:**
```python
# BTC-USD: comprado em BRL mas cotado em USD
DIRECT_BRL_TICKERS = ['BTC-USD', 'BTC']
# → Bucket 'USD_DIRECT' (não 'USD') — usa taxa de mercado sempre, nunca PM de remessa

# Excluir RF de currency_groups — RF é tratada só pelo FixedIncomeEngine
TERMOS_RF = ['TESOURO', 'CDB', 'LCI', 'LCA', 'IPCA', 'CAIXA', 'SALDO']
df_rv_only = df_bruto[~df_bruto['ticker'].str.contains('|'.join(TERMOS_RF))]
```

**Lógica de custódia diária:**
```python
# Fins de semana mapeados para o próximo dia útil (side='left')
idx_fluxo = np.searchsorted(idx_dates, dt_op, side='left')

# Quantidade é cumulativa — forward-fill implícito
custodia_diaria.loc[data_valida:, ticker] += (qtd * sinal)  # sinal: +1 compra, -1 venda
```

---

## 17. Arquitetura Multi-Moeda (Buckets)

**Arquivo:** `core/consolidator.py`

**Invariante fundamental:** valores sempre em moeda nativa dentro do bucket. Conversão para BRL ocorre **somente** em `consolidate_to_brl()`.

```python
@dataclass
class CurrencyBucket:
    currency: str                    # 'BRL', 'USD', 'EUR', 'USD_DIRECT'
    nav_series: pd.Series           # NAV na moeda ORIGINAL — nunca convertido aqui
    flow_series: pd.Series          # Fluxos na moeda ORIGINAL
    income_series: pd.Series        # Proventos na moeda ORIGINAL
    force_zero_series: pd.Series    # True = forçar retorno = 0 neste dia
    flow_timing_series: pd.Series   # 0 = EoD, 1 = SoD
    tickers: List[str]

@dataclass
class MultiCurrencyResult:
    buckets: Dict[str, CurrencyBucket]   # {'BRL': ..., 'USD': ..., 'EUR': ...}
    fx_rates: Dict[str, pd.Series]       # Séries diárias de câmbio (Yahoo)
    prices: pd.DataFrame                 # Matriz preços (tickers × datas)
    custodia_diaria: pd.DataFrame        # Matriz quantidades (tickers × datas)
    rf_curve: Optional[pd.Series]        # Curva RF agregada
```

---

## 18. Consolidação para BRL + Modos FX

**Arquivo:** `core/consolidator.py` → `consolidate_to_brl()`

**Regra de FX (v8.0) — a mais importante do sistema:**

| Componente | Visão Mercado | Meu Custo |
|-----------|---------------|-----------|
| NAV | Taxa spot (mercado) | Taxa spot (mercado) |
| Fluxos | Taxa spot (mercado) | PM de remessa (pessoal) |
| Objetivo | Comparar com benchmark | Retorno real do capital |

```python
# NAV — sempre spot, independente do modo
fx_for_nav = fx_rates[currency].reindex(idx).ffill().bfill()
nav_brl = nav_native * fx_for_nav

# Fluxos — depende do modo
if view_mode == "Meu Custo" and currency in fx_cost_basis:
    fx_for_flow = fx_cost_basis[currency]   # PM das remessas
else:
    fx_for_flow = fx_for_nav                # Spot (Visão Mercado)

flow_brl = flow_native * fx_for_flow
```

**PM de remessa:**
```python
# Calculado a partir da aba 'cambio' (load_cambio)
pm_usd = total_brl_remetido / total_usd_recebido
```

**FIX v12.0 — Entrada dinâmica de bucket:**
```python
# Problema: bucket USD começa no dia 100 → NAV salta 10k→60k sem fluxo → TWR 500%
# Solução: detectar 1ª data válida e registrar NAV inicial como aporte implícito
first_valid = bucket.nav_series[bucket.nav_series > 0].first_valid_index()
if first_valid > global_first_valid:
    flow_cur.loc[first_valid] += nav_cur.loc[first_valid]  # aporte implícito
```

---

## 19. Flow Timing (SoD vs EoD)

**Arquivo:** `core/engine.py`

Define quando, dentro do dia, o aporte/resgate é reconhecido para o cálculo de retorno.

| Timing | Significado | Efeito no retorno do dia |
|--------|-------------|--------------------------|
| EoD (End-of-Day) | Fluxo entra no fim | NÃO participa do retorno desse dia |
| SoD (Start-of-Day) | Fluxo entra no início | PARTICIPA do retorno desse dia |

**Classificação automática:**
```python
# Aporte > 1% do NAV anterior → SoD
# Motivo: aporte grande sobre capital pequeno inflaria o retorno ficticiamente
if flow_day > 0 and nav_prev > 0:
    if flow_day / nav_prev > 0.01:   # threshold: 1%
        flow_timing = 'SoD'
    else:
        flow_timing = 'EoD'
```

**FIX v9.0 — Correção de divergência fluxo vs NAV:**
```python
# Se variação real do NAV diverge do fluxo registrado em > 10% → corrige
variacao_nav = nav_curr - nav_prev
if abs(variacao_nav - flow_day) > abs(flow_day) * 0.10:
    flow_day = variacao_nav   # fluxo = variação real
```

**FIX v12.1 — Detecção de fluxo oculto:**
```python
# Variação > 20% do NAV esperado com fluxo < 5% → trata como fluxo não registrado
nav_expected = nav_prev + flow_day
variation = (nav_curr - nav_expected) / nav_expected
if abs(variation) > 0.20 and abs(flow_day) < nav_prev * 0.05:
    flow_day += nav_curr - nav_expected   # absorve variação inexplicada
```

---

## 20. Decomposição de Retorno (Ativo vs Cambial)

**Arquivo:** `core/performance/decomposition.py`

**Fórmula fundamental:**
```
R_total = (1 + R_ativo) × (1 + R_fx) − 1
```
- **R_ativo**: retorno do preço em moeda original (stock picking)
- **R_fx**: variação da taxa de câmbio no período
- **R_total**: retorno consolidado em BRL

**Retorno FX:**
```python
fx_start = fx_series.reindex(idx).iloc[0]
fx_end   = fx_series.reindex(idx).iloc[-1]
twr_fx   = fx_end / fx_start - 1.0
```

**Portfólio multi-bucket — chain-linking diário com pesos dinâmicos:**
```python
# Pesos start-of-day (shift(1) = dia anterior) — NUNCA pesos estáticos
w = bucket_nav_brl.shift(1) / total_nav_brl.shift(1)

# Retorno diário ponderado por bucket
portfolio_daily_asset += w * bucket_daily_asset_ret
portfolio_daily_fx    += w * bucket_daily_fx_ret

# Chain-link acumulado
cumret_asset = (1 + portfolio_daily_asset).cumprod() - 1
cumret_fx    = (1 + portfolio_daily_fx).cumprod() - 1
total_twr    = (1 + cumret_asset.iloc[-1]) * (1 + cumret_fx.iloc[-1]) - 1
```

---

## 21. Atribuição de Performance por Ativo

**Arquivo:** `core/performance/attribution.py`

```python
@dataclass
class AssetAttribution:
    ticker: str
    return_asset: float    # Retorno de preço na moeda original
    return_fx: float       # Retorno cambial do período
    return_total: float    # (1 + R_a) × (1 + R_fx) − 1
    weight_avg: float      # Peso médio: (peso_início + peso_fim) / 2
    contribution: float    # weight_avg × return_total
```

**Fórmulas:**
```python
# Retorno puro de preço — ignora variação de quantidade
return_asset = (price_end / price_start) - 1      # if price_start > 0

# Retorno cambial
return_fx = (fx_end / fx_start) - 1               # if fx_start > 0

# Total multiplicativo
return_total = (1 + return_asset) * (1 + return_fx) - 1

# Pesos em BRL
nav_brl_start = qty_start * price_start * fx_start
nav_brl_end   = qty_end   * price_end   * fx_end
weight_avg    = (nav_brl_start / total_start + nav_brl_end / total_end) / 2

# Contribuição ao portfólio
contribution = weight_avg * return_total
```

---

## 22. FixedIncomeEngine v5.0 — Avançado

**Arquivo:** `core/fixed_income_engine.py`

### Dois regimes de valorização

| Posição | Identificação | Taxa usada |
|---------|---------------|------------|
| **Encerrada** | Tem Compra + Venda/Vencimento | Taxa efetiva real: `(saída/entrada)^(1/anos) − 1` |
| **Aberta** | Só tem Compra | Com valor manual: Newton-Raphson; Sem: SELIC proxy |

### Taxa implícita (Newton-Raphson)
Usado quando há valor manual mas a taxa contratada é desconhecida:
```python
# Encontra r tal que: Σ(lote_i × (1+r)^dias_i) = valor_manual
r = 0.0005  # chute inicial ≈ SELIC diária
for _ in range(10):
    f   = sum(v * (1+r)**bd for v, bd in lotes) - valor_final
    df  = sum(v * bd * (1+r)**(bd-1) for v, bd in lotes)
    r  -= f / df
    if abs(f / df) < 1e-7: break

taxa_anual = (1 + r) ** 252 - 1
```

### FIFO em resgate
```python
# Consumir lotes do mais antigo até cobrir o valor resgatado
lotes.sort(key=lambda x: x['purchase_date'])
for lote in lotes:
    val_hoje = lote['invested'] * (1 + taxa_diaria) ** dias_uteis
    if val_hoje <= val_resgate:
        val_resgate -= val_hoje       # consome lote inteiro
    else:
        lote['invested'] *= 1 - (val_resgate / val_hoje)  # parcial
        val_resgate = 0
        break
```

### FIX v17.0 — Alinhamento do último valor
```python
# Garante que curva RF termina igual à soma dos valores manuais
# (evita divergência entre Performance e Composição)
if manual_rf_values:
    rf_nav.iloc[-1] = sum(manual_rf_values.values())
```

---

## 23. CAIXA/SALDO — Tratamento Especial

**Regra:** CAIXA e SALDO **nunca** entram no `FixedIncomeEngine`. São extraídos antes e somados diretamente ao patrimônio.

```python
CASH_TICKERS = {'CAIXA', 'SALDO', 'CASH'}

# 1. Extrair CAIXA da fixa_aberta ANTES de qualquer engine
mask_cash = df_rf_manual['Ticker'].str.upper().isin(CASH_TICKERS)
caixa_spot = df_rf_manual.loc[mask_cash, 'Atual'].sum()

# 2. Filtrar do engine (UPPERCASE obrigatório — FIX v19.0)
df_rf_engine = df_rf_manual[~mask_cash]
df_rf_trans  = df_rf_raw[~df_rf_raw['Ticker'].str.upper().isin(CASH_TICKERS)]

# 3. Patrimônio final
patrimonio_total = patrimonio_rv + patrimonio_rf_engine + caixa_spot
```

**Por quê?** Se CAIXA entrar no engine, será capitalizado pela SELIC — inflando o retorno da RF. Caixa não rende; é apenas liquidez.

---

## 24. Constantes Críticas do Sistema

| Constante | Valor | Arquivo | Uso |
|-----------|-------|---------|-----|
| `SELIC_PROXY_ANNUAL` | `0.15` (15% a.a.) | `fixed_income_engine.py` | RF aberta sem taxa real |
| `BUSINESS_DAYS_YEAR` | `252` | `fixed_income_engine.py` | Conversão dias corridos → úteis |
| `FLOW_INFLOW_THRESHOLD` | `0.01` (1% do NAV) | `engine.py` | Trigger de SoD timing |
| `MAX_UNEXPLAINED_CHANGE` | `0.20` (20%) | `engine.py` | Detecção de fluxo oculto |
| `FLOW_PERCENT_THRESHOLD` | `0.005` (0.5%) | `engine.py` | Mínimo para registrar fluxo RF |
| `FLOW_MIN_ABSOLUTE` | `R$ 10,00` | `engine.py` | Valor absoluto mínimo de fluxo RF |
| `SELIC_DAILY_RATE` | `0.15 / 252` | `engine.py` | Projeção RF dentro do engine |
| `CURRENCY_FALLBACK` | `{BRL:1, USD:5.50, EUR:6.00}` | `config.py` | Quando Yahoo Finance falha |
| `DIRECT_BRL_TICKERS` | `['BTC-USD', 'BTC']` | `engine.py` | Cripto comprado em BRL mas cotado em USD |

---

## 25. Patrimônio Spot (Página Performance)

**Arquivo:** `pages/3_Performance.py`

Difere do cálculo da `Home.py`: usa preços spot frescos e separa CAIXA da RF.

```python
# 1. RV: preço spot × quantidade × fx_spot
for pos in df_posicao[df_posicao['Qtd'] > 0].itertuples():
    preco  = mapa_precos_spot.get(pos.Ticker, pos.PM_Origem)  # fallback: PM
    fx     = {'BRL': 1.0, 'USD': usd_spot, 'EUR': eur_spot, 'CAD': cad_spot}[pos.Moeda]
    patrimonio_spot += pos.Qtd * preco * fx

# 2. RF: valor manual (fixa_aberta), excluindo CAIXA, convertendo moeda
for rf in df_rf_ativos.itertuples():
    fx = {'BRL': 1.0, 'USD': usd_spot, 'EUR': eur_spot}.get(rf.Moeda, 1.0)
    patrimonio_spot += rf.Atual * fx

# 3. CAIXA: somado separado (não passa pelo engine de retorno)
caixa_spot = df_rf_manual[mask_cash]['Atual'].sum()

# Patrimônio exibido = RV + RF_engine + Caixa
patrimonio_exibido = patrimonio_spot + caixa_spot
```

**Armadilha:** o `patrimonio_spot` da Performance exclui CAIXA internamente e soma depois — diferente da Home.py que inclui tudo em `rf_patrimonio`. Ao comparar os dois números, lembrar que a Home pode incluir CAIXA no RF total.

---

## Referência Rápida: Qual função usar?

| Objetivo | Função | Arquivo |
|----------|--------|---------|
| **Cálculo de posições** | | |
| Posições abertas hoje (FIFO) | `calcular_carteira_fechada(df)` | `core/finance.py` |
| Snapshot completo (Streamlit) | `get_portfolio_snapshot()` | `core/computed.py` |
| Snapshot completo (script/CLI) | `build_snapshot()` | `scripts/daily_report.py` |
| **Motor de performance (TWR)** | | |
| Reconstrução histórica multi-moeda | `reconstruct_history_multicurrency(...)` | `core/engine.py` |
| Consolidar buckets para BRL | `consolidate_to_brl(buckets, fx_rates)` | `core/consolidator.py` |
| Decomposição ativo vs cambial | `decompose_portfolio(buckets, fx_rates)` | `core/performance/decomposition.py` |
| Atribuição por ativo | `calculate_asset_attribution(...)` | `core/performance/attribution.py` |
| **Renda Fixa** | | |
| RF com valor manual | `summarize_fixed_income_hybrid(...)` | `core/finance.py` |
| RF sem valor manual (SELIC) | `summarize_fixed_income(df_rf_raw)` | `core/finance.py` |
| Curva diária RF (motor completo) | `FixedIncomeEngine(...).build_daily_curve()` | `core/fixed_income_engine.py` |
| **Preços e mercado** | | |
| Preço e variação do dia | `fetch_market_data(tickers)` | `core/data/market.py` |
| Histórico de preços (N anos) | `fetch_historical_data(tickers, start)` | `core/data/market.py` |
| **Carregamento de dados** | | |
| Transações RV | `load_assets()` | `core/data/loader.py` |
| Proventos / dividendos | `load_proventos()` | `core/data/loader.py` |
| Transações RF | `load_fixed_income()` | `core/data/loader.py` |
| Saldos RF manuais | `load_fixed_income_manual()` | `core/data/loader.py` |
| Remessas de câmbio | `load_cambio()` | `core/data/loader.py` |
| **Utilitários** | | |
| Verificar se ticker é RV | `_is_market_ticker(ticker)` | `core/computed.py` |
| Converter decimal BR | `parse_decimal_br(value)` | `core/utils.py` |
| Formatar valor BR | `format_decimal_br(value, n)` | `core/utils.py` |

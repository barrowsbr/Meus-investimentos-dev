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

---

## Referência Rápida: Qual função usar?

| Objetivo | Função | Arquivo |
|----------|--------|---------|
| Posições abertas hoje | `calcular_carteira_fechada(df)` | `core/finance.py` |
| Preço e variação do dia | `fetch_market_data(tickers)` | `core/data/market.py` |
| Histórico de preços (N anos) | `fetch_historical_data(tickers, start)` | `core/data/market.py` |
| Snapshot completo (Streamlit) | `get_portfolio_snapshot()` | `core/computed.py` |
| Snapshot completo (script/CLI) | `build_snapshot()` | `scripts/daily_report.py` |
| RF com valor manual | `summarize_fixed_income_hybrid(...)` | `core/finance.py` |
| RF sem valor manual (SELIC) | `summarize_fixed_income(df_rf_raw)` | `core/finance.py` |
| Carregar transações | `load_assets()` | `core/data/loader.py` |
| Carregar proventos | `load_proventos()` | `core/data/loader.py` |
| Carregar RF transações | `load_fixed_income()` | `core/data/loader.py` |
| Carregar RF manual | `load_fixed_income_manual()` | `core/data/loader.py` |
| Verificar se ticker é RV | `_is_market_ticker(ticker)` | `core/computed.py` |
| Converter decimal BR | `parse_decimal_br(value)` | `core/utils.py` |
| Formatar valor BR | `format_decimal_br(value, n)` | `core/utils.py` |

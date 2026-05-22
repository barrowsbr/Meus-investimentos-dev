# Estrutura da Planilha Google Sheets

> Planilha: `gdados`
> Modulo de conexao: `lib/gsheets.ts`
> Autenticacao: Google API Key (planilha compartilhada publicamente como Leitor)

---

## 1. Conexao e Leitura

### Configuracao

```typescript
// lib/gsheets.ts
const SPREADSHEET_ID = process.env.SPREADSHEET_ID!;
const API_KEY = process.env.GOOGLE_API_KEY!;
```

### Funcao de Leitura

```typescript
export async function fetchTab(tabName: string): Promise<Record<string, unknown>[]>
```

- Usa `googleapis` com `valueRenderOption: "UNFORMATTED_VALUE"`
- A primeira linha e tratada como header
- Headers sao normalizados para **lowercase** e **trimmed**
- Colunas de data sao auto-convertidas de serial number para `YYYY-MM-DD`
- Retorna array de objetos `{ [coluna]: valor }`

### Conversao de Datas

Colunas cujo header faz match com `/data|compra|pagamento|date/` sao auto-convertidas:

```typescript
// Serial number do Excel/Sheets -> YYYY-MM-DD
function serialToDate(serial: number): string {
  const utcDays = Math.floor(serial - 25569);
  const d = new Date(utcDays * 86400 * 1000);
  // retorna "YYYY-MM-DD"
}
```

---

## 2. Abas Permitidas pela API

O endpoint `/api/sheets/[tab]` restringe acesso a estas abas:

```typescript
const allowed = [
  "meus_ativos", "meus_proventos", "renda_fixa", "fixa_aberta",
  "cambio", "db_cotacoes", "composicao", "p_tax",
  "lb_historic", "financas", "financas_pessoal",
];
```

---

## 3. Estrutura de Cada Aba

### 3.1 `meus_ativos` -- Transacoes de Ativos

Transacoes de compra e venda de acoes, ETFs, FIIs, BDRs e cripto.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| data | date (serial/string) | Data da transacao |
| tipo de transacao | string | Compra, Venda, buy, sell, aporte, resgate, bonif, subscri |
| simbolo | string | Ticker do ativo (ex: PETR4, SPY, VOO) |
| quantidade | number | Quantidade de cotas/acoes |
| preco | number | Preco unitario |
| valor bruto | number | Valor total bruto da operacao |
| taxa de corretagem | number | Taxas e corretagem |
| valor liquido | number | Valor total liquido |
| moeda | string | BRL ou USD |
| corretora | string | Nome da corretora (ex: B3, IBKR) |

**Normalizacao de colunas no codigo:**

```typescript
// Ticker: busca em "simbolo", "simbolo", "ticker", "symbol"
// Tipo: busca em "tipo de transacao", "tipo de transacao", "tipo_transacao", "tipo"
// Quantidade: busca em "quantidade", "qtd", "quantity"
// Preco: busca em "preco", "preco", "price"
// Taxas: busca em "taxa de corretagem", "taxas", "taxa"
// Moeda: busca em "moeda", "currency" (default: "BRL")
// Data: busca em "data", "date", "compra"
```

**Tipos de transacao aceitos:**

| Valor na Planilha | Interpretacao |
|---|---|
| compra, buy, aporte, subscri, bonif | Compra |
| venda, sell, resgate | Venda |

---

### 3.2 `meus_proventos` -- Dividendos e Rendimentos

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| ticker | string | Ticker do ativo |
| data | date | Data do pagamento |
| decisao | string | Classificacao: Dividendo ou IMPOSTO |
| mes | string | Mes abreviado + ano (ex: jan/25) |
| ano | number | Ano do pagamento |
| lancamento | string | Tipo: Dividendo, JCP, Rendimento, etc. |
| categoria | string | Categoria adicional |
| valor | number | Valor recebido (formato decimal) |
| moeda | string | BRL ou USD |

**Processamento:**

```typescript
// Busca valor em "valor" ou "value"
// Busca data em "data", "date" ou "pagamento"
// Agrupa por mes no formato "YYYY-MM"
// Converte para BRL usando fxToBRL()
```

---

### 3.3 `renda_fixa` -- Transacoes de Renda Fixa

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| compra | date | Data da compra/aquisicao |
| ticker | string | Nome do titulo (ex: CDB Banco X, Tesouro Selic 2029) |
| tipo | string | Tipo: Compra, Venda, Resgate |
| valor | number | Valor da operacao |
| moeda | string | BRL ou USD |

---

### 3.4 `fixa_aberta` -- Saldo Manual de Renda Fixa

**Fonte da verdade** para posicoes de renda fixa. Saldos atualizados manualmente.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| ticker / ativo | string | Nome do titulo |
| atual / valor_atual / saldo | number | Valor atual da posicao |
| data | date | Data da ultima atualizacao |
| moeda | string | BRL ou USD |
| tipo | string | Tipo do titulo |

**Normalizacao de colunas no codigo:**

```typescript
// Valor: busca em "atual", "valor_atual", "saldo", "valor atual"
// Moeda: busca em "moeda", "currency" (default: "BRL")
```

**Uso no sistema:**

```typescript
// lib/portfolio.ts
export function calcularRendaFixaBRL(fixaAberta: Row[], fx: FxRates): number {
  // Soma todos os valores convertidos para BRL
  // rfPatrimonioBRL = fixa_aberta_total + posicoes RF (SHV, BIL)
}
```

---

### 3.5 `cambio` -- Operacoes de Cambio

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| data | date | Data da operacao |
| moeda_origem | string | Moeda de origem (ex: BRL) |
| moeda_destino | string | Moeda de destino (ex: USD) |
| valor_origem / valor_entrada | number | Valor enviado |
| valor_destino / valor_saida | number | Valor recebido |
| taxa / vet | number | Taxa de cambio (VET) |
| corretora / instituicao | string | Instituicao financeira |

---

### 3.6 `composicao` -- Composicao de ETFs

Cache de look-through para composicao de ETFs e carteira.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| (variavel) | string | Identificador do ativo |
| peso / percentual / % / pl / part% | number | Peso na composicao |

---

### 3.7 `lb_historic` -- Historico Patrimonial

Dados historicos da evolucao do patrimonio ao longo do tempo, usados para graficos de evolucao.

---

### 3.8 `financas` -- Dados Financeiros

Dados de cartoes de credito, contas bancarias e gastos.

---

### 3.9 `financas_pessoal` -- Controle Financeiro Pessoal

Registro de entradas, saidas e gastos com cartao.

---

### 3.10 `db_cotacoes` -- Banco Local de Cotacoes

Armazena precos historicos de ativos para consulta offline.

---

### 3.11 `p_tax` -- Taxas PTAX

Cotacoes oficiais do Banco Central do Brasil (PTAX) para fins de declaracao de IR.

---

## 4. Formato de Dados

### Numeros

- A planilha e lida com `UNFORMATTED_VALUE`, entao numeros chegam como `number` do JavaScript
- Para parsing de strings (fallback), o sistema suporta formato brasileiro:
  - `1234,56` -> `1234.56` (virgula como decimal)
  - `1.234,56` -> `1234.56` (ponto como milhar, virgula como decimal)

```typescript
// lib/format.ts
export function toNumber(value: unknown): number | null {
  // Suporta: number, "1234.56", "1234,56", "1.234,56"
}
```

### Datas

Dois formatos suportados na leitura:

1. **Serial number** (Excel/Sheets): convertido automaticamente em `fetchTab()` para `YYYY-MM-DD`
2. **String `dd/mm/yyyy`**: parseado em `getData()` no portfolio

```typescript
// lib/portfolio.ts
function getData(row: Row): number {
  // Suporta: serial number, "dd/mm/yyyy", "yyyy-mm-dd"
  // Retorna timestamp (milissegundos)
}
```

### Moeda

- Campo `moeda` aceita: `BRL`, `USD`, `EUR`, `GBP`, `CAD`
- Quando vazio ou ausente, assume `BRL`
- Overrides de moeda sao aplicados por `getMoedaEfetiva()` (ver `docs/SPECIAL_RULES.md`)

---

## 5. Fluxo de Dados Completo

```
Google Sheets (gdados)
  |
  v
fetchTab(tabName)           -- lib/gsheets.ts
  |-- valueRenderOption: UNFORMATTED_VALUE
  |-- headers -> lowercase
  |-- serial dates -> YYYY-MM-DD
  |
  v
API Routes
  |-- /api/sheets/[tab]     -- dados brutos (cache 5 min)
  |-- /api/cotacoes          -- snapshot processado (cache 15 min)
       |-- fetchTab("meus_ativos")
       |-- fetchTab("meus_proventos")
       |-- fetchTab("fixa_aberta")
       |-- calcularSnapshot(...)
  |
  v
Client Hooks
  |-- useSheetData(tab)     -- dados brutos
  |-- usePortfolio()        -- snapshot completo
```

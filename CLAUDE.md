# Meus Investimentos

Dashboard de investimentos pessoal — Next.js 14 + Tailwind CSS + Google Sheets.

## Stack

- **Framework**: Next.js 14 (App Router)
- **Estilo**: Tailwind CSS 3 (tema dark, glassmorphism)
- **Gráficos**: Recharts
- **Dados**: Google Sheets API (`googleapis`)
- **Deploy**: Vercel

## Estrutura

```
app/                    Páginas e API routes
  api/sheets/[tab]/     API genérica — retorna dados de qualquer aba
  portfolio/            Transações de ativos
  proventos/            Dividendos e rendimentos
  renda-fixa/           Renda fixa (posições + transações)
  cambio/               Operações de câmbio
  financas/             Controle financeiro
components/             Componentes reutilizáveis
lib/
  gsheets.ts            Conexão com Google Sheets
  hooks.ts              Hook useSheetData para fetching
  format.ts             Formatação BRL/USD, datas, números
```

## Setup Local

```bash
npm install
# Preencher .env.local com GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY e SPREADSHEET_ID
npm run dev
```

## Deploy na Vercel

1. Push para o GitHub
2. Importar projeto na Vercel
3. Configurar Environment Variables: `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `SPREADSHEET_ID`

## Acesso ao Google Sheets

- **Planilha**: `gdados`
- **Credenciais**: via env vars (extraídas do `service_account.json`)
- **Service account email**: `gdados@project-34f443f1-80d4-441b-879.iam.gserviceaccount.com`
- **Biblioteca**: `googleapis` (Node.js)

---

## Abas e Colunas da Planilha `gdados`

### 1. `meus_ativos` — Transações de ativos (ações, ETFs, FIIs)

| Coluna | Descrição |
|--------|-----------|
| Data | Data da transação |
| Tipo de transação | Compra / Venda (aceita também: buy, sell, aporte, resgate, bonif, subscri) |
| Símbolo | Ticker do ativo (ex: PETR4, IVVB11, VOO) |
| Quantidade | Quantidade de cotas/ações |
| Preço | Preço unitário |
| Valor bruto | Valor total bruto da operação |
| Taxa de corretagem | Taxas/corretagem cobradas |
| Valor líquido | Valor total líquido |
| Moeda | BRL ou USD |
| Corretora | Nome da corretora (ex: B3, IBKR) |

### 2. `meus_proventos` — Dividendos, JCP e distribuições

| Coluna | Descrição |
|--------|-----------|
| ticker | Ticker do ativo |
| data | Data do pagamento |
| decisao | Classificação: Dividendo ou IMPOSTO (usado na sincronização IBKR) |
| mes | Mês abreviado + ano (ex: jan/25, fev/25) |
| ano | Ano do pagamento |
| lancamento | Tipo do evento: Dividendo, JCP, Rendimento, etc. |
| categoria | Categoria adicional do provento |
| valor | Valor recebido (formato decimal BR: vírgula como separador) |
| moeda | BRL ou USD |

### 3. `renda_fixa` — Transações de renda fixa

| Coluna | Descrição |
|--------|-----------|
| compra | Data da compra/aquisição |
| ticker | Nome/identificador do título (ex: CDB Banco X, Tesouro Selic 2029) |
| tipo | Tipo de movimentação: Compra, Venda, Resgate |
| valor | Valor da operação |
| moeda | BRL ou USD |

### 4. `fixa_aberta` — Saldo manual de renda fixa (posição atual)

| Coluna | Descrição |
|--------|-----------|
| ticker / ativo | Nome do título |
| atual / valor_atual / saldo | Valor atual da posição |
| data | Data da última atualização |
| moeda | BRL ou USD |
| tipo | Tipo do título |

### 5. `cambio` — Transações de câmbio

| Coluna | Descrição |
|--------|-----------|
| data | Data da operação |
| moeda_origem | Moeda de origem (ex: BRL) |
| moeda_destino | Moeda de destino (ex: USD) |
| valor_origem / valor_entrada | Valor enviado na moeda de origem |
| valor_destino / valor_saida | Valor recebido na moeda de destino |
| taxa / vet | Taxa de câmbio utilizada (VET) |
| corretora / instituição | Instituição financeira usada |

### 6. `db_cotacoes` — Banco local de cotações

Armazena preços históricos de ativos para consulta offline.

### 7. `composicao` — Composição de ETFs / carteira

| Coluna | Descrição |
|--------|-----------|
| (variável) | Identificador do ativo |
| peso / percentual / % / pl / part% | Peso/percentual do ativo na composição |

### 8. `p_tax` — Taxas PTAX (BCB)

Cotações oficiais do Banco Central do Brasil (PTAX) para fins de declaração de IR.

### 9. `lb_historic` — Histórico patrimonial

Dados históricos da evolução do patrimônio ao longo do tempo.

### 10. `financas` — Dados financeiros pessoais

Dados de cartões de crédito, contas bancárias e gastos.

### 11. `financas_pessoal` — Controle financeiro pessoal

Registro de entradas, saídas e gastos com cartão.

---

## Notas

- Os valores monetários na planilha usam **formato brasileiro** (vírgula como separador decimal)
- As datas podem estar em formato `dd/mm/yyyy` ou `yyyy-mm-dd`
- O campo `moeda` assume `BRL` quando ausente ou vazio
- A planilha é compartilhada com o service account via Google Drive

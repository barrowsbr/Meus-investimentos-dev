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

### Opção 1: Tudo em um (Recomendado — Next.js + Python Serverless no mesmo domínio)
```bash
npm install
# Preencher .env.local com GOOGLE_API_KEY, SPREADSHEET_ID e GEMINI_API_KEY
npx vercel dev
```
Isso roda o frontend e o backend juntos no mesmo domínio (geralmente `http://localhost:3000`), exatamente como em produção.

### Opção 2: Separados (Tradicional)
* Frontend:
  ```bash
  npm run dev
  ```
* Backend (em outra aba do terminal, na raiz do projeto):
  ```bash
  python -m venv .venv
  source .venv/bin/activate  # ou .venv\Scripts\activate no Windows
  pip install -r requirements.txt
  python -m uvicorn api.index:app --reload
  ```
  *(Defina `NEXT_PUBLIC_API_URL=http://localhost:8000` em `.env.local` se optar por rodar separado).*


## Deploy na Vercel

1. Push para o GitHub
2. Importar projeto na Vercel
3. Configurar Environment Variables: `GOOGLE_API_KEY`, `SPREADSHEET_ID`
4. A planilha deve estar compartilhada com "Qualquer pessoa com o link" (Leitor)

## Acesso ao Google Sheets

- **Planilha**: `gdados`
- **Autenticação**: API Key (não precisa de service account)
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

---

## Fluxo de trabalho (preferências do dono)

- **Sempre abrir o PR automaticamente** quando uma alteração estiver pronta para produção, na **direção correta**: `base: main` ← `compare: claude/add-repo-description-AanfH` (branch → main). O dono só clica em "Merge". Nunca abrir na direção invertida (main → branch).
- Desenvolver sempre na branch `claude/add-repo-description-AanfH`; commitar e dar push lá.
- Produção é a `main` (deploy automático na Vercel). Crons (`vercel.json`) só são registrados no deploy de produção da `main`.
- **Sempre fazer as duas coisas**: quando o dono manda uma mensagem enquanto uma tarefa está em andamento, fazer AMBAS — a tarefa corrente e o que foi pedido na nova mensagem.
- **"Investido"** = custo FIFO das posições atuais (não soma bruta de todas as compras).

## Arquitetura de cálculo — FONTE ÚNICA (regra dura)

> Esta regra existe para impedir o problema histórico de "mudo numa página e quebra
> a simetria com outra". Toda métrica tem UM lugar onde é calculada.
>
> **Leia `CANONICO.md`** — define o conceito de cálculo canônico, o catálogo de
> métricas (qual campo ler), as exceções permitidas e os gaps a reconciliar.
> Cálculo conhecido = reusar o campo canônico do snapshot; **nunca** recalcular ad-hoc.

- **TypeScript é o único motor de portfólio.** Toda matemática de patrimônio,
  investido (FIFO), lucro, proventos, câmbio e renda fixa vive em **`lib/portfolio.ts`**
  (`calcularSnapshot` + helpers) e `lib/cambio.ts`. As páginas consomem via
  `usePortfolio` → `/api/cotacoes`, ou rotas TS que reusam `calcularSnapshot`
  (`/api/composicao/resumo`, `/api/renda-fixa/posicoes`, `/api/portfolio/sectors`).
- **Python (`api/index.py` / `backend/`) serve APENAS** preditivo/ML, agente/IA e
  endpoints sem equivalente TS (`/api/fluxos`, `/api/historico`). **NUNCA** recalcular
  portfólio/proventos/câmbio em Python — o `portfolio_service.py` está em quarentena
  (inalcançável por rota) e não deve voltar a ser ligado.
- **`vercel.json` rewrites**: só pode haver rewrite para Python em paths que NÃO têm
  rota TS. Adicionar rewrite sobre um path TS recria a divergência silenciosa (a rota
  de arquivo Next.js vence o rewrite, então o Python fica "morto mas divergente").
- **Câmbio de custo (P0)** = pmDólar real das remessas (`buildPmFxRates` → `fxCusto`),
  não PTAX da data de compra. Vale para Resumo, Câmbio e DRE. Ver `CALCULOS.md §20`.
- **Rentabilidade**: mostrar SEMPRE duas medidas separadas — **Valorização %**
  (só preço/câmbio, sem proventos) e **Retorno Total %** (valorização + proventos
  líquidos / investido). Nunca misturar uma só métrica que ora inclui, ora não.
- `lib/fixed-income-engine.ts` foi **removido** (era legado). O motor canônico de
  RF manual é `lib/renda-fixa.ts` (`calcularRendaFixaPosicoes`), consumido pela
  rota `/api/renda-fixa/posicoes` e pelo contexto do agente IA.

## Base de cotações (golden source — `db_cotacoes`)

- `db_cotacoes` é a **fonte de verdade** de preços para performance/TWR: matriz larga (1 linha/dia, 1 coluna/ativo), **preço bruto de fechamento** (não ajustado). FX e índices (`BRL=X`, `^BVSP`, `^GSPC`) são colunas normais.
- A Performance lê dessa aba primeiro (`lib/market-history.ts`); só recorre ao Yahoo para tickers ausentes.
- **Preço bruto + proventos somados separadamente** (motor TWR) = retorno correto. Usar `adjClose` causaria double-count de dividendos (foi o que inflava a rentabilidade antes).
- Atualização automática via Vercel Cron (`/api/cron/cotacoes`, dias úteis 23h UTC). Botão manual em Configurações.
- Auditoria: `GET /api/debug/auditoria?lookback=DIAS` mede bloqueios anti-outlier e decompõe preço × dividendos.

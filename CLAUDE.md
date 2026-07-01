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
app/                    Páginas (App Router) e API routes
  api/                  ~50 rotas: cotacoes, sheets/[tab], twr, performance/advanced,
                        bolsas/*, composicao/*, ir/*, sync/* (IBKR/B3), cron/cotacoes, ...
  (Portfólio)           resumo, renda-variavel, renda-fixa, proventos, criptoativos, opcoes
  (Análise)             performance, setores, evolucao, cambio, simulacoes, trades
  (Gestão)              impostos, alavancagem, financas, fluxos
  (Mais)                bolsas (Radar), noticias, polymarket, agente-ia, configuracoes
components/             Componentes reutilizáveis (Sidebar, AuthGate, gráficos, globo)
lib/
  portfolio.ts          Motor canônico de portfólio — FIFO + calcularSnapshot
  twr-engine.ts         Motor TWR/MWR (Modified Dietz, GIPS)
  renda-fixa.ts         Motor canônico de RF manual (calcularRendaFixaPosicoes)
  cambio.ts             Remessas e pmDólar (buildPmFxRates → fxCusto)
  cotacoes.ts           Yahoo Finance + FX (fetchCotacoes, fxToBRL)
  market-history.ts     Histórico de preços (golden source db_cotacoes)
  gsheets.ts            Google Sheets — leitura (API key) e escrita (service account)
  tax/                  Motor de apuração de IR
  hooks.ts, format.ts, sectors.ts, ...
backend/ + api/index.py Python serverless — APENAS preditivo/ML, agente IA, fluxos, histórico
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
3. Configurar Environment Variables:
   - **Obrigatórias**: `GOOGLE_API_KEY`, `SPREADSHEET_ID`, `GEMINI_API_KEY`
   - **Escrita na planilha** (sync IBKR/B3, cron de cotações, backups): `GOOGLE_SERVICE_ACCOUNT_JSON`
   - **Opcionais**: `APP_PASSWORD` (tela de senha/AuthGate), `ALPHAVANTAGE_API_KEY` (holdings de ETFs US),
     `OPENAI_API_KEY` / `GROQ_API_KEY` / `DEEPSEEK_API_KEY` (cascata do agente IA),
     `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` (notícias),
     `TELEGRAM_BOT_TOKEN` (alertas determinísticos — DARF/DIRPF/alavancagem via cron;
     o chat_id vai em Configurações, não é env var)
4. A planilha deve estar compartilhada com "Qualquer pessoa com o link" (Leitor)

## Acesso ao Google Sheets

- **Planilha**: `gdados`
- **Leitura**: API Key (`GOOGLE_API_KEY`) — basta a planilha compartilhada por link como Leitor
- **Escrita**: service account (`GOOGLE_SERVICE_ACCOUNT_JSON`), com a planilha compartilhada
  com o e-mail do service account como **Editor**. Toda escrita (`writeTab`) faz **backup
  automático** da aba antes de sobrescrever (`lib/backup.ts`)
- **Biblioteca**: `googleapis` (Node.js)

## Modo demonstração (showcase)

- Login **`test` / `test`** entra na MESMA conta do dono, porém com todos os
  **valores e quantidades multiplicados por 15** (`DEMO_FACTOR` em `lib/demo.ts`).
  Serve para mostrar o projeto a terceiros sem expor os números reais — **não cria
  banco/dados novos**.
- O escalonamento acontece na **camada de leitura** (`fetchTab` → `scaleRowsForTab`):
  como o motor deriva tudo de `quantidade × preço`, patrimônio/investido/lucro/
  proventos/câmbio escalam ×15, enquanto **preço unitário, cotações, taxa de câmbio,
  pesos da composição e percentuais continuam reais** (carteira coerente).
- **Somente leitura**: ativado por um cookie **HttpOnly** setado pelo servidor (o
  cliente não consegue forjar/remover) e toda escrita em planilha lança erro em modo
  demo (`assertNotDemo` em `lib/gsheets.ts`). O login normal limpa o cookie.
- Caveat: cálculos feitos no Python (`api/index.py` — agente IA, fluxos) leem a
  planilha direto e **não** são escalados; as páginas de portfólio (TS) sim.

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

### 8. `p_tax` — Taxas PTAX (BCB) — multi-moeda

Cotações oficiais do Banco Central do Brasil (PTAX venda) para fins de declaração de IR.
Colunas: `data`, `moeda` (USD/EUR/CAD/GBP), `taxa`. Fonte primária é a API do BCB
(`lib/ptax.ts` com cache em memória); a aba serve como backup/auditoria.
O motor fiscal (`buildMultiCurrencyPtax`) busca PTAX de cada moeda encontrada nas
transações — não depende mais de manutenção manual da aba.

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
- Leitura exige a planilha compartilhada por link (Leitor); escrita exige compartilhamento
  com o e-mail do service account (Editor) — ver "Acesso ao Google Sheets" acima

---

## Fluxo de trabalho (preferências do dono)

- **Sempre abrir o PR automaticamente** quando uma alteração estiver pronta para produção, na **direção correta**: `base: main` ← `compare: claude/add-repo-description-AanfH` (branch → main). Nunca abrir na direção invertida (main → branch).
- **Mergear automaticamente** (squash) assim que a alteração estiver pronta e validada (type-check/lint), sem esperar o dono clicar — o dono pediu para deixar configurado para mergear sempre quando o trabalho vier por aqui. Exceção: se o dono pedir explicitamente para segurar um PR específico (ex.: querer revisar um tema visual no preview antes), aí sim aguardar.
- Desenvolver sempre na branch `claude/add-repo-description-AanfH`; commitar e dar push lá.
- Produção é a `main` (deploy automático na Vercel). Crons (`vercel.json`) só são registrados no deploy de produção da `main`.
- **Sempre fazer as duas coisas**: quando o dono manda uma mensagem enquanto uma tarefa está em andamento, fazer AMBAS — a tarefa corrente e o que foi pedido na nova mensagem.
- **"Investido"** = custo FIFO das posições atuais (não soma bruta de todas as compras).

## Como fazer auditorias e análises de gaps (regra dura)

> Contexto: auditorias superficiais já causaram gaps fiscais reais (motor inteiro
> era USD-only, PTAX descartava EUR, câmbio IR só rastreava dólar) que só foram
> detectados quando o dono perguntou diretamente. Nunca mais.

Quando o dono pedir "analise gaps", "faça auditoria", "mapeie problemas" ou equivalente:

1. **Inventário de dados reais primeiro** — antes de opinar, levantar fatos: quais
   moedas existem nas transações (`meus_ativos`), quais abas a planilha tem, quais
   tickers aparecem, quais corretoras. Grep real no código, não suposição.
2. **Testar cada premissa do motor contra os dados** — para cada motor/engine, verificar:
   "funciona para TODAS as moedas que o usuário tem?", "funciona para todos os tipos
   de ativo?", "o fluxo de dados chega de ponta a ponta?". Uma busca por `EUR` ou
   `CAD` no motor fiscal teria revelado o gap em 30 segundos.
3. **Cruzar inputs com outputs** — se a aba `cambio` tem EUR mas o motor só rastreia
   USD, isso é um gap de **corretude fiscal**, não de "nice to have". Seguir o dado
   da planilha até o número na tela.
4. **Priorizar por impacto fiscal** — número errado na declaração > feature faltando
   na UI > melhoria estética. Gaps que afetam cálculos de IR têm prioridade máxima.
5. **Usar agentes paralelos** — para auditorias amplas, disparar agentes Explore em
   paralelo por subsistema (tax, portfolio, cambio, cotacoes) em vez de ler
   superficialmente arquivo por arquivo.
6. **Nunca listar só o óbvio** — se os gaps encontrados são todos de UI/UX e nenhum
   de lógica/dados, a análise provavelmente foi rasa. Voltar e cavar mais fundo.

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

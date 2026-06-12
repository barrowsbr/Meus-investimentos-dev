# Documento de Handoff -- Meus Investimentos

> Dashboard de investimentos pessoal construido com Next.js 14 (App Router), Tailwind CSS 3 e Google Sheets como banco de dados.
> Deploy via Vercel.

---

## 1. Visao Geral

O sistema consolida dados de investimentos pessoais armazenados em uma planilha Google Sheets (`gdados`) e apresenta um dashboard web com:

- **Portfolio de Renda Variavel** -- posicoes, lucro/prejuizo, cotacoes em tempo real
- **Renda Fixa** -- posicoes manuais (fixa_aberta) + ativos RF negociados (SHV, BIL)
- **Proventos** -- dividendos, JCP, rendimentos
- **Cambio** -- operacoes de conversao de moeda e pmDolar das remessas
- **Performance** -- TWR/MWR (Modified Dietz GIPS), decomposicao cambial, benchmarks
- **Impostos** -- apuracao de IR (lib/tax), DIRPF, DARF
- **Radar de mercados** -- bolsas globais, moedas, cripto, setores
- **Simulacoes, trades, alavancagem, agente IA, noticias, mercados preditivos**
- **Financas pessoais** -- cartoes, contas, gastos
- **Sincronizacao** -- importacao IBKR/B3, cron diario de cotacoes (db_cotacoes), backups automaticos

---

## 2. Stack Tecnica

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 14 (App Router) |
| Linguagem | TypeScript |
| Estilo | Tailwind CSS 3 (tema dark, glassmorphism) |
| Graficos | Recharts |
| Dados | Google Sheets API (`googleapis`) |
| Cotacoes | `yahoo-finance2` (npm) |
| Cambio | AwesomeAPI + Yahoo Finance (fallback) |
| Deploy | Vercel |
| Icones | Lucide React |

---

## 3. Arquitetura

```
app/
  layout.tsx              Layout global (Tailwind dark theme, AuthGate)
  page.tsx                Home

  Paginas (grupos do Sidebar):
    Portfolio:  resumo, renda-variavel, renda-fixa, proventos, criptoativos, opcoes
    Analise:    performance, setores, evolucao, cambio, simulacoes, trades
    Gestao:     impostos, alavancagem, financas, fluxos
    Mais:       bolsas (Radar), noticias, polymarket, agente-ia, configuracoes
    Sem menu:   portfolio, moedas, performance-avancada, preditivo

  api/                    ~50 rotas. Principais grupos:
    cotacoes/             Snapshot canonico do portfolio (cache 15 min)
    sheets/[tab]/         Dados brutos de qualquer aba permitida (cache 5 min)
    twr/                  Motor TWR/MWR + decomposicao
    performance/advanced/ Visao avancada (atribuicao, visao USD)
    composicao/           Resumo canonico, holdings de ETFs
    bolsas/, moedas/      Radar de mercados globais
    ir/                   Apuracao de impostos, DIRPF
    sync/                 Importacao IBKR / B3 / cotacoes
    cron/cotacoes/        Cron diario (dias uteis 23h UTC) -> db_cotacoes
    auth/, backup/, debug/, chat/, noticias/, reddit/, simulacoes/ ...

lib/
  portfolio.ts            Motor canonico -- FIFO, enriquecimento, calcularSnapshot
  twr-engine.ts           Motor TWR/MWR (Modified Dietz, GIPS)
  renda-fixa.ts           Motor canonico de RF manual
  cambio.ts               Remessas e pmDolar (buildPmFxRates)
  cotacoes.ts             Yahoo Finance quotes + taxas de cambio
  market-history.ts       Historico de precos (golden source db_cotacoes)
  gsheets.ts              Google Sheets -- leitura (API Key) e escrita (service account)
  backup.ts               Backup automatico antes de escritas
  tax/                    Motor de apuracao de IR
  sectors.ts, hooks.ts, format.ts, ...

backend/ + api/index.py   Python serverless (FastAPI) -- APENAS preditivo/ML, agente IA,
                          fluxos e historico (ver CLAUDE.md "Fonte unica")

components/               Sidebar, AuthGate, graficos (CandleChart, HoloGlobe, Sunburst...)
```

### 3.1 Fluxo de Dados

```
Google Sheets (gdados)
       |
       v
[API Route: /api/sheets/[tab]]  <-- cache 5 min (revalidate = 300)
       |
       v
[API Route: /api/cotacoes]      <-- cache 15 min (revalidate = 900)
  |-- fetchTab("meus_ativos")
  |-- fetchTab("meus_proventos")
  |-- fetchTab("fixa_aberta")
  |-- fetchCotacoes(tickers)    <-- yahoo-finance2
  |-- calcularSnapshot(...)     <-- FIFO + enriquecimento
       |
       v
[Client: usePortfolio()]        <-- hook React que consome /api/cotacoes
[Client: useSheetData(tab)]     <-- hook React que consome /api/sheets/[tab]
```

### 3.2 Cache e Performance

| Endpoint | TTL | Estrategia |
|----------|-----|-----------|
| `/api/cotacoes` | 15 min | `revalidate = 900` + `s-maxage=900, stale-while-revalidate=300` |
| `/api/sheets/[tab]` | 5 min | `revalidate = 300` + `s-maxage=300, stale-while-revalidate=60` |
| `/api/health` | 0 | `force-dynamic` (sem cache) |

---

## 4. Variaveis de Ambiente

| Variavel | Obrigatoria | Descricao |
|----------|-------------|-----------|
| `GOOGLE_API_KEY` | sim | Chave de API do Google (leitura do Sheets) |
| `SPREADSHEET_ID` | sim | ID da planilha `gdados` |
| `GEMINI_API_KEY` | sim | Agente IA (Gemini) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | p/ escrita | JSON do service account -- necessario para sync IBKR/B3, cron de cotacoes e backups |
| `APP_PASSWORD` | nao | Senha da tela de acesso (AuthGate) |
| `ALPHAVANTAGE_API_KEY` | nao | Holdings completos de ETFs US |
| `OPENAI_API_KEY` / `GROQ_API_KEY` / `DEEPSEEK_API_KEY` | nao | Cascata de fallback do agente IA |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | nao | API oficial do Reddit (pagina Noticias) |
| `NEXT_PUBLIC_API_URL` | nao | URL do backend Python quando rodando separado (vazio em producao) |

> **Leitura**: planilha compartilhada com "Qualquer pessoa com o link" (Leitor) + API Key.
> **Escrita**: planilha compartilhada com o e-mail do service account (Editor) +
> `GOOGLE_SERVICE_ACCOUNT_JSON`. Toda escrita faz backup automatico antes (`lib/backup.ts`).

---

## 5. Modulos Principais

### 5.1 `lib/gsheets.ts` -- Conexao com Google Sheets

- Usa `googleapis` com API Key
- Funcao `fetchTab(tabName)` retorna `Record<string, unknown>[]`
- Headers sao normalizados para lowercase
- Colunas de data (match `data|compra|pagamento|date`) sao convertidas de serial number para `YYYY-MM-DD`
- Valores lidos com `UNFORMATTED_VALUE` (numeros puros, sem formatacao)

### 5.2 `lib/portfolio.ts` -- Calculadora de Portfolio

Ver `docs/PORTFOLIO_CALC.md` para detalhes do algoritmo FIFO.

Funcoes exportadas:
- `calcularCarteiraFIFO(transacoes)` -- processa transacoes e retorna mapa de posicoes com lotes
- `enriquecerPosicoes(portfolio, quotes, fx)` -- adiciona cotacoes, calcula lucro em BRL
- `calcularProventosBRL(proventos, fx)` -- totaliza proventos convertidos para BRL
- `calcularRendaFixaBRL(fixaAberta, fx)` -- totaliza renda fixa de fixa_aberta
- `calcularSnapshot(transacoes, proventos, fixaAberta, quotes, fx)` -- snapshot completo

### 5.3 `lib/cotacoes.ts` -- Cotacoes e Cambio

Ver `docs/CURRENCY.md` para detalhes de conversao.

- `yahooTicker(ticker, moeda, corretora)` -- converte ticker interno para formato Yahoo Finance
- `fetchFxRates()` -- busca taxas de cambio (Yahoo Finance primario, AwesomeAPI fallback)
- `fetchQuotes(yahooTickers)` -- busca cotacoes via yahoo-finance2
- `fetchCotacoes(tickers)` -- orquestra quotes + FX em paralelo
- `fxToBRL(currency, fx)` -- fator de conversao para BRL

### 5.4 `lib/sectors.ts` -- Classificacao de Setores

Ver `docs/SECTORS.md` para todas as classificacoes.

- `identificarSetor(ticker)` -- retorna o setor do ativo
- `isRendaFixa(setor)` / `isRendaVariavel(setor)` -- predicados
- `getMoedaEfetiva(ticker, moedaPlanilha, setor)` -- moeda efetiva com overrides

### 5.5 `lib/hooks.ts` -- Hooks Client-Side

- `useSheetData<T>(tab)` -- fetcha dados de `/api/sheets/{tab}`, retorna `{ data, loading, error }`
- `usePortfolio()` -- fetcha snapshot de `/api/cotacoes`, retorna `{ data, loading, error }`

### 5.6 `lib/format.ts` -- Formatacao

- `toNumber(value)` -- parse de numeros (suporta formato BR com virgula)
- `brl(value)` -- formata como `R$ 1.234,56`
- `usd(value)` -- formata como `$1,234.56`
- `currency(value, moeda)` -- despacha para `brl()` ou `usd()`
- `formatDate(value)` -- converte `YYYY-MM-DD` para `DD/MM/YYYY`
- `shortMonth(dateStr)` -- converte `2025-01` para `Jan/25`

---

## 6. Regras de Negocio Criticas

### 6.1 FIFO para Custo Medio

Toda compra cria um lote `{qty, pm}`. Vendas consomem lotes na ordem FIFO.
O preco medio apos vendas e a media ponderada dos lotes remanescentes.
Ver `docs/PORTFOLIO_CALC.md`.

### 6.2 Regras Especiais de Classificacao

- **SHV e BIL** sao "Renda Fixa USD" (nao RV) -- entram no patrimonio RF
- **VWRA.L** e forcado para moeda USD independente da planilha
- **ETF USA** (SPY, QQQ, VOO, etc.) sempre USD
- **Cripto** e excluida da exposicao cambial
- Tickers brasileiros recebem sufixo `.SA` para Yahoo Finance
- Ver `docs/SPECIAL_RULES.md`

### 6.3 Calculo de Patrimonio

```
totalPatrimonioBRL = rvPatrimonioBRL + rfPatrimonioBRL
```

Onde:
- `rvPatrimonioBRL` = soma de `valorAtualBRL` de posicoes com setor de Renda Variavel e valor > R$ 1
- `rfPatrimonioBRL` = soma de `fixa_aberta` (BRL) + posicoes RF (SHV, BIL, etc.)

**NUNCA** somar posicoes diretamente para obter o patrimonio total. Sempre usar `rvPatrimonioBRL + rfPatrimonioBRL`.

### 6.4 Lucro/Prejuizo

O lucro e calculado apenas sobre posicoes de Renda Variavel:

```typescript
const lucroBRL = totalAtualRV - totalInvestidoRV;
const lucroPct = totalInvestidoRV > 0 ? (lucroBRL / totalInvestidoRV) * 100 : 0;
```

---

## 7. Planilha `gdados`

Ver `docs/GOOGLE_SHEETS.md` para estrutura detalhada de cada aba.

Abas principais:
1. `meus_ativos` -- transacoes de compra/venda
2. `meus_proventos` -- dividendos, JCP, rendimentos
3. `renda_fixa` -- transacoes de renda fixa
4. `fixa_aberta` -- saldo manual de RF (fonte da verdade)
5. `cambio` -- operacoes de cambio
6. `composicao` -- composicao de ETFs (cache de look-through)
7. `lb_historic` -- historico patrimonial
8. `financas` / `financas_pessoal` -- financas pessoais
9. `db_cotacoes` -- banco local de cotacoes
10. `p_tax` -- taxas PTAX do Banco Central

---

## 8. Deploy

### Vercel

```json
// vercel.json (resumo do real)
{
  "framework": "nextjs",
  "functions": { "api/index.py": { "maxDuration": 30 } },
  "crons": [{ "path": "/api/cron/cotacoes", "schedule": "0 23 * * 1-5" }],
  "rewrites": [
    { "source": "/api/fluxos",           "destination": "/api/index" },
    { "source": "/api/historico/:path*", "destination": "/api/index" },
    { "source": "/api/agent/:path*",     "destination": "/api/index" },
    { "source": "/api/preditivo/:path*", "destination": "/api/index" }
  ]
}
```

> **Regra dura**: rewrites para Python so podem existir em paths SEM rota TS
> equivalente (ver CLAUDE.md "Fonte unica"). Crons so sao registrados no deploy
> de producao da `main`.

Passos:
1. Push para o GitHub (producao = branch `main`)
2. Importar projeto na Vercel
3. Configurar Environment Variables (ver secao 4)
4. A planilha deve estar compartilhada publicamente (Leitor)

### Desenvolvimento Local

```bash
npm install
# Criar .env.local a partir de .env.local.example
npx vercel dev   # frontend + backend Python no mesmo dominio (recomendado)
# ou: npm run dev (so frontend; backend separado via uvicorn)
```

---

## 9. Endpoints da API

> O app tem ~50 rotas em `app/api/`. Abaixo, as principais. A lista completa esta
> na arvore da secao 3.

### `GET /api/cotacoes`

Endpoint principal. Retorna o `PortfolioSnapshot` canonico completo (posicoes
enriquecidas, patrimonio RV/RF, proventos, retorno total, decomposicao cambial,
exposicao por moeda, FX). Campos completos em `docs/PORTFOLIO_CALC.md §6` e
catalogo canonico em `CANONICO.md §3`.

### `GET /api/sheets/[tab]`

Retorna dados brutos de uma aba da planilha. Abas permitidas:

```
meus_ativos, meus_proventos, renda_fixa, fixa_aberta, cambio,
db_cotacoes, composicao, p_tax, lb_historic, financas, financas_pessoal
```

### Outros endpoints relevantes

| Endpoint | Funcao |
|----------|--------|
| `GET /api/twr` | TWR/MWR/Ganho Economico (`lib/twr-engine.ts`) |
| `GET /api/performance/advanced` | Visao avancada + visao USD |
| `GET /api/composicao/resumo` | Resumo canonico (DRE) |
| `GET /api/renda-fixa/posicoes` | Motor canonico de RF manual |
| `POST /api/sync/ibkr`, `/api/sync/b3` | Importacao de corretoras (escreve na planilha) |
| `GET /api/cron/cotacoes` | Cron diario -> aba `db_cotacoes` |
| `GET /api/debug/auditoria` | Auditoria do motor TWR (identidades) |
| `GET /api/health` | Health check (env vars + conexao Sheets) |

### Backend Python (rewrites)

`/api/fluxos`, `/api/historico/*`, `/api/agent/*`, `/api/preditivo/*` sao servidos
pelo FastAPI (`api/index.py` -> `backend/`). Nenhum calculo de portfolio vive la.

---

## 10. Documentacao Complementar

- `docs/PORTFOLIO_CALC.md` -- Algoritmo FIFO com exemplos numericos
- `docs/SECTORS.md` -- Classificacoes de setor e regras
- `docs/SPECIAL_RULES.md` -- Regras especiais (SHV/BIL, VWRA.L, cripto)
- `docs/GOOGLE_SHEETS.md` -- Estrutura de cada aba da planilha
- `docs/CURRENCY.md` -- Regras de moeda e conversao cambial

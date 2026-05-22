# Documento de Handoff -- Meus Investimentos

> Dashboard de investimentos pessoal construido com Next.js 14 (App Router), Tailwind CSS 3 e Google Sheets como banco de dados.
> Deploy via Vercel.

---

## 1. Visao Geral

O sistema consolida dados de investimentos pessoais armazenados em uma planilha Google Sheets (`gdados`) e apresenta um dashboard web com:

- **Portfolio de Renda Variavel** -- posicoes, lucro/prejuizo, cotacoes em tempo real
- **Renda Fixa** -- posicoes manuais (fixa_aberta) + ativos RF negociados (SHV, BIL)
- **Proventos** -- dividendos, JCP, rendimentos
- **Cambio** -- operacoes de conversao de moeda
- **Financas pessoais** -- cartoes, contas, gastos

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
  layout.tsx              Layout global (Tailwind dark theme)
  page.tsx                Dashboard principal
  portfolio/page.tsx      Transacoes de ativos
  proventos/page.tsx      Dividendos e rendimentos
  renda-fixa/page.tsx     Renda fixa
  cambio/page.tsx         Operacoes de cambio
  financas/page.tsx       Controle financeiro

  api/
    cotacoes/route.ts     Endpoint principal -- portfolio + cotacoes (cache 15 min)
    sheets/[tab]/route.ts Endpoint generico -- retorna dados de qualquer aba permitida
    health/route.ts       Health check -- valida env vars + conexao com Sheets

lib/
  gsheets.ts              Conexao com Google Sheets API (API Key)
  portfolio.ts            Calculadora FIFO, enriquecimento de posicoes, snapshot
  cotacoes.ts             Yahoo Finance quotes + taxas de cambio
  sectors.ts              Classificacao de setores por ticker
  hooks.ts                Hooks client-side (usePortfolio, useSheetData)
  format.ts               Formatacao BRL/USD, datas, numeros

components/               Componentes reutilizaveis (cards, tabelas, graficos)
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

| Variavel | Descricao |
|----------|-----------|
| `GOOGLE_API_KEY` | Chave de API do Google (acesso a Sheets) |
| `SPREADSHEET_ID` | ID da planilha `gdados` |

> A planilha deve estar compartilhada com "Qualquer pessoa com o link" (Leitor).
> Nao e necessario service account -- autenticacao via API Key.

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
// vercel.json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next"
}
```

Passos:
1. Push para o GitHub
2. Importar projeto na Vercel
3. Configurar Environment Variables: `GOOGLE_API_KEY`, `SPREADSHEET_ID`
4. A planilha deve estar compartilhada publicamente (Leitor)

### Desenvolvimento Local

```bash
npm install
# Criar .env.local com GOOGLE_API_KEY e SPREADSHEET_ID
npm run dev
```

---

## 9. Endpoints da API

### `GET /api/cotacoes`

Endpoint principal. Retorna o snapshot completo do portfolio:

```typescript
interface Response {
  positions: Position[];       // posicoes enriquecidas
  rvPatrimonioBRL: number;     // patrimonio RV em BRL
  rfPatrimonioBRL: number;     // patrimonio RF em BRL
  totalPatrimonioBRL: number;  // total
  totalProventosBRL: number;   // proventos acumulados
  proventosMensais: Record<string, number>;
  lucroBRL: number;
  lucroPct: number;
  usdbrl: number;
  eurbrl: number;
  cadbrl: number;
  fx: FxRates;
  timestamp: string;
  tickerMap: Record<string, string>;  // ticker original -> ticker Yahoo
}
```

### `GET /api/sheets/[tab]`

Retorna dados brutos de uma aba da planilha. Abas permitidas:

```
meus_ativos, meus_proventos, renda_fixa, fixa_aberta, cambio,
db_cotacoes, composicao, p_tax, lb_historic, financas, financas_pessoal
```

### `GET /api/health`

Health check. Verifica env vars e conexao com Sheets.

---

## 10. Documentacao Complementar

- `docs/PORTFOLIO_CALC.md` -- Algoritmo FIFO com exemplos numericos
- `docs/SECTORS.md` -- Classificacoes de setor e regras
- `docs/SPECIAL_RULES.md` -- Regras especiais (SHV/BIL, VWRA.L, cripto)
- `docs/GOOGLE_SHEETS.md` -- Estrutura de cada aba da planilha
- `docs/CURRENCY.md` -- Regras de moeda e conversao cambial

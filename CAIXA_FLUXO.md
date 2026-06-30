# Fluxo de Caixa / Liquidez — Arquitetura Completa

## Visão Geral

A lógica de caixa/liquidez é **automatizada e integrada**:
- **Fonte única**: aba `fixa_aberta` da planilha
- **Caixa vs RF manual**: distinguidos por ticker (CAIXA, SALDO, CASH, RESERVA)
- **Auto-sync IBKR**: se configurado, atualiza caixa da IBKR automaticamente na planilha
- **Integração patrimônio**: caixa + RF manual somados no `totalPatrimonioBRL`

---

## 1. Página de Gestão de Caixa

### Arquivo
[app/caixa/page.tsx](app/caixa/page.tsx)

### Componente: `CaixaManager`
Interface para adicionar, editar, remover e salvar posições de caixa.

**Input:**
- Carrega posições de caixa via `GET /api/renda-fixa/caixa`
- Recebe taxas de câmbio de `GET /api/composicao/resumo` (fx atual)

**Output:**
- Usuário pode adicionar/editar/remover linhas de caixa
- Click "Salvar" → `POST /api/renda-fixa/caixa` com array `positions`
- Após salvar: `bumpDataVersion()` + reload da página

**Fatos importantes:**
- Reconhece tickers como caixa: CAIXA, SALDO, CASH, RESERVA
- Suporta múltiplas moedas: BRL, USD, EUR, GBP, CAD, JPY, CHF
- Ao salvar, APENAS linhas de caixa são alteradas — RF não é tocada
- Mostra aviso se sincronizado com IBKR: *"Saldos conferidos com a IBKR Flex"*

---

## 2. API Route: Caixa (GET + POST)

### Arquivo
[app/api/renda-fixa/caixa/handler.ts](app/api/renda-fixa/caixa/handler.ts)

Mapeada via `app/api/[...path]/route.ts` (linha 61):
```typescript
case "renda-fixa/caixa": return import("@/app/api/renda-fixa/caixa/handler");
```

### GET `/api/renda-fixa/caixa`

**Fluxo:**
1. Lê aba `fixa_aberta` completa via `store.fetchTab()`
2. Filtra apenas **tickers de caixa** usando `isCashTicker()`:
   - Busca colunas: `ticker`, `ativo`, `atual`, `valor_atual`, `saldo`, `valor atual`
   - Moeda padrão: BRL
3. **Agrega múltiplas linhas da mesma moeda** (se houver CAIXA BRL + CAIXA BRL, soma)
4. **Auto-sync IBKR** (se `IBKR_FLEX_TOKEN` + `IBKR_FLEX_QUERY_ID` configurados):
   - Chama `getFlexXmlCached()` → `parseFlexXml()` → extrai `cashBalances` e `marginBalances`
   - Agrega saldos por moeda
   - **Se houver diferença > R$ 0.02**: marca `updated = true`
   - Se atualizado: sobrescreve valores locais de caixa e salva na planilha automaticamente
5. Retorna:
   ```typescript
   {
     caixa: [{ ticker, atual, moeda }, ...],  // posições de caixa
     margin: [{ moeda, saldo, jurosAcruados, initMargin, maintMargin }, ...],
     ibkrSynced: boolean
   }
   ```

**Auto-save IBKR:**
- Se `updated = true`: chama `sheets.spreadsheets.values.clear()` + `update()`
- Preserva linhas de RF (não-caixa)
- Reconstrói tabela inteira com header + RF rows + cash rows

### POST `/api/renda-fixa/caixa`

**Body:**
```typescript
{ positions: [{ ticker, atual, moeda }, ...] }
```

**Fluxo:**
1. Valida: campo `positions` é obrigatório (array)
2. Lê aba `fixa_aberta` completa
3. Extrai indices de colunas: `ticker`, `atual`, `moeda`
4. Filtra e mantém **apenas linhas de RF** (não-caixa)
5. Constrói **novas linhas de caixa** do input
6. Limpa a aba e reescreve: `[header, ...nonCashRows, ...cashRows]`
7. Retorna: `{ ok: true, saved: N }`

**Segurança:**
- Usa `isCashTicker()` para identificar cash
- Filtra por `p.atual > 0` (não salva posições vazias)
- Service account auth obrigatória (escrita)

---

## 3. Motor de Renda Fixa (Canônico)

### Arquivo
[lib/renda-fixa.ts](lib/renda-fixa.ts)

**Função Principal:** `calcularRendaFixaPosicoes(rfTransacoes, fixaAberta, proventosRows, fx)`

### Lógica de Separação Caixa vs RF

```typescript
export function isCashTicker(ticker: string, tipo?: string): boolean {
  const CASH_TERMS = ["CAIXA", "SALDO", "CASH", "RESERVA", "LIQUIDEZ"];
  const t = ticker.toUpperCase();
  const tp = (tipo ?? "").toUpperCase();
  return CASH_TERMS.some(term => t.includes(term) || tp.includes(term));
}
```

### Algoritmo Completo

**1. Parse `fixa_aberta`:**
   - Para cada row:
     - Extrai `ticker` (colunas: ticker / ativo / papel)
     - Extrai `atual` (colunas: atual / valor_atual / saldo / valor atual)
     - Extrai `moeda` (padrão: BRL)
   - Cria array `openEntries` com todos os ativos abertos

**2. Parse `renda_fixa` (transações):**
   - Agrupa por ticker
   - Soma por tipo: compra, venda, imposto
   - Cria `txByTicker` com totais (compra, venda, imposto, transações)

**3. Parse `meus_proventos`:**
   - Filtra apenas proventos para tickers em RF ou caixa
   - Separa `proventosPorTicker` (líquido) e `impostoPorTicker` (IR retido)

**4. Build Posições Abertas:**
   ```typescript
   for (const { ticker, atual, moeda, tipo } of openEntries) {
     const isCaixa = isCashTicker(ticker, tipo);
     if (isCaixa) {
       // → caixaPositions[] com resultado = proventos (geralmente 0)
       // Campos: investido=0, lucro=0, rentabilidade=0
       totalCaixa += atualBRL;
     } else {
       // → abertas[] com lucro e retorno
       // lucro = investido > 0 ? atual - investido : 0
     }
   }
   ```

**5. Build Posições Encerradas:**
   - Tickers em `renda_fixa` com venda > 0 e NÃO em `fixa_aberta`
   - Calcula lucro realizado

**6. Totais:**
   ```typescript
   totalAtual = sum(abertas.atualBRL)
   totalCaixa = sum(caixa.atualBRL)  // SEPARADO
   totalInvestidoAberto = sum(abertas.investidoBRL)
   lucroNaoRealizado = sum(abertas.lucroBRL)
   lucroRealizado = sum(encerradas.lucroBRL)
   rentMedia = (lucroNaoRealizado + proventos) / investido * 100
   patrimonio = totalAtual + totalCaixa  // ← INCLUI CAIXA
   ```

### Output: `RendaFixaResult`
```typescript
{
  abertas: RFOpenPosition[],        // RF manual (sem caixa)
  caixa: RFOpenPosition[],          // CAIXA separado
  encerradas: RFClosedPosition[],
  transacoes: RFTransaction[],
  totalAtual: number,               // RF apenas
  totalCaixa: number,               // CAIXA apenas
  totalInvestidoAberto: number,
  lucroNaoRealizado: number,
  lucroRealizado: number,
  totalProventosRF: number,
  totalProventosBrutoRF: number,
  totalImpostoRF: number,
  rentMedia: number,
  patrimonio: number                // totalAtual + totalCaixa
}
```

---

## 4. API Route: Posições RF

### Arquivo
[app/api/renda-fixa/posicoes/route.ts](app/api/renda-fixa/posicoes/route.ts)

**GET `/api/renda-fixa/posicoes`**

**Fluxo:**
1. Fetch paralelo:
   - `store.fetchTab("renda_fixa")`
   - `store.fetchTab("fixa_aberta")`
   - `store.fetchTab("meus_proventos")`
   - `fetchFxRates()`
2. Chama `calcularRendaFixaPosicoes(rfTransacoes, fixaAberta, proventosRows, fx)`
3. Retorna resultado completo (JSON)

**Consumidores:**
- Página `/app/renda-fixa/page.tsx`
- Página `/app/resumo/page.tsx` (mostra separadamente caixa e RF)
- Agente IA (`lib/agent-context.ts`)

---

## 5. Integração no Portfolio Canônico

### Arquivo
[lib/portfolio.ts](lib/portfolio.ts)

**Função 1: `calcularRendaFixaBRL(fixaAberta, fx)`**

Soma TODOS os valores de `fixa_aberta` (RF + caixa) em BRL:
```typescript
export function calcularRendaFixaBRL(fixaAberta: Row[], fx: FxRates): number {
  let totalBRL = 0;
  for (const row of fixaAberta) {
    const valor = toNumber(getVal(row, "atual", ...)) ?? 0;
    if (valor <= 0) continue;
    const moeda = getMoeda(row);
    totalBRL += valor * fxToBRL(moeda, fx);
  }
  return totalBRL;
}
```

**Função 2: `calcularSnapshot(..., fixaAberta, ...)`**

Incorpora RF manual no snapshot de patrimônio:

1. Calcula `rfFixaAberta = calcularRendaFixaBRL(fixaAberta, fx)`
2. Soma RF de posições (CDB/Tesouro em tickets do portfolio)
3. Total RF: `rfPatrimonioBRL = rfFixaAberta + rfDePosicoes`
4. **Patrimônio total**: `totalPatrimonioBRL = rvPatrimonioBRL + rfPatrimonioBRL`
5. **Exposição cambial** — inclui caixa FX:
   ```typescript
   for (const row of fixaAberta) {
     const valor = toNumber(...) ?? 0;
     const moeda = getMoeda(row);
     const valorBRL = valor * fxToBRL(moeda, fxAtual);
     exposicaoCambial[moeda] = (exposicaoCambial[moeda] ?? 0) + valorBRL;
   }
   ```

**Output:**
```typescript
PortfolioSnapshot {
  rfPatrimonioBRL: number,        // RF + caixa (tudo em BRL)
  totalPatrimonioBRL: number,     // RV + RF + caixa
  exposicaoCambial: Record<string, number>,  // inclui caixa USD, EUR, etc.
  ...
}
```

---

## 6. Resumo da Página

### Arquivo
[app/api/composicao/resumo/route.ts](app/api/composicao/resumo/route.ts)

Combina dados do portfolio + RF manual:

1. Fetch: `calcularSnapshot()` + `store.fetchTab("fixa_aberta")`
2. Usa `fixaAberta` para:
   - Custódia Brasil vs Exterior (inclui RF/caixa BRL vs moedas estrangeiras)
   - Exposição cambial por moeda (caixa USD incluso)
3. Retorna resultado com breakdown de RF e caixa

---

## 7. Fluxo Completo de Dados

```
┌─────────────────────────────────────────────────────────┐
│ Planilha Google Sheets — Aba: fixa_aberta              │
│ (source of truth)                                        │
├─────────────────────────────────────────────────────────┤
│ ticker    | atual  | moeda | tipo                       │
│ ─────────────────────────────────────────────────        │
│ CAIXA     | 50000  | BRL   | (caixa)                    │
│ CAIXA     | 10000  | USD   | (caixa)                    │
│ CDB Banco | 100000 | BRL   | (RF)                       │
│ Tesouro   | 50000  | BRL   | (RF)                       │
└─────────────────────────────────────────────────────────┘
                         ↓
            ┌────────────────────────────┐
            │ GET /api/renda-fixa/caixa  │
            └────────────────────────────┘
                         ↓
        (handler.ts GET — filtra CAIXA)
                         ↓
    ┌─────────────────────────────────────┐
    │ {                                    │
    │   caixa: [                           │
    │     {ticker: "CAIXA", atual: 50000,  │
    │      moeda: "BRL"},                  │
    │     {ticker: "CAIXA", atual: 10000,  │
    │      moeda: "USD"}                   │
    │   ],                                 │
    │   ibkrSynced: false                  │
    │ }                                    │
    └─────────────────────────────────────┘
            ↓
            app/caixa/page.tsx
            (CaixaManager renderiza UI)
            ↓
      (usuário edita caixa)
            ↓
        POST /api/renda-fixa/caixa
            ↓
      (handler.ts POST — atualiza
       planilha, preserva RF)
            ↓
      bumpDataVersion() + reload
            
            PARALELO (dados para páginas)
            ↓
   ┌────────────────────────────────────┐
   │ GET /api/renda-fixa/posicoes       │
   └────────────────────────────────────┘
            ↓
  (route.ts — chama calcularRendaFixaPosicoes)
            ↓
   ┌─────────────────────────────────────────┐
   │ RendaFixaResult {                        │
   │   caixa: [                               │
   │     {ticker:"CAIXA", moeda:"BRL",        │
   │      atual:50000, atualBRL:50000,        │
   │      investido:0, lucro:0, ...},         │
   │     {ticker:"CAIXA", moeda:"USD",        │
   │      atual:10000, atualBRL:65000 (fx),   │
   │      investido:0, lucro:0, ...}          │
   │   ],                                     │
   │   abertas: [...RF positions],            │
   │   totalCaixa: 115000 (BRL),              │
   │   patrimonio: totalAtual + totalCaixa    │
   │ }                                        │
   └─────────────────────────────────────────┘
            ↓
    app/renda-fixa/page.tsx exibe
    caixa separado de RF (2 abas)
            ↓
        ┌──────────────────────────┐
        │ GET /api/composicao/resumo│
        └──────────────────────────┘
            ↓
      (route.ts — chama calcularSnapshot)
            ↓
     ┌───────────────────────────────────────┐
     │ PortfolioSnapshot {                    │
     │   rfPatrimonioBRL: 150000 (RF+caixa), │
     │   totalPatrimonioBRL: totalRV + 150k, │
     │   exposicaoCambial: {                 │
     │     BRL: 100000,                      │
     │     USD: 65000,                       │
     │   }                                   │
     │ }                                     │
     └───────────────────────────────────────┘
            ↓
   app/resumo/page.tsx (Resumo geral)
   app/portfolio/page.tsx (Patrimônio)
```

---

## 8. Auto-Sync IBKR

### Fluxo
1. **GET `/api/renda-fixa/caixa`** é chamado pela página
2. Se `IBKR_FLEX_TOKEN` + `IBKR_FLEX_QUERY_ID` estão em `.env`:
   - Chama `getFlexXmlCached(token, queryId)`
   - Extrai `cashBalances` e `marginBalances`
   - Compara com valores em `fixa_aberta`
   - Se diferença > 0.02: **salva automaticamente**
3. Frontend recebe `ibkrSynced: true` no response
4. Usuário vê mensagem: *"Saldos conferidos com a IBKR Flex"*

### Configuração Necessária
```
IBKR_FLEX_TOKEN=...
IBKR_FLEX_QUERY_ID=...
```

---

## 9. Resumo das Funções-Chave

| Função | Arquivo | Entrada | Saída |
|--------|---------|---------|-------|
| `isCashTicker()` | `lib/renda-fixa.ts` | ticker, tipo | boolean |
| `calcularRendaFixaPosicoes()` | `lib/renda-fixa.ts` | rfTx, fixaAberta, prov, fx | RendaFixaResult (caixa + abertas + encerradas) |
| `calcularRendaFixaBRL()` | `lib/portfolio.ts` | fixaAberta, fx | number (total em BRL) |
| `calcularSnapshot()` | `lib/portfolio.ts` | transacoes, prov, fixaAberta, quotes, fx | PortfolioSnapshot (inclui rfPatrimonioBRL) |
| GET `/api/renda-fixa/caixa` | `handler.ts` | — | { caixa, margin, ibkrSynced } |
| POST `/api/renda-fixa/caixa` | `handler.ts` | { positions } | { ok, saved } |
| GET `/api/renda-fixa/posicoes` | `route.ts` | — | RendaFixaResult |

---

## 10. Coluna `tipo` da `fixa_aberta`

Opcional, mas útil para IBKR sync ou identificação:
- Valores sugeridos: "RF", "Caixa", "Tesouro", "CDB", "Margem"
- O motor não obriga presença
- Se presente, `isCashTicker(ticker, tipo)` verifica ambos

---

## 11. Diagrama de Classes

```
┌──────────────────┐
│ RendaFixaResult  │
├──────────────────┤
│ caixa[]          │ ← Posições de caixa separadas
│ abertas[]        │ ← Posições de RF
│ encerradas[]     │
│ totalCaixa       │ ← SEPARADO de totalAtual
│ totalAtual       │
│ patrimonio       │ ← totalAtual + totalCaixa
└──────────────────┘

┌──────────────────┐
│ PortfolioSnapshot│
├──────────────────┤
│ rfPatrimonioBRL  │ ← INCLUI caixa + RF manual
│ totalPatrimonio  │
│ exposicaoCambial │ ← INCLUI caixa FX
└──────────────────┘
```

---

## Checklist: Caixa + Liquidez

- ✅ **Leitura**: `fixa_aberta` (aba única)
- ✅ **Separação**: `isCashTicker()` distingue CAIXA de RF
- ✅ **Cálculo**: `calcularRendaFixaPosicoes()` (lib, fonte única)
- ✅ **Integração**: `calcularSnapshot()` inclui caixa no patrimônio
- ✅ **UI Gestão**: `app/caixa/page.tsx` (CRUD)
- ✅ **API Gestão**: `handler.ts` GET + POST
- ✅ **Auto-sync IBKR**: GET com atualização automática se diferença
- ✅ **Moeda**: suporta múltiplas (BRL, USD, EUR, GBP, CAD, JPY, CHF)
- ✅ **Exposição cambial**: `calcularSnapshot()` inclui caixa FX no breakdown


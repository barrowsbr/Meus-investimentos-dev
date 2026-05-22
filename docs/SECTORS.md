# Classificacao de Setores

> Modulo: `lib/sectors.ts`
> Funcao principal: `identificarSetor(ticker)`

---

## 1. Visao Geral

Cada ativo e classificado em um setor com base no seu ticker. O setor determina:

- Se o ativo e **Renda Variavel** ou **Renda Fixa**
- A **moeda efetiva** do ativo
- O **sufixo Yahoo Finance** para buscar cotacoes
- Em qual bloco de **patrimonio** o ativo entra (RV ou RF)

---

## 2. Setores Disponiveis

| Setor | Tipo | Moeda Padrao | Exemplos |
|-------|------|-------------|----------|
| Acoes Brasil | RV | BRL | PETR4, VALE3, ITUB4 |
| FIIs | RV | BRL | HGLG11, XPML11, MXRF11 |
| ETF | RV | BRL | IVVB11, BOVA11, HASH11 |
| ETF USA | RV | USD (forcado) | SPY, QQQ, VOO, VWRA |
| Acoes Internacional | RV | planilha | AAPL, MSFT, TSLA |
| Commodities | RV | USD | IAU, SIVR, GLD |
| Renda Fixa USD | **RF** | USD | SHV, BIL |
| Renda Fixa | **RF** | BRL | Tesouro, CDB, LCI |
| Cripto | RV | USD | BTC, ETH, SOL |
| BDRs | RV | BRL | MSFT34, AAPL34 |

---

## 3. Ordem de Avaliacao

A funcao `identificarSetor()` avalia regras na seguinte ordem de prioridade:

### 3.1 Cripto (prioridade maxima)

```typescript
const CRIPTO = new Set([
  "BTC", "ETH", "SOL", "USDT", "USDC", "HBAR", "ADA",
  "BTC-USD", "ETH-USD",
]);
```

Alem da lista fixa, qualquer ticker que comece com `BTC` ou `ETH` e tenha menos de 8 caracteres e classificado como Cripto.

### 3.2 ETF Brasil

```typescript
const ETFS_BR = new Set([
  "IVVB11", "BOVA11", "SMAL11", "HASH11", "XINA11",
  "EURP11", "GOLD11", "B5P211",
]);
```

### 3.3 Commodities

```typescript
const COMMODITIES = new Set(["IAU", "SIVR", "SLV", "GLD", "DBC", "USO"]);
```

### 3.4 Renda Fixa USD

```typescript
const RENDA_FIXA_USD = new Set(["SHV", "BIL"]);
```

Estes sao ETFs de renda fixa americana. Embora negociados como acoes, sao classificados como **Renda Fixa** e entram no patrimonio RF.

### 3.5 ETF USA

```typescript
const ETFS_USA = new Set(["SPY", "QQQ", "VWRA", "VOO", "VNQ", "SCHD", "VT"]);
```

Todos os ativos neste conjunto tem moeda **forcada para USD** via `getMoedaEfetiva()`.

### 3.6 Renda Fixa (por termo)

```typescript
const RF_TERMS = [
  "TESOURO", "NTN", "LCI", "LCA", "CDB", "LC",
  "DEBENTURE", "CASH", "CAIXA"
];
```

Se o ticker contiver qualquer um desses termos, e classificado como Renda Fixa.

### 3.7 Classificacao por Sufixo Numerico

Para tickers que terminam em digitos:

| Padrao | Setor |
|--------|-------|
| Termina em `3`, `4`, `5`, `6` | Acoes Brasil |
| Termina em `11` (e nao e UNIT) | FIIs |
| Termina em `11` (e e UNIT) | Acoes Brasil |
| Termina em `32`, `33`, `34` | BDRs |

### 3.8 Acoes UNIT (excecoes para 11)

Tickers que terminam em `11` mas sao **acoes unit** (nao FIIs):

```typescript
const UNITS_ACOES = new Set([
  "KLBN11", "SAPR11", "TAEE11", "ALUP11", "SANB11", "BPAC11",
  "ITUB11", "BBAS11", "EGIE11", "ENGI11", "TIET11", "CPFE11",
]);
```

Estes sao classificados como **Acoes Brasil** em vez de FIIs.

### 3.9 Default: Acoes Internacional

Qualquer ticker nao classificado pelas regras acima e considerado **Acoes Internacional**.

---

## 4. Predicados de Tipo

```typescript
const RF_SETORES = new Set(["Renda Fixa USD", "Renda Fixa"]);

// Retorna true se o setor e renda fixa
export function isRendaFixa(setor: string): boolean {
  return RF_SETORES.has(setor);
}

// Retorna true se o setor e renda variavel
export function isRendaVariavel(setor: string): boolean {
  return !RF_SETORES.has(setor);
}
```

Setores de **Renda Fixa**: `Renda Fixa`, `Renda Fixa USD`
Todos os demais sao **Renda Variavel** (incluindo Cripto, Commodities, etc.).

---

## 5. Normalizacao de Ticker

Antes de avaliar as regras, o ticker e normalizado:

```typescript
const t = ticker.toUpperCase().trim();
const tClean = t.replace(".SA", "").replace(".L", "");
```

Os sufixos `.SA` (B3) e `.L` (London) sao removidos para a classificacao.

---

## 6. Impacto no Sistema

A classificacao de setor afeta:

1. **Patrimonio** -- posicoes RF entram em `rfPatrimonioBRL`, posicoes RV entram em `rvPatrimonioBRL`
2. **Moeda** -- ETF USA e VWRA.L tem moeda forcada para USD
3. **Yahoo Finance** -- tickers brasileiros recebem sufixo `.SA`
4. **Lucro** -- calculo de lucro/prejuizo usa apenas posicoes RV
5. **Filtro** -- posicoes RV com valor < R$ 1 sao excluidas do patrimonio

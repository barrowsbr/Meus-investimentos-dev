# Regras de Moeda e Conversao Cambial

> Modulo principal: `lib/cotacoes.ts`
> Funcoes de moeda: `lib/sectors.ts` (`getMoedaEfetiva`)
> Formatacao: `lib/format.ts`

---

## 1. Moedas Suportadas

| Moeda | Par FX | Fonte Primaria | Fonte Fallback |
|-------|--------|---------------|----------------|
| BRL | -- | -- | -- |
| USD | USDBRL | Yahoo Finance (`BRL=X`) | AwesomeAPI (`USD-BRL`) |
| EUR | EURBRL | Yahoo Finance (`EURBRL=X`) | AwesomeAPI (`EUR-BRL`) |
| GBP | GBPBRL | Yahoo Finance (`GBPBRL=X`) | AwesomeAPI (`GBP-BRL`) |
| CAD | CADBRL | Yahoo Finance (`CADBRL=X`) | AwesomeAPI (`CAD-BRL`) |

---

## 2. Obtencao de Taxas de Cambio

### Fontes (em ordem de prioridade)

1. **Yahoo Finance** (primaria) -- via `yahoo-finance2` npm
2. **AwesomeAPI** (fallback) -- `https://economia.awesomeapi.com.br/last`
3. **Defaults hardcoded** (ultimo recurso)

### Implementacao

```typescript
// lib/cotacoes.ts

// Defaults de seguranca (caso ambas APIs falhem)
const DEFAULTS_FX: FxRates = {
  USDBRL: 5.7,
  EURBRL: 6.4,
  GBPBRL: 7.6,
  CADBRL: 4.1,
};

// Cascata de fallback
export async function fetchFxRates(): Promise<FxRates> {
  try {
    return await fetchFxYahoo();     // 1. Yahoo Finance
  } catch {
    try {
      return await fetchFxAwesome(); // 2. AwesomeAPI
    } catch {
      return DEFAULTS_FX;           // 3. Defaults hardcoded
    }
  }
}
```

### Yahoo Finance -- Tickers FX

```typescript
const fxTickers = ["BRL=X", "EURBRL=X", "CADBRL=X", "GBPBRL=X"];
```

- `BRL=X` retorna o preco de 1 USD em BRL
- Os demais seguem o padrao `{MOEDA}BRL=X`

### AwesomeAPI -- Endpoint

```
GET https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,GBP-BRL,CAD-BRL
```

Retorna JSON com campo `bid` para cada par. O `bid` e usado como taxa de conversao.

---

## 3. Interface FxRates

```typescript
export interface FxRates {
  USDBRL: number;    // 1 USD = X BRL
  EURBRL: number;    // 1 EUR = X BRL
  GBPBRL: number;    // 1 GBP = X BRL
  CADBRL: number;    // 1 CAD = X BRL
  [key: string]: number;  // extensivel para outras moedas
}
```

---

## 4. Funcao de Conversao: fxToBRL

```typescript
export function fxToBRL(currency: string, fx: FxRates): number {
  const cur = (currency || "BRL").toUpperCase();
  if (cur === "BRL") return 1;
  if (cur === "USD") return fx.USDBRL;
  if (cur === "EUR") return fx.EURBRL;
  if (cur === "GBP") return fx.GBPBRL;
  if (cur === "CAD") return fx.CADBRL;
  const key = `${cur}BRL`;
  return fx[key] ?? 1;  // fallback: 1:1
}
```

**Comportamento:**
- `BRL` -> retorna `1` (sem conversao)
- `USD` -> retorna `fx.USDBRL` (ex: 5.7)
- Moeda desconhecida -> tenta `fx["{MOEDA}BRL"]`, senao retorna `1`

---

## 5. Determinacao da Moeda Efetiva

A moeda de cada ativo e determinada por `getMoedaEfetiva()`:

```typescript
// lib/sectors.ts
export function getMoedaEfetiva(
  ticker: string,
  moedaPlanilha: string,
  setor: string
): string {
  if (setor === "ETF USA") return "USD";       // override por setor
  const tClean = ticker.toUpperCase()
    .replace(".SA", "").replace(".L", "");
  if (tClean === "VWRA") return "USD";          // override por ticker
  return moedaPlanilha || "BRL";               // planilha ou default
}
```

### Hierarquia de decisao

```
1. Setor "ETF USA"?      -> USD (sempre)
2. Ticker e "VWRA"?      -> USD (sempre)
3. Planilha tem moeda?    -> usa moeda da planilha
4. Nenhuma?               -> BRL (default)
```

---

## 6. Conversao no Calculo de Posicoes

### Custo Total em BRL

```typescript
const fator = fxToBRL(moeda, fx);          // moeda efetiva do ativo
const custoTotalBRL = custoTotal * fator;
```

### Valor Atual em BRL

```typescript
// Se ha cotacao disponivel:
const fatorQuote = quoteCurrency ? fxToBRL(quoteCurrency, fx) : fator;
valorAtualBRL = valorAtual * fatorQuote;

// Se nao ha cotacao:
valorAtualBRL = custoTotal * fator;  // assume custo como valor
```

O `fatorQuote` usa a moeda da cotacao Yahoo Finance (campo `currency` da resposta), que pode diferir da moeda efetiva do ativo. Isso garante precisao quando a cotacao vem em moeda diferente da esperada.

### Variacao Diaria em BRL

```typescript
dayChange = quote.change * qtdTotal;        // moeda original
dayChangeBRL = dayChange * fatorQuote;      // convertido para BRL
```

---

## 7. Conversao de Proventos

Proventos sao convertidos individualmente:

```typescript
const moeda = getMoeda(row);               // "BRL" ou "USD"
const valorBRL = valor * fxToBRL(moeda, fx);
```

---

## 8. Conversao de Renda Fixa (fixa_aberta)

Saldos de renda fixa sao convertidos linha a linha:

```typescript
const moeda = getMoeda(row);
totalBRL += valor * fxToBRL(moeda, fx);
```

---

## 9. Taxas no Snapshot

O snapshot final expoe as taxas para uso no frontend:

```typescript
return {
  // ...
  usdbrl: fx.USDBRL,
  eurbrl: fx.EURBRL,
  cadbrl: fx.CADBRL,
};
```

---

## 10. Formatacao de Moeda

```typescript
// lib/format.ts

// Formato brasileiro: R$ 1.234,56
export function brl(value: unknown): string {
  return n.toLocaleString("pt-BR", {
    style: "currency", currency: "BRL",
    minimumFractionDigits: 2,
  });
}

// Formato americano: $1,234.56
export function usd(value: unknown): string {
  return n.toLocaleString("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 2,
  });
}

// Despacho automatico por moeda
export function currency(value: unknown, moeda: string = "BRL"): string {
  return moeda === "USD" ? usd(value) : brl(value);
}
```

---

## 11. Tickers Yahoo Finance para Cotacoes

A funcao `yahooTicker()` converte o ticker interno para o formato Yahoo Finance:

```typescript
export function yahooTicker(ticker: string, moeda: string, corretora: string): string
```

### Regras de conversao

| Ticker Interno | Ticker Yahoo | Regra |
|---|---|---|
| PETR4 | PETR4.SA | Acao BR -> sufixo .SA |
| IVVB11 | IVVB11.SA | ETF BR -> sufixo .SA |
| SPY | SPY | ETF USA -> sem sufixo |
| VWRA | VWRA.L | Mapa de sufixos internacionais |
| VWCE | VWCE.DE | Mapa de sufixos internacionais |
| BTC | BTC-USD | Cripto -> sufixo -USD |
| ETH | ETH-USD | Cripto -> sufixo -USD |
| AAPL | AAPL | Acao internacional -> sem sufixo |

### Mapa de sufixos internacionais

```typescript
const INTL_SUFFIX_MAP: Record<string, string> = {
  VWRA: "VWRA.L",     // London
  VWCE: "VWCE.DE",    // Xetra
  DPM:  "DPM.TO",     // Toronto
  CSPX: "CSPX.L",     // London
  EIMI: "EIMI.L",     // London
  IWDA: "IWDA.L",     // London
};
```

---

## 12. Paralelismo na Obtencao de Dados

Cotacoes de ativos e taxas de cambio sao buscadas em paralelo:

```typescript
const [yahooQuotes, fx] = await Promise.all([
  fetchQuotes(uniqueYahoo),
  fetchFxRates(),
]);
```

Isso minimiza a latencia total do endpoint `/api/cotacoes`.

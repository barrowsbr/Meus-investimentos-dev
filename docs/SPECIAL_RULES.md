# Regras Especiais

> Excecoes e overrides que afetam classificacao, moeda e comportamento de ativos especificos.

---

## 1. SHV e BIL -- Renda Fixa USD

### Regra

Os ETFs **SHV** (iShares Short Treasury Bond) e **BIL** (SPDR Bloomberg 1-3 Month T-Bill) sao classificados como **"Renda Fixa USD"**, nao como Renda Variavel.

### Impacto

- Entram no calculo de `rfPatrimonioBRL` (patrimonio de renda fixa)
- **Nao** entram em `rvPatrimonioBRL` (patrimonio de renda variavel)
- **Nao** sao considerados no calculo de lucro/prejuizo de RV
- Moeda: USD

### Implementacao

```typescript
// lib/sectors.ts
const RENDA_FIXA_USD = new Set(["SHV", "BIL"]);

// Na funcao identificarSetor():
if (RENDA_FIXA_USD.has(tClean)) return "Renda Fixa USD";
```

```typescript
// lib/portfolio.ts -- No snapshot:
const rfDePosicoes = positions
  .filter((p) => isRendaFixa(p.setor))  // inclui "Renda Fixa USD"
  .reduce((sum, p) => sum + p.valorAtualBRL, 0);

const rfPatrimonioBRL = rfFixaAberta + rfDePosicoes;
```

### Justificativa

SHV e BIL sao ETFs de titulos do tesouro americano de curtissimo prazo. Apesar de serem tecnicamente acoes negociadas em bolsa, seu comportamento e de renda fixa (volatilidade minima, retorno previsivel). Classificar como RF reflete melhor a exposicao real da carteira.

---

## 2. VWRA.L -- Moeda Forcada para USD

### Regra

O ETF **VWRA** (Vanguard FTSE All-World), negociado na London Stock Exchange com sufixo `.L`, tem moeda **forcada para USD** independente do que consta na planilha.

### Impacto

- A moeda efetiva e sempre USD, mesmo que a planilha diga BRL ou GBP
- O custo e valor sao convertidos usando o fator USDBRL
- A cotacao Yahoo Finance usa o ticker `VWRA.L`

### Implementacao

```typescript
// lib/sectors.ts
export function getMoedaEfetiva(ticker: string, moedaPlanilha: string, setor: string): string {
  if (setor === "ETF USA") return "USD";  // todos ETF USA
  const tClean = ticker.toUpperCase().replace(".SA", "").replace(".L", "");
  if (tClean === "VWRA") return "USD";    // override especifico
  return moedaPlanilha || "BRL";
}
```

### Justificativa

VWRA e cotado em USD na LSE. Embora negociado em Londres, o ativo e denominado em dolares americanos. O override garante que a conversao cambial use USDBRL e nao GBPBRL.

---

## 3. ETF USA -- Moeda Sempre USD

### Regra

Todos os ativos classificados como **"ETF USA"** tem moeda forcada para USD.

### Lista de ETFs USA

```typescript
const ETFS_USA = new Set(["SPY", "QQQ", "VWRA", "VOO", "VNQ", "SCHD", "VT"]);
```

### Impacto

- `getMoedaEfetiva()` retorna `"USD"` para qualquer ativo com setor "ETF USA"
- Custos e valores sao convertidos usando USDBRL
- Na Yahoo Finance, estes tickers sao buscados sem sufixo (ex: `SPY`, nao `SPY.SA`)

---

## 4. Cripto -- Exclusao da Exposicao Cambial

### Regra

Criptomoedas sao classificadas como **"Cripto"** e, apesar de serem denominadas em USD, sao tratadas separadamente da exposicao cambial tradicional.

### Lista de Criptomoedas

```typescript
const CRIPTO = new Set([
  "BTC", "ETH", "SOL", "USDT", "USDC", "HBAR", "ADA",
  "BTC-USD", "ETH-USD",
]);
```

Alem da lista, tickers curtos (< 8 caracteres) que comecem com `BTC` ou `ETH` tambem sao classificados como Cripto.

### Impacto

- Classificadas como Renda Variavel (entram em `rvPatrimonioBRL`)
- Nao sao consideradas na exposicao a moedas estrangeiras tradicionais (USD, EUR, etc.)
- Na Yahoo Finance: `BTC` -> `BTC-USD`, `ETH` -> `ETH-USD`

---

## 5. Tickers Brasileiros -- Sufixo .SA

### Regra

Tickers classificados como **Acoes Brasil**, **ETF** (BR), **FIIs** ou **BDRs** recebem automaticamente o sufixo `.SA` para consulta no Yahoo Finance.

### Implementacao

```typescript
// lib/cotacoes.ts
export function yahooTicker(ticker: string, moeda: string, corretora: string): string {
  const t = ticker.toUpperCase().trim();
  if (t.includes(".")) return t;  // ja tem sufixo

  // ... tratamento de cripto e mapa internacional ...

  const setor = identificarSetor(t);
  if (["Acoes Brasil", "ETF", "FIIs", "BDRs"].includes(setor)) {
    return `${t}.SA`;
  }

  return t;
}
```

### Exemplos

| Ticker Interno | Ticker Yahoo |
|---|---|
| PETR4 | PETR4.SA |
| IVVB11 | IVVB11.SA |
| HGLG11 | HGLG11.SA |
| MSFT34 | MSFT34.SA |
| SPY | SPY |
| VWRA | VWRA.L |

---

## 6. Mapeamento de Tickers Internacionais

### Regra

Alguns tickers internacionais precisam de sufixo especifico para a bolsa correta no Yahoo Finance.

### Mapa de Sufixos

```typescript
// lib/cotacoes.ts
const INTL_SUFFIX_MAP: Record<string, string> = {
  VWRA: "VWRA.L",     // London Stock Exchange
  VWCE: "VWCE.DE",    // Deutsche Borse (Xetra)
  DPM:  "DPM.TO",     // Toronto Stock Exchange
  CSPX: "CSPX.L",     // London Stock Exchange
  EIMI: "EIMI.L",     // London Stock Exchange
  IWDA: "IWDA.L",     // London Stock Exchange
};
```

Este mapa tem prioridade sobre a classificacao de setor na resolucao do ticker Yahoo.

---

## 7. Units de Acoes (Tickers 11 que nao sao FIIs)

### Regra

Tickers brasileiros terminados em `11` sao normalmente classificados como FIIs. Porem, alguns sao **units de acoes** e devem ser classificados como **Acoes Brasil**.

### Lista de Units

```typescript
const UNITS_ACOES = new Set([
  "KLBN11", "SAPR11", "TAEE11", "ALUP11", "SANB11", "BPAC11",
  "ITUB11", "BBAS11", "EGIE11", "ENGI11", "TIET11", "CPFE11",
]);
```

### Impacto

Estas units entram no setor "Acoes Brasil" em vez de "FIIs", o que afeta agrupamentos e relatorios.

---

## 8. Bonificacoes como Compra

### Regra

Transacoes com tipo `bonif` (bonificacao) sao tratadas como **Compra**.

```typescript
if (raw.includes("bonif")) return "Compra";
```

### Justificativa

Bonificacoes de acoes representam novas cotas recebidas gratuitamente (ou a preco muito baixo). No calculo FIFO, sao registradas como um lote de compra com o preco informado (geralmente o valor nominal).

---

## 9. Filtro de Posicoes Pequenas

### Regra

Posicoes de Renda Variavel com `valorAtualBRL <= R$ 1.00` sao excluidas do calculo de patrimonio RV.

```typescript
const rvPatrimonioBRL = positions
  .filter((p) => isRendaVariavel(p.setor) && p.valorAtualBRL > 1.0)
  .reduce((sum, p) => sum + p.valorAtualBRL, 0);
```

### Justificativa

Evita que residuos de vendas parciais (fracionarias ou arredondamentos) poluam o patrimonio total.

---

## 10. Resumo de Overrides de Moeda

| Ativo/Setor | Moeda na Planilha | Moeda Efetiva | Motivo |
|---|---|---|---|
| ETF USA (qualquer) | qualquer | USD | Padrao do setor |
| VWRA / VWRA.L | qualquer | USD | Override explicito |
| Tickers sem moeda | vazio | BRL | Default |
| Demais ativos | conforme planilha | conforme planilha | Sem override |

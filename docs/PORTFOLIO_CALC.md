# Algoritmo FIFO -- Calculo de Carteira

> Modulo: `lib/portfolio.ts`
> Funcao principal: `calcularCarteiraFIFO(transacoes)`

---

## 1. Conceito

O sistema utiliza o metodo **FIFO (First In, First Out)** para controlar lotes de compra e calcular custo medio, lucro realizado e posicao atual de cada ativo.

Cada **compra** cria um novo lote. Cada **venda** consome lotes na ordem cronologica (o mais antigo primeiro).

---

## 2. Estruturas de Dados

```typescript
interface Lote {
  qty: number;  // quantidade de cotas/acoes neste lote
  pm: number;   // preco medio do lote (incluindo taxas)
}

interface PosicaoInterna {
  ticker: string;
  lotes: Lote[];           // lista de lotes abertos (FIFO)
  lucroRealizado: number;  // lucro/prejuizo ja realizado em vendas
  moeda: string;           // moeda efetiva do ativo
  corretora: string;
}
```

---

## 3. Algoritmo Passo a Passo

### 3.1 Ordenacao

As transacoes sao ordenadas por data (cronologica) antes do processamento:

```typescript
const sorted = [...transacoes].sort((a, b) => getData(a) - getData(b));
```

### 3.2 Processamento de Compra

Para cada compra, um novo lote e adicionado ao final da lista:

```typescript
const custoTotal = quantidade * preco + taxas;
const pmLote = custoTotal / quantidade;
pos.lotes.push({ qty: quantidade, pm: pmLote });
```

O preco medio do lote **inclui taxas de corretagem** rateadas.

### 3.3 Processamento de Venda (FIFO)

A venda consome lotes do inicio da lista (mais antigos primeiro):

```typescript
let qtdVender = quantidade;
let lucroOp = 0;

while (qtdVender > 0.000001 && pos.lotes.length > 0) {
  const lote = pos.lotes[0];
  const qtdConsumida = Math.min(lote.qty, qtdVender);
  lucroOp += (preco - lote.pm) * qtdConsumida;
  lote.qty -= qtdConsumida;
  qtdVender -= qtdConsumida;
  if (lote.qty < 0.000001) pos.lotes.shift();
}

pos.lucroRealizado += lucroOp;
```

O lucro realizado e calculado como `(precoVenda - precoMedioLote) * qtdConsumida` para cada lote consumido.

### 3.4 Tolerancia de Ponto Flutuante

O sistema usa `0.000001` como epsilon para evitar problemas de precisao em ponto flutuante. Um lote com `qty < 0.000001` e considerado zerado e removido.

---

## 4. Exemplo Numerico Completo

### Cenario: Operacoes com SPY

**Transacao 1 -- Compra:**
- Compra 100 SPY @ $400.00 (sem taxa)
- Lote criado: `{ qty: 100, pm: 400.00 }`
- Estado: `lotes = [{ qty: 100, pm: 400 }]`

**Transacao 2 -- Compra:**
- Compra 50 SPY @ $500.00 (sem taxa)
- Lote criado: `{ qty: 50, pm: 500.00 }`
- Estado: `lotes = [{ qty: 100, pm: 400 }, { qty: 50, pm: 500 }]`

**Transacao 3 -- Venda (FIFO):**
- Venda 80 SPY @ $450.00
- Consome do lote 1 (o mais antigo): 80 unidades a PM de $400
- Lucro = 80 x ($450 - $400) = **$4,000.00**
- Lote 1 restante: `{ qty: 20, pm: 400 }`
- Estado: `lotes = [{ qty: 20, pm: 400 }, { qty: 50, pm: 500 }]`

**Posicao Final:**
- Quantidade total: 20 + 50 = **70 unidades**
- Custo total: (20 x $400) + (50 x $500) = $8,000 + $25,000 = **$33,000.00**
- Preco medio: $33,000 / 70 = **$471.43**
- Lucro realizado acumulado: **$4,000.00**

### Cenario com Taxas

**Compra 100 PETR4 @ R$ 30.00 com taxa R$ 10.00:**
- Custo total = 100 x 30 + 10 = R$ 3,010.00
- PM do lote = 3,010 / 100 = R$ 30.10
- Lote: `{ qty: 100, pm: 30.10 }`

**Venda 100 PETR4 @ R$ 35.00:**
- Lucro = 100 x (35.00 - 30.10) = R$ 490.00 (ja descontada a taxa da compra)

---

## 5. Enriquecimento com Cotacoes

Apos o calculo FIFO, a funcao `enriquecerPosicoes()` adiciona dados de mercado:

```typescript
export interface Position {
  ticker: string;
  setor: string;            // classificacao do setor
  quantidade: number;       // qtd total de lotes abertos
  moeda: string;            // moeda efetiva (BRL, USD, etc.)
  corretora: string;
  custoMedio: number;       // PM ponderado dos lotes
  custoTotal: number;       // soma de (qty * pm) de cada lote
  lucroRealizado: number;   // lucro/prejuizo realizado (moeda nativa)
  lucroRealizadoBRL: number;
  precoAtual: number | null;       // cotacao Yahoo Finance
  quoteCurrency: string | null;    // moeda da cotacao
  valorAtual: number | null;       // quantidade * precoAtual
  valorAtualBRL: number;           // valor atual convertido para BRL
  custoTotalBRL: number;           // custo total convertido para BRL
  lucroBRL: number | null;         // valorAtualBRL - custoTotalBRL
  lucroPct: number | null;         // Valorizacao % (preco + cambio, SEM proventos)
  proventosBRL: number;            // proventos liquidos (bruto - IR) do ticker
  retornoTotalBRL: number | null;  // lucroBRL + proventosBRL
  retornoTotalPct: number | null;  // Retorno Total % = retornoTotalBRL / custoTotalBRL
  ganhoAtivoBRL: number | null;    // decomposicao 2 fatores: Ativo
  ganhoCambioBRL: number | null;   // decomposicao 2 fatores: Cambio
  // Decomposicao 3 fatores (V0/V1 = capital na moeda funcional; P0/P1 = cambio custo/atual)
  ganhoAtivoPuroBRL: number | null;   // (V1-V0)*P0
  ganhoFXPrincipalBRL: number | null; // V0*(P1-P0)
  ganhoCruzadoBRL: number | null;     // (V1-V0)*(P1-P0)
  pmFxAquisicao: number | null;       // P0 efetivo (pmDolar real das remessas)
  fxAtualBRL: number | null;          // P1 (cambio atual)
  dayChange: number | null;        // variacao do dia (moeda original)
  dayChangePct: number | null;     // variacao do dia (%)
  dayChangeBRL: number | null;     // variacao do dia (BRL)
  fatorBRL: number;                // fator de conversao moeda -> BRL (spot)
  fatorCusto: number;              // fator de conversao do CUSTO (pmDolar, regra P0)
}
```

> **Regra de reuso (CANONICO.md):** estes campos sao a fonte canonica. Paginas e
> rotas devem LER os campos (`retornoTotalPct`, `ganhoAtivoPuroBRL`, ...) — nunca
> recalcular a formula localmente.

### Conversao para BRL

O fator de conversao e determinado pela moeda efetiva do ativo:

```typescript
const fator = fxToBRL(moeda, fx);       // fator para custo
const fatorQuote = fxToBRL(quoteCurrency, fx);  // fator para cotacao
```

Se nao ha cotacao disponivel (`precoAtual === null`), o `valorAtualBRL` assume o custo:

```typescript
if (precoAtual !== null) {
  valorAtualBRL = valorAtual * fatorQuote;
} else {
  valorAtualBRL = custoTotal * fator;
}
```

---

## 6. Snapshot do Portfolio

A funcao `calcularSnapshot()` consolida tudo:

```typescript
export interface PortfolioSnapshot {
  positions: Position[];
  rvPatrimonioBRL: number;       // patrimonio Renda Variavel
  rfPatrimonioBRL: number;       // patrimonio Renda Fixa
  totalPatrimonioBRL: number;    // RV + RF
  totalProventosBRL: number;     // proventos liquidos acumulados
  proventosMensais: Record<string, number>;   // "2025-01" -> valor
  proventosPorTicker: Record<string, number>;
  totalImpostoProventosBRL: number;           // IR retido na fonte (total)
  impostoProventosPorTicker: Record<string, number>;
  lucroBRL: number;              // RV: valorizacao total (preco + cambio)
  lucroPct: number;              // RV: Valorizacao % (sem proventos)
  proventosRVBRL: number;        // RV: proventos liquidos acumulados
  retornoTotalRVBRL: number;     // RV: valorizacao + proventos
  retornoTotalRVPct: number;     // RV: Retorno Total %
  ganhoAtivoTotalBRL: number;            // decomposicao 2 fatores
  ganhoCambioTotalBRL: number;
  ganhoAtivoPuroTotalBRL: number;        // decomposicao 3 fatores
  ganhoFXPrincipalTotalBRL: number;
  ganhoCruzadoTotalBRL: number;
  dayChangeTotalBRL: number;     // variacao do dia (soma das posicoes)
  dayChangeTotalPct: number;
  usdbrl: number;
  eurbrl: number;
  cadbrl: number;
  exposicaoCambial: Record<string, number>;   // buckets por moeda (soma = patrimonio total)
  setorAlocacao: Record<string, number>;
}
```

> O catalogo "qual campo usar para qual metrica" — com as identidades que devem
> sempre valer (cobertas por `lib/__tests__/portfolio.test.ts`) — esta em
> `CANONICO.md §3`.

### Regras de Composicao

```
rvPatrimonioBRL = SUM(posicoes onde isRendaVariavel(setor) E valorAtualBRL > R$ 1)
rfPatrimonioBRL = fixa_aberta_total + SUM(posicoes onde isRendaFixa(setor))
totalPatrimonioBRL = rvPatrimonioBRL + rfPatrimonioBRL
```

---

## 7. Normalizacao de Tipo de Transacao

A funcao `getTipo()` normaliza strings da planilha:

| Valor na Planilha | Tipo Normalizado |
|---|---|
| compra, buy, aporte, entrada, subscri, bonif | `Compra` |
| venda, sell, resgate, saida | `Venda` |

Valores nao reconhecidos sao ignorados (nao sao processados pelo FIFO).

---

## 8. Proventos

A funcao `calcularProventosBRL()` processa a aba `meus_proventos`:

- Cada provento e convertido para BRL usando a moeda da linha
- Totaliza por mes (`YYYY-MM`) para o grafico mensal
- Retorna `{ totalBRL, porMes }`

---

## 9. Renda Fixa (fixa_aberta)

A funcao `calcularRendaFixaBRL()` processa a aba `fixa_aberta`:

- Le o campo `atual` / `valor_atual` / `saldo` de cada linha
- Converte para BRL pela moeda da linha
- Soma tudo para obter o patrimonio RF de posicoes manuais
- **fixa_aberta e a fonte da verdade para saldos de renda fixa**

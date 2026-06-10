# Cálculos Canônicos — Doutrina do Projeto

> **Regra de ouro:** todo cálculo financeiro conhecido tem **uma única definição
> canônica**, num **único lugar**. Quando um cálculo já existe, as páginas e rotas
> **reusam** o valor canônico — nunca recalculam por conta própria. Exceções são
> permitidas só quando há um **motivo financeiro claro**, e devem ser **rotuladas e
> documentadas** aqui.

Este documento existe para acabar com o problema histórico de "mudo numa página e
quebra a simetria com outra". Leia junto com `CALCULOS.md` (fórmulas detalhadas) e
`CLAUDE.md` (regras de arquitetura).

---

## 1. O conceito de "canônico"

Um **cálculo canônico** é a definição oficial de uma métrica, com:

1. **Uma fórmula** — escrita aqui e implementada num único módulo.
2. **Uma fonte** — o campo/função de onde todo consumidor lê.
3. **Um nome** — o mesmo rótulo significa a mesma coisa em todas as telas.

Se uma métrica é canônica, **é proibido recalculá-la ad-hoc** numa página, rota ou
componente. Some os campos do snapshot; não reimplemente a conta.

### Por que isso importa
Cada reimplementação é um ponto de divergência. Duas páginas que "somam o lucro de
formas parecidas" vão, cedo ou tarde, mostrar números diferentes — e o dono perde a
confiança no sistema inteiro. Canônico = uma verdade, verificável por teste.

---

## 2. A fonte única

**`lib/portfolio.ts` → `calcularSnapshot()`** é o motor canônico de portfólio.
Ele produz o `PortfolioSnapshot`, consumido por `usePortfolio()` (`/api/cotacoes`)
e pelas rotas TS que reusam o snapshot.

- **TypeScript é o único motor** de patrimônio, investido, lucro, proventos, câmbio
  e renda fixa. O backend **Python** serve apenas o que é genuinamente dele
  (preditivo/ML, agente/IA, fluxos, histórico). Ver `CLAUDE.md`.
- Helpers canônicos vivem em `lib/`: `lib/cambio.ts` (FX/remessas),
  `lib/sectors.ts` (classificação), `lib/cotacoes.ts` (`fxToBRL`).

**RF manual é a única exceção de motor:** CDB/Tesouro/caixa vivem em `fixa_aberta` +
`renda_fixa` e o snapshot não rastreia seu custo/realizado. O motor canônico da RF
manual é **`/api/renda-fixa/posicoes`** (BRL-consistente). Quem precisa do resultado
de RF manual (não realizado, realizado, investido, proventos) lê desse endpoint — é
o mesmo que a página `/renda-fixa` usa, então Resumo e Renda Fixa batem entre si.
A RF "de bolsa" (SHV/BIL, setor Renda Fixa) está nas `positions` do snapshot.

---

## 3. Catálogo de cálculos canônicos

Sempre que precisar destes números, **leia o campo da coluna "Fonte canônica"**.
Não reimplemente.

| Métrica | Definição canônica | Fonte canônica (campo) |
|---|---|---|
| **Patrimônio total** | `rvPatrimonioBRL + rfPatrimonioBRL` (RF inclui `fixa_aberta` + RF de posições) | `snapshot.totalPatrimonioBRL` |
| **Patrimônio RV / RF** | valor atual das posições por classe | `rvPatrimonioBRL` / `rfPatrimonioBRL` |
| **Investido (RV)** | custo **FIFO** das posições atuais (não a soma bruta de compras) | `Σ position.custoTotalBRL` |
| **Câmbio de custo (P0)** | **pmDólar real das remessas** (`buildPmFxRates` → `fxCusto`), não a PTAX da data de compra | `position.pmFxAquisicao` |
| **Conversão p/ BRL** | valor × `fxToBRL(moeda, fx)` (spot atual para valor; pmDólar para custo) | `lib/cotacoes.ts: fxToBRL` |
| **Valorização %** | `lucroBRL / custoTotalBRL` — só preço/câmbio, **sem** proventos | `position.lucroPct` · `snapshot.lucroPct` |
| **Retorno Total %** | `(não realizado + realizado + proventos líq.) / investido` | `position.retornoTotalPct` · `snapshot.retornoTotalRVPct` |
| **Decomposição 2 fatores** | Ativo (`puro + cruzado`) vs Câmbio (`principal`) → soma = lucro | `ganhoAtivoBRL` / `ganhoCambioBRL` |
| **Decomposição 3 fatores** | `puro + principal + cruzado = lucro` | `ganhoAtivoPuroBRL` / `ganhoFXPrincipalBRL` / `ganhoCruzadoBRL` |
| **Proventos (líquidos)** | bruto − IR retido; em BRL ao câmbio atual | `snapshot.totalProventosBRL` · `proventosPorTicker` |
| **IR retido s/ proventos** | imposto retido na fonte (total RV+RF) | `snapshot.totalImpostoProventosBRL` |
| **Exposição cambial** | valor em moeda ≠ BRL (posições **+** RF/caixa de `fixa_aberta`, inclui caixa USD) ÷ **patrimônio total** | `snapshot.exposicaoCambial` (buckets por moeda) |
| **Variação no dia** | Σ `dayChangeBRL` das posições | `snapshot.dayChangeTotalBRL` / `dayChangeTotalPct` |
| **TWR (%)** | Modified Dietz SoD: `Π(1 + ret_d) - 1`, chain-link diário | `calcularTWR().twrTotal` (`lib/twr-engine.ts`) |
| **TWR anualizado** | `(1 + TWR)^(252/dias) - 1` | `calcularTWR().twrAnualizado` |
| **MWR/XIRR** | Newton-Raphson sobre cashflows reais + NAV final | `calcularTWR().mwr` |
| **Ganho Econômico** | `navFinal - navInicial - flows + firstFlow + income` (identidade contábil) | `calcularTWR().ganhoEconomico` |

### Identidades que devem SEMPRE valer (cobertas por teste)
- `totalPatrimonioBRL = rvPatrimonioBRL + rfPatrimonioBRL`
- Por posição: `ganhoAtivoPuro + ganhoFXPrincipal + ganhoCruzado = lucroBRL`
- Por posição: `retornoTotalBRL = não realizado + realizado + proventos`
- `Σ exposicaoCambial[moeda] = totalPatrimonioBRL`
- Soma das posições RV = totais RV do snapshot

Ver `lib/__tests__/portfolio.test.ts` (suíte de blindagem).

---

## 4. Regra de reúso (obrigatória)

✅ **Faça:** ler o campo canônico do snapshot.
```ts
const retorno = position.retornoTotalPct;        // certo
const exposicaoFX = data.exposicaoCambial;       // certo
```

❌ **Não faça:** recalcular a métrica na página/rota.
```ts
// ERRADO — recria fórmula que já é canônica e vai divergir
const retorno = (p.lucroBRL + prov + realizado) / p.custoTotalBRL * 100;
const fx = somaMinhaPropriaExposicao(...);
```

Se o campo canônico **não existe ainda**, a regra é: **adicione ao snapshot**
(seção 6), não calcule localmente.

---

## 5. Exceções (permitidas, mas rotuladas)

Uma exceção é aceitável **somente** quando responde a uma pergunta financeira
genuinamente diferente — não por conveniência. Toda exceção precisa:

1. Ter um **rótulo na UI** que deixe claro que é uma visão diferente.
2. Ser **listada nesta seção** com a justificativa.

### Exceções vigentes
- **Retorno em moeda nativa** (`/api/composicao/resumo`): retorno % calculado na
  moeda do ativo (USD para ativos em dólar), para avaliar *stock picking* sem o
  efeito câmbio. É uma visão complementar à canônica (que é sempre em BRL). Deve
  vir sempre rotulada como "moeda nativa".
- **Decomposição cambial — 2 vs 3 fatores**: a página **Câmbio → Exposição** usa a
  visão de **2 fatores** (Ativo vs Câmbio); o **Resumo → DRE** usa **3 fatores**
  (puro/principal/cruzado). Ambas derivam dos mesmos campos do snapshot e fecham no
  mesmo lucro — são agrupamentos diferentes do mesmo cálculo, não fórmulas distintas.
- **Proventos: bruto vs líquido**: o padrão é **líquido** (canônico). O bruto pode
  ser exibido como detalhe, sempre com o IR explícito ao lado.

> Se você precisa de uma exceção que **não** está nesta lista, ela provavelmente é
> um bug de divergência. Pare e reconcilie com o canônico antes.

---

## 6. Como adicionar um cálculo novo

1. Defina a fórmula em `CALCULOS.md` e o nome canônico aqui (seção 3).
2. Implemente **uma vez** em `lib/portfolio.ts` (ou helper em `lib/`) e exponha no
   `PortfolioSnapshot`.
3. Mapeie o campo em `lib/hooks.ts` (`mapPosition` / `mapPortfolioResponse`).
4. Consuma o campo nas páginas — **sem recalcular**.
5. Adicione um teste de identidade/reconciliação em `lib/__tests__/portfolio.test.ts`.

---

## 7. Gaps conhecidos a reconciliar

Itens que **ainda não** seguem 100% o canônico. Tratar incrementalmente:

- [x] **Resumo (DRE)** — agora 100% canônica: RV do snapshot (`lucroBRL` +
  realizado das posições), RF do motor canônico (`/api/renda-fixa/posicoes`) +
  RF-posições do snapshot, proventos/decomposição/exposição/patrimônio do snapshot.
  Bate com `/renda-variavel` e `/renda-fixa`. ✅ **Use o Resumo como padrão-ouro.**
- [ ] **Resumo — aba "Rentabilidade por Ativo"**: usa `retorno_*_pct` do route
  (moeda nativa). Reconciliar/rotular vs `position.retornoTotalPct` (BRL canônico).
- [ ] **Resumo — Posições Encerradas**: lista de vendidos vem de
  `composicao.rentabilidade` (status "Vendido"). É dado de listagem (snapshot não
  rastreia posições zeradas), não cálculo canônico — aceitável, mas avaliar mover
  para o motor de RF/RV de encerradas.
- [ ] **`/api/composicao/resumo` recomputa `exposicao_cambial`** por conta própria.
  Já bate com o snapshot, mas é código duplicado — fazer o route reusar
  `snapshot.exposicaoCambial`.
- [ ] **Setores**: badge de % por ativo usa só valorização (preço). Avaliar expor
  Retorno Total quando fizer sentido.
- [x] **Performance (TWR/MWR)** — agora canônico: motor GIPS-compliant Modified
  Dietz em `lib/twr-engine.ts` (`calcularTWR`). SoD sempre, sem caps, sem
  heurísticas. forceZero apenas quando base ≤ 0. Documentado em `CALCULOS.md §16/§19`.
- [ ] **Outras páginas** (Trades, etc.): auditar contra o Resumo
  canônico e migrar números recalculados para os campos do snapshot.

---

## 8. Checklist ao mexer em qualquer página de números

- [ ] Estou **lendo** o campo canônico, não recalculando?
- [ ] O rótulo é o mesmo usado nas outras telas para a mesma métrica?
- [ ] Se é uma visão diferente, está **rotulada** e listada na seção 5?
- [ ] Os números **batem** com a página dedicada da mesma classe de ativo?
- [ ] Há **teste** cobrindo a identidade que isso assume?

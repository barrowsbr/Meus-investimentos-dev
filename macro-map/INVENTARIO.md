# Fase 0 — Inventário de Reconhecimento

**Saída obrigatória antes de escrever código.** Este documento reconcilia as premissas
do briefing com a realidade do app e determina o que `pipeline/adapters.ts` fará.
Todas as afirmações têm citação `arquivo:linha`.

> Regra de ouro do projeto (Princípio 1): o módulo é **consumidor** da camada de dados
> do Radar e **produtor** de uma tabela nova. Não duplica ingestão. Este inventário
> existe para que `adapters.ts` leia o que já existe e só busque de fora o que falta.

---

## 0. Duas premissas do briefing que estavam ERRADAS

| Briefing dizia | Realidade | Evidência |
|---|---|---|
| "PostgreSQL" | **Não há banco SQL.** A camada de dados é **Google Sheets**. Golden source de preços = aba `db_cotacoes`. | Grep de `postgres\|prisma\|supabase\|DATABASE_URL` no repo casa **só** um comentário aspiracional em `lib/data-store.ts:5`. As implementações reais são `GSheetsDataStore`/`GSheetsMarketDataStore` (`lib/data-store.ts:52-96`). `package.json` não tem driver de DB. |
| "FMP como fonte de dados de mercado" | FMP **existe**, mas só para look-through de ETF e logos — **não** para cotações/macro. As cotações do Radar são **Yahoo-primário**. | FMP em `lib/ticker-country.ts:313-337` (país de ETF), `lib/etf-holdings.ts:279-283` (holdings), logos em `app/api/logo/[ticker]/route.ts`. Env `FMP_API_KEY` (`lib/api-registry.ts:122`). Cotações via `fetchQuotes`/`fetchHistory` em `lib/cotacoes.ts`. |

Consequência: a arquitetura da seção 5 do briefing (persistir no PostgreSQL após o
fechamento de NY) vira **"acumular colunas em `db_cotacoes` via o cron que já existe"**.

Nota estrutural: **`/bolsas` é só um redirect** para `/radar` (`app/bolsas/page.tsx:5-15`).
O Radar real é o **Radar V2** em `components/radar/RadarShell.tsx`. Os cards de divergência
plugam ali, não em `app/bolsas`.

---

## 1. O que o Radar já ingere (e com qual símbolo exato)

Toda cotação passa por `fetchQuotes()`/`fetchHistory()` em `lib/cotacoes.ts` (Yahoo primário,
com fallbacks brapi/AlphaVantage/AwesomeAPI/open.er-api). Símbolos na **grafia exata do Yahoo**.

| Driver que o mapa usa | Presente? | Símbolo Yahoo | Onde | Persistido? |
|---|---|---|---|---|
| Brent | ✅ vivo | `BZ=F` | `lib/radar/commodities.ts:21` | ❌ |
| Ouro (futuro) | ✅ vivo | `GC=F` | `lib/radar/commodities.ts:25` | ❌ |
| DXY | ✅ vivo (+ sintético) | `DX-Y.NYB` | `app/api/moedas/handler.ts:282`, sintético `:154-172` | ❌ |
| USD/BRL | ✅ | `BRL=X` | `lib/cotacoes.ts:54-60` | ✅ coluna |
| S&P 500 | ✅ | `^GSPC` (+`^SP500TR`) | `lib/radar/indices.ts:14` | ✅ coluna |
| Ibovespa | ✅ | `^BVSP` | `lib/radar/indices.ts:23` | ✅ coluna |
| VIX | ✅ vivo | `^VIX` | `lib/radar/indices.ts:20` | ❌ |
| US10Y (yield) | ✅ vivo | `^TNX` | `app/api/bolsas/yields/handler.ts:10` | ❌ |
| Curva US (2/5/30) | ✅ vivo | `2YY=F`,`^FVX`,`^TYX` + `^IRX` | `app/api/bolsas/yields/handler.ts:6-12` | ❌ |
| **HY spread (OAS)** | ❌ **ausente** | — | grep `HYG\|JNK\|OAS\|BAML` = 0 | ❌ |
| **Juros Brasil (Selic exp./DI/NTN-B)** | ⚠️ **fora do Radar** | — | BCB SGS existe app-side (`lib/bcb.ts` CDI 12, `lib/margin.ts` Selic 432) mas **não** no Radar; sem DI futuro / NTN-B | ❌ |

⚠️ **Achado de ouro**: a rota `app/api/bolsas/yields/handler.ts` já monta `^TNX` + curva +
DXY + ouro, **mas está MORTA** — nenhum componente/hook do Radar a consome (só a referencia
`docs/generate-radar-pdf.py`). É o caminho de ingestão mais barato de reaproveitar.

Provedores do Radar: Yahoo (primário, `lib/cotacoes.ts`), brapi (B3, `:249`), AlphaVantage
(rede de segurança, `:364`), AwesomeAPI + open.er-api (fallback FX). **BCB não é usado pelo
Radar** — só pelo motor de portfólio/margem. Tudo é **live-por-request** com cache CDN
`s-maxage=900` (~15 min), sem cron alimentando o Radar.

---

## 2. Onde os dados param — `db_cotacoes` (o único histórico persistido)

- **Formato**: matriz **larga**, 1 linha/dia, 1 coluna/ticker; coluna A = `data`
  (`lib/db-cotacoes.ts:43-79`, `:256`). **Preço bruto de fechamento (não ajustado)** — o
  endpoint de auditoria `app/api/debug/audit-cotacoes/handler.ts:247-256` existe justamente
  para flagrar qualquer coluna que tenha virado `adjClose` (causaria double-count no TWR).
- **Granularidade**: diária (`interval:"1d"`, `lib/market-history.ts:54`).
- **Profundidade**: backfill sob demanda do Yahoo (`action:"backfill"` →
  `lib/sync-cotacoes.ts:83-151`), ancorado na **primeira transação da carteira −30 dias**
  ou `lookbackYears` (default 5, teto 10). Yahoo aceita `range=max` (`lib/market-history.ts:39`).
- **Colunas fixas não-carteira** (`lib/sync-cotacoes.ts:7-11`): `BRL=X`, `EURBRL=X`,
  `CADBRL=X`, `GBPBRL=X`, `^BVSP`, `^GSPC`, `^SP500TR`. O resto **cresce com a carteira**.
- **Atualização**: Vercel Cron `/api/cron/cotacoes`, `"0 23 * * 1-5"` (dias úteis 23h UTC),
  `vercel.json`. Gate de imutabilidade `checkGoldenGuard` (`lib/db-cotacoes.ts:115-149`) proíbe
  encolher a série; merge é **aditivo** (só preenche células nulas). Sem retenção/trim.
- **Não há PostgreSQL** em lugar nenhum (confirmado em `package.json` e grep repo-wide).

---

## 3. Prontidão dos drivers — o gap que muda o desenho das regras

Esta é a conclusão central da Fase 0. Para z-score rolante de 60–250 dias, cada driver
precisa de **≥ ~250 pregões contínuos**. Estado de cada série (ver `drivers.yaml`, que é a
versão máquina-legível desta tabela):

| Prontidão | Séries | O que fazer |
|---|---|---|
| **pronto** (persistido hoje) | `USDBRL`, `SPX`, `IBOV` | nada — z-score já é possível |
| **backfill** (Yahoo já busca; falta persistir) | `BRENT`, `GOLD`, `DXY`, `US10Y`, `US02Y`, `US_SMALLCAP`, `VIX` | adicionar o símbolo à lista da sync (`lib/sync-cotacoes.ts:10-11`) + 1 `backfill` |
| **fonte_nova** (não existe no app) | `US10Y_REAL` (FRED DFII10), `HY_SPREAD` (FRED BAMLH0A0HYM2), `SELIC_EXP` (BCB Focus/Olinda), `BR_10Y` (NTN-B/DI — sem fonte livre trivial), `BR_RISK_PREMIUM` (proxy EWZ/SPX ou CDS) | integrar fonte externa **antes da Fase 2** |

Impacto no desenho das regras semente:
- **Viáveis quase já** (só pronto/backfill): energia #1 e #2, fx #5 e #6 (a regra de detecção
  que originou o projeto — `DXY` backfill + `USDBRL` pronto), juros #4, crédito #8 (`VIX`).
- **Dependem de fonte nova**: juros #3 (`US10Y_REAL`), crédito #7 (`HY_SPREAD`), brasil #9
  (`SELIC_EXP`) e #10 (`BR_10Y`, `BR_RISK_PREMIUM`). São escritas na mesma, mas ficam
  **inertes** no runtime até a fonte existir — e é honesto saber disso agora, não depois.

> A perna Brasil é a mais cara: **não há juro longo brasileiro nem prêmio de risco** em
> nenhum lugar do app. É o maior investimento de dados antes da Fase 2.

---

## 4. Convenções que o módulo herda (não inventa)

- **Ticker = grafia exata do Yahoo** (`CLAUDE.md:181`; mapa suffixo→moeda em
  `lib/sectors.ts:43-53`). Por isso o vocabulário simbólico do mapa (`drivers.yaml`) guarda
  o `simbolo_fonte` Yahoo de cada série — o adapter resolve símbolo→ticker 1:1.
- **Classificação de ativos**: `identificarSetor()` (`lib/sectors.ts:61-115`); moeda efetiva
  `getMoedaEfetiva()` (`:152-164`), default **BRL**.
- ⚠️ **Costura do SHV**: o briefing trata SHV como *Renda Fixa (USD)*, mas hoje
  `identificarSetor("SHV")` devolve **`"ETF USA"`** (`lib/sectors.ts:19`) e moeda USD — o set
  `RENDA_FIXA_USD` está **vazio** (`:17`), então SHV nunca chega ao ramo RF. Não bloqueia a
  Fase 1 (SHV aparece só em `relevancia_portfolio`), mas **reconciliar antes** de qualquer
  lógica que dependa de SHV ser RF.

---

## 5. Como os cards são renderizados (para reusar, não recriar)

- **Primitivo oficial**: `components/terminal/Panel.tsx` (`.t-panel`, `app/globals.css:255`) —
  tem slot `right` feito para um badge de estado. Substitui `.glass-card`.
- **O que o dossiê do Radar usa hoje**: cards inline `rounded-xl p-3` com fundo/borda tingidos
  por estado. O análogo mais próximo do card de divergência é o **card de convergência**:
  `components/radar/dossier/InteligenciaTab.tsx:100-127` e `ResumoTab.tsx:67-86`.
- **Mapa estado→cor** modelo: `InteligenciaTab.tsx:10-15` (`LEVEL_CONFIG`). Tokens de tema:
  `--pos`/`--neg`/`--info` + `--accent` (`app/globals.css:37-40`), 6 temas.
- **Chips de status**: o `CHIP_TONE` de `components/config/SectionCard.tsx:14-19`
  (`ok`/`warn`/`off`) é o mais limpo — Confirmado=ok, Anômalo=warn, Regime rompido=off.
- **Detector irmão**: `lib/radar/convergence.ts` (`detectConvergence`) é literalmente o
  complemento da divergência. A Fase 3 deve modelar `lib/radar/divergence.ts` na mesma forma
  (`{active,count,signals[],intensity}`), consumido como `CountryDossier.tsx:72-75`.

---

## 6. Contrato de integração (o que `adapters.ts` fará)

1. **Ler** de `db_cotacoes` via `lib/market-history.ts` (`fetchHistoricalData`) para as séries
   `pronto`. **Não** reimplementar leitura de planilha.
2. Para as séries `backfill`: adicionar os símbolos Yahoo à sync (`lib/sync-cotacoes.ts:10-11`)
   e disparar 1 `backfill` — depois elas viram `pronto` e o adapter as lê igual.
3. Para as séries `fonte_nova`: buscar da fonte externa (FRED/BCB/proxy) e persistir na mesma
   `db_cotacoes` (colunas novas) para reusar o z-score.
4. **Produzir** uma tabela nova `macro_divergence_daily` (na verdade, uma aba nova na planilha,
   coerente com a arquitetura de dados real). **Não** alterar schema existente; **não** tocar
   Resumo / Performance / Home.

Nada disso é escopo da Fase 1 (esta sessão) — é o mapa para as Fases 2–3.

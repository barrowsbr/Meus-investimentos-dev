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
  (Mais)                bolsas (Radar), noticias, polymarket, agente-ia, moedas,
                        etf-cem (100 maiores via VOO — P/L e distância do ATH),
                        gameboy (2 emuladores: console clássico WasmBoy + EmulatorJS
                        self-hosted em public/emulatorjs/data — bundle + cores
                        gambatte/mgba/genesis_plus_gx/snes9x baixados pela workflow
                        emulatorjs-data, trigger por push de scripts/.emulatorjs-run;
                        jogos abrem no "modo jogo" public/emulatorjs/player.html —
                        página crua, senão o Safari iOS estoura memória; CATÁLOGO em
                        public/roms/catalogo.json (arquivo em public/roms/ + entrada
                        no JSON → card no EmulatorJS e chip gb/gbc no clássico);
                        ROM do Pokémon NÃO versionada: picker → IndexedDB do
                        aparelho, compartilhada entre os 2 modos, ou
                        public/roms/pokegold-spaceworld-en.gb se o dono adicionar),
                        configuracoes
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
     (conflitos/protestos ao vivo no HoloGlobe vêm do **GDELT Events 2.0** —
     arquivos CSV de 15 min em data.gdeltproject.org, abertos, SEM key, filtrados
     por código CAMEO em `lib/gdelt-events.ts`; desastres vêm de NASA EONET +
     USGS. A API GDELT **GEO 2.0 foi APOSENTADA** — devolve 404 para qualquer
     query, NÃO tentar de novo; a DOC 2.0 segue viva mas limita 1 req/5s, ver
     `lib/gdelt-fetch.ts`. ACLED foi descartado porque o tier gratuito de e-mail
     pessoal não dá acesso à API),
     `TELEGRAM_BOT_TOKEN` (alertas determinísticos — DARF/DIRPF/alavancagem — e o
     resumo do dia em imagem via cron; a env var tem prioridade, mas o token
     também pode ser salvo em Configurações — aba `app_config` (escopo `alertas`), nunca reenviado
     ao cliente; o chat_id igualmente vai em Configurações)
4. A planilha deve estar compartilhada com "Qualquer pessoa com o link" (Leitor)

## Acesso ao Google Sheets

- **Planilha**: `gdados`
- **Leitura**: API Key (`GOOGLE_API_KEY`) — basta a planilha compartilhada por link como Leitor
- **Escrita**: service account (`GOOGLE_SERVICE_ACCOUNT_JSON`), com a planilha compartilhada
  com o e-mail do service account como **Editor**. Toda escrita (`writeTab`) faz **backup
  automático** da aba antes de sobrescrever (`lib/backup.ts`)
- **Backup diário (CSVs FORA da planilha) + saúde + editor**: Configurações → card
  "Planilha (gdados)". O workflow `.github/workflows/backup.yml` (diário, 6h30 BRT) chama
  `GET /api/config/planilha/backup?export=all` (Bearer `CRON_SECRET`) e **sobrescreve os
  CSVs de todas as abas na branch `backups`** do repositório (versões antigas ficam no
  histórico de commits; deploy da branch desativado no `vercel.json`). Backup dentro da
  própria planilha NÃO vale como backup (decisão do dono). No card: download de CSV por
  aba, **Restaurar CSV** (upload → sobrescreve a aba, baixando antes o estado atual) e
  **teste de saúde** (`lib/planilha-saude.ts`: datas/números inválidos, células `#REF!`,
  headers duplicados, moedas estranhas, lock mensal corrompido)
- **Biblioteca**: `googleapis` (Node.js)

## Multiusuário (planilha por conta — sem banco de dados)

- Contas extras (ex.: esposa) têm a PRÓPRIA planilha Google. Config via env
  **`EXTRA_USERS_JSON`**: `[{"user":"maria","password":"...","spreadsheetId":"1AbC..."}]`.
- Login de conta extra seta cookie **HttpOnly `mi_user`**; `lib/user-sheet.ts`
  (`activeSpreadsheetId`) roteia TODA leitura/escrita do gsheets para a planilha
  da conta. Sem cookie (dono, cron, scripts) vale `SPREADSHEET_ID`. Login do dono
  limpa o cookie.
- A planilha extra precisa de: compartilhamento por link como **Leitor** (leitura
  via API key) e o e-mail do service account como **Editor** (escrita/backup).
- **CDN**: `middleware.ts` roda antes do cache da Vercel e reescreve `/api/*` com
  `?__acct=<conta>` quando há cookie de conta extra ou demo — cada conta tem sua
  entrada de cache (sem isso a resposta cacheada do dono vazaria para a outra
  conta dentro do s-maxage).
- Exceções que ficam na planilha principal: **db_cotacoes** (golden source de
  preços — dado de mercado, compartilhado; `lib/db-cotacoes.ts` tem o próprio
  SPREADSHEET_ID) e o **sync IBKR Flex** (token do dono; bloqueado para extras).
- Caveat (igual ao demo): o Python (`api/index.py`) lê a planilha direto e NÃO
  segue o cookie — agente IA/fluxos mostram os dados do dono.

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
| Símbolo | Ticker na **grafia exata do Yahoo** (regra do dono): B3 com .SA (CMIG4.SA, VALE3.SA), internacionais com sufixo de bolsa (DPM.TO, VOW3.DE), EUA sem sufixo (VOO). Sincronizadores validam no Yahoo antes de gravar (`canonicalizeTickersForSheet`); grafias antigas sem sufixo seguem lidas normalmente (dedup/joins por base) e podem ser unificadas em Configurações → "Tickers × Yahoo" |
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

### 12. `app_config` — Configurações do app (aba única: escopo/chave/valor)

Fusão das antigas abas de configuração `historico_config`, `alertas_config`,
`alertas_estado` e `automacoes_config` (`lib/app-config.ts`). Migração
preguiçosa: leitura cai para a aba legada enquanto o escopo não foi gravado na
`app_config`; a primeira gravação migra o escopo (marcador `__migrado`) e as
abas velhas podem então ser apagadas pelo dono. A aba `config` (login/senha/
fundo) **NÃO participa** da fusão e não deve ser tocada.

---

## Página Moedas (coleção numismática — dado ESTÁTICO, fora da planilha)

- A coleção vive em **`lib/moedas-data.ts`** (gerado do CSV exportado pelo app
  **CoinSnap** com o parser de `lib/moedas.ts`). **Não há aba na planilha, upload
  nem card em Configurações — decisão do dono**: quando ele quiser atualizar,
  envia o novo CSV no chat e o arquivo é regenerado (atualizar também
  `COLECAO_ATUALIZADA_EM`).
- `/moedas` (menu Mais → nav real em `components/terminal/nav.ts`) mostra mapa-múndi
  da coleção, filtros, cards com flip anverso⇄reverso e dossiê por moeda.
- `/moedas/estojo` — "Estojos": vitrine fullscreen POR CONJUNTO monetário (não
  existe estojo "todas" — decisão do dono), pensada para tela deitada: veludo,
  berços em escala real e ordem cronológica. Gestos: 1 toque VIRA (flip 3D com
  espessura de metal), 2 toques → CARD-RESUMO com link p/ o dossiê da coleção
  (`/moedas?m=<índice>` — deep-link no MoedasShell). Botão GRAVIDADE é um
  INTERRUPTOR (decisão 19/07): ligar SOLTA todas as moedas (caem; arrastar com
  mola, carregar e segurar ~1s num berço vazio para encaixar só funcionam
  ligado); desligar recoloca todas nos berços ORIGINAIS. Fora do modo
  gravidade as moedas são FIXAS — só flip/resumo. O pote (`/moedas/pote`)
  foi REMOVIDO (decisão do dono 19/07 — ficou só o estojo). **Quadro do Plano
  Real** (botão "Quadro", SÓ no estojo "Real"): recriação VETORIAL da placa
  clássica de comemorativas (bandeira olímpica, caixa FAO, 16 olímpicas +
  mascotes, Direitos Humanos/BC 50/BC 40/JK/Beija-Flor e as 2 famílias),
  berços preenchidos com as fotos DA COLEÇÃO casadas por KM#
  (`components/moedas/QuadroReais.tsx`); berço sem moeda fica vazio; toque
  vira a moeda. **Livrinho do Canadá** (botão "Livro", SÓ no estojo "Dólar
  canadense"): o Commemorative Coin Set 2007 da RCM recriado vetorialmente
  "como novo" (`components/moedas/LivroCanada.tsx`) — capa com furo mostrando
  a 25¢ colorida + brilho varrendo, miolo com os 7 painéis EN/FR transcritos
  do card físico (toque = leitor ampliado) | página dos berços com rótulos em
  arco, contracapa VAZADA (pelos furos aparece a parte de TRÁS das moedas — a
  efígie — também virável) com barcode/créditos; páginas viram em 3D (setas),
  moedas Canadá-2007 da coleção casadas por denominação, lado do DESENHO para
  cima (reverso das fotos CoinSnap), toque vira; PINÇA dá zoom (roda no
  desktop, arrastar quando ampliado; zoom zera ao virar página). ⚠️ face
  oculta da folha 3D precisa de pointerEvents none (backface some do desenho,
  não do hit-testing). **Modo 1:1**: moedas no TAMANHO FÍSICO real (px/mm calibrável pela
  régua — moeda de 1 real na tela; `moedas_pxmm` no localStorage); com 1:1
  ATIVO o zoom fica TRAVADO (pinça/roda desligadas — só pan); fora dele pinça
  dá zoom e arrastar o veludo navega. Luz especular + bevel seguem o
  acelerômetro, sombras seguem a gravidade, parallax no veludo. ⚠️ matter-js:
  corpo criado `isStatic: true` explode em NaN ao ser liberado — criar dinâmico
  e assentar com `Body.setStatic(true)` depois.
- `/moedas/foto` — "Estúdio de foto": refaz a foto de um exemplar no formato
  EXATO da coleção (512×512, fundo preto, moeda preenchendo o quadro — padrão
  CoinSnap; os arquivos são JPEG com extensão .webp). Abre pelo dossiê
  ("Refazer foto" passa `a`/`r` = paths atuais), câmera ou galeria, ajustes de
  zoom/pan/rotação/brilho/contraste com máscara circular, e baixa com o MESMO
  nome do arquivo atual — o dono manda o arquivo no chat e ele é trocado em
  `public/colecao-moedas` (sem tocar em `lib/moedas-data.ts`).
- `/api/moedas-colecao` devolve SÓ o spot da prata (SI=F × BRL=X) para o valor de
  derretimento ao dia. `/api/moedas-colecao/info` enriquece o dossiê de UMA moeda com o catálogo
  **Numista** (`NUMISTA_API_KEY`): tiragem, dimensões, descrições, gravador e
  **preços estimados por graduação em BRL** (o estado do exemplar em destaque).
- **Exportar para o Numista** (Configurações → card "Exportar coleção para o
  Numista"): casamento com o catálogo em dry-run (`lib/numista.ts` — KM# exato =
  confiável; só país+ano = dúvida, fica de fora), envio via OAuth
  client_credentials para a conta do DONO da chave com **repetidas marcadas
  "disponível para troca"** (1 guardada + qtd−1 para troca — decisão do dono),
  registro de cada item criado na aba `numista_envio` e **desfazer em lote**.
  Rotas fatiadas (`/api/moedas-colecao/numista/{match,enviar,desfazer}`) — o
  card pagina as chamadas. NUNCA enviar sem dry-run aprovado no card.
  A "história por IA" foi REMOVIDA a pedido do dono — dado real > texto gerado.
  Cache CDN 7 dias. ⚠️ **`/api/moedas` é o endpoint de CÂMBIO do Radar**
  (`app/api/moedas/route.ts` → `handler.ts`) — não confundir com a coleção
  (`/api/moedas-colecao`) nem reutilizar o path.

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
- **Depois de CADA squash-merge, sincronizar a branch com a main E dar push**:
  `git fetch origin main && git checkout -B claude/add-repo-description-AanfH origin/main && git push --force-with-lease -u origin claude/add-repo-description-AanfH`.
  Sem esse push, a ponta remota fica no commit pré-squash e o GitHub mostra a branch
  como "1 ahead" da main (banner de Compare & PR, aparência de merge pendente) —
  mesmo com tudo já mergeado. O force-with-lease é seguro aqui: a branch só contém
  história já mergeada.
- Desenvolver sempre na branch `claude/add-repo-description-AanfH`; commitar e dar push lá.
- **Preview da branch DESLIGADO** (`vercel.json` → `git.deploymentEnabled` com a
  branch = `false`): antes cada tarefa gerava 2-3 deploys (Preview do push + Production
  do merge + Preview do force-push de sync), queimando a cota do Hobby e poluindo.
  Agora só a `main` faz deploy (1 por tarefa). Não reativar sem motivo; se precisar
  ver um preview específico, ligar pontualmente e desligar depois.
- Produção é a `main` (deploy automático na Vercel). Crons (`vercel.json`) só são registrados no deploy de produção da `main`.
- **Vercel é plano HOBBY (regra dura de deploy)**: cron só pode rodar **1×/dia**
  (schedule sub-diário como `0 * * * *` FAZ O BUILD DE PRODUÇÃO FALHAR — e como o
  build falha, TODOS os merges seguintes param de subir pra produção, sem aviso
  óbvio). Nunca usar schedule mais frequente que diário no `vercel.json`. Para
  disparo intra-dia (ex.: digest em vários horários), usar cron externo grátis
  (cron-job.org) batendo em `/api/cron/digest?force=1`, ou o gate por hora que já
  existe. Diagnóstico quando "não sobe": Vercel → Deployments, filtro de Status
  costuma esconder os **Error** — é lá que aparece a falha de cron.
- **Sempre fazer as duas coisas**: quando o dono manda uma mensagem enquanto uma tarefa está em andamento, fazer AMBAS — a tarefa corrente e o que foi pedido na nova mensagem.
- **"Investido"** = custo FIFO das posições atuais (não soma bruta de todas as compras).

## Fila de tarefas via página Anotações (anotacoes.md)

- O dono anota tarefas na página **Anotações** do app com etiqueta **`IA`**.
  Quando ele disser **"anotações.md"** (ou equivalente), leia **`anotacoes.md`**
  na raiz do repo e siga o protocolo à risca: 1 card = 1 tarefa com recurso
  dedicado (TaskCreate + commit próprio por card, nunca bolo único), type-check
  por card, e ao concluir marcar o ✓ via `PATCH /api/notas {id, feito:true}`.
- **Acesso à produção: SEMPRE pelo conector Vercel (MCP)** — a network policy
  bloqueia o domínio para curl, mas o tráfego MCP passa. Tools `mcp__Vercel__*`
  (permissão já liberada em `.claude/settings.json`); ler/marcar cards via
  `web_fetch_vercel_url` em `https://meus-investimentos-dev.vercel.app/...`
  (✓ via GET `?marcarFeito=<id>`). Detalhes no anotacoes.md.

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
- **Motor é SERVER-ONLY — client só importa `type` dele (regra dura de build).**
  `lib/portfolio.ts`/`cotacoes.ts`/`market-history.ts` puxam `yahoo-finance2`
  (→ `@deno/shim-deno` → `net`), que NÃO bundla no browser. Um `import` de VALOR
  (não `import type`) dessas libs num componente `"use client"` quebra
  `npm run build` — e o `tsc --noEmit` passa (tipos são apagados), então o erro
  só aparece no deploy. Se um client precisa de uma função de cálculo, ela tem
  que morar num módulo PURO sem deps server-only (ex.: `lib/lucro-venda.ts`).
  **Sempre rode `npm run build` (não só `tsc`) quando a mudança cruzar a
  fronteira client↔server** — client importando de `lib/`, rota de API nova,
  `middleware.ts` ou webpack.
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

## Histórico patrimonial (série `historico_patrimonio`)

- Alimenta a página **Patrimônio** — série longa (1 linha/snapshot): colunas
  `timestamp, data, hora, patrimonio_total, rv, rf, variacao_dia_pct, n_ativos`.
- O writer antigo (script Python externo) parou em jun/2026. O writer canônico
  agora é **`lib/historico-store.ts`** (`recordHistorico`), exposto em
  `/api/cron/historico` (Bearer `CRON_SECRET`). **`patrimonio_total` = o MESMO
  valor do card "Patrimônio total" da Home** (IBKR Flex + BR + Cripto, via
  `computeHomePatrimonio`), NÃO o total canônico do snapshot. A parte IBKR é
  **líquida da dívida de margem** (Net Liquidation Value — `buildIbkrOverview`
  abate `marginBalances`; sem isso, entrar em margem inflava Home e histórico).
  Só grava quando o book da IBKR entrou (`ibkr_ok`); senão pula (3×/dia dá redundância).
- **Roda por GitHub Action** (`.github/workflows/historico.yml`), **3×/dia** (10/14/18h
  BRT, dias úteis) — **NÃO** é cron da Vercel (Hobby só permite 1×/dia; sub-diário
  quebra o build de produção). Requer o secret `CRON_SECRET` no GitHub (mesmo valor
  da Vercel) e, opcional, a var `APP_URL`.
- **Liga/desliga em Configurações** (aba `app_config`, escopo `historico`; default
  ligado). Botão "Registrar agora" (`POST /api/config/historico {registrar:true}`).
- Append preserva tipos via `appendRowsTyped` (RAW) — números entram como número.
  Dedup por `data`+`hora` evita duplicar no mesmo horário.

## Motor de notícias personalizado (lib/news)

- **`lib/news/engine.ts` (`fetchNoticiasGerais`) é o motor único** do feed geral
  ("Para você" em /noticias): agrega feeds RSS diretos por tema (`fontes.ts` —
  fonte primária, com IMAGEM nativa; Google News não fornece foto real) +
  providers gated (Marketaux/Finnhub/GNews), deduplica, classifica tema
  (`temas.ts`), filtra briga política (`ehBrigaPolitica` — picuinha/bastidor,
  NUNCA geopolítica real), traduz EN→PT e ranqueia (`score.ts`: interesse do
  perfil + impacto + recência half-life 18h + bônus de imagem + curadoria).
- **Curador LLM** (`curador.ts`): a cascata `lib/llm` julga o topo do feed em
  lote (relevância 0-10 + flag briga), com cache por link — best-effort.
- **Perfil do dono** (`perfil.ts`, localStorage; card "Notícias — Perfil de
  interesses" em Configurações): default macro, geopolítica, mercados, tech,
  ciência; `semBriga` ligado. O NoticiasPanel envia por query.
- `scope=symbol` (Radar do Dia) segue o caminho antigo por Google News.
- Regra de produto: **notícia com imagem tem preferência** no ranking e o
  hero/grid do jornal — imagem real de veículo, nunca logo do Google.

## APIs & Integrações externas (regra dura)

> **Fonte única: `lib/api-registry.ts`.** É o catálogo canônico de TODA API/serviço
> externo do projeto. **Toda API nova entra lá** (com um `probe()` de health-check
> leve). Com isso ela: (1) aparece automaticamente no diagnóstico em **Configurações
> → APIs & Integrações**, e (2) deve ser adicionada à lista abaixo. Nunca adicione um
> serviço externo sem registrá-lo.

- **Health-check**: `GET /api/diag/apis` lista os metadados + estado da chave (nunca o
  valor). `GET /api/diag/apis?api=<key>` roda a probe leve daquela API e devolve
  `{ok, ms, detail}`. O card de Configurações usa os dois (botão por API + "Testar
  todas"). As probes rodam **no servidor** (Vercel) — a network policy do dev bloqueia
  vários hosts, então o resultado real aparece em produção.
- `/api/health` é o health legado só do Google Sheets — não confundir
  com `/api/diag/apis` (o painel completo).

APIs registradas hoje, por categoria (env var → OBRIG. / opc.):

- **Mercado & Cotações**: Yahoo Finance (livre) · brapi.dev (`BRAPI_TOKEN` opc.) ·
  CoinGecko (livre) · mempool.space (livre) · Financial Modeling Prep (`FMP_API_KEY` opc.) ·
  Alpha Vantage (`ALPHAVANTAGE_API_KEY` opc.)
- **Câmbio & Juros**: BCB PTAX/Olinda (livre) · BCB SGS (livre) · AwesomeAPI (livre) ·
  Open Exchange Rates (livre) · NY Fed Markets (livre) · ECB Data/BCE (livre)
- **Corretora**: IBKR Flex (`IBKR_FLEX_TOKEN` + `IBKR_FLEX_QUERY_ID` OBRIG.)
- **Dados & Planilha**: Google Sheets leitura (`GOOGLE_API_KEY` + `SPREADSHEET_ID` OBRIG.) ·
  Google Sheets escrita (`GOOGLE_SERVICE_ACCOUNT_JSON` OBRIG. p/ escrita)
- **IA & LLM** (cascata em `lib/llm.ts`): Gemini (`GEMINI_API_KEY`/`GOOGLE_API_KEY`) ·
  OpenAI (`OPENAI_API_KEY` opc.) · DeepSeek (`DEEPSEEK_API_KEY` opc.) · Groq (`GROQ_API_KEY` opc.) ·
  xAI/Grok (`XAI_API_KEY`/`GROK_API_KEY` opc.)
- **Notícias**: Google News RSS (livre) · feeds RSS diretos por tema (livre — fonte
  primária do motor, COM imagem; `lib/news/fontes.ts`) · Marketaux (`MARKETAUX_API_KEY` opc.) ·
  Finnhub (`FINNHUB_API_KEY` opc. — market news com imagem) · GNews (`GNEWS_API_KEY` opc. —
  world/tech/science com imagem) ·
  Reddit (`REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` opc. → OAuth; sem elas, JSON público) ·
  YouTube TV ao vivo (`YOUTUBE_API_KEY` opc. → resolve o live exato via Data API v3;
  sem ela, embed keyless 24/7 por canal — `TvAoVivoPanel` + `/api/tv/live`)
- **Predições**: Polymarket (livre) · Kalshi (livre) · Metaculus (livre)
- **Observatório & Geo**: Numista (`NUMISTA_API_KEY` opc. — catálogo numismático no dossiê da página Moedas) ·
  NASA api.nasa.gov (`NASA_API_KEY` opc., aceita DEMO_KEY) ·
  NASA EONET (livre) · USGS Earthquakes (livre) · GDELT DOC 2.0 (livre, 1 req/5s) ·
  GDELT Events 2.0 CSV (livre) · World Bank (livre)
- **Alertas & Logos**: Telegram Bot (`TELEGRAM_BOT_TOKEN` — ou salvo em Configurações) ·
  Logo.dev (`LOGO_DEV_TOKEN` opc.) · FMP Images (livre) · Parqet Logos (livre)

Fontes auxiliares NÃO no painel (assets/scraping, sem semântica de health-check):
CSVs de emissores de ETF (SSGA/iShares/Invesco em `lib/etf-holdings.ts`), topojson do
mundo (jsDelivr, `lib/world-map.ts`), Trading Economics (guest/scraping em
`app/api/bolsas/country`). **Mortas — não reintroduzir**: GDELT GEO 2.0 (404), ACLED e Clearbit Logo
(logo.clearbit.com — sunset dez/2025, o DNS nem resolve; o resolver `/api/logo`
usa brapi/FMP/logo.dev/Parqet/favicon por domínio).

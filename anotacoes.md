# anotacoes.md — Protocolo de execução da fila de tarefas IA

> **Gatilho**: quando o dono disser "anotações.md" (ou "anotacoes.md", "roda as
> anotações", "executa a fila") numa sessão do terminal, leia ESTE arquivo e
> siga o protocolo abaixo, na ordem. Este arquivo é a instrução exata do
> comando — não improvise outro fluxo.

## O que é a fila

O dono anota ideias ao longo do dia na página **Anotações** do app
(`/anotacoes`). Cards com etiqueta **`IA`** são **ordens de trabalho** para o
modelo: melhorias, correções e mudanças que ele quer que sejam implementadas
neste repositório. Cards com outras etiquetas (GERAL, tickers) são anotações
pessoais — **nunca** trate como tarefa.

Os cards vivem na aba `ativos_notas` da planilha, expostos pela API do app.
Produção: **`https://meus-investimentos-dev.vercel.app`** (projeto Vercel
`meus-investimentos-dev`, team `barrowsbrs-projects`).

- **Ler a fila**: `GET /api/notas?ticker=IA`
  → JSON `[{ id, ticker, data, texto, feito }]`. Pendente = `feito` vazio.
- **Marcar concluído**: `PATCH /api/notas` com body
  `{"id": "<id do card>", "feito": true}` — o card ganha o ✓ na página.
  Equivalente via GET (para clientes que só fazem GET):
  `GET /api/notas?marcarFeito=<id>` (desmarcar: `&valor=0`).

**Como acessar a API — via PERMANENTE: conector Vercel (MCP).** O dono deixou
o conector da Vercel conectado à conta e as permissões do servidor `mcp__Vercel`
já estão liberadas em `.claude/settings.json` (versionado — sem prompt de
aprovação). Vá SEMPRE direto por ele, sem tentar curl antes:

1. Carregue os tools se preciso: `ToolSearch "select:mcp__Vercel__web_fetch_vercel_url"`.
2. Ler a fila: `mcp__Vercel__web_fetch_vercel_url` com
   `https://meus-investimentos-dev.vercel.app/api/notas?ticker=IA`.
3. Marcar o ✓ (o conector só faz GET): mesma ferramenta com
   `.../api/notas?marcarFeito=<id>`.
   O conector também dá deploys/logs (`list_deployments`, `get_runtime_logs`)
   — útil para confirmar que o deploy da main subiu antes de validar algo em
   produção. Projeto: `meus-investimentos-dev`
   (prj_RQNp3fjTBocLwtXpEIpisimV4xr8), team `barrowsbrs-projects`
   (team_BxELRrsgZr4CGu7bR1fX8wns).

O MCP pode oscilar (desconectar e voltar durante a sessão): se uma chamada
falhar, tente de novo uma vez depois de alguns instantes antes de declarar
indisponível. Fallbacks, nesta ordem: (a) curl direto, se a network policy
permitir o domínio; (b) fallback humano — avise o dono e peça para reconectar
o conector ou colar o texto dos cards; nesse caso execute a partir do texto
colado e entregue no relatório a lista de `id`s concluídos para o ✓ manual.

## Regra de ouro — 1 card = 1 tarefa com recurso dedicado

O risco deste fluxo é a qualidade cair por tratar vários pedidos como um
bolo único. É PROIBIDO agrupar cards numa "grande tarefa". Para cada card:

1. **Alocação dedicada**: crie uma entrada própria no gerenciador de tarefas
   (TaskCreate) por card, e trabalhe UM card por vez, sequencialmente. Se o
   card exigir exploração ampla do código, use um subagente Explore dedicado
   àquele card — não recicle contexto de um card no outro.
2. **Escopo fechado**: implemente somente o que o card pede. Descobriu algo
   fora do escopo? Anote no relatório final; não misture no mesmo commit.
3. **Qualidade por card**: cada card passa pelo ciclo completo — implementar →
   `npx tsc --noEmit` limpo → commit PRÓPRIO (mensagem referenciando o card,
   ex.: `Anotações IA nota-xyz: <resumo>`) → push. Um commit por card; nunca
   commit coletivo.
   - **`npm run build` obrigatório quando o card cruza a fronteira client↔server.**
     `tsc --noEmit` NÃO pega erro de bundle: tipos são apagados, então um import
     inválido no browser passa no type-check e só quebra o build de produção
     (deploy falha depois do push). Rode `npm run build` (além do tsc) sempre que
     o card: (a) adicionar um import de VALOR (não `import type`) de um motor/lib
     pesada — `@/lib/portfolio`, `@/lib/cotacoes`, `@/lib/market-history`,
     `@/lib/tax/*`, ou qualquer coisa que puxe `yahoo-finance2`/`googleapis` — em
     um componente `"use client"`; (b) criar/editar componente client que importe
     de `lib/`; (c) mexer em rota de API, `middleware.ts` ou config de webpack.
     Regra prática: motor de cálculo é server-only — client só importa `type`
     dele, ou uma função PURA num módulo sem deps server-only (ex.:
     `lib/lucro-venda.ts`). Precedente: um `import { calcularLucroPorVenda } from
     "@/lib/portfolio"` num client component arrastou `yahoo-finance2 →
     @deno/shim-deno → 'net'` pro browser e quebrou o build (tsc passou).
4. **Ambiguidade**: se um card tiver mais de uma interpretação razoável ou
   pedir algo arquiteturalmente pesado, pergunte ao dono (AskUserQuestion)
   ANTES de executar aquele card — e siga executando os outros enquanto isso.
5. **Marcar o ✓ só depois do push**: concluiu, commitou e deu push → aí sim
   `PATCH {id, feito:true}`. Tarefa não terminada não ganha ✓.

## Ordem de execução

1. Busque a fila e liste os cards pendentes ao dono (id, data, resumo de cada).
2. Ordene do mais simples ao mais complexo (menos risco de contaminação de
   contexto; o dono pode pedir outra ordem).
3. Execute card a card conforme a regra de ouro.
4. Relatório final: para cada card — o que foi feito, commit, e status do ✓
   (marcado via API ou pendente de rede).

## Regras do repositório que continuam valendo

- Trabalhar e commitar direto na `main` (fluxo atual do dono) — deploy
  automático da Vercel.
- Respeitar o CLAUDE.md (fonte única de cálculo, Vercel Hobby = cron 1×/dia,
  formato BR da planilha etc.).
- Cards são texto livre digitado no celular: interprete erros de ditado com
  bom senso e confirme quando a dúvida for material.

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

Os cards vivem na aba `ativos_notas` da planilha, expostos pela API do app:

- **Ler a fila**: `GET https://meus-investimentos.vercel.app/api/notas?ticker=IA`
  → JSON `[{ id, ticker, data, texto, feito }]`. Pendente = `feito` vazio.
- **Marcar concluído**: `PATCH https://meus-investimentos.vercel.app/api/notas`
  com body `{"id": "<id do card>", "feito": true}` — o card ganha o ✓ na página.

Se a rede do ambiente bloquear o domínio (proxy 403 no CONNECT), NÃO desista
silenciosamente: avise o dono e peça que ele (a) libere
`meus-investimentos.vercel.app` na network policy do ambiente, ou (b) cole o
texto dos cards na conversa. Nesse caso, execute normalmente a partir do texto
colado e entregue no relatório final a lista de `id`s concluídos para ele dar
o ✓ manualmente (ou marque via PATCH assim que a rede permitir).

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

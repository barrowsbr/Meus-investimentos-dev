# Migração para SQLite (Turso) — multi-usuário

Este documento descreve a infraestrutura de banco SQLite adicionada ao projeto,
**sem alterar nada do funcionamento atual**. Hoje o app continua 100% no Google
Sheets. A camada SQLite é **opcional e dormente** até você configurar as variáveis
de ambiente e rodar a importação.

---

## ⚠️ Ponto de restauração (como voltar ao padrão)

Antes de qualquer coisa, foi criada uma tag de restauração apontando para o
projeto **100% Google Sheets**, antes da infraestrutura SQLite:

```
Tag: restauracao-pre-sqlite
```

Para voltar ao padrão, há dois caminhos:

1. **Não fazer nada** (mais simples): a camada SQLite só liga se as variáveis
   `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` existirem. Se você **não** configurá-las
   (ou removê-las da Vercel), o projeto ignora completamente o banco e segue no
   Sheets. Nenhum caminho de leitura existente foi modificado.

2. **Reverter o código** (volta o repositório ao estado anterior):
   ```bash
   git checkout restauracao-pre-sqlite          # inspecionar o estado antigo
   # ou, para reverter de fato na branch:
   git revert <hash-do-commit-da-migracao>      # desfaz só a migração, preservando histórico
   ```

> A tag é segura: nenhum dado da planilha é alterado em nenhum momento — a
> importação faz **somente leitura** do Google Sheets.

---

## O que foi adicionado (resumo técnico)

| Arquivo | Função |
|---------|--------|
| `lib/db/client.ts` | Conexão singleton com o Turso. `isDbConfigured()` retorna false se as env vars não existirem. |
| `lib/db/schema.ts` | DDL das 14 tabelas (idempotente, `IF NOT EXISTS`). |
| `lib/db/schema.sql` | Espelho do schema em SQL puro (referência). |
| `lib/db/import.ts` | Importadores Sheets → SQLite (somente leitura do Sheets, idempotente). |
| `lib/db/admin-auth.ts` | Proteção das rotas admin via `ADMIN_SECRET`/`CRON_SECRET`. |
| `app/api/admin/db/status` | GET — diagnóstico (configurado? tabelas? contagem). |
| `app/api/admin/db/migrate` | POST — cria as tabelas. |
| `app/api/admin/db/import` | POST — importa os dados do Sheets. |

Nenhuma página ou rota existente lê do SQLite ainda — esta é a **fase 1**
(infraestrutura + carga de dados em paralelo). A troca dos caminhos de leitura
para o banco será uma fase 2 separada, também reversível.

---

## ✅ O que VOCÊ precisa fazer (passo a passo)

Como testamos só em produção, todos os passos abaixo são feitos na Vercel + via
chamadas HTTP às rotas admin.

### 1. Criar o banco no Turso (grátis)

1. Crie conta em <https://turso.tech> (login com GitHub).
2. Crie um banco (ex.: `meus-investimentos`).
3. Pegue a **Database URL** (algo como `libsql://meus-investimentos-xxxx.turso.io`).
4. Gere um **auth token** do banco.

### 2. Configurar as variáveis de ambiente na Vercel

Em **Project → Settings → Environment Variables** (ambiente *Production*):

| Variável | Valor |
|----------|-------|
| `TURSO_DATABASE_URL` | a URL `libsql://...` do passo 1 |
| `TURSO_AUTH_TOKEN` | o token do passo 1 |
| `ADMIN_SECRET` | uma senha forte que você inventar (protege as rotas admin) |
| `ADMIN_EMAIL` | seu email (vira o 1º usuário, ex.: `lucasbarroso@gmail.com`) |

> Já deve existir `GOOGLE_SERVICE_ACCOUNT_JSON` (necessário para escrever no
> Sheets); a importação **não** precisa dela — só lê via `GOOGLE_API_KEY`.

Faça **Redeploy** para as variáveis entrarem em vigor.

### 3. Criar as tabelas (migrate)

```bash
curl -X POST "https://SEU-DOMINIO/api/admin/db/migrate?key=ADMIN_SECRET"
```

Resposta esperada: `{ "ok": true, "statementsApplied": NN }`.

### 4. Importar os dados do Sheets

Carga principal (tudo menos o histórico pesado de cotações):

```bash
curl -X POST "https://SEU-DOMINIO/api/admin/db/import?key=ADMIN_SECRET&email=SEU_EMAIL"
```

Depois, o histórico de cotações à parte (pode ser grande):

```bash
curl -X POST "https://SEU-DOMINIO/api/admin/db/import?key=ADMIN_SECRET&email=SEU_EMAIL&tables=db_cotacoes"
```

### 5. Conferir

```bash
curl "https://SEU-DOMINIO/api/admin/db/status?key=ADMIN_SECRET"
```

Mostra a contagem de linhas por tabela. Se algo der erro, o JSON traz o motivo
por tabela — pode rodar o import de novo (é idempotente).

---

## Multi-usuário

- Cada tabela de dados pessoais tem `user_id` (FK para `users`).
- Tabelas de mercado (`db_cotacoes`, `p_tax`, `composicao`) são **compartilhadas**
  (sem `user_id`) — são dados públicos.
- Para adicionar um 2º usuário, basta rodar o import com outro `email` (e, no
  futuro, apontar a planilha/fonte daquele usuário). Os dados ficam isolados por
  `user_id`.

A camada de autenticação (login por usuário) e a troca das leituras do app para o
banco virão na **fase 2**, sem quebrar o que existe.

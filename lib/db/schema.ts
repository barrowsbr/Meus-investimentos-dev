/**
 * schema.ts — DDL canônico do banco SQLite (Turso/LibSQL), embutido como string
 * para ser aplicado em runtime (serverless) sem depender de leitura de arquivo.
 *
 * Idempotente: usa CREATE TABLE/INDEX IF NOT EXISTS, então pode rodar várias
 * vezes com segurança.
 *
 * NOTA: este é o schema CANÔNICO (o que de fato é aplicado). Ele é
 * intencionalmente mais leniente que lib/db/schema.sql (sem CHECK constraints),
 * para não rejeitar dados legados durante a importação do Google Sheets.
 * O schema.sql permanece como referência do desenho estrito original.
 */

export const SCHEMA_STATEMENTS: string[] = [
  // ── 1. USERS ──────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT    NOT NULL UNIQUE,
    nome       TEXT,
    avatar_url TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
  )`,

  // ── 2. MEUS_ATIVOS ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS meus_ativos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    data       TEXT    NOT NULL,
    tipo       TEXT    NOT NULL,
    ticker     TEXT    NOT NULL,
    quantidade REAL    NOT NULL,
    preco      REAL    NOT NULL,
    taxa       REAL    NOT NULL DEFAULT 0,
    moeda      TEXT    NOT NULL DEFAULT 'BRL',
    corretora  TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ativos_user   ON meus_ativos(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ativos_ticker ON meus_ativos(user_id, ticker)`,
  `CREATE INDEX IF NOT EXISTS idx_ativos_data   ON meus_ativos(user_id, data)`,

  // ── 3. MEUS_PROVENTOS ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS meus_proventos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    ticker     TEXT    NOT NULL,
    data       TEXT    NOT NULL,
    decisao    TEXT    NOT NULL DEFAULT 'Dividendo',
    mes        TEXT,
    ano        INTEGER,
    lancamento TEXT,
    categoria  TEXT,
    valor      REAL    NOT NULL,
    moeda      TEXT    NOT NULL DEFAULT 'BRL'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_proventos_user   ON meus_proventos(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_proventos_ticker ON meus_proventos(user_id, ticker)`,
  `CREATE INDEX IF NOT EXISTS idx_proventos_data   ON meus_proventos(user_id, data)`,

  // ── 4. RENDA_FIXA ─────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS renda_fixa (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    data    TEXT    NOT NULL,
    ticker  TEXT    NOT NULL,
    tipo    TEXT    NOT NULL,
    valor   REAL    NOT NULL,
    moeda   TEXT    NOT NULL DEFAULT 'BRL'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rf_user   ON renda_fixa(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rf_ticker ON renda_fixa(user_id, ticker)`,

  // ── 5. FIXA_ABERTA ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS fixa_aberta (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    ticker      TEXT    NOT NULL,
    valor_atual REAL    NOT NULL,
    data        TEXT,
    moeda       TEXT    NOT NULL DEFAULT 'BRL',
    tipo        TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_fixa_ab_user ON fixa_aberta(user_id)`,

  // ── 6. CAMBIO ─────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS cambio (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    data          TEXT    NOT NULL,
    moeda_origem  TEXT    NOT NULL DEFAULT 'BRL',
    moeda_destino TEXT    NOT NULL DEFAULT 'USD',
    valor_origem  REAL    NOT NULL,
    valor_destino REAL    NOT NULL,
    taxa          REAL,
    corretora     TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cambio_user ON cambio(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cambio_data ON cambio(user_id, data)`,

  // ── 7. DB_COTACOES (público, normalizado) ─────────────────────────────────
  `CREATE TABLE IF NOT EXISTS db_cotacoes (
    data   TEXT NOT NULL,
    ticker TEXT NOT NULL,
    preco  REAL NOT NULL,
    PRIMARY KEY (data, ticker)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cotacoes_ticker ON db_cotacoes(ticker, data)`,

  // ── 8. COMPOSICAO (público) ───────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS composicao (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    etf    TEXT NOT NULL,
    ticker TEXT NOT NULL,
    peso   REAL NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_comp_uk ON composicao(etf, ticker)`,

  // ── 9. P_TAX (público) ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS p_tax (
    data  TEXT NOT NULL,
    moeda TEXT NOT NULL DEFAULT 'USD',
    venda REAL NOT NULL,
    PRIMARY KEY (data, moeda)
  )`,

  // ── 10. LB_HISTORIC (por usuário, normalizado) ────────────────────────────
  `CREATE TABLE IF NOT EXISTS lb_historic (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    conta       TEXT    NOT NULL,
    ano         INTEGER NOT NULL,
    valor       REAL    NOT NULL,
    pessoa      TEXT,
    instituicao TEXT,
    tipo        TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_lbh_user ON lb_historic(user_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_lbh_uk ON lb_historic(user_id, conta, ano)`,

  // ── 11. FINANCAS_PESSOAL ──────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS financas_pessoal (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER NOT NULL REFERENCES users(id),
    categoria TEXT    NOT NULL,
    nome      TEXT    NOT NULL,
    valor     REAL    NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_fin_user ON financas_pessoal(user_id)`,

  // ── 12. FINANCAS_ASSINATURAS ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS financas_assinaturas (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    nome    TEXT    NOT NULL,
    valor   REAL    NOT NULL,
    dia     INTEGER,
    ativa   INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ass_user ON financas_assinaturas(user_id)`,

  // ── 13. FINANCAS_PARCELAMENTOS ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS financas_parcelamentos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    nome        TEXT    NOT NULL,
    valor_total REAL    NOT NULL,
    parcelas    INTEGER NOT NULL,
    data_compra TEXT    NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_parc_user ON financas_parcelamentos(user_id)`,

  // ── 14. SIMULACOES ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS simulacoes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    cenario    TEXT    NOT NULL,
    tipo       TEXT    NOT NULL,
    ticker     TEXT    NOT NULL,
    quantidade REAL    NOT NULL,
    preco      REAL    NOT NULL,
    moeda      TEXT    NOT NULL DEFAULT 'BRL',
    notas      TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sim_user    ON simulacoes(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sim_cenario ON simulacoes(user_id, cenario)`,
];

/** Lista das tabelas, para checagem de status / contagem de linhas. */
export const TABLE_NAMES = [
  "users", "meus_ativos", "meus_proventos", "renda_fixa", "fixa_aberta",
  "cambio", "db_cotacoes", "composicao", "p_tax", "lb_historic",
  "financas_pessoal", "financas_assinaturas", "financas_parcelamentos", "simulacoes",
] as const;

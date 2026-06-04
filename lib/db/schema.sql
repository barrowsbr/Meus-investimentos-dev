-- ============================================================
-- Meus Investimentos — Turso / LibSQL Schema
-- Migração de Google Sheets → SQLite (multi-user)
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ────────────────────────────────────────────────────────────
-- 1. USERS
-- ────────────────────────────────────────────────────────────
CREATE TABLE users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL UNIQUE,
  nome       TEXT,
  avatar_url TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────
-- 2. MEUS_ATIVOS — Transações de renda variável
-- ────────────────────────────────────────────────────────────
CREATE TABLE meus_ativos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id),
  data      TEXT    NOT NULL,                          -- ISO yyyy-mm-dd
  tipo      TEXT    NOT NULL CHECK (tipo IN ('compra','venda')),
  ticker    TEXT    NOT NULL,
  quantidade REAL   NOT NULL CHECK (quantidade > 0),
  preco     REAL    NOT NULL CHECK (preco >= 0),       -- preço unitário
  taxa      REAL    NOT NULL DEFAULT 0,                -- corretagem
  moeda     TEXT    NOT NULL DEFAULT 'BRL',
  corretora TEXT
);
CREATE INDEX idx_ativos_user       ON meus_ativos(user_id);
CREATE INDEX idx_ativos_ticker     ON meus_ativos(user_id, ticker);
CREATE INDEX idx_ativos_data       ON meus_ativos(user_id, data);

-- ────────────────────────────────────────────────────────────
-- 3. MEUS_PROVENTOS — Dividendos, JCP, Rendimentos
-- ────────────────────────────────────────────────────────────
CREATE TABLE meus_proventos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  ticker     TEXT    NOT NULL,
  data       TEXT    NOT NULL,
  decisao    TEXT    NOT NULL DEFAULT 'Dividendo',     -- 'Dividendo' | 'IMPOSTO'
  mes        TEXT,                                     -- 'jan/25', 'fev/25', …
  ano        INTEGER,
  lancamento TEXT,                                     -- 'Dividendo','JCP','Rendimento',…
  categoria  TEXT,
  valor      REAL    NOT NULL,                         -- negativo se IMPOSTO
  moeda      TEXT    NOT NULL DEFAULT 'BRL'
);
CREATE INDEX idx_proventos_user    ON meus_proventos(user_id);
CREATE INDEX idx_proventos_ticker  ON meus_proventos(user_id, ticker);
CREATE INDEX idx_proventos_data    ON meus_proventos(user_id, data);

-- ────────────────────────────────────────────────────────────
-- 4. RENDA_FIXA — Transações de renda fixa
-- ────────────────────────────────────────────────────────────
CREATE TABLE renda_fixa (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id),
  data      TEXT    NOT NULL,
  ticker    TEXT    NOT NULL,
  tipo      TEXT    NOT NULL CHECK (tipo IN ('compra','venda','imposto')),
  valor     REAL    NOT NULL CHECK (valor >= 0),
  moeda     TEXT    NOT NULL DEFAULT 'BRL'
);
CREATE INDEX idx_rf_user           ON renda_fixa(user_id);
CREATE INDEX idx_rf_ticker         ON renda_fixa(user_id, ticker);

-- ────────────────────────────────────────────────────────────
-- 5. FIXA_ABERTA — Snapshot de posições abertas de RF
-- ────────────────────────────────────────────────────────────
CREATE TABLE fixa_aberta (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  ticker      TEXT    NOT NULL,
  valor_atual REAL    NOT NULL,
  data        TEXT,                                    -- última atualização
  moeda       TEXT    NOT NULL DEFAULT 'BRL',
  tipo        TEXT                                     -- CDB, Tesouro, LCA, …
);
CREATE INDEX idx_fixa_ab_user      ON fixa_aberta(user_id);
CREATE UNIQUE INDEX idx_fixa_ab_uk ON fixa_aberta(user_id, ticker);

-- ────────────────────────────────────────────────────────────
-- 6. CAMBIO — Operações de câmbio
-- ────────────────────────────────────────────────────────────
CREATE TABLE cambio (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  data           TEXT    NOT NULL,
  moeda_origem   TEXT    NOT NULL DEFAULT 'BRL',
  moeda_destino  TEXT    NOT NULL DEFAULT 'USD',
  valor_origem   REAL    NOT NULL CHECK (valor_origem > 0),
  valor_destino  REAL    NOT NULL CHECK (valor_destino > 0),
  taxa           REAL,                                 -- VET (calculado se null)
  corretora      TEXT
);
CREATE INDEX idx_cambio_user       ON cambio(user_id);
CREATE INDEX idx_cambio_data       ON cambio(user_id, data);

-- ────────────────────────────────────────────────────────────
-- 7. DB_COTACOES — Cotações históricas (normalizado)
--    Na planilha é uma matriz larga (data × ticker).
--    No SQL, normalizamos para 1 linha por (data, ticker).
-- ────────────────────────────────────────────────────────────
CREATE TABLE db_cotacoes (
  data   TEXT NOT NULL,                                -- ISO yyyy-mm-dd
  ticker TEXT NOT NULL,                                -- PETR4, BRL=X, ^BVSP, …
  preco  REAL NOT NULL,
  PRIMARY KEY (data, ticker)
);
CREATE INDEX idx_cotacoes_ticker   ON db_cotacoes(ticker, data);

-- ────────────────────────────────────────────────────────────
-- 8. COMPOSICAO — Composição de ETFs / carteiras
-- ────────────────────────────────────────────────────────────
CREATE TABLE composicao (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  etf    TEXT NOT NULL,                                -- ETF pai (ex: IVVB11)
  ticker TEXT NOT NULL,                                -- ativo componente
  peso   REAL NOT NULL CHECK (peso >= 0 AND peso <= 100)
);
CREATE UNIQUE INDEX idx_comp_uk    ON composicao(etf, ticker);

-- ────────────────────────────────────────────────────────────
-- 9. P_TAX — Cotações PTAX (BCB)
-- ────────────────────────────────────────────────────────────
CREATE TABLE p_tax (
  data  TEXT NOT NULL,
  moeda TEXT NOT NULL DEFAULT 'USD',
  venda REAL NOT NULL,
  PRIMARY KEY (data, moeda)
);

-- ────────────────────────────────────────────────────────────
-- 10. LB_HISTORIC — Evolução patrimonial (normalizado)
--     Na planilha é uma matriz larga (conta × ano).
--     Aqui: 1 linha por (user, conta, ano).
-- ────────────────────────────────────────────────────────────
CREATE TABLE lb_historic (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  conta       TEXT    NOT NULL,                        -- "Nu Lucas", "XP Maria", …
  ano         INTEGER NOT NULL,
  valor       REAL    NOT NULL,
  pessoa      TEXT,                                    -- Lucas | Maria | —
  instituicao TEXT,                                    -- Nubank, XP, IBKR, …
  tipo        TEXT                                     -- Banco/Caixa, Investimentos BR, Exterior, Cripto
);
CREATE INDEX idx_lbh_user          ON lb_historic(user_id);
CREATE UNIQUE INDEX idx_lbh_uk     ON lb_historic(user_id, conta, ano);

-- ────────────────────────────────────────────────────────────
-- 11. FINANCAS_PESSOAL — Entradas, saídas, cartão
-- ────────────────────────────────────────────────────────────
CREATE TABLE financas_pessoal (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id),
  categoria TEXT    NOT NULL CHECK (categoria IN ('entrada','saida','cartao','poupanca')),
  nome      TEXT    NOT NULL,
  valor     REAL    NOT NULL
);
CREATE INDEX idx_fin_user          ON financas_pessoal(user_id);

-- ────────────────────────────────────────────────────────────
-- 12. FINANCAS_ASSINATURAS — Assinaturas recorrentes
-- ────────────────────────────────────────────────────────────
CREATE TABLE financas_assinaturas (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  nome    TEXT    NOT NULL,
  valor   REAL    NOT NULL,
  dia     INTEGER NOT NULL CHECK (dia >= 1 AND dia <= 31),
  ativa   INTEGER NOT NULL DEFAULT 1                   -- 0 = inativa, 1 = ativa
);
CREATE INDEX idx_ass_user          ON financas_assinaturas(user_id);

-- ────────────────────────────────────────────────────────────
-- 13. FINANCAS_PARCELAMENTOS — Compras parceladas
-- ────────────────────────────────────────────────────────────
CREATE TABLE financas_parcelamentos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  nome        TEXT    NOT NULL,
  valor_total REAL    NOT NULL CHECK (valor_total > 0),
  parcelas    INTEGER NOT NULL CHECK (parcelas > 0),
  data_compra TEXT    NOT NULL                          -- ISO yyyy-mm-dd
);
CREATE INDEX idx_parc_user         ON financas_parcelamentos(user_id);

-- ────────────────────────────────────────────────────────────
-- 14. SIMULACOES — Cenários de simulação
-- ────────────────────────────────────────────────────────────
CREATE TABLE simulacoes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  cenario    TEXT    NOT NULL,
  tipo       TEXT    NOT NULL CHECK (tipo IN ('compra','venda')),
  ticker     TEXT    NOT NULL,
  quantidade REAL    NOT NULL CHECK (quantidade > 0),
  preco      REAL    NOT NULL CHECK (preco >= 0),
  moeda      TEXT    NOT NULL DEFAULT 'BRL',
  notas      TEXT
);
CREATE INDEX idx_sim_user          ON simulacoes(user_id);
CREATE INDEX idx_sim_cenario       ON simulacoes(user_id, cenario);

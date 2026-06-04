/**
 * import.ts — Importa dados do Google Sheets → Turso (SQLite).
 *
 * Somente LEITURA do Google Sheets (via fetchTab) — não altera a planilha.
 * Idempotente: cada importador limpa e regrava as linhas do alvo, então pode
 * rodar várias vezes sem duplicar. Cada tabela é isolada em try/catch: uma aba
 * ausente ou com formato inesperado não interrompe as demais.
 */
import { getDb } from "@/lib/db/client";
import { fetchTab } from "@/lib/gsheets";
import { toNumber } from "@/lib/format";

type Row = Record<string, unknown>;
type InValue = string | number | null;

export interface TableReport { table: string; inserted: number; skipped: number; error?: string }
export interface ImportReport { user?: { id: number; email: string }; tables: TableReport[]; ranAt: string }

// ── Helpers de parsing ───────────────────────────────────────────────────────

function str(row: Row, keys: string[], def = ""): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return def;
}
function num(row: Row, keys: string[], def = 0): number {
  for (const k of keys) {
    const n = toNumber(row[k]);
    if (n !== null) return n;
  }
  return def;
}
function numOrNull(row: Row, keys: string[]): number | null {
  for (const k of keys) {
    const n = toNumber(row[k]);
    if (n !== null) return n;
  }
  return null;
}

function normalizeTipoAtivo(raw: string): "compra" | "venda" {
  const t = raw.toLowerCase();
  if (/(venda|sell|resgate|saida|saída)/.test(t)) return "venda";
  return "compra"; // compra, buy, aporte, entrada, subscri, bonif, …
}
function normalizeTipoRF(raw: string): "compra" | "venda" | "imposto" {
  const t = raw.toLowerCase();
  if (/imposto/.test(t)) return "imposto";
  if (/(venda|resgate|vencimento|saida|saída)/.test(t)) return "venda";
  return "compra";
}

// Insere em lotes (write batches) para reduzir round-trips.
async function insertBatch(sql: string, rows: InValue[][]): Promise<void> {
  if (rows.length === 0) return;
  const db = getDb();
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((args) => ({ sql, args }));
    await db.batch(chunk, "write");
  }
}

// ── Usuário ──────────────────────────────────────────────────────────────────

export async function ensureUser(email: string, nome?: string): Promise<number> {
  const db = getDb();
  await db.execute({
    sql: "INSERT INTO users (email, nome) VALUES (?, ?) ON CONFLICT(email) DO NOTHING",
    args: [email, nome ?? null],
  });
  const res = await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [email] });
  return Number(res.rows[0].id);
}

// ── Importadores por tabela ──────────────────────────────────────────────────

async function importMeusAtivos(userId: number): Promise<TableReport> {
  const rows = await fetchTab("meus_ativos");
  const out: InValue[][] = [];
  let skipped = 0;
  for (const r of rows) {
    const ticker = str(r, ["símbolo", "simbolo", "ticker", "symbol"]).toUpperCase();
    const data = str(r, ["data", "date", "compra"]);
    const qtd = Math.abs(num(r, ["quantidade", "qtd", "quantity"]));
    const preco = Math.abs(num(r, ["preço", "preco", "price"]));
    if (!ticker || !data || qtd <= 0) { skipped++; continue; }
    out.push([
      userId, data, normalizeTipoAtivo(str(r, ["tipo de transação", "tipo de transacao", "tipo_transacao", "tipo"])),
      ticker, qtd, preco,
      Math.abs(num(r, ["taxa de corretagem", "taxas", "taxa"])),
      str(r, ["moeda", "currency"], "BRL").toUpperCase(),
      str(r, ["corretora", "broker"]) || null,
    ]);
  }
  await getDb().execute({ sql: "DELETE FROM meus_ativos WHERE user_id = ?", args: [userId] });
  await insertBatch(
    "INSERT INTO meus_ativos (user_id, data, tipo, ticker, quantidade, preco, taxa, moeda, corretora) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    out,
  );
  return { table: "meus_ativos", inserted: out.length, skipped };
}

async function importMeusProventos(userId: number): Promise<TableReport> {
  const rows = await fetchTab("meus_proventos");
  const out: InValue[][] = [];
  let skipped = 0;
  for (const r of rows) {
    const ticker = str(r, ["ticker"]).toUpperCase();
    const data = str(r, ["data", "date", "pagamento"]);
    if (!ticker || !data) { skipped++; continue; }
    const decisao = str(r, ["decisao", "decisão"], "Dividendo");
    let valor = num(r, ["valor", "value", "liquido"]);
    if (/imposto/i.test(decisao)) valor = -Math.abs(valor);
    out.push([
      userId, ticker, data, decisao,
      str(r, ["mes", "mês"]) || null,
      numOrNull(r, ["ano"]),
      str(r, ["lancamento"]) || null,
      str(r, ["categoria"]) || null,
      valor,
      str(r, ["moeda"], "BRL").toUpperCase(),
    ]);
  }
  await getDb().execute({ sql: "DELETE FROM meus_proventos WHERE user_id = ?", args: [userId] });
  await insertBatch(
    "INSERT INTO meus_proventos (user_id, ticker, data, decisao, mes, ano, lancamento, categoria, valor, moeda) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    out,
  );
  return { table: "meus_proventos", inserted: out.length, skipped };
}

async function importRendaFixa(userId: number): Promise<TableReport> {
  const rows = await fetchTab("renda_fixa");
  const out: InValue[][] = [];
  let skipped = 0;
  for (const r of rows) {
    const ticker = str(r, ["ticker", "ativo", "papel"]);
    const data = str(r, ["compra", "data", "date"]);
    if (!ticker || !data) { skipped++; continue; }
    out.push([
      userId, data, ticker,
      normalizeTipoRF(str(r, ["tipo", "movimentacao"])),
      Math.abs(num(r, ["valor"])),
      str(r, ["moeda"], "BRL").toUpperCase(),
    ]);
  }
  await getDb().execute({ sql: "DELETE FROM renda_fixa WHERE user_id = ?", args: [userId] });
  await insertBatch(
    "INSERT INTO renda_fixa (user_id, data, ticker, tipo, valor, moeda) VALUES (?, ?, ?, ?, ?, ?)",
    out,
  );
  return { table: "renda_fixa", inserted: out.length, skipped };
}

async function importFixaAberta(userId: number): Promise<TableReport> {
  const rows = await fetchTab("fixa_aberta");
  const out: InValue[][] = [];
  let skipped = 0;
  for (const r of rows) {
    const ticker = str(r, ["ticker", "ativo"]);
    if (!ticker) { skipped++; continue; }
    out.push([
      userId, ticker,
      num(r, ["atual", "valor_atual", "saldo", "valor atual"]),
      str(r, ["data"]) || null,
      str(r, ["moeda"], "BRL").toUpperCase(),
      str(r, ["tipo"]) || null,
    ]);
  }
  await getDb().execute({ sql: "DELETE FROM fixa_aberta WHERE user_id = ?", args: [userId] });
  await insertBatch(
    "INSERT INTO fixa_aberta (user_id, ticker, valor_atual, data, moeda, tipo) VALUES (?, ?, ?, ?, ?, ?)",
    out,
  );
  return { table: "fixa_aberta", inserted: out.length, skipped };
}

async function importCambio(userId: number): Promise<TableReport> {
  const rows = await fetchTab("cambio");
  const out: InValue[][] = [];
  let skipped = 0;
  for (const r of rows) {
    const data = str(r, ["data", "date"]);
    const vOrig = Math.abs(num(r, ["valor_origem", "valor total entrada", "valor entrada", "valor_entrada", "valor enviado", "enviado", "brl"]));
    const vDest = Math.abs(num(r, ["valor_destino", "valor total saída", "valor total saida", "valor saída", "valor_saida", "valor saida", "valor recebido", "recebido", "usd"]));
    if (!data || vOrig <= 0 || vDest <= 0) { skipped++; continue; }
    out.push([
      userId, data,
      str(r, ["moeda_origem", "moeda origem", "de", "origem"], "BRL").toUpperCase(),
      str(r, ["moeda_destino", "moeda destino", "para", "destino"], "USD").toUpperCase(),
      vOrig, vDest,
      numOrNull(r, ["taxa", "vet", "câmbio", "cambio", "cotação", "cotacao", "rate"]),
      str(r, ["corretora", "corretora destino", "instituição", "instituicao", "banco"]) || null,
    ]);
  }
  await getDb().execute({ sql: "DELETE FROM cambio WHERE user_id = ?", args: [userId] });
  await insertBatch(
    "INSERT INTO cambio (user_id, data, moeda_origem, moeda_destino, valor_origem, valor_destino, taxa, corretora) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    out,
  );
  return { table: "cambio", inserted: out.length, skipped };
}

async function importSimulacoes(userId: number): Promise<TableReport> {
  const rows = await fetchTab("simulacoes");
  const out: InValue[][] = [];
  let skipped = 0;
  for (const r of rows) {
    const cenario = str(r, ["cenario"]);
    const ticker = str(r, ["ticker"]).toUpperCase();
    if (!cenario || !ticker) { skipped++; continue; }
    out.push([
      userId, cenario,
      normalizeTipoAtivo(str(r, ["tipo"])),
      ticker,
      Math.abs(num(r, ["quantidade"])),
      Math.abs(num(r, ["preco", "preço"])),
      str(r, ["moeda"], "BRL").toUpperCase(),
      str(r, ["notas"]) || null,
    ]);
  }
  await getDb().execute({ sql: "DELETE FROM simulacoes WHERE user_id = ?", args: [userId] });
  await insertBatch(
    "INSERT INTO simulacoes (user_id, cenario, tipo, ticker, quantidade, preco, moeda, notas) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    out,
  );
  return { table: "simulacoes", inserted: out.length, skipped };
}

async function importFinancasPessoal(userId: number): Promise<TableReport> {
  const rows = await fetchTab("financas_pessoal");
  const out: InValue[][] = [];
  let skipped = 0;
  for (const r of rows) {
    const categoria = str(r, ["categoria"]).toLowerCase();
    const nome = str(r, ["nome"]);
    if (!categoria || !nome) { skipped++; continue; }
    out.push([userId, categoria, nome, num(r, ["valor"])]);
  }
  await getDb().execute({ sql: "DELETE FROM financas_pessoal WHERE user_id = ?", args: [userId] });
  await insertBatch(
    "INSERT INTO financas_pessoal (user_id, categoria, nome, valor) VALUES (?, ?, ?, ?)",
    out,
  );
  return { table: "financas_pessoal", inserted: out.length, skipped };
}

async function importLbHistoric(userId: number): Promise<TableReport> {
  const rows = await fetchTab("lb_historic");
  const out: InValue[][] = [];
  let skipped = 0;
  for (const r of rows) {
    const keys = Object.keys(r);
    const yearKeys = keys.filter((k) => /^\d{4}$/.test(k));
    const nameKeys = keys.filter((k) => !/^\d{4}$/.test(k));
    const conta = nameKeys.map((k) => str(r, [k])).find((v) => v) ?? "";
    if (!conta || /^total/i.test(conta)) { skipped++; continue; }
    const lower = conta.toLowerCase();
    const pessoa = lower.includes("maria") ? "Maria" : lower.includes("lucas") ? "Lucas" : "—";
    const instituicao =
      lower.includes("picpay") ? "PicPay" : lower.includes("nu") ? "Nubank" :
      lower.includes("xp") ? "XP" : lower.includes("ibkr") ? "IBKR" :
      lower.includes("bitcoin") || lower.includes("cripto") ? "Bitcoin" : "Outros";
    const tipo =
      lower.includes("ibkr") || lower.includes("exterior") ? "Exterior" :
      lower.includes("bitcoin") || lower.includes("cripto") ? "Cripto" :
      lower.includes("xp") || lower.includes("invest") ? "Investimentos BR" : "Banco/Caixa";
    for (const yk of yearKeys) {
      const valor = toNumber(r[yk]);
      if (valor === null) continue;
      out.push([userId, conta, parseInt(yk, 10), valor, pessoa, instituicao, tipo]);
    }
  }
  await getDb().execute({ sql: "DELETE FROM lb_historic WHERE user_id = ?", args: [userId] });
  await insertBatch(
    "INSERT OR REPLACE INTO lb_historic (user_id, conta, ano, valor, pessoa, instituicao, tipo) VALUES (?, ?, ?, ?, ?, ?, ?)",
    out,
  );
  return { table: "lb_historic", inserted: out.length, skipped };
}

// ── Tabelas públicas (sem user_id) ───────────────────────────────────────────

async function importComposicao(): Promise<TableReport> {
  const rows = await fetchTab("composicao");
  const out: InValue[][] = [];
  let skipped = 0;
  for (const r of rows) {
    const etf = str(r, ["etf", "fundo", "carteira", "pai"]);
    const ticker = str(r, ["ativo", "ticker", "papel", "symbol"]).toUpperCase();
    const peso = num(r, ["peso", "percentual", "%", "pl", "part%", "part"]);
    if (!ticker || peso <= 0) { skipped++; continue; }
    out.push([etf || "—", ticker, peso]);
  }
  await getDb().execute({ sql: "DELETE FROM composicao", args: [] });
  await insertBatch("INSERT OR REPLACE INTO composicao (etf, ticker, peso) VALUES (?, ?, ?)", out);
  return { table: "composicao", inserted: out.length, skipped };
}

async function importPTax(): Promise<TableReport> {
  const rows = await fetchTab("p_tax");
  const out: InValue[][] = [];
  let skipped = 0;
  for (const r of rows) {
    const data = str(r, ["data", "date", "data cotação", "data cotacao"]);
    const venda = numOrNull(r, ["venda", "ptax_venda", "cotacao", "cotação", "valor", "ptax"]);
    if (!data || venda === null) { skipped++; continue; }
    out.push([data, str(r, ["moeda", "currency", "par"], "USD").toUpperCase(), venda]);
  }
  await getDb().execute({ sql: "DELETE FROM p_tax", args: [] });
  await insertBatch("INSERT OR REPLACE INTO p_tax (data, moeda, venda) VALUES (?, ?, ?)", out);
  return { table: "p_tax", inserted: out.length, skipped };
}

async function importDbCotacoes(): Promise<TableReport> {
  const rows = await fetchTab("db_cotacoes");
  const out: InValue[][] = [];
  let skipped = 0;
  for (const r of rows) {
    const data = str(r, ["data", "date"]);
    if (!data) { skipped++; continue; }
    for (const k of Object.keys(r)) {
      if (k === "data" || k === "date") continue;
      const preco = toNumber(r[k]);
      if (preco === null || preco <= 0) continue;
      out.push([data, k.toUpperCase(), preco]); // recupera caixa do ticker (BRL=X, ^BVSP, PETR4)
    }
  }
  await getDb().execute({ sql: "DELETE FROM db_cotacoes", args: [] });
  await insertBatch("INSERT OR REPLACE INTO db_cotacoes (data, ticker, preco) VALUES (?, ?, ?)", out);
  return { table: "db_cotacoes", inserted: out.length, skipped };
}

// ── Orquestrador ─────────────────────────────────────────────────────────────

const USER_IMPORTERS: Record<string, (userId: number) => Promise<TableReport>> = {
  meus_ativos: importMeusAtivos,
  meus_proventos: importMeusProventos,
  renda_fixa: importRendaFixa,
  fixa_aberta: importFixaAberta,
  cambio: importCambio,
  simulacoes: importSimulacoes,
  financas_pessoal: importFinancasPessoal,
  lb_historic: importLbHistoric,
};
const PUBLIC_IMPORTERS: Record<string, () => Promise<TableReport>> = {
  composicao: importComposicao,
  p_tax: importPTax,
  db_cotacoes: importDbCotacoes,
};

/** Conjunto padrão: tudo, menos db_cotacoes (pesado — importe à parte com ?tables=db_cotacoes). */
export const DEFAULT_TABLES = [
  ...Object.keys(USER_IMPORTERS),
  "composicao", "p_tax",
];

export async function runImport(opts: { email: string; nome?: string; tables: string[] }): Promise<ImportReport> {
  const userId = await ensureUser(opts.email, opts.nome);
  const reports: TableReport[] = [];

  for (const table of opts.tables) {
    try {
      if (USER_IMPORTERS[table]) {
        reports.push(await USER_IMPORTERS[table](userId));
      } else if (PUBLIC_IMPORTERS[table]) {
        reports.push(await PUBLIC_IMPORTERS[table]());
      } else {
        reports.push({ table, inserted: 0, skipped: 0, error: "importador não encontrado" });
      }
    } catch (e) {
      reports.push({ table, inserted: 0, skipped: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { user: { id: userId, email: opts.email }, tables: reports, ranAt: new Date().toISOString() };
}

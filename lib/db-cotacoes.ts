import { google } from "googleapis";
import { getServiceAccountAuth, resetSheetNamesCache, listSheetNames } from "./gsheets";
import { backupTab } from "./backup";

const SPREADSHEET_ID = process.env.SPREADSHEET_ID!;
const API_KEY = process.env.GOOGLE_API_KEY!;
const TAB = "db_cotacoes";

export interface GoldenSourceData {
  tickers: string[];
  dates: string[];
  prices: Record<string, Record<string, number>>;
}

const EMPTY: GoldenSourceData = { tickers: [], dates: [], prices: {} };

async function ensureTab(): Promise<void> {
  const names = await listSheetNames();
  if (names.includes(TAB)) return;
  const auth = getServiceAccountAuth();
  if (!auth) throw new Error("Escrita requer GOOGLE_SERVICE_ACCOUNT_JSON");
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
  });
  resetSheetNamesCache();
}

function normDate(s: unknown): string {
  if (typeof s === "number") {
    const d = new Date(Math.floor(s - 25569) * 86400000);
    return d.toISOString().split("T")[0];
  }
  const str = String(s ?? "");
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
}

export async function readGoldenSource(): Promise<GoldenSourceData> {
  const names = await listSheetNames();
  if (!names.includes(TAB)) return EMPTY;

  const sheets = google.sheets({ version: "v4", auth: API_KEY });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: TAB,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const rows = res.data.values;
  if (!rows || rows.length < 2) return EMPTY;

  const headers = rows[0].map((h: unknown) => String(h).trim());
  const tickers = headers.slice(1).map((t: string) => t.toUpperCase());

  const dates: string[] = [];
  const prices: Record<string, Record<string, number>> = {};

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const date = normDate(row[0]);
    if (!date) continue;
    dates.push(date);
    prices[date] = {};
    for (let j = 0; j < tickers.length; j++) {
      const val = row[j + 1];
      const num = typeof val === "number" ? val : (val != null && val !== "" ? Number(val) : NaN);
      if (isFinite(num)) {
        prices[date][tickers[j]] = num;
      }
    }
  }

  return { tickers, dates: dates.sort(), prices };
}

// Resultado de uma escrita na golden source — surfaceia o que aconteceu para
// o cron/relatório (anexou? recusou? regravou?).
export interface WriteResult {
  mode: "append" | "rewrite" | "refused" | "noop";
  reason?: string;
  appendedDates?: number;
  updatedRows?: number;
  before: { dates: number; points: number; tickers: number };
  after: { dates: number; points: number; tickers: number };
}

// Arredondamento de gravação — a aba guarda preços já arredondados. Usado tanto
// na formatação das linhas quanto na comparação do gate (mesma escala).
function roundPrice(p: number): number {
  return p >= 1000 ? Math.round(p * 100) / 100
       : p >= 1    ? Math.round(p * 10000) / 10000
       :             Math.round(p * 1000000) / 1000000;
}

function countPoints(d: GoldenSourceData): number {
  let n = 0;
  for (const date of d.dates) {
    const row = d.prices[date];
    if (!row) continue;
    for (const t of d.tickers) if (row[t] != null) n++;
  }
  return n;
}

// ── Gate de dupla verificação ─────────────────────────────────────────────────
// O que vamos gravar NUNCA pode encolher nem mutar o que já foi validado.
// Compara o snapshot vivo da aba (existing) com o próximo estado (next).
// Retorna {ok:false, reason} para ABORTAR a escrita e preservar o histórico —
// é exatamente a garantia contra "um glitch do Yahoo apaga tudo".
export function checkGoldenGuard(
  existing: GoldenSourceData,
  next: GoldenSourceData,
): { ok: boolean; reason?: string } {
  // 1. Nenhuma data existente pode sumir
  const nextDates = new Set(next.dates);
  for (const d of existing.dates) {
    if (!nextDates.has(d)) return { ok: false, reason: `data ${d} sumiria do histórico` };
  }
  // 2. Nenhum ticker existente pode sumir
  const nextTickers = new Set(next.tickers);
  for (const t of existing.tickers) {
    if (!nextTickers.has(t)) return { ok: false, reason: `ticker ${t} sumiria do histórico` };
  }
  // 3. Toda célula já validada deve ser preservada com o mesmo valor
  for (const date of existing.dates) {
    const exRow = existing.prices[date];
    if (!exRow) continue;
    const nextRow = next.prices[date] ?? {};
    for (const t of existing.tickers) {
      const ev = exRow[t];
      if (ev == null) continue;
      const nv = nextRow[t];
      if (nv == null) return { ok: false, reason: `valor existente ${t}@${date} seria apagado` };
      if (Math.abs(roundPrice(ev) - roundPrice(nv)) > 1e-6) {
        return { ok: false, reason: `valor existente ${t}@${date} mudaria de ${ev} para ${nv}` };
      }
    }
  }
  // 4. Total de pontos não pode diminuir (redundante com (3), mas barato)
  if (countPoints(next) < countPoints(existing)) {
    return { ok: false, reason: "total de pontos diminuiria" };
  }
  return { ok: true };
}

// Grava a golden source. Por padrão é INCREMENTAL: relê o estado vivo da aba,
// passa pelo gate, e só ANEXA os dias novos (sem limpar a aba) — preservando
// todo o histórico já validado. Rewrite total só acontece quando as colunas
// (tickers) mudam, quando há reordenação de datas, ou com `force:true`
// (endpoint de rebuild explícito).
export async function writeGoldenSource(
  data: GoldenSourceData,
  opts: { force?: boolean } = {},
): Promise<WriteResult> {
  await ensureTab();
  const auth = getServiceAccountAuth();
  if (!auth) throw new Error("Escrita requer GOOGLE_SERVICE_ACCOUNT_JSON");
  const sheets = google.sheets({ version: "v4", auth });

  // Segunda verificação: relê o estado VIVO da aba imediatamente antes de gravar.
  const existing = await readGoldenSource();
  const before = { dates: existing.dates.length, points: countPoints(existing), tickers: existing.tickers.length };
  const after = { dates: data.dates.length, points: countPoints(data), tickers: data.tickers.length };

  // ── GATE — recusa qualquer escrita que perderia/mutaria histórico ──
  if (!opts.force && existing.dates.length > 0) {
    const guard = checkGoldenGuard(existing, data);
    if (!guard.ok) {
      return { mode: "refused", reason: guard.reason, before, after };
    }
  }

  // Ordem canônica de colunas: FX/índices por último.
  const sortTickers = (ts: string[]) => [...ts].sort((a, b) => {
    const aSpecial = a.includes("=") || a.startsWith("^");
    const bSpecial = b.includes("=") || b.startsWith("^");
    if (aSpecial !== bSpecial) return aSpecial ? 1 : -1;
    return a.localeCompare(b);
  });

  const fmtRow = (date: string, cols: string[]): (string | number | null)[] =>
    [date, ...cols.map(t => {
      const p = data.prices[date]?.[t];
      return p == null ? null : roundPrice(p);
    })];

  // Pode ser incremental? Só se as colunas (tickers) não mudaram. Usamos a
  // ordem do header VIVO da aba (existing.tickers) para alinhar as células.
  const existingTickers = existing.tickers;
  const sameColumns =
    existing.dates.length > 0 &&
    existingTickers.length === data.tickers.length &&
    existingTickers.every(t => data.tickers.includes(t));

  const existingDateSet = new Set(existing.dates);
  const newDates = data.dates.filter(d => !existingDateSet.has(d)).sort();
  const lastExisting = existing.dates.length > 0 ? existing.dates[existing.dates.length - 1] : "";
  const allNewAtTail = newDates.every(d => d > lastExisting);

  // Linhas existentes que ganharam células (nulls preenchidos no merge) — poucas,
  // sempre na janela recente. Precisam de update pontual (não dá pra só anexar).
  const mutatedRows: { rowIndex: number; values: (string | number | null)[] }[] = [];
  if (sameColumns) {
    for (let i = 0; i < existing.dates.length; i++) {
      const date = existing.dates[i];
      const exRow = existing.prices[date] ?? {};
      let changed = false;
      for (const t of existingTickers) {
        if (exRow[t] == null && data.prices[date]?.[t] != null) { changed = true; break; }
      }
      if (changed) mutatedRows.push({ rowIndex: i + 2, values: fmtRow(date, existingTickers) });
    }
  }

  const canIncremental = !opts.force && sameColumns && allNewAtTail;

  // Backup best-effort antes de qualquer escrita.
  try { await backupTab(TAB); } catch { /* best-effort */ }

  if (canIncremental && (newDates.length > 0 || mutatedRows.length > 0)) {
    // 1. Atualiza as poucas linhas recentes que preencheram nulls.
    if (mutatedRows.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          valueInputOption: "RAW",
          data: mutatedRows.map(r => ({ range: `${TAB}!A${r.rowIndex}`, values: [r.values] })),
        },
      });
    }
    // 2. Anexa SÓ os dias novos no fim — NUNCA limpa a aba.
    if (newDates.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${TAB}!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: newDates.map(d => fmtRow(d, existingTickers)) },
      });
    }
    return { mode: "append", appendedDates: newDates.length, updatedRows: mutatedRows.length, before, after };
  }

  if (canIncremental && newDates.length === 0 && mutatedRows.length === 0) {
    return { mode: "noop", before, after };
  }

  // ── Rewrite total — colunas mudaram, força, ou datas fora de ordem.
  // O gate (acima) já garantiu que `data` é superset do que existia.
  const sorted = sortTickers(data.tickers);
  const values: (string | number | null)[][] = [["data", ...sorted]];
  for (const date of data.dates) values.push(fmtRow(date, sorted));

  try {
    await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: TAB });
  } catch { /* tab might be empty */ }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
  return { mode: "rewrite", appendedDates: newDates.length, before, after };
}

export function goldenSourceStatus(data: GoldenSourceData) {
  if (data.dates.length === 0) return { empty: true as const };
  let points = 0;
  for (const date of data.dates) {
    for (const t of data.tickers) {
      if (data.prices[date]?.[t] != null) points++;
    }
  }
  const total = data.dates.length * data.tickers.length;
  return {
    empty: false as const,
    firstDate: data.dates[0],
    lastDate: data.dates[data.dates.length - 1],
    tickerCount: data.tickers.length,
    dateCount: data.dates.length,
    points,
    gaps: total - points,
    coverage: total > 0 ? Math.round((points / total) * 1000) / 10 : 0,
  };
}

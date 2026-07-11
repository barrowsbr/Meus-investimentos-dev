import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { isDemoRequest, scaleRowsForTab } from "./demo";
import { activeSpreadsheetId } from "./user-sheet";

// Modo demonstração é somente leitura: bloqueia qualquer escrita em planilha
// para que a conta `test`/`test` jamais altere os dados reais do dono.
function assertNotDemo(): void {
  if (isDemoRequest()) throw new Error("Modo demonstração: escrita em planilha desabilitada");
}

// Planilha ativa POR REQUEST (multiusuário: conta extra logada → a planilha
// dela; dono/cron → SPREADSHEET_ID do env). Ver lib/user-sheet.ts.
const SPREADSHEET_ID = () => activeSpreadsheetId();
const API_KEY = process.env.GOOGLE_API_KEY!;

// ── Service account auth (required for writes) ────────────────────────────────
export function getServiceAccountAuth(): JWT | null {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) return null;
  try {
    const sa = JSON.parse(saJson);
    return new JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  } catch {
    return null;
  }
}

// Append rows to a sheet tab (requires service account write access)
export async function appendRows(tabName: string, rows: string[][]): Promise<void> {
  assertNotDemo();
  const auth = getServiceAccountAuth();
  if (!auth) throw new Error("Escrita requer GOOGLE_SERVICE_ACCOUNT_JSON nas variáveis de ambiente");
  const sheets = google.sheets({ version: "v4", auth });
  const resolved = await resolveTabName(tabName);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID(),
    range: resolved,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

// Append preservando TIPOS (valueInputOption RAW): números entram como número
// (sem parse de locale/vírgula), strings como texto. Usado pelo histórico
// patrimonial, onde `patrimonio_total`/`timestamp` precisam ser numéricos.
export async function appendRowsTyped(tabName: string, rows: (string | number)[][]): Promise<void> {
  assertNotDemo();
  const auth = getServiceAccountAuth();
  if (!auth) throw new Error("Escrita requer GOOGLE_SERVICE_ACCOUNT_JSON nas variáveis de ambiente");
  const sheets = google.sheets({ version: "v4", auth });
  const resolved = await resolveTabName(tabName);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID(),
    range: resolved,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

// Write/overwrite a full sheet tab (requires service account write access)
// Faz backup automático antes de sobrescrever. opts.raw grava com RAW (texto
// literal — nada é reinterpretado como data/número pelo locale da planilha).
export async function writeTab(tabName: string, headers: string[], rows: string[][], opts: { raw?: boolean } = {}): Promise<void> {
  assertNotDemo();
  const auth = getServiceAccountAuth();
  if (!auth) throw new Error("Escrita requer GOOGLE_SERVICE_ACCOUNT_JSON nas variáveis de ambiente");

  // Backup antes de destruir os dados
  try {
    const { backupTab: doBackup } = await import("./backup");
    await doBackup(tabName);
  } catch { /* backup falhou — prossegue com a escrita */ }

  const sheets = google.sheets({ version: "v4", auth });
  const resolved = await resolveTabName(tabName);
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID(),
    range: resolved,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID(),
    range: `${resolved}!A1`,
    valueInputOption: opts.raw ? "RAW" : "USER_ENTERED",
    requestBody: { values: [headers, ...rows] },
  });
}

// Atualiza células específicas (A1 relativo à aba) num único batch — para
// correções pontuais sem reescrever a aba inteira. Faz backup antes.
export async function updateCells(tabName: string, updates: { a1: string; value: string }[]): Promise<void> {
  assertNotDemo();
  const auth = getServiceAccountAuth();
  if (!auth) throw new Error("Escrita requer GOOGLE_SERVICE_ACCOUNT_JSON nas variáveis de ambiente");
  if (updates.length === 0) return;

  try {
    const { backupTab: doBackup } = await import("./backup");
    await doBackup(tabName);
  } catch { /* backup falhou — prossegue com a escrita */ }

  const sheets = google.sheets({ version: "v4", auth });
  const resolved = await resolveTabName(tabName);
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID(),
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: updates.map((u) => ({ range: `${resolved}!${u.a1}`, values: [[u.value]] })),
    },
  });
}

// Reescreve a linha 1 (cabeçalho) de uma aba existente. Necessário quando o
// schema ganha colunas novas: ensureTab não toca em abas que já existem, e
// fetchTab descarta colunas sem header — dados em colunas extras ficariam
// invisíveis na leitura.
export async function syncHeaders(tabName: string, headers: string[]): Promise<void> {
  assertNotDemo();
  const auth = getServiceAccountAuth();
  if (!auth) throw new Error("Escrita requer GOOGLE_SERVICE_ACCOUNT_JSON nas variáveis de ambiente");
  const sheets = google.sheets({ version: "v4", auth });
  const resolved = await resolveTabName(tabName);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID(),
    range: `${resolved}!1:1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers] },
  });
}

// Garante que uma aba exista; cria com a linha de cabeçalho se faltar.
// Requer service account. Retorna true se a aba foi criada agora.
export async function ensureTab(tabName: string, headers: string[]): Promise<boolean> {
  const names = await listSheetNames();
  const lower = tabName.toLowerCase().replace(/[_\s]/g, "");
  const exists = names.some(n => n.toLowerCase().replace(/[_\s]/g, "") === lower);
  if (exists) return false;
  assertNotDemo();
  const auth = getServiceAccountAuth();
  if (!auth) throw new Error(`Aba "${tabName}" não existe e a criação requer GOOGLE_SERVICE_ACCOUNT_JSON`);
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID(),
    requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID(),
    range: `${tabName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers] },
  });
  resetSheetNamesCache();
  return true;
}

function serialToDate(serial: number): string {
  const utcDays = Math.floor(serial - 25569);
  const d = new Date(utcDays * 86400 * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Cache POR PLANILHA — multiusuário: as abas da planilha da conta extra não
// podem vazar para a principal (e vice-versa).
const _sheetNamesCache = new Map<string, string[]>();

export function resetSheetNamesCache(): void {
  _sheetNamesCache.clear();
}

export async function listSheetNames(): Promise<string[]> {
  const sid = SPREADSHEET_ID();
  const hit = _sheetNamesCache.get(sid);
  if (hit) return hit;
  const sheets = google.sheets({ version: "v4", auth: API_KEY });
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: sid,
    fields: "sheets.properties.title",
  });
  const names = meta.data.sheets?.map((s) => s.properties?.title ?? "") ?? [];
  _sheetNamesCache.set(sid, names);
  return names;
}

async function resolveTabName(tabName: string): Promise<string> {
  const names = await listSheetNames();
  if (names.includes(tabName)) return tabName;
  const lower = tabName.toLowerCase().replace(/[_\s]/g, "");
  for (const name of names) {
    const norm = name.toLowerCase().replace(/[_\s]/g, "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (norm === lower) return name;
  }
  for (const name of names) {
    const norm = name.toLowerCase().replace(/[_\s]/g, "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (norm.includes(lower) || lower.includes(norm)) return name;
  }
  return tabName;
}

// Grade CRUA da aba (headers + linhas como matriz de strings), com os valores
// FORMATADOS — exatamente o que o dono vê no Google. Usada pelo editor de
// planilha em Configurações: o round-trip (ler formatado → gravar USER_ENTERED)
// preserva datas/números no locale da planilha, igual a editar no próprio Google.
export async function readTabRaw(tabName: string): Promise<{ headers: string[]; rows: string[][] }> {
  const sheets = google.sheets({ version: "v4", auth: API_KEY });
  const resolved = await resolveTabName(tabName);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID(),
    range: resolved,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const grid = (res.data.values ?? []) as unknown[][];
  if (grid.length === 0) return { headers: [], rows: [] };
  const width = Math.max(...grid.map((r) => r.length));
  const norm = (r: unknown[]) => Array.from({ length: width }, (_, i) => (r[i] == null ? "" : String(r[i])));
  return { headers: norm(grid[0]), rows: grid.slice(1).map(norm) };
}

export async function fetchTab(
  tabName: string
): Promise<Record<string, unknown>[]> {
  const sheets = google.sheets({ version: "v4", auth: API_KEY });
  const resolved = await resolveTabName(tabName);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID(),
    range: resolved,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const rows = res.data.values;
  if (!rows || rows.length < 2) return [];

  const headers: string[] = rows[0].map((h: unknown) =>
    String(h).trim().toLowerCase()
  );

  const parsed = rows.slice(1).map((row: unknown[]) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      let val = row[i] ?? null;
      if (typeof val === "number" && h.match(/data|compra|pagamento|date/)) {
        val = serialToDate(val as number);
      }
      obj[h] = val;
    });
    return obj;
  });

  // Modo demonstração: multiplica valores/quantidades por DEMO_FACTOR.
  return isDemoRequest() ? scaleRowsForTab(tabName, parsed) : parsed;
}

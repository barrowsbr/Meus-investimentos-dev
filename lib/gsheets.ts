import { google } from "googleapis";
import { JWT } from "google-auth-library";

const SPREADSHEET_ID = process.env.SPREADSHEET_ID!;
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
  const auth = getServiceAccountAuth();
  if (!auth) throw new Error("Escrita requer GOOGLE_SERVICE_ACCOUNT_JSON nas variáveis de ambiente");
  const sheets = google.sheets({ version: "v4", auth });
  const resolved = await resolveTabName(tabName);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: resolved,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });
}

// Write/overwrite a full sheet tab (requires service account write access)
export async function writeTab(tabName: string, headers: string[], rows: string[][]): Promise<void> {
  const auth = getServiceAccountAuth();
  if (!auth) throw new Error("Escrita requer GOOGLE_SERVICE_ACCOUNT_JSON nas variáveis de ambiente");
  const sheets = google.sheets({ version: "v4", auth });
  const resolved = await resolveTabName(tabName);
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: resolved,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${resolved}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers, ...rows] },
  });
}

// Garante que uma aba exista; cria com a linha de cabeçalho se faltar.
// Requer service account. Retorna true se a aba foi criada agora.
export async function ensureTab(tabName: string, headers: string[]): Promise<boolean> {
  const names = await listSheetNames();
  const lower = tabName.toLowerCase().replace(/[_\s]/g, "");
  const exists = names.some(n => n.toLowerCase().replace(/[_\s]/g, "") === lower);
  if (exists) return false;
  const auth = getServiceAccountAuth();
  if (!auth) throw new Error(`Aba "${tabName}" não existe e a criação requer GOOGLE_SERVICE_ACCOUNT_JSON`);
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
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

let _sheetNamesCache: string[] | null = null;

export function resetSheetNamesCache(): void {
  _sheetNamesCache = null;
}

export async function listSheetNames(): Promise<string[]> {
  if (_sheetNamesCache) return _sheetNamesCache;
  const sheets = google.sheets({ version: "v4", auth: API_KEY });
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets.properties.title",
  });
  _sheetNamesCache = meta.data.sheets?.map((s) => s.properties?.title ?? "") ?? [];
  return _sheetNamesCache;
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

export async function fetchTab(
  tabName: string
): Promise<Record<string, unknown>[]> {
  const sheets = google.sheets({ version: "v4", auth: API_KEY });
  const resolved = await resolveTabName(tabName);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: resolved,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const rows = res.data.values;
  if (!rows || rows.length < 2) return [];

  const headers: string[] = rows[0].map((h: unknown) =>
    String(h).trim().toLowerCase()
  );

  return rows.slice(1).map((row: unknown[]) => {
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
}

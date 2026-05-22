import { google } from "googleapis";

const SPREADSHEET_ID = process.env.SPREADSHEET_ID!;
const API_KEY = process.env.GOOGLE_API_KEY!;

function serialToDate(serial: number): string {
  const utcDays = Math.floor(serial - 25569);
  const d = new Date(utcDays * 86400 * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

let _sheetNamesCache: string[] | null = null;

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

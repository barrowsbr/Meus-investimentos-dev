import { google } from "googleapis";
import { getServiceAccountAuth, fetchTab, listSheetNames, resetSheetNamesCache } from "./gsheets";

const SPREADSHEET_ID = process.env.SPREADSHEET_ID!;
const MAX_BACKUPS_PER_TAB = 3;

function ts() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

export async function backupTab(tabName: string): Promise<{ backupName: string; rows: number }> {
  const auth = getServiceAccountAuth();
  if (!auth) throw new Error("Backup requer GOOGLE_SERVICE_ACCOUNT_JSON");

  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: tabName,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const data = res.data.values;
  if (!data || data.length === 0) return { backupName: "", rows: 0 };

  const backupName = `bkp_${tabName}_${ts()}`;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: backupName } } }] },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${backupName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: data },
  });

  resetSheetNamesCache();
  await pruneOldBackups(tabName, sheets);

  return { backupName, rows: data.length - 1 };
}

async function pruneOldBackups(
  tabName: string,
  sheets: ReturnType<typeof google.sheets>,
) {
  const names = await listSheetNames();
  const prefix = `bkp_${tabName}_`;
  const backups = names
    .filter(n => n.startsWith(prefix))
    .sort()
    .reverse();

  if (backups.length <= MAX_BACKUPS_PER_TAB) return;

  const toDelete = backups.slice(MAX_BACKUPS_PER_TAB);
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets.properties(sheetId,title)",
  });
  const sheetMap = new Map(
    meta.data.sheets?.map(s => [s.properties?.title ?? "", s.properties?.sheetId ?? 0]) ?? [],
  );

  const requests = toDelete
    .filter(name => sheetMap.has(name))
    .map(name => ({ deleteSheet: { sheetId: sheetMap.get(name)! } }));

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests },
    });
    resetSheetNamesCache();
  }
}

export function tabToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    const vals = headers.map(h => {
      const v = row[h];
      const s = v == null ? "" : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    });
    lines.push(vals.join(","));
  }
  return lines.join("\n");
}

export async function downloadTabCsv(tabName: string): Promise<string> {
  const rows = await fetchTab(tabName);
  return tabToCsv(rows);
}

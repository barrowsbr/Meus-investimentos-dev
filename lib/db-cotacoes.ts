import { google } from "googleapis";
import { getServiceAccountAuth, resetSheetNamesCache, listSheetNames } from "./gsheets";

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
      if (val != null && val !== "" && typeof val === "number" && isFinite(val)) {
        prices[date][tickers[j]] = val;
      }
    }
  }

  return { tickers, dates: dates.sort(), prices };
}

export async function writeGoldenSource(data: GoldenSourceData): Promise<void> {
  await ensureTab();
  const auth = getServiceAccountAuth();
  if (!auth) throw new Error("Escrita requer GOOGLE_SERVICE_ACCOUNT_JSON");
  const sheets = google.sheets({ version: "v4", auth });

  const sorted = [...data.tickers].sort((a, b) => {
    const aSpecial = a.includes("=") || a.startsWith("^");
    const bSpecial = b.includes("=") || b.startsWith("^");
    if (aSpecial !== bSpecial) return aSpecial ? 1 : -1;
    return a.localeCompare(b);
  });

  const values: (string | number | null)[][] = [["data", ...sorted]];
  for (const date of data.dates) {
    values.push([date, ...sorted.map(t => data.prices[date]?.[t] ?? null)]);
  }

  try {
    await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: TAB });
  } catch { /* tab might be empty */ }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
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

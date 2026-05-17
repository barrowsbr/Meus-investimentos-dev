import { google } from "googleapis";

const SPREADSHEET_NAME = "gdados";

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
}

let cachedSpreadsheetId: string | null = null;

async function getSpreadsheetId(): Promise<string> {
  if (process.env.SPREADSHEET_ID) return process.env.SPREADSHEET_ID;
  if (cachedSpreadsheetId) return cachedSpreadsheetId;

  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: `name='${SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: "files(id)",
    pageSize: 1,
  });

  const id = res.data.files?.[0]?.id;
  if (!id) throw new Error(`Planilha '${SPREADSHEET_NAME}' não encontrada`);

  cachedSpreadsheetId = id;
  return id;
}

function serialToDate(serial: number): string {
  const utcDays = Math.floor(serial - 25569);
  const d = new Date(utcDays * 86400 * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function fetchTab(
  tabName: string
): Promise<Record<string, unknown>[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = await getSpreadsheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: tabName,
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

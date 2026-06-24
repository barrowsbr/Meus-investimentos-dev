import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getDataStore } from "@/lib/data-store";
import { getServiceAccountAuth } from "@/lib/gsheets";

export const dynamic = "force-dynamic";

const SPREADSHEET_ID = process.env.SPREADSHEET_ID!;
const CONFIG_TAB = "config";
const KEY = "fundo";
const DEFAULT_BG = "/midias/home-bg.jpeg";

export async function GET() {
  try {
    const store = getDataStore();
    const rows = await store.fetchTab(CONFIG_TAB);
    const row = rows.find(
      (r) => String(r.chave ?? "").toLowerCase() === KEY
    );
    // `saved` distingue valor persistido de fallback: o cliente só sobrescreve
    // a escolha local quando o servidor TEM um valor salvo de verdade.
    if (row && String(row.valor ?? "").trim()) {
      return NextResponse.json({ background: String(row.valor), saved: true });
    }
    return NextResponse.json({ background: DEFAULT_BG, saved: false });
  } catch {
    return NextResponse.json({ background: DEFAULT_BG, saved: false });
  }
}

export async function POST(request: Request) {
  try {
    const { path } = await request.json();
    if (typeof path !== "string") {
      return NextResponse.json({ error: "path required" }, { status: 400 });
    }

    const auth = getServiceAccountAuth();
    if (!auth) {
      return NextResponse.json(
        { error: "Escrita requer GOOGLE_SERVICE_ACCOUNT_JSON" },
        { status: 500 }
      );
    }

    // A aba config não existia na planilha — o append falhava silenciosamente
    // e o fundo "resetava" a cada visita. Cria se faltar.
    const store = getDataStore();
    await store.ensureTab(CONFIG_TAB, ["chave", "valor"]);

    const sheets = google.sheets({ version: "v4", auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${CONFIG_TAB}!A:B`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const values = res.data.values ?? [];

    let rowIdx = -1;
    for (let i = 0; i < values.length; i++) {
      if (String(values[i]?.[0] ?? "").toLowerCase() === KEY) {
        rowIdx = i;
        break;
      }
    }

    if (rowIdx >= 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${CONFIG_TAB}!B${rowIdx + 1}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[path]] },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: CONFIG_TAB,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[KEY, path]] },
      });
    }

    return NextResponse.json({ ok: true, background: path });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

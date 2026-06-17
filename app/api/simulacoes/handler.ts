import { NextResponse } from "next/server";
import { google } from "googleapis";
import {
  fetchTab,
  getServiceAccountAuth,
  listSheetNames,
  resetSheetNamesCache,
} from "@/lib/gsheets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SPREADSHEET_ID = process.env.SPREADSHEET_ID!;
const TAB = "simulacoes";
const HEADERS = ["cenario", "tipo", "ticker", "quantidade", "preco", "moeda", "notas"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getAuthSheets() {
  const auth = getServiceAccountAuth();
  if (!auth) throw new Error("Escrita requer GOOGLE_SERVICE_ACCOUNT_JSON");
  return google.sheets({ version: "v4", auth });
}

async function ensureTab(): Promise<void> {
  const names = await listSheetNames();
  if (names.includes(TAB)) return;
  const sheets = getAuthSheets();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
  });
  resetSheetNamesCache();
  // Write header row
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [HEADERS] },
  });
}

// ── GET — read all scenarios grouped by cenario ──────────────────────────────

export async function GET() {
  try {
    const rows = await fetchTab(TAB);
    const cenarios: Record<string, Record<string, unknown>[]> = {};
    for (const row of rows) {
      const name = String(row.cenario ?? "").trim();
      if (!name) continue;
      (cenarios[name] ??= []).push(row);
    }
    return NextResponse.json({ cenarios });
  } catch {
    return NextResponse.json({ cenarios: {} });
  }
}

// ── POST — save scenario (replace if exists, then append new rows) ──────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const cenario = String(body.cenario ?? "").trim();
    const operacoes: unknown[] = body.operacoes;

    if (!cenario || !Array.isArray(operacoes) || operacoes.length === 0) {
      return NextResponse.json(
        { error: "Campos obrigatórios: cenario (string) e operacoes (array não vazio)" },
        { status: 400 },
      );
    }

    await ensureTab();
    const sheets = getAuthSheets();

    const newRows = operacoes.map((op) => {
      const o = op as Record<string, unknown>;
      return [
        cenario,
        String(o.tipo ?? ""),
        String(o.ticker ?? ""),
        o.quantidade ?? "",
        o.preco ?? "",
        String(o.moeda ?? "BRL"),
        String(o.notas ?? ""),
      ];
    });

    // Read existing data to remove old rows for this scenario
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: TAB,
      valueRenderOption: "UNFORMATTED_VALUE",
    });

    const allRows = res.data.values;
    if (allRows && allRows.length >= 2) {
      const header = allRows[0];
      const cenarioIdx = header.findIndex(
        (h: unknown) => String(h).trim().toLowerCase() === "cenario",
      );

      // Keep rows from OTHER scenarios, drop rows from THIS scenario
      const kept = cenarioIdx >= 0
        ? allRows.slice(1).filter(
            (row) => String(row[cenarioIdx] ?? "").trim() !== cenario,
          )
        : allRows.slice(1);

      // Clear and rewrite: header + kept rows + new rows
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: TAB,
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${TAB}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [header, ...kept, ...newRows] },
      });
    } else {
      // No existing data or only header — just append
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: TAB,
        valueInputOption: "RAW",
        requestBody: { values: newRows },
      });
    }

    return NextResponse.json({ ok: true, saved: newRows.length });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE — remove all rows for a given cenario ─────────────────────────────

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const cenario = (searchParams.get("cenario") ?? "").trim();

    if (!cenario) {
      return NextResponse.json(
        { error: "Query param 'cenario' é obrigatório" },
        { status: 400 },
      );
    }

    await ensureTab();
    const sheets = getAuthSheets();

    // Read all current data
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: TAB,
      valueRenderOption: "UNFORMATTED_VALUE",
    });

    const allRows = res.data.values;
    if (!allRows || allRows.length < 2) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    const header = allRows[0];
    const cenarioIdx = header.findIndex(
      (h: unknown) => String(h).trim().toLowerCase() === "cenario",
    );
    if (cenarioIdx === -1) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    const kept = allRows.slice(1).filter(
      (row) => String(row[cenarioIdx] ?? "").trim() !== cenario,
    );
    const deleted = allRows.length - 1 - kept.length;

    // Clear and rewrite
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: TAB,
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TAB}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [header, ...kept] },
    });

    return NextResponse.json({ ok: true, deleted });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getDataStore } from "@/lib/data-store";
import { getServiceAccountAuth } from "@/lib/gsheets";
import { REBALANCE_TAB, REBALANCE_HEADERS, type RebalanceMeta } from "@/lib/rebalance";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const SPREADSHEET_ID = process.env.SPREADSHEET_ID!;

function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// GET — lê as metas de alocação salvas na aba `rebalanceamento`.
export async function GET() {
  try {
    const store = getDataStore();
    let rows: Record<string, unknown>[] = [];
    try { rows = await store.fetchTab(REBALANCE_TAB); } catch { /* aba ainda não existe */ }
    const metas: RebalanceMeta[] = rows
      .map((r) => ({
        classe: String(r["classe"] ?? "").trim(),
        pesoAlvoPct: num(r["peso_alvo_pct"] ?? r["peso_alvo"] ?? r["alvo"]),
        bandaPct: num(r["banda_pct"] ?? r["banda"]) || 5,
      }))
      .filter((m) => m.classe && m.pesoAlvoPct >= 0);
    return NextResponse.json({ metas });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// POST — salva o conjunto COMPLETO de metas (reescrita idempotente da aba).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const metas: RebalanceMeta[] = Array.isArray(body?.metas) ? body.metas : [];

    const auth = getServiceAccountAuth();
    if (!auth) return NextResponse.json({ error: "Escrita requer GOOGLE_SERVICE_ACCOUNT_JSON" }, { status: 500 });
    const sheets = google.sheets({ version: "v4", auth });

    // Cria a aba se não existir (SA não cria via API values → tenta batchUpdate).
    try {
      const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
      const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === REBALANCE_TAB);
      if (!exists) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: { requests: [{ addSheet: { properties: { title: REBALANCE_TAB } } }] },
        });
      }
    } catch { /* best-effort — se falhar, o update abaixo tenta mesmo assim */ }

    const clean = metas
      .filter((m) => m && String(m.classe).trim() && Number(m.pesoAlvoPct) >= 0)
      .map((m) => [String(m.classe).trim(), String(Number(m.pesoAlvoPct) || 0), String(Number(m.bandaPct) || 5)]);

    await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: REBALANCE_TAB });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${REBALANCE_TAB}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[...REBALANCE_HEADERS], ...clean] },
    });

    return NextResponse.json({ ok: true, saved: clean.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

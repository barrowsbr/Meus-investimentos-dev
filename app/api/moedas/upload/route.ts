// Upload da coleção de moedas — recebe o CSV exportado pelo CoinSnap e
// SOBRESCREVE a aba `moedas_colecao` (writeTab faz backup automático antes).
// A página /moedas lê a aba, então o upload atualiza a coleção na hora.

import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { writeTab } from "@/lib/gsheets";
import { isDemoRequest } from "@/lib/demo";
import { MOEDAS_TAB, MOEDAS_HEADERS, parseCoinSnapCsv } from "@/lib/moedas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (isDemoRequest()) return NextResponse.json({ error: "Indisponível no modo demonstração" }, { status: 403 });
  let body: { csv?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  if (!body.csv || typeof body.csv !== "string") {
    return NextResponse.json({ error: "Campo csv obrigatório" }, { status: 400 });
  }
  try {
    const rows = parseCoinSnapCsv(body.csv);
    if (rows.length === 0) return NextResponse.json({ error: "Nenhuma moeda encontrada no CSV" }, { status: 400 });
    const store = getDataStore();
    await store.ensureTab(MOEDAS_TAB, MOEDAS_HEADERS);
    // RAW: URLs e códigos KM# ficam texto puro (imune ao locale da planilha).
    await writeTab(MOEDAS_TAB, MOEDAS_HEADERS, rows, { raw: true });
    return NextResponse.json({ ok: true, moedas: rows.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao importar CSV" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Anotações/rascunhos vinculados a um ativo. Persistidas na aba `ativos_notas`.
// Escrita herda assertNotDemo (via store) e backup automático (writeTab).
const TAB = "ativos_notas";
const HEADERS = ["id", "ticker", "data", "texto"];

interface Nota {
  id: string;
  ticker: string;
  data: string;
  texto: string;
}

function rowToNota(r: Record<string, unknown>): Nota {
  return {
    id: String(r["id"] ?? ""),
    ticker: String(r["ticker"] ?? "").toUpperCase(),
    data: String(r["data"] ?? ""),
    texto: String(r["texto"] ?? ""),
  };
}

function genId(): string {
  return `nota-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ── GET — lista notas (todas ou filtradas por ?ticker=X), mais recentes primeiro ──
export async function GET(req: Request) {
  try {
    const store = getDataStore();
    const ticker = new URL(req.url).searchParams.get("ticker")?.trim().toUpperCase();

    const rows = await store.fetchTab(TAB).catch(() => []);
    let notas = rows.map(rowToNota).filter((n) => n.id && n.texto);
    if (ticker) notas = notas.filter((n) => n.ticker === ticker);
    notas.sort((a, b) => (b.data || "").localeCompare(a.data || ""));

    return NextResponse.json(notas);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// ── POST — cria nota { ticker, texto } ──
export async function POST(req: Request) {
  try {
    const store = getDataStore();
    const body = await req.json().catch(() => ({}));
    const ticker = String(body.ticker ?? "").trim().toUpperCase();
    const texto = String(body.texto ?? "").trim();

    if (!ticker) return NextResponse.json({ error: "ticker é obrigatório" }, { status: 400 });
    if (!texto) return NextResponse.json({ error: "texto é obrigatório" }, { status: 400 });
    if (texto.length > 5000) return NextResponse.json({ error: "texto muito longo (máx 5000)" }, { status: 400 });

    await store.ensureTab(TAB, HEADERS);

    const nota: Nota = {
      id: genId(),
      ticker,
      // timestamp ISO completo (data + hora) para ordenar e exibir
      data: new Date().toISOString(),
      texto,
    };
    await store.appendRows(TAB, [[nota.id, nota.ticker, nota.data, nota.texto]]);

    return NextResponse.json({ ok: true, nota });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// ── DELETE — remove nota por { id } (read + filter + reescrita com backup) ──
export async function DELETE(req: Request) {
  try {
    const store = getDataStore();
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

    const rows = await store.fetchTab(TAB).catch(() => []);
    const all = rows.map(rowToNota).filter((n) => n.id);
    const kept = all.filter((n) => n.id !== id);

    if (kept.length === all.length) {
      // nada foi removido — id inexistente
      return NextResponse.json({ error: "nota não encontrada" }, { status: 404 });
    }

    const dataRows = kept.map((n) => [n.id, n.ticker, n.data, n.texto]);
    await store.writeTab(TAB, HEADERS, dataRows);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

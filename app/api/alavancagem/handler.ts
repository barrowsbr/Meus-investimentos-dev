import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import {
  MARGIN_TAB, MARGIN_HEADERS, BENCHMARK_POR_MOEDA,
  parseMarginRows, entryToRow, fetchBenchmarks, computeMarginResumo, mergeIbkrMargin,
  type MarginEntry,
} from "@/lib/margin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// FX moeda→BRL para as moedas de empréstimo (fonte aberta, sem chave).
async function fetchFxBRL(): Promise<Record<string, number>> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(8000), next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const rates: Record<string, number> = data.rates ?? {};
    const brl = rates["BRL"];
    if (!brl) throw new Error();
    const out: Record<string, number> = { USD: brl, BRL: 1 };
    for (const m of Object.keys(BENCHMARK_POR_MOEDA)) {
      if (m === "USD" || m === "BRL") continue;
      if (rates[m]) out[m] = brl / rates[m];
    }
    return out;
  } catch {
    return { BRL: 1, USD: 5.7, EUR: 6.4, CHF: 6.9, JPY: 0.038, GBP: 7.6, CAD: 4.1 };
  }
}

async function loadEntries(): Promise<MarginEntry[]> {
  const store = getDataStore();
  const rows = await store.fetchTab(MARGIN_TAB).catch(() => []);
  return parseMarginRows(rows);
}

// GET — entradas + métricas + benchmarks atuais + fx
export async function GET() {
  try {
    const [initialEntries, benchmarks, fx] = await Promise.all([
      loadEntries(), fetchBenchmarks(), fetchFxBRL(),
    ]);
    let entries = initialEntries;
    try {
      const token = process.env.IBKR_FLEX_TOKEN;
      const queryId = process.env.IBKR_FLEX_QUERY_ID;
      if (token && queryId) {
        const { getFlexXmlCached, parseFlexXml } = await import("@/lib/ibkr-flex");
        const xml = await getFlexXmlCached(token, queryId, 1800000);
        const ibkrMargin = parseFlexXml(xml).marginBalances;
        if (ibkrMargin.length > 0) entries = mergeIbkrMargin(entries, ibkrMargin);
      }
    } catch (e) {
      console.error("Erro ao buscar margem IBKR:", e);
    }

    const resumo = computeMarginResumo(entries, fx, benchmarks);
    return NextResponse.json({
      ...resumo,
      benchmarks,
      benchmarkPorMoeda: BENCHMARK_POR_MOEDA,
      fx,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — registra nova margem { data, corretora, moeda, valor, spread, taxaBenchmark?, obs? }
export async function POST(req: Request) {
  try {
    const store = getDataStore();
    const body = await req.json();
    const moeda = String(body.moeda ?? "USD").toUpperCase().trim();
    const valor = Math.abs(Number(body.valor) || 0);
    if (valor <= 0) return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
    const bench = BENCHMARK_POR_MOEDA[moeda];
    if (!bench) return NextResponse.json({ error: `Moeda ${moeda} não suportada` }, { status: 400 });

    const entry: MarginEntry = {
      id: `mg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      data: String(body.data ?? new Date().toISOString().slice(0, 10)).slice(0, 10),
      corretora: String(body.corretora ?? "IBKR").trim() || "IBKR",
      moeda,
      valor,
      benchmark: bench.code,
      taxaBenchmark: Math.abs(Number(body.taxaBenchmark) || 0),
      spread: Math.abs(Number(body.spread) || 0),
      status: "aberta",
      dataFechamento: "",
      valorFechamento: 0,
      obs: String(body.obs ?? "").trim(),
    };

    const created = await store.ensureTab(MARGIN_TAB, MARGIN_HEADERS);
    await store.appendRows(MARGIN_TAB, [entryToRow(entry)]);
    return NextResponse.json({ ok: true, entry, tabCriada: created });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH — fecha uma margem { id, valorFechamento?, dataFechamento? }
// Fechada NÃO é apagada: fica registrada na aba com status "fechada".
export async function PATCH(req: Request) {
  try {
    const store = getDataStore();
    const body = await req.json();
    const id = String(body.id ?? "");
    const entries = await loadEntries();
    const idx = entries.findIndex(e => e.id === id);
    if (idx < 0) return NextResponse.json({ error: "Entrada não encontrada" }, { status: 404 });

    entries[idx] = {
      ...entries[idx],
      status: "fechada",
      dataFechamento: String(body.dataFechamento ?? new Date().toISOString().slice(0, 10)).slice(0, 10),
      valorFechamento: Math.abs(Number(body.valorFechamento) || 0),
    };
    await store.writeTab(MARGIN_TAB, MARGIN_HEADERS, entries.map(entryToRow));
    return NextResponse.json({ ok: true, entry: entries[idx] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE — lixeira: remove a linha da planilha definitivamente { id }
export async function DELETE(req: Request) {
  try {
    const store = getDataStore();
    const body = await req.json();
    const id = String(body.id ?? "");
    const entries = await loadEntries();
    const restantes = entries.filter(e => e.id !== id);
    if (restantes.length === entries.length) {
      return NextResponse.json({ error: "Entrada não encontrada" }, { status: 404 });
    }
    await store.writeTab(MARGIN_TAB, MARGIN_HEADERS, restantes.map(entryToRow));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

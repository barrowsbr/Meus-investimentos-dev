import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { buildMultiCurrencyPtaxDetalhado } from "@/lib/ptax";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── PTAX oficial na data de cada remessa (fase 2 da página Câmbio) ───────────
// Para cada operação da aba `cambio`, devolve a taxa OFICIAL do BC no dia, na
// MESMA unidade do VET da operação: BRL→X usa a PTAX de X; USD→X usa o cross
// ptax(X)/ptax(USD). Com isso a UI mostra o custo real de spread+IOF de cada
// remessa ("você pagou 0,9% acima da taxa oficial"). Só leitura; cache 24h —
// PTAX passada é imutável.

interface PayloadPtaxRemessas {
  // chave: `${dataISO}|${origem}|${destino}` → taxa oficial na unidade do VET
  porChave: Record<string, number>;
  avisos: string[];
  geradoEm: string;
}

let cache: { at: number; payload: PayloadPtaxRemessas } | null = null;
const CACHE_MS = 24 * 60 * 60 * 1000;

function toISO(v: unknown): string {
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return "";
}

const fz = (row: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  const rKeys = Object.keys(row);
  for (const p of keys) {
    const norm = p.replace(/[_\s]/g, "").toLowerCase();
    for (const k of rKeys) {
      if (k.replace(/[_\s]/g, "").toLowerCase() === norm && row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
    }
  }
  return null;
};

export async function GET(): Promise<NextResponse> {
  try {
    if (cache && Date.now() - cache.at < CACHE_MS) {
      return NextResponse.json(cache.payload, { headers: { "Cache-Control": "s-maxage=21600" } });
    }

    const store = getDataStore();
    const [remessas, ptaxRows] = await Promise.all([
      store.fetchTab("cambio"),
      store.fetchTab("p_tax").catch(() => []),
    ]);

    // Moedas envolvidas (origem e destino, exceto BRL).
    const moedas = new Set<string>();
    const ops: Array<{ data: string; orig: string; dest: string }> = [];
    for (const r of remessas) {
      const data = toISO(r["data"]);
      const orig = String(fz(r, "moeda_origem", "moeda origem", "de", "origem") ?? "BRL").toUpperCase();
      const dest = String(fz(r, "moeda_destino", "moeda destino", "para", "destino") ?? "USD").toUpperCase();
      if (!data || dest === "BRL") continue;
      if (orig !== "BRL") moedas.add(orig);
      moedas.add(dest);
      ops.push({ data, orig, dest });
    }

    const { ptax, avisos } = await buildMultiCurrencyPtaxDetalhado(ptaxRows, [...moedas]);

    const porChave: Record<string, number> = {};
    for (const op of ops) {
      const pDest = ptax(op.dest, op.data);           // BRL por unidade de destino
      const pOrig = op.orig === "BRL" ? 1 : ptax(op.orig, op.data); // BRL por unidade de origem
      if (pDest > 0 && pOrig > 0) {
        // Unidade do VET: origem por destino (ex.: R$/USD, USD/EUR).
        porChave[`${op.data}|${op.orig}|${op.dest}`] = pDest / pOrig;
      }
    }

    const payload: PayloadPtaxRemessas = { porChave, avisos, geradoEm: new Date().toISOString() };
    cache = { at: Date.now(), payload };
    return NextResponse.json(payload, { headers: { "Cache-Control": "s-maxage=21600" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

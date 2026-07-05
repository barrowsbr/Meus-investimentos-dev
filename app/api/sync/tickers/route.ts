import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { updateCells } from "@/lib/gsheets";
import {
  loadAssetMetaCache,
  resolveAssetMeta,
  persistAssetMeta,
  sheetTickerFromMeta,
  type AssetMeta,
} from "@/lib/asset-meta";
import { cacheKey } from "@/lib/asset-meta-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Verificador de tickers × Yahoo ────────────────────────────────────────────
// GET  → audita meus_ativos + meus_proventos: para cada ticker distinto, resolve
//        a grafia Yahoo e classifica (ok / ajuste sugerido / não encontrado).
// POST → { de, para }: valida `para` no Yahoo e corrige TODAS as ocorrências nas
//        duas abas via updateCells (cirúrgico, com backup automático), gravando
//        o metadado em ativos_meta para os próximos syncs.

const TICKER_ALIASES = new Set(["simbolo", "símbolo", "ticker", "symbol", "ativo", "papel"]);

function normKey(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_\s]/g, "").trim();
}

function findTickerKey(row: Record<string, unknown>): string | null {
  for (const k of Object.keys(row)) {
    if (TICKER_ALIASES.has(normKey(k))) return k;
  }
  return null;
}

function colLetter(idx: number): string {
  let s = "";
  let n = idx;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

// Nome livre (RF manual, caixa) — não é símbolo de mercado, não audita.
function isFreeName(t: string): boolean {
  return /\s/.test(t.trim()) || t.trim().length > 12;
}

interface Occurrence { ativos: number; proventos: number; moeda: string }

async function collectTickers(): Promise<Map<string, Occurrence>> {
  const store = getDataStore();
  const [ativos, proventos] = await Promise.all([
    store.fetchTab("meus_ativos").catch(() => []),
    store.fetchTab("meus_proventos").catch(() => []),
  ]);
  const map = new Map<string, Occurrence>();
  const note = (raw: unknown, tab: "ativos" | "proventos", moeda: string) => {
    const t = String(raw ?? "").trim();
    if (!t) return;
    const key = t.toUpperCase();
    const occ = map.get(key) ?? { ativos: 0, proventos: 0, moeda };
    occ[tab]++;
    if (!occ.moeda && moeda) occ.moeda = moeda;
    map.set(key, occ);
  };
  for (const row of ativos) {
    const k = findTickerKey(row);
    if (k) note(row[k], "ativos", String(row["moeda"] ?? "").toUpperCase().trim());
  }
  for (const row of proventos) {
    const k = findTickerKey(row);
    if (k) note(row[k], "proventos", String(row["moeda"] ?? "").toUpperCase().trim());
  }
  return map;
}

export async function GET(): Promise<NextResponse> {
  try {
    await loadAssetMetaCache();
    const tickers = await collectTickers();

    const ok: { ticker: string; nome: string }[] = [];
    const ajustes: { ticker: string; sugestao: string; nome: string; exchange: string; ocorrencias: Occurrence }[] = [];
    const desconhecidos: { ticker: string; ocorrencias: Occurrence }[] = [];
    const ignorados: string[] = [];

    const entries = [...tickers.entries()];
    const BATCH = 4;
    for (let i = 0; i < entries.length; i += BATCH) {
      await Promise.all(entries.slice(i, i + BATCH).map(async ([ticker, occ]) => {
        if (isFreeName(ticker)) { ignorados.push(ticker); return; }
        try {
          const corretora = occ.moeda === "BRL" || occ.moeda === "" ? "B3" : "IBKR";
          const meta = await resolveAssetMeta(ticker, { moeda: occ.moeda || undefined, corretora });
          if (!meta?.yahooSymbol) { desconhecidos.push({ ticker, ocorrencias: occ }); return; }
          const canonical = sheetTickerFromMeta(meta);
          if (canonical === ticker) ok.push({ ticker, nome: meta.longName });
          else ajustes.push({ ticker, sugestao: canonical, nome: meta.longName, exchange: meta.exchange, ocorrencias: occ });
        } catch {
          desconhecidos.push({ ticker, ocorrencias: occ });
        }
      }));
    }

    ajustes.sort((a, b) => a.ticker.localeCompare(b.ticker));
    desconhecidos.sort((a, b) => a.ticker.localeCompare(b.ticker));
    return NextResponse.json({
      total: tickers.size,
      ok: ok.length,
      ajustes,
      desconhecidos,
      ignorados,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro na auditoria" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => ({}));
    const de = String(body?.de ?? "").trim().toUpperCase();
    const paraRaw = String(body?.para ?? "").trim().toUpperCase();
    if (!de || !paraRaw) {
      return NextResponse.json({ error: "Informe 'de' e 'para'" }, { status: 400 });
    }

    // Valida a grafia nova no Yahoo antes de tocar na planilha.
    const meta = await resolveAssetMeta(paraRaw);
    if (!meta?.yahooSymbol) {
      return NextResponse.json({ error: `"${paraRaw}" não resolve no Yahoo Finance — nada foi alterado` }, { status: 422 });
    }
    if (meta.yahooSymbol.toUpperCase() !== paraRaw && sheetTickerFromMeta(meta) !== paraRaw) {
      return NextResponse.json({
        error: `"${paraRaw}" resolve para "${meta.yahooSymbol}" no Yahoo — confirme a grafia sugerida`,
        sugestao: sheetTickerFromMeta(meta),
      }, { status: 422 });
    }
    const canonical = sheetTickerFromMeta(meta);

    const store = getDataStore();
    const atualizados: Record<string, number> = {};
    for (const tab of ["meus_ativos", "meus_proventos"] as const) {
      const rows = await store.fetchTab(tab).catch(() => []);
      if (rows.length === 0) { atualizados[tab] = 0; continue; }
      const tickerKey = findTickerKey(rows[0]);
      if (!tickerKey) { atualizados[tab] = 0; continue; }
      const colIdx = Object.keys(rows[0]).indexOf(tickerKey);
      const col = colLetter(colIdx);
      const updates: { a1: string; value: string }[] = [];
      rows.forEach((row, i) => {
        if (String(row[tickerKey] ?? "").trim().toUpperCase() === de) {
          updates.push({ a1: `${col}${i + 2}`, value: canonical }); // +2: header + base 1
        }
      });
      if (updates.length > 0) await updateCells(tab, updates); // backup automático
      atualizados[tab] = updates.length;
    }

    // Registra o metadado (e o apelido antigo) para os próximos syncs.
    const metas: AssetMeta[] = [meta];
    if (cacheKey(de) !== cacheKey(canonical)) metas.push({ ...meta, ticker: cacheKey(de) });
    await persistAssetMeta(metas).catch(() => {});

    return NextResponse.json({ ok: true, ticker: canonical, atualizados });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro na correção" }, { status: 500 });
  }
}

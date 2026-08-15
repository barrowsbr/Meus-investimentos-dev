import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { fetchCotacoes, yahooTicker } from "@/lib/cotacoes";
import { calcularSnapshot } from "@/lib/portfolio";
import { isRendaFixa } from "@/lib/sectors";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ── ESG da carteira (Yahoo esgScores = Sustainalytics ESG RISK) ─────────────
// ATENÇÃO à semântica: é nota de RISCO — quanto MENOR, melhor (0-10 desprezível,
// 10-20 baixo, 20-30 médio, 30-40 alto, 40+ severo). Cobertura parcial por
// natureza (B3/small caps costumam não ter nota) — o payload traz a cobertura
// para a UI nunca fingir carteira 100% avaliada. Dado trimestral: cache 7d.

interface ItemEsg {
  ticker: string; ySym: string; pesoBRL: number;
  total: number; e: number | null; s: number | null; g: number | null;
  peerGroup: string | null;
}
interface PayloadEsg { itens: ItemEsg[]; mediaPonderada: number | null; coberturaPct: number; avaliados: number; geradoEm: string }

let cache: { at: number; payload: PayloadEsg } | null = null;
const CACHE_MS = 24 * 60 * 60 * 1000;
const esgCache = new Map<string, { at: number; esg: Omit<ItemEsg, "ticker" | "ySym" | "pesoBRL"> | null }>();
const ESG_TTL = 7 * 24 * 60 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchEsg(yf: any, sym: string) {
  const hit = esgCache.get(sym);
  if (hit && Date.now() - hit.at < ESG_TTL) return hit.esg;
  try {
    const r = await yf.quoteSummary(sym, { modules: ["esgScores"] });
    const e = r?.esgScores;
    const total = typeof e?.totalEsg === "number" ? e.totalEsg : null;
    const esg = total !== null ? {
      total,
      e: typeof e?.environmentScore === "number" ? e.environmentScore : null,
      s: typeof e?.socialScore === "number" ? e.socialScore : null,
      g: typeof e?.governanceScore === "number" ? e.governanceScore : null,
      peerGroup: typeof e?.peerGroup === "string" ? e.peerGroup : null,
    } : null;
    esgCache.set(sym, { at: Date.now(), esg });
    return esg;
  } catch {
    esgCache.set(sym, { at: Date.now(), esg: null }); // sem nota (comum) — não martelar
    return null;
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    if (cache && Date.now() - cache.at < CACHE_MS) {
      return NextResponse.json(cache.payload, { headers: { "Cache-Control": "s-maxage=21600" } });
    }
    const store = getDataStore();
    const transacoes = await store.fetchTab("meus_ativos");
    const tickerSet = new Map<string, { moeda: string; corretora: string }>();
    for (const row of transacoes) {
      const t = String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? "").toUpperCase().trim();
      if (!t || tickerSet.has(t)) continue;
      tickerSet.set(t, { moeda: String(row["moeda"] ?? "BRL").toUpperCase().trim(), corretora: String(row["corretora"] ?? "").trim() });
    }
    const tickers = [...tickerSet.entries()].map(([ticker, i]) => ({ ticker, moeda: i.moeda, corretora: i.corretora }));
    const cotacoes = await fetchCotacoes(tickers);
    const snapshot = calcularSnapshot(transacoes, [], [], cotacoes.quotes, cotacoes.fx, cotacoes.fx);

    const alvos: Array<{ ySym: string; ticker: string; pesoBRL: number }> = [];
    const seen = new Set<string>();
    for (const p of snapshot.positions) {
      if ((p.quantidade ?? 0) <= 0 || (p.valorAtualBRL ?? 0) <= 0) continue;
      if (isRendaFixa(p.setor) || p.setor === "Cripto") continue;
      const info = tickerSet.get(p.ticker);
      const ySym = yahooTicker(p.ticker, info?.moeda ?? "BRL", info?.corretora ?? "");
      if (seen.has(ySym)) continue;
      seen.add(ySym);
      alvos.push({ ySym, ticker: p.ticker.replace(/\.SA$/i, ""), pesoBRL: p.valorAtualBRL });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const YF: any = (await import("yahoo-finance2")).default;
    const yf = typeof YF === "function" ? new YF() : YF;

    const itens: ItemEsg[] = [];
    for (let i = 0; i < alvos.length; i += 6) {
      const leva = alvos.slice(i, i + 6);
      const res = await Promise.all(leva.map(a => fetchEsg(yf, a.ySym)));
      leva.forEach((a, j) => { if (res[j]) itens.push({ ticker: a.ticker, ySym: a.ySym, pesoBRL: a.pesoBRL, ...res[j]! }); });
    }
    itens.sort((a, b) => b.pesoBRL - a.pesoBRL);

    const pesoTotal = alvos.reduce((s, a) => s + a.pesoBRL, 0);
    const pesoCoberto = itens.reduce((s, i2) => s + i2.pesoBRL, 0);
    const mediaPonderada = pesoCoberto > 0 ? itens.reduce((s, i2) => s + i2.total * i2.pesoBRL, 0) / pesoCoberto : null;

    const payload: PayloadEsg = {
      itens,
      mediaPonderada: mediaPonderada !== null ? Math.round(mediaPonderada * 10) / 10 : null,
      coberturaPct: pesoTotal > 0 ? Math.round((pesoCoberto / pesoTotal) * 100) : 0,
      avaliados: alvos.length,
      geradoEm: new Date().toISOString(),
    };
    cache = { at: Date.now(), payload };
    return NextResponse.json(payload, { headers: { "Cache-Control": "s-maxage=21600" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

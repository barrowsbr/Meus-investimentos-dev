// ETF Cem — DETALHE de uma empresa (card ao tocar na linha): valuation,
// dividendos (yield, payout, histórico anual), analistas e perfil, via
// quoteSummary do Yahoo + 1 chart mensal desde 2010 com events=div (a mesma
// chamada rende a série do gráfico E os dividendos por ano). Cache 6h no
// lambda + CDN — abrir o card várias vezes não gera tráfego novo.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 20;

interface Detalhe {
  sym: string;
  nome: string | null;
  moeda: string;
  preco: number | null;
  varDiaPct: number | null;
  setor: string | null;
  industria: string | null;
  funcionarios: number | null;
  resumo: string | null;
  mcap: number | null;
  pe: number | null;
  peForward: number | null;
  peg: number | null;
  pb: number | null;
  ps: number | null;
  eps: number | null;
  beta: number | null;
  roePct: number | null;
  margemLiqPct: number | null;
  crescReceitaPct: number | null;
  yieldPct: number | null;
  divTaxaAnual: number | null;
  payoutPct: number | null;
  mediaYield5aPct: number | null;
  exDiv: string | null;
  proximoBalanco: string | null;
  rating: string | null;          // ex.: "buy"
  ratingNota: number | null;      // 1 (strong buy) … 5 (sell)
  analistas: number | null;
  alvoMedio: number | null;
  w52High: number | null;
  w52Low: number | null;
  serie: Array<{ t: string; c: number }>;        // fechamento mensal desde 2010
  dividendosAno: Array<{ ano: number; total: number }>;
}

const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);
const pct = (v: unknown): number | null => (num(v) !== null ? (v as number) * 100 : null);
const dia = (v: unknown): string | null => {
  const d = v instanceof Date ? v : typeof v === "number" ? new Date(v * 1000) : typeof v === "string" ? new Date(v) : null;
  return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
};

const cache = new Map<string, { t: number; body: Detalhe }>();
const TTL = 6 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sym = (searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{1,6}(-[A-Z])?$/.test(sym)) {
    return NextResponse.json({ error: "symbol inválido" }, { status: 400 });
  }

  const hit = cache.get(sym);
  if (hit && Date.now() - hit.t < TTL) {
    return NextResponse.json(hit.body, { headers: { "Cache-Control": "s-maxage=21600, stale-while-revalidate=86400" } });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const YF: any = (await import("yahoo-finance2")).default;
    const yf = typeof YF === "function" ? new YF() : YF;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let s: any = {};
    try {
      s = await yf.quoteSummary(sym, {
        modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "calendarEvents", "summaryProfile"],
      });
    } catch { /* best-effort — o chart abaixo ainda rende o gráfico */ }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chart: any = null;
    try {
      chart = await yf.chart(sym, { period1: "2010-01-01", interval: "1mo", events: "div" });
    } catch { /* sem histórico */ }

    const serie: Array<{ t: string; c: number }> = [];
    for (const q of chart?.quotes ?? []) {
      const c = num(q?.close) ?? num(q?.adjclose);
      if (c === null || !q?.date) continue;
      serie.push({ t: new Date(q.date).toISOString().slice(0, 7), c: Math.round(c * 100) / 100 });
    }

    // Dividendos por ano — chart.events.dividends pode vir array ou mapa.
    const porAno = new Map<number, number>();
    const evs = chart?.events?.dividends;
    const lista = Array.isArray(evs) ? evs : evs && typeof evs === "object" ? Object.values(evs) : [];
    for (const d of lista) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dd = d as any;
      const amount = num(dd?.amount);
      const when = dd?.date instanceof Date ? dd.date : typeof dd?.date === "number" ? new Date(dd.date * 1000) : null;
      if (amount === null || !when || isNaN(when.getTime())) continue;
      const ano = when.getUTCFullYear();
      porAno.set(ano, (porAno.get(ano) ?? 0) + amount);
    }
    const dividendosAno = [...porAno.entries()]
      .map(([ano, total]) => ({ ano, total: Math.round(total * 10000) / 10000 }))
      .sort((a, b) => a.ano - b.ano)
      .slice(-12);

    const price = s?.price ?? {};
    const det = s?.summaryDetail ?? {};
    const stats = s?.defaultKeyStatistics ?? {};
    const fin = s?.financialData ?? {};
    const perfil = s?.summaryProfile ?? {};
    const cal = s?.calendarEvents ?? {};

    const resumoBruto = typeof perfil?.longBusinessSummary === "string" ? perfil.longBusinessSummary : null;
    const balanco = Array.isArray(cal?.earnings?.earningsDate) ? cal.earnings.earningsDate[0] : cal?.earnings?.earningsDate;

    const body: Detalhe = {
      sym,
      nome: (typeof price?.longName === "string" ? price.longName : null) ?? (typeof price?.shortName === "string" ? price.shortName : null),
      moeda: String(price?.currency ?? "USD"),
      preco: num(price?.regularMarketPrice),
      varDiaPct: pct(price?.regularMarketChangePercent),
      setor: typeof perfil?.sector === "string" ? perfil.sector : null,
      industria: typeof perfil?.industry === "string" ? perfil.industry : null,
      funcionarios: num(perfil?.fullTimeEmployees),
      resumo: resumoBruto ? (resumoBruto.length > 640 ? resumoBruto.slice(0, 640).replace(/\s+\S*$/, "") + "…" : resumoBruto) : null,
      mcap: num(det?.marketCap) ?? num(price?.marketCap),
      pe: num(det?.trailingPE),
      peForward: num(det?.forwardPE) ?? num(stats?.forwardPE),
      peg: num(stats?.pegRatio),
      pb: num(stats?.priceToBook),
      ps: num(det?.priceToSalesTrailing12Months),
      eps: num(stats?.trailingEps),
      beta: num(det?.beta) ?? num(stats?.beta),
      roePct: pct(fin?.returnOnEquity),
      margemLiqPct: pct(fin?.profitMargins),
      crescReceitaPct: pct(fin?.revenueGrowth),
      yieldPct: pct(det?.dividendYield),
      divTaxaAnual: num(det?.dividendRate),
      payoutPct: pct(det?.payoutRatio),
      mediaYield5aPct: num(det?.fiveYearAvgDividendYield),
      exDiv: dia(det?.exDividendDate ?? cal?.exDividendDate),
      proximoBalanco: dia(balanco),
      rating: typeof fin?.recommendationKey === "string" && fin.recommendationKey !== "none" ? fin.recommendationKey : null,
      ratingNota: num(fin?.recommendationMean),
      analistas: num(fin?.numberOfAnalystOpinions),
      alvoMedio: num(fin?.targetMeanPrice),
      w52High: num(det?.fiftyTwoWeekHigh),
      w52Low: num(det?.fiftyTwoWeekLow),
      serie,
      dividendosAno,
    };

    if (body.preco === null && serie.length === 0) {
      return NextResponse.json({ error: "sem dados para este símbolo" }, { status: 502 });
    }

    cache.set(sym, { t: Date.now(), body });
    return NextResponse.json(body, { headers: { "Cache-Control": "s-maxage=21600, stale-while-revalidate=86400" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

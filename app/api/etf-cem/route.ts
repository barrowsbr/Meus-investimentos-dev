// ETF Cem — as ~100 maiores empresas do mundo, usando o VOO (S&P 500) como
// proxy. Holdings via lib/etf-holdings (fonte curada SSGA/iShares, mesma do
// look-through); preço + fundamentals (P/L, yield, 52 semanas, market cap)
// via Yahoo em lote. O ATH histórico fica na rota irmã /api/etf-cem/ath
// (pesada, cacheada por muito mais tempo).

import { NextResponse } from "next/server";
import { fetchHoldings } from "@/lib/etf-holdings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export interface EmpresaCem {
  sym: string;          // símbolo Yahoo (BRK-B)
  nome: string;
  pesoPct: number;      // peso no ETF
  preco: number | null;
  moeda: string;
  varDiaPct: number | null;
  pe: number | null;          // P/L trailing
  peForward: number | null;
  eps: number | null;
  yieldPct: number | null;    // dividend yield 12m (%)
  pb: number | null;          // preço/valor patrimonial
  mcap: number | null;        // market cap (USD)
  w52High: number | null;
  w52Low: number | null;
  rating: string | null;      // ex.: "1.8 - Buy" (consenso de analistas do Yahoo)
}

// Ticker do holding (SSGA/iShares) → Yahoo: classes de ação usam hífen.
function toYahoo(sym: string): string | null {
  const s = sym.toUpperCase().trim().replace(/\./g, "-");
  if (!/^[A-Z]{1,6}(-[A-Z])?$/.test(s)) return null; // pula caixa/futuros/linhas sujas
  return s;
}

const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);

// Cache do lambda (o CDN segura o resto via s-maxage).
let cache: { t: number; body: unknown } | null = null;
const TTL = 15 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.t < TTL) {
    return NextResponse.json(cache.body, { headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" } });
  }
  try {
    const { holdings, source } = await fetchHoldings("VOO");
    if (!holdings || holdings.length === 0) {
      return NextResponse.json({ error: "holdings do VOO indisponíveis" }, { status: 503 });
    }

    // Top 100 por peso, com símbolo Yahoo válido.
    const top: Array<{ sym: string; nome: string; pesoPct: number }> = [];
    const vistos = new Set<string>();
    for (const h of [...holdings].sort((a, b) => b.weight_pct - a.weight_pct)) {
      const sym = toYahoo(h.ticker);
      if (!sym || vistos.has(sym)) continue;
      vistos.add(sym);
      top.push({ sym, nome: h.name || sym, pesoPct: h.weight_pct });
      if (top.length >= 100) break;
    }

    // Cotações + fundamentals em lotes de 25 (o quote do Yahoo aceita array).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const YF: any = (await import("yahoo-finance2")).default;
    const yf = typeof YF === "function" ? new YF() : YF;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes = new Map<string, any>();
    for (let i = 0; i < top.length; i += 25) {
      const batch = top.slice(i, i + 25).map((t) => t.sym);
      try {
        const res = await yf.quote(batch);
        for (const q of Array.isArray(res) ? res : [res]) if (q?.symbol) quotes.set(q.symbol, q);
      } catch {
        // lote falhou (throttle) — tenta um a um, best-effort
        for (const s of batch) {
          try { const q = await yf.quote(s); if (q?.symbol) quotes.set(q.symbol, q); } catch { /* sem cotação */ }
        }
      }
    }

    const empresas: EmpresaCem[] = top.map((t) => {
      const q = quotes.get(t.sym);
      return {
        sym: t.sym,
        nome: q?.longName ?? q?.shortName ?? t.nome,
        pesoPct: Math.round(t.pesoPct * 100) / 100,
        preco: num(q?.regularMarketPrice),
        moeda: String(q?.currency ?? "USD"),
        varDiaPct: num(q?.regularMarketChangePercent),
        pe: num(q?.trailingPE),
        peForward: num(q?.forwardPE),
        eps: num(q?.epsTrailingTwelveMonths),
        yieldPct: num(q?.trailingAnnualDividendYield) !== null ? (q.trailingAnnualDividendYield as number) * 100 : null,
        pb: num(q?.priceToBook),
        mcap: num(q?.marketCap),
        w52High: num(q?.fiftyTwoWeekHigh),
        w52Low: num(q?.fiftyTwoWeekLow),
        rating: typeof q?.averageAnalystRating === "string" ? q.averageAnalystRating : null,
      };
    });

    const body = { updatedAt: new Date().toISOString(), fonte: source, proxy: "VOO (S&P 500)", empresas };
    cache = { t: Date.now(), body };
    return NextResponse.json(body, { headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

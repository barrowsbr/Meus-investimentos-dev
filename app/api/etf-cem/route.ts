// ETF Cem — o S&P 500 COMPLETO (~500 empresas) via VOO como proxy; o nome
// "Cem" ficou da versão original (top 100) e a UI mostra 100 por vez.
// Holdings via lib/etf-holdings (fonte curada SSGA/iShares, mesma do
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
  pesoPct: number;      // peso no ETF (0 nas estrangeiras — não vêm do VOO)
  origem: "sp500" | "mundo";
  pais: string | null;  // só nas estrangeiras
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

// ── As maiores do RESTO DO MUNDO — o S&P 500 só aceita empresa domiciliada
// nos EUA, então "as maiores do mundo" exige somar as gigantes estrangeiras.
// Todas abaixo negociam em bolsa/OTC americana (ADR ou listagem direta), em
// USD, com os MESMOS campos do Yahoo do resto da página (P/L, mcap, ATH...).
// Curadoria estática por market cap (~55 nomes; revisitar de vez em quando).
// Sem listagem líquida nos EUA ficam de fora: Samsung, Saudi Aramco,
// Kweichow Moutai, Reliance.
const MUNDO: Array<[sym: string, nome: string, pais: string]> = [
  ["TSM", "Taiwan Semiconductor (TSMC)", "Taiwan"],
  ["ASML", "ASML Holding", "Holanda"],
  ["SAP", "SAP SE", "Alemanha"],
  ["NVO", "Novo Nordisk", "Dinamarca"],
  ["NSRGY", "Nestlé", "Suíça"],
  ["RHHBY", "Roche", "Suíça"],
  ["NVS", "Novartis", "Suíça"],
  ["UBS", "UBS Group", "Suíça"],
  ["ABBNY", "ABB", "Suíça"],
  ["LVMUY", "LVMH", "França"],
  ["HESAY", "Hermès", "França"],
  ["LRLCY", "L'Oréal", "França"],
  ["TTE", "TotalEnergies", "França"],
  ["SNY", "Sanofi", "França"],
  ["SBGSY", "Schneider Electric", "França"],
  ["EADSY", "Airbus", "França/UE"],
  ["SIEGY", "Siemens", "Alemanha"],
  ["DTEGY", "Deutsche Telekom", "Alemanha"],
  ["ALIZY", "Allianz", "Alemanha"],
  ["AZN", "AstraZeneca", "Reino Unido"],
  ["SHEL", "Shell", "Reino Unido"],
  ["HSBC", "HSBC Holdings", "Reino Unido"],
  ["UL", "Unilever", "Reino Unido"],
  ["BP", "BP", "Reino Unido"],
  ["GSK", "GSK", "Reino Unido"],
  ["RELX", "RELX", "Reino Unido"],
  ["NGG", "National Grid", "Reino Unido"],
  ["ARM", "Arm Holdings", "Reino Unido"],
  ["RIO", "Rio Tinto", "Reino Unido/Austrália"],
  ["BHP", "BHP Group", "Austrália"],
  ["TM", "Toyota Motor", "Japão"],
  ["SONY", "Sony Group", "Japão"],
  ["MUFG", "Mitsubishi UFJ", "Japão"],
  ["SMFG", "Sumitomo Mitsui", "Japão"],
  ["HMC", "Honda Motor", "Japão"],
  ["TCEHY", "Tencent", "China"],
  ["BABA", "Alibaba", "China"],
  ["PDD", "PDD Holdings (Temu)", "China"],
  ["NTES", "NetEase", "China"],
  ["JD", "JD.com", "China"],
  ["BIDU", "Baidu", "China"],
  ["IDCBY", "ICBC", "China"],
  ["PROSY", "Prosus", "Holanda"],
  ["ING", "ING Group", "Holanda"],
  ["PHG", "Philips", "Holanda"],
  ["SAN", "Banco Santander", "Espanha"],
  ["BBVA", "BBVA", "Espanha"],
  ["IDEXY", "Inditex (Zara)", "Espanha"],
  ["RACE", "Ferrari", "Itália"],
  ["ENLAY", "Enel", "Itália"],
  ["STLA", "Stellantis", "Itália/França"],
  ["RY", "Royal Bank of Canada", "Canadá"],
  ["TD", "TD Bank", "Canadá"],
  ["ENB", "Enbridge", "Canadá"],
  ["CNQ", "Canadian Natural Resources", "Canadá"],
  ["SHOP", "Shopify", "Canadá"],
  ["CNI", "Canadian National Railway", "Canadá"],
  ["HDB", "HDFC Bank", "Índia"],
  ["IBN", "ICICI Bank", "Índia"],
  ["INFY", "Infosys", "Índia"],
  ["MELI", "MercadoLibre", "América Latina"],
  ["NU", "Nubank", "Brasil"],
  ["VALE", "Vale", "Brasil"],
  ["PBR", "Petrobras", "Brasil"],
  ["ITUB", "Itaú Unibanco", "Brasil"],
];

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

    // Índice completo por peso (S&P 500 ≈ 503 papéis), com símbolo Yahoo válido.
    const top: Array<{ sym: string; nome: string; pesoPct: number; origem: "sp500" | "mundo"; pais: string | null }> = [];
    const vistos = new Set<string>();
    for (const h of [...holdings].sort((a, b) => b.weight_pct - a.weight_pct)) {
      const sym = toYahoo(h.ticker);
      if (!sym || vistos.has(sym)) continue;
      vistos.add(sym);
      top.push({ sym, nome: h.name || sym, pesoPct: h.weight_pct, origem: "sp500", pais: null });
      if (top.length >= 510) break; // proteção contra fonte suja; o índice tem ~503
    }
    // + as maiores fora dos EUA (ADRs) — dedup contra o índice por segurança.
    for (const [sym, nome, pais] of MUNDO) {
      if (vistos.has(sym)) continue;
      vistos.add(sym);
      top.push({ sym, nome, pesoPct: 0, origem: "mundo", pais });
    }

    // Cotações + fundamentals em lotes de 50 (o quote do Yahoo aceita array).
    // Fallback de lote com falha: divide em metades, nunca um-a-um (500 papéis
    // um a um estouraria o maxDuration num throttle).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const YF: any = (await import("yahoo-finance2")).default;
    const yf = typeof YF === "function" ? new YF() : YF;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes = new Map<string, any>();
    const cotarLote = async (batch: string[], podeDividir: boolean): Promise<void> => {
      try {
        const res = await yf.quote(batch);
        for (const q of Array.isArray(res) ? res : [res]) if (q?.symbol) quotes.set(q.symbol, q);
      } catch {
        if (podeDividir && batch.length > 5) {
          const meio = Math.ceil(batch.length / 2);
          await cotarLote(batch.slice(0, meio), false);
          await cotarLote(batch.slice(meio), false);
        }
        // best-effort: lote irrecuperável fica sem cotação (a UI mostra "—")
      }
    };
    for (let i = 0; i < top.length; i += 50) {
      await cotarLote(top.slice(i, i + 50).map((t) => t.sym), true);
    }

    const empresas: EmpresaCem[] = top.map((t) => {
      const q = quotes.get(t.sym);
      return {
        sym: t.sym,
        nome: q?.longName ?? q?.shortName ?? t.nome,
        pesoPct: Math.round(t.pesoPct * 100) / 100,
        origem: t.origem,
        pais: t.pais,
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

    const body = { updatedAt: new Date().toISOString(), fonte: source, proxy: "S&P 500 (VOO) + ADRs", empresas };
    cache = { t: Date.now(), body };
    return NextResponse.json(body, { headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

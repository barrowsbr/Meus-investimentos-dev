// ETF Cem — ÍNDICE MUNDO de verdade: top 500 do MSCI ACWI (composição real e
// diária via SPDR ACWI/SSGA — ver lib/etf-mundo.ts). "Cem" ficou como nome da
// página; a UI mostra 100 por vez.
//
// Cada papel vem identificado por ISIN; o símbolo Yahoo sai do cache na aba
// `etf_mundo_map` (resolução progressiva — papéis ainda sem símbolo aparecem
// com os dados do próprio arquivo da SSGA, sem cotação ao vivo). Cotações em
// lote no Yahoo, na MOEDA LOCAL de cada bolsa; market cap é convertido para
// USD (única métrica em que moeda misturada enganaria o olho).
//
// ?refresh=1 (botão "Atualizar" da página) fura o cache do lambda e re-baixa
// a composição na hora.

import { NextRequest, NextResponse } from "next/server";
import { fetchComposicaoAcwi, lerMapaSimbolos, resolverSimbolos, SEM_SIMBOLO } from "@/lib/etf-mundo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export interface EmpresaCem {
  sym: string | null;   // símbolo Yahoo (2330.TW, NESN.SW, NVDA) — null se ainda não mapeado
  isin: string;
  nome: string;
  pesoPct: number;      // peso no MSCI ACWI
  pais: string;
  setor: string;
  preco: number | null;
  moeda: string;        // moeda do preço (local da bolsa)
  varDiaPct: number | null;
  pe: number | null;
  peForward: number | null;
  eps: number | null;
  yieldPct: number | null;
  pb: number | null;
  mcapUsd: number | null;  // market cap CONVERTIDO para USD
  w52High: number | null;
  w52Low: number | null;
  rating: string | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);

// GBp/ZAc = pence/centavos — Yahoo cota Londres/Joanesburgo assim.
function normalizaMoeda(moeda: string): { codigo: string; fator: number } {
  if (moeda === "GBp" || moeda === "GBX") return { codigo: "GBP", fator: 0.01 };
  if (moeda === "ZAc") return { codigo: "ZAR", fator: 0.01 };
  return { codigo: moeda.toUpperCase(), fator: 1 };
}

// Cache do lambda (o CDN segura o resto via s-maxage).
let cache: { t: number; body: unknown } | null = null;
const TTL = 30 * 60 * 1000;

export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  if (!refresh && cache && Date.now() - cache.t < TTL) {
    return NextResponse.json(cache.body, { headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" } });
  }
  try {
    const { asOf, papeis } = await fetchComposicaoAcwi(500);
    if (papeis.length === 0) {
      return NextResponse.json({ error: "composição do ACWI indisponível" }, { status: 503 });
    }

    // ISIN → símbolo Yahoo (cache na planilha + resolução progressiva).
    const { mapa, pendentes } = await resolverSimbolos(papeis, await lerMapaSimbolos());

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
      }
    };
    const syms = papeis
      .map((p) => mapa.get(p.isin))
      .filter((s): s is string => !!s && s !== SEM_SIMBOLO);
    for (let i = 0; i < syms.length; i += 50) {
      await cotarLote(syms.slice(i, i + 50), true);
    }

    // FX → USD para converter market cap (só métrica absoluta da lista).
    const moedas = new Set<string>();
    for (const q of quotes.values()) {
      const { codigo } = normalizaMoeda(String(q?.currency ?? "USD"));
      if (codigo !== "USD") moedas.add(codigo);
    }
    const fxUsd = new Map<string, number>(); // codigo → quantos CODIGO valem 1 USD
    if (moedas.size > 0) {
      try {
        const fxSyms = [...moedas].map((c) => `USD${c}=X`);
        const res = await yf.quote(fxSyms);
        for (const q of Array.isArray(res) ? res : [res]) {
          const m = String(q?.symbol ?? "").match(/^USD([A-Z]{3})=X$/);
          const r = num(q?.regularMarketPrice);
          if (m && r !== null && r > 0) fxUsd.set(m[1], r);
        }
      } catch { /* sem FX — mcap dessas moedas fica null */ }
    }

    const empresas: EmpresaCem[] = papeis.map((p) => {
      const symRaw = mapa.get(p.isin);
      const sym = symRaw && symRaw !== SEM_SIMBOLO ? symRaw : null;
      const q = sym ? quotes.get(sym) : undefined;

      const moedaQ = String(q?.currency ?? p.moeda ?? "USD");
      const { codigo, fator } = normalizaMoeda(moedaQ);
      let mcapUsd: number | null = null;
      const mcapRaw = num(q?.marketCap);
      if (mcapRaw !== null) {
        const emMoeda = mcapRaw * fator;
        mcapUsd = codigo === "USD" ? emMoeda : fxUsd.has(codigo) ? emMoeda / fxUsd.get(codigo)! : null;
      }

      return {
        sym,
        isin: p.isin,
        nome: q?.longName ?? q?.shortName ?? p.nome,
        pesoPct: Math.round(p.pesoPct * 1000) / 1000,
        pais: p.pais,
        setor: p.setor,
        preco: num(q?.regularMarketPrice) ?? p.precoLocal,
        moeda: q ? moedaQ : p.moeda,
        varDiaPct: num(q?.regularMarketChangePercent),
        pe: num(q?.trailingPE),
        peForward: num(q?.forwardPE),
        eps: num(q?.epsTrailingTwelveMonths),
        yieldPct: num(q?.trailingAnnualDividendYield) !== null ? (q.trailingAnnualDividendYield as number) * 100 : null,
        pb: num(q?.priceToBook),
        mcapUsd,
        w52High: num(q?.fiftyTwoWeekHigh),
        w52Low: num(q?.fiftyTwoWeekLow),
        rating: typeof q?.averageAnalystRating === "string" ? q.averageAnalystRating : null,
      };
    });

    const body = {
      updatedAt: new Date().toISOString(),
      indice: "MSCI ACWI",
      fonte: "SPDR MSCI ACWI (SSGA)",
      asOf,
      pendentes, // ISINs ainda sem símbolo Yahoo (resolução progressiva)
      empresas,
    };
    cache = { t: Date.now(), body };
    return NextResponse.json(body, {
      headers: refresh
        ? { "Cache-Control": "no-store" }
        : { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

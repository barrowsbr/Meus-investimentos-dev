import { NextResponse } from "next/server";
import { getFlexXmlCached, parseFlexXml } from "@/lib/ibkr-flex";
import { getMarketDataStore } from "@/lib/data-store";
import { lerNavPlanilha, persistirNavIbkr, montarTwrIbkr } from "@/lib/ibkr-nav-store";
import { anexarFluxos } from "@/lib/ibkr-nav";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Raio-X do extrato (?debug=1): quais SEÇÕES a Flex query está mandando —
// tira a adivinhação de "habilitei a seção certa?" na configuração da query.
function listarSecoes(xml: string): Array<{ tag: string; n: number }> {
  const counts = new Map<string, number>();
  const re = /<([A-Za-z][\w]*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([tag]) => !["FlexQueryResponse", "FlexStatements", "FlexStatement"].includes(tag))
    .map(([tag, n]) => ({ tag, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 40);
}

// TWR OFICIAL da conta IBKR — calculado do NAV diário da própria corretora
// (ver lib/ibkr-nav.ts). Benchmark S&P 500 (^GSPC, golden source) na MESMA
// janela, normalizado no primeiro pregão da série.
export async function GET(request: Request) {
  const token = process.env.IBKR_FLEX_TOKEN;
  const queryId = process.env.IBKR_FLEX_QUERY_ID;
  if (!token || !queryId) {
    return NextResponse.json({ error: "IBKR_FLEX_TOKEN e/ou IBKR_FLEX_QUERY_ID não configurados" }, { status: 422 });
  }
  const debug = new URL(request.url).searchParams.get("debug") === "1";

  try {
    const xml = await getFlexXmlCached(token, queryId, 1_800_000, 40_000);
    const parsed = parseFlexXml(xml);

    if (debug) {
      return NextResponse.json({
        secoes: listarSecoes(xml),
        navDiario: parsed.navDiario.length,
        fluxosExternos: parsed.fluxosExternos.length,
        changeInNav: parsed.changeInNav,
        temEquitySummary: parsed.navDiario.length > 0,
      }, { headers: { "Cache-Control": "no-store" } });
    }
    const planilha = await lerNavPlanilha();
    const twr = montarTwrIbkr(parsed, planilha);

    // Acumula o NAV na planilha (best-effort — sem service account, segue só leitura).
    let persistidos = 0;
    if (parsed.navDiario.length > 0) {
      persistidos = await persistirNavIbkr(anexarFluxos(parsed.navDiario, parsed.fluxosExternos)).catch(() => 0);
    }

    // Benchmark: S&P 500 cumulativo na mesma janela (preço, USD — mesma moeda base).
    const spPorData = new Map<string, number>();
    try {
      const golden = await getMarketDataStore().read();
      for (const d of golden.dates) {
        const v = golden.prices[d]?.["^GSPC"];
        if (v != null && v > 0) spPorData.set(d, v);
      }
    } catch { /* sem golden → sem benchmark */ }

    let spBase: number | null = null;
    let spUltimo: number | null = null;
    const pontos = twr.pontos.map((p) => {
      const sp = spPorData.get(p.date) ?? spUltimo;
      if (sp != null) { spUltimo = sp; if (spBase == null) spBase = sp; }
      return { date: p.date, twr: p.twr, sp500: sp != null && spBase != null ? sp / spBase - 1 : null };
    });

    return NextResponse.json({
      pontos,
      mensal: twr.mensal,
      twrTotal: twr.twrTotal,
      twrAnualizado: twr.twrAnualizado,
      oficialPeriodo: twr.oficialPeriodo,
      navInicial: twr.navInicial,
      navFinal: twr.navFinal,
      fluxoTotal: twr.fluxoTotal,
      primeiraData: twr.primeiraData,
      ultimaData: twr.ultimaData,
      fontes: twr.fontes,
      semSecaoNav: twr.semSecaoNav,
      persistidos,
    }, { headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=600" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

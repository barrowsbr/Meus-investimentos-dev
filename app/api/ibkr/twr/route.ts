import { NextResponse } from "next/server";
import { getFlexXmlCached, parseFlexXml, parseFlexMeta } from "@/lib/ibkr-flex";
import { getMarketDataStore } from "@/lib/data-store";
import { lerNavPlanilha, persistirNavIbkr, montarTwrIbkr } from "@/lib/ibkr-nav-store";
import { anexarFluxos } from "@/lib/ibkr-nav";
import { montarMarksParaGolden } from "@/lib/ibkr-marks";

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
      // Anatomia do INÍCIO da série + retornos anômalos — só métricas RELATIVAS
      // (datas, %, nav como fração do final): o log do CI é público, valor
      // absoluto de NAV nunca sai daqui.
      const pontosDbg = anexarFluxos(parsed.navDiario, parsed.fluxosExternos);
      const navFinalDbg = pontosDbg.length ? pontosDbg[pontosDbg.length - 1].nav : 0;
      const linha = (i: number) => {
        const p = pontosDbg[i];
        const prev = i > 0 ? pontosDbg[i - 1] : null;
        const base = prev ? prev.nav + p.fluxo : 0;
        return {
          date: p.date,
          navRelPct: navFinalDbg > 0 ? +(100 * p.nav / navFinalDbg).toFixed(3) : null,
          retornoPct: prev && base > 0 ? +((p.nav / base - 1) * 100).toFixed(2) : null,
          temFluxo: p.fluxo !== 0,
        };
      };
      const inicio = pontosDbg.slice(0, 12).map((_, i) => linha(i));
      const anomalos = pontosDbg
        .map((_, i) => linha(i))
        .filter((l) => l.retornoPct != null && Math.abs(l.retornoPct) > 5);
      return NextResponse.json({
        secoes: listarSecoes(xml),
        navDiario: parsed.navDiario.length,
        fluxosExternos: parsed.fluxosExternos.length,
        changeInNav: parsed.changeInNav,
        temEquitySummary: parsed.navDiario.length > 0,
        inicioSerie: inicio,
        retornosAnomalos: anomalos.slice(0, 20),
        // Auditoria do regime híbrido (dry-run, NÃO grava): como cada mark da
        // IBKR se compara ao último fechamento da coluna na golden. `fator`
        // perto de 1 = mesma unidade/moeda/ativo. Só RAZÕES — nenhum preço
        // absoluto sai daqui (o log do CI é público).
        marksAuditoria: await (async () => {
          try {
            const golden = await getMarketDataStore().read();
            const marks = montarMarksParaGolden(parsed.positions, parseFlexMeta(xml).toDate, golden.tickers, golden);
            if (!marks) return { aviso: "sem marks (fim de semana ou extrato sem posições)" };
            const ultimo = new Map<string, number>();
            for (let i = golden.dates.length - 1; i >= 0; i--) {
              const row = golden.prices[golden.dates[i]];
              if (!row || golden.dates[i] >= marks.date) continue;
              for (const [c, v] of Object.entries(row)) if (v > 0 && !ultimo.has(c)) ultimo.set(c, v);
            }
            return {
              data: marks.date,
              aceitos: Object.entries(marks.valores).map(([coluna, v]) => ({
                coluna,
                fator: ultimo.has(coluna) ? Math.round((v / ultimo.get(coluna)!) * 1000) / 1000 : null,
                colunaNova: !golden.tickers.some((t) => t.toUpperCase() === coluna),
              })),
              rejeitados: marks.rejeitados,
            };
          } catch (e) {
            return { erro: e instanceof Error ? e.message : "falha" };
          }
        })(),
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

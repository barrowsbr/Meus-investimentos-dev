import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";
import { fetchHistoricalData } from "@/lib/market-history";
import { calcularTWR, buildRfTimeline } from "@/lib/twr-engine";
import { calcularCambioMetrics, buildPmFxRates } from "@/lib/cambio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function pct(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawLookback = parseInt(searchParams.get("lookback") ?? "1825", 10);
  const lookback = rawLookback <= 0 ? 0 : Math.min(rawLookback, 3650);

  try {
    const [transacoes, proventos, cambioRows, rfTransacoes, fixaAberta] = await Promise.all([
      fetchTab("meus_ativos"),
      fetchTab("meus_proventos").catch(() => []),
      fetchTab("cambio").catch(() => []),
      fetchTab("renda_fixa").catch(() => []),
      fetchTab("fixa_aberta").catch(() => []),
    ]);
    if (transacoes.length === 0) {
      return NextResponse.json({ error: "Sem transações" }, { status: 422 });
    }

    const tickerMeta = new Map<string, { moeda: string; corretora: string }>();
    for (const row of transacoes) {
      const ticker = String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? "").toUpperCase().trim();
      if (!ticker) continue;
      if (!tickerMeta.has(ticker)) {
        tickerMeta.set(ticker, {
          moeda: String(row["moeda"] ?? "BRL").toUpperCase().trim(),
          corretora: String(row["corretora"] ?? "").trim(),
        });
      }
    }
    const tickerList = [...tickerMeta.entries()].map(([ticker, info]) => ({ ticker, ...info }));

    const hist = await fetchHistoricalData(tickerList, lookback > 0 ? lookback + 10 : 0);
    if (hist.dates.length === 0) {
      return NextResponse.json({ error: "Sem dados históricos", histErrors: hist.errors }, { status: 422 });
    }

    // Janela com 1 dia pre-window (dia-âncora), idêntico à rota /api/performance/advanced.
    const windowEnd = new Date().toISOString().split("T")[0];
    const fromDate = lookback > 0
      ? (() => { const d = new Date(); d.setDate(d.getDate() - lookback); return d.toISOString().split("T")[0]; })()
      : "0000";
    const allDates = hist.dates.filter(d => d <= windowEnd);
    let dates: string[];
    if (lookback > 0) {
      const firstInWindow = allDates.findIndex(d => d >= fromDate);
      dates = allDates.slice(Math.max(0, firstInWindow - 1));
    } else {
      dates = allDates;
    }

    const dateIdxMap = new Map(hist.dates.map((d, i) => [d, i]));
    const alignedPrices: Record<string, (number | null)[]> = {};
    for (const [ticker, arr] of Object.entries(hist.prices)) {
      alignedPrices[ticker] = dates.map(d => {
        const idx = dateIdxMap.get(d);
        return idx != null ? arr[idx] : null;
      });
    }
    const alignedFx = Object.fromEntries(dates.map(d => [d, hist.fxHistory[d]]));
    const lastFx = hist.fxHistory[dates[dates.length - 1]] ?? { USDBRL: 5.7, EURBRL: 6.4, CADBRL: 4.1, GBPBRL: 7.6 };
    const pmFx = buildPmFxRates(calcularCambioMetrics(cambioRows, lastFx));

    // RF timeline
    const { navByDate: rfNavByDate, flowByDate: rfFlowByDate } =
      buildRfTimeline(rfTransacoes, fixaAberta, dates, alignedFx);

    // Proventos sem IMPOSTO (para medir impacto do IMPOSTO)
    const proventosSemImposto = proventos.filter(r => {
      const decisao = String(r["decisao"] ?? r["decisão"] ?? "").toLowerCase();
      return !decisao.includes("imposto");
    });

    // ── 4 cenários para decompor a contribuição de cada fator ──
    const twrAtual = calcularTWR({ transacoes, proventos, dates, prices: alignedPrices, fxHistory: alignedFx, pmFx, rfNavByDate, rfFlowByDate });
    const twrSemDiv = calcularTWR({ transacoes, proventos: [], dates, prices: alignedPrices, fxHistory: alignedFx, pmFx, rfNavByDate, rfFlowByDate });
    const twrSemImposto = calcularTWR({ transacoes, proventos: proventosSemImposto, dates, prices: alignedPrices, fxHistory: alignedFx, pmFx, rfNavByDate, rfFlowByDate });
    const twrSemRF = calcularTWR({ transacoes, proventos, dates, prices: alignedPrices, fxHistory: alignedFx, pmFx });

    // ── Auditoria do motor (GIPS Modified Dietz) ──
    // O motor não tem caps nem heurísticas: o único bloqueio é base ≤ 0
    // (capital zerado) depois do dia-âncora. Aqui listamos esses dias e
    // verificamos as identidades que o motor promete.
    const pts = twrAtual.points;
    const firstIdx = pts.findIndex(p => p.nav > 0);
    const measured = firstIdx >= 0 ? pts.slice(firstIdx) : [];

    const forceZeroDias = measured
      .filter(p => p.forceZero)
      .map(p => ({ date: p.date, nav: Math.round(p.nav), flow: Math.round(p.flow) }));

    // Maiores retornos diários (sem caps, vale conferir se são plausíveis)
    const extremos = [...measured]
      .filter(p => !p.forceZero)
      .sort((a, b) => Math.abs(b.ret) - Math.abs(a.ret))
      .slice(0, 15)
      .map(p => ({ date: p.date, ret: pct(p.ret), nav: Math.round(p.nav), flow: Math.round(p.flow), income: Math.round(p.income) }));

    // ── Identidade do ganho econômico ──
    // GE deve igualar a soma telescópica dos ganhos diários do período medido:
    // Σ ((nav_i + income_i) − nav_{i−1} − flow_i). No dia-âncora (janelas) a
    // medição começa no fim do dia 0; em série all-time começa no dia da
    // primeira compra (prevNav = 0).
    const isAnchor = firstIdx === 0;
    let somaGanhosDiarios = 0;
    for (let i = isAnchor ? 1 : firstIdx; i < pts.length; i++) {
      const prev = i > 0 ? pts[i - 1].nav : 0;
      somaGanhosDiarios += (pts[i].nav + pts[i].income) - prev - pts[i].flow;
    }
    const geIdentidadeOk = Math.abs(somaGanhosDiarios - twrAtual.ganhoEconomico) < 1.0;

    const contribDividendos = twrAtual.twrTotal - twrSemDiv.twrTotal;
    const impostoImpacto = twrSemImposto.twrTotal - twrAtual.twrTotal;
    const rfImpacto = twrAtual.twrTotal - twrSemRF.twrTotal;

    return NextResponse.json({
      janela: { de: dates[0], ate: dates[dates.length - 1], dias: dates.length, lookback, diaAncora: isAnchor ? dates[0] : null },

      motor: {
        metodo: "Modified Dietz SoD (GIPS) — base = prevNav + flow; sem caps, sem heurísticas",
        forceZeroRegra: "apenas base ≤ 0 após o dia-âncora",
      },

      decomposicao: {
        twrAtual: pct(twrAtual.twrTotal),
        twrAnualizado: pct(twrAtual.twrAnualizado),
        mwr: twrAtual.mwr != null ? pct(twrAtual.mwr) : null,
        componentes: {
          somentePreco: pct(twrSemDiv.twrTotal),
          contribuicaoDividendos: pct(contribDividendos),
          impostoRetido: pct(-impostoImpacto),
          contribuicaoRF: pct(rfImpacto),
        },
      },

      bloqueios: {
        resumo: forceZeroDias.length === 0
          ? "✅ Nenhum dia com base ≤ 0 no período medido — todos os retornos contam."
          : `⚠️ ${forceZeroDias.length} dia(s) com base ≤ 0 (capital zerado) — retorno indefinido nesses dias.`,
        dias: forceZeroDias.slice(0, 30),
      },

      identidades: {
        ganhoEconomico: Math.round(twrAtual.ganhoEconomico),
        somaGanhosDiarios: Math.round(somaGanhosDiarios),
        consistente: geIdentidadeOk
          ? "✅ GE = Σ ganhos diários (identidade contábil fecha)"
          : `⚠️ Divergência de R$ ${Math.round(somaGanhosDiarios - twrAtual.ganhoEconomico)} — investigar`,
      },

      retornosExtremos: extremos,
      diagnostics: twrAtual.diagnostics,
      custoPosicoesAtuais: Math.round(twrAtual.custoPosicoesAtuais),
      totalInvestido: Math.round(twrAtual.totalInvestido),
      histErrors: hist.errors,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

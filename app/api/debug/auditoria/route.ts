import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";
import { fetchHistoricalData } from "@/lib/market-history";
import { calcularTWR, buildRfTimeline } from "@/lib/twr-engine";
import { calcularCambioMetrics, buildPmFxRates } from "@/lib/cambio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FLOW_THRESHOLD = 0.01;
const LARGE_FLOW_FORCE_ZERO = 0.90;
const MAX_DAILY_RETURN = 0.50;

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

    const windowEnd = new Date().toISOString().split("T")[0];
    const fromDate = lookback > 0
      ? (() => { const d = new Date(); d.setDate(d.getDate() - lookback); return d.toISOString().split("T")[0]; })()
      : "0000";
    const dates = hist.dates.filter(d => d >= fromDate && d <= windowEnd);

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

    // ── Pergunta 1: bloqueios ──
    const pts = twrAtual.points;
    const capped: { date: string; retBruto: string; retAplicado: string }[] = [];
    const forceZeroSuspeito: { date: string; retDescartado: string; navAntes: number; navDepois: number }[] = [];
    let forceZeroLegitimo = 0;

    let twrSemBloqueios = 1;
    let prevNav = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i === 0) { prevNav = p.nav; continue; }

      const flow = p.flow;
      const hugeFlow = prevNav > 0 && Math.abs(flow) / prevNav > LARGE_FLOW_FORCE_ZERO;
      const noBase = prevNav <= 0;
      const isSoD = !noBase && !hugeFlow && Math.abs(flow) / prevNav > FLOW_THRESHOLD;
      const base = isSoD ? prevNav + flow : prevNav;
      const rawRet = base > 0 ? ((p.nav + p.income) - prevNav - flow) / base : 0;

      if (p.forceZero) {
        if (noBase || hugeFlow) {
          forceZeroLegitimo++;
        } else {
          forceZeroSuspeito.push({ date: p.date, retDescartado: pct(rawRet), navAntes: Math.round(prevNav), navDepois: Math.round(p.nav) });
        }
      } else if (Math.abs(rawRet) > MAX_DAILY_RETURN) {
        capped.push({ date: p.date, retBruto: pct(rawRet), retAplicado: pct(p.ret) });
      }

      const retUnblocked = (noBase || hugeFlow) ? 0 : rawRet;
      twrSemBloqueios *= (1 + retUnblocked);
      prevNav = p.nav;
    }
    twrSemBloqueios -= 1;

    const contribDividendos = twrAtual.twrTotal - twrSemDiv.twrTotal;
    const estimativaMetodoAntigo = twrAtual.twrTotal + contribDividendos;
    const impactoBloqueios = twrSemBloqueios - twrAtual.twrTotal;
    const impostoImpacto = twrSemImposto.twrTotal - twrAtual.twrTotal;
    const rfImpacto = twrAtual.twrTotal - twrSemRF.twrTotal;

    return NextResponse.json({
      janela: { de: dates[0], ate: dates[dates.length - 1], dias: dates.length, lookback },

      decomposicao: {
        twrAtual: pct(twrAtual.twrTotal),
        twrAnualizado: pct(twrAtual.twrAnualizado),
        componentes: {
          somentePreco: pct(twrSemDiv.twrTotal),
          contribuicaoDividendos: pct(contribDividendos),
          impostoRetido: pct(-impostoImpacto),
          contribuicaoRF: pct(rfImpacto),
        },
        estimativaMetodoAntigo: pct(estimativaMetodoAntigo),
        explicacao: `TWR corrigido = ${pct(twrAtual.twrTotal)}. Método antigo (adjClose+income) ≈ ${pct(estimativaMetodoAntigo)}. Diferença = dividendos contados 2× (${pct(contribDividendos)}). IMPOSTO retido reduz ${pct(impostoImpacto)}.`,
      },

      bloqueios: {
        resumo: forceZeroSuspeito.length === 0 && capped.length === 0
          ? "✅ Nenhum bloqueio descartou retorno legítimo."
          : "⚠️ Há dias bloqueados — ver impacto abaixo.",
        twrComBloqueios: pct(twrAtual.twrTotal),
        twrSemBloqueios: pct(twrSemBloqueios),
        impacto: pct(impactoBloqueios),
        veredito: Math.abs(impactoBloqueios) < 0.01
          ? "Impacto < 1 ponto — os bloqueios NÃO estão amarrando a rentabilidade."
          : `Impacto de ${pct(impactoBloqueios)} — investigar os dias listados.`,
        diasCapados: { quantidade: capped.length, exemplos: capped.slice(0, 30) },
        forceZeroSuspeitos: { quantidade: forceZeroSuspeito.length, exemplos: forceZeroSuspeito.slice(0, 30) },
        forceZeroLegitimos: forceZeroLegitimo,
      },

      diagnostics: twrAtual.diagnostics,
      ganhoEconomico: Math.round(twrAtual.ganhoEconomico),
      custoPosicoesAtuais: Math.round(twrAtual.custoPosicoesAtuais),
      totalInvestido: Math.round(twrAtual.totalInvestido),
      histErrors: hist.errors,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

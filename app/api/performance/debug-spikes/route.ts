import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";
import { fetchHistoricalData } from "@/lib/market-history";
import { calcularTWR, buildRfTimeline } from "@/lib/twr-engine";
import { calcularCambioMetrics, buildPmFxRates } from "@/lib/cambio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function today(): string { return new Date().toISOString().split("T")[0]; }

export async function GET() {
  try {
    const [transacoes, proventos, cambioRows, rfTransacoes, fixaAberta] = await Promise.all([
      fetchTab("meus_ativos"),
      fetchTab("meus_proventos").catch(() => []),
      fetchTab("cambio").catch(() => []),
      fetchTab("renda_fixa").catch(() => []),
      fetchTab("fixa_aberta").catch(() => []),
    ]);

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
    const hist = await fetchHistoricalData(tickerList, 0);
    const dates = hist.dates.filter(d => d <= today());

    for (const ticker of Object.keys(hist.prices)) {
      const arr = hist.prices[ticker];
      let lastKnown: number | null = null;
      for (let j = 0; j < arr.length; j++) {
        if (arr[j] != null && arr[j]! > 0) lastKnown = arr[j];
        else if (lastKnown != null) arr[j] = lastKnown;
      }
      let firstKnown: number | null = null;
      for (let j = arr.length - 1; j >= 0; j--) {
        if (arr[j] != null && arr[j]! > 0) firstKnown = arr[j];
        else if (firstKnown != null) arr[j] = firstKnown;
      }
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
    const cambioMetrics = calcularCambioMetrics(cambioRows, lastFx);
    const pmFx = buildPmFxRates(cambioMetrics);

    const { navByDate: rfNavByDate, flowByDate: rfFlowByDate } = buildRfTimeline(
      rfTransacoes, fixaAberta, dates, alignedFx
    );

    const twr = calcularTWR({ transacoes, proventos, dates, prices: alignedPrices, fxHistory: alignedFx, pmFx, rfNavByDate, rfFlowByDate });

    // Top 20 days by absolute daily return — full decomposition
    const worst = twr.points
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => i > 0)
      .map(({ p, i }) => {
        const prev = twr.points[i - 1];
        const rfNav = rfNavByDate?.[p.date] ?? 0;
        const prevRfNav = rfNavByDate?.[prev.date] ?? 0;
        const rfFlow = rfFlowByDate?.[p.date] ?? 0;
        return {
          date: p.date,
          ret_pct: +(p.ret * 100).toFixed(3),
          nav: +p.nav.toFixed(0),
          prevNav: +prev.nav.toFixed(0),
          navDelta: +(p.nav - prev.nav).toFixed(0),
          flow: +p.flow.toFixed(0),
          rfFlow: +rfFlow.toFixed(0),
          rvFlow: +(p.flow - rfFlow).toFixed(0),
          income: +p.income.toFixed(0),
          rfNav: +rfNav.toFixed(0),
          rfNavDelta: +(rfNav - prevRfNav).toFixed(0),
          rvNav: +(p.nav - rfNav).toFixed(0),
          forceZero: p.forceZero,
          // economic gain vs flow mismatch — the spike signature
          gainMinusFlow: +((p.nav + p.income) - prev.nav - p.flow).toFixed(0),
        };
      })
      .sort((a, b) => Math.abs(b.ret_pct) - Math.abs(a.ret_pct))
      .slice(0, 20);

    const over15 = twr.points.filter((p, i) => i > 0 && Math.abs(p.ret) > 0.15).length;
    const over50 = twr.points.filter((p, i) => i > 0 && Math.abs(p.ret) > 0.50).length;

    return NextResponse.json({
      twrTotal_pct: +(twr.twrTotal * 100).toFixed(2),
      totalDays: twr.points.length,
      daysReturnOver15pct: over15,
      daysReturnOver50pct: over50,
      worstDays: worst,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";
import { fetchHistoricalData } from "@/lib/market-history";
import {
  calcularTWR,
  buildCDIBenchmark,
  buildPriceBenchmark,
  type TwrDayPoint,
} from "@/lib/twr-engine";
import { calcularCambioMetrics, buildPmFxRates } from "@/lib/cambio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function startDateFromLookback(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function thinSeries(points: TwrDayPoint[], maxPoints = 500): TwrDayPoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const result: TwrDayPoint[] = [];
  for (let i = 0; i < points.length; i += step) result.push(points[i]);
  if (result[result.length - 1] !== points[points.length - 1]) {
    result.push(points[points.length - 1]);
  }
  return result;
}

// ─── Route handler ─────────────────────────────────────────────────────────--

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawLookback = parseInt(searchParams.get("lookback") ?? "1825", 10);
  const lookback = rawLookback <= 0 ? 0 : Math.min(rawLookback, 3650);

  try {
    // ── 1. Load transaction + provento data ──────────────────────────────────
    const [transacoes, proventos, cambioRows] = await Promise.all([
      fetchTab("meus_ativos"),
      fetchTab("meus_proventos").catch(() => []),
      fetchTab("cambio").catch(() => []),
    ]);

    if (transacoes.length === 0) {
      return NextResponse.json({ error: "Sem transações" }, { status: 422 });
    }

    // ── 2. Extract unique RV tickers ─────────────────────────────────────────
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

    const tickerList = [...tickerMeta.entries()].map(([ticker, info]) => ({
      ticker,
      moeda: info.moeda,
      corretora: info.corretora,
    }));

    // ── 3. Fetch historical price data ───────────────────────────────────────
    console.log(`[TWR] Fetching history for ${tickerList.length} tickers, lookback=${lookback}`);
    const hist = await fetchHistoricalData(tickerList, lookback > 0 ? lookback + 10 : 0);
    console.log(`[TWR] History result: ${hist.dates.length} dates, errors: ${hist.errors.join("; ") || "none"}`);

    if (hist.dates.length === 0) {
      return NextResponse.json(
        { error: "Sem dados históricos disponíveis", histErrors: hist.errors, tickerCount: tickerList.length },
        { status: 422 }
      );
    }

    // ── 4. Restrict to lookback window (+1 pre-window anchor day) ────────────
    // Same convention as /api/performance/advanced: windowed views include one
    // day before the window start so the engine has prevNav > 0 on day 1.
    const windowEnd = today();
    const allDates = hist.dates.filter(d => d <= windowEnd);
    let dates: string[];
    if (lookback > 0) {
      const windowStart = startDateFromLookback(lookback);
      const firstInWindow = allDates.findIndex(d => d >= windowStart);
      dates = allDates.slice(Math.max(0, firstInWindow - 1));
    } else {
      dates = allDates;
    }

    if (dates.length === 0) {
      return NextResponse.json({ error: "Janela de datas sem dados" }, { status: 422 });
    }

    // Align price arrays to the filtered date list
    const dateIdxMap = new Map(hist.dates.map((d, i) => [d, i]));
    const alignedPrices: Record<string, (number | null)[]> = {};
    for (const [ticker, arr] of Object.entries(hist.prices)) {
      alignedPrices[ticker] = dates.map(d => {
        const idx = dateIdxMap.get(d);
        return idx != null ? arr[idx] : null;
      });
    }
    const alignedFx = Object.fromEntries(
      dates.map(d => [d, hist.fxHistory[d]])
    );
    const alignedIbov = dates.map(d => {
      const idx = dateIdxMap.get(d);
      return idx != null ? hist.ibov[idx] : null;
    });

    // ── 5. Calculate TWR (with proventos & PM FX) ─────────────────────────────
    const lastFx = hist.fxHistory[dates[dates.length - 1]] ?? { USDBRL: 5.7, EURBRL: 6.4, CADBRL: 4.1, GBPBRL: 7.6 };
    const cambioMetrics = calcularCambioMetrics(cambioRows, lastFx);
    const pmFx = buildPmFxRates(cambioMetrics);

    const twr = calcularTWR({
      transacoes,
      proventos,
      dates,
      prices: alignedPrices,
      fxHistory: alignedFx,
      pmFx,
    });

    // ── 6. Benchmarks ────────────────────────────────────────────────────────
    const cdiPoints = buildCDIBenchmark(dates);
    const ibovPoints = buildPriceBenchmark("IBOV", dates, alignedIbov);

    function normalizeBenchmark(
      bench: TwrDayPoint[],
      fromDate: string
    ): TwrDayPoint[] {
      const startIdx = bench.findIndex(p => p.date >= fromDate);
      if (startIdx < 0) return bench;
      const base = 1 + bench[startIdx].twr;
      return bench.slice(startIdx).map(p => ({
        ...p,
        twr: (1 + p.twr) / base - 1,
      }));
    }

    const benchStart = twr.primeiraData || dates[0];
    const cdiNorm = normalizeBenchmark(cdiPoints, benchStart);
    const ibovNorm = normalizeBenchmark(ibovPoints, benchStart);

    // ── 7. Thin series for chart ─────────────────────────────────────────────
    // Only send meaningful points (NAV > 0) with benchmarks merged by date
    const firstMeanIdx = twr.points.findIndex(p => p.nav > 0);
    const meaningfulPts = firstMeanIdx >= 0 ? twr.points.slice(firstMeanIdx) : twr.points;
    const cdiMap = new Map(cdiNorm.map(p => [p.date, p.twr]));
    const ibovMap = new Map(ibovNorm.map(p => [p.date, p.twr]));
    const mergedChart = meaningfulPts.map(p => ({
      ...p,
      cdi_twr: cdiMap.get(p.date) ?? null,
      ibov_twr: ibovMap.get(p.date) ?? null,
    }));
    const chartPoints = thinSeries(mergedChart as TwrDayPoint[]);
    const chartCDI = thinSeries(cdiNorm);
    const chartIBOV = thinSeries(ibovNorm);

    // ── 8. Summary metrics ───────────────────────────────────────────────────
    const cdiTotal = cdiNorm.length > 0 ? cdiNorm[cdiNorm.length - 1].twr : 0;
    const ibovTotal = ibovNorm.length > 0 ? ibovNorm[ibovNorm.length - 1].twr : 0;

    const summary = {
      twrTotal: twr.twrTotal,
      twrAnualizado: twr.twrAnualizado,
      mwr: twr.mwr,
      navFinal: twr.navFinal,
      navInicial: twr.navInicial,
      totalInvestido: twr.totalInvestido,
      duracaoAnos: twr.duracaoAnos,
      primeiraData: twr.primeiraData,
      ultimaData: twr.ultimaData,
      vsCDI: twr.twrTotal - cdiTotal,
      vsIBOV: twr.twrTotal - ibovTotal,
      cdiTotal,
      ibovTotal,
      ganhoEconomico: twr.ganhoEconomico,
    };

    return NextResponse.json(
      {
        summary,
        chart: chartPoints,
        benchmarks: { cdi: chartCDI, ibov: chartIBOV },
        errors: hist.errors,
        lookback,
      },
      {
        headers: {
          "Cache-Control": "s-maxage=900, stale-while-revalidate=300",
        },
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    console.error("[TWR]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

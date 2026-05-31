import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";
import { fetchHistoricalData } from "@/lib/market-history";
import { calcularTWR, buildCDIBenchmark, buildPriceBenchmark, type TwrDayPoint } from "@/lib/twr-engine";
import { calcularCambioMetrics, buildPmFxRates } from "@/lib/cambio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Row = Record<string, unknown>;

// ── Date helpers ──────────────────────────────────────────────────────────────

function today(): string { return new Date().toISOString().split("T")[0]; }

function startDateFromLookback(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function thinSeries(points: TwrDayPoint[], maxPts = 400): TwrDayPoint[] {
  if (points.length <= maxPts) return points;
  const step = Math.ceil(points.length / maxPts);
  const out: TwrDayPoint[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

// ── MWR (Money-Weighted Return / IRR) using Newton-Raphson ───────────────────

function calcularMWR(cashFlows: Array<{ date: string; amount: number }>): number {
  if (cashFlows.length < 2) return 0;

  const t0 = new Date(cashFlows[0].date).getTime();
  const tN = new Date(cashFlows[cashFlows.length - 1].date).getTime();
  const totalDays = (tN - t0) / (1000 * 60 * 60 * 24);
  if (totalDays <= 0) return 0;

  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
  const cf = cashFlows.map(c => ({
    t: (new Date(c.date).getTime() - t0) / MS_PER_YEAR,
    amt: c.amount,
  }));

  function npv(rate: number): number {
    if (rate <= -1) return Infinity;
    return cf.reduce((s, { t, amt }) => s + amt / Math.pow(1 + rate, t), 0);
  }
  function npvDeriv(rate: number): number {
    if (rate <= -1) return Infinity;
    return cf.reduce((s, { t, amt }) => s - t * amt / Math.pow(1 + rate, t + 1), 0);
  }

  let r = 0.05;
  let converged = false;
  for (const guess of [0.05, 0.0, 0.1, 0.2, -0.3, 0.5]) {
    r = guess;
    for (let i = 0; i < 200; i++) {
      const f = npv(r);
      const df = npvDeriv(r);
      if (Math.abs(df) < 1e-14) break;
      let step = f / df;
      if (Math.abs(step) > 1.0) step = Math.sign(step);
      const rNew = Math.max(-0.999, Math.min(100, r - step));
      if (Math.abs(rNew - r) < 1e-8) { r = rNew; converged = true; break; }
      r = rNew;
    }
    if (converged) break;
  }

  if (!converged) {
    let low = -0.99, high = 10.0;
    let fLow = npv(low);
    if (fLow * npv(high) > 0) {
      for (const h of [50, 100]) { if (fLow * npv(h) <= 0) { high = h; break; } }
    }
    for (let i = 0; i < 300; i++) {
      const mid = (low + high) / 2;
      const fMid = npv(mid);
      if (Math.abs(fMid) < 1e-8 || Math.abs(high - low) < 1e-8) { r = mid; break; }
      if (fLow * fMid < 0) { high = mid; } else { low = mid; fLow = fMid; }
    }
  }

  return (isFinite(r) && Math.abs(r) <= 10) ? r : 0;
}

// ── Drawdown series ───────────────────────────────────────────────────────────

function calcularDrawdown(points: TwrDayPoint[]): Array<{ date: string; drawdown: number; nav: number }> {
  let peak = 0;
  return points.map(p => {
    const cumulFactor = 1 + p.twr;
    if (cumulFactor > peak) peak = cumulFactor;
    const dd = peak > 0 ? (cumulFactor / peak) - 1 : 0;
    return { date: p.date, drawdown: dd * 100, nav: p.nav };
  });
}

// ── Rolling returns ───────────────────────────────────────────────────────────

interface RollingWindow { label: string; days: number }

function calcularRollingReturns(
  points: TwrDayPoint[],
  windows: RollingWindow[]
): Array<{ date: string; [key: string]: number | string }> {
  if (points.length === 0) return [];

  const result: Array<{ date: string; [key: string]: number | string }> = [];

  for (let i = 0; i < points.length; i++) {
    const entry: { date: string; [key: string]: number | string } = { date: points[i].date };
    for (const w of windows) {
      const startIdx = Math.max(0, i - w.days);
      const startFactor = 1 + points[startIdx].twr;
      const endFactor = 1 + points[i].twr;
      const rolling = startFactor > 0 ? (endFactor / startFactor - 1) * 100 : null;
      entry[w.label] = rolling !== null ? rolling : 0;
    }
    result.push(entry);
  }

  return result;
}

// ── Attribution analysis (by sector) ─────────────────────────────────────────

function calcularAttributionBySector(
  points: TwrDayPoint[],
  transacoes: Row[]
): Array<{ setor: string; macro: string; contrib_pct: number; nav_medio: number }> {
  // Simplified attribution using transaction weights
  // Full Brinson-Hood-Beebower requires per-asset prices
  const sectorWeights: Record<string, number> = {};
  let totalCost = 0;

  for (const tx of transacoes) {
    const tipo = String(tx["tipo de transação"] ?? tx["tipo"] ?? "").toLowerCase();
    if (!tipo.includes("compra")) continue;
    const valor = parseFloat(String(tx["valor líquido"] ?? tx["valor bruto"] ?? "0").replace(",", "."));
    const setor = String(tx["setor"] ?? "Outros");
    if (valor > 0) {
      sectorWeights[setor] = (sectorWeights[setor] ?? 0) + valor;
      totalCost += valor;
    }
  }

  const twrTotal = points.length > 0 ? points[points.length - 1].twr * 100 : 0;
  const macroMap: Record<string, string> = {
    "Ações Brasil": "Brasil", "FIIs": "Brasil", "BDRs": "Brasil", "ETF": "Brasil",
    "Ações Internacional": "Exterior", "ETF USA": "Exterior",
    "Renda Fixa": "Renda Fixa", "Renda Fixa USD": "Renda Fixa",
    "Commodities": "Commodities", "Cripto": "Cripto",
  };

  return Object.entries(sectorWeights).map(([setor, cost]) => ({
    setor,
    macro: macroMap[setor] ?? "Outros",
    contrib_pct: totalCost > 0 ? (cost / totalCost) * twrTotal : 0,
    nav_medio: cost,
  })).sort((a, b) => Math.abs(b.contrib_pct) - Math.abs(a.contrib_pct));
}

// ── Volatility and risk metrics ───────────────────────────────────────────────

function calcularMetricasRisco(dailyReturns: number[], annualize = 252) {
  if (dailyReturns.length < 2) return { volatility: 0, sharpe: 0, sortino: 0, var95: 0, var99: 0 };

  const n = dailyReturns.length;
  const mean = dailyReturns.reduce((s, r) => s + r, 0) / n;
  const variance = dailyReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  const volatility = stdDev * Math.sqrt(annualize);

  // Sharpe: annualized return vs risk-free (10% a.a. — matching Streamlit)
  const RISK_FREE_ANNUAL = 0.10;
  const annualReturn = Math.pow(1 + mean, annualize) - 1;
  const sharpe = volatility > 0 ? (annualReturn - RISK_FREE_ANNUAL) / volatility : 0;

  // Sortino: downside = returns below zero (matching Streamlit)
  const downside = dailyReturns.filter(r => r < 0);
  const downsideStd = downside.length > 0
    ? Math.sqrt(downside.reduce((s, r) => s + r * r, 0) / downside.length) * Math.sqrt(annualize)
    : 0;
  const sortino = downsideStd > 0 ? (annualReturn - RISK_FREE_ANNUAL) / downsideStd : 0;

  const sorted = [...dailyReturns].sort((a, b) => a - b);
  const var95 = sorted[Math.floor(n * 0.05)] ?? 0;
  const var99 = sorted[Math.floor(n * 0.01)] ?? 0;

  return { volatility, sharpe, sortino, var95: var95 * 100, var99: var99 * 100 };
}

// ── FX decomposition: R_total = (1 + R_ativo)(1 + R_fx) - 1 ─────────────────

function calcularDecomposicaoFX(
  points: TwrDayPoint[],
  fxHistory: Record<string, { USDBRL: number }>,
  pmDolar?: number,
): {
  r_total: number;
  r_ativo: number;
  r_fx: number;
  r_combinado: number;
} {
  if (points.length < 2) return { r_total: 0, r_ativo: 0, r_fx: 0, r_combinado: 0 };
  const r_total = points[points.length - 1].twr;
  const baseFx = pmDolar && pmDolar > 0 ? pmDolar : fxHistory[points[0].date]?.USDBRL;
  const lastFx = fxHistory[points[points.length - 1].date]?.USDBRL;
  if (!baseFx || !lastFx || baseFx <= 0) {
    return { r_total, r_ativo: r_total, r_fx: 0, r_combinado: r_total };
  }
  const r_fx = (lastFx / baseFx) - 1;
  const r_ativo = (1 + r_total) / (1 + r_fx) - 1;
  const r_combinado = (1 + r_ativo) * (1 + r_fx) - 1;
  return { r_total, r_ativo, r_fx, r_combinado };
}

// ── Flow ledger ───────────────────────────────────────────────────────────────

interface FlowEntry {
  date: string;
  flow: number;
  nav: number;
  nav_before: number;
  daily_return: number;
  cumulative_twr: number;
}

function buildFlowLedger(points: TwrDayPoint[], maxEntries = 50): FlowEntry[] {
  const significantFlows = points
    .filter((p, i) => i > 0 && Math.abs(p.flow) > 100)
    .slice(-maxEntries);

  return significantFlows.map((p, i) => {
    const prevIdx = points.findIndex(pp => pp.date === p.date) - 1;
    const prev = prevIdx >= 0 ? points[prevIdx] : null;
    return {
      date: p.date,
      flow: p.flow,
      nav: p.nav,
      nav_before: prev?.nav ?? 0,
      daily_return: p.ret * 100,
      cumulative_twr: p.twr * 100,
    };
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawLookback = parseInt(searchParams.get("lookback") ?? "1825", 10);
  const lookback = rawLookback <= 0 ? 0 : rawLookback;

  try {
    const [transacoes, proventos, cambioRows] = await Promise.all([
      fetchTab("meus_ativos"),
      fetchTab("meus_proventos").catch(() => []),
      fetchTab("cambio").catch(() => []),
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
      return NextResponse.json({ error: "Sem dados históricos" }, { status: 422 });
    }

    const dates = lookback > 0
      ? hist.dates.filter(d => d >= startDateFromLookback(lookback) && d <= today())
      : hist.dates.filter(d => d <= today());
    if (dates.length === 0) return NextResponse.json({ error: "Janela sem dados" }, { status: 422 });

    const dateIdxMap = new Map(hist.dates.map((d, i) => [d, i]));
    const alignedPrices: Record<string, (number | null)[]> = {};
    for (const [ticker, arr] of Object.entries(hist.prices)) {
      alignedPrices[ticker] = dates.map(d => {
        const idx = dateIdxMap.get(d);
        return idx != null ? arr[idx] : null;
      });
    }
    const alignedFx = Object.fromEntries(dates.map(d => [d, hist.fxHistory[d]]));
    const alignedIbov = dates.map(d => {
      const idx = dateIdxMap.get(d);
      return idx != null ? hist.ibov[idx] : null;
    });

    // Compute PM FX rates from cambio data (investor's average remittance cost)
    const lastFx = hist.fxHistory[dates[dates.length - 1]] ?? { USDBRL: 5.7, EURBRL: 6.4, CADBRL: 4.1, GBPBRL: 7.6 };
    const cambioMetrics = calcularCambioMetrics(cambioRows, lastFx);
    const pmFx = buildPmFxRates(cambioMetrics);

    const twr = calcularTWR({ transacoes, proventos, dates, prices: alignedPrices, fxHistory: alignedFx, pmFx });

    // CDI and IBOV benchmarks
    const cdiPoints = buildCDIBenchmark(dates);
    const ibovPoints = buildPriceBenchmark("IBOV", dates, alignedIbov);

    const benchStart = twr.primeiraData || dates[0];
    function normalizeBenchmark(bench: TwrDayPoint[], from: string): TwrDayPoint[] {
      const si = bench.findIndex(p => p.date >= from);
      if (si < 0) return bench;
      const base = 1 + bench[si].twr;
      return bench.slice(si).map(p => ({ ...p, twr: (1 + p.twr) / base - 1 }));
    }

    const cdiNorm = normalizeBenchmark(cdiPoints, benchStart);
    const ibovNorm = normalizeBenchmark(ibovPoints, benchStart);

    const cdiTotal = cdiNorm.length > 0 ? cdiNorm[cdiNorm.length - 1].twr : 0;
    const ibovTotal = ibovNorm.length > 0 ? ibovNorm[ibovNorm.length - 1].twr : 0;

    // ── Advanced metrics ──────────────────────────────────────────────────────
    // Drawdown series — start from first day with NAV > 0
    const firstIdx = twr.points.findIndex(p => p.nav > 0);
    const meaningfulPoints = firstIdx >= 0 ? twr.points.slice(firstIdx) : twr.points;

    const dailyReturns = meaningfulPoints
      .filter(p => !p.forceZero && isFinite(p.ret))
      .map(p => p.ret);
    const riskMetrics = calcularMetricasRisco(dailyReturns);
    const drawdownSeries = calcularDrawdown(meaningfulPoints);
    const maxDrawdown = drawdownSeries.length > 0
      ? Math.min(...drawdownSeries.map(d => d.drawdown))
      : 0;

    // Rolling returns
    const ROLLING_WINDOWS: RollingWindow[] = [
      { label: "1M", days: 21 },
      { label: "3M", days: 63 },
      { label: "6M", days: 126 },
      { label: "1A", days: 252 },
    ];
    const rollingReturns = calcularRollingReturns(meaningfulPoints, ROLLING_WINDOWS);

    // MWR/IRR — build cash flow series
    const cashFlows: Array<{ date: string; amount: number }> = [];
    for (const p of twr.points) {
      if (Math.abs(p.flow) > 1) {
        cashFlows.push({ date: p.date, amount: -p.flow }); // negative = outflow
      }
    }
    if (twr.points.length > 0) {
      const last = twr.points[twr.points.length - 1];
      cashFlows.push({ date: last.date, amount: last.nav }); // final NAV = inflow
    }
    cashFlows.sort((a, b) => a.date.localeCompare(b.date));
    const mwr = twr.mwr ?? calcularMWR(cashFlows);

    // FX decomposition (using PM dólar as base for "meu custo")
    const fxDecomp = calcularDecomposicaoFX(meaningfulPoints, alignedFx, cambioMetrics.pmDolar);

    // Attribution
    const attribution = calcularAttributionBySector(meaningfulPoints, transacoes);

    // Flow ledger
    const flowLedger = buildFlowLedger(twr.points);

    // Peak / trough dates
    let peakDate = benchStart;
    let troughDate = benchStart;
    let peakTwr = -Infinity;
    let troughTwr = Infinity;
    for (const p of meaningfulPoints) {
      if (p.twr > peakTwr) { peakTwr = p.twr; peakDate = p.date; }
      if (p.twr < troughTwr) { troughTwr = p.twr; troughDate = p.date; }
    }

    // Monthly returns
    const monthlyMap: Record<string, { startFactor: number; endFactor: number; startDate: string }> = {};
    for (const p of meaningfulPoints) {
      const month = p.date.slice(0, 7);
      const factor = 1 + p.twr;
      if (!monthlyMap[month]) {
        monthlyMap[month] = { startFactor: factor, endFactor: factor, startDate: p.date };
      } else {
        if (p.date < monthlyMap[month].startDate) {
          monthlyMap[month].startFactor = factor;
          monthlyMap[month].startDate = p.date;
        }
        monthlyMap[month].endFactor = factor;
      }
    }
    const monthlyReturns = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { startFactor, endFactor }]) => ({
        month,
        return_pct: startFactor > 0 ? ((endFactor / startFactor) - 1) * 100 : 0,
      }));

    return NextResponse.json({
      summary: {
        twrTotal: twr.twrTotal,
        twrAnualizado: twr.twrAnualizado,
        mwr,
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
        maxDrawdown,
        volatility: riskMetrics.volatility,
        sharpe: riskMetrics.sharpe,
        sortino: riskMetrics.sortino,
        var95: riskMetrics.var95,
        var99: riskMetrics.var99,
        ganhoEconomico: twr.ganhoEconomico,
        peakDate,
        troughDate,
        peakTwr: peakTwr === -Infinity ? 0 : peakTwr,
        troughTwr: troughTwr === Infinity ? 0 : troughTwr,
      },
      chart: thinSeries(twr.points),
      benchmarks: {
        cdi: thinSeries(cdiNorm),
        ibov: thinSeries(ibovNorm),
      },
      drawdown: thinSeries(drawdownSeries.map((d, i) => ({
        date: d.date,
        nav: d.nav,
        flow: twr.points[i]?.flow ?? 0,
        income: twr.points[i]?.income ?? 0,
        ret: twr.points[i]?.ret ?? 0,
        twr: d.drawdown / 100,
        forceZero: twr.points[i]?.forceZero ?? false,
      }))),
      drawdownData: drawdownSeries.filter((_, i) => i % Math.max(1, Math.floor(drawdownSeries.length / 400)) === 0),
      rolling: rollingReturns.filter((_, i) => i % Math.max(1, Math.floor(rollingReturns.length / 400)) === 0),
      monthlyReturns,
      flowLedger,
      attribution,
      fxDecomposition: fxDecomp,
      errors: hist.errors,
      lookback,
    }, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

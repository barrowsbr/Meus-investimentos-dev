import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";
import { fetchHistoricalData } from "@/lib/market-history";
import { calcularTWR, buildCDIBenchmark, buildPriceBenchmark, buildRfTimeline, type TwrDayPoint } from "@/lib/twr-engine";
import { calcularCambioMetrics, buildPmFxRates, buildRunningPmDolar } from "@/lib/cambio";
import { calcularSnapshot, calcularRendaFixaBRL, tickerBase } from "@/lib/portfolio";
import { MARGIN_TAB, parseMarginRows, computeMarginResumo, aplicarAlavancagem } from "@/lib/margin";
import { identificarSetor, getMoedaEfetiva, isRendaFixa, isRendaFixaPrecificavel } from "@/lib/sectors";

function tickerOf(row: Record<string, unknown>): string {
  return String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? "").toUpperCase().trim();
}

const CASH_TICKERS_PATRIMONIO = new Set(["CAIXA", "SALDO", "CASH", "RESERVA"]);

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

function thinSeries<T>(points: T[], maxPts = 400): T[] {
  if (points.length <= maxPts) return points;
  const step = Math.ceil(points.length / maxPts);
  const out: T[] = [];
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

// ── MWR diário acumulado (estilo IBKR PortfolioAnalyst) ──────────────────────
// Para cada dia t resolve o XIRR dos fluxos do investidor até t — NAV inicial
// e aportes líquidos (flow − income) como saídas, NAV_t como entrada — e
// converte a taxa anualizada em retorno ACUMULADO do período: (1+r)^anos − 1.
// Mesma convenção do MWR total do twr-engine (fluxos após o dia-âncora; o NAV
// do dia 0 já embute os fluxos desse dia). Warm-start na taxa do dia anterior
// mantém o Newton em poucas iterações por ponto.
function calcularMWRDiario(
  points: Array<{ date: string; nav: number; flow: number; income: number }>,
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  if (points.length === 0) return out;

  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
  const baseMs = new Date(points[0].date + "T12:00:00Z").getTime();
  const cf: Array<[number, number]> = [];
  if (points[0].nav > 0) cf.push([0, -points[0].nav]);
  out.set(points[0].date, 0);

  let warm = 0.05;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const t = (new Date(p.date + "T12:00:00Z").getTime() - baseMs) / MS_PER_YEAR;
    const netFlow = p.flow - p.income;
    if (t > 0 && Math.abs(netFlow) > 0.01) cf.push([t, -netFlow]);
    if (p.nav <= 0 || t <= 0) {
      out.set(p.date, null);
      continue;
    }

    const navT = p.nav;
    const npv = (r: number): number => {
      if (r <= -0.999) return Infinity;
      let s = navT / Math.pow(1 + r, t);
      for (const [tt, amt] of cf) s += amt / Math.pow(1 + r, tt);
      return s;
    };
    const npvDeriv = (r: number): number => {
      let s = -t * navT / Math.pow(1 + r, t + 1);
      for (const [tt, amt] of cf) s -= tt * amt / Math.pow(1 + r, tt + 1);
      return s;
    };

    let r = warm;
    let ok = false;
    for (const guess of [warm, 0.05, 0, 0.3, -0.3]) {
      r = guess;
      for (let k = 0; k < 80; k++) {
        const f = npv(r);
        const df = npvDeriv(r);
        if (!isFinite(f) || !isFinite(df) || Math.abs(df) < 1e-14) break;
        let step = f / df;
        if (Math.abs(step) > 1.0) step = Math.sign(step);
        const rNew = Math.max(-0.999, Math.min(100, r - step));
        if (Math.abs(rNew - r) < 1e-9) { r = rNew; ok = true; break; }
        r = rNew;
      }
      if (ok && Math.abs(npv(r)) < Math.max(1, navT) * 1e-6) break;
      ok = false;
    }

    if (ok && isFinite(r)) {
      warm = r;
      out.set(p.date, Math.pow(1 + r, t) - 1);
    } else {
      out.set(p.date, null);
    }
  }
  return out;
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
  transacoes: Row[],
  rfTransacoes: Row[] = []
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

  // Renda fixa: include RF buy cost basis so attribution reflects RF too.
  // RF txs live in a separate sheet (renda_fixa) without a "setor" column,
  // so they bucket into "Renda Fixa" / "Renda Fixa USD". CASH tickers excluded.
  const CASH_RF = new Set(["CAIXA", "SALDO", "CASH", "RESERVA"]);
  for (const tx of rfTransacoes) {
    const tipoRaw = String(tx["tipo"] ?? tx["movimentacao"] ?? "").toLowerCase();
    if (!(tipoRaw.includes("compra") || tipoRaw.includes("aplica") || tipoRaw.includes("aporte"))) continue;
    const ticker = String(tx["ticker"] ?? tx["ativo"] ?? tx["papel"] ?? "").trim().toUpperCase();
    if (!ticker || CASH_RF.has(ticker)) continue;
    const valor = Math.abs(parseFloat(String(tx["valor"] ?? "0").replace(",", ".")) || 0);
    if (valor <= 0) continue;
    const moeda = String(tx["moeda"] ?? "BRL").toUpperCase().trim();
    const setor = moeda === "USD" ? "Renda Fixa USD" : "Renda Fixa";
    sectorWeights[setor] = (sectorWeights[setor] ?? 0) + valor;
    totalCost += valor;
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

const RISK_FREE_BRL = 0.10;
const RISK_FREE_USD = 0.05;

function calcularMetricasRisco(dailyReturns: number[], riskFreeAnnual = RISK_FREE_BRL, annualize = 252) {
  if (dailyReturns.length < 2) return { volatility: 0, sharpe: 0, sortino: 0, var95: 0, var99: 0, riskFreeRate: riskFreeAnnual };

  const n = dailyReturns.length;
  const mean = dailyReturns.reduce((s, r) => s + r, 0) / n;
  const variance = dailyReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  const volatility = stdDev * Math.sqrt(annualize);

  const annualReturn = Math.pow(1 + mean, annualize) - 1;
  const sharpe = volatility > 0 ? (annualReturn - riskFreeAnnual) / volatility : 0;

  const downside = dailyReturns.filter(r => r < 0);
  const downsideStd = downside.length > 0
    ? Math.sqrt(downside.reduce((s, r) => s + r * r, 0) / downside.length) * Math.sqrt(annualize)
    : 0;
  const sortino = downsideStd > 0 ? (annualReturn - riskFreeAnnual) / downsideStd : 0;

  const sorted = [...dailyReturns].sort((a, b) => a - b);
  const var95 = sorted[Math.floor(n * 0.05)] ?? 0;
  const var99 = sorted[Math.floor(n * 0.01)] ?? 0;

  return { volatility, sharpe, sortino, var95: var95 * 100, var99: var99 * 100, riskFreeRate: riskFreeAnnual };
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
  const indexed = points
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => i > 0 && Math.abs(p.flow) > 100)
    .slice(-maxEntries);

  return indexed.map(({ p, i }) => ({
    date: p.date,
    flow: p.flow,
    nav: p.nav,
    nav_before: points[i - 1]?.nav ?? 0,
    daily_return: p.ret * 100,
    cumulative_twr: p.twr * 100,
  }));
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawLookback = parseInt(searchParams.get("lookback") ?? "1825", 10);
  const lookback = rawLookback <= 0 ? 0 : rawLookback;
  // Filtro por classe (tudo|rv|rf|cripto) e, dentro de RV, por setor.
  const classe = (searchParams.get("classe") ?? "tudo").toLowerCase();
  // Aceita múltiplos setores separados por vírgula (ex: "Ações Brasil,FIIs")
  const setorFiltro = searchParams.get("setor") ?? "";
  const setoresFiltro = new Set(setorFiltro.split(",").map(s => s.trim()).filter(Boolean));
  const tickerFiltro = (searchParams.get("ticker") ?? "").toUpperCase().trim();
  const isYmd = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const fromParam = isYmd(searchParams.get("from")) ? searchParams.get("from")! : "";
  const toParam = isYmd(searchParams.get("to")) ? searchParams.get("to")! : "";

  try {
    const [transacoes, proventos, cambioRows, rfTransacoes, fixaAberta, marginRows] = await Promise.all([
      fetchTab("meus_ativos"),
      fetchTab("meus_proventos").catch(() => []),
      fetchTab("cambio").catch(() => []),
      fetchTab("renda_fixa").catch(() => []),
      fetchTab("fixa_aberta").catch(() => []),
      fetchTab(MARGIN_TAB).catch(() => []),
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
    // Custom date range (from/to) overrides lookback. Fetch full history when a
    // custom 'from' is given so the window is fully covered.
    const fetchLookback = (fromParam || toParam) ? 0 : (lookback > 0 ? lookback + 10 : 0);
    const hist = await fetchHistoricalData(tickerList, fetchLookback);
    if (hist.dates.length === 0) {
      return NextResponse.json({ error: "Sem dados históricos" }, { status: 422 });
    }

    // For windowed views, include 1 extra day BEFORE the window so the TWR
    // engine starts with prevNav > 0. Without it, day 1 is always forceZero
    // (prevNav=0) and any real market movement on that day is lost.
    const isWindowed = lookback > 0 || fromParam || toParam;
    const windowStart = (fromParam || toParam)
      ? (fromParam || "0000")
      : lookback > 0 ? startDateFromLookback(lookback) : "0000";
    const allDates = hist.dates.filter(d => d <= (toParam || today()));
    let dates: string[];
    if (isWindowed) {
      const firstInWindow = allDates.findIndex(d => d >= windowStart);
      dates = allDates.slice(Math.max(0, firstInWindow - 1));
    } else {
      dates = allDates;
    }
    if (dates.length === 0) return NextResponse.json({ error: "Janela sem dados" }, { status: 422 });

    // Pre-fill the FULL price matrix (ffill + bfill) BEFORE slicing to the
    // window. This way windowed views (YTD/1M/…) inherit the last known
    // price from before the window boundary. Without this, holdings carried
    // into the window get null prices → NAV is understated on day 1.
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
    const alignedIbov = dates.map(d => {
      const idx = dateIdxMap.get(d);
      return idx != null ? hist.ibov[idx] : null;
    });
    const alignedSP500 = dates.map(d => {
      const idx = dateIdxMap.get(d);
      return idx != null ? hist.sp500[idx] : null;
    });

    // Compute PM FX rates from cambio data (investor's average remittance cost)
    const lastFx = hist.fxHistory[dates[dates.length - 1]] ?? { USDBRL: 5.7, EURBRL: 6.4, CADBRL: 4.1, GBPBRL: 7.6 };
    const cambioMetrics = calcularCambioMetrics(cambioRows, lastFx);
    const pmFx = buildPmFxRates(cambioMetrics);
    const runningPm = buildRunningPmDolar(cambioRows);

    // ── Filtro por classe/setor ────────────────────────────────────────────────
    // Setores de RV presentes (para os sub-filtros da página) + flags de classe.
    const rvSetores = new Set<string>();
    let temCripto = false;
    let temPricedRF = false; // SHV/BIL — RF com cotação, na meus_ativos
    for (const row of transacoes) {
      const tk = tickerOf(row);
      if (!tk) continue;
      const setor = identificarSetor(tk);
      if (setor === "Cripto") { temCripto = true; continue; }
      if (isRendaFixaPrecificavel(setor)) { temPricedRF = true; continue; }
      if (isRendaFixa(setor)) continue;
      rvSetores.add(setor);
    }
    const temRF = rfTransacoes.length > 0 || fixaAberta.length > 0 || temPricedRF;

    function keepRvTicker(tk: string): boolean {
      if (tickerFiltro && tk !== tickerFiltro) return false;
      const setor = identificarSetor(tk);
      const isCripto = setor === "Cripto";
      if (classe === "rf") return isRendaFixaPrecificavel(setor);
      if (isRendaFixa(setor)) return false;
      if (classe === "cripto") return isCripto;
      if (classe === "rv") return isCripto ? false : (setoresFiltro.size > 0 ? setoresFiltro.has(setor) : true);
      return setoresFiltro.size > 0 ? setoresFiltro.has(setor) : true;
    }

    const includeRF = (classe === "tudo" || classe === "rf") && !tickerFiltro;
    const filtroAtivo = classe !== "tudo" || setoresFiltro.size > 0 || tickerFiltro !== "";
    const transacoesF = filtroAtivo ? transacoes.filter(r => keepRvTicker(tickerOf(r))) : transacoes;
    const keptTickers = new Set(transacoesF.map(r => tickerOf(r)));
    // Match por base normalizada (sem .SA): o import B3 grava "ITUB4" enquanto
    // as transações usam "ITUB4.SA" — match literal zerava proventos no filtro.
    const keptBase = new Set([...keptTickers].map(tickerBase));
    const proventosF = filtroAtivo
      ? proventos.filter(r => keptBase.has(tickerBase(String(r["ticker"] ?? ""))))
      : proventos;
    const fixaAbertaF = includeRF ? fixaAberta : [];

    const { navByDate: rfNavByDate, flowByDate: rfFlowByDate } = includeRF
      ? buildRfTimeline(rfTransacoes, fixaAberta, dates, alignedFx)
      : { navByDate: {} as Record<string, number>, flowByDate: {} as Record<string, number> };

    const twr = calcularTWR({ transacoes: transacoesF, proventos: proventosF, dates, prices: alignedPrices, fxHistory: alignedFx, pmFx, rfNavByDate, rfFlowByDate });

    // ── Patrimônio total (snapshot completo, preços da golden source) ──────────
    // O TWR/Ganho Econômico mede RETORNO sobre o capital que rende (exclui caixa
    // e RF de saldo manual). O PATRIMÔNIO é tudo que se possui: RV + RF + caixa.
    // Usa o último preço conhecido da golden source por ticker (mesmo cálculo do
    // Resumo), garantindo um único patrimônio consistente entre as páginas.
    const goldenQuotes: Record<string, { price: number; change: number; changePercent: number; currency: string; name: string }> = {};
    for (const [ticker, meta] of tickerMeta) {
      const arr = hist.prices[ticker];
      if (!arr) continue;
      let last: number | null = null;
      for (let j = arr.length - 1; j >= 0; j--) {
        if (arr[j] != null && arr[j]! > 0) { last = arr[j]!; break; }
      }
      if (last == null) continue;
      goldenQuotes[ticker] = {
        price: last, change: 0, changePercent: 0,
        currency: getMoedaEfetiva(ticker, meta.moeda, identificarSetor(ticker)),
        name: ticker,
      };
    }
    const snapshot = calcularSnapshot(transacoesF, proventosF, fixaAbertaF, goldenQuotes, lastFx, pmFx);
    // Caixa = linhas CAIXA/SALDO/CASH/RESERVA da fixa_aberta (que o NAV de retorno
    // exclui de propósito). Precisa existir no patrimônio, mas não no retorno.
    const caixaRows = fixaAbertaF.filter(r =>
      CASH_TICKERS_PATRIMONIO.has(String(r["ticker"] ?? r["ativo"] ?? "").toUpperCase().trim())
    );
    const caixaBRL = calcularRendaFixaBRL(caixaRows, lastFx);
    // Margin (alavancagem): net = bruto − dívida aberta — o "Net liq" da corretora.
    const marginResumo = computeMarginResumo(parseMarginRows(marginRows), {
      BRL: 1, USD: lastFx.USDBRL, EUR: lastFx.EURBRL, GBP: lastFx.GBPBRL,
      CAD: lastFx.CADBRL, CHF: lastFx.CHFBRL ?? 0, JPY: lastFx.JPYBRL ?? 0,
    });
    const alavancagem = aplicarAlavancagem(snapshot.totalPatrimonioBRL, marginResumo);
    const patrimonio = {
      total: snapshot.totalPatrimonioBRL,
      rv: snapshot.rvPatrimonioBRL,
      rf: snapshot.rfPatrimonioBRL,
      caixa: caixaBRL,
      divida: alavancagem.dividaBRL,
      net: alavancagem.netBRL,
      alavancagemPct: alavancagem.alavancagemPct,
    };

    // CDI, IBOV, S&P 500 benchmarks
    const cdiPoints = buildCDIBenchmark(dates);
    const ibovPoints = buildPriceBenchmark("IBOV", dates, alignedIbov);
    const sp500UsdPoints = buildPriceBenchmark("SP500", dates, alignedSP500);

    // S&P 500 in BRL: multiply USD price by USDBRL at each date
    const sp500BrlPrices = alignedSP500.map((p, i) => {
      if (p == null) return null;
      const fx = alignedFx[dates[i]]?.USDBRL ?? 5.7;
      return p * fx;
    });
    const sp500BrlPoints = buildPriceBenchmark("SP500BRL", dates, sp500BrlPrices);

    const benchStart = twr.primeiraData || dates[0];
    function normalizeBenchmark(bench: TwrDayPoint[], from: string): TwrDayPoint[] {
      const si = bench.findIndex(p => p.date >= from);
      if (si < 0) return bench;
      const base = 1 + bench[si].twr;
      return bench.slice(si).map(p => ({ ...p, twr: (1 + p.twr) / base - 1 }));
    }

    const cdiNorm = normalizeBenchmark(cdiPoints, benchStart);
    const ibovNorm = normalizeBenchmark(ibovPoints, benchStart);
    const sp500BrlNorm = normalizeBenchmark(sp500BrlPoints, benchStart);
    const sp500UsdNorm = normalizeBenchmark(sp500UsdPoints, benchStart);

    const cdiTotal = cdiNorm.length > 0 ? cdiNorm[cdiNorm.length - 1].twr : 0;
    const ibovTotal = ibovNorm.length > 0 ? ibovNorm[ibovNorm.length - 1].twr : 0;
    const sp500BrlTotal = sp500BrlNorm.length > 0 ? sp500BrlNorm[sp500BrlNorm.length - 1].twr : 0;

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
      ? drawdownSeries.reduce((min, d) => d.drawdown < min ? d.drawdown : min, 0)
      : 0;

    // Rolling returns
    const ROLLING_WINDOWS: RollingWindow[] = [
      { label: "1M", days: 21 },
      { label: "3M", days: 63 },
      { label: "6M", days: 126 },
      { label: "1A", days: 252 },
    ];
    const rollingReturns = calcularRollingReturns(meaningfulPoints, ROLLING_WINDOWS);

    // MWR/IRR — use engine-calculated value (includes initial NAV, correct thresholds)
    const mwr = twr.mwr ?? 0;

    // Does the filtered portfolio have any foreign currency exposure?
    const hasForexExposure = (() => {
      for (const tk of keptTickers) {
        const meta = tickerMeta.get(tk);
        if (meta && meta.moeda !== "BRL") return true;
      }
      if (includeRF) {
        for (const row of rfTransacoes) {
          const m = String(row["moeda"] ?? "BRL").toUpperCase().trim();
          if (m && m !== "BRL") return true;
        }
      }
      return false;
    })();

    // FX decomposition — base = USDBRL at START of period (not PM dólar),
    // so the decomposition is consistent with the chart and always starts at 0%.
    const fxDecomp = (() => {
      const lastPt = meaningfulPoints[meaningfulPoints.length - 1];
      const r_total = lastPt ? lastPt.twr : 0;
      if (!hasForexExposure) {
        return { r_total, r_ativo: r_total, r_fx: 0, r_combinado: r_total };
      }
      let startFx: number | null = null;
      for (const p of meaningfulPoints) {
        const fx = alignedFx[p.date]?.USDBRL;
        if (fx && fx > 0) { startFx = fx; break; }
      }
      const endFx = lastPt ? alignedFx[lastPt.date]?.USDBRL : null;
      const r_fx = startFx && endFx ? endFx / startFx - 1 : 0;
      const r_ativo = (1 + r_total) / (1 + r_fx) - 1;
      return { r_total, r_ativo, r_fx, r_combinado: (1 + r_ativo) * (1 + r_fx) - 1 };
    })();

    // Attribution
    const attribution = calcularAttributionBySector(meaningfulPoints, transacoes, rfTransacoes);

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

    // Monthly returns (points are already sorted by date)
    const monthlyMap: Record<string, { startFactor: number; endFactor: number }> = {};
    for (const p of meaningfulPoints) {
      const month = p.date.slice(0, 7);
      const factor = 1 + p.twr;
      if (!monthlyMap[month]) {
        monthlyMap[month] = { startFactor: factor, endFactor: factor };
      } else {
        monthlyMap[month].endFactor = factor;
      }
    }
    const monthlyReturns = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { startFactor, endFactor }]) => ({
        month,
        return_pct: startFactor > 0 ? ((endFactor / startFactor) - 1) * 100 : 0,
      }));

    // ── USD view: convert NAV/flows by USDBRL, recompute TWR/MWR ──────────────
    const usdView = (() => {
      if (meaningfulPoints.length < 2) return null;
      const pts = meaningfulPoints.map(p => {
        const fx = alignedFx[p.date]?.USDBRL ?? 5.7;
        return { date: p.date, nav: p.nav / fx, flow: p.flow / fx, income: p.income / fx };
      });

      // Compute TWR from USD NAV series
      let cumTwr = 1.0;
      const usdTwrPoints: Array<{ date: string; nav: number; twr: number; ret: number }> = [];
      for (let i = 0; i < pts.length; i++) {
        if (i === 0) {
          usdTwrPoints.push({ date: pts[i].date, nav: pts[i].nav, twr: 0, ret: 0 });
          continue;
        }
        const prevNav = pts[i - 1].nav;
        const flow = pts[i].flow;
        const navBefore = prevNav + flow;
        // Same Modified Dietz as the BRL engine: income (dividends) is part
        // of the day's economic gain — omitting it understates USD TWR.
        const ret = navBefore > 0 ? ((pts[i].nav + pts[i].income) - navBefore) / navBefore : 0;
        cumTwr *= (1 + ret);
        usdTwrPoints.push({ date: pts[i].date, nav: pts[i].nav, twr: cumTwr - 1, ret });
      }
      const twrTotalUsd = usdTwrPoints.length > 0 ? usdTwrPoints[usdTwrPoints.length - 1].twr : 0;
      const startDUsd = new Date(pts[0].date + "T12:00:00Z");
      const endDUsd = new Date(pts[pts.length - 1].date + "T12:00:00Z");
      const calDaysUsd = Math.round((endDUsd.getTime() - startDUsd.getTime()) / (1000 * 60 * 60 * 24));
      const twrAnualizadoUsd = calDaysUsd > 20 && (1 + twrTotalUsd) > 0
        ? Math.pow(1 + twrTotalUsd, 365 / calDaysUsd) - 1 : twrTotalUsd;

      // MWR in USD — initial NAV as outflow at t=0, subsequent flows only
      // (day-0 flows are already captured in pts[0].nav — including them
      // would double-count the initial investment). Dividends received are
      // investor inflows: net investor flow = flow − income.
      const cfUsd: Array<{ date: string; amount: number }> = [];
      if (pts[0].nav > 0) cfUsd.push({ date: pts[0].date, amount: -pts[0].nav });
      for (let pi = 1; pi < pts.length; pi++) {
        const netFlow = pts[pi].flow - pts[pi].income;
        if (Math.abs(netFlow) > 0.5) cfUsd.push({ date: pts[pi].date, amount: -netFlow });
      }
      if (pts.length > 0) cfUsd.push({ date: pts[pts.length - 1].date, amount: pts[pts.length - 1].nav });
      cfUsd.sort((a, b) => a.date.localeCompare(b.date));
      const mwrUsd = calcularMWR(cfUsd);

      // USD risk metrics (skip first point's zero-return)
      const usdDailyReturns = usdTwrPoints.slice(1).filter(p => isFinite(p.ret)).map(p => p.ret);
      const usdRisk = calcularMetricasRisco(usdDailyReturns, RISK_FREE_USD);

      // USD drawdown
      let peak = 0;
      let maxDd = 0;
      for (const p of usdTwrPoints) {
        const f = 1 + p.twr;
        if (f > peak) peak = f;
        const dd = peak > 0 ? (f / peak) - 1 : 0;
        if (dd < maxDd) maxDd = dd;
      }

      // USD benchmarks: S&P 500 (raw USD), CDI in USD, IBOV in USD
      function convertBenchToUsd(bench: TwrDayPoint[]): TwrDayPoint[] {
        if (bench.length === 0) return bench;
        const firstFx = alignedFx[bench[0].date]?.USDBRL ?? 5.7;
        return bench.map(p => {
          const fx = alignedFx[p.date]?.USDBRL ?? 5.7;
          const brlReturn = p.twr;
          const fxChange = fx / firstFx - 1;
          const usdReturn = (1 + brlReturn) / (1 + fxChange) - 1;
          return { ...p, twr: usdReturn };
        });
      }

      const cdiUsd = convertBenchToUsd(cdiNorm);
      const ibovUsd = convertBenchToUsd(ibovNorm);

      const sp500Total = sp500UsdNorm.length > 0 ? sp500UsdNorm[sp500UsdNorm.length - 1].twr : 0;
      const cdiUsdTotal = cdiUsd.length > 0 ? cdiUsd[cdiUsd.length - 1].twr : 0;
      const ibovUsdTotal = ibovUsd.length > 0 ? ibovUsd[ibovUsd.length - 1].twr : 0;

      // Build chart with merged benchmarks
      const sp500Map = new Map(sp500UsdNorm.map(p => [p.date, p.twr]));
      const cdiUsdMap = new Map(cdiUsd.map(p => [p.date, p.twr]));
      const ibovUsdMap = new Map(ibovUsd.map(p => [p.date, p.twr]));

      const mwrDiarioUsd = calcularMWRDiario(pts);
      const chart = usdTwrPoints.map(p => ({
        date: p.date, nav: p.nav, twr: p.twr, ret: p.ret,
        mwr_twr: mwrDiarioUsd.get(p.date) ?? null,
        sp500_twr: sp500Map.get(p.date) ?? null,
        cdi_twr: cdiUsdMap.get(p.date) ?? null,
        ibov_twr: ibovUsdMap.get(p.date) ?? null,
      }));

      // Monthly returns in USD
      const usdMonthlyMap: Record<string, { sf: number; ef: number; sd: string }> = {};
      for (const p of usdTwrPoints) {
        const m = p.date.slice(0, 7);
        const f = 1 + p.twr;
        if (!usdMonthlyMap[m]) usdMonthlyMap[m] = { sf: f, ef: f, sd: p.date };
        else { if (p.date < usdMonthlyMap[m].sd) { usdMonthlyMap[m].sf = f; usdMonthlyMap[m].sd = p.date; } usdMonthlyMap[m].ef = f; }
      }
      const usdMonthly = Object.entries(usdMonthlyMap).sort(([a], [b]) => a.localeCompare(b))
        .map(([month, { sf, ef }]) => ({ month, return_pct: sf > 0 ? ((ef / sf) - 1) * 100 : 0 }));

      return {
        summary: {
          twrTotal: twrTotalUsd,
          twrAnualizado: twrAnualizadoUsd,
          mwr: mwrUsd,
          navFinal: pts[pts.length - 1].nav,
          navInicial: pts[0].nav,
          totalInvestido: pts.reduce((s, p) => s + Math.max(0, p.flow), 0),
          duracaoAnos: twr.duracaoAnos,
          primeiraData: twr.primeiraData,
          ultimaData: twr.ultimaData,
          vsSP500: twrTotalUsd - sp500Total,
          vsCDI: twrTotalUsd - cdiUsdTotal,
          vsIBOV: twrTotalUsd - ibovUsdTotal,
          sp500Total,
          cdiTotal: cdiUsdTotal,
          ibovTotal: ibovUsdTotal,
          maxDrawdown: maxDd * 100,
          volatility: usdRisk.volatility,
          sharpe: usdRisk.sharpe,
          sortino: usdRisk.sortino,
          var95: usdRisk.var95,
          var99: usdRisk.var99,
          riskFreeRate: usdRisk.riskFreeRate,
          // Same accounting identity as the BRL engine: anchor day (firstIdx
          // === 0, windowed view) measures from end of day 0 and excludes
          // anchor-day flows/income; otherwise day 0 is the first purchase
          // day and its flow counts. NET flows — vendas/saques increase gain.
          ganhoEconomico: (() => {
            const anchor = firstIdx === 0;
            const start = anchor ? 1 : 0;
            let fl = 0, inc = 0;
            for (let pi = start; pi < pts.length; pi++) { fl += pts[pi].flow; inc += pts[pi].income; }
            return pts[pts.length - 1].nav - (anchor ? pts[0].nav : 0) - fl + inc;
          })(),
        },
        chart: thinSeries(chart),
        monthlyReturns: usdMonthly,
      };
    })();

    return NextResponse.json({
      summary: {
        twrTotal: twr.twrTotal,
        twrAnualizado: twr.twrAnualizado,
        mwr,
        navFinal: twr.navFinal,
        navInicial: twr.navInicial,
        totalInvestido: twr.totalInvestido,
        custoPosicoesAtuais: twr.custoPosicoesAtuais,
        duracaoAnos: twr.duracaoAnos,
        primeiraData: twr.primeiraData,
        ultimaData: twr.ultimaData,
        vsCDI: twr.twrTotal - cdiTotal,
        vsIBOV: twr.twrTotal - ibovTotal,
        vsSP500BRL: twr.twrTotal - sp500BrlTotal,
        cdiTotal,
        ibovTotal,
        sp500BrlTotal,
        maxDrawdown,
        volatility: riskMetrics.volatility,
        sharpe: riskMetrics.sharpe,
        sortino: riskMetrics.sortino,
        var95: riskMetrics.var95,
        var99: riskMetrics.var99,
        riskFreeRate: riskMetrics.riskFreeRate,
        ganhoEconomico: twr.ganhoEconomico,
        ganhoDecomposicao: twr.ganhoDecomposicao,
        resultadoTotal: snapshot.retornoTotalRVBRL,
        resultadoTotalPct: snapshot.retornoTotalRVPct,
        custoFIFOSnapshot: snapshot.positions
          .filter(p => !isRendaFixa(p.setor))
          .reduce((s, p) => s + p.custoTotalBRL, 0),
        patrimonio,
        filtros: {
          classe,
          setor: setorFiltro,
          ticker: tickerFiltro,
          rvSetores: [...rvSetores].sort(),
          tickers: [...tickerMeta.keys()].sort(),
          temCripto,
          temRF,
        },
        peakDate,
        troughDate,
        peakTwr: peakTwr === -Infinity ? 0 : peakTwr,
        troughTwr: troughTwr === Infinity ? 0 : troughTwr,
      },
      chart: (() => {
        const cdiMap = new Map(cdiNorm.map(p => [p.date, p.twr]));
        const ibovMap = new Map(ibovNorm.map(p => [p.date, p.twr]));
        const sp500Map = new Map(sp500BrlNorm.map(p => [p.date, p.twr]));
        const mwrDiario = calcularMWRDiario(meaningfulPoints);

        // FX decomposition: use USDBRL at the START of the period as base,
        // so all three lines (portfolio, ativo, fx) begin at 0%.
        const baseFxRate = (() => {
          for (const p of meaningfulPoints) {
            const fx = alignedFx[p.date]?.USDBRL;
            if (fx && fx > 0) return fx;
          }
          return null;
        })();

        const merged = meaningfulPoints.map(p => {
          let fx_twr: number | null = null;
          let ativo_twr: number | null = null;
          if (hasForexExposure && baseFxRate) {
            const curFx = alignedFx[p.date]?.USDBRL;
            if (curFx) {
              fx_twr = curFx / baseFxRate - 1;
              ativo_twr = (1 + p.twr) / (1 + fx_twr) - 1;
            }
          }
          return {
            date: p.date, nav: p.nav, flow: p.flow, ret: p.ret, twr: p.twr,
            mwr_twr: mwrDiario.get(p.date) ?? null,
            cdi_twr: cdiMap.get(p.date) ?? null,
            ibov_twr: ibovMap.get(p.date) ?? null,
            sp500_twr: sp500Map.get(p.date) ?? null,
            fx_twr,
            ativo_twr,
          };
        });
        return thinSeries(merged);
      })(),
      benchmarks: {
        cdi: thinSeries(cdiNorm),
        ibov: thinSeries(ibovNorm),
        sp500brl: thinSeries(sp500BrlNorm),
      },
      usdView,
      drawdown: thinSeries(drawdownSeries.map((d, i) => ({
        date: d.date,
        nav: d.nav,
        flow: meaningfulPoints[i]?.flow ?? 0,
        income: meaningfulPoints[i]?.income ?? 0,
        ret: meaningfulPoints[i]?.ret ?? 0,
        twr: d.drawdown / 100,
        forceZero: meaningfulPoints[i]?.forceZero ?? false,
      }))),
      drawdownData: drawdownSeries.filter((_, i) => i % Math.max(1, Math.floor(drawdownSeries.length / 400)) === 0),
      rolling: rollingReturns.filter((_, i) => i % Math.max(1, Math.floor(rollingReturns.length / 400)) === 0),
      monthlyReturns,
      flowLedger,
      attribution,
      fxDecomposition: fxDecomp,
      diagnostics: twr.diagnostics,
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

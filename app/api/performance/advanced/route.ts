import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";
import { fetchHistoricalData } from "@/lib/market-history";
import { calcularTWR, buildCDIBenchmark, buildPriceBenchmark, buildRfTimeline, type TwrDayPoint } from "@/lib/twr-engine";
import { calcularCambioMetrics, buildPmFxRates, buildRunningPmDolar } from "@/lib/cambio";
import { calcularSnapshot, calcularRendaFixaBRL, tickerBase } from "@/lib/portfolio";
import { MARGIN_TAB, parseMarginRows, computeMarginResumo, aplicarAlavancagem } from "@/lib/margin";
import { identificarSetor, getMoedaEfetiva, isRendaFixa, isRendaFixaPrecificavel } from "@/lib/sectors";
import { readLockedMonthly, lockNewMonths, mergeWithLocked } from "@/lib/twr-monthly-lock";
import { fetchCdiDiario } from "@/lib/bcb";

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

// ── Volatility and risk metrics ───────────────────────────────────────────────

// Fallbacks: o Sharpe/Sortino BRL usa o CDI efetivo do período (rfBRLPeriodo,
// calculado na rota); esta constante só entra sem dados de CDI ou < 1 mês.
// USD: aproximação T-bill — não há série de UST na golden source ainda.
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
  const corretoraFiltro = (searchParams.get("corretora") ?? "").trim();
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
    const corretoras = new Set<string>();
    for (const row of transacoes) {
      const ticker = String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? "").toUpperCase().trim();
      if (!ticker) continue;
      const cor = String(row["corretora"] ?? "").trim();
      if (cor) corretoras.add(cor);
      if (!tickerMeta.has(ticker)) {
        tickerMeta.set(ticker, {
          moeda: String(row["moeda"] ?? "BRL").toUpperCase().trim(),
          corretora: cor,
        });
      }
    }

    // Filtro por corretora: filtra transações cuja corretora bate
    const transacoesCorretora = corretoraFiltro
      ? transacoes.filter(r => {
          const cor = String(r["corretora"] ?? "").trim();
          return cor.toLowerCase() === corretoraFiltro.toLowerCase();
        })
      : transacoes;

    // tickerSectors: setor de cada ticker para filtro no frontend
    const tickerSectors: Record<string, string> = {};
    for (const tk of tickerMeta.keys()) {
      tickerSectors[tk] = identificarSetor(tk);
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

    // Avisos de qualidade de dados gerados nesta rota (fallbacks de FX, preços
    // congelados, moedas sem taxa). Anexados a hist.errors na resposta — nunca
    // silenciosos.
    const extraErrors: string[] = [];

    // CDI real do BCB (SGS série 12) — benchmark CDI e acrual de RF manual.
    // Em falha da API, ambos caem na tabela SELIC embutida (e o aviso aparece).
    const cdiDiario = await fetchCdiDiario(dates[0], dates[dates.length - 1]);
    if (Object.keys(cdiDiario).length === 0) {
      extraErrors.push("API do BCB indisponível — CDI usando tabela SELIC embutida (pode estar defasada)");
    }

    // Série USDBRL alinhada ao grid (ffill+bfill) — substitui os "?? 5.7"
    // pontuais. O hardcode só entra se NÃO houver câmbio em nenhuma data,
    // e isso é reportado.
    const fxUsdSeries: number[] = (() => {
      const out: (number | null)[] = dates.map(d => hist.fxHistory[d]?.USDBRL ?? null);
      let last: number | null = null;
      for (let i = 0; i < out.length; i++) { if (out[i] != null) last = out[i]; else out[i] = last; }
      let next: number | null = null;
      let missing = 0;
      for (let i = out.length - 1; i >= 0; i--) {
        if (out[i] != null) next = out[i];
        else if (next != null) out[i] = next;
        else { out[i] = 5.7; missing++; }
      }
      if (missing > 0) extraErrors.push(`Câmbio USDBRL sem cotação em ${missing} dia(s) do período — usando taxa fixa 5.7`);
      return out as number[];
    })();
    const dateIdxOf = new Map(dates.map((d, i) => [d, i]));
    const fxUsdAt = (date: string): number => fxUsdSeries[dateIdxOf.get(date) ?? fxUsdSeries.length - 1];
    const alignedIbov = dates.map(d => {
      const idx = dateIdxMap.get(d);
      return idx != null ? hist.ibov[idx] : null;
    });
    const alignedSP500 = dates.map(d => {
      const idx = dateIdxMap.get(d);
      return idx != null ? hist.sp500[idx] : null;
    });
    const alignedSP500TR = dates.map(d => {
      const idx = dateIdxMap.get(d);
      return idx != null ? hist.sp500tr[idx] : null;
    });

    // Compute PM FX rates from cambio data (investor's average remittance cost)
    const lastFx = (() => {
      for (let i = dates.length - 1; i >= 0; i--) {
        const fx = hist.fxHistory[dates[i]];
        if (fx) return fx;
      }
      extraErrors.push("Sem histórico de câmbio no período — patrimônio em moeda estrangeira usa taxa fixa 5.7");
      return { USDBRL: 5.7, EURBRL: 6.4, CADBRL: 4.1, GBPBRL: 7.6 };
    })();
    const cambioMetrics = calcularCambioMetrics(cambioRows, lastFx);
    const pmFx = buildPmFxRates(cambioMetrics);
    const runningPm = buildRunningPmDolar(cambioRows);

    // ── Filtro por classe/setor ────────────────────────────────────────────────
    // Setores de RV presentes (para os sub-filtros da página) + flags de classe.
    const rvSetores = new Set<string>();
    let temCripto = false;
    let temPricedRF = false; // SHV/BIL — RF com cotação, na meus_ativos
    for (const row of transacoesCorretora) {
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
    const filtroAtivo = classe !== "tudo" || setoresFiltro.size > 0 || tickerFiltro !== "" || !!corretoraFiltro;
    const transacoesF = filtroAtivo ? transacoesCorretora.filter(r => keepRvTicker(tickerOf(r))) : transacoesCorretora;
    const keptTickers = new Set(transacoesF.map(r => tickerOf(r)));
    // Match por base normalizada (sem .SA): o import B3 grava "ITUB4" enquanto
    // as transações usam "ITUB4.SA" — match literal zerava proventos no filtro.
    const keptBase = new Set([...keptTickers].map(tickerBase));
    const proventosF = filtroAtivo
      ? proventos.filter(r => keptBase.has(tickerBase(String(r["ticker"] ?? ""))))
      : proventos;
    const fixaAbertaF = includeRF
      ? (corretoraFiltro
          ? fixaAberta.filter(r => {
              const cor = String(r["corretora"] ?? "").trim();
              return cor.toLowerCase() === corretoraFiltro.toLowerCase();
            })
          : fixaAberta)
      : [];
    // renda_fixa TEM coluna corretora — filtra por ela
    const rfTransacoesF = includeRF
      ? (corretoraFiltro
          ? rfTransacoes.filter(r => {
              const cor = String(r["corretora"] ?? "").trim();
              return cor.toLowerCase() === corretoraFiltro.toLowerCase();
            })
          : rfTransacoes)
      : [];

    const { navByDate: rfNavByDate, flowByDate: rfFlowByDate, navFxByDate: rfNavFxByDate, costBasisAtual: rfCostBasis } = includeRF
      ? buildRfTimeline(rfTransacoesF, fixaAbertaF, dates, alignedFx, cdiDiario)
      : { navByDate: {} as Record<string, number>, flowByDate: {} as Record<string, number>, navFxByDate: {} as Record<string, number>, costBasisAtual: 0 };

    const twr = calcularTWR({ transacoes: transacoesF, proventos: proventosF, dates, prices: alignedPrices, fxHistory: alignedFx, pmFx, rfNavByDate, rfFlowByDate, rfNavFxByDate, rfCostBasis });

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
    const marginEntries = parseMarginRows(marginRows);
    const marginFxMap: Record<string, number> = {
      BRL: 1, USD: lastFx.USDBRL, EUR: lastFx.EURBRL, GBP: lastFx.GBPBRL,
      CAD: lastFx.CADBRL, CHF: lastFx.CHFBRL ?? 0, JPY: lastFx.JPYBRL ?? 0,
    };
    // Moeda de margin sem taxa de câmbio = dívida valeria 0 (invisível) —
    // reportar em vez de subestimar a alavancagem silenciosamente.
    for (const moeda of new Set(marginEntries.map(e => e.moeda))) {
      if ((marginFxMap[moeda] ?? 0) <= 0) {
        extraErrors.push(`Margin em ${moeda} sem taxa de câmbio disponível — dívida nessa moeda NÃO está no patrimônio líquido`);
      }
    }
    const marginResumo = computeMarginResumo(marginEntries, marginFxMap);
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
    const cdiPoints = buildCDIBenchmark(dates, cdiDiario);
    const ibovPoints = buildPriceBenchmark("IBOV", dates, alignedIbov);

    // S&P 500 TOTAL RETURN: a carteira mede retorno total (preço + proventos);
    // o IBOV já é total return, mas o ^GSPC é índice de PREÇO — compará-lo
    // favorecia a carteira em ~1,3–2% a.a. Série híbrida: retornos do ^SP500TR
    // onde a série cobre; datas sem TR encadeiam retornos do ^GSPC (fallback).
    const sp500MergedPrices: (number | null)[] = (() => {
      const out: (number | null)[] = new Array(dates.length).fill(null);
      let level: number | null = null;
      for (let i = 0; i < dates.length; i++) {
        const tr = alignedSP500TR[i];
        const pr = alignedSP500[i];
        if (level == null) {
          if (tr != null || pr != null) { level = 100; out[i] = level; }
          continue;
        }
        const trPrev = alignedSP500TR[i - 1];
        const prPrev = alignedSP500[i - 1];
        let ret = 0;
        if (tr != null && trPrev != null && trPrev > 0) ret = tr / trPrev - 1;
        else if (pr != null && prPrev != null && prPrev > 0) ret = pr / prPrev - 1;
        level *= 1 + ret;
        out[i] = level;
      }
      return out;
    })();
    if (alignedSP500TR.every(v => v == null)) {
      extraErrors.push("^SP500TR sem dados — benchmark S&P 500 usando índice de preço (^GSPC), que subestima o retorno do índice");
    }
    const sp500UsdPoints = buildPriceBenchmark("SP500", dates, sp500MergedPrices);

    // S&P 500 in BRL: multiply USD level by USDBRL at each date
    const sp500BrlPrices = sp500MergedPrices.map((p, i) => {
      if (p == null) return null;
      return p * fxUsdSeries[i];
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
    // Taxa livre de risco BRL = CDI efetivo do PRÓPRIO período, anualizado —
    // não a constante. Sharpe/Sortino de 2020 (SELIC 2%) e de 2024 (10,5%)
    // passam a usar a régua certa. Fallback para a constante só sem dados de
    // CDI ou período < 1 mês.
    const rfBRLPeriodo = (twr.duracaoAnos > 0.08 && cdiTotal > 0)
      ? Math.pow(1 + cdiTotal, 1 / twr.duracaoAnos) - 1
      : RISK_FREE_BRL;
    const riskMetrics = calcularMetricasRisco(dailyReturns, rfBRLPeriodo);
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

    // FX decomposition — PONDERADA pela participação estrangeira do NAV dia a
    // dia (w = navFx/nav do dia anterior, encadeado geometricamente). A versão
    // anterior assumia 100% de exposição cambial: numa carteira mista BRL/USD
    // superestimava o efeito câmbio e distorcia o "retorno do ativo". USDBRL é
    // proxy para as demais moedas (exposição predominantemente USD).
    const fxTwrByDate = (() => {
      const m = new Map<string, number>();
      let factor = 1.0;
      for (let i = 0; i < meaningfulPoints.length; i++) {
        const p = meaningfulPoints[i];
        if (i > 0 && hasForexExposure) {
          const prev = meaningfulPoints[i - 1];
          const w = prev.nav > 0 ? Math.min(1, Math.max(0, (prev.navFx ?? 0) / prev.nav)) : 0;
          const fxPrev = fxUsdAt(prev.date);
          const fxCur = fxUsdAt(p.date);
          if (fxPrev > 0 && fxCur > 0) factor *= 1 + w * (fxCur / fxPrev - 1);
        }
        m.set(p.date, factor - 1);
      }
      return m;
    })();

    const fxDecomp = (() => {
      const lastPt = meaningfulPoints[meaningfulPoints.length - 1];
      const r_total = lastPt ? lastPt.twr : 0;
      const r_fx = lastPt ? (fxTwrByDate.get(lastPt.date) ?? 0) : 0;
      const r_ativo = (1 + r_total) / (1 + r_fx) - 1;
      return { r_total, r_ativo, r_fx, r_combinado: (1 + r_ativo) * (1 + r_fx) - 1 };
    })();

    // Attribution — contribuição EXATA por setor do motor TWR (ganhos diários
    // Dietz por setor, encadeados; Σ = twrTotal). A versão antiga era peso de
    // custo × TWR total: não continha performance por setor nenhuma.
    const MACRO_MAP: Record<string, string> = {
      "Ações Brasil": "Brasil", "FIIs": "Brasil", "BDRs": "Brasil", "ETF": "Brasil",
      "Ações Internacional": "Exterior", "ETF USA": "Exterior",
      "Renda Fixa": "Renda Fixa", "Renda Fixa USD": "Renda Fixa",
      "Commodities": "Commodities", "Cripto": "Cripto",
    };
    const attribution = twr.contribuicoes.map(c => ({
      setor: c.setor,
      macro: MACRO_MAP[c.setor] ?? "Outros",
      contrib_pct: c.contrib * 100,
      nav_medio: c.navMedio,
    }));

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

    // Monthly returns — chain months so each uses the previous month's end as base
    // Janelas de tempo incluem 1 dia-âncora ANTES do windowStart para o motor TWR
    // ter prevNav > 0. Esse dia-âncora não deve aparecer nos resultados mensais.
    const monthlyEndFactors: Array<{ month: string; endFactor: number }> = [];
    for (const p of meaningfulPoints) {
      if (isWindowed && p.date < windowStart) continue;
      const month = p.date.slice(0, 7);
      const factor = 1 + p.twr;
      const last = monthlyEndFactors[monthlyEndFactors.length - 1];
      if (!last || last.month !== month) {
        monthlyEndFactors.push({ month, endFactor: factor });
      } else {
        last.endFactor = factor;
      }
    }
    const computedMonthly = monthlyEndFactors.map((m, i) => {
      const prevFactor = i === 0 ? 1.0 : monthlyEndFactors[i - 1].endFactor;
      return {
        month: m.month,
        return_pct: prevFactor > 0 ? ((m.endFactor / prevFactor) - 1) * 100 : 0,
      };
    });

    // Meses fechados usam valor travado (imutável); mês corrente é sempre dinâmico.
    // Os valores travados são da CARTEIRA COMPLETA ALL-TIME — em views com janela
    // de tempo (YTD, 1A, custom) ou filtros de ativo, o motor TWR roda sobre um
    // subconjunto e os fatores encadeados são diferentes; aplicar os travados
    // causaria divergência com o TWR acumulado do card principal.
    const isAllTimeUnfiltered = !tickerFiltro && !corretoraFiltro && classe === "tudo" && setoresFiltro.size === 0
      && lookback === 0 && !fromParam && !toParam;
    const lockedMonths = isAllTimeUnfiltered ? await readLockedMonthly() : [];
    const monthlyReturns = mergeWithLocked(lockedMonths, computedMonthly, "brl");

    // Monthly MTM snapshots — R$ gain per month using period-end prices/FX
    // Em janelas (YTD/1A/…), o dia-âncora (prevNav) estabelece o NAV de
    // abertura — sem ele, o primeiro mês computaria gain = NAV inteiro.
    const monthlyMTM: Array<{ month: string; gain: number; gainPct: number; navEnd: number }> = (() => {
      const buckets = new Map<string, { navEnd: number; flows: number; income: number }>();
      let anchorNav = 0;
      for (const p of meaningfulPoints) {
        if (isWindowed && p.date < windowStart) { anchorNav = p.nav; continue; }
        const m = p.date.slice(0, 7);
        const b = buckets.get(m);
        if (b) { b.navEnd = p.nav; b.flows += p.flow; b.income += p.income; }
        else buckets.set(m, { navEnd: p.nav, flows: p.flow, income: p.income });
      }
      const out: Array<{ month: string; gain: number; gainPct: number; navEnd: number }> = [];
      let prev = anchorNav;
      for (const [month, { navEnd, flows, income }] of buckets) {
        const gain = navEnd + income - prev - flows;
        const base = prev > 0 ? prev : Math.abs(flows);
        out.push({ month, gain, gainPct: base > 0 ? (gain / base) * 100 : 0, navEnd });
        prev = navEnd;
      }
      return out;
    })();

    // ── USD view: convert NAV/flows by USDBRL, recompute TWR/MWR ──────────────
    let rawUsdMonthly: Array<{ month: string; return_pct: number }> | null = null;
    const usdView = (() => {
      if (meaningfulPoints.length < 2) return null;
      const pts = meaningfulPoints.map(p => {
        const fx = fxUsdAt(p.date);
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
        const firstFx = fxUsdAt(bench[0].date);
        return bench.map(p => {
          const fx = fxUsdAt(p.date);
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

      // FX decomposition for USD investor — inversa da visão BRL e PONDERADA:
      // o risco cambial do investidor USD está nos ativos em BRL, então o peso
      // é (1 − participação estrangeira do NAV) e o retorno FX do dia é
      // fx_{d-1}/fx_d − 1 (valorização do USD deprecia os ativos BRL em USD).
      const fxTwrUsdByDate = (() => {
        const m = new Map<string, number>();
        let factor = 1.0;
        for (let i = 0; i < meaningfulPoints.length; i++) {
          const p = meaningfulPoints[i];
          if (i > 0) {
            const prev = meaningfulPoints[i - 1];
            const wBrl = prev.nav > 0
              ? Math.min(1, Math.max(0, 1 - (prev.navFx ?? 0) / prev.nav))
              : 0;
            const fxPrev = fxUsdAt(prev.date);
            const fxCur = fxUsdAt(p.date);
            if (fxPrev > 0 && fxCur > 0) factor *= 1 + wBrl * (fxPrev / fxCur - 1);
          }
          m.set(p.date, factor - 1);
        }
        return m;
      })();

      const chart = usdTwrPoints.map(p => {
        let fx_twr: number | null = null;
        let ativo_twr: number | null = null;
        const f = fxTwrUsdByDate.get(p.date);
        if (f != null) {
          fx_twr = f;
          ativo_twr = (1 + p.twr) / (1 + f) - 1;
        }
        return {
          date: p.date, nav: p.nav, twr: p.twr, ret: p.ret,
          mwr_twr: mwrDiarioUsd.get(p.date) ?? null,
          sp500_twr: sp500Map.get(p.date) ?? null,
          cdi_twr: cdiUsdMap.get(p.date) ?? null,
          ibov_twr: ibovUsdMap.get(p.date) ?? null,
          fx_twr,
          ativo_twr,
        };
      });

      // Summary-level FX decomposition for USD view
      const usdFxDecomp = (() => {
        const r_total = twrTotalUsd;
        const lastPt = meaningfulPoints[meaningfulPoints.length - 1];
        const r_fx = lastPt ? (fxTwrUsdByDate.get(lastPt.date) ?? 0) : 0;
        const r_ativo = (1 + r_total) / (1 + r_fx) - 1;
        return { r_total, r_ativo, r_fx, r_combinado: (1 + r_ativo) * (1 + r_fx) - 1 };
      })();

      // Monthly returns in USD — chain months (same logic as BRL, skip anchor)
      const usdMonthlyEnds: Array<{ month: string; endFactor: number }> = [];
      for (const p of usdTwrPoints) {
        if (isWindowed && p.date < windowStart) continue;
        const m = p.date.slice(0, 7);
        const f = 1 + p.twr;
        const last = usdMonthlyEnds[usdMonthlyEnds.length - 1];
        if (!last || last.month !== m) {
          usdMonthlyEnds.push({ month: m, endFactor: f });
        } else {
          last.endFactor = f;
        }
      }
      const computedUsdMonthly = usdMonthlyEnds.map((m, i) => {
        const prev = i === 0 ? 1.0 : usdMonthlyEnds[i - 1].endFactor;
        return { month: m.month, return_pct: prev > 0 ? ((m.endFactor / prev) - 1) * 100 : 0 };
      });
      rawUsdMonthly = computedUsdMonthly;
      const usdMonthly = mergeWithLocked(lockedMonths, computedUsdMonthly, "usd");

      const usdMTM: Array<{ month: string; gain: number; gainPct: number; navEnd: number }> = (() => {
        const buckets = new Map<string, { navEnd: number; flows: number; income: number }>();
        let anchorNav = 0;
        for (const p of pts) {
          if (isWindowed && p.date < windowStart) { anchorNav = p.nav; continue; }
          const m = p.date.slice(0, 7);
          const b = buckets.get(m);
          if (b) { b.navEnd = p.nav; b.flows += p.flow; b.income += p.income; }
          else buckets.set(m, { navEnd: p.nav, flows: p.flow, income: p.income });
        }
        const out: Array<{ month: string; gain: number; gainPct: number; navEnd: number }> = [];
        let prev = anchorNav;
        for (const [month, { navEnd, flows, income }] of buckets) {
          const gain = navEnd + income - prev - flows;
          const base = prev > 0 ? prev : Math.abs(flows);
          out.push({ month, gain, gainPct: base > 0 ? (gain / base) * 100 : 0, navEnd });
          prev = navEnd;
        }
        return out;
      })();

      const fxDiv = lastFx.USDBRL || 5.7;

      // ── Native USD P&L ────────────────────────────────────────────
      // For foreign-currency positions, compute gain in native currency
      // then convert to USD — avoids the FX distortion that results
      // from dividing BRL gain (which embeds pmDólar cost) by current
      // USDBRL. For the filtered-ticker case (e.g. NVIDIA), this
      // matches the brokerage's USD P&L exactly.
      const nativeUsd = (() => {
        let gains = 0;
        let custo = 0;
        let openGainsBRL = 0;
        for (const p of snapshot.positions) {
          if (isRendaFixa(p.setor)) continue;
          openGainsBRL += p.retornoTotalBRL ?? 0;
          if (p.moeda !== "BRL" && p.fatorBRL > 0) {
            const unrealized = p.valorAtual != null ? p.valorAtual - p.custoTotal : 0;
            const dividendsNative = p.proventosBRL / p.fatorBRL;
            const toUsd = p.fatorBRL / fxDiv;
            gains += (unrealized + p.lucroRealizado + dividendsNative) * toUsd;
            custo += p.custoTotal * toUsd;
          } else {
            gains += (p.retornoTotalBRL ?? 0) / fxDiv;
            custo += p.custoTotalBRL / fxDiv;
          }
        }
        const closedBRL = snapshot.retornoTotalRVBRL - openGainsBRL;
        if (Math.abs(closedBRL) > 1) gains += closedBRL / fxDiv;
        return { gains, custo, pct: custo > 0 ? (gains / custo) * 100 : 0 };
      })();

      return {
        summary: {
          twrTotal: twrTotalUsd,
          twrAnualizado: twrAnualizadoUsd,
          mwr: mwrUsd,
          navFinal: pts[pts.length - 1].nav,
          navInicial: pts[0].nav,
          totalInvestido: pts.reduce((s, p) => s + Math.max(0, p.flow), 0),
          custoPosicoesAtuais: nativeUsd.custo,
          custoFIFOSnapshot: nativeUsd.custo,
          resultadoTotal: nativeUsd.gains,
          resultadoTotalPct: nativeUsd.pct,
          patrimonio: {
            total: patrimonio.total / fxDiv,
            rv: patrimonio.rv / fxDiv,
            rf: patrimonio.rf / fxDiv,
            caixa: patrimonio.caixa / fxDiv,
            divida: (patrimonio.divida ?? 0) / fxDiv,
            net: (patrimonio.net ?? patrimonio.total) / fxDiv,
            alavancagemPct: patrimonio.alavancagemPct ?? 0,
          },
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
        monthlyMTM: usdMTM,
        fxDecomposition: usdFxDecomp,
      };
    })();

    // Trava retornos mensais de meses já fechados (fire-and-forget)
    const isFullView = isAllTimeUnfiltered;
    if (isFullView) {
      // Janela com lookback corta o primeiro mês no meio — esse mês de
      // fronteira é PARCIAL e nunca pode ser travado como retorno do mês.
      const lockableBrl = lookback > 0 ? computedMonthly.slice(1) : computedMonthly;
      const lockableUsd = rawUsdMonthly == null
        ? null
        : (lookback > 0 ? (rawUsdMonthly as Array<{ month: string; return_pct: number }>).slice(1) : rawUsdMonthly);
      lockNewMonths(lockableBrl, lockableUsd).catch(() => {});
    }

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
          corretora: corretoraFiltro,
          rvSetores: [...rvSetores].sort(),
          tickers: [...tickerMeta.keys()].sort(),
          tickerSectors,
          corretoras: [...corretoras].sort(),
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

        const merged = meaningfulPoints.map(p => {
          // Efeito câmbio ponderado pela exposição estrangeira diária do NAV
          // (série fxTwrByDate — mesma da decomposição do summary).
          let fx_twr: number | null = null;
          let ativo_twr: number | null = null;
          if (hasForexExposure) {
            const f = fxTwrByDate.get(p.date);
            if (f != null) {
              fx_twr = f;
              ativo_twr = (1 + p.twr) / (1 + f) - 1;
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
      monthlyMTM,
      flowLedger,
      attribution,
      fxDecomposition: fxDecomp,
      diagnostics: twr.diagnostics,
      errors: (() => {
        // Diagnósticos do motor viram avisos visíveis no painel "Avisos de dados"
        const diagErrors: string[] = [];
        if (twr.diagnostics.fxFallbackDays > 0) {
          diagErrors.push(`Câmbio ausente em ${twr.diagnostics.fxFallbackDays} dia(s) no motor TWR — taxa fixa aplicada`);
        }
        if (twr.diagnostics.tickersAtCost.length > 0) {
          diagErrors.push(`Sem cotação de mercado (valorados ao custo médio de compra): ${twr.diagnostics.tickersAtCost.join(", ")}`);
        }
        for (const sp of twr.diagnostics.stalePrices) {
          diagErrors.push(`Preço de ${sp.ticker} congelado desde ${sp.lastPriceDate} (sem cotação nova — forward-fill ativo)`);
        }
        return [...hist.errors, ...extraErrors, ...diagErrors];
      })(),
      lookback,
    }, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { toNumber } from "./format";
import { identificarSetor, getMoedaEfetiva, isRendaFixa } from "./sectors";
import type { FxRates } from "./cotacoes";

type Row = Record<string, unknown>;

// ─── Date utilities ───────────────────────────────────────────────────────────

function toYMD(val: unknown): string {
  if (!val) return "";
  if (typeof val === "number") {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().split("T")[0];
  }
  const s = String(val).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

function nextBusinessDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export function businessDays(startStr: string, endStr: string): string[] {
  const result: string[] = [];
  const cur = new Date(startStr + "T12:00:00Z");
  const end = new Date(endStr + "T12:00:00Z");
  while (cur <= end) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) {
      result.push(cur.toISOString().split("T")[0]);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

// ─── Parsed transaction ────────────────────────────────────────────────────────

export interface ParsedTx {
  date: string;
  bizDate: string;
  ticker: string;
  tipo: "Compra" | "Venda";
  quantidade: number;
  preco: number;
  taxas: number;
  moeda: string;
  setor: string;
}

export function parseRVTransactions(rows: Row[]): ParsedTx[] {
  const result: ParsedTx[] = [];

  for (const row of rows) {
    const ticker = String(
      row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? ""
    ).toUpperCase().trim();
    if (!ticker) continue;

    const setor = identificarSetor(ticker);
    if (isRendaFixa(setor)) continue;

    const tipoRaw = String(
      row["tipo de transação"] ?? row["tipo de transacao"] ?? row["tipo"] ?? ""
    ).toLowerCase();

    let tipo: "Compra" | "Venda" | null = null;
    if (tipoRaw.includes("compra") || tipoRaw.includes("buy") || tipoRaw.includes("aporte") || tipoRaw.includes("subscri") || tipoRaw.includes("bonif")) tipo = "Compra";
    else if (tipoRaw.includes("venda") || tipoRaw.includes("sell") || tipoRaw.includes("resgate")) tipo = "Venda";
    if (!tipo) continue;

    const quantidade = Math.abs(toNumber(row["quantidade"] ?? row["qtd"] ?? row["quantity"]) ?? 0);
    if (quantidade < 0.000001) continue;

    const preco = Math.abs(toNumber(row["preço"] ?? row["preco"] ?? row["price"]) ?? 0);
    const taxas = Math.abs(toNumber(row["taxa de corretagem"] ?? row["taxas"] ?? row["taxa"]) ?? 0);
    const moedaRaw = String(row["moeda"] ?? row["currency"] ?? "BRL").toUpperCase().trim();
    const moeda = getMoedaEfetiva(ticker, moedaRaw || "BRL", setor);
    const date = toYMD(row["data"] ?? row["date"]);
    if (!date) continue;

    result.push({ date, bizDate: nextBusinessDay(date), ticker, tipo, quantidade, preco, taxas, moeda, setor });
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Parse proventos ─────────────────────────────────────────────────────────

interface ParsedIncome {
  date: string;
  bizDate: string;
  ticker: string;
  valor: number;
  moeda: string;
}

export function parseProventos(rows: Row[]): ParsedIncome[] {
  const result: ParsedIncome[] = [];
  for (const row of rows) {
    const ticker = String(row["ticker"] ?? "").toUpperCase().trim();
    if (!ticker) continue;

    const decisao = String(row["decisao"] ?? row["decisão"] ?? "").toLowerCase();
    if (decisao.includes("imposto")) continue;

    const valor = Math.abs(toNumber(row["valor"]) ?? 0);
    if (valor < 0.01) continue;

    const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim();
    const date = toYMD(row["data"] ?? row["date"]);
    if (!date) continue;

    result.push({ date, bizDate: nextBusinessDay(date), ticker, valor, moeda });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Daily custody reconstruction (FIFO cumulative) ───────────────────────────

type CustodySnapshot = Record<string, number>;

function buildDailyCustody(txs: ParsedTx[], dates: string[]): CustodySnapshot[] {
  const events = txs.map(tx => ({
    date: tx.bizDate,
    ticker: tx.ticker,
    delta: tx.tipo === "Compra" ? tx.quantidade : -tx.quantidade,
  })).sort((a, b) => a.date.localeCompare(b.date));

  const running: Record<string, number> = {};
  let evtIdx = 0;
  const n = dates.length;
  const custody: CustodySnapshot[] = new Array(n);

  for (let i = 0; i < n; i++) {
    while (evtIdx < events.length && events[evtIdx].date <= dates[i]) {
      const e = events[evtIdx++];
      running[e.ticker] = (running[e.ticker] ?? 0) + e.delta;
    }
    custody[i] = { ...running };
  }

  return custody;
}

// ─── Price lookup (forward-fill up to 5 days) ─────────────────────────────────

function getPrice(
  ticker: string,
  idx: number,
  prices: PriceMatrix
): number | null {
  const arr = prices[ticker];
  if (!arr) return null;
  for (let j = idx; j >= Math.max(0, idx - 5); j--) {
    if (arr[j] != null) return arr[j]!;
  }
  return null;
}

// ─── FX helpers ───────────────────────────────────────────────────────────────

function fxFactor(moeda: string, fx: FxRates): number {
  const c = moeda.toUpperCase();
  if (c === "BRL") return 1;
  if (c === "USD") return fx.USDBRL;
  if (c === "EUR") return fx.EURBRL;
  if (c === "CAD") return fx.CADBRL;
  if (c === "GBP") return fx.GBPBRL;
  return 1;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FLOW_THRESHOLD = 0.01; // 1% of NAV — triggers SoD timing
const LARGE_FLOW_FORCE_ZERO = 0.90; // 90% — flow is too large, skip day
const BUSINESS_DAYS_PER_YEAR = 252; // ANBIMA standard
const MAX_DAILY_RETURN = 0.50; // Cap daily return at ±50% (matching Python canonical engine)
const MAX_UNEXPLAINED_CHANGE = 0.40; // 40% NAV variation without flow → smooth

// ─── Public types ─────────────────────────────────────────────────────────────

export type PriceMatrix = Record<string, (number | null)[]>;

export interface FxHistory {
  [date: string]: FxRates;
}

export interface TwrDayPoint {
  date: string;
  nav: number;
  flow: number;
  income: number;
  ret: number;
  twr: number;
  forceZero: boolean;
}

export interface TwrResult {
  points: TwrDayPoint[];
  twrTotal: number;
  twrAnualizado: number;
  navInicial: number;
  navFinal: number;
  duracaoAnos: number;
  primeiraData: string;
  ultimaData: string;
  totalInvestido: number;
  ganhoEconomico: number;
  mwr: number | null;
}

export interface TwrInput {
  transacoes: Row[];
  proventos?: Row[];
  dates: string[];
  prices: PriceMatrix;
  fxHistory: FxHistory;
  rfNavByDate?: Record<string, number>;
  pmFx?: FxRates;
}

// ─── MWR (Money-Weighted Return / XIRR) — matches Python mwr.py ─────────────
// Uses year fractions (days / 365.25) and Newton-Raphson with bisection fallback.
// Convention: aporte (purchase) = negative (investor outflow), NAV final = positive.

function calculateMWR(
  flows: { date: string; amount: number }[],
  navFinal: number,
  lastDate: string,
  navInicial: number,
  firstDate: string,
): number | null {
  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
  const baseMs = new Date(firstDate + "T12:00:00Z").getTime();
  const lastMs = new Date(lastDate + "T12:00:00Z").getTime();
  const tFinal = (lastMs - baseMs) / MS_PER_YEAR;
  if (tFinal <= 0) return null;

  // Build cashflow vector: [yearFraction, amount]
  const cf: [number, number][] = [];
  if (navInicial > 0) cf.push([0, -navInicial]);
  for (const f of flows) {
    const t = (new Date(f.date + "T12:00:00Z").getTime() - baseMs) / MS_PER_YEAR;
    cf.push([t, -f.amount]);
  }
  cf.push([tFinal, navFinal]);
  cf.sort((a, b) => a[0] - b[0]);
  if (cf.length < 2) return null;

  function npv(rate: number): number {
    if (rate <= -1) return Infinity;
    return cf.reduce((s, [t, amt]) => s + amt / Math.pow(1 + rate, t), 0);
  }
  function npvDeriv(rate: number): number {
    if (rate <= -1) return Infinity;
    return cf.reduce((s, [t, amt]) => s - t * amt / Math.pow(1 + rate, t + 1), 0);
  }

  let r = 0.05;
  let converged = false;
  for (const guess of [0.05, 0.0, 0.2, -0.3, 0.5]) {
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
      if (Math.abs(fMid) < 1e-8 || Math.abs(high - low) < 1e-8) { r = mid; converged = true; break; }
      if (fLow * fMid < 0) { high = mid; } else { low = mid; fLow = fMid; }
    }
    if (!converged) r = (low + high) / 2;
  }

  if (!isFinite(r) || Math.abs(r) > 10) return null;
  return r;
}

// ─── Main TWR calculation ──────────────────────────────────────────────────────

export function calcularTWR(input: TwrInput): TwrResult {
  const { dates, prices, fxHistory, rfNavByDate, pmFx } = input;

  const EMPTY: TwrResult = {
    points: [], twrTotal: 0, twrAnualizado: 0,
    navInicial: 0, navFinal: 0, duracaoAnos: 0,
    primeiraData: "", ultimaData: "", totalInvestido: 0,
    ganhoEconomico: 0, mwr: null,
  };

  if (dates.length === 0) return EMPTY;

  const txs = parseRVTransactions(input.transacoes);
  const incomeEvents = input.proventos ? parseProventos(input.proventos) : [];

  const lastDate = dates[dates.length - 1];
  const inRange = txs.filter(tx => tx.date <= lastDate);
  if (inRange.length === 0) return EMPTY;

  // ── Pre-fill price matrix: ffill + bfill (matching Python engine) ──
  // Without this, tickers with >5 day price gaps disappear from NAV.
  for (const ticker of Object.keys(prices)) {
    const arr = prices[ticker];
    let lastKnown: number | null = null;
    for (let j = 0; j < arr.length; j++) {
      if (arr[j] != null) lastKnown = arr[j];
      else if (lastKnown != null) arr[j] = lastKnown;
    }
    let firstKnown: number | null = null;
    for (let j = arr.length - 1; j >= 0; j--) {
      if (arr[j] != null) firstKnown = arr[j];
      else if (firstKnown != null) arr[j] = firstKnown;
    }
  }

  const custody = buildDailyCustody(inRange, dates);

  const sortedTxs = [...inRange].sort((a, b) => a.bizDate.localeCompare(b.bizDate));
  let txIdx = 0;
  const sortedInc = [...incomeEvents].sort((a, b) => a.bizDate.localeCompare(b.bizDate));
  let incIdx = 0;

  const points: TwrDayPoint[] = [];
  let prevNav = 0;
  let cumTwr = 1.0;
  let totalInvestido = 0;
  let totalFlows = 0;
  const mwrFlows: { date: string; amount: number }[] = [];
  const firstDate = dates[0];

  // Pre-window transactions establish the OPENING position only. The custody
  // snapshot already folds them into navInicial, so they must NOT be replayed
  // as in-window cash flows. Otherwise a windowed view (YTD/1M/…) dumps the
  // entire historical portfolio as a giant day-1 inflow — inflating
  // totalInvestido (e.g. R$177k on YTD) and collapsing MWR to nonsense
  // (e.g. −89%). This mirrors Python's approach of slicing a pre-computed
  // NAV/flow series: only flows that fall inside the window count.
  while (txIdx < sortedTxs.length && sortedTxs[txIdx].bizDate < firstDate) txIdx++;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const snap = custody[i];
    const fx = fxHistory[date] ?? { USDBRL: 5.7, EURBRL: 6.4, CADBRL: 4.1, GBPBRL: 7.6 } as FxRates;

    // ── RV NAV ──
    let navRV = 0;
    for (const [ticker, qty] of Object.entries(snap)) {
      if (qty < 0.000001) continue;
      const price = getPrice(ticker, i, prices);
      if (price == null) continue;
      const setor = identificarSetor(ticker);
      const moeda = getMoedaEfetiva(ticker, "BRL", setor);
      navRV += qty * price * fxFactor(moeda, fx);
    }

    // ── RF NAV ──
    const navRF = rfNavByDate?.[date] ?? 0;
    let nav = navRV + navRF;

    // ── Flows: use MARKET prices (consistent with NAV) — Python engine v10.0 ──
    // Fall back to transaction price if no market price available.
    // Use SPOT FX for flows (same as NAV) to avoid flow/NAV mismatch.
    let flow = 0;
    while (txIdx < sortedTxs.length && sortedTxs[txIdx].bizDate <= date) {
      const tx = sortedTxs[txIdx++];
      let marketPrice = getPrice(tx.ticker, i, prices);
      if (marketPrice == null && i > 0) marketPrice = getPrice(tx.ticker, i - 1, prices);
      const price = (marketPrice != null && marketPrice > 0) ? marketPrice : tx.preco;
      const txFx = fxFactor(tx.moeda, fx);
      const value = tx.quantidade * price * txFx;
      if (tx.tipo === "Compra") {
        flow += value;
        totalInvestido += tx.preco * tx.quantidade * txFx;
      } else {
        flow -= value;
      }
    }
    // ── Income: dividends/JCP received (incremental, synced with custody) ──
    let income = 0;
    while (incIdx < sortedInc.length && sortedInc[incIdx].bizDate <= date) {
      const inc = sortedInc[incIdx++];
      income += inc.valor * fxFactor(inc.moeda, fx);
    }

    // ── NAV gap handling (Python engine v3.1–v3.3) ──
    if (i > 0 && prevNav > 0) {
      // v3.2: Forward-fill NAV if it drops to 0/NaN but previous was valid
      if (nav <= 0 || !isFinite(nav)) {
        nav = Math.max(0, prevNav + flow);
      }
      // v3.3: Smooth unexplained NAV jumps (>40%) when no flow present
      else if (Math.abs(flow) < 1.0) {
        const navExpected = prevNav + flow;
        if (navExpected > 0) {
          const variation = (nav - navExpected) / navExpected;
          if (Math.abs(variation) > MAX_UNEXPLAINED_CHANGE) {
            nav = 0.8 * navExpected + 0.2 * nav;
          }
        }
      }
    }

    // ── v9.0: Flow-NAV consistency correction ──
    // On purchase days, if flow doesn't match NAV delta (>10% tolerance),
    // adjust flow to match. Prevents artificial returns from price mismatches.
    if (flow > 0 && prevNav > 0) {
      const navDelta = nav - prevNav;
      if (Math.abs(navDelta - flow) > Math.abs(flow) * 0.10) {
        flow = navDelta;
      }
    }

    totalFlows += flow;

    // ── MWR flow tracking ──
    if (Math.abs(flow) > 0.01) {
      mwrFlows.push({ date, amount: flow });
    }

    // ── Flow timing & force_zero logic (from Streamlit engine) ──
    let forceZero = false;
    let isSoD = false;

    // Rule 1: Previous NAV ≤ 0 — no capital base, return undefined
    if (prevNav <= 0) {
      forceZero = true;
    }
    // Rule 2: Enormous flow (>90% of NAV) — return is meaningless
    else if (Math.abs(flow) / prevNav > LARGE_FLOW_FORCE_ZERO) {
      forceZero = true;
    }
    // Rule 3: Large inflow (>1% of NAV) — use SoD to prevent inflation
    else if (flow > 0 && flow / prevNav > FLOW_THRESHOLD) {
      isSoD = true;
    }
    // Rule 4: Large outflow (>1% of NAV) — use SoD to prevent deflation
    else if (flow < 0 && Math.abs(flow) / prevNav > FLOW_THRESHOLD) {
      isSoD = true;
    }

    // ── Modified Dietz daily return ──
    let ret = 0;
    if (!forceZero) {
      const economicGain = (nav + income) - prevNav - flow;
      const base = isSoD ? prevNav + flow : prevNav;
      if (base > 0) {
        ret = economicGain / base;
      }
    }

    // Guard against data anomalies — clip to ±50% (matching Python canonical engine)
    ret = Math.max(-MAX_DAILY_RETURN, Math.min(MAX_DAILY_RETURN, ret));
    cumTwr *= (1 + ret);

    points.push({ date, nav, flow, income, ret, twr: cumTwr - 1, forceZero });
    prevNav = nav;
  }

  // Find first day with NAV > 0 (first capital injection)
  const firstMeaningful = points.find(p => p.nav > 0);
  if (!firstMeaningful) return { ...EMPTY, points };

  const last = points[points.length - 1];
  const firstIdx = points.indexOf(firstMeaningful);

  // Recompute cumTwr starting from firstMeaningful (avoid pre-capital noise)
  let cleanCum = 1.0;
  for (let i = firstIdx; i < points.length; i++) {
    if (!points[i].forceZero) {
      cleanCum *= (1 + points[i].ret);
    }
    points[i].twr = cleanCum - 1;
  }
  // Zero out TWR for pre-capital days
  for (let i = 0; i < firstIdx; i++) {
    points[i].twr = 0;
  }

  const twrTotal = cleanCum - 1;

  // Annualize using calendar days / 365 (matching Streamlit calculator.py line 401)
  const startD = new Date(firstMeaningful.date + "T12:00:00Z");
  const endD = new Date(last.date + "T12:00:00Z");
  const calendarDays = Math.round((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24));
  const duracaoAnos = calendarDays / 365;

  const twrAnualizado = calendarDays > 20 && (1 + twrTotal) > 0
    ? Math.pow(1 + twrTotal, 365 / calendarDays) - 1
    : twrTotal;

  // Python formula: total_pnl = nav_final - nav_inicial - total_flow + first_flow
  // This avoids double-counting the initial capital (nav_inicial ≈ first_flow)
  const firstMeaningfulFlow = points[firstIdx].flow;
  const ganhoEconomico = last.nav - firstMeaningful.nav - totalFlows + firstMeaningfulFlow;

  const mwr = calculateMWR(
    mwrFlows, last.nav, last.date,
    firstMeaningful.nav, firstMeaningful.date,
  );

  return {
    points,
    twrTotal,
    twrAnualizado,
    navInicial: firstMeaningful.nav,
    navFinal: last.nav,
    duracaoAnos,
    primeiraData: firstMeaningful.date,
    ultimaData: last.date,
    totalInvestido,
    ganhoEconomico,
    mwr,
  };
}

// ─── Business days counter ───────────────────────────────────────────────────

function businessDaysBetween(startStr: string, endStr: string): number {
  let count = 0;
  const cur = new Date(startStr + "T12:00:00Z");
  const end = new Date(endStr + "T12:00:00Z");
  while (cur <= end) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(count - 1, 0);
}

// ─── CDI benchmark (SELIC proxy) ──────────────────────────────────────────────

const SELIC_ANUAL = 0.1475; // 14.75% a.a. (SELIC vigente)
const SELIC_DIARIA = Math.pow(1 + SELIC_ANUAL, 1 / 252) - 1;

export function buildCDIBenchmark(dates: string[]): TwrDayPoint[] {
  let cdi = 1.0;
  return dates.map((date, i) => {
    const ret = i === 0 ? 0 : SELIC_DIARIA;
    cdi *= 1 + ret;
    return { date, nav: cdi, flow: 0, income: 0, ret, twr: cdi - 1, forceZero: false };
  });
}

// ─── IBOV benchmark builder (from raw price array) ────────────────────────────

export function buildPriceBenchmark(
  _name: string,
  dates: string[],
  prices: (number | null)[]
): TwrDayPoint[] {
  let base: number | null = null;
  let prevPrice: number | null = null;
  let cumTwr = 1.0;

  return dates.map((date, i) => {
    const price = prices[i] ?? prevPrice;
    if (price == null) return { date, nav: 0, flow: 0, income: 0, ret: 0, twr: 0, forceZero: false };

    if (base == null) base = price;
    const ret = prevPrice != null && prevPrice > 0 ? (price - prevPrice) / prevPrice : 0;
    cumTwr *= 1 + ret;
    prevPrice = price;

    return { date, nav: price / base, flow: 0, income: 0, ret, twr: cumTwr - 1, forceZero: false };
  });
}

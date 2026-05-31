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
const MAX_DAILY_RETURN = 0.50; // Cap daily return at ±50%

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
}

// ─── MWR (Money-Weighted Return) via Newton-Raphson ──────────────────────────

function calculateMWR(
  flows: { day: number; amount: number }[],
  navFinal: number,
  totalDays: number,
): number | null {
  if (totalDays <= 0 || flows.length === 0) return null;

  // NPV function: Σ(-flow / (1+r)^day) + navFinal / (1+r)^totalDays = 0
  let r = 0.0001; // daily rate initial guess

  for (let iter = 0; iter < 200; iter++) {
    let npv = navFinal / Math.pow(1 + r, totalDays);
    let dnpv = -totalDays * navFinal / Math.pow(1 + r, totalDays + 1);

    for (const f of flows) {
      npv -= f.amount / Math.pow(1 + r, f.day);
      dnpv += f.day * f.amount / Math.pow(1 + r, f.day + 1);
    }

    if (Math.abs(npv) < 1e-6) break;
    if (Math.abs(dnpv) < 1e-12) return null;

    const step = npv / dnpv;
    r -= step;

    if (r <= -1) r = -0.99;
    if (r > 1) r = 1.0;
  }

  // Annualise: (1 + daily_rate)^252 - 1
  const annual = Math.pow(1 + r, BUSINESS_DAYS_PER_YEAR) - 1;
  if (!isFinite(annual) || Math.abs(annual) > 10) return null;
  return annual;
}

// ─── Main TWR calculation ──────────────────────────────────────────────────────

export function calcularTWR(input: TwrInput): TwrResult {
  const { dates, prices, fxHistory, rfNavByDate } = input;

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

  const custody = buildDailyCustody(inRange, dates);

  // Group flow events by business date
  const flowsByDate = new Map<string, ParsedTx[]>();
  for (const tx of inRange) {
    const arr = flowsByDate.get(tx.bizDate) ?? [];
    arr.push(tx);
    flowsByDate.set(tx.bizDate, arr);
  }

  // Group income events by business date
  const incomeByDate = new Map<string, ParsedIncome[]>();
  for (const inc of incomeEvents) {
    const arr = incomeByDate.get(inc.bizDate) ?? [];
    arr.push(inc);
    incomeByDate.set(inc.bizDate, arr);
  }

  const points: TwrDayPoint[] = [];
  let prevNav = 0;
  let cumTwr = 1.0;
  let totalInvestido = 0;
  let totalFlows = 0;
  const mwrFlows: { day: number; amount: number }[] = [];
  const firstDate = dates[0];

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

    // ── Flows: capital entering/leaving today ──
    let flow = 0;
    const dayTxs = flowsByDate.get(date) ?? [];
    for (const tx of dayTxs) {
      const marketPrice = getPrice(tx.ticker, i, prices);
      if (marketPrice == null) continue;
      const txFx = fxFactor(tx.moeda, fx);
      const value = tx.quantidade * marketPrice * txFx;
      if (tx.tipo === "Compra") {
        flow += value;
        totalInvestido += value;
      } else {
        flow -= value;
      }
    }
    // ── Income: dividends/JCP received today ──
    let income = 0;
    const dayIncome = incomeByDate.get(date) ?? [];
    for (const inc of dayIncome) {
      income += inc.valor * fxFactor(inc.moeda, fx);
    }

    // ── Corrections (ported from Streamlit engine.py) ──

    // NAV forward-fill: if NAV dropped to 0/NaN but previous was valid
    if (i > 0 && (nav <= 0 || !isFinite(nav)) && prevNav > 0) {
      nav = Math.max(0, prevNav + flow);
    }

    // Flow correction for purchases: if NAV change differs from flow by >10%,
    // set flow = NAV change (assumes ~0% return on transaction day)
    if (i > 0 && flow > 0 && prevNav > 0) {
      const navChange = nav - prevNav;
      if (Math.abs(navChange - flow) > Math.abs(flow) * 0.10) {
        flow = navChange;
      }
    }

    // Unexplained change: large NAV move (>20%) without flow (<5% of NAV)
    // → treat the unexplained portion as a hidden flow
    if (i > 0 && prevNav > 0 && Math.abs(flow) < prevNav * 0.05) {
      const navExpected = prevNav + flow;
      if (navExpected > 0) {
        const variation = (nav - navExpected) / navExpected;
        if (Math.abs(variation) > 0.20) {
          flow += nav - navExpected;
        }
      }
    }

    totalFlows += flow;

    // ── MWR flow tracking (purchases = outflows from investor) ──
    if (Math.abs(flow) > 0.01) {
      const dayNum = businessDaysBetween(firstDate, date);
      mwrFlows.push({ day: dayNum, amount: flow });
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

    // Guard against data anomalies
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

  const ganhoEconomico = last.nav - firstMeaningful.nav - totalFlows;

  const totalBizDays = businessDaysBetween(firstMeaningful.date, last.date);
  const mwr = calculateMWR(mwrFlows, last.nav, totalBizDays);

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

const SELIC_ANUAL = 0.1375; // 13.75% a.a.
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

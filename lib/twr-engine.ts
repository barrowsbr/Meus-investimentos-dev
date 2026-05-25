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

// ─── Daily custody reconstruction (FIFO cumulative) ───────────────────────────

type CustodySnapshot = Record<string, number>;

function buildDailyCustody(txs: ParsedTx[], dates: string[]): CustodySnapshot[] {
  // Change events sorted by business date
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

// ─── Public types ─────────────────────────────────────────────────────────────

export type PriceMatrix = Record<string, (number | null)[]>;

export interface FxHistory {
  [date: string]: FxRates;
}

export interface TwrDayPoint {
  date: string;
  nav: number;       // NAV em BRL naquele dia
  flow: number;      // Fluxo líquido do dia em BRL (+ = compra/entrada)
  ret: number;       // Retorno do dia (fração)
  twr: number;       // TWR acumulado até este dia (fração, ex: 0.35 = +35%)
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
  totalInvestido: number; // soma de todos os aportes em BRL
}

export interface TwrInput {
  transacoes: Row[];
  dates: string[];          // business days aligned with priceMatrix columns
  prices: PriceMatrix;      // ticker → array of prices, indexed by dates
  fxHistory: FxHistory;     // date → FxRates
  rfNavByDate?: Record<string, number>; // RF curve (optional, from FixedIncomeEngine)
}

// ─── Main TWR calculation ──────────────────────────────────────────────────────

export function calcularTWR(input: TwrInput): TwrResult {
  const { dates, prices, fxHistory, rfNavByDate } = input;

  const EMPTY: TwrResult = {
    points: [], twrTotal: 0, twrAnualizado: 0,
    navInicial: 0, navFinal: 0, duracaoAnos: 0,
    primeiraData: "", ultimaData: "", totalInvestido: 0,
  };

  if (dates.length === 0) return EMPTY;

  const txs = parseRVTransactions(input.transacoes);

  // Filter transactions within the date range
  const lastDate = dates[dates.length - 1];
  const inRange = txs.filter(tx => tx.date <= lastDate);
  if (inRange.length === 0) return EMPTY;

  // Build daily custody for all RV tickers
  const custody = buildDailyCustody(inRange, dates);

  // Group flow events by business date for O(1) lookup
  const flowsByDate = new Map<string, ParsedTx[]>();
  for (const tx of inRange) {
    const arr = flowsByDate.get(tx.bizDate) ?? [];
    arr.push(tx);
    flowsByDate.set(tx.bizDate, arr);
  }

  const points: TwrDayPoint[] = [];
  let prevNav = 0;
  let cumTwr = 1.0;
  let totalInvestido = 0;

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

    // ── RF NAV (from engine curve or zero) ──
    const navRF = rfNavByDate?.[date] ?? 0;

    const nav = navRV + navRF;

    // ── Flows: capital entering/leaving the portfolio today ──
    // We use MARKET price (not transaction price) per CALCULOS.md §15 FIX
    let flow = 0;
    const dayTxs = flowsByDate.get(date) ?? [];
    for (const tx of dayTxs) {
      const marketPrice = getPrice(tx.ticker, i, prices) ?? tx.preco;
      const txFx = fxFactor(tx.moeda, fx);
      const value = tx.quantidade * marketPrice * txFx;
      if (tx.tipo === "Compra") {
        flow += value;
        totalInvestido += value;
      } else {
        flow -= value;
      }
    }

    // ── Modified Dietz — daily ──
    // SoD: flow > 1% of previous NAV (per CALCULOS.md §19)
    let ret = 0;
    if (prevNav > 1) {
      const isSoD = Math.abs(flow) / prevNav > 0.01;
      const denom = isSoD ? prevNav + flow : prevNav;
      const numer = nav - prevNav - flow;
      if (Math.abs(denom) > 0.01) ret = numer / denom;
    }

    // Guard against data anomalies
    ret = Math.max(-0.5, Math.min(0.5, ret));
    cumTwr *= (1 + ret);

    points.push({ date, nav, flow, ret, twr: cumTwr - 1 });
    prevNav = nav;
  }

  // Find the first point with meaningful NAV (>= R$ 100)
  const firstMeaningful = points.find(p => p.nav >= 100);
  if (!firstMeaningful) return { ...EMPTY, points };

  const last = points[points.length - 1];

  // TWR from first meaningful point
  const twrTotal = (cumTwr / (1 + firstMeaningful.twr)) - 1;

  const t0 = new Date(firstMeaningful.date).getTime();
  const t1 = new Date(last.date).getTime();
  const duracaoAnos = (t1 - t0) / (365.25 * 24 * 60 * 60 * 1000);
  const twrAnualizado = duracaoAnos > 0.08
    ? Math.pow(1 + twrTotal, 1 / duracaoAnos) - 1
    : twrTotal;

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
  };
}

// ─── CDI benchmark (SELIC proxy) ──────────────────────────────────────────────

const SELIC_ANUAL = 0.1375; // 13.75% a.a. — atualizar conforme COPOM
const SELIC_DIARIA = Math.pow(1 + SELIC_ANUAL, 1 / 252) - 1;

export function buildCDIBenchmark(dates: string[]): TwrDayPoint[] {
  let cdi = 1.0;
  return dates.map((date, i) => {
    const ret = i === 0 ? 0 : SELIC_DIARIA;
    cdi *= 1 + ret;
    return { date, nav: cdi, flow: 0, ret, twr: cdi - 1 };
  });
}

// ─── IBOV benchmark builder (from raw price array) ────────────────────────────

export function buildPriceBenchmark(
  name: string,
  dates: string[],
  prices: (number | null)[]
): TwrDayPoint[] {
  let base: number | null = null;
  let prevPrice: number | null = null;
  let cumTwr = 1.0;

  return dates.map((date, i) => {
    const price = prices[i] ?? prevPrice;
    if (price == null) return { date, nav: 0, flow: 0, ret: 0, twr: 0 };

    if (base == null) base = price;
    const ret = prevPrice != null && prevPrice > 0 ? (price - prevPrice) / prevPrice : 0;
    cumTwr *= 1 + ret;
    prevPrice = price;

    return { date, nav: price / base, flow: 0, ret, twr: cumTwr - 1 };
  });
}

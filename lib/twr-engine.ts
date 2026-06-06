import { toNumber } from "./format";
import { identificarSetor, getMoedaEfetiva, isRendaFixaManual } from "./sectors";
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
    // RF precificável (SHV/BIL) é mantida e avaliada por preço de mercado;
    // só a RF manual (CDB/Tesouro) é excluída (vem da timeline de RF).
    if (isRendaFixaManual(setor)) continue;

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

    // IMPOSTO = IR retido na fonte. Não ignorar: é custo, entra como income
    // NEGATIVO (abate o provento bruto → retorno reflete o líquido recebido).
    const decisao = String(row["decisao"] ?? row["decisão"] ?? "").toLowerCase();
    const isImposto = decisao.includes("imposto");

    const valorAbs = Math.abs(toNumber(row["valor"]) ?? 0);
    if (valorAbs < 0.01) continue;
    const valor = isImposto ? -valorAbs : valorAbs;

    const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim();
    const date = toYMD(row["data"] ?? row["date"]);
    if (!date) continue;

    result.push({ date, bizDate: nextBusinessDay(date), ticker, valor, moeda });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── RF (renda fixa) timeline for TWR integration ────────────────────────────

const SELIC_ANNUAL_RATE = 0.1475;
const RF_BIZ_DAYS_YEAR = 252;
const SELIC_DAILY_RATE = Math.pow(1 + SELIC_ANNUAL_RATE, 1 / RF_BIZ_DAYS_YEAR) - 1;
const CASH_TICKERS_RF = new Set(["CAIXA", "SALDO", "CASH", "RESERVA"]);

interface RfParsedTx {
  date: string;
  bizDate: string;
  ticker: string;
  tipo: "compra" | "venda";
  valor: number;
  moeda: string;
}

function normalizeRfTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, " ");
}

function parseRfTxs(rows: Row[]): RfParsedTx[] {
  const result: RfParsedTx[] = [];
  for (const row of rows) {
    const ticker = normalizeRfTicker(String(row["ticker"] ?? row["ativo"] ?? row["papel"] ?? ""));
    if (!ticker || CASH_TICKERS_RF.has(ticker)) continue;
    const tipoRaw = String(row["tipo"] ?? row["movimentacao"] ?? "").toLowerCase().trim();
    let tipo: "compra" | "venda" | null = null;
    if (tipoRaw.includes("compra") || tipoRaw.includes("aplica") || tipoRaw.includes("aporte")) tipo = "compra";
    else if (tipoRaw.includes("venda") || tipoRaw.includes("resgate") || tipoRaw.includes("vencimento")) tipo = "venda";
    if (!tipo) continue;
    const valor = Math.abs(toNumber(row["valor"]) ?? 0);
    if (valor < 0.01) continue;
    const date = toYMD(row["compra"] ?? row["data"] ?? row["date"]);
    if (!date) continue;
    const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
    result.push({ date, bizDate: nextBusinessDay(date), ticker, tipo, valor, moeda });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

function rfBizDays(startStr: string, endStr: string): number {
  const ms = new Date(endStr + "T12:00:00Z").getTime() - new Date(startStr + "T12:00:00Z").getTime();
  return Math.max(0, Math.round((ms / (24 * 60 * 60 * 1000)) * RF_BIZ_DAYS_YEAR / 365));
}

function solveImpliedRate(
  lots: { invested: number; bizDays: number }[],
  targetValue: number
): number {
  if (lots.length === 0 || targetValue <= 0) return SELIC_DAILY_RATE;
  const totalInvested = lots.reduce((s, l) => s + l.invested, 0);
  if (totalInvested <= 0) return SELIC_DAILY_RATE;
  if (targetValue < totalInvested * 0.5) return 0;
  let r = SELIC_DAILY_RATE;
  for (let iter = 0; iter < 20; iter++) {
    let f = -targetValue;
    let df = 0;
    for (const l of lots) {
      const factor = Math.pow(1 + r, l.bizDays);
      f += l.invested * factor;
      df += l.invested * l.bizDays * Math.pow(1 + r, l.bizDays - 1);
    }
    if (Math.abs(df) < 1e-12) break;
    const step = f / df;
    r -= step;
    r = Math.max(0, Math.min(r, 0.002));
    if (Math.abs(step) < 1e-9) break;
  }
  return r;
}

export function buildRfTimeline(
  rfTransacoes: Row[],
  fixaAberta: Row[],
  dates: string[],
  fxHistory: FxHistory
): { navByDate: Record<string, number>; flowByDate: Record<string, number> } {
  const navByDate: Record<string, number> = {};
  const flowByDate: Record<string, number> = {};
  if (dates.length === 0) return { navByDate, flowByDate };

  const txs = parseRfTxs(rfTransacoes);
  const lastDate = dates[dates.length - 1];

  const manualValues = new Map<string, { atual: number; moeda: string }>();
  for (const row of fixaAberta) {
    const ticker = normalizeRfTicker(String(row["ticker"] ?? row["ativo"] ?? ""));
    if (!ticker || CASH_TICKERS_RF.has(ticker)) continue;
    const atual = toNumber(row["atual"] ?? row["valor_atual"] ?? row["saldo"] ?? row["valor atual"]) ?? 0;
    const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
    if (atual > 0) manualValues.set(ticker, { atual, moeda });
  }

  const byTicker = new Map<string, RfParsedTx[]>();
  for (const tx of txs) {
    if (!byTicker.has(tx.ticker)) byTicker.set(tx.ticker, []);
    byTicker.get(tx.ticker)!.push(tx);
  }

  interface TickerInfo {
    compras: { date: string; valor: number }[];
    vendas: { date: string; valor: number }[];
    dailyRate: number;
    moeda: string;
  }
  const tickerInfos: TickerInfo[] = [];
  const allTickerNames = new Set([...manualValues.keys(), ...byTicker.keys()]);

  for (const ticker of allTickerNames) {
    const txList = byTicker.get(ticker) ?? [];
    const manual = manualValues.get(ticker);
    const compras = txList.filter(t => t.tipo === "compra");
    const vendas = txList.filter(t => t.tipo === "venda");
    if (compras.length === 0) {
      // fixa_aberta entry with no purchase history — pre-existing position.
      // Model as constant NAV (0% daily rate) from window start.
      if (manual && manual.atual > 0) {
        tickerInfos.push({
          compras: [{ date: dates[0], valor: manual.atual }],
          vendas: [],
          dailyRate: 0,
          moeda: manual.moeda,
        });
        // Synthetic flow on first date so flow series matches NAV
        const fx0 = fxHistory[dates[0]] ?? { USDBRL: 5.7, EURBRL: 6.4, CADBRL: 4.1, GBPBRL: 7.6 } as FxRates;
        flowByDate[dates[0]] = (flowByDate[dates[0]] ?? 0) + manual.atual * fxFactor(manual.moeda, fx0);
      }
      continue;
    }
    const moeda = manual?.moeda ?? compras[0]?.moeda ?? "BRL";
    const isActive = manual != null;

    let dailyRate = SELIC_DAILY_RATE;
    if (isActive && manual.atual > 0) {
      // Solve implied rate so the modeled NAV reaches manual.atual at lastDate.
      // Include vendas as negative lots — they reduced the principal.
      const lots = [
        ...compras.map(c => ({ invested: c.valor, bizDays: rfBizDays(c.bizDate, lastDate) })),
        ...vendas.map(v => ({ invested: -v.valor, bizDays: rfBizDays(v.bizDate, lastDate) })),
      ];
      dailyRate = solveImpliedRate(lots, manual.atual);
    } else if (!isActive && vendas.length > 0) {
      const totalInvested = compras.reduce((s, c) => s + c.valor, 0);
      const totalRedeemed = vendas.reduce((s, v) => s + v.valor, 0);
      const holdingDays = rfBizDays(compras[0].bizDate, vendas[vendas.length - 1].bizDate);
      if (holdingDays > 0 && totalInvested > 0 && totalRedeemed > totalInvested * 0.3) {
        dailyRate = Math.pow(totalRedeemed / totalInvested, 1 / holdingDays) - 1;
        dailyRate = Math.max(0, Math.min(dailyRate, 0.002));
      }
    }

    // Use bizDate (not the raw date) so the NAV recognizes each transaction on
    // the SAME grid day the flow series does. The flow loop keys off bizDate;
    // if the NAV keyed off the raw date, a weekend transaction (with crypto
    // putting weekend dates in the grid) would move the NAV on Sat/Sun while
    // the flow landed on Monday — producing a spurious spike + reversal.
    tickerInfos.push({
      compras: compras.map(c => ({ date: c.bizDate, valor: c.valor })),
      vendas: vendas.map(v => ({ date: v.bizDate, valor: v.valor })),
      dailyRate,
      moeda,
    });
  }

  const sortedRfTxs = [...txs].sort((a, b) => a.bizDate.localeCompare(b.bizDate));
  let rfTxIdx = 0;
  while (rfTxIdx < sortedRfTxs.length && sortedRfTxs[rfTxIdx].bizDate < dates[0]) rfTxIdx++;

  for (const date of dates) {
    let dayFlow = 0;
    const fx = fxHistory[date] ?? { USDBRL: 5.7, EURBRL: 6.4, CADBRL: 4.1, GBPBRL: 7.6 } as FxRates;
    while (rfTxIdx < sortedRfTxs.length && sortedRfTxs[rfTxIdx].bizDate <= date) {
      const rtx = sortedRfTxs[rfTxIdx++];
      const fxF = fxFactor(rtx.moeda, fx);
      if (rtx.tipo === "compra") dayFlow += rtx.valor * fxF;
      else dayFlow -= rtx.valor * fxF;
    }
    if (Math.abs(dayFlow) > 0.01) flowByDate[date] = dayFlow;

    // NAV = Σ compras compounded − Σ vendas compounded (each from its own date).
    // Modeling vendas as negative compounding terms keeps NAV consistent with
    // the flow series: on a venda day NAV drops by exactly the venda amount
    // (the term starts at valor × (1+r)^0), so the daily return stays ~0
    // instead of producing a spurious spike.
    let dayNav = 0;
    for (const info of tickerInfos) {
      const fxF = fxFactor(info.moeda, fx);
      let balanceNative = 0;
      for (const compra of info.compras) {
        if (compra.date > date) continue;
        const bd = rfBizDays(compra.date, date);
        balanceNative += compra.valor * Math.pow(1 + info.dailyRate, bd);
      }
      for (const venda of info.vendas) {
        if (venda.date > date) continue;
        const bd = rfBizDays(venda.date, date);
        balanceNative -= venda.valor * Math.pow(1 + info.dailyRate, bd);
      }
      if (balanceNative > 0) dayNav += balanceNative * fxF;
    }
    navByDate[date] = dayNav;
  }

  return { navByDate, flowByDate };
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
const MAX_UNEXPLAINED_CHANGE = 0.40; // 40% NAV variation without flow → forceZero

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
  custoPosicoesAtuais: number;
  ganhoEconomico: number;
  mwr: number | null;
  diagnostics: {
    forceZeroDays: number;
    cappedDays: number;
    incomeTotal: number;
    tickersAtCost: string[];
  };
}

export interface TwrInput {
  transacoes: Row[];
  proventos?: Row[];
  dates: string[];
  prices: PriceMatrix;
  fxHistory: FxHistory;
  rfNavByDate?: Record<string, number>;
  rfFlowByDate?: Record<string, number>;
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
  const { dates, prices, fxHistory, rfNavByDate, rfFlowByDate } = input;

  const EMPTY: TwrResult = {
    points: [], twrTotal: 0, twrAnualizado: 0,
    navInicial: 0, navFinal: 0, duracaoAnos: 0,
    primeiraData: "", ultimaData: "", totalInvestido: 0,
    custoPosicoesAtuais: 0,
    ganhoEconomico: 0, mwr: null,
    diagnostics: { forceZeroDays: 0, cappedDays: 0, incomeTotal: 0, tickersAtCost: [] },
  };

  if (dates.length === 0) return EMPTY;

  const txs = parseRVTransactions(input.transacoes);
  const incomeEvents = input.proventos ? parseProventos(input.proventos) : [];

  const lastDate = dates[dates.length - 1];
  const inRange = txs.filter(tx => tx.date <= lastDate);
  const hasRf = rfNavByDate && Object.keys(rfNavByDate).length > 0;
  if (inRange.length === 0 && !hasRf) return EMPTY;

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

  // Build ticker → moeda map so NAV uses the same currency as flows
  const tickerMoeda = new Map<string, string>();
  for (const tx of inRange) {
    if (!tickerMoeda.has(tx.ticker)) tickerMoeda.set(tx.ticker, tx.moeda);
  }

  // Average purchase cost per ticker (in the ticker's currency). Used as a
  // fallback NAV price when an asset has NO market price at all (e.g. cripto or
  // RV tickers missing from the golden source / Yahoo). Without this the asset
  // would silently vanish from NAV — the Resumo values it at cost, so we match
  // that behaviour here instead of dropping it.
  const tickerAvgCost = new Map<string, number>();
  {
    const acc = new Map<string, { val: number; qty: number }>();
    for (const tx of inRange) {
      if (tx.tipo !== "Compra") continue;
      const a = acc.get(tx.ticker) ?? { val: 0, qty: 0 };
      a.val += tx.preco * tx.quantidade;
      a.qty += tx.quantidade;
      acc.set(tx.ticker, a);
    }
    for (const [t, a] of acc) if (a.qty > 0) tickerAvgCost.set(t, a.val / a.qty);
  }

  const sortedTxs = [...inRange].sort((a, b) => a.bizDate.localeCompare(b.bizDate));
  let txIdx = 0;
  const sortedInc = [...incomeEvents].sort((a, b) => a.bizDate.localeCompare(b.bizDate));
  let incIdx = 0;

  // FIFO lot tracking for cost of current positions
  const fifoLots = new Map<string, { qty: number; costBrl: number }[]>();
  for (const tx of sortedTxs) {
    const txFxRates = fxHistory[tx.bizDate] ?? fxHistory[dates[0]] ?? { USDBRL: 5.7, EURBRL: 6.4, CADBRL: 4.1, GBPBRL: 7.6 } as FxRates;
    const fxF = fxFactor(tx.moeda, txFxRates);
    if (tx.tipo === "Compra") {
      const lots = fifoLots.get(tx.ticker) ?? [];
      lots.push({ qty: tx.quantidade, costBrl: tx.preco * tx.quantidade * fxF });
      fifoLots.set(tx.ticker, lots);
    } else {
      const lots = fifoLots.get(tx.ticker);
      if (lots) {
        let rem = tx.quantidade;
        while (rem > 1e-6 && lots.length > 0) {
          if (lots[0].qty <= rem + 1e-6) {
            rem -= lots[0].qty;
            lots.shift();
          } else {
            lots[0].costBrl *= (lots[0].qty - rem) / lots[0].qty;
            lots[0].qty -= rem;
            rem = 0;
          }
        }
      }
    }
  }
  let custoPosicoesAtuais = 0;
  for (const lots of fifoLots.values()) {
    for (const lot of lots) custoPosicoesAtuais += lot.costBrl;
  }

  // Track tickers at cost fallback (no market price available)
  const tickersAtCostSet = new Set<string>();

  const points: TwrDayPoint[] = [];
  let prevNav = 0;
  let cumTwr = 1.0;
  let totalInvestido = 0;
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
      const mktPrice = getPrice(ticker, i, prices);
      const price = mktPrice ?? tickerAvgCost.get(ticker) ?? null;
      if (price == null) continue;
      if (mktPrice == null) tickersAtCostSet.add(ticker);
      const moeda = tickerMoeda.get(ticker) ?? getMoedaEfetiva(ticker, "BRL", identificarSetor(ticker));
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

    // ── RF flows (compra/venda of renda fixa) ──
    const rfFlow = rfFlowByDate?.[date] ?? 0;
    flow += rfFlow;
    if (rfFlow > 0) totalInvestido += rfFlow;

    // ── NAV gap handling (Python engine v3.1–v3.3) ──
    let dataAnomaly = false;
    if (i > 0 && prevNav > 0) {
      // v3.2: Forward-fill NAV if it drops to 0/NaN but previous was valid
      if (nav <= 0 || !isFinite(nav)) {
        nav = Math.max(0, prevNav + flow);
      }
      // v3.3: Flag anomalous NAV jumps (>40% unexplained variation with no RV flow).
      // Instead of modifying NAV (which creates catch-up spikes the next day),
      // we flag the day for forceZero — the return is unreliable, but NAV stays
      // accurate so subsequent days compute correctly.
      else if (Math.abs(flow - rfFlow) < 1.0) {
        const navExpected = prevNav + flow;
        if (navExpected > 0) {
          const variation = (nav - navExpected) / navExpected;
          if (Math.abs(variation) > MAX_UNEXPLAINED_CHANGE) {
            dataAnomaly = true;
          }
        }
      }
    }

    // ── MWR flow tracking (before any flow correction, so MWR sees real cashflows) ──
    if (Math.abs(flow) > 0.01) {
      mwrFlows.push({ date, amount: flow });
    }

    // RV/RF flow decomposition for forceZero check
    const rvFlowPart = flow - rfFlow;
    const prevDateRfNav = i > 0 ? (rfNavByDate?.[dates[i - 1]] ?? 0) : 0;

    // ── Flow timing & force_zero logic (from Streamlit engine) ──
    let forceZero = false;
    let isSoD = false;

    // Rule 0: Data anomaly detected (>40% unexplained NAV variation with no flow)
    if (dataAnomaly) {
      forceZero = true;
    }
    // Rule 1: Previous NAV ≤ 0 — no capital base, return undefined
    else if (prevNav <= 0) {
      forceZero = true;
    }
    // Rule 2: Enormous flow (>90% of NAV) — return is meaningless
    else if (Math.abs(flow) / prevNav > LARGE_FLOW_FORCE_ZERO) {
      forceZero = true;
    }
    // Rule 2b: Large RV flow relative to RV-only NAV — RF dilution must not
    // bypass forceZero for flows that would have triggered it without RF.
    else if (Math.abs(rvFlowPart) > 0) {
      const prevRvNav = prevNav - prevDateRfNav;
      if (prevRvNav > 0 && Math.abs(rvFlowPart) / prevRvNav > LARGE_FLOW_FORCE_ZERO) {
        forceZero = true;
      }
    }

    if (!forceZero) {
      // Rule 3: Large inflow (>1% of NAV) — use SoD to prevent inflation
      if (flow > 0 && flow / prevNav > FLOW_THRESHOLD) {
        isSoD = true;
      }
      // Rule 4: Large outflow (>1% of NAV) — use SoD to prevent deflation
      else if (flow < 0 && Math.abs(flow) / prevNav > FLOW_THRESHOLD) {
        isSoD = true;
      }
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

  // total_pnl = nav_final - nav_inicial - sum(flows from firstIdx onward) + first_flow
  //           + sum(income). Dividends/JCP are received as cash (not held in NAV),
  //           so the NAV delta alone understates the gain. Adding accumulated income
  //           makes the total consistent with the daily Modified Dietz economic gain
  //           ((nav + income) − prevNav − flow) and with the Resumo's "Resultado Total".
  let flowsFromFirst = 0;
  let incomeFromFirst = 0;
  for (let i = firstIdx; i < points.length; i++) {
    flowsFromFirst += points[i].flow;
    incomeFromFirst += points[i].income;
  }
  const firstMeaningfulFlow = points[firstIdx].flow;
  const ganhoEconomico = last.nav - firstMeaningful.nav - flowsFromFirst + firstMeaningfulFlow + incomeFromFirst;

  const mwr = calculateMWR(
    mwrFlows, last.nav, last.date,
    firstMeaningful.nav, firstMeaningful.date,
  );

  // RF cost (net invested from rfFlowByDate)
  let rfCostBasis = 0;
  if (rfFlowByDate) {
    for (const v of Object.values(rfFlowByDate)) rfCostBasis += v;
  }
  if (rfCostBasis > 0) custoPosicoesAtuais += rfCostBasis;

  // Diagnostics
  const forceZeroDays = points.filter(p => p.forceZero).length;
  let cappedDays = 0;
  let incomeTotal = 0;
  for (const p of points) {
    incomeTotal += p.income;
    if (!p.forceZero && Math.abs(p.ret) >= MAX_DAILY_RETURN - 0.001) cappedDays++;
  }

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
    custoPosicoesAtuais,
    ganhoEconomico,
    mwr,
    diagnostics: {
      forceZeroDays,
      cappedDays,
      incomeTotal: Math.round(incomeTotal),
      tickersAtCost: [...tickersAtCostSet].sort(),
    },
  };
}

// ─── CDI benchmark (SELIC proxy with historical rates) ───────────────────────

const SELIC_HISTORICO: [string, number][] = [
  ["2018-01-01", 0.0700],
  ["2018-03-22", 0.0650],
  ["2018-07-01", 0.0650],
  ["2019-02-07", 0.0650],
  ["2019-04-01", 0.0650],
  ["2019-06-20", 0.0650],
  ["2019-08-01", 0.0600],
  ["2019-09-19", 0.0550],
  ["2019-10-31", 0.0500],
  ["2019-12-12", 0.0450],
  ["2020-02-06", 0.0425],
  ["2020-03-19", 0.0375],
  ["2020-05-07", 0.0300],
  ["2020-06-18", 0.0225],
  ["2020-08-06", 0.0200],
  ["2021-03-18", 0.0275],
  ["2021-05-06", 0.0350],
  ["2021-06-17", 0.0425],
  ["2021-08-05", 0.0525],
  ["2021-09-23", 0.0625],
  ["2021-10-28", 0.0775],
  ["2021-12-09", 0.0925],
  ["2022-02-03", 0.1075],
  ["2022-03-17", 0.1175],
  ["2022-05-05", 0.1275],
  ["2022-06-16", 0.1325],
  ["2022-08-04", 0.1375],
  ["2023-08-03", 0.1325],
  ["2023-09-21", 0.1275],
  ["2023-11-02", 0.1225],
  ["2023-12-14", 0.1175],
  ["2024-01-31", 0.1125],
  ["2024-03-21", 0.1075],
  ["2024-05-09", 0.1050],
  ["2024-09-19", 0.1075],
  ["2024-11-07", 0.1125],
  ["2024-12-12", 0.1225],
  ["2025-01-30", 0.1325],
  ["2025-03-20", 0.1425],
  ["2025-05-08", 0.1475],
];

function isWeekday(date: string): boolean {
  const d = new Date(date + "T12:00:00Z");
  const dow = d.getUTCDay();
  return dow >= 1 && dow <= 5;
}

function getSelicDiaria(date: string): number {
  let rate = SELIC_HISTORICO[0][1];
  for (const [d, r] of SELIC_HISTORICO) {
    if (date >= d) rate = r;
    else break;
  }
  return Math.pow(1 + rate, 1 / 252) - 1;
}

export function buildCDIBenchmark(dates: string[]): TwrDayPoint[] {
  let cdi = 1.0;
  return dates.map((date, i) => {
    const ret = (i === 0 || !isWeekday(date)) ? 0 : getSelicDiaria(date);
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

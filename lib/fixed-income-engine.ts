import { toNumber } from "./format";

type Row = Record<string, unknown>;

// ─── Constants (CALCULOS.md §24) ──────────────────────────────────────────────

const SELIC_PROXY_ANNUAL = 0.1375;  // 13.75% a.a. — atualizar conforme COPOM
const BUSINESS_DAYS_YEAR = 252;
const SELIC_DAILY = Math.pow(1 + SELIC_PROXY_ANNUAL, 1 / BUSINESS_DAYS_YEAR) - 1;

// Tickers que nunca capitalizam — somados direto como caixa
const CASH_TICKERS = new Set(["CAIXA", "SALDO", "CASH", "RESERVA"]);

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDate(val: unknown): Date | null {
  if (!val) return null;
  if (typeof val === "number") {
    return new Date((val - 25569) * 86400 * 1000);
  }
  const s = String(val).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return new Date(`${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}T12:00:00Z`);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s + "T12:00:00Z");
  return null;
}

function _toYMD(d: Date): string {
  return d.toISOString().split("T")[0];
}

function businessDaysBetween(start: Date, end: Date): number {
  const days = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, Math.round(days * BUSINESS_DAYS_YEAR / 365));
}

// ─── Parsed RF transaction ────────────────────────────────────────────────────

interface RFTransaction {
  date: Date;
  ticker: string;
  tipo: "compra" | "venda" | "imposto" | "resgate" | "vencimento";
  valor: number;
  moeda: string;
}

function parseRFTransactions(rows: Row[]): RFTransaction[] {
  const result: RFTransaction[] = [];

  for (const row of rows) {
    const ticker = String(
      row["ticker"] ?? row["ativo"] ?? row["papel"] ?? ""
    ).trim().toUpperCase().replace(/\s+/g, " ");
    if (!ticker) continue;

    const tipoRaw = String(row["tipo"] ?? row["movimentacao"] ?? "").toLowerCase().trim();
    let tipo: RFTransaction["tipo"] | null = null;
    if (tipoRaw.includes("compra")) tipo = "compra";
    else if (tipoRaw.includes("venda")) tipo = "venda";
    else if (tipoRaw.includes("resgate")) tipo = "resgate";
    else if (tipoRaw.includes("vencimento")) tipo = "vencimento";
    else if (tipoRaw.includes("imposto")) tipo = "imposto";
    if (!tipo) continue;

    const valor = Math.abs(toNumber(row["valor"] ?? row["value"]) ?? 0);
    if (valor === 0) continue;

    const dateRaw = row["compra"] ?? row["data"] ?? row["date"];
    const date = toDate(dateRaw);
    if (!date) continue;

    const moeda = String(row["moeda"] ?? row["currency"] ?? "BRL").toUpperCase().trim() || "BRL";

    result.push({ date, ticker, tipo, valor, moeda });
  }

  return result.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ─── Newton-Raphson: implied daily rate ───────────────────────────────────────
// Resolves r such that Σ(lote_i × (1+r)^dias_i) = valorManual

function newtonRaphson(
  lotes: { invested: number; diasUteis: number }[],
  valorManual: number,
  maxIter = 20
): number {
  if (lotes.length === 0 || valorManual <= 0) return SELIC_DAILY;

  const totalInvested = lotes.reduce((s, l) => s + l.invested, 0);
  if (totalInvested <= 0) return SELIC_DAILY;

  // Sanity: if valorManual < totalInvested, position lost money → use 0
  if (valorManual < totalInvested * 0.5) return 0;

  let r = SELIC_DAILY;

  for (let iter = 0; iter < maxIter; iter++) {
    let f = -valorManual;
    let df = 0;
    for (const l of lotes) {
      const bd = l.diasUteis;
      const factor = Math.pow(1 + r, bd);
      f += l.invested * factor;
      df += l.invested * bd * Math.pow(1 + r, bd - 1);
    }
    if (Math.abs(df) < 1e-12) break;
    const step = f / df;
    r -= step;
    r = Math.max(0, Math.min(r, 0.002)); // clamp 0..0.2% daily (≈ 64% a.a.)
    if (Math.abs(step) < 1e-9) break;
  }

  return r;
}

// ─── Per-ticker analysis ──────────────────────────────────────────────────────

export interface RFPosition {
  ticker: string;
  moeda: string;
  status: "Ativo" | "Encerrado";
  investido: number;       // custo histórico (soma compras)
  atual: number;           // valor atual (manual ou projetado)
  caixa: number;           // valor CAIXA/SALDO (separado)
  lucro: number;           // atual - investido
  rentabilidade: number;   // (lucro / investido) × 100
  taxaImplicita: number;   // taxa anual implícita (0 se encerrada)
  isCaixa: boolean;
}

export interface RFSummary {
  positions: RFPosition[];
  totalAtual: number;      // soma de atual (excluindo caixa)
  totalCaixa: number;      // soma do caixa separado
  totalInvestido: number;
  totalLucro: number;
  rentabilidadeMedia: number;
  patrimonio: number;      // totalAtual + totalCaixa (para o patrimônio geral)
}

export function calcularRF(
  rfTransacoes: Row[],
  fixaAberta: Row[]   // valores manuais — source of truth (CALCULOS.md §7)
): RFSummary {
  const txs = parseRFTransactions(rfTransacoes);
  const today = new Date();

  // ── Manual values (fixa_aberta) ─────────────────────────────────────────
  type ManualEntry = { atual: number; moeda: string; status: string };
  const manualValues = new Map<string, ManualEntry>();

  for (const row of fixaAberta) {
    const ticker = String(row["ticker"] ?? row["ativo"] ?? "").trim().toUpperCase().replace(/\s+/g, " ");
    if (!ticker) continue;
    const atual = toNumber(row["atual"] ?? row["valor_atual"] ?? row["saldo"] ?? row["valor atual"]) ?? 0;
    const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
    const statusRaw = String(row["status"] ?? "").toLowerCase();
    const status = statusRaw.includes("encerr") ? "Encerrado" : "Ativo";
    manualValues.set(ticker, { atual, moeda, status });
  }

  // ── Group transactions by ticker ─────────────────────────────────────────
  const byTicker = new Map<string, RFTransaction[]>();
  for (const tx of txs) {
    if (!byTicker.has(tx.ticker)) byTicker.set(tx.ticker, []);
    byTicker.get(tx.ticker)!.push(tx);
  }

  const positions: RFPosition[] = [];
  let totalCaixa = 0;

  // ── All tickers: from manual values (source of truth) + any in transactions ──
  const allTickers = new Set([
    ...manualValues.keys(),
    ...byTicker.keys(),
  ]);

  for (const ticker of allTickers) {
    const tickerUpper = ticker.toUpperCase();
    const isCaixa = CASH_TICKERS.has(tickerUpper);
    const manual = manualValues.get(ticker);
    const txList = byTicker.get(ticker) ?? [];

    const moeda = manual?.moeda ?? txList[0]?.moeda ?? "BRL";

    // ── Compras e saídas ────────────────────────────────────────────────────
    const compras = txList.filter(t => t.tipo === "compra");
    const saidas = txList.filter(t => t.tipo === "venda" || t.tipo === "resgate" || t.tipo === "vencimento");
    const impostos = txList.filter(t => t.tipo === "imposto");

    const investido = compras.reduce((s, t) => s + t.valor, 0);
    const totalSaidas = saidas.reduce((s, t) => s + t.valor, 0);
    const totalImpostos = impostos.reduce((s, t) => s + t.valor, 0);

    // CAIXA: vai direto para o total de caixa
    if (isCaixa) {
      const caixaVal = manual?.atual ?? investido;
      totalCaixa += caixaVal;
      positions.push({
        ticker,
        moeda,
        status: "Ativo",
        investido,
        atual: 0,
        caixa: caixaVal,
        lucro: 0,
        rentabilidade: 0,
        taxaImplicita: 0,
        isCaixa: true,
      });
      continue;
    }

    // ── Encerrada: tem saída ─────────────────────────────────────────────────
    const isEncerrada = saidas.length > 0;

    if (isEncerrada) {
      const atual = totalSaidas - totalImpostos;
      const lucro = atual - investido;
      const rentabilidade = investido > 0 ? (lucro / investido) * 100 : 0;

      positions.push({
        ticker, moeda,
        status: "Encerrado",
        investido,
        atual,
        caixa: 0,
        lucro,
        rentabilidade,
        taxaImplicita: 0,
        isCaixa: false,
      });
      continue;
    }

    // ── Aberta ───────────────────────────────────────────────────────────────
    let atual: number;
    let taxaDiaria: number;

    if (manual && manual.atual > 0) {
      // Tem valor manual → calcula taxa implícita via Newton-Raphson
      atual = manual.atual;
      const lotes = compras.map(c => ({
        invested: c.valor,
        diasUteis: businessDaysBetween(c.date, today),
      }));
      taxaDiaria = lotes.length > 0 ? newtonRaphson(lotes, atual) : SELIC_DAILY;
    } else {
      // Sem valor manual → SELIC proxy
      taxaDiaria = SELIC_DAILY;
      atual = compras.reduce((s, c) => {
        const bu = businessDaysBetween(c.date, today);
        return s + c.valor * Math.pow(1 + taxaDiaria, bu);
      }, 0);
    }

    const lucro = atual - investido;
    const rentabilidade = investido > 0 ? (lucro / investido) * 100 : 0;
    const taxaImplicita = Math.pow(1 + taxaDiaria, BUSINESS_DAYS_YEAR) - 1;

    positions.push({
      ticker, moeda,
      status: "Ativo",
      investido,
      atual,
      caixa: 0,
      lucro,
      rentabilidade,
      taxaImplicita,
      isCaixa: false,
    });
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const ativas = positions.filter(p => !p.isCaixa && p.status === "Ativo");
  const totalAtual = ativas.reduce((s, p) => s + p.atual, 0);
  const totalInvestido = ativas.reduce((s, p) => s + p.investido, 0);
  const totalLucro = totalAtual - totalInvestido;
  const rentabilidadeMedia = totalInvestido > 0 ? (totalLucro / totalInvestido) * 100 : 0;

  // FIX v17: garante que totalAtual bata com soma dos valores manuais (CALCULOS.md §22)
  // O ajuste já acontece naturalmente porque usamos manual.atual diretamente.

  return {
    positions,
    totalAtual,
    totalCaixa,
    totalInvestido,
    totalLucro,
    rentabilidadeMedia,
    patrimonio: totalAtual + totalCaixa,
  };
}

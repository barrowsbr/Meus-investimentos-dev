import { toNumber } from "./format";
import type { Quote, FxRates } from "./cotacoes";
import { fxToBRL } from "./cotacoes";
import { identificarSetor, isRendaFixa, isRendaVariavel, getMoedaEfetiva, getMoedaExposicao } from "./sectors";

interface Lote {
  qty: number;
  pm: number;
}

interface PosicaoInterna {
  ticker: string;
  lotes: Lote[];
  lucroRealizado: number;
  moeda: string;
  corretora: string;
}

export interface Position {
  ticker: string;
  setor: string;
  quantidade: number;
  moeda: string;
  corretora: string;
  custoMedio: number;
  custoTotal: number;
  lucroRealizado: number;
  lucroRealizadoBRL: number;
  precoAtual: number | null;
  quoteCurrency: string | null;
  valorAtual: number | null;
  valorAtualBRL: number;
  custoTotalBRL: number;
  lucroBRL: number | null;
  lucroPct: number | null;
  ganhoAtivoBRL: number | null;
  ganhoCambioBRL: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
  dayChangeBRL: number | null;
  fatorBRL: number;
  fatorCusto: number;
}

export interface PortfolioSnapshot {
  positions: Position[];
  rvPatrimonioBRL: number;
  rfPatrimonioBRL: number;
  totalPatrimonioBRL: number;
  totalProventosBRL: number;
  proventosMensais: Record<string, number>;
  proventosPorTicker: Record<string, number>;
  lucroBRL: number;
  lucroPct: number;
  ganhoAtivoTotalBRL: number;
  ganhoCambioTotalBRL: number;
  dayChangeTotalBRL: number;
  dayChangeTotalPct: number;
  usdbrl: number;
  eurbrl: number;
  cadbrl: number;
  exposicaoCambial: Record<string, number>;
  setorAlocacao: Record<string, number>;
}

type Row = Record<string, unknown>;

function getVal(row: Row, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  return null;
}

function getTipo(row: Row): string {
  const raw = String(
    getVal(row, "tipo de transação", "tipo de transacao", "tipo_transacao", "tipo") ?? ""
  ).toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (raw.includes("compra") || raw.includes("buy") || raw.includes("aporte") || raw.includes("entrada") || raw.includes("subscri")) return "Compra";
  if (raw.includes("venda") || raw.includes("sell") || raw.includes("resgate") || raw.includes("saida")) return "Venda";
  if (raw.includes("bonif")) return "Compra";
  return raw;
}

function getTicker(row: Row): string {
  return String(getVal(row, "símbolo", "simbolo", "ticker", "symbol") ?? "").toUpperCase().trim();
}

function getMoeda(row: Row): string {
  const m = String(getVal(row, "moeda", "currency") ?? "BRL").toUpperCase().trim();
  return m || "BRL";
}

function getCorretora(row: Row): string {
  return String(getVal(row, "corretora", "broker") ?? "").trim();
}

function getData(row: Row): number {
  const val = getVal(row, "data", "date", "compra");
  if (val === null) return 0;
  if (typeof val === "number") {
    return new Date((val - 25569) * 86400 * 1000).getTime();
  }
  const s = String(val).trim();
  const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    return new Date(`${brMatch[3]}-${brMatch[2].padStart(2, "0")}-${brMatch[1].padStart(2, "0")}`).getTime();
  }
  return new Date(s).getTime() || 0;
}

export function calcularCarteiraFIFO(transacoes: Row[]): Map<string, PosicaoInterna> {
  const portfolio = new Map<string, PosicaoInterna>();
  const sorted = [...transacoes].sort((a, b) => getData(a) - getData(b));

  for (const row of sorted) {
    const ticker = getTicker(row);
    if (!ticker) continue;

    const tipo = getTipo(row);
    if (tipo !== "Compra" && tipo !== "Venda") continue;

    const quantidade = Math.abs(toNumber(getVal(row, "quantidade", "qtd", "quantity")) ?? 0);
    if (quantidade === 0) continue;

    const preco = Math.abs(toNumber(getVal(row, "preço", "preco", "price")) ?? 0);
    const taxas = Math.abs(toNumber(getVal(row, "taxa de corretagem", "taxas", "taxa")) ?? 0);
    const moedaRaw = getMoeda(row);
    const setor = identificarSetor(ticker);
    const moeda = getMoedaEfetiva(ticker, moedaRaw, setor);
    const corretora = getCorretora(row);

    if (!portfolio.has(ticker)) {
      portfolio.set(ticker, { ticker, lotes: [], lucroRealizado: 0, moeda, corretora });
    }
    const pos = portfolio.get(ticker)!;

    if (tipo === "Compra") {
      const custoTotal = quantidade * preco + taxas;
      const pmLote = custoTotal / quantidade;
      pos.lotes.push({ qty: quantidade, pm: pmLote });
    } else if (tipo === "Venda") {
      let qtdVender = quantidade;
      let lucroOp = 0;

      while (qtdVender > 0.000001 && pos.lotes.length > 0) {
        const lote = pos.lotes[0];
        const qtdConsumida = Math.min(lote.qty, qtdVender);
        lucroOp += (preco - lote.pm) * qtdConsumida;
        lote.qty -= qtdConsumida;
        qtdVender -= qtdConsumida;
        if (lote.qty < 0.000001) pos.lotes.shift();
      }

      pos.lucroRealizado += lucroOp;
    }
  }

  return portfolio;
}

export function enriquecerPosicoes(
  portfolio: Map<string, PosicaoInterna>,
  quotes: Record<string, Quote>,
  fxAtual: FxRates,
  fxCusto: FxRates
): Position[] {
  const positions: Position[] = [];

  for (const [ticker, pos] of portfolio) {
    const qtdTotal = pos.lotes.reduce((sum, l) => sum + l.qty, 0);
    if (qtdTotal < 0.000001) continue;

    const custoTotal = pos.lotes.reduce((sum, l) => sum + l.qty * l.pm, 0);
    const custoMedio = qtdTotal > 0 ? custoTotal / qtdTotal : 0;
    const setor = identificarSetor(ticker);
    const moeda = getMoedaEfetiva(ticker, pos.moeda, setor);
    const fatorAtual = fxToBRL(moeda, fxAtual);
    const fatorCusto = fxToBRL(moeda, fxCusto);

    const quote = quotes[ticker];
    const precoAtual = quote?.price ?? null;
    const quoteCurrency = quote?.currency ?? null;

    let valorAtual: number | null = null;
    let valorAtualBRL: number;
    let dayChange: number | null = null;
    let dayChangePct: number | null = null;
    let dayChangeBRL: number | null = null;

    if (precoAtual !== null) {
      valorAtual = qtdTotal * precoAtual;
      const fatorQuote = quoteCurrency ? fxToBRL(quoteCurrency, fxAtual) : fatorAtual;
      valorAtualBRL = valorAtual * fatorQuote;

      if (quote) {
        dayChange = quote.change * qtdTotal;
        dayChangePct = quote.changePercent;
        dayChangeBRL = dayChange * fatorQuote;
      }
    } else {
      valorAtualBRL = custoTotal * fatorAtual;
    }

    const custoTotalBRL = custoTotal * fatorCusto;
    const lucroBRL = precoAtual !== null ? valorAtualBRL - custoTotalBRL : null;
    const lucroPct = lucroBRL !== null && custoTotalBRL > 0
      ? (lucroBRL / custoTotalBRL) * 100
      : null;

    let ganhoAtivoBRL: number | null = null;
    let ganhoCambioBRL: number | null = null;
    if (precoAtual !== null && moeda !== "BRL") {
      const fatorQuote = quoteCurrency ? fxToBRL(quoteCurrency, fxAtual) : fatorAtual;
      ganhoAtivoBRL = (precoAtual - custoMedio) * qtdTotal * fatorQuote;
      ganhoCambioBRL = custoTotal * (fatorAtual - fatorCusto);
    } else if (precoAtual !== null) {
      ganhoAtivoBRL = lucroBRL;
      ganhoCambioBRL = 0;
    }

    positions.push({
      ticker,
      setor,
      quantidade: qtdTotal,
      moeda,
      corretora: pos.corretora,
      custoMedio,
      custoTotal,
      lucroRealizado: pos.lucroRealizado,
      lucroRealizadoBRL: pos.lucroRealizado * fatorAtual,
      precoAtual,
      quoteCurrency,
      valorAtual,
      valorAtualBRL,
      custoTotalBRL,
      lucroBRL,
      lucroPct,
      ganhoAtivoBRL,
      ganhoCambioBRL,
      dayChange,
      dayChangePct,
      dayChangeBRL,
      fatorBRL: fatorAtual,
      fatorCusto,
    });
  }

  positions.sort((a, b) => b.valorAtualBRL - a.valorAtualBRL);
  return positions;
}

export function calcularProventosBRL(
  proventos: Row[],
  fx: FxRates
): { totalBRL: number; porMes: Record<string, number>; porTicker: Record<string, number> } {
  let totalBRL = 0;
  const porMes: Record<string, number> = {};
  const porTicker: Record<string, number> = {};

  for (const row of proventos) {
    const valor = Math.abs(toNumber(getVal(row, "valor", "value")) ?? 0);
    if (valor === 0) continue;

    const moeda = getMoeda(row);
    const valorBRL = valor * fxToBRL(moeda, fx);
    totalBRL += valorBRL;

    const ticker = String(getVal(row, "ticker", "símbolo", "simbolo") ?? "").toUpperCase().trim();
    if (ticker) porTicker[ticker] = (porTicker[ticker] ?? 0) + valorBRL;

    const dataStr = String(getVal(row, "data", "date", "pagamento") ?? "");
    const match = dataStr.match(/^(\d{4})-(\d{2})/);
    if (match) {
      const key = `${match[1]}-${match[2]}`;
      porMes[key] = (porMes[key] ?? 0) + valorBRL;
    }
  }

  return { totalBRL, porMes, porTicker };
}

export function calcularRendaFixaBRL(fixaAberta: Row[], fx: FxRates): number {
  let totalBRL = 0;
  for (const row of fixaAberta) {
    const valor = toNumber(getVal(row, "atual", "valor_atual", "saldo", "valor atual")) ?? 0;
    if (valor <= 0) continue;
    const moeda = getMoeda(row);
    totalBRL += valor * fxToBRL(moeda, fx);
  }
  return totalBRL;
}

export function calcularSnapshot(
  transacoes: Row[],
  proventos: Row[],
  fixaAberta: Row[],
  quotes: Record<string, Quote>,
  fxAtual: FxRates,
  fxCusto: FxRates
): PortfolioSnapshot {
  const portfolio = calcularCarteiraFIFO(transacoes);
  const positions = enriquecerPosicoes(portfolio, quotes, fxAtual, fxCusto);
  const prov = calcularProventosBRL(proventos, fxAtual);
  const rfFixaAberta = calcularRendaFixaBRL(fixaAberta, fxAtual);

  const rvPositions = positions.filter((p) => isRendaVariavel(p.setor));
  const rvPatrimonioBRL = rvPositions
    .filter((p) => p.valorAtualBRL > 1.0)
    .reduce((sum, p) => sum + p.valorAtualBRL, 0);

  const rfDePosicoes = positions
    .filter((p) => isRendaFixa(p.setor))
    .reduce((sum, p) => sum + p.valorAtualBRL, 0);

  const rfPatrimonioBRL = rfFixaAberta + rfDePosicoes;
  const totalPatrimonioBRL = rvPatrimonioBRL + rfPatrimonioBRL;

  const totalInvestidoRV = rvPositions.reduce((s, p) => s + p.custoTotalBRL, 0);
  const totalAtualRV = rvPositions.reduce((s, p) => s + p.valorAtualBRL, 0);
  const lucroBRL = totalAtualRV - totalInvestidoRV;
  const lucroPct = totalInvestidoRV > 0 ? (lucroBRL / totalInvestidoRV) * 100 : 0;

  const ganhoAtivoTotalBRL = rvPositions.reduce((s, p) => s + (p.ganhoAtivoBRL ?? 0), 0);
  const ganhoCambioTotalBRL = rvPositions.reduce((s, p) => s + (p.ganhoCambioBRL ?? 0), 0);

  const dayChangeTotalBRL = rvPositions.reduce((s, p) => s + (p.dayChangeBRL ?? 0), 0);
  const dayChangeTotalPct = rvPatrimonioBRL > 0 ? (dayChangeTotalBRL / rvPatrimonioBRL) * 100 : 0;

  const exposicaoCambial: Record<string, number> = {};
  for (const p of positions) {
    if (p.valorAtualBRL < 1) continue;
    const moedaKey = getMoedaExposicao(p.setor, p.moeda);
    exposicaoCambial[moedaKey] = (exposicaoCambial[moedaKey] ?? 0) + p.valorAtualBRL;
  }

  const setorAlocacao: Record<string, number> = {};
  for (const p of positions) {
    if (p.valorAtualBRL < 1) continue;
    setorAlocacao[p.setor] = (setorAlocacao[p.setor] ?? 0) + p.valorAtualBRL;
  }

  return {
    positions,
    rvPatrimonioBRL,
    rfPatrimonioBRL,
    totalPatrimonioBRL,
    totalProventosBRL: prov.totalBRL,
    proventosMensais: prov.porMes,
    proventosPorTicker: prov.porTicker,
    lucroBRL,
    lucroPct,
    ganhoAtivoTotalBRL,
    ganhoCambioTotalBRL,
    dayChangeTotalBRL,
    dayChangeTotalPct,
    usdbrl: fxAtual.USDBRL,
    eurbrl: fxAtual.EURBRL,
    cadbrl: fxAtual.CADBRL,
    exposicaoCambial,
    setorAlocacao,
  };
}

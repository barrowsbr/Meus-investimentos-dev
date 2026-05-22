import { toNumber } from "./format";
import type { Quote, FxRates } from "./cotacoes";
import { fxToBRL } from "./cotacoes";

export interface Position {
  ticker: string;
  quantidade: number;
  custoMedio: number;
  custoTotal: number;
  moeda: string;
  corretora: string;
  precoAtual: number | null;
  quoteCurrency: string | null;
  valorAtual: number | null;
  lucro: number | null;
  lucroPct: number | null;
  valorAtualBRL: number;
  custoTotalBRL: number;
  lucroBRL: number | null;
}

export interface PortfolioSummary {
  positions: Position[];
  totalInvestidoBRL: number;
  totalAtualBRL: number;
  lucroBRL: number;
  lucroPct: number;
  totalProventosBRL: number;
  totalRendaFixaBRL: number;
  patrimonioBRL: number;
  usdbrl: number;
}

type Row = Record<string, unknown>;

function getVal(row: Row, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  return null;
}

function getTipo(row: Row): string {
  const raw = String(getVal(row, "tipo de transação", "tipo de transacao", "tipo_transacao", "tipo") ?? "").toLowerCase().trim();
  if (raw.includes("compra") || raw.includes("buy") || raw.includes("aporte") || raw.includes("subscri")) return "compra";
  if (raw.includes("venda") || raw.includes("sell") || raw.includes("resgate")) return "venda";
  if (raw.includes("bonif")) return "bonificacao";
  return raw;
}

function getTicker(row: Row): string {
  return String(getVal(row, "símbolo", "simbolo", "ticker", "symbol") ?? "").toUpperCase().trim();
}

function getMoeda(row: Row): string {
  return String(getVal(row, "moeda", "currency") ?? "BRL").toUpperCase().trim();
}

function getCorretora(row: Row): string {
  return String(getVal(row, "corretora", "broker") ?? "").trim();
}

export function calcularPosicoes(
  transacoes: Row[],
  quotes: Record<string, Quote>,
  fx: FxRates
): Position[] {
  const map = new Map<string, {
    qtdCompra: number;
    qtdVenda: number;
    custoTotal: number;
    moeda: string;
    corretora: string;
  }>();

  for (const row of transacoes) {
    const ticker = getTicker(row);
    if (!ticker) continue;

    const tipo = getTipo(row);
    const qtd = toNumber(getVal(row, "quantidade", "qtd", "quantity")) ?? 0;
    const valorLiq = Math.abs(toNumber(getVal(row, "valor líquido", "valor_liquido", "valor_liq")) ?? 0);
    const valorBruto = Math.abs(toNumber(getVal(row, "valor bruto", "valor_bruto", "gross")) ?? 0);
    const preco = Math.abs(toNumber(getVal(row, "preço", "preco", "price")) ?? 0);
    const moeda = getMoeda(row);
    const corretora = getCorretora(row);

    if (!map.has(ticker)) {
      map.set(ticker, { qtdCompra: 0, qtdVenda: 0, custoTotal: 0, moeda, corretora });
    }
    const pos = map.get(ticker)!;

    if (tipo === "compra") {
      const custo = valorLiq || valorBruto || (preco * qtd);
      pos.qtdCompra += qtd;
      pos.custoTotal += custo;
    } else if (tipo === "venda") {
      pos.qtdVenda += qtd;
      const custoMedio = pos.qtdCompra > 0 ? pos.custoTotal / pos.qtdCompra : 0;
      pos.custoTotal -= custoMedio * qtd;
    } else if (tipo === "bonificacao") {
      pos.qtdCompra += qtd;
    }
  }

  const positions: Position[] = [];

  for (const [ticker, pos] of map) {
    const quantidade = pos.qtdCompra - pos.qtdVenda;
    if (quantidade <= 0.001) continue;

    const custoTotal = pos.custoTotal;
    const custoMedio = custoTotal / quantidade;
    const txMoeda = fxToBRL(pos.moeda, fx);
    const custoTotalBRL = custoTotal * txMoeda;

    const quote = quotes[ticker];
    const precoAtual = quote?.price ?? null;
    const quoteCurrency = quote?.currency ?? null;

    let valorAtual: number | null = null;
    let valorAtualBRL = custoTotalBRL;

    if (precoAtual !== null && quoteCurrency) {
      valorAtual = quantidade * precoAtual;
      const txQuote = fxToBRL(quoteCurrency, fx);
      valorAtualBRL = valorAtual * txQuote;
    }

    const lucro = valorAtual !== null ? valorAtual - custoTotal : null;
    const lucroPct = lucro !== null && custoTotal > 0 ? (lucro / custoTotal) * 100 : null;
    const lucroBRL = precoAtual !== null ? valorAtualBRL - custoTotalBRL : null;

    positions.push({
      ticker,
      quantidade,
      custoMedio,
      custoTotal,
      moeda: pos.moeda,
      corretora: pos.corretora,
      precoAtual,
      quoteCurrency,
      valorAtual,
      lucro,
      lucroPct,
      valorAtualBRL,
      custoTotalBRL,
      lucroBRL,
    });
  }

  positions.sort((a, b) => b.valorAtualBRL - a.valorAtualBRL);
  return positions;
}

export function calcularProventosBRL(proventos: Row[], fx: FxRates): { totalBRL: number; porMes: Record<string, number> } {
  let totalBRL = 0;
  const porMes: Record<string, number> = {};

  for (const row of proventos) {
    const valor = Math.abs(toNumber(getVal(row, "valor", "value")) ?? 0);
    if (valor === 0) continue;

    const moeda = getMoeda(row);
    const valorBRL = valor * fxToBRL(moeda, fx);
    totalBRL += valorBRL;

    const dataStr = String(getVal(row, "data", "date", "pagamento") ?? "");
    const match = dataStr.match(/^(\d{4})-(\d{2})/);
    if (match) {
      const key = `${match[1]}-${match[2]}`;
      porMes[key] = (porMes[key] ?? 0) + valorBRL;
    }
  }

  return { totalBRL, porMes };
}

export function calcularRendaFixaBRL(fixaAberta: Row[], fx: FxRates): number {
  let totalBRL = 0;
  for (const row of fixaAberta) {
    const valor = toNumber(getVal(row, "atual", "valor_atual", "saldo", "valor atual")) ?? 0;
    const moeda = getMoeda(row);
    totalBRL += valor * fxToBRL(moeda, fx);
  }
  return totalBRL;
}

export function calcularResumo(
  transacoes: Row[],
  proventos: Row[],
  fixaAberta: Row[],
  quotes: Record<string, Quote>,
  fx: FxRates
): PortfolioSummary {
  const positions = calcularPosicoes(transacoes, quotes, fx);
  const prov = calcularProventosBRL(proventos, fx);
  const rendaFixa = calcularRendaFixaBRL(fixaAberta, fx);

  const totalInvestidoBRL = positions.reduce((s, p) => s + p.custoTotalBRL, 0);
  const totalAtualBRL = positions.reduce((s, p) => s + p.valorAtualBRL, 0);
  const lucroBRL = totalAtualBRL - totalInvestidoBRL;
  const lucroPct = totalInvestidoBRL > 0 ? (lucroBRL / totalInvestidoBRL) * 100 : 0;

  const patrimonioBRL = totalAtualBRL + rendaFixa;

  return {
    positions,
    totalInvestidoBRL,
    totalAtualBRL,
    lucroBRL,
    lucroPct,
    totalProventosBRL: prov.totalBRL,
    totalRendaFixaBRL: rendaFixa,
    patrimonioBRL,
    usdbrl: fx.USDBRL,
  };
}

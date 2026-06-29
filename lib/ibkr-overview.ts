/**
 * Visão gerencial da conta IBKR, montada 100% a partir do extrato Flex
 * (sem depender da planilha). Alimenta a página /ibkr.
 */

import { getFlexXmlCached, parseFlexXml, parseFlexMeta } from "./ibkr-flex";
import { parseValor } from "./broker-import";
import { fetchFxRates, fxToBRL, type FxRates } from "./cotacoes";

export interface OverviewPosition {
  ticker: string;
  moeda: string;
  assetClass: string;
  quantidade: number;
  custoPreco: number;
  markPrice: number;
  marketValue: number;
  cost: number;
  pnl: number;
  pnlPct: number | null;
  marketValueBRL: number | null;
}

export interface IbkrOverview {
  meta: { accountId: string; fromDate: string; toDate: string; fxSource: string; brlOk: boolean };
  kpis: {
    patrimonioBRL: number;
    custoBRL: number;
    resultadoBRL: number;
    resultadoPct: number | null;
    posicoes: number;
    dividendosBRL: number;
    impostosBRL: number;
    dividendosLiquidoBRL: number;
  };
  byCurrency: Array<{ moeda: string; marketValue: number; cost: number; pnl: number; count: number }>;
  dividendsByTicker: Array<{ ticker: string; moeda: string; dividendos: number; impostos: number; liquido: number }>;
  positions: OverviewPosition[];
  proventos: Array<{ ticker: string; data: string; tipo: "Dividendo" | "Imposto"; valor: string; moeda: string }>;
  trades: Array<{ data: string; tipo: string; ticker: string; quantidade: string; preco: string; valor: string; moeda: string }>;
  cambio: Array<{ data: string; de: string; para: string; valorOrigem: string; valorDestino: string; taxa: string }>;
}

export async function buildIbkrOverview(): Promise<IbkrOverview> {
  const token = process.env.IBKR_FLEX_TOKEN;
  const queryId = process.env.IBKR_FLEX_QUERY_ID;
  if (!token || !queryId) throw new Error("IBKR_FLEX_TOKEN e/ou IBKR_FLEX_QUERY_ID não configurados");

  const xml = await getFlexXmlCached(token, queryId);
  const { proventos, trades, cambio, positions } = parseFlexXml(xml);
  const meta = parseFlexMeta(xml);

  let fx: FxRates | null = null;
  let fxSource = "indisponível";
  try {
    const r = await fetchFxRates();
    fx = r.fx;
    fxSource = r.fxSource;
  } catch { /* sem FX → totais ficam só em moeda nativa */ }
  const toBRL = (val: number, moeda: string): number | null => (fx ? val * fxToBRL(moeda, fx) : null);

  // ── Posições enriquecidas ──
  const pos: OverviewPosition[] = positions
    .map((p) => {
      const marketValue = p.quantidade * p.markPrice;
      const cost = p.custoTotal;
      const pnl = marketValue - cost;
      return {
        ticker: p.ticker,
        moeda: p.moeda,
        assetClass: p.assetClass,
        quantidade: p.quantidade,
        custoPreco: p.custoPreco,
        markPrice: p.markPrice,
        marketValue,
        cost,
        pnl,
        pnlPct: cost !== 0 ? pnl / Math.abs(cost) : null,
        marketValueBRL: toBRL(marketValue, p.moeda),
      };
    })
    .sort((a, b) => (b.marketValueBRL ?? b.marketValue) - (a.marketValueBRL ?? a.marketValue));

  const patrimonioBRL = pos.reduce((s, p) => s + (toBRL(p.marketValue, p.moeda) ?? 0), 0);
  const custoBRL = pos.reduce((s, p) => s + (toBRL(p.cost, p.moeda) ?? 0), 0);
  const resultadoBRL = patrimonioBRL - custoBRL;

  // ── Agregado por moeda ──
  const ccyMap = new Map<string, { moeda: string; marketValue: number; cost: number; pnl: number; count: number }>();
  for (const p of pos) {
    const e = ccyMap.get(p.moeda) ?? { moeda: p.moeda, marketValue: 0, cost: 0, pnl: 0, count: 0 };
    e.marketValue += p.marketValue; e.cost += p.cost; e.pnl += p.pnl; e.count += 1;
    ccyMap.set(p.moeda, e);
  }

  // ── Proventos / impostos do período ──
  const isImposto = (decisao: string) => decisao.toUpperCase().includes("IMPOSTO");
  const sumBRL = (rows: typeof proventos) => rows.reduce((s, r) => s + (toBRL(Math.abs(parseValor(r.valor)), r.moeda) ?? 0), 0);
  const divs = proventos.filter((p) => !isImposto(p.decisao));
  const taxes = proventos.filter((p) => isImposto(p.decisao));
  const dividendosBRL = sumBRL(divs);
  const impostosBRL = sumBRL(taxes);

  // ── Dividendos/impostos agregados por ativo (todos os proventos do período) ──
  const dtMap = new Map<string, { ticker: string; moeda: string; dividendos: number; impostos: number }>();
  for (const p of proventos) {
    const e = dtMap.get(p.ticker) ?? { ticker: p.ticker, moeda: p.moeda, dividendos: 0, impostos: 0 };
    const v = Math.abs(parseValor(p.valor));
    if (isImposto(p.decisao)) e.impostos += v; else e.dividendos += v;
    dtMap.set(p.ticker, e);
  }
  const dividendsByTicker = [...dtMap.values()]
    .map((d) => ({ ...d, liquido: d.dividendos - d.impostos }))
    .sort((a, b) => b.dividendos - a.dividendos);

  return {
    meta: { accountId: meta.accountId, fromDate: meta.fromDate, toDate: meta.toDate, fxSource, brlOk: fx !== null },
    kpis: {
      patrimonioBRL,
      custoBRL,
      resultadoBRL,
      resultadoPct: custoBRL !== 0 ? resultadoBRL / custoBRL : null,
      posicoes: pos.length,
      dividendosBRL,
      impostosBRL,
      dividendosLiquidoBRL: dividendosBRL - impostosBRL,
    },
    byCurrency: [...ccyMap.values()].sort((a, b) => b.marketValue - a.marketValue),
    dividendsByTicker,
    positions: pos,
    proventos: [...proventos]
      .sort((a, b) => b.data.localeCompare(a.data))
      .slice(0, 60)
      .map((p) => ({ ticker: p.ticker, data: p.data, tipo: isImposto(p.decisao) ? "Imposto" : "Dividendo", valor: p.valor, moeda: p.moeda })),
    trades: [...trades]
      .sort((a, b) => b.Data.localeCompare(a.Data))
      .slice(0, 40)
      .map((t) => ({
        data: t.Data, tipo: t["Tipo de transação"], ticker: t.Símbolo,
        quantidade: t.Quantidade, preco: t.Preço, valor: t["Valor bruto"], moeda: t.Moeda,
      })),
    cambio: cambio.map((c) => ({
      data: c.data, de: c.moeda_origem, para: c.moeda_destino,
      valorOrigem: c.valor_origem, valorDestino: c.valor_destino, taxa: c.taxa,
    })),
  };
}

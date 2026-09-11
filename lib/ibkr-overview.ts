/**
 * Visão gerencial da conta IBKR, montada a partir do extrato Flex (posições,
 * custo, proventos) + cotações ao vivo (preço atual e variação do dia).
 * Todos os totais em US$ e R$ (via FX). Não depende da planilha. Alimenta /ibkr.
 */

import { getFlexXmlCached, parseFlexXml, parseFlexMeta } from "./ibkr-flex";
import { parseValor } from "./broker-import";
import { fetchCotacoes, fxToBRL, type FxRates, type Quote } from "./cotacoes";
import { loadAssetMetaCache } from "./asset-meta";

export interface OverviewPosition {
  ticker: string;
  moeda: string;
  assetClass: string;
  quantidade: number;
  custoPreco: number;
  markPrice: number;
  marketValue: number;
  marketValueBRL: number | null;
  marketValueUSD: number | null;
  cost: number;
  pnl: number;
  pnlPct: number | null;
  dayChange: number;
  dayChangePct: number | null;
  dayPnl: number;
  dayPnlBRL: number | null;
  dayPnlUSD: number | null;
}

export interface IbkrOverview {
  meta: { accountId: string; fromDate: string; toDate: string; fxSource: string; brlOk: boolean; usdbrl: number | null };
  kpis: {
    patrimonioBRL: number; patrimonioUSD: number | null;
    caixaBRL: number; caixaUSD: number | null;
    // Dívida de margem (empréstimo da corretora) — endingCash negativo no Flex.
    margemBRL: number; margemUSD: number | null;
    // Total LÍQUIDO da dívida (Net Liquidation Value, igual ao app da IBKR).
    patrimonioTotalBRL: number; patrimonioTotalUSD: number | null;
    custoBRL: number; custoUSD: number | null;
    resultadoBRL: number; resultadoUSD: number | null; resultadoPct: number | null;
    lucroDiaBRL: number; lucroDiaUSD: number | null; lucroDiaPct: number | null;
    posicoes: number;
    dividendosBRL: number; dividendosUSD: number | null;
    impostosBRL: number; impostosUSD: number | null;
    dividendosLiquidoBRL: number; dividendosLiquidoUSD: number | null;
  };
  cashByCurrency: Array<{ moeda: string; valor: number; valorBRL: number | null }>;
  marginByCurrency: Array<{ moeda: string; valor: number; valorBRL: number | null; jurosAcruados: number; initMargin: number; maintMargin: number }>;
  byCurrency: Array<{ moeda: string; marketValue: number; cost: number; pnl: number; dayPnl: number; count: number }>;
  dividendsByTicker: Array<{ ticker: string; moeda: string; dividendos: number; impostos: number; liquido: number }>;
  positions: OverviewPosition[];
  proventos: Array<{ ticker: string; data: string; tipo: "Dividendo" | "Imposto"; valor: string; moeda: string }>;
  trades: Array<{ data: string; tipo: string; ticker: string; quantidade: string; preco: string; valor: string; moeda: string }>;
  cambio: Array<{ data: string; de: string; para: string; valorOrigem: string; valorDestino: string; taxa: string }>;
  /** Ponte do resultado do período, direto do extrato (seção Change in NAV):
   *  de onde veio o ganho e quanto a corretora levou. Null se a seção não
   *  estiver habilitada na Flex query. */
  ponteResultado: {
    de: string; ate: string;
    navInicial: number; navFinal: number; aportes: number;
    /** As parcelas que somam o resultado (já em moeda BASE da conta). */
    partes: Array<{ chave: string; rotulo: string; valor: number }>;
    /** navFinal − navInicial − aportes: o resultado que as parcelas explicam. */
    resultado: number;
    /** Sobra entre o resultado e a soma das parcelas (linhas da IBKR que não
     *  trazemos). Perto de zero = a ponte fecha. */
    residuo: number;
    twrOficial: number | null;
  } | null;
  /** Taxas e juros da corretora no período. ⚠️ NÃO é só cobrança: a IBKR lança
   *  crédito/estorno com o MESMO tipo e sinal POSITIVO (no extrato real havia
   *  "Other Fees" de +200). Por isso os dois lados vêm separados e o líquido
   *  vem COM SINAL — somar tudo e mostrar em módulo pintava um crédito de
   *  US$ 200 como se fosse despesa. */
  custosCorretora: {
    /** Soma com sinal: negativo = saiu dinheiro, positivo = entrou. */
    liquidoBase: number;
    /** Só os lançamentos de saída (≤ 0). */
    cobrancasBase: number;
    /** Só os de entrada (≥ 0) — estornos, créditos promocionais. */
    creditosBase: number;
    porTipo: Array<{ tipo: string; valorBase: number; n: number }>;
    ultimos: Array<{ data: string; tipo: string; valor: number; moeda: string }>;
  };
  /** A receber: declarado pelo emissor e ainda não creditado (última foto). */
  aReceber: { dividendos: number; juros: number; taxasAPagar: number; data: string } | null;
  /** Composição do NAV no tempo (caixa × ações × fundos) — para o gráfico. */
  composicao: Array<{ date: string; caixa: number; acoes: number; fundos: number; total: number }>;
}

export async function buildIbkrOverview(): Promise<IbkrOverview> {
  const token = process.env.IBKR_FLEX_TOKEN;
  const queryId = process.env.IBKR_FLEX_QUERY_ID;
  if (!token || !queryId) throw new Error("IBKR_FLEX_TOKEN e/ou IBKR_FLEX_QUERY_ID não configurados");

  const xml = await getFlexXmlCached(token, queryId);
  const { proventos, trades, cambio, positions, cashBalances, marginBalances,
          changeInNav, custosCorretora: custosCru, navComposicao } = parseFlexXml(xml);
  const meta = parseFlexMeta(xml);

  // FX + cotações ao vivo (preço atual e variação do dia) numa só chamada.
  // Carrega o cache ativos_meta ANTES: yahooTicker() usa esse cache para achar
  // a grafia Yahoo (DPM→DPM.TO, etc.); sem ele, tickers internacionais podiam
  // falhar a cotação ao vivo e cair no preço ESTÁTICO do extrato — o que
  // desalinhava o patrimônio da IBKR (Home) do canônico (que já carrega o cache).
  let fx: FxRates | null = null;
  let fxSource = "indisponível";
  let quotes: Record<string, Quote> = {};
  try {
    await loadAssetMetaCache().catch(() => {});
    const cot = await fetchCotacoes(positions.map((p) => ({ ticker: p.ticker, moeda: p.moeda, corretora: "IBKR" })));
    fx = cot.fx; fxSource = cot.fxSource; quotes = cot.quotes;
  } catch { /* sem FX/cotações → cai pro preço do extrato e totais nativos */ }

  const usdbrl = fx ? fx.USDBRL : null;
  const toBRL = (val: number, moeda: string): number | null => (fx ? val * fxToBRL(moeda, fx) : null);
  const toUSD = (val: number, moeda: string): number | null => (fx && usdbrl ? (val * fxToBRL(moeda, fx)) / usdbrl : null);
  const brlToUsd = (brl: number): number | null => (usdbrl ? brl / usdbrl : null);

  // ── Posições enriquecidas (preço ao vivo + variação do dia) ──
  const pos: OverviewPosition[] = positions
    .map((p) => {
      const q = quotes[p.ticker];
      const markPrice = q?.price ?? p.markPrice; // preço ao vivo, fallback extrato
      const marketValue = p.quantidade * markPrice;
      const cost = p.custoTotal;
      const pnl = marketValue - cost;
      const dayChange = q?.change ?? 0;
      const dayPnl = p.quantidade * dayChange;
      return {
        ticker: p.ticker,
        moeda: p.moeda,
        assetClass: p.assetClass,
        quantidade: p.quantidade,
        custoPreco: p.custoPreco,
        markPrice,
        marketValue,
        marketValueBRL: toBRL(marketValue, p.moeda),
        marketValueUSD: toUSD(marketValue, p.moeda),
        cost,
        pnl,
        pnlPct: cost !== 0 ? pnl / Math.abs(cost) : null,
        dayChange,
        // changePercent vem como número percentual (ex.: 1.82 = 1,82%) → razão p/ pct()
        dayChangePct: q && q.changePercent != null ? q.changePercent / 100 : null,
        dayPnl,
        dayPnlBRL: toBRL(dayPnl, p.moeda),
        dayPnlUSD: toUSD(dayPnl, p.moeda),
      };
    })
    .sort((a, b) => (b.marketValueBRL ?? b.marketValue) - (a.marketValueBRL ?? a.marketValue));

  const patrimonioBRL = pos.reduce((s, p) => s + (toBRL(p.marketValue, p.moeda) ?? 0), 0);
  const custoBRL = pos.reduce((s, p) => s + (toBRL(p.cost, p.moeda) ?? 0), 0);
  const resultadoBRL = patrimonioBRL - custoBRL;
  const lucroDiaBRL = pos.reduce((s, p) => s + (p.dayPnlBRL ?? 0), 0);
  const baseDia = patrimonioBRL - lucroDiaBRL; // patrimônio de ontem

  // ── Caixa (saldo) por moeda ──
  const cashByCurrency = cashBalances
    .map((c) => ({ moeda: c.moeda, valor: c.saldo, valorBRL: toBRL(c.saldo, c.moeda) }))
    .sort((a, b) => (b.valorBRL ?? b.valor) - (a.valorBRL ?? a.valor));
  const caixaBRL = cashByCurrency.reduce((s, c) => s + (c.valorBRL ?? 0), 0);

  // ── Margem (dívida) por moeda — endingCash negativo vira dívida no parser ──
  // O total da conta é LÍQUIDO da dívida (Net Liquidation Value): ativos
  // comprados na margem contam no patrimônio, mas o empréstimo é abatido.
  // Sem isso, entrar em margem INFLAVA o "Patrimônio do dia" da Home (e o
  // histórico patrimonial) exatamente no valor emprestado.
  const marginByCurrency = marginBalances
    .map((m) => ({ moeda: m.moeda, valor: m.saldo, valorBRL: toBRL(m.saldo, m.moeda), jurosAcruados: m.jurosAcruados, initMargin: m.initMargin, maintMargin: m.maintMargin }))
    .sort((a, b) => (b.valorBRL ?? b.valor) - (a.valorBRL ?? a.valor));
  const margemBRL = marginByCurrency.reduce((s, c) => s + (c.valorBRL ?? 0), 0);
  const patrimonioTotalBRL = patrimonioBRL + caixaBRL - margemBRL;

  // ── Agregado por moeda ──
  const ccyMap = new Map<string, { moeda: string; marketValue: number; cost: number; pnl: number; dayPnl: number; count: number }>();
  for (const p of pos) {
    const e = ccyMap.get(p.moeda) ?? { moeda: p.moeda, marketValue: 0, cost: 0, pnl: 0, dayPnl: 0, count: 0 };
    e.marketValue += p.marketValue; e.cost += p.cost; e.pnl += p.pnl; e.dayPnl += p.dayPnl; e.count += 1;
    ccyMap.set(p.moeda, e);
  }

  // ── Proventos / impostos do período ──
  const isImposto = (decisao: string) => decisao.toUpperCase().includes("IMPOSTO");
  const sumBRL = (rows: typeof proventos) => rows.reduce((s, r) => s + (toBRL(Math.abs(parseValor(r.valor)), r.moeda) ?? 0), 0);
  const dividendosBRL = sumBRL(proventos.filter((p) => !isImposto(p.decisao)));
  const impostosBRL = sumBRL(proventos.filter((p) => isImposto(p.decisao)));
  const liquidoBRL = dividendosBRL - impostosBRL;

  // ── Dividendos/impostos agregados por ativo ──
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

  // ── Ponte do resultado: o que a IBKR diz sobre a origem do ganho ──────────
  // Em moeda BASE da conta (a mesma do Change in NAV), não convertida: é um
  // demonstrativo do extrato, e converter aqui só criaria divergência com o
  // que aparece no app da corretora.
  const ponteResultado = (() => {
    if (!changeInNav) return null;
    const c = changeInNav;
    const partes = [
      { chave: "mtm", rotulo: "Marcação a mercado", valor: c.mtm },
      { chave: "realizado", rotulo: "Resultado realizado", valor: c.realized },
      { chave: "dividendos", rotulo: "Dividendos", valor: c.dividendos },
      { chave: "imposto", rotulo: "Imposto retido", valor: c.impostoRetido },
      { chave: "juros", rotulo: "Juros", valor: c.juros },
      { chave: "comissoes", rotulo: "Comissões", valor: c.comissoes },
      { chave: "taxas", rotulo: "Outras taxas", valor: c.outrasTaxas },
      { chave: "fx", rotulo: "Conversão de moeda", valor: c.fxTranslation },
      { chave: "provisoes", rotulo: "Provisões (a receber)", valor: c.variacaoDividendosAReceber + c.variacaoJurosAReceber },
    ].filter((p) => p.valor !== 0);
    const resultado = c.endingValue - c.startingValue - c.depositsWithdrawals;
    const soma = partes.reduce((acc, p) => acc + p.valor, 0);
    return {
      de: c.fromDate || meta.fromDate, ate: c.toDate || meta.toDate,
      navInicial: c.startingValue, navFinal: c.endingValue, aportes: c.depositsWithdrawals,
      partes, resultado, residuo: resultado - soma, twrOficial: c.twr,
    };
  })();

  // ── O que a corretora cobrou (era descartado no parser) ───────────────────
  const porTipoMap = new Map<string, { valorBase: number; n: number }>();
  for (const c of custosCru) {
    const cur = porTipoMap.get(c.tipo) ?? { valorBase: 0, n: 0 };
    porTipoMap.set(c.tipo, { valorBase: cur.valorBase + c.valorBase, n: cur.n + 1 });
  }
  const custosCorretora = {
    liquidoBase: custosCru.reduce((acc, c) => acc + c.valorBase, 0),
    cobrancasBase: custosCru.reduce((acc, c) => acc + Math.min(0, c.valorBase), 0),
    creditosBase: custosCru.reduce((acc, c) => acc + Math.max(0, c.valorBase), 0),
    porTipo: [...porTipoMap.entries()]
      .map(([tipo, v]) => ({ tipo, ...v }))
      .sort((a, b) => a.valorBase - b.valorBase), // mais negativo (mais caro) primeiro
    ultimos: [...custosCru]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 12)
      .map((c) => ({ data: c.date, tipo: c.tipo, valor: c.valor, moeda: c.moeda })),
  };

  // ── A receber (última foto) + composição no tempo ─────────────────────────
  const ultimaComp = navComposicao.length ? navComposicao[navComposicao.length - 1] : null;
  const aReceber = ultimaComp
    ? { dividendos: ultimaComp.dividendosAReceber, juros: ultimaComp.jurosAReceber, taxasAPagar: ultimaComp.taxasAPagar, data: ultimaComp.date }
    : null;
  const composicao = navComposicao.map((c) => ({ date: c.date, caixa: c.caixa, acoes: c.acoes, fundos: c.fundos, total: c.total }));

  return {
    meta: { accountId: meta.accountId, fromDate: meta.fromDate, toDate: meta.toDate, fxSource, brlOk: fx !== null, usdbrl },
    ponteResultado, custosCorretora, aReceber, composicao,
    kpis: {
      patrimonioBRL, patrimonioUSD: brlToUsd(patrimonioBRL),
      caixaBRL, caixaUSD: brlToUsd(caixaBRL),
      margemBRL, margemUSD: brlToUsd(margemBRL),
      patrimonioTotalBRL, patrimonioTotalUSD: brlToUsd(patrimonioTotalBRL),
      custoBRL, custoUSD: brlToUsd(custoBRL),
      resultadoBRL, resultadoUSD: brlToUsd(resultadoBRL), resultadoPct: custoBRL !== 0 ? resultadoBRL / custoBRL : null,
      lucroDiaBRL, lucroDiaUSD: brlToUsd(lucroDiaBRL), lucroDiaPct: baseDia !== 0 ? lucroDiaBRL / baseDia : null,
      posicoes: pos.length,
      dividendosBRL, dividendosUSD: brlToUsd(dividendosBRL),
      impostosBRL, impostosUSD: brlToUsd(impostosBRL),
      dividendosLiquidoBRL: liquidoBRL, dividendosLiquidoUSD: brlToUsd(liquidoBRL),
    },
    cashByCurrency,
    marginByCurrency,
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

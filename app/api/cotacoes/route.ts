import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { fetchCotacoes, yahooTicker } from "@/lib/cotacoes";
import { calcularSnapshot } from "@/lib/portfolio";
import { calcularCambioMetrics, buildPmFxRates, parsePtax, parseLbHistoric, buildFxDateMap } from "@/lib/cambio";
import { MARGIN_TAB, parseMarginRows, computeMarginResumo, aplicarAlavancagem, mergeIbkrMargin, loadIbkrMarginBalances } from "@/lib/margin";
import { loadAssetMetaCache } from "@/lib/asset-meta";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const store = getDataStore();
    // Margem IBKR (Flex, cache 30 min) em paralelo com o resto do carregamento.
    const ibkrMarginPromise = loadIbkrMarginBalances();
    const [transacoes, proventos, fixaAberta, cambioRows, ptaxRows, lbRows, marginRows] = await Promise.all([
      store.fetchTab("meus_ativos"),
      store.fetchTab("meus_proventos"),
      store.fetchTab("fixa_aberta"),
      store.fetchTab("cambio").catch(() => []),
      store.fetchTab("p_tax").catch(() => []),
      store.fetchTab("lb_historic").catch(() => []),
      store.fetchTab(MARGIN_TAB).catch(() => []),
      loadAssetMetaCache(),
    ]);

    const tickerSet = new Map<string, { moeda: string; corretora: string }>();
    for (const row of transacoes) {
      const ticker = String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? "").toUpperCase().trim();
      if (!ticker) continue;
      if (!tickerSet.has(ticker)) {
        tickerSet.set(ticker, {
          moeda: String(row["moeda"] ?? "BRL").toUpperCase().trim(),
          corretora: String(row["corretora"] ?? "").trim(),
        });
      }
    }

    const tickers = [...tickerSet.entries()].map(([ticker, info]) => ({
      ticker,
      moeda: info.moeda,
      corretora: info.corretora,
    }));

    const cotacoes = await fetchCotacoes(tickers);
    const fxAtual = cotacoes.fx;

    const cambio = calcularCambioMetrics(cambioRows, fxAtual);
    const fxCusto = buildPmFxRates(cambio);
    const ptax = parsePtax(ptaxRows);
    const lbHistoric = parseLbHistoric(lbRows);

    const fxByDate = buildFxDateMap(ptaxRows, cambio.historico);

    // Variação cambial do dia, por moeda — alimenta a reavaliação do principal
    // estrangeiro no resultado do dia (dayChangeBRL canônico = preço + câmbio).
    const fxDayChange: Record<string, { change: number; changePct: number }> = {};
    try {
      const { fetchQuotes } = await import("@/lib/cotacoes");
      const fxTickerByCcy: Record<string, string> = {
        USD: "BRL=X", EUR: "EURBRL=X", CAD: "CADBRL=X", GBP: "GBPBRL=X",
      };
      const fxQuoteResult = await fetchQuotes(Object.values(fxTickerByCcy));
      for (const [ccy, tk] of Object.entries(fxTickerByCcy)) {
        const q = fxQuoteResult.quotes[tk];
        if (q) fxDayChange[ccy] = { change: q.change, changePct: q.changePercent };
      }
    } catch {
      // non-critical
    }

    const snapshot = calcularSnapshot(transacoes, proventos, fixaAberta, cotacoes.quotes, fxAtual, fxCusto, fxByDate, fxDayChange);

    // Alavancagem (margin): bruto = snapshot; net = bruto − dívida aberta.
    // Entradas canônicas = aba + saldos reais da IBKR (mesma regra das demais rotas).
    let marginEntries = parseMarginRows(marginRows);
    const ibkrMargin = await ibkrMarginPromise;
    if (ibkrMargin.length > 0) marginEntries = mergeIbkrMargin(marginEntries, ibkrMargin);
    const marginResumo = computeMarginResumo(marginEntries, {
      BRL: 1,
      USD: fxAtual.USDBRL,
      EUR: fxAtual.EURBRL,
      GBP: fxAtual.GBPBRL,
      CAD: fxAtual.CADBRL,
      CHF: fxAtual.CHFBRL ?? 0,
      JPY: fxAtual.JPYBRL ?? 0,
    });
    const alavancagem = aplicarAlavancagem(snapshot.totalPatrimonioBRL, marginResumo);

    const quotesFound = Object.keys(cotacoes.quotes).length;
    const quotesTotal = tickers.length;

    return NextResponse.json({
      ...snapshot,
      alavancagem,
      fx: fxAtual,
      fxSource: cotacoes.fxSource,
      fxCusto,
      cambio: {
        pmDolar: cambio.pmDolar,
        pmEuro: cambio.pmEuro,
        pmCad: cambio.pmCad,
        pmGbp: cambio.pmGbp,
        spotUSD: cambio.spotUSD,
        spotEUR: cambio.spotEUR,
        spotCAD: cambio.spotCAD,
        spotGBP: cambio.spotGBP,
        totalEnviadoBRL: cambio.totalEnviadoBRL,
        totalRecebidoUSD: cambio.totalRecebidoUSD,
        totalRecebidoEUR: cambio.totalRecebidoEUR,
        totalRecebidoCAD: cambio.totalRecebidoCAD,
        totalRecebidoGBP: cambio.totalRecebidoGBP,
        ganhoCambialUSD_BRL: cambio.ganhoCambialUSD_BRL,
        ganhoCambialEUR_BRL: cambio.ganhoCambialEUR_BRL,
        ganhoCambialCAD_BRL: cambio.ganhoCambialCAD_BRL,
        ganhoCambialGBP_BRL: cambio.ganhoCambialGBP_BRL,
        ganhoTotal_BRL: cambio.ganhoTotal_BRL,
        usdComprado: cambio.usdComprado,
        usdVendido: cambio.usdVendido,
        usdNet: cambio.usdNet,
        brlGastoUSD: cambio.brlGastoUSD,
        brlCustoUsdNet: cambio.brlCustoUsdNet,
        valorUsdHoje: cambio.valorUsdHoje,
        ganhoUsdBRL: cambio.ganhoUsdBRL,
        ganhoUsdPct: cambio.ganhoUsdPct,
        deltaPmUsd: cambio.deltaPmUsd,
        totalValBRL: cambio.totalValBRL,
        totalCustoBRL: cambio.totalCustoBRL,
        ganhoTotalPct: cambio.ganhoTotalPct,
        numMoedas: cambio.numMoedas,
        fx2: cambio.fx2,
        operacoes: cambio.operacoes,
        debug: cambio.debug,
      },
      ptax,
      lbHistoric,
      fxDayChange,
      timestamp: cotacoes.timestamp,
      quotesFound,
      quotesTotal,
      quotesErrors: cotacoes.errors,
      tickerMap: Object.fromEntries(
        tickers.map((t) => [t.ticker, yahooTicker(t.ticker, t.moeda, t.corretora)])
      ),
    }, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

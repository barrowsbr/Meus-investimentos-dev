import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";
import { fetchCotacoes, yahooTicker } from "@/lib/cotacoes";
import { calcularSnapshot } from "@/lib/portfolio";
import { calcularCambioMetrics, buildPmFxRates, parsePtax, parseLbHistoric } from "@/lib/cambio";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const [transacoes, proventos, fixaAberta, cambioRows, ptaxRows, lbRows] = await Promise.all([
      fetchTab("meus_ativos"),
      fetchTab("meus_proventos"),
      fetchTab("fixa_aberta"),
      fetchTab("cambio").catch(() => []),
      fetchTab("p_tax").catch(() => []),
      fetchTab("lb_historic").catch(() => []),
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

    const snapshot = calcularSnapshot(transacoes, proventos, fixaAberta, cotacoes.quotes, fxAtual, fxCusto);

    const quotesFound = Object.keys(cotacoes.quotes).length;
    const quotesTotal = tickers.length;

    return NextResponse.json({
      ...snapshot,
      fx: fxAtual,
      fxSource: cotacoes.fxSource,
      fxCusto,
      cambio: {
        pmDolar: cambio.pmDolar,
        pmEuro: cambio.pmEuro,
        pmCad: cambio.pmCad,
        pmGbp: cambio.pmGbp,
        totalEnviadoBRL: cambio.totalEnviadoBRL,
        totalRecebidoUSD: cambio.totalRecebidoUSD,
        ganhoCambialUSD_BRL: cambio.ganhoCambialUSD_BRL,
        operacoes: cambio.operacoes,
        debug: cambio.debug,
      },
      ptax,
      lbHistoric,
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

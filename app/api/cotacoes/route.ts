import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";
import { fetchCotacoes, yahooTicker } from "@/lib/cotacoes";
import { calcularSnapshot } from "@/lib/portfolio";

export const revalidate = 900;

export async function GET() {
  try {
    const [transacoes, proventos, fixaAberta] = await Promise.all([
      fetchTab("meus_ativos"),
      fetchTab("meus_proventos"),
      fetchTab("fixa_aberta"),
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
    const snapshot = calcularSnapshot(transacoes, proventos, fixaAberta, cotacoes.quotes, cotacoes.fx);

    return NextResponse.json({
      ...snapshot,
      fx: cotacoes.fx,
      timestamp: cotacoes.timestamp,
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

import { NextResponse } from "next/server";
import { fetchHoldings, assembleHoldings } from "@/lib/etf-holdings";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tickers = (searchParams.get("tickers") ?? "").split(",").map(t => t.trim().toUpperCase()).filter(Boolean);

  if (tickers.length === 0) {
    return NextResponse.json({ error: "Query param 'tickers' é obrigatório" }, { status: 400 });
  }

  const results: Record<string, {
    components: { ativo: string; name: string; peso: number }[];
    source: string;
  }> = {};

  await Promise.all(
    tickers.slice(0, 10).map(async (ticker) => {
      const raw = await fetchHoldings(ticker);
      if (raw.holdings && raw.holdings.length > 0) {
        // assembleHoldings reescala os pesos para a cobertura REAL do ETF (o
        // top-10 do Yahoo soma ~20% de um fundo diversificado); sem isto, a
        // normalização por totalWeight inflava cada holding ~5× (AAPL 4% → ~20%).
        // Excluímos o bucket OUTROS.* para não injetar pseudo-ticker no consumidor:
        // os pesos somam a cobertura (<1), a diversificação restante fica implícita.
        const { holdings, source } = assembleHoldings(ticker, raw.holdings, raw.source, 25);
        results[ticker] = {
          components: holdings
            .filter(h => !h.ticker.startsWith("OUTROS."))
            .map(h => ({ ativo: h.ticker, name: h.name, peso: h.weight_pct / 100 })),
          source,
        };
      }
    }),
  );

  return NextResponse.json({ compositions: results });
}

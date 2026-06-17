import { NextResponse } from "next/server";
import { fetchHoldings } from "@/lib/etf-holdings";

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
      const { holdings, source } = await fetchHoldings(ticker);
      if (holdings && holdings.length > 0) {
        const totalWeight = holdings.reduce((s, h) => s + h.weight_pct, 0);
        results[ticker] = {
          components: holdings.map(h => ({
            ativo: h.ticker,
            name: h.name,
            peso: totalWeight > 0 ? h.weight_pct / totalWeight : 0,
          })),
          source,
        };
      }
    }),
  );

  return NextResponse.json({ compositions: results });
}

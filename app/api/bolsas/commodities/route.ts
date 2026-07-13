import { NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/cotacoes";
import { COMMODITIES, type CommodityQuote, type CommoditiesResponse } from "@/lib/radar/commodities";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

export async function GET() {
  try {
    const symbols = COMMODITIES.map(c => c.symbol);
    const { quotes } = await fetchQuotes(symbols);

    // Contrato sem cotação (ex.: ALI=F fora do pregão) sai da lista — linha
    // morta confunde mais do que ajuda num painel de monitoramento.
    const commodities: CommodityQuote[] = COMMODITIES.flatMap(meta => {
      const q = quotes[meta.symbol];
      if (!q || !(q.price > 0)) return [];
      return [{
        ...meta,
        price: q.price,
        change: q.change ?? 0,
        changePct: q.changePercent ?? 0,
      }];
    });

    if (commodities.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma fonte de cotação disponível para commodities" },
        { status: 502 },
      );
    }

    const best = commodities.reduce((a, b) => (a.changePct > b.changePct ? a : b));
    const worst = commodities.reduce((a, b) => (a.changePct < b.changePct ? a : b));

    const payload: CommoditiesResponse = {
      commodities,
      best: { symbol: best.symbol, name: best.name, emoji: best.emoji, changePct: best.changePct },
      worst: { symbol: worst.symbol, name: worst.name, emoji: worst.emoji, changePct: worst.changePct },
      lastUpdate: new Date().toISOString(),
    };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

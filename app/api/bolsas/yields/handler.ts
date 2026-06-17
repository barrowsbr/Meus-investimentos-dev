import { NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/cotacoes";

export const dynamic = "force-dynamic";

const YIELD_SYMBOLS = [
  { symbol: "^IRX", label: "3M", maturity: 0.25 },
  { symbol: "2YY=F", label: "2Y", maturity: 2 },
  { symbol: "^FVX", label: "5Y", maturity: 5 },
  { symbol: "^TNX", label: "10Y", maturity: 10 },
  { symbol: "^TYX", label: "30Y", maturity: 30 },
];

const DXY_SYMBOL = "DX-Y.NYB";
const GOLD_SYMBOL = "GC=F";

interface YieldPoint {
  label: string;
  maturity: number;
  yield: number;
  change: number;
}

export async function GET() {
  try {
    const allSymbols = [
      ...YIELD_SYMBOLS.map((y) => y.symbol),
      DXY_SYMBOL,
      GOLD_SYMBOL,
    ];

    const { quotes } = await fetchQuotes(allSymbols);

    // --- Treasury yields ---
    const yields: YieldPoint[] = [];
    for (const ys of YIELD_SYMBOLS) {
      const q = quotes[ys.symbol];
      if (!q) continue;
      yields.push({
        label: ys.label,
        maturity: ys.maturity,
        yield: q.price,
        change: q.change,
      });
    }

    const y10 = quotes["^TNX"];
    const y2 = quotes["2YY=F"];
    const spread10Y2Y = (y10 && y2) ? +(y10.price - y2.price).toFixed(3) : null;

    // --- DXY ---
    const dxyQuote = quotes[DXY_SYMBOL];
    const dxy = dxyQuote
      ? {
          price: dxyQuote.price,
          change: dxyQuote.change,
          changePct: dxyQuote.changePercent,
        }
      : null;

    // --- Gold ---
    const goldQuote = quotes[GOLD_SYMBOL];
    const gold = goldQuote
      ? {
          price: goldQuote.price,
          change: goldQuote.change,
          changePct: goldQuote.changePercent,
        }
      : null;

    return NextResponse.json({
      yields,
      spread10Y2Y,
      dxy,
      gold,
    });
  } catch (err) {
    console.error("[bolsas/yields] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch Treasury yields", detail: String(err) },
      { status: 500 },
    );
  }
}

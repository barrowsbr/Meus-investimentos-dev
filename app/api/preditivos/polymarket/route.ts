import { NextResponse } from "next/server";
import { fetchPolymarket } from "@/lib/polymarket";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tickersParam = searchParams.get("tickers");
    const tickers = tickersParam ? tickersParam.split(",") : [];

    const data = await fetchPolymarket(tickers);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[API] Polymarket error:", err);
    return NextResponse.json(
      { error: "Failed to fetch Polymarket data", categories: {} },
      { status: 500 }
    );
  }
}

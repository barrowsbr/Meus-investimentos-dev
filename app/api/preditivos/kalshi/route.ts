import { NextResponse } from "next/server";
import { fetchKalshi } from "@/lib/kalshi";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  try {
    const data = await fetchKalshi();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[API] Kalshi error:", err);
    return NextResponse.json([], { status: 500 });
  }
}

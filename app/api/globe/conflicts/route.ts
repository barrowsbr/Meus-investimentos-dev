import { NextResponse } from "next/server";
import { fetchLiveConflicts, FALLBACK_ZONES, type ConflictDiag } from "@/lib/globe-conflicts";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

// Focos de conflito para o HoloGlobe. Fonte primária: GDELT (ao vivo, últimos
// 7 dias, sem key). GDELT fora do ar → lista curada (FALLBACK_ZONES), então o
// globo nunca fica sem guerras. Cache 3h. ?debug=1 → diagnóstico, sem cache.
export async function GET(req: Request) {
  const debug = new URL(req.url).searchParams.get("debug") === "1";
  try {
    const diag: ConflictDiag | undefined = debug ? { provider: "gdelt", zonesReturned: 0 } : undefined;
    const live = await fetchLiveConflicts(diag);
    const usingLive = live.length > 0;
    const source = usingLive ? "gdelt" : "fallback";
    if (debug) {
      return NextResponse.json(
        { source, count: usingLive ? live.length : FALLBACK_ZONES.length, diag, zones: live },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { zones: usingLive ? live : FALLBACK_ZONES, source, count: usingLive ? live.length : FALLBACK_ZONES.length },
      { headers: { "Cache-Control": "s-maxage=10800, stale-while-revalidate=21600", "X-Conflicts-Source": source } },
    );
  } catch (e) {
    return NextResponse.json(
      { zones: FALLBACK_ZONES, source: "fallback", error: e instanceof Error ? e.message : "erro" },
      { headers: { "Cache-Control": "s-maxage=600", "X-Conflicts-Source": "fallback-error" } },
    );
  }
}

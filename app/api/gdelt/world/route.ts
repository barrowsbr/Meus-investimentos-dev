import { NextResponse } from "next/server";
import { fetchGdeltWorld } from "@/lib/gdelt";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

// Pulso GDELT mundial para a visão do Radar: tom/volume global + focos de
// conflito por país (heat + lista). Sem key. Cache 1h.
export async function GET() {
  try {
    const world = await fetchGdeltWorld();
    return NextResponse.json(world, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=7200" },
    });
  } catch (e) {
    return NextResponse.json(
      { tone: 0, toneAvg: 0, toneSeries: [], volSeries: [], volChangePct: 0, hotspots: [], error: e instanceof Error ? e.message : "erro" },
      { status: 200, headers: { "Cache-Control": "s-maxage=300" } },
    );
  }
}

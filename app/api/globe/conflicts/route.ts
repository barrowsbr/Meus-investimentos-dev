import { NextResponse } from "next/server";
import { fetchAcledConflicts, FALLBACK_ZONES } from "@/lib/globe-conflicts";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

// Focos de conflito para o HoloGlobe. Fonte primária: ACLED (ao vivo, últimos
// 30 dias). Sem credenciais ou ACLED fora do ar → lista curada (FALLBACK_ZONES),
// então o globo nunca fica sem guerras. Cache 6h (dados ACLED atualizam ~semanal).
export async function GET() {
  try {
    const live = await fetchAcledConflicts();
    const usingLive = live.length > 0;
    return NextResponse.json(
      { zones: usingLive ? live : FALLBACK_ZONES, source: usingLive ? "acled" : "fallback" },
      { headers: { "Cache-Control": "s-maxage=21600, stale-while-revalidate=43200" } },
    );
  } catch (e) {
    return NextResponse.json(
      { zones: FALLBACK_ZONES, source: "fallback", error: e instanceof Error ? e.message : "erro" },
      { headers: { "Cache-Control": "s-maxage=600" } },
    );
  }
}

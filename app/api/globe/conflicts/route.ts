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
    const source = usingLive ? "acled" : "fallback";
    return NextResponse.json(
      { zones: usingLive ? live : FALLBACK_ZONES, source, count: usingLive ? live.length : FALLBACK_ZONES.length },
      { headers: { "Cache-Control": "s-maxage=21600, stale-while-revalidate=43200", "X-Conflicts-Source": source } },
    );
  } catch (e) {
    return NextResponse.json(
      { zones: FALLBACK_ZONES, source: "fallback", error: e instanceof Error ? e.message : "erro" },
      { headers: { "Cache-Control": "s-maxage=600", "X-Conflicts-Source": "fallback-error" } },
    );
  }
}

import { NextResponse } from "next/server";
import { fetchAcledConflicts, FALLBACK_ZONES, type AcledDiag } from "@/lib/globe-conflicts";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

// Focos de conflito para o HoloGlobe. Fonte primária: ACLED (ao vivo, últimos
// 30 dias). Sem credenciais ou ACLED fora do ar → lista curada (FALLBACK_ZONES),
// então o globo nunca fica sem guerras. Cache 6h (dados ACLED atualizam ~semanal).
// ?debug=1 → mostra o diagnóstico do ACLED (sem expor senha/token) e não cacheia.
export async function GET(req: Request) {
  const debug = new URL(req.url).searchParams.get("debug") === "1";
  try {
    const diag: AcledDiag | undefined = debug
      ? { hasEmail: false, hasPassword: false, tokenObtained: false, zonesReturned: 0 }
      : undefined;
    const live = await fetchAcledConflicts(diag);
    const usingLive = live.length > 0;
    const source = usingLive ? "acled" : "fallback";
    if (debug) {
      return NextResponse.json(
        { source, count: usingLive ? live.length : FALLBACK_ZONES.length, diag, zones: live },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
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

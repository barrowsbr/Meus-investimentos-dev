import { NextResponse } from "next/server";
import { fetchGdeltEvents, FALLBACK_ZONES, type ConflictDiag } from "@/lib/globe-conflicts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Focos do HoloGlobe — SÓ CONFLITOS (pedido do dono: protestos e desastres
// saíram da UI por não agregar; os motores continuam nas libs — gdelt-events
// aceita outros códigos CAMEO e lib/disasters segue viva — para quando
// entrarem como FILTROS). Fonte: GDELT Events 2.0 (~1h), fallback curado.
// Cache 1h. ?debug=1 mostra fonte/diagnóstico.
export async function GET(req: Request) {
  const debug = new URL(req.url).searchParams.get("debug") === "1";
  try {
    const diag: ConflictDiag | undefined = debug ? { provider: "gdelt", zonesReturned: 0 } : undefined;
    const live = await fetchGdeltEvents("conflitos", diag).catch(() => []);
    const zones = (live.length > 0 ? live : FALLBACK_ZONES).slice(0, 12);

    if (debug) {
      return NextResponse.json(
        { source: live.length > 0 ? "gdelt" : "fallback", count: zones.length, diag, zones },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { zones, count: zones.length },
      { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=7200" } },
    );
  } catch (e) {
    // Último recurso: os conflitos curados.
    return NextResponse.json(
      { zones: FALLBACK_ZONES, count: FALLBACK_ZONES.length, error: e instanceof Error ? e.message : "erro" },
      { headers: { "Cache-Control": "s-maxage=300" } },
    );
  }
}

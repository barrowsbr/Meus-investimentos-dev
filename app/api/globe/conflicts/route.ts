import { NextResponse } from "next/server";
import { fetchGdeltEvents, FALLBACK_ZONES, GLOBE_THEMES, DEFAULT_THEME, type ConflictDiag } from "@/lib/globe-conflicts";
import { fetchDisasters } from "@/lib/disasters";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

// Focos de um tema para o HoloGlobe:
//   • conflitos / protestos → GDELT GEO (ao vivo, 7 dias, sem key). "conflitos"
//     tem lista curada de reserva; "protestos" some se o GDELT cair.
//   • desastres → NASA EONET + USGS (eventos naturais reais, sem key/rate-limit).
// Cache 3h. ?theme=protestos | ?debug=1 (diagnóstico, sem cache).
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const debug = sp.get("debug") === "1";
  const theme = GLOBE_THEMES[sp.get("theme") ?? ""] ? (sp.get("theme") as string) : DEFAULT_THEME;
  const fallback = theme === DEFAULT_THEME ? FALLBACK_ZONES : [];
  try {
    // Desastres não usam GDELT — fonte dedicada (EONET/USGS), sem fallback curado.
    if (theme === "desastres") {
      const zones = await fetchDisasters();
      const source = zones.length > 0 ? "eonet-usgs" : "empty";
      if (debug) {
        return NextResponse.json(
          { source, theme, count: zones.length, provider: "eonet+usgs", zones },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      return NextResponse.json(
        { zones, source, theme, count: zones.length },
        { headers: { "Cache-Control": "s-maxage=10800, stale-while-revalidate=21600", "X-Conflicts-Source": source } },
      );
    }

    const diag: ConflictDiag | undefined = debug ? { provider: "gdelt", zonesReturned: 0 } : undefined;
    const live = await fetchGdeltEvents(theme, diag);
    const usingLive = live.length > 0;
    const source = usingLive ? "gdelt" : "fallback";
    if (debug) {
      return NextResponse.json(
        { source, theme, count: usingLive ? live.length : fallback.length, diag, zones: live },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { zones: usingLive ? live : fallback, source, theme, count: usingLive ? live.length : fallback.length },
      { headers: { "Cache-Control": "s-maxage=10800, stale-while-revalidate=21600", "X-Conflicts-Source": source } },
    );
  } catch (e) {
    return NextResponse.json(
      { zones: fallback, source: "fallback", theme, error: e instanceof Error ? e.message : "erro" },
      { headers: { "Cache-Control": "s-maxage=600", "X-Conflicts-Source": "fallback-error" } },
    );
  }
}

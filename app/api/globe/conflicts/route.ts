import { NextResponse } from "next/server";
import { fetchGdeltEvents, FALLBACK_ZONES, GLOBE_THEMES, DEFAULT_THEME, type ConflictDiag } from "@/lib/globe-conflicts";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

// Focos de um tema (conflitos/protestos/desastres) para o HoloGlobe. Fonte:
// GDELT GEO (ao vivo, 7 dias, sem key). Só "conflitos" tem lista curada de
// reserva (os outros temas somem se o GDELT cair, sem quebrar). Cache 3h.
// ?theme=protestos | ?debug=1 (diagnóstico, sem cache).
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const debug = sp.get("debug") === "1";
  const theme = GLOBE_THEMES[sp.get("theme") ?? ""] ? (sp.get("theme") as string) : DEFAULT_THEME;
  const fallback = theme === DEFAULT_THEME ? FALLBACK_ZONES : [];
  try {
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

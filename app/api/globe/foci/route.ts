import { NextResponse } from "next/server";
import { fetchGdeltEvents, FALLBACK_ZONES, type ConflictZoneData, type ConflictDiag } from "@/lib/globe-conflicts";
import { fetchDisasters } from "@/lib/disasters";

export const dynamic = "force-dynamic";
// 60s (máximo do Hobby): as duas queries GDELT são SERIALIZADAS com 5s de gap
// e, com re-tentativas de throttle, o pior caso passa fácil de 25s — foi o que
// matava a rota inteira (timeout → cliente caía no fallback com tudo vazio).
export const maxDuration = 60;

// Focos de TODAS as camadas do HoloGlobe num ÚNICO endpoint. É essencial que
// seja uma só invocação: as duas queries do GDELT (conflitos + protestos) passam
// pelo wrapper serializado (gdeltJson), que só consegue respeitar o limite de
// 1 req/5s dentro do mesmo processo. Se o cliente disparasse 3 fetches separados
// (3 invocações concorrentes, mesmo IP de saída), o GDELT throttlava — era por
// isso que protestos vinha vazio e conflitos caía na lista curada.
//   • conflitos / protestos → GDELT GEO (serializado). conflitos tem reserva curada.
//   • desastres → NASA EONET + USGS (sem key, sem rate-limit).
// Cache 1h. ?debug=1 mostra a contagem por camada.
export async function GET(req: Request) {
  const debug = new URL(req.url).searchParams.get("debug") === "1";
  try {
    const diagC: ConflictDiag | undefined = debug ? { provider: "gdelt", zonesReturned: 0 } : undefined;
    const diagP: ConflictDiag | undefined = debug ? { provider: "gdelt", zonesReturned: 0 } : undefined;
    let disasterErr: string | undefined;
    const [conflitos, protestos, desastres] = await Promise.all([
      fetchGdeltEvents("conflitos", diagC).catch(() => [] as ConflictZoneData[]),
      fetchGdeltEvents("protestos", diagP).catch(() => [] as ConflictZoneData[]),
      fetchDisasters().catch((e) => { disasterErr = e instanceof Error ? e.message : "erro"; return [] as ConflictZoneData[]; }),
    ]);

    const conf = (conflitos.length > 0 ? conflitos : FALLBACK_ZONES).slice(0, 10);
    const prot = protestos.slice(0, 8);
    const des = desastres.slice(0, 10);
    const zones = [...conf, ...prot, ...des];

    if (debug) {
      return NextResponse.json(
        {
          counts: { conflitos: conf.length, protestos: prot.length, desastres: des.length },
          sources: {
            conflitos: conflitos.length > 0 ? "gdelt" : "fallback",
            protestos: protestos.length > 0 ? "gdelt" : "empty",
            desastres: desastres.length > 0 ? "eonet-usgs" : "empty",
          },
          diag: { conflitos: diagC, protestos: diagP, desastres: disasterErr ?? "ok" },
          zones,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { zones, count: zones.length },
      { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=7200" } },
    );
  } catch (e) {
    // Último recurso: pelo menos os conflitos curados.
    return NextResponse.json(
      { zones: FALLBACK_ZONES, count: FALLBACK_ZONES.length, error: e instanceof Error ? e.message : "erro" },
      { headers: { "Cache-Control": "s-maxage=300" } },
    );
  }
}

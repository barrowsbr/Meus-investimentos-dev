import { NextResponse } from "next/server";

// NeoWs — Near Earth Object Web Service. Objetos que passam perto da Terra na
// janela pedida (default: hoje → +6 dias; a API limita a 7 dias por chamada).
// Achata o feed num array plano já com as unidades úteis para visualização.
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const KEY = process.env.NASA_API_KEY || "DEMO_KEY";

function ymd(d: Date): string {
  return d.toISOString().split("T")[0];
}

export interface NeoObjeto {
  id: string;
  nome: string;
  data: string;
  diametroMinM: number;
  diametroMaxM: number;
  distanciaKm: number;
  distanciaLunar: number;
  velocidadeKmh: number;
  perigoso: boolean;
  sentry: boolean;
  jplUrl: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startParam = searchParams.get("start") ?? "";
  const start = /^\d{4}-\d{2}-\d{2}$/.test(startParam) ? new Date(startParam + "T12:00:00Z") : new Date();
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6); // janela de 7 dias (limite da API)

  const qs = new URLSearchParams({
    start_date: ymd(start),
    end_date: ymd(end),
    api_key: KEY,
  });

  try {
    const res = await fetch(`https://api.nasa.gov/neo/rest/v1/feed?${qs}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json({ error: `NASA NeoWs HTTP ${res.status}`, detalhe: txt.slice(0, 200) }, { status: res.status === 429 ? 429 : 502 });
    }
    const d = await res.json();
    const feed = d.near_earth_objects ?? {};
    const objetos: NeoObjeto[] = [];
    for (const dia of Object.keys(feed)) {
      for (const o of feed[dia] as Record<string, unknown>[]) {
        const est = (o.estimated_diameter as { meters?: { estimated_diameter_min?: number; estimated_diameter_max?: number } })?.meters ?? {};
        const approach = ((o.close_approach_data as Record<string, unknown>[]) ?? [])[0] ?? {};
        const miss = (approach.miss_distance as { kilometers?: string; lunar?: string }) ?? {};
        const vel = (approach.relative_velocity as { kilometers_per_hour?: string }) ?? {};
        objetos.push({
          id: String(o.id ?? ""),
          nome: String(o.name ?? "").replace(/[()]/g, "").trim(),
          data: dia,
          diametroMinM: Math.round(est.estimated_diameter_min ?? 0),
          diametroMaxM: Math.round(est.estimated_diameter_max ?? 0),
          distanciaKm: Math.round(Number(miss.kilometers ?? 0)),
          distanciaLunar: Math.round(Number(miss.lunar ?? 0) * 10) / 10,
          velocidadeKmh: Math.round(Number(vel.kilometers_per_hour ?? 0)),
          perigoso: Boolean(o.is_potentially_hazardous_asteroid),
          sentry: Boolean(o.is_sentry_object),
          jplUrl: String((o.nasa_jpl_url as string) ?? ""),
        });
      }
    }
    objetos.sort((a, b) => a.distanciaKm - b.distanciaKm);

    const perigosos = objetos.filter((o) => o.perigoso).length;
    const maiorDiam = objetos.reduce((m, o) => Math.max(m, o.diametroMaxM), 0);
    const maisProximo = objetos[0] ?? null;

    return NextResponse.json(
      {
        inicio: ymd(start),
        fim: ymd(end),
        total: objetos.length,
        perigosos,
        maiorDiametroM: maiorDiam,
        maisProximo,
        objetos,
      },
      { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=21600" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

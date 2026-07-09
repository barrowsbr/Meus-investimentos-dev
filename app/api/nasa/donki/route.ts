import { NextResponse } from "next/server";

// DONKI — Space Weather Database Of Notifications, Knowledge, Information.
// Clima espacial: erupções solares (FLR), tempestades geomagnéticas (GST) e
// ejeções de massa coronal (CME) dos últimos 30 dias. api.nasa.gov, com key.
export const dynamic = "force-dynamic";
export const maxDuration = 25;

const KEY = process.env.NASA_API_KEY || "DEMO_KEY";

function ymd(d: Date): string {
  return d.toISOString().split("T")[0];
}

export interface EventoClima {
  tipo: "flare" | "storm" | "cme";
  rotulo: string;
  data: string;
  detalhe: string;
  intensidade: string;
  link: string;
}

async function jget(url: string): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const d = await res.json();
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dias = Math.min(90, Math.max(7, parseInt(searchParams.get("dias") ?? "30", 10) || 30));
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - dias);
  const s = ymd(start);
  const e = ymd(end);

  const [flr, gst, cme] = await Promise.all([
    jget(`https://api.nasa.gov/DONKI/FLR?startDate=${s}&endDate=${e}&api_key=${KEY}`),
    jget(`https://api.nasa.gov/DONKI/GST?startDate=${s}&endDate=${e}&api_key=${KEY}`),
    jget(`https://api.nasa.gov/DONKI/CME?startDate=${s}&endDate=${e}&api_key=${KEY}`),
  ]);

  const eventos: EventoClima[] = [];

  for (const f of flr) {
    eventos.push({
      tipo: "flare",
      rotulo: "Erupção solar",
      data: String(f.beginTime ?? f.peakTime ?? ""),
      detalhe: `Região ${f.sourceLocation ?? "—"}${f.activeRegionNum ? ` · AR${f.activeRegionNum}` : ""}`,
      intensidade: String(f.classType ?? "—"),
      link: String(f.link ?? ""),
    });
  }
  for (const g of gst) {
    const kps = (g.allKpIndex as { kpIndex?: number }[]) ?? [];
    const maxKp = kps.reduce((m, k) => Math.max(m, Number(k.kpIndex ?? 0)), 0);
    eventos.push({
      tipo: "storm",
      rotulo: "Tempestade geomagnética",
      data: String(g.startTime ?? ""),
      detalhe: `Índice Kp máx ${maxKp || "—"}`,
      intensidade: `Kp ${maxKp || "—"}`,
      link: String(g.link ?? ""),
    });
  }
  for (const c of cme) {
    const analyses = (c.cmeAnalyses as { speed?: number; type?: string }[]) ?? [];
    const speed = analyses.length ? Math.round(Number(analyses[0].speed ?? 0)) : 0;
    eventos.push({
      tipo: "cme",
      rotulo: "Ejeção de massa coronal",
      data: String(c.startTime ?? ""),
      detalhe: speed ? `Velocidade ~${speed} km/s` : "Sem análise de velocidade",
      intensidade: speed ? `${speed} km/s` : "—",
      link: String(c.link ?? ""),
    });
  }

  eventos.sort((a, b) => (a.data < b.data ? 1 : -1));

  return NextResponse.json(
    {
      inicio: s,
      fim: e,
      total: eventos.length,
      contagem: { flares: flr.length, tempestades: gst.length, cmes: cme.length },
      eventos: eventos.slice(0, 60),
    },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=21600" } },
  );
}

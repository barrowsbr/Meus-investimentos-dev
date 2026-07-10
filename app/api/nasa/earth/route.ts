// Imagem de satélite de um ponto da Terra — via NASA Worldview Snapshots (GIBS).
// O endpoint antigo (/planetary/earth/imagery, Landsat) é deprecado e falha
// muito; o Worldview (MODIS Terra True Color) é confiável, SEM key, e cobre o
// planeta todo diariamente. A rota faz proxy dos bytes da imagem.
export const dynamic = "force-dynamic";
export const maxDuration = 25;

function ymd(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  // "span" = tamanho da janela em graus (zoom). Cidade≈3, região≈8, país≈20.
  const span = Math.min(90, Math.max(1.5, Number(searchParams.get("span") ?? "8") || 8));

  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json({ error: "lat/lon inválidos" }, { status: 400 });
  }

  const half = span / 2;
  const s = Math.max(-90, lat - half);
  const n = Math.min(90, lat + half);
  const w = lon - half;
  const e = lon + half;
  // MODIS processa com ~1 dia de atraso — pega 2 dias atrás para garantir imagem.
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 2);
  const time = ymd(d);

  const qs = new URLSearchParams({
    REQUEST: "GetSnapshot",
    TIME: time,
    BBOX: `${s},${w},${n},${e}`, // EPSG:4326 → south,west,north,east
    CRS: "EPSG:4326",
    LAYERS: "MODIS_Terra_CorrectedReflectance_TrueColor,Coastlines_15m",
    WRAP: "x,x",
    FORMAT: "image/jpeg",
    WIDTH: "768",
    HEIGHT: "768",
  });
  const url = `https://wvs.earthdata.nasa.gov/api/v1/snapshot?${qs}`;

  try {
    const res = await fetch(url, { headers: { Accept: "image/jpeg,*/*" } });
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || !ct.startsWith("image")) {
      return Response.json({ error: `Sem imagem de satélite para este ponto (HTTP ${res.status})` }, { status: 502 });
    }
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      headers: {
        "Content-Type": ct || "image/jpeg",
        "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

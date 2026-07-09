// Earth Imagery (Landsat 8) — imagem de satélite de um ponto (lat/lon) da Terra.
// A rota faz PROXY dos bytes da imagem: a NASA embute a api_key na URL da
// imagem, então buscamos no servidor e devolvemos o PNG — a chave nunca vai
// para o cliente. api.nasa.gov/planetary/earth/imagery.
export const dynamic = "force-dynamic";
export const maxDuration = 25;

const KEY = process.env.NASA_API_KEY || "DEMO_KEY";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const date = searchParams.get("date") ?? "";
  const dim = Math.min(0.5, Math.max(0.025, Number(searchParams.get("dim") ?? "0.12") || 0.12));

  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json({ error: "lat/lon inválidos" }, { status: 400 });
  }

  const qs = new URLSearchParams({ lat: String(lat), lon: String(lon), dim: String(dim), api_key: KEY });
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) qs.set("date", date);

  try {
    const res = await fetch(`https://api.nasa.gov/planetary/earth/imagery?${qs}`, {
      headers: { Accept: "image/png,*/*" },
    });
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || !ct.startsWith("image")) {
      return Response.json(
        { error: `Sem imagem Landsat para este ponto/data (HTTP ${res.status})` },
        { status: 502 },
      );
    }
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      headers: {
        "Content-Type": ct || "image/png",
        "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

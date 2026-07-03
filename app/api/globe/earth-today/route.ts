import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─────────────────────────────────────────────────────────────────────────────
// "A Terra de hoje" — mosaico diário de satélite (VIIRS true-color) via NASA
// GIBS: aberto, SEM key, sem custo. Usamos o dia de ONTEM (UTC) porque o
// mosaico do dia corrente ainda está incompleto. A imagem vira a textura do
// globo imersivo: nuvens e tempestades REAIS do dia. Cache de 6h na edge —
// ~4 downloads/dia no total, tráfego irrisório.
// Atribuição: "We acknowledge the use of imagery provided by services from
// NASA's Global Imagery Browse Services (GIBS), part of NASA's ESDIS."
// ─────────────────────────────────────────────────────────────────────────────

// 3000×1500 (~1–2 MB): bom nas distâncias do globo e abaixo do limite de
// resposta das functions da Vercel (4 MB).
const W = 3000;
const H = 1500;

export async function GET() {
  const yesterday = new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 10);
  const url =
    "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi" +
    "?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0" +
    "&LAYERS=VIIRS_SNPP_CorrectedReflectance_TrueColor&STYLES=" +
    `&FORMAT=image%2Fjpeg&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=${W}&HEIGHT=${H}` +
    `&TIME=${yesterday}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "meus-investimentos (dashboard pessoal)" },
      signal: AbortSignal.timeout(25_000),
    });
    const type = res.headers.get("content-type") ?? "";
    const buf = Buffer.from(await res.arrayBuffer());
    // Erro do GIBS vem como XML pequeno — não repassar como se fosse imagem.
    if (!res.ok || !type.includes("image") || buf.length < 200_000) {
      return NextResponse.json(
        { error: `GIBS indisponível (${res.status}, ${type}, ${buf.length}b)` },
        { status: 502, headers: { "Cache-Control": "s-maxage=600" } },
      );
    }
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
        "X-Gibs-Date": yesterday,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "erro" },
      { status: 502, headers: { "Cache-Control": "s-maxage=600" } },
    );
  }
}

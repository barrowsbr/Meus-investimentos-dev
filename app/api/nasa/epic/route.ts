import { NextResponse } from "next/server";

// EPIC — Earth Polychromatic Imaging Camera (satélite DSCOVR, ~1,5 mi de km).
// Imagens REAIS do disco inteiro da Terra. A metadata vem da api.nasa.gov (com
// key no servidor), mas as URLs de imagem apontam para epic.gsfc.nasa.gov, que
// NÃO exige key — assim a chave nunca vaza no <img src> do cliente.
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const KEY = process.env.NASA_API_KEY || "DEMO_KEY";

export interface EpicImagem {
  id: string;
  legenda: string;
  data: string;
  url: string;
  lat: number | null;
  lon: number | null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get("tipo") === "enhanced" ? "enhanced" : "natural";

  try {
    const res = await fetch(`https://api.nasa.gov/EPIC/api/${tipo}?api_key=${KEY}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json({ error: `NASA EPIC HTTP ${res.status}`, detalhe: txt.slice(0, 200) }, { status: res.status === 429 ? 429 : 502 });
    }
    const arr = (await res.json()) as Record<string, unknown>[];
    const imagens: EpicImagem[] = (arr ?? []).map((it) => {
      const image = String(it.image ?? "");
      const dateStr = String(it.date ?? ""); // "2024-06-20 00:31:45"
      const dia = dateStr.split(" ")[0]; // YYYY-MM-DD
      const [y, m, d] = dia.split("-");
      const coords = (it.centroid_coordinates as { lat?: number; lon?: number }) ?? {};
      return {
        id: image,
        legenda: String(it.caption ?? ""),
        data: dateStr,
        // Domínio SEM key — imagem carrega direto no cliente sem expor a chave.
        url: `https://epic.gsfc.nasa.gov/archive/${tipo}/${y}/${m}/${d}/png/${image}.png`,
        lat: typeof coords.lat === "number" ? coords.lat : null,
        lon: typeof coords.lon === "number" ? coords.lon : null,
      };
    });

    return NextResponse.json(
      { tipo, data: imagens[0]?.data?.split(" ")[0] ?? null, total: imagens.length, imagens },
      { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

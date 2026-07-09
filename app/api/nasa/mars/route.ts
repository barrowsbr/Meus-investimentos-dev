import { NextResponse } from "next/server";

// Mars Rover Photos — últimas fotos enviadas por um rover. A metadata usa a key
// no servidor; os img_src apontam para mars.nasa.gov / jpl (sem key). Rovers
// ativos com latest_photos: perseverance, curiosity.
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const KEY = process.env.NASA_API_KEY || "DEMO_KEY";
const ROVERS = new Set(["perseverance", "curiosity"]);

export interface MarsFoto {
  id: number;
  url: string;
  camera: string;
  cameraSigla: string;
  dataTerra: string;
  sol: number;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roverParam = (searchParams.get("rover") ?? "perseverance").toLowerCase();
  const rover = ROVERS.has(roverParam) ? roverParam : "perseverance";

  try {
    const res = await fetch(
      `https://api.nasa.gov/mars-photos/api/v1/rovers/${rover}/latest_photos?api_key=${KEY}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json({ error: `NASA Mars HTTP ${res.status}`, detalhe: txt.slice(0, 200) }, { status: res.status === 429 ? 429 : 502 });
    }
    const d = await res.json();
    const raw = (d.latest_photos ?? []) as Record<string, unknown>[];
    const fotos: MarsFoto[] = raw.map((p) => {
      const cam = (p.camera as { full_name?: string; name?: string }) ?? {};
      // Força https (alguns img_src vêm em http → bloqueado por mixed-content).
      const src = String(p.img_src ?? "").replace(/^http:/, "https:");
      return {
        id: Number(p.id ?? 0),
        url: src,
        camera: String(cam.full_name ?? cam.name ?? "Câmera"),
        cameraSigla: String(cam.name ?? ""),
        dataTerra: String(p.earth_date ?? ""),
        sol: Number(p.sol ?? 0),
      };
    }).filter((f) => f.url);

    const cameras = [...new Set(fotos.map((f) => f.cameraSigla))].filter(Boolean);
    const roverInfo = (raw[0]?.rover as { name?: string; status?: string }) ?? {};

    return NextResponse.json(
      {
        rover,
        roverNome: roverInfo.name ?? rover,
        roverStatus: roverInfo.status ?? "",
        dataTerra: fotos[0]?.dataTerra ?? null,
        sol: fotos[0]?.sol ?? null,
        total: fotos.length,
        cameras,
        fotos,
      },
      { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

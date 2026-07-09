import { NextResponse } from "next/server";

// Mars Rover Photos — últimas fotos de um rover.
//   • Curiosity / Opportunity / Spirit → API mars-photos (api.nasa.gov, com key).
//   • Perseverance → feed oficial mars2020 (mars.nasa.gov, SEM key). A API
//     mars-photos NÃO cobre o Perseverance de forma confiável — por isso o
//     Marte "não carregava" quando ele era o rover padrão.
// Todos os img_src apontam para mars.nasa.gov / jpl (sem key no <img>).
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const KEY = process.env.NASA_API_KEY || "DEMO_KEY";
const ROVERS_CLASSICOS = new Set(["curiosity", "opportunity", "spirit"]);

// Nome de câmera (sigla técnica → português) — cobre Curiosity e Perseverance.
const CAM_PT: Record<string, string> = {
  FHAZ: "Desvio de obstáculos (frontal)",
  RHAZ: "Desvio de obstáculos (traseira)",
  FRONT_HAZCAM_LEFT_A: "Desvio de obstáculos (frontal)",
  FRONT_HAZCAM_RIGHT_A: "Desvio de obstáculos (frontal)",
  REAR_HAZCAM_LEFT: "Desvio de obstáculos (traseira)",
  REAR_HAZCAM_RIGHT: "Desvio de obstáculos (traseira)",
  MAST: "Câmera do mastro",
  MASTCAM: "Câmera do mastro",
  MCZ_LEFT: "Mastcam-Z (esquerda)",
  MCZ_RIGHT: "Mastcam-Z (direita)",
  CHEMCAM: "ChemCam (análise química)",
  CHEMCAM_RMI: "ChemCam RMI",
  MAHLI: "Lente de mão (MAHLI)",
  MARDI: "Câmera de descida (MARDI)",
  NAVCAM: "Câmera de navegação",
  NAVCAM_LEFT: "Navegação (esquerda)",
  NAVCAM_RIGHT: "Navegação (direita)",
  PANCAM: "Câmera panorâmica",
  MINITES: "Espectrômetro térmico",
  SUPERCAM_RMI: "SuperCam RMI",
  SKYCAM: "Câmera do céu",
  EDL_RUCAM: "Câmera de descida (para cima)",
  EDL_RDCAM: "Câmera de descida (para baixo)",
};
function camPt(sigla: string, fallback: string): string {
  return CAM_PT[sigla?.toUpperCase()] ?? fallback ?? sigla;
}

export interface MarsFoto {
  id: number | string;
  url: string;
  camera: string;
  cameraSigla: string;
  dataTerra: string;
  sol: number;
}

// ── Rovers clássicos: mars-photos latest_photos ──────────────────────────────
async function fetchClassico(rover: string) {
  const res = await fetch(
    `https://api.nasa.gov/mars-photos/api/v1/rovers/${rover}/latest_photos?api_key=${KEY}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`mars-photos HTTP ${res.status}`);
  const d = await res.json();
  const raw = (d.latest_photos ?? []) as Record<string, unknown>[];
  const fotos: MarsFoto[] = raw.map((p) => {
    const cam = (p.camera as { full_name?: string; name?: string }) ?? {};
    const sigla = String(cam.name ?? "");
    return {
      id: Number(p.id ?? 0),
      url: String(p.img_src ?? "").replace(/^http:/, "https:"),
      camera: camPt(sigla, String(cam.full_name ?? "Câmera")),
      cameraSigla: sigla,
      dataTerra: String(p.earth_date ?? ""),
      sol: Number(p.sol ?? 0),
    };
  }).filter((f) => f.url);
  const roverInfo = (raw[0]?.rover as { name?: string; status?: string }) ?? {};
  return { fotos, roverNome: roverInfo.name ?? rover, roverStatus: roverInfo.status ?? "" };
}

// ── Perseverance: feed oficial mars2020 (keyless) ────────────────────────────
async function fetchPerseverance() {
  const url = "https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=50&page=0&order=sol+desc";
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`mars2020 HTTP ${res.status}`);
  const d = await res.json();
  const raw = (d.images ?? []) as Record<string, unknown>[];
  const fotos: MarsFoto[] = raw.map((im) => {
    const files = (im.image_files as { large?: string; full_res?: string; medium?: string }) ?? {};
    const cam = (im.camera as { instrument?: string }) ?? {};
    const sigla = String(cam.instrument ?? "");
    const src = String(files.large ?? files.full_res ?? files.medium ?? "").replace(/^http:/, "https:");
    const earth = String(im.date_taken_utc ?? "").split("T")[0];
    return {
      id: String(im.imageid ?? src),
      url: src,
      camera: camPt(sigla, sigla || "Câmera"),
      cameraSigla: sigla,
      dataTerra: earth,
      sol: Number(im.sol ?? 0),
    };
  }).filter((f) => f.url);
  return { fotos, roverNome: "Perseverance", roverStatus: "active" };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roverParam = (searchParams.get("rover") ?? "curiosity").toLowerCase();
  const rover = roverParam === "perseverance" || ROVERS_CLASSICOS.has(roverParam) ? roverParam : "curiosity";

  try {
    const { fotos, roverNome, roverStatus } = rover === "perseverance"
      ? await fetchPerseverance()
      : await fetchClassico(rover);

    const cameras = [...new Set(fotos.map((f) => f.cameraSigla))].filter(Boolean);

    return NextResponse.json(
      {
        rover,
        roverNome,
        roverStatus,
        dataTerra: fotos[0]?.dataTerra ?? null,
        sol: fotos[0]?.sol ?? null,
        total: fotos.length,
        cameras,
        camerasLabel: Object.fromEntries(cameras.map((c) => [c, camPt(c, c)])),
        fotos,
      },
      { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 502 });
  }
}

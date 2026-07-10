import { NextResponse } from "next/server";

// ── Resolve o vídeo AO VIVO atual de um canal do YouTube ─────────────────────
// Só é útil com YOUTUBE_API_KEY (YouTube Data API v3). Sem a chave devolve
// videoId: null e o player cai no embed keyless `live_stream?channel=`.
//
// A busca (search.list eventType=live) custa 100 unidades de cota, então
// cacheamos por canal (memória por lambda + CDN 30 min). IDs de stream 24/7
// quase não mudam.
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const cache = new Map<string, { at: number; videoId: string | null }>();
const TTL_MS = 30 * 60 * 1000;

export async function GET(req: Request) {
  const channel = new URL(req.url).searchParams.get("channel")?.trim();
  if (!channel) return NextResponse.json({ error: "channel obrigatório" }, { status: 400 });

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return NextResponse.json(
      { videoId: null, reason: "sem YOUTUBE_API_KEY" },
      { headers: { "Cache-Control": "s-maxage=300" } },
    );
  }

  const now = Date.now();
  const hit = cache.get(channel);
  if (hit && now - hit.at < TTL_MS) {
    return NextResponse.json({ videoId: hit.videoId, cached: true }, { headers: { "Cache-Control": "s-maxage=1800" } });
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${encodeURIComponent(channel)}&eventType=live&type=video&maxResults=1&key=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`;
      return NextResponse.json({ videoId: null, error: msg }, { status: 200, headers: { "Cache-Control": "s-maxage=120" } });
    }
    const videoId: string | null = json?.items?.[0]?.id?.videoId ?? null;
    cache.set(channel, { at: now, videoId });
    return NextResponse.json(
      { videoId },
      { headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=1800" } },
    );
  } catch (e) {
    return NextResponse.json(
      { videoId: null, error: e instanceof Error ? e.message : "erro" },
      { status: 200, headers: { "Cache-Control": "s-maxage=60" } },
    );
  }
}

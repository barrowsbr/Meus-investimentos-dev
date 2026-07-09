import { NextResponse } from "next/server";

// APOD — Astronomy Picture of the Day. A chave fica SÓ no servidor (a resposta
// é JSON puro, sem key embutida). ?date=YYYY-MM-DD opcional (default = hoje).
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const KEY = process.env.NASA_API_KEY || "DEMO_KEY";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? "";
  const qs = new URLSearchParams({ api_key: KEY, thumbs: "true" });
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) qs.set("date", date);

  try {
    const res = await fetch(`https://api.nasa.gov/planetary/apod?${qs}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json({ error: `NASA APOD HTTP ${res.status}`, detalhe: txt.slice(0, 200) }, { status: res.status === 429 ? 429 : 502 });
    }
    const d = await res.json();
    return NextResponse.json(
      {
        date: d.date,
        title: d.title,
        explanation: d.explanation,
        mediaType: d.media_type,
        url: d.url,
        hdurl: d.hdurl ?? d.url,
        thumbnailUrl: d.thumbnail_url ?? null,
        copyright: d.copyright ?? null,
      },
      { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

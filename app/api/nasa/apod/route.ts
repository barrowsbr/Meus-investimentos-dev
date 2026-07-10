import { NextResponse } from "next/server";
import { translateText } from "@/lib/translate";

// APOD — Astronomy Picture of the Day. A chave fica SÓ no servidor (a resposta
// é JSON puro, sem key embutida). ?date=YYYY-MM-DD opcional (default = hoje).
// Título e explicação são traduzidos para PT-BR (fallback: texto original).
export const dynamic = "force-dynamic";
export const maxDuration = 25;

const KEY = process.env.NASA_API_KEY || "DEMO_KEY";

async function fetchApod(date: string): Promise<Response> {
  const qs = new URLSearchParams({ api_key: KEY, thumbs: "true" });
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) qs.set("date", date);
  return fetch(`https://api.nasa.gov/planetary/apod?${qs}`, { headers: { Accept: "application/json" } });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? "";

  try {
    let res = await fetchApod(date);
    // 404 = data ainda não publicada (a APOD de "hoje" sai à meia-noite ET) ou
    // data futura. Refaz sem data → a NASA devolve a imagem mais recente.
    if (res.status === 404 && date) {
      res = await fetchApod("");
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json({ error: `NASA APOD HTTP ${res.status}`, detalhe: txt.slice(0, 200) }, { status: res.status === 429 ? 429 : 502 });
    }
    const d = await res.json();
    const [titlePt, explanationPt] = await Promise.all([
      translateText(String(d.title ?? ""), "pt"),
      translateText(String(d.explanation ?? ""), "pt"),
    ]);
    return NextResponse.json(
      {
        date: d.date,
        title: titlePt || d.title,
        explanation: explanationPt || d.explanation,
        tituloOriginal: d.title,
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

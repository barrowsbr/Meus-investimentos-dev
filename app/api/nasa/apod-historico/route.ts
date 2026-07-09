import { NextResponse } from "next/server";

// APOD "Neste dia" — a imagem astronômica do mesmo dia/mês em anos anteriores.
// Busca em paralelo os últimos N anos. Sem tradução (leve: só thumb + título).
export const dynamic = "force-dynamic";
export const maxDuration = 25;

const KEY = process.env.NASA_API_KEY || "DEMO_KEY";

export interface ApodHist {
  date: string;
  title: string;
  url: string;
  mediaType: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const base = searchParams.get("date") ?? new Date().toISOString().split("T")[0];
  const m = base.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NextResponse.json({ error: "date inválida" }, { status: 400 });
  const anoAtual = Number(m[1]);
  const mmdd = `${m[2]}-${m[3]}`;
  const anos = Math.min(12, Math.max(1, parseInt(searchParams.get("anos") ?? "6", 10) || 6));

  // APOD começa em 1995-06-16 — não pedir antes disso.
  const alvos: string[] = [];
  for (let i = 1; i <= anos; i++) {
    const y = anoAtual - i;
    if (y < 1996) break;
    alvos.push(`${y}-${mmdd}`);
  }

  const resultados = await Promise.all(
    alvos.map(async (date) => {
      try {
        const res = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${KEY}&thumbs=true&date=${date}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return null;
        const d = await res.json();
        const url = d.media_type === "video" ? (d.thumbnail_url ?? "") : (d.url ?? "");
        if (!url) return null;
        return { date: d.date, title: d.title, url, mediaType: d.media_type } as ApodHist;
      } catch {
        return null;
      }
    }),
  );

  const itens = resultados.filter((r): r is ApodHist => r != null);
  return NextResponse.json(
    { mmdd, total: itens.length, itens },
    { headers: { "Cache-Control": "s-maxage=21600, stale-while-revalidate=86400" } },
  );
}

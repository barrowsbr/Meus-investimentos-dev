import { NextResponse } from "next/server";
import { fetchGdeltBuzz } from "@/lib/gdelt";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

// Buzz (volume de cobertura) + Sentimento (tom) de um ativo/tema via GDELT.
// ?q=<nome da empresa/tema>&days=30. Sem key. Cache 3h.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const days = Math.min(180, Math.max(7, Number(searchParams.get("days")) || 30));
  if (!q) return NextResponse.json({ error: "q obrigatório" }, { status: 400 });

  try {
    const buzz = await fetchGdeltBuzz(q, days);
    return NextResponse.json(buzz, {
      headers: { "Cache-Control": "s-maxage=10800, stale-while-revalidate=21600" },
    });
  } catch (e) {
    return NextResponse.json(
      { query: q, points: [], hasData: false, error: e instanceof Error ? e.message : "erro" },
      { status: 200, headers: { "Cache-Control": "s-maxage=300" } },
    );
  }
}

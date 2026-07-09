import { NextResponse } from "next/server";

// NASA Image and Video Library — busca livre no acervo público de imagens da
// NASA (images-api.nasa.gov, sem key). ?q=termo de busca.
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export interface MidiaItem {
  id: string;
  titulo: string;
  descricao: string;
  data: string;
  centro: string;
  thumb: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim() || "nebula";

  try {
    const res = await fetch(
      `https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=image`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return NextResponse.json({ error: `NASA Images HTTP ${res.status}` }, { status: 502 });
    const d = await res.json();
    const items = (d.collection?.items ?? []) as Record<string, unknown>[];
    const midia: MidiaItem[] = items
      .slice(0, 48)
      .map((it) => {
        const data = ((it.data as Record<string, unknown>[]) ?? [])[0] ?? {};
        const links = (it.links as { href?: string }[]) ?? [];
        const desc = String(data.description ?? "");
        return {
          id: String(data.nasa_id ?? ""),
          titulo: String(data.title ?? ""),
          descricao: desc.length > 260 ? desc.slice(0, 260) + "…" : desc,
          data: String(data.date_created ?? ""),
          centro: String(data.center ?? ""),
          thumb: String(links[0]?.href ?? ""),
        };
      })
      .filter((i) => i.thumb);

    return NextResponse.json(
      { q, total: midia.length, itens: midia },
      { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=43200" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

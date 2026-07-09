import { NextResponse } from "next/server";
import { fetchMarketaux, marketauxEnabled } from "@/lib/news/providers/marketaux";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// Debug: confirma se o MARKETAUX_API_KEY está ativo e se o provider retorna
// dados. NÃO expõe o token. Usado só para validar a integração.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbols = searchParams.get("symbols")?.split(",").filter(Boolean);
  const countries = (searchParams.get("countries") ?? "br,us").split(",").filter(Boolean);

  const enabled = marketauxEnabled();
  if (!enabled) {
    return NextResponse.json({ enabled: false, count: 0, hint: "MARKETAUX_API_KEY ausente no ambiente" }, { headers: { "Cache-Control": "no-store" } });
  }

  const items = await fetchMarketaux({ symbols, countries, language: "pt,en", limit: 3 });
  return NextResponse.json(
    {
      enabled: true,
      count: items.length,
      sample: items.slice(0, 3).map((i) => ({
        titulo: i.titulo, fonte: i.fonte, pais: i.pais,
        entidades: i.entidades, sentimento: i.sentimento, data: i.data,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

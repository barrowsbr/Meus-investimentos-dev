import { NextResponse } from "next/server";
import { buildIbkrOverview } from "@/lib/ibkr-overview";
import { activeUserKey } from "@/lib/user-sheet";

// Rota PRÓPRIA (não passa pelo catch-all [...path]): o maxDuration de um
// handler importado pelo catch-all é IGNORADO — valia o 45s do catch-all, e a
// geração do extrato Flex (até ~38s) + cotações estourava o limite em cold
// start. Era ISSO que derrubava o patrimônio "IBKR ao vivo" da Home para o
// fallback canônico.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(): Promise<NextResponse> {
  // O extrato Flex é da conta principal — conta extra (esposa) não deve ver
  // o book do dono na Home dela.
  if (activeUserKey()) {
    return NextResponse.json({ error: "IBKR é da conta principal" }, { status: 403 });
  }
  try {
    return NextResponse.json(await buildIbkrOverview(), {
      // CDN segura a resposta por 2 min (+10 min stale): recargas da Home e
      // cold starts servem do edge em ms, em vez de refazer o Flex (~10-40s).
      headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    const status = message.includes("não configurados") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextResponse } from "next/server";
import { computeHomePatrimonio } from "@/lib/home-patrimonio";
import { activeUserKey } from "@/lib/user-sheet";

// ── Endpoint consolidado da Home ─────────────────────────────────────────────
// Substitui 3 chamadas que a Home fazia em paralelo (/api/ibkr/overview,
// /api/patrimonio-dia e /api/patrimonio-dia/detalhe). Cada uma subia um lambda
// frio e REGERAVA o extrato Flex da IBKR (o passo lento, até ~38s) — 3-4 vezes
// em paralelo no cold start. Aqui tudo roda UMA vez.
//
// Devolve { overview, patrimonioDia, detalhe } — os mesmos formatos que a Home
// já consumia dos endpoints antigos (que seguem existindo para /ibkr etc.).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    // Conta extra (esposa) não vê o book IBKR do dono — pula a geração do Flex.
    const skipIbkr = !!activeUserKey();
    const { overview, patrimonioDia, detalhe } = await computeHomePatrimonio({ skipIbkr });
    return NextResponse.json(
      { overview, patrimonioDia, detalhe },
      // Quente: servido do edge em ms. O SWR de 10 min mantém a Home rápida
      // mesmo depois do s-maxage expirar (revalida em background).
      { headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=600" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

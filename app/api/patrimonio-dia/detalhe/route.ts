import { NextResponse } from "next/server";
import { computeHomePatrimonio } from "@/lib/home-patrimonio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Auditoria do Patrimônio do DIA (Home) — decomposição item a item ─────────
// Reproduz EXATAMENTE as parcelas que a Home soma no rodapé do painel
// (IBKR real + Brasil + Cripto + RF/Caixa) e devolve cada item que entra em
// cada balde, para localizar divergências. Não substitui o snapshot canônico.
//
// A decomposição vive em lib/home-patrimonio.ts (fonte única). Antes era
// no-store (nunca cacheava, refazia motor+Flex a cada carga); agora usa
// s-maxage+SWR como as demais — o mesmo cálculo já reflete a planilha do dia.
export async function GET() {
  try {
    const { detalhe } = await computeHomePatrimonio();
    return NextResponse.json(detalhe, {
      headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

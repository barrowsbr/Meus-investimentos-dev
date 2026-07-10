import { NextResponse } from "next/server";
import { computeHomePatrimonio } from "@/lib/home-patrimonio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Patrimônio do DIA (NÃO é o patrimônio canônico) ──────────────────────────
// Endpoint dedicado só para o quadro "Patrimônio" da Home refletir a realidade
// do dia da forma mais direta possível — NÃO substitui calcularSnapshot:
//
//   Patrimônio do dia (R$) =
//       IBKR (patrimônio + saldo, US$ × dólar de agora/YFinance)
//     + BRL (ações BR + FIIs + renda fixa + caixa em real)
//     + Cripto (Bitcoin em real)
//
// A matemática vive em lib/home-patrimonio.ts (fonte única — a mesma que a Home
// e o /detalhe usam). Aqui só serializamos a parcela "patrimonioDia".
export async function GET() {
  try {
    const { patrimonioDia } = await computeHomePatrimonio();
    return NextResponse.json(patrimonioDia, {
      headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=120" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

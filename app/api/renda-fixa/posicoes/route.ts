import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { fetchFixaAbertaComIbkr } from "@/lib/ibkr-cash";
import { fetchFxRates } from "@/lib/cotacoes";
import { calcularRendaFixaPosicoes } from "@/lib/renda-fixa";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Motor canônico de RF manual vive em lib/renda-fixa.ts (CANONICO.md §2).
// Esta rota é só o transporte HTTP — não adicionar cálculo aqui.

export async function GET() {
  try {
    const store = getDataStore();
    const [rfTransacoes, fixaAberta, proventosRows, { fx }] = await Promise.all([
      store.fetchTab("renda_fixa"),
      fetchFixaAbertaComIbkr(store),
      store.fetchTab("meus_proventos"),
      fetchFxRates(),
    ]);

    const result = calcularRendaFixaPosicoes(rfTransacoes, fixaAberta, proventosRows, fx);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

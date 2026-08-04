// API do Mapa de Transmissão Macro — roda o pipeline HOJE com dados reais
// (Yahoo via lib/macro-map/adapters, o mesmo caminho do Radar) e devolve o
// veredito de divergência por regra. Nenhuma lógica de regra vai ao cliente.

import { NextResponse } from "next/server";
import { buildDivergenceReport } from "@/lib/macro-map/adapters";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const report = await buildDivergenceReport();
    return NextResponse.json(report, {
      headers: {
        // 30 min no CDN — o detector é diário; não precisa de tempo real.
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=600",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Falha ao montar o relatório de divergência", detail: String(e instanceof Error ? e.message : e) },
      { status: 500 }
    );
  }
}

// Valor FIPE dos veículos da página Bens — delega para lib/bens-fipe.ts (motor
// compartilhado com o patrimônio da Home). SEM cache CDN: a resposta inclui o
// AJUSTE do dono (planilha), e um s-maxage longo fazia o app reabrir mostrando
// a FIPE crua de ontem (o ajuste "sumia"). A carga na API do parallelum segue
// protegida pelo data cache do Next (12h) dentro do motor; o custo por visita
// é só uma leitura da app_config. ⚠️ Rede aberta só em produção.

import { NextResponse } from "next/server";
import { computeBensFipe } from "@/lib/bens-fipe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const bens = await computeBensFipe();
  return NextResponse.json(bens, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

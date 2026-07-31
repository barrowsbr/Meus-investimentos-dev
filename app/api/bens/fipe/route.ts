// Valor FIPE dos veículos da página Bens — delega para lib/bens-fipe.ts (motor
// compartilhado com o patrimônio da Home). Cache CDN de 1 dia (a FIPE é mensal).
// ⚠️ A network policy do dev bloqueia o host — o resultado real aparece em produção.

import { NextResponse } from "next/server";
import { computeBensFipe } from "@/lib/bens-fipe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const bens = await computeBensFipe();
  return NextResponse.json(bens, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800" },
  });
}

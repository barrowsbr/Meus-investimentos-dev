// Complemento da página Moedas: SÓ o spot da prata (SI=F × BRL=X, Yahoo) para
// recalcular o valor de derretimento ao dia. A coleção em si é ESTÁTICA
// (lib/moedas-data.ts) — sem planilha, sem upload.
// OBS: o path é /api/moedas-colecao porque /api/moedas já é o endpoint de
// CÂMBIO do Radar (catch-all) — não colidir de novo.

import { NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/cotacoes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

const OZ_TROY_G = 31.1034768;

export async function GET() {
  try {
    const { quotes } = await fetchQuotes(["SI=F", "BRL=X"]);
    const si = quotes["SI=F"]?.price;
    const usd = quotes["BRL=X"]?.price;
    const prataBrlPorGrama = si && si > 0 && usd && usd > 0 ? (si / OZ_TROY_G) * usd : null;
    return NextResponse.json({
      prataUsdOz: si && si > 0 ? si : null,
      prataBrlPorGrama: prataBrlPorGrama != null ? Math.round(prataBrlPorGrama * 100) / 100 : null,
    }, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json({ prataUsdOz: null, prataBrlPorGrama: null });
  }
}

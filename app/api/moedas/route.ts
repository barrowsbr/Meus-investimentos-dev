// Coleção de moedas — lê a aba `moedas_colecao`, agrega exemplares idênticos
// e complementa com o preço da PRATA ao vivo (SI=F via Yahoo, já registrado
// no api-registry): o valor de derretimento das moedas de prata é recalculado
// ao spot de hoje, além do valor congelado no export do CoinSnap.

import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { fetchQuotes } from "@/lib/cotacoes";
import { MOEDAS_TAB, rowToMoeda, agruparMoedas, type Moeda } from "@/lib/moedas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const OZ_TROY_G = 31.1034768;

export async function GET() {
  try {
    const store = getDataStore();
    const rows = await store.fetchTab(MOEDAS_TAB).catch(() => []);
    const itens = rows.map(rowToMoeda).filter((m): m is Omit<Moeda, "qtd"> => m != null);
    const moedas = agruparMoedas(itens);

    // Prata ao vivo (best-effort — a página funciona sem o spot).
    let prataBrlPorGrama: number | null = null;
    let prataUsdOz: number | null = null;
    try {
      const { quotes } = await fetchQuotes(["SI=F", "BRL=X"]);
      const si = quotes["SI=F"]?.price;
      const usd = quotes["BRL=X"]?.price;
      if (si && si > 0 && usd && usd > 0) {
        prataUsdOz = si;
        prataBrlPorGrama = (si / OZ_TROY_G) * usd;
      }
    } catch { /* segue sem spot */ }

    let valorTotal = 0, totalExemplares = 0, prataGramas = 0, meltCsv = 0;
    const paises = new Set<string>();
    for (const m of moedas) {
      totalExemplares += m.qtd;
      valorTotal += m.valorBrl * m.qtd;
      if (m.pais) paises.add(m.pais);
      if (m.pesoMetalG) {
        prataGramas += m.pesoMetalG * m.qtd;
        meltCsv += (m.derretimentoBrl ?? 0) * m.qtd;
      }
    }

    return NextResponse.json({
      moedas,
      stats: {
        exemplares: totalExemplares,
        unicas: moedas.length,
        paises: paises.size,
        valorTotal: Math.round(valorTotal * 100) / 100,
        prataGramas: Math.round(prataGramas * 100) / 100,
        meltCsv: Math.round(meltCsv * 100) / 100,
        meltHoje: prataBrlPorGrama != null ? Math.round(prataGramas * prataBrlPorGrama * 100) / 100 : null,
        prataUsdOz,
        prataBrlPorGrama: prataBrlPorGrama != null ? Math.round(prataBrlPorGrama * 100) / 100 : null,
      },
      atualizadoEm: new Date().toISOString(),
    }, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao ler coleção" }, { status: 500 });
  }
}

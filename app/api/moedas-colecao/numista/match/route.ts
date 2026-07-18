// Dry-run do export para o Numista: casa um LOTE de moedas distintas da
// coleção com o catálogo (sem escrever nada em lugar nenhum). O card de
// Configurações chama em fatias (?offset&count) e monta o relatório.
// Sem parâmetros: devolve o status (chave ativa, totais, itens já enviados).

import { NextRequest, NextResponse } from "next/server";
import { MOEDAS_COLECAO } from "@/lib/moedas-data";
import { casarMoeda, numistaAtivo, type Casamento } from "@/lib/numista";
import { getDataStore } from "@/lib/data-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const NUMISTA_ENVIO_TAB = "numista_envio";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  if (!sp.has("offset")) {
    // status
    let enviadas = 0;
    try {
      enviadas = (await getDataStore().fetchTab(NUMISTA_ENVIO_TAB)).length;
    } catch { /* aba ainda não existe */ }
    return NextResponse.json({
      ativo: numistaAtivo(),
      totalDistintas: MOEDAS_COLECAO.length,
      totalExemplares: MOEDAS_COLECAO.reduce((s, m) => s + m.qtd, 0),
      enviadas,
    });
  }

  if (!numistaAtivo()) {
    return NextResponse.json({ error: "NUMISTA_API_KEY não configurada" }, { status: 400 });
  }
  const offset = Math.max(0, Number(sp.get("offset")) || 0);
  const count = Math.min(10, Math.max(1, Number(sp.get("count")) || 8));

  const fatia = MOEDAS_COLECAO.slice(offset, offset + count);
  const resultados: Casamento[] = [];
  for (let i = 0; i < fatia.length; i++) {
    const m = fatia[i];
    resultados.push(await casarMoeda({
      idx: offset + i,
      denominacao: m.denominacao,
      pais: m.pais,
      ano: m.ano,
      krause: m.krause,
      graduacao: m.graduacao,
      qtd: m.qtd,
    }));
  }

  return NextResponse.json({ offset, count: fatia.length, total: MOEDAS_COLECAO.length, resultados });
}

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

  if (!sp.has("offset") && !sp.has("idxs")) {
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
  // Dois modos: fatia sequencial (?offset&count) ou índices explícitos
  // (?idxs=3,17,42 — o "Recasar falhas" refaz SÓ o que não casou).
  const idxsParam = sp.get("idxs");
  const indices = idxsParam
    ? idxsParam.split(",").map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < MOEDAS_COLECAO.length).slice(0, 8)
    : (() => {
        const offset = Math.max(0, Number(sp.get("offset")) || 0);
        const count = Math.min(10, Math.max(1, Number(sp.get("count")) || 8));
        return MOEDAS_COLECAO.slice(offset, offset + count).map((_, i) => offset + i);
      })();

  // Orçamento de tempo: com a API lenta/limitada, devolve o PARCIAL antes do
  // timeout do serverless — os `pendentes` voltam na próxima chamada do card.
  const inicio = Date.now();
  const ORCAMENTO_MS = 35_000;
  const resultados: Casamento[] = [];
  const pendentes: number[] = [];
  let cotaEstourada = false;
  for (const idx of indices) {
    if (Date.now() - inicio > ORCAMENTO_MS || cotaEstourada) { pendentes.push(idx); continue; }
    const m = MOEDAS_COLECAO[idx];
    const c = await casarMoeda({
      idx,
      denominacao: m.denominacao,
      pais: m.pais,
      ano: m.ano,
      krause: m.krause,
      graduacao: m.graduacao,
      qtd: m.qtd,
    });
    if (c.rateLimit) cotaEstourada = true;
    resultados.push(c);
  }

  return NextResponse.json({
    count: resultados.length, total: MOEDAS_COLECAO.length, resultados, pendentes,
    ...(cotaEstourada ? { rateLimit: true } : {}),
  });
}

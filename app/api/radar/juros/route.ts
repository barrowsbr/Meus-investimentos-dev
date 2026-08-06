// Juros futuros do Brasil — curva do Tesouro Direto (nominal + real), inflação
// implícita e trajetória esperada da Selic (Focus). Tudo de fonte gratuita.
// As três fontes são independentes: se uma cair, as outras seguem e a que falhou
// entra em `avisos` (degradação honesta — nunca número inventado).

import { NextResponse } from "next/server";
import { fetchTesouro, fetchTrajetoriaSelic, fetchSelicMeta } from "@/lib/juros/fontes";
import { calcularBreakevens, analisarCurva } from "@/lib/juros/analise";
import type { JurosResponse } from "@/lib/juros/types";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET() {
  const hoje = new Date().toISOString().slice(0, 10);

  const [tesouro, trajetoria, selic] = await Promise.all([
    fetchTesouro(hoje),
    fetchTrajetoriaSelic().catch(() => []),
    fetchSelicMeta().catch(() => null),
  ]);

  const avisos: string[] = [];
  if (!tesouro.ok) avisos.push("Curva do Tesouro Direto indisponível agora.");
  if (!trajetoria.length) avisos.push("Trajetória da Selic (Focus/BCB) indisponível agora.");
  if (selic == null) avisos.push("Selic meta (BCB SGS) indisponível agora.");

  const prefixados = tesouro.vertices.filter((v) => v.indexador === "PREFIXADO");
  const reais = tesouro.vertices.filter((v) => v.indexador === "IPCA");
  const breakevens = calcularBreakevens(prefixados, reais);

  const body: JurosResponse = {
    geradoEm: new Date().toISOString(),
    fechamento: tesouro.fechamento,
    prefixados,
    reais,
    breakevens,
    selicHoje: selic,
    trajetoriaSelic: trajetoria,
    analise: analisarCurva(prefixados, reais, breakevens),
    avisos,
  };

  return NextResponse.json(body, {
    headers: {
      // a curva do Tesouro atualiza ao longo do pregão; 15 min no CDN basta.
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=300",
    },
  });
}

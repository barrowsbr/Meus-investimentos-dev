import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { parseEvolucaoPatrimonio } from "@/lib/patrimonio";
import { parseHistoricoPatrimonio } from "@/lib/historico-patrimonio";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Evolução patrimonial: a aba `lb_historic` é LEGADO CONGELADO (o writer
// antigo parou em jun/2026) — segue dona dos recortes por conta/tipo/pessoa.
// O TOTAL por ano passa a ser atualizado pela série nova `historico_patrimonio`
// (registrador 3×/dia): o último snapshot de cada ano vence o valor congelado.
// As duas leituras toleram aba ausente (limpeza da planilha não derruba a rota).

export async function GET() {
  try {
    const store = getDataStore();
    const [rowsLegado, rowsNovo] = await Promise.all([
      store.fetchTab("lb_historic").catch(() => []),
      store.fetchTab("historico_patrimonio").catch(() => []),
    ]);
    const evolucao = parseEvolucaoPatrimonio(rowsLegado);

    // Último snapshot de cada ano na série nova (maior ts do ano).
    const serie = parseHistoricoPatrimonio(rowsNovo);
    const ultimoPorAno = new Map<string, { ts: number; total: number }>();
    for (const p of serie.pontos) {
      if (!(p.total > 0) || !isFinite(p.ts)) continue;
      const ano = String(new Date(p.ts).getFullYear());
      const atual = ultimoPorAno.get(ano);
      if (!atual || p.ts > atual.ts) ultimoPorAno.set(ano, { ts: p.ts, total: p.total });
    }

    const fonteTotais: Record<string, "lb_historic" | "historico_patrimonio"> = {};
    for (const t of evolucao.totalPorAno) fonteTotais[t.ano] = "lb_historic";
    for (const [ano, info] of ultimoPorAno) {
      const idx = evolucao.totalPorAno.findIndex((t) => t.ano === ano);
      if (idx >= 0) evolucao.totalPorAno[idx] = { ano, valor: info.total };
      else {
        evolucao.totalPorAno.push({ ano, valor: info.total });
        if (!evolucao.anos.includes(ano)) evolucao.anos.push(ano);
      }
      fonteTotais[ano] = "historico_patrimonio";
    }
    evolucao.anos.sort();
    evolucao.totalPorAno.sort((a, b) => a.ano.localeCompare(b.ano));

    return NextResponse.json({ ...evolucao, fonteTotais });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

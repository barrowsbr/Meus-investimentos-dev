import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { regra } from "@/lib/tax/rules";
import { buildApuracao } from "@/lib/tax/apuracao-service";
import { apurarCambioIr } from "@/lib/tax/cambio-ir";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : null;

  try {
    const store = getDataStore();
    const [{ apuracao, posicoes, realizados, ptax }, cambioRows] = await Promise.all([
      buildApuracao(),
      store.fetchTab("cambio").catch(() => []),
    ]);

    // Enriquece posições com bucket/alíquota/isenção (para o simulador).
    const hoje = new Date().toISOString().slice(0, 10);
    const mesAtual = hoje.slice(0, 7);
    const fxHoje = ptax("USD", hoje);
    const posicoesEnriquecidas = posicoes.map(p => {
      const r = regra(p.modalidade, hoje);
      return {
        ...p,
        bucket: r.offsetBucket,
        aliquota: r.aliquota,
        isentavel: r.isentavel ?? false,
        valorAtualBRL: p.moeda === "BRL" ? p.qty * p.pmBRL : p.qty * p.pmNative * fxHoje,
      };
    });
    // Vendas de ações já realizadas no mês corrente (contam para o limite de R$20k).
    const acoesVendasMesAtual = realizados
      .filter(e => e.modalidade === "acoes_swing" && e.month === mesAtual)
      .reduce((s, e) => s + e.proceedsBRL, 0);

    const cambioIr = apurarCambioIr(cambioRows);

    const extras = {
      posicoes: posicoesEnriquecidas,
      fxHoje,
      mesAtual,
      acoesVendasMesAtual,
      limiteIsencaoAcoes: regra("acoes_swing", hoje).isencaoMensalVendas ?? 20000,
      cambioIr,
    };

    if (year) {
      const ys = String(year);
      return NextResponse.json({
        year,
        meses: apuracao.meses.filter(m => m.mes.startsWith(ys)),
        exterior: apuracao.exterior.filter(a => a.ano === ys),
        prejuizoFinal: apuracao.prejuizoFinal,
        irTotalMensal: apuracao.meses.filter(m => m.mes.startsWith(ys)).reduce((s, m) => s + m.irTotal, 0),
        irTotalExterior: apuracao.exterior.filter(a => a.ano === ys).reduce((s, a) => s + a.irDevido, 0),
        eventosRealizados: realizados.filter(e => e.year === ys),
        ...extras,
      });
    }

    return NextResponse.json({
      year: null,
      ...apuracao,
      eventosRealizados: realizados,
      ...extras,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

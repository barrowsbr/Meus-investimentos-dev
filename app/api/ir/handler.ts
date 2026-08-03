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
    const [{ apuracao, posicoes, realizados, ptax, ptaxAvisos }, cambioRows] = await Promise.all([
      buildApuracao(),
      store.fetchTab("cambio").catch(() => []),
    ]);

    // Enriquece posições com bucket/alíquota/isenção (para o simulador).
    const hoje = new Date().toISOString().slice(0, 10);
    const mesAtual = hoje.slice(0, 7);
    const fxHoje = ptax("USD", hoje);
    // FX de HOJE por moeda (1 para BRL) — antes toda posição não-BRL usava a PTAX
    // do DÓLAR, então DPM.TO (CAD) e VOW3.DE (EUR) saíam com valor/IR errados.
    const fxPorMoeda: Record<string, number> = { BRL: 1 };
    for (const p of posicoes) {
      const m = (p.moeda || "BRL").toUpperCase();
      if (!(m in fxPorMoeda)) fxPorMoeda[m] = m === "BRL" ? 1 : ptax(m, hoje);
    }
    const posicoesEnriquecidas = posicoes.map(p => {
      const r = regra(p.modalidade, hoje);
      const fx = fxPorMoeda[(p.moeda || "BRL").toUpperCase()] ?? fxHoje;
      return {
        ...p,
        bucket: r.offsetBucket,
        aliquota: r.aliquota,
        isentavel: r.isentavel ?? false,
        valorAtualBRL: p.moeda === "BRL" ? p.qty * p.pmBRL : p.qty * p.pmNative * fx,
      };
    });
    // Vendas de ações já realizadas no mês corrente (contam para o limite de R$20k).
    const acoesVendasMesAtual = realizados
      .filter(e => e.modalidade === "acoes_swing" && e.month === mesAtual)
      .reduce((s, e) => s + e.proceedsBRL, 0);

    const cambioIr = apurarCambioIr(cambioRows, ptax);

    const extras = {
      posicoes: posicoesEnriquecidas,
      fxHoje,
      fxPorMoeda,
      mesAtual,
      acoesVendasMesAtual,
      limiteIsencaoAcoes: regra("acoes_swing", hoje).isencaoMensalVendas ?? 20000,
      cambioIr,
      ptaxAvisos,
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

import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { fetchCotacoes } from "@/lib/cotacoes";
import { calcularSnapshot } from "@/lib/portfolio";
import { calcularCambioMetrics, buildPmFxRates, buildFxDateMap } from "@/lib/cambio";
import { isRendaVariavel } from "@/lib/sectors";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const store = getDataStore();
    const [transacoes, proventos, fixaAberta, cambioRows, ptaxRows] = await Promise.all([
      store.fetchTab("meus_ativos"),
      store.fetchTab("meus_proventos"),
      store.fetchTab("fixa_aberta"),
      store.fetchTab("cambio").catch(() => []),
      store.fetchTab("p_tax").catch(() => []),
    ]);

    const tickerSet = new Map<string, { moeda: string; corretora: string }>();
    for (const row of transacoes) {
      const ticker = String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? "").toUpperCase().trim();
      if (!ticker) continue;
      if (!tickerSet.has(ticker)) {
        tickerSet.set(ticker, {
          moeda: String(row["moeda"] ?? "BRL").toUpperCase().trim(),
          corretora: String(row["corretora"] ?? "").trim(),
        });
      }
    }

    const tickers = [...tickerSet.entries()].map(([ticker, info]) => ({
      ticker,
      moeda: info.moeda,
      corretora: info.corretora,
    }));

    const cotacoes = await fetchCotacoes(tickers);
    const fxAtual = cotacoes.fx;
    const cambio = calcularCambioMetrics(cambioRows, fxAtual);
    const fxCusto = buildPmFxRates(cambio);

    const fxByDate = buildFxDateMap(ptaxRows, cambio.historico);
    const snapshot = calcularSnapshot(
      transacoes, proventos, fixaAberta, cotacoes.quotes, fxAtual, fxCusto, fxByDate
    );

    // Group RV positions by currency
    const byMoeda: Record<string, {
      valor_brl: number;
      custo_brl: number;
      ganho_ativo_brl: number;
      ganho_cambio_brl: number;
      num_positions: number;
    }> = {};

    for (const p of snapshot.positions) {
      if (!isRendaVariavel(p.setor)) continue;
      if (p.ganhoAtivoBRL === null) continue;

      const key = p.moeda;
      if (!byMoeda[key]) {
        byMoeda[key] = { valor_brl: 0, custo_brl: 0, ganho_ativo_brl: 0, ganho_cambio_brl: 0, num_positions: 0 };
      }
      const b = byMoeda[key];
      b.valor_brl += p.valorAtualBRL;
      b.custo_brl += p.custoTotalBRL;
      b.ganho_ativo_brl += p.ganhoAtivoBRL ?? 0;
      b.ganho_cambio_brl += p.ganhoCambioBRL ?? 0;
      b.num_positions += 1;
    }

    const buckets = Object.entries(byMoeda)
      .filter(([, b]) => b.num_positions > 0)
      .sort(([, a], [, b]) => b.valor_brl - a.valor_brl)
      .map(([currency, b]) => ({
        currency,
        valor_brl: round(b.valor_brl),
        custo_brl: round(b.custo_brl),
        ganho_ativo_brl: round(b.ganho_ativo_brl),
        ganho_cambio_brl: round(b.ganho_cambio_brl),
        retorno_ativo_pct: b.custo_brl > 0 ? round((b.ganho_ativo_brl / b.custo_brl) * 100) : 0,
        retorno_cambio_pct: b.custo_brl > 0 ? round((b.ganho_cambio_brl / b.custo_brl) * 100) : 0,
        retorno_total_pct: b.custo_brl > 0
          ? round(((1 + b.ganho_ativo_brl / b.custo_brl) * (1 + b.ganho_cambio_brl / b.custo_brl) - 1) * 100)
          : 0,
        num_positions: b.num_positions,
      }));

    const totals = buckets.reduce(
      (acc, b) => ({
        valor_brl: acc.valor_brl + b.valor_brl,
        custo_brl: acc.custo_brl + b.custo_brl,
        ganho_ativo_brl: acc.ganho_ativo_brl + b.ganho_ativo_brl,
        ganho_cambio_brl: acc.ganho_cambio_brl + b.ganho_cambio_brl,
      }),
      { valor_brl: 0, custo_brl: 0, ganho_ativo_brl: 0, ganho_cambio_brl: 0 }
    );

    return NextResponse.json({
      buckets,
      total: {
        valor_brl: round(totals.valor_brl),
        custo_brl: round(totals.custo_brl),
        ganho_ativo_brl: round(totals.ganho_ativo_brl),
        ganho_cambio_brl: round(totals.ganho_cambio_brl),
        retorno_ativo_pct: totals.custo_brl > 0 ? round((totals.ganho_ativo_brl / totals.custo_brl) * 100) : 0,
        retorno_cambio_pct: totals.custo_brl > 0 ? round((totals.ganho_cambio_brl / totals.custo_brl) * 100) : 0,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

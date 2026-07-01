import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { calcularSnapshot } from "@/lib/portfolio";
import { fetchCotacoes } from "@/lib/cotacoes";
import { calcularCambioMetrics, buildPmFxRates, buildFxDateMap } from "@/lib/cambio";
import { buildIbkrOverview } from "@/lib/ibkr-overview";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Patrimônio do DIA (NÃO é o patrimônio canônico) ──────────────────────────
// Endpoint dedicado só para o quadro "Patrimônio" da Home refletir a realidade
// do dia da forma mais direta possível — NÃO substitui calcularSnapshot:
//
//   Patrimônio do dia (R$) =
//       IBKR (patrimônio + saldo, US$ × dólar de agora/YFinance)
//     + BRL (ações BR + FIIs + renda fixa + caixa em real)
//     + Cripto (Bitcoin em real)
//
// O book internacional vem do dado REAL da IBKR (não do snapshot). O resto vem
// da exposição cambial do snapshot (BRL + Cripto), evitando dupla contagem com
// a parte USD/EUR/CAD (que é justamente o que está na IBKR).
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
      if (!ticker || tickerSet.has(ticker)) continue;
      tickerSet.set(ticker, {
        moeda: String(row["moeda"] ?? "BRL").toUpperCase().trim(),
        corretora: String(row["corretora"] ?? "").trim(),
      });
    }
    const tickers = [...tickerSet.entries()].map(([ticker, i]) => ({ ticker, moeda: i.moeda, corretora: i.corretora }));

    const cotacoes = await fetchCotacoes(tickers);
    const fxAtual = cotacoes.fx;
    const usdbrl = fxAtual.USDBRL; // dólar de agora (YFinance)
    const cambio = calcularCambioMetrics(cambioRows, fxAtual);
    const fxCusto = buildPmFxRates(cambio);
    const fxByDate = buildFxDateMap(ptaxRows, cambio.historico);
    const snapshot = calcularSnapshot(transacoes, proventos, fixaAberta, cotacoes.quotes, fxAtual, fxCusto, fxByDate);

    // BR (real) e Cripto vêm da exposição cambial do snapshot.
    const expo = snapshot.exposicaoCambial ?? {};
    const brBRL = expo["BRL"] ?? 0;
    const criptoBRL = expo["Cripto"] ?? 0;

    // IBKR: patrimônio + saldo (US$) × dólar de agora. Fonte real da IBKR.
    let ibkrUSD = 0;
    let ibkrBRL = 0;
    let ibkrOk = false;
    try {
      const ibkr = await buildIbkrOverview();
      ibkrUSD = ibkr.kpis.patrimonioTotalUSD ?? 0; // posições + caixa (US$)
      ibkrBRL = ibkrUSD * usdbrl;
      ibkrOk = ibkrUSD > 0;
    } catch { /* IBKR indisponível → parte IBKR = 0 (o quadro cai no que tem) */ }

    const patrimonioDiaBRL = ibkrBRL + brBRL + criptoBRL;

    return NextResponse.json(
      {
        patrimonio_dia_brl: patrimonioDiaBRL,
        patrimonio_dia_usd: usdbrl > 0 ? patrimonioDiaBRL / usdbrl : null,
        usdbrl,
        ibkr_ok: ibkrOk,
        breakdown: { ibkr_brl: ibkrBRL, ibkr_usd: ibkrUSD, br_brl: brBRL, cripto_brl: criptoBRL },
      },
      { headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=120" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

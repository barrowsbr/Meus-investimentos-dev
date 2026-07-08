import { NextResponse } from "next/server";
import { computeLookThrough, saveToGSheets } from "@/lib/etf-holdings";
import { getDataStore } from "@/lib/data-store";
import { fetchFixaAbertaComIbkr } from "@/lib/ibkr-cash";
import { calcularSnapshot } from "@/lib/portfolio";
import { fetchCotacoes } from "@/lib/cotacoes";
import { isRendaVariavel } from "@/lib/sectors";
import { calcularCambioMetrics, buildPmFxRates, buildFxDateMap } from "@/lib/cambio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const store = getDataStore();
    // ── 1. Fetch portfolio data (same pattern as composicao/resumo) ───────────
    const [transacoes, proventos, fixaAberta, cambioRows, ptaxRows] = await Promise.all([
      store.fetchTab("meus_ativos"),
      store.fetchTab("meus_proventos"),
      fetchFixaAbertaComIbkr(store),
      store.fetchTab("cambio").catch(() => []),
      store.fetchTab("p_tax").catch(() => []),
    ]);

    // ── 2. Build tickers and fetch cotacoes ──────────────────────────────────
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
    const snapshot = calcularSnapshot(transacoes, proventos, fixaAberta, cotacoes.quotes, fxAtual, fxCusto, fxByDate);

    // ── 3. Map positions for computeLookThrough ──────────────────────────────
    const positions = snapshot.positions.map((p) => ({
      ticker: p.ticker,
      setor: p.setor,
      valorAtualBRL: p.valorAtualBRL,
      quantidade: p.quantidade,
    }));

    // ── 4. Fetch live holdings ───────────────────────────────────────────────
    const ltResult = await computeLookThrough(positions, 50);

    // ── 5. Persist to Google Sheets ──────────────────────────────────────────
    const savedOk = await saveToGSheets(ltResult.per_etf);

    // ── 6. Return result ─────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      supported: ltResult.supported,
      sources: ltResult.sources,
      updated_at: ltResult.updated_at,
      saved_to_sheets: savedOk,
      ...(savedOk ? {} : {
        warning: "Holdings buscados mas NÃO persistidos na aba composicao — verifique GOOGLE_SERVICE_ACCOUNT_JSON.",
      }),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    console.error("[etf-refresh] error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

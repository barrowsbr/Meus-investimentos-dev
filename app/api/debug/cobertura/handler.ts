import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { readGoldenSource } from "@/lib/db-cotacoes";
import { yahooTicker } from "@/lib/cotacoes";
import { identificarSetor, isRendaFixaManual } from "@/lib/sectors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const store = getDataStore();
    const [transacoes, golden] = await Promise.all([
      store.fetchTab("meus_ativos"),
      readGoldenSource(),
    ]);

    const goldenUpper = new Set(golden.tickers.map(t => t.toUpperCase()));
    const lastDate = golden.dates.length > 0 ? golden.dates[golden.dates.length - 1] : null;

    const seen = new Set<string>();
    const tickers: {
      ticker: string;
      setor: string;
      yahooSymbol: string;
      inGoldenSource: boolean;
      lastPrice: number | null;
      lastPriceDate: string | null;
      status: "ok" | "sem_preco" | "rf_manual";
    }[] = [];

    for (const row of transacoes) {
      const ticker = String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? "").toUpperCase().trim();
      if (!ticker || seen.has(ticker)) continue;
      seen.add(ticker);

      const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim();
      const corretora = String(row["corretora"] ?? "").trim();
      const setor = identificarSetor(ticker);

      if (isRendaFixaManual(setor)) {
        tickers.push({ ticker, setor, yahooSymbol: "-", inGoldenSource: false, lastPrice: null, lastPriceDate: null, status: "rf_manual" });
        continue;
      }

      const yt = yahooTicker(ticker, moeda, corretora);
      const inGolden = goldenUpper.has(ticker.toUpperCase());

      let lastPrice: number | null = null;
      let lastPriceDate: string | null = null;
      if (inGolden && golden.dates.length > 0) {
        for (let i = golden.dates.length - 1; i >= Math.max(0, golden.dates.length - 10); i--) {
          const p = golden.prices[golden.dates[i]]?.[ticker.toUpperCase()];
          if (p != null) {
            lastPrice = p;
            lastPriceDate = golden.dates[i];
            break;
          }
        }
      }

      const status = inGolden && lastPrice != null ? "ok" : "sem_preco";
      tickers.push({ ticker, setor, yahooSymbol: yt, inGoldenSource: inGolden, lastPrice, lastPriceDate, status });
    }

    const semPreco = tickers.filter(t => t.status === "sem_preco");
    const ok = tickers.filter(t => t.status === "ok");
    const rfManual = tickers.filter(t => t.status === "rf_manual");

    return NextResponse.json({
      resumo: {
        total: tickers.length,
        com_preco: ok.length,
        sem_preco: semPreco.length,
        rf_manual: rfManual.length,
        golden_source_tickers: golden.tickers.length,
        golden_source_last_date: lastDate,
      },
      sem_preco: semPreco,
      com_preco: ok.map(t => ({ ticker: t.ticker, lastPrice: t.lastPrice, lastPriceDate: t.lastPriceDate })),
      rf_manual: rfManual.map(t => t.ticker),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

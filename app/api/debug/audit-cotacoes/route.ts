import { NextResponse } from "next/server";
import { readGoldenSource } from "@/lib/db-cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface YahooRow {
  date: string;
  close: number;
  adjClose: number;
}

async function fetchYahooRaw(
  ticker: string,
  lookbackDays: number
): Promise<{ rows: YahooRow[]; source: string }> {
  // Method 1: yahoo-finance2 chart() API (returns both close and adjClose)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const YF: any = (await import("yahoo-finance2")).default;
    const yf = typeof YF === "function" ? new YF() : YF;
    const start = new Date();
    start.setDate(start.getDate() - lookbackDays);
    const result = await yf.chart(ticker, {
      period1: start.toISOString().split("T")[0],
      interval: "1d",
    });
    const quotes = result?.quotes ?? [];
    const rows = (quotes as Record<string, unknown>[]).flatMap((r) => {
      const close = r.close as number | null;
      const adjClose = (r.adjclose ?? r.adjClose ?? r.close) as number | null;
      if (close == null || !isFinite(close)) return [];
      const d = r.date instanceof Date ? r.date : new Date(r.date as string);
      return [{
        date: d.toISOString().split("T")[0],
        close,
        adjClose: adjClose != null && isFinite(adjClose) ? adjClose : close,
      }];
    });
    if (rows.length > 0) return { rows, source: "yf2-chart" };
  } catch {
    // fallback
  }

  // Method 2: v8 chart API with adjclose
  for (const host of ["query1", "query2"]) {
    try {
      function daysToRange(d: number): string {
        if (d <= 35) return "1mo";
        if (d <= 95) return "3mo";
        if (d <= 190) return "6mo";
        if (d <= 380) return "1y";
        return "2y";
      }
      const range = daysToRange(lookbackDays);
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d&includeAdjustedClose=true`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const timestamps: number[] = result.timestamp ?? [];
      const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
      const adjCloses: (number | null)[] =
        result.indicators?.adjclose?.[0]?.adjclose ?? closes;

      const rows = timestamps.flatMap((ts, i) => {
        const c = closes[i];
        const ac = adjCloses[i];
        if (c == null || !isFinite(c)) return [];
        return [{
          date: new Date(ts * 1000).toISOString().split("T")[0],
          close: c,
          adjClose: ac != null && isFinite(ac) ? ac : c,
        }];
      });
      if (rows.length > 0) return { rows, source: `v8-${host}` };
    } catch {
      continue;
    }
  }
  return { rows: [], source: "failed" };
}

interface Discrepancy {
  ticker: string;
  date: string;
  stored: number;
  yahooClose: number;
  yahooAdjClose: number;
  diffVsClose: string;
  diffVsAdjClose: string;
  matchesAdjClose: boolean;
}

interface TickerAudit {
  ticker: string;
  datesChecked: number;
  exact: number;
  closeMatch: number;
  adjCloseMatch: number;
  mismatch: number;
  hasAdjCloseIssue: boolean;
  avgDiffVsClose: string;
  avgDiffVsAdjClose: string;
  worst: Discrepancy | null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lookback = Math.min(parseInt(searchParams.get("days") ?? "30", 10), 365);
  const tickerFilter = searchParams.get("ticker")?.toUpperCase() ?? null;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10", 10), 50);

  try {
    const golden = await readGoldenSource();
    if (golden.dates.length === 0) {
      return NextResponse.json({ error: "db_cotacoes vazio" }, { status: 422 });
    }

    let tickersToAudit = golden.tickers;
    if (tickerFilter) {
      tickersToAudit = tickersToAudit.filter(t => t.includes(tickerFilter));
    } else {
      tickersToAudit = tickersToAudit.slice(0, limit);
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookback);
    const cutoff = cutoffDate.toISOString().split("T")[0];

    const recentDates = golden.dates.filter(d => d >= cutoff);

    const audits: TickerAudit[] = [];
    const allDiscrepancies: Discrepancy[] = [];
    const fetchDebug: { ticker: string; source: string; yahooCount: number; goldenDatesInRange: number }[] = [];
    const batchSize = 4;

    for (let i = 0; i < tickersToAudit.length; i += batchSize) {
      const batch = tickersToAudit.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (ticker) => {
          const { rows: yahooRows, source } = await fetchYahooRaw(ticker, lookback + 5);
          const goldenCount = recentDates.filter(d => golden.prices[d]?.[ticker] != null).length;
          fetchDebug.push({ ticker, source, yahooCount: yahooRows.length, goldenDatesInRange: goldenCount });
          const yahooByDate = new Map(yahooRows.map(r => [r.date, r]));

          let exact = 0;
          let closeMatch = 0;
          let adjCloseMatch = 0;
          let mismatch = 0;
          let sumDiffClose = 0;
          let sumDiffAdj = 0;
          let checked = 0;
          let worst: Discrepancy | null = null;
          let worstDiff = 0;

          for (const date of recentDates) {
            const stored = golden.prices[date]?.[ticker];
            if (stored == null) continue;
            const yahoo = yahooByDate.get(date);
            if (!yahoo) continue;

            checked++;
            const diffClose = Math.abs(stored - yahoo.close) / yahoo.close;
            const diffAdj = Math.abs(stored - yahoo.adjClose) / yahoo.adjClose;
            sumDiffClose += diffClose;
            sumDiffAdj += diffAdj;

            if (diffClose < 0.001) {
              exact++;
              closeMatch++;
            } else if (diffClose < 0.01) {
              closeMatch++;
            } else if (diffAdj < 0.01) {
              adjCloseMatch++;
            } else {
              mismatch++;
            }

            if (diffClose > worstDiff) {
              worstDiff = diffClose;
              worst = {
                ticker,
                date,
                stored: Math.round(stored * 100) / 100,
                yahooClose: Math.round(yahoo.close * 100) / 100,
                yahooAdjClose: Math.round(yahoo.adjClose * 100) / 100,
                diffVsClose: (diffClose * 100).toFixed(2) + "%",
                diffVsAdjClose: (diffAdj * 100).toFixed(2) + "%",
                matchesAdjClose: diffAdj < 0.01,
              };
            }
          }

          const hasAdjCloseIssue = adjCloseMatch > checked * 0.1;

          const audit: TickerAudit = {
            ticker,
            datesChecked: checked,
            exact,
            closeMatch,
            adjCloseMatch,
            mismatch,
            hasAdjCloseIssue,
            avgDiffVsClose: checked > 0 ? ((sumDiffClose / checked) * 100).toFixed(3) + "%" : "N/A",
            avgDiffVsAdjClose: checked > 0 ? ((sumDiffAdj / checked) * 100).toFixed(3) + "%" : "N/A",
            worst,
          };

          if (worst && worstDiff > 0.01) {
            allDiscrepancies.push(worst);
          }

          return audit;
        })
      );
      audits.push(...results);
    }

    const totalChecked = audits.reduce((s, a) => s + a.datesChecked, 0);
    const totalExact = audits.reduce((s, a) => s + a.exact, 0);
    const totalCloseMatch = audits.reduce((s, a) => s + a.closeMatch, 0);
    const totalAdjMatch = audits.reduce((s, a) => s + a.adjCloseMatch, 0);
    const totalMismatch = audits.reduce((s, a) => s + a.mismatch, 0);
    const tickersWithAdjIssue = audits.filter(a => a.hasAdjCloseIssue);

    return NextResponse.json({
      resumo: {
        tickersAuditados: audits.length,
        tickersTotais: golden.tickers.length,
        periodoAnalisado: { de: recentDates[0], ate: recentDates[recentDates.length - 1], dias: recentDates.length },
        pontosVerificados: totalChecked,
        exatos: totalExact,
        closeMatch: `${totalCloseMatch} (<1% diff)`,
        adjCloseMatch: `${totalAdjMatch} (stored ≈ adjClose, not close)`,
        divergentes: totalMismatch,
        precisao: totalChecked > 0 ? ((totalCloseMatch / totalChecked) * 100).toFixed(1) + "%" : "N/A",
      },
      problemaAdjClose: {
        explicacao: "Se stored ≈ adjClose (mas ≠ close), o preço foi gravado ajustado por dividendos. Isso causa double-count no TWR.",
        tickersAfetados: tickersWithAdjIssue.map(a => ({
          ticker: a.ticker,
          diasAfetados: a.adjCloseMatch,
          diasChecados: a.datesChecked,
          exemplo: a.worst,
        })),
        total: tickersWithAdjIssue.length,
      },
      discrepancias: allDiscrepancies.sort((a, b) =>
        parseFloat(b.diffVsClose) - parseFloat(a.diffVsClose)
      ),
      fetchDebug,
      detalhePorTicker: audits,
      goldenSourceStatus: {
        tickers: golden.tickers.length,
        dates: golden.dates.length,
        primeiro: golden.dates[0],
        ultimo: golden.dates[golden.dates.length - 1],
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { readGoldenSource } from "@/lib/db-cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Crypto tickers that legitimately trade on weekends and can have extreme moves
const CRYPTO_TICKERS = new Set([
  "BTC-USD", "ETH-USD", "SOL-USD", "ADA-USD", "DOGE-USD", "DOT-USD",
  "AVAX-USD", "MATIC-USD", "LINK-USD", "UNI-USD", "XRP-USD", "BNB-USD",
  "SHIB-USD", "LTC-USD", "ATOM-USD", "NEAR-USD", "APE-USD", "FTM-USD",
]);

function isCrypto(ticker: string): boolean {
  const up = ticker.toUpperCase();
  return CRYPTO_TICKERS.has(up) || up.endsWith("-USD") || up.endsWith("-BRL");
}

function isFx(ticker: string): boolean {
  return ticker.includes("=") || ticker.includes("BRL=X");
}

function isIndex(ticker: string): boolean {
  return ticker.startsWith("^");
}

function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay(); // 0=Sun, 6=Sat
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().split("T")[0];
}

export async function GET() {
  try {
    const golden = await readGoldenSource();
    if (golden.dates.length === 0) {
      return NextResponse.json({ error: "db_cotacoes vazio" }, { status: 422 });
    }

    const { tickers, dates, prices } = golden;

    // ── 1. Date gaps (missing weekdays Mon-Fri) ──────────────────────────────
    const dateGaps: { expected: string; dayName: string; between: [string, string] }[] = [];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dateSet = new Set(dates);

    if (dates.length >= 2) {
      const first = dates[0];
      const last = dates[dates.length - 1];
      let cursor = first;
      while (cursor <= last) {
        const dow = dayOfWeek(cursor);
        if (dow >= 1 && dow <= 5 && !dateSet.has(cursor)) {
          // Find the surrounding dates for context
          let prev = addDays(cursor, -1);
          while (!dateSet.has(prev) && prev >= first) prev = addDays(prev, -1);
          let next = addDays(cursor, 1);
          while (!dateSet.has(next) && next <= last) next = addDays(next, 1);
          dateGaps.push({
            expected: cursor,
            dayName: dayNames[dow],
            between: [dateSet.has(prev) ? prev : first, dateSet.has(next) ? next : last],
          });
        }
        cursor = addDays(cursor, 1);
      }
    }

    // ── 2. Price anomalies (daily return > 30%) ──────────────────────────────
    interface PriceAnomaly {
      date: string;
      prevDate: string;
      ticker: string;
      returnPct: string;
      prevPrice: number;
      price: number;
      isCrypto: boolean;
    }
    const priceAnomalies: PriceAnomaly[] = [];

    for (const ticker of tickers) {
      let prevPrice: number | null = null;
      let prevDate = "";
      for (const date of dates) {
        const p = prices[date]?.[ticker];
        if (p == null) { continue; }
        if (prevPrice != null && prevPrice > 0) {
          const ret = (p - prevPrice) / prevPrice;
          if (Math.abs(ret) > 0.30) {
            priceAnomalies.push({
              date,
              prevDate,
              ticker,
              returnPct: (ret * 100).toFixed(2) + "%",
              prevPrice: Math.round(prevPrice * 10000) / 10000,
              price: Math.round(p * 10000) / 10000,
              isCrypto: isCrypto(ticker),
            });
          }
        }
        prevPrice = p;
        prevDate = date;
      }
    }

    // ── 3. FX sanity (BRL=X should be 3-7, flag if outside 2-10) ─────────────
    interface FxIssue {
      date: string;
      ticker: string;
      value: number;
      issue: string;
    }
    const fxIssues: FxIssue[] = [];
    const brlxTicker = tickers.find(t => t.toUpperCase() === "BRL=X");

    if (brlxTicker) {
      for (const date of dates) {
        const v = prices[date]?.[brlxTicker];
        if (v == null) continue;
        if (v < 2 || v > 10) {
          fxIssues.push({
            date,
            ticker: brlxTicker,
            value: Math.round(v * 10000) / 10000,
            issue: v < 2 ? "Too low (< 2)" : "Too high (> 10)",
          });
        }
      }
    }

    // Also check other FX tickers for sanity
    for (const ticker of tickers) {
      if (!isFx(ticker) || ticker.toUpperCase() === "BRL=X") continue;
      for (const date of dates) {
        const v = prices[date]?.[ticker];
        if (v == null) continue;
        if (v < 0.5 || v > 20) {
          fxIssues.push({
            date,
            ticker,
            value: Math.round(v * 10000) / 10000,
            issue: v < 0.5 ? "Too low (< 0.5)" : "Too high (> 20)",
          });
        }
      }
    }

    // ── 4. Zero or negative prices ───────────────────────────────────────────
    interface ZeroNeg {
      date: string;
      ticker: string;
      value: number;
    }
    const zeroNegPrices: ZeroNeg[] = [];

    for (const ticker of tickers) {
      for (const date of dates) {
        const v = prices[date]?.[ticker];
        if (v != null && v <= 0) {
          zeroNegPrices.push({
            date,
            ticker,
            value: v,
          });
        }
      }
    }

    // ── 5. ^BVSP range (should be 50k-250k) ─────────────────────────────────
    interface BvspIssue {
      date: string;
      value: number;
      issue: string;
    }
    const bvspIssues: BvspIssue[] = [];
    const bvspTicker = tickers.find(t => t.toUpperCase() === "^BVSP");

    if (bvspTicker) {
      for (const date of dates) {
        const v = prices[date]?.[bvspTicker];
        if (v == null) continue;
        if (v < 50000 || v > 250000) {
          bvspIssues.push({
            date,
            value: Math.round(v * 100) / 100,
            issue: v < 50000 ? "Too low (< 50k)" : "Too high (> 250k)",
          });
        }
      }
    }

    // ── 6. Stale tickers (stop having data well before last date) ────────────
    interface StaleTicker {
      ticker: string;
      lastDataDate: string;
      goldenLastDate: string;
      daysBehind: number;
      totalDataPoints: number;
    }
    const staleTickers: StaleTicker[] = [];
    const goldenLastDate = dates[dates.length - 1];

    for (const ticker of tickers) {
      let lastDataDate = "";
      let count = 0;
      for (const date of dates) {
        if (prices[date]?.[ticker] != null) {
          lastDataDate = date;
          count++;
        }
      }
      if (lastDataDate && lastDataDate < goldenLastDate) {
        // Count calendar days behind
        const last = new Date(lastDataDate);
        const end = new Date(goldenLastDate);
        const daysBehind = Math.round((end.getTime() - last.getTime()) / 86400000);
        // Only flag if > 10 trading days behind (~2 weeks)
        if (daysBehind > 14) {
          staleTickers.push({
            ticker,
            lastDataDate,
            goldenLastDate,
            daysBehind,
            totalDataPoints: count,
          });
        }
      }
    }

    // ── 7. Weekend data (non-crypto data on Sat/Sun) ─────────────────────────
    interface WeekendData {
      date: string;
      dayName: string;
      tickersWithData: string[];
      nonCryptoCount: number;
    }
    const weekendData: WeekendData[] = [];

    for (const date of dates) {
      const dow = dayOfWeek(date);
      if (dow !== 0 && dow !== 6) continue;
      const tickersOnDay: string[] = [];
      const nonCrypto: string[] = [];
      for (const ticker of tickers) {
        if (prices[date]?.[ticker] != null) {
          tickersOnDay.push(ticker);
          if (!isCrypto(ticker)) {
            nonCrypto.push(ticker);
          }
        }
      }
      if (nonCrypto.length > 0) {
        weekendData.push({
          date,
          dayName: dayNames[dow],
          tickersWithData: nonCrypto.slice(0, 20), // cap for readability
          nonCryptoCount: nonCrypto.length,
        });
      }
    }

    // ── 8. Coverage stats per ticker ─────────────────────────────────────────
    interface TickerCoverage {
      ticker: string;
      dataPoints: number;
      totalDates: number;
      coveragePct: string;
      firstDate: string;
      lastDate: string;
      type: string;
    }
    const tickerCoverage: TickerCoverage[] = [];

    for (const ticker of tickers) {
      let count = 0;
      let first = "";
      let last = "";
      for (const date of dates) {
        if (prices[date]?.[ticker] != null) {
          count++;
          if (!first) first = date;
          last = date;
        }
      }
      const kind = isCrypto(ticker)
        ? "crypto"
        : isFx(ticker)
        ? "fx"
        : isIndex(ticker)
        ? "index"
        : "stock/etf/fii";
      tickerCoverage.push({
        ticker,
        dataPoints: count,
        totalDates: dates.length,
        coveragePct: ((count / dates.length) * 100).toFixed(1) + "%",
        firstDate: first,
        lastDate: last,
        type: kind,
      });
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    const nonCryptoAnomalies = priceAnomalies.filter(a => !a.isCrypto);

    return NextResponse.json({
      goldenSource: {
        tickers: tickers.length,
        dates: dates.length,
        firstDate: dates[0],
        lastDate: dates[dates.length - 1],
      },
      summary: {
        dateGaps: dateGaps.length,
        priceAnomaliesNonCrypto: nonCryptoAnomalies.length,
        priceAnomaliesCrypto: priceAnomalies.length - nonCryptoAnomalies.length,
        fxIssues: fxIssues.length,
        zeroNegPrices: zeroNegPrices.length,
        bvspOutOfRange: bvspIssues.length,
        staleTickers: staleTickers.length,
        weekendNonCryptoData: weekendData.length,
        verdict:
          nonCryptoAnomalies.length === 0 &&
          fxIssues.length === 0 &&
          zeroNegPrices.length === 0 &&
          bvspIssues.length === 0
            ? "CLEAN"
            : "ISSUES FOUND",
      },
      "1_dateGaps": {
        description: "Missing weekdays (Mon-Fri) in the date series",
        count: dateGaps.length,
        sample: dateGaps.slice(0, 50),
        hasMore: dateGaps.length > 50,
      },
      "2_priceAnomalies": {
        description: "Daily returns > 30% (suspicious for stocks, may be OK for crypto)",
        nonCrypto: nonCryptoAnomalies,
        crypto: priceAnomalies.filter(a => a.isCrypto),
      },
      "3_fxSanity": {
        description: "BRL=X outside 2-10 range; other FX outside 0.5-20",
        brlxFound: !!brlxTicker,
        issues: fxIssues,
      },
      "4_zeroNegPrices": {
        description: "Zero or negative prices found",
        issues: zeroNegPrices,
      },
      "5_bvspRange": {
        description: "^BVSP values outside 50k-250k range",
        bvspFound: !!bvspTicker,
        issues: bvspIssues,
      },
      "6_staleTickers": {
        description: "Tickers with no data for > 14 days before the last golden source date (possible delist/rename)",
        issues: staleTickers.sort((a, b) => b.daysBehind - a.daysBehind),
      },
      "7_weekendData": {
        description: "Non-crypto data on weekends (Sat/Sun)",
        issues: weekendData,
      },
      "8_tickerCoverage": {
        description: "Coverage stats per ticker",
        tickers: tickerCoverage.sort((a, b) => a.dataPoints - b.dataPoints),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}

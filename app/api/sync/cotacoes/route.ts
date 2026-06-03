import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";
import { readGoldenSource, writeGoldenSource, goldenSourceStatus, type GoldenSourceData } from "@/lib/db-cotacoes";
import { fetchTicker } from "@/lib/market-history";
import { yahooTicker } from "@/lib/cotacoes";
import { identificarSetor, isRendaFixa } from "@/lib/sectors";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const FX_TICKERS = ["BRL=X", "EURBRL=X", "CADBRL=X", "GBPBRL=X"];
const INDEX_TICKERS = ["^BVSP", "^GSPC"];

interface Anomaly {
  ticker: string;
  date: string;
  type: "large_move" | "gap" | "negative";
  detail: string;
}

function detectAnomalies(data: GoldenSourceData): Anomaly[] {
  const anomalies: Anomaly[] = [];
  for (const ticker of data.tickers) {
    let prevPrice: number | null = null;
    let prevDate = "";
    for (const date of data.dates) {
      const price = data.prices[date]?.[ticker];
      if (price == null) {
        if (prevPrice != null) {
          anomalies.push({ ticker, date, type: "gap", detail: `Sem dado após ${prevDate}` });
        }
        continue;
      }
      if (price < 0) {
        anomalies.push({ ticker, date, type: "negative", detail: `Preço negativo: ${price}` });
      }
      if (prevPrice != null && prevPrice > 0) {
        const pctChange = ((price - prevPrice) / prevPrice) * 100;
        if (Math.abs(pctChange) > 25 && !ticker.includes("=") && !ticker.startsWith("^")) {
          anomalies.push({
            ticker, date, type: "large_move",
            detail: `${pctChange > 0 ? "+" : ""}${pctChange.toFixed(1)}% (${prevPrice.toFixed(2)} → ${price.toFixed(2)}). Possível split/bonificação.`,
          });
        }
      }
      prevPrice = price;
      prevDate = date;
    }
  }
  return anomalies;
}

// ── GET: status ─────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const data = await readGoldenSource();
    const status = goldenSourceStatus(data);
    return NextResponse.json({
      ...status,
      tickers: data.tickers,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// ── POST: backfill or update ────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = (body.action as string) ?? "update";
    const lookbackYears = Math.min(Number(body.lookback_years ?? 5), 10);
    const lookbackDays = lookbackYears * 365;

    // 1. Get portfolio tickers
    const transacoes = await fetchTab("meus_ativos");
    const tickerMeta = new Map<string, { moeda: string; corretora: string }>();
    for (const row of transacoes) {
      const ticker = String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? "").toUpperCase().trim();
      if (!ticker) continue;
      if (!tickerMeta.has(ticker)) {
        tickerMeta.set(ticker, {
          moeda: String(row["moeda"] ?? "BRL").toUpperCase().trim(),
          corretora: String(row["corretora"] ?? "").trim(),
        });
      }
    }

    // Map: original → Yahoo ticker (skip renda fixa)
    const yahooMap = new Map<string, string>(); // original → yahoo
    for (const [ticker, meta] of tickerMeta) {
      if (isRendaFixa(identificarSetor(ticker))) continue;
      yahooMap.set(ticker, yahooTicker(ticker, meta.moeda, meta.corretora));
    }

    // Add FX + indices (they map to themselves)
    for (const yt of [...FX_TICKERS, ...INDEX_TICKERS]) {
      yahooMap.set(yt, yt);
    }

    const allOriginalTickers = [...yahooMap.keys()];

    // 2. Read existing golden source
    const existing = await readGoldenSource();
    const existingStatus = goldenSourceStatus(existing);

    // 3. Determine date range
    const endStr = new Date().toISOString().split("T")[0];
    let startStr: string;

    if (action === "update" && !existingStatus.empty) {
      // Incremental: from last date - 3 days (overlap for safety)
      const last = new Date(existingStatus.lastDate);
      last.setDate(last.getDate() - 3);
      startStr = last.toISOString().split("T")[0];
    } else {
      // Full backfill
      const start = new Date();
      start.setDate(start.getDate() - lookbackDays);
      startStr = start.toISOString().split("T")[0];
    }

    // 4. Fetch from Yahoo for all tickers
    const fetchResults = await Promise.allSettled(
      allOriginalTickers.map(async (orig) => {
        const yt = yahooMap.get(orig)!;
        const days = Math.ceil((Date.now() - new Date(startStr).getTime()) / 86400000);
        const rows = await fetchTicker(yt, startStr, endStr, days);
        return { orig: orig.toUpperCase(), rows };
      })
    );

    // 5. Merge with existing data
    const prices: Record<string, Record<string, number>> = {};
    const tickerSet = new Set<string>();
    const dateSet = new Set<string>();

    // Always carry forward existing data so a failed fetch (or a backfill
    // re-run) NEVER wipes already-verified columns. New data is overlaid on top.
    if (!existingStatus.empty) {
      for (const date of existing.dates) {
        dateSet.add(date);
        prices[date] = { ...existing.prices[date] };
      }
      existing.tickers.forEach(t => tickerSet.add(t));
    }

    // Overlay new data (Yahoo value wins for dates it returns; missing dates
    // keep whatever was already in the golden source).
    let newPoints = 0;
    const tickerErrors: string[] = [];
    for (const res of fetchResults) {
      if (res.status !== "fulfilled") continue;
      const { orig, rows } = res.value;
      tickerSet.add(orig);
      if (rows.length === 0) {
        tickerErrors.push(orig);
        continue;
      }
      for (const { date, price } of rows) {
        dateSet.add(date);
        if (!prices[date]) prices[date] = {};
        if (prices[date][orig] == null) newPoints++;
        prices[date][orig] = price;
      }
    }

    const sortedDates = [...dateSet].sort();
    const sortedTickers = [...tickerSet].sort();

    const merged: GoldenSourceData = {
      tickers: sortedTickers,
      dates: sortedDates,
      prices,
    };

    // 6. Detect anomalies
    const anomalies = detectAnomalies(merged);

    // 7. Write to sheet
    await writeGoldenSource(merged);

    // 8. Return report
    const newStatus = goldenSourceStatus(merged);
    return NextResponse.json({
      action,
      status: newStatus,
      newPoints,
      tickerErrors: tickerErrors.length > 0 ? tickerErrors : undefined,
      anomalies: anomalies.slice(0, 50),
      anomalyCount: anomalies.length,
      tickers: sortedTickers,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

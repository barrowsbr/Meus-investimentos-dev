import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { readGoldenSource } from "@/lib/db-cotacoes";
import { calcularCarteiraFIFO } from "@/lib/portfolio";
import { toNumber } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

type Row = Record<string, unknown>;

/* ── helpers ─────────────────────────────────────────────────────────── */

function getVal(row: Row, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  return null;
}

/** Parse any date representation into ISO YYYY-MM-DD. */
function parseDate(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "number") {
    const d = new Date(Date.UTC(1899, 11, 30 + Math.round(val)));
    return d.toISOString().split("T")[0];
  }
  const s = String(val).trim();
  const ddmm = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (ddmm)
    return `${ddmm[3]}-${ddmm[2].padStart(2, "0")}-${ddmm[1].padStart(2, "0")}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return "";
}

/** Find the closest date <= target in a sorted array of ISO date strings. */
function closestDate(sorted: string[], target: string): string | null {
  let lo = 0;
  let hi = sorted.length - 1;
  let best: string | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] <= target) {
      best = sorted[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/* ── GET handler ─────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetDate = searchParams.get("date");

  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return NextResponse.json(
      { error: "Query param ?date=YYYY-MM-DD é obrigatório." },
      { status: 400 },
    );
  }

  try {
    const store = getDataStore();
    const [ativos, rfRows, goldenSource] = await Promise.all([
      store.fetchTab("meus_ativos"),
      store.fetchTab("renda_fixa"),
      readGoldenSource(),
    ]);

    /* ── 1. Renda Variável (FIFO) ──────────────────────────────────── */
    const filteredAtivos = ativos.filter((row) => {
      const d = parseDate(
        getVal(row, "data", "date", "compra"),
      );
      return d !== "" && d <= targetDate;
    });

    const carteira = calcularCarteiraFIFO(filteredAtivos);

    // Find closest price date
    const priceDate = closestDate(goldenSource.dates, targetDate);
    const dayPrices = priceDate ? goldenSource.prices[priceDate] ?? {} : {};

    // FX rate at the target date (BRL=X or USDBRL=X column)
    const fxRate =
      dayPrices["BRL=X"] ?? dayPrices["USDBRL=X"] ?? null;

    const rendaVariavel: {
      ticker: string;
      quantidade: number;
      custoMedio: number;
      moeda: string;
      precoHistorico: number | null;
      valorHistorico: number | null;
    }[] = [];

    let totalRV_BRL = 0;

    for (const [ticker, pos] of carteira) {
      const qtd = pos.lotes.reduce((s, l) => s + l.qty, 0);
      if (qtd < 0.000001) continue;

      const custoTotal = pos.lotes.reduce((s, l) => s + l.pm * l.qty, 0);
      const custoMedio = custoTotal / qtd;

      const preco =
        dayPrices[ticker] ??
        dayPrices[ticker.replace(".SA", "")] ??
        dayPrices[`${ticker}.SA`] ??
        null;

      let valorHistorico: number | null = null;
      if (preco !== null) {
        valorHistorico = preco * qtd;
        const isUSD = pos.moeda === "USD";
        totalRV_BRL += isUSD && fxRate ? valorHistorico * fxRate : valorHistorico;
      }

      rendaVariavel.push({
        ticker,
        quantidade: qtd,
        custoMedio,
        moeda: pos.moeda,
        precoHistorico: preco,
        valorHistorico,
      });
    }

    /* ── 2. Renda Fixa ─────────────────────────────────────────────── */
    const filteredRF = rfRows.filter((row) => {
      const d = parseDate(getVal(row, "compra", "data", "date"));
      return d !== "" && d <= targetDate;
    });

    const rfMap = new Map<
      string,
      { ticker: string; tipo: string; valorInvestido: number; moeda: string }
    >();

    for (const row of filteredRF) {
      const ticker = String(
        getVal(row, "ticker", "ativo", "papel") ?? "",
      ).trim();
      if (!ticker) continue;

      const tipoRaw = String(getVal(row, "tipo", "tipo de movimentação") ?? "")
        .toLowerCase()
        .trim();
      const valor = toNumber(getVal(row, "valor", "value")) ?? 0;
      const moeda = String(getVal(row, "moeda", "currency") ?? "BRL")
        .toUpperCase()
        .trim() || "BRL";

      const isVenda =
        tipoRaw.includes("venda") ||
        tipoRaw.includes("resgate") ||
        tipoRaw.includes("sell");
      const signed = isVenda ? -Math.abs(valor) : Math.abs(valor);

      const existing = rfMap.get(ticker);
      if (existing) {
        existing.valorInvestido += signed;
      } else {
        rfMap.set(ticker, {
          ticker,
          tipo: tipoRaw || "compra",
          valorInvestido: signed,
          moeda,
        });
      }
    }

    const rendaFixa = [...rfMap.values()].filter(
      (rf) => rf.valorInvestido > 0.01,
    );

    let totalRF_BRL = 0;
    for (const rf of rendaFixa) {
      const isUSD = rf.moeda === "USD";
      totalRF_BRL += isUSD && fxRate ? rf.valorInvestido * fxRate : rf.valorInvestido;
    }

    const totalBRL = totalRV_BRL + totalRF_BRL;

    return NextResponse.json({
      date: targetDate,
      priceDate: priceDate ?? null,
      fxRate,
      rendaVariavel,
      rendaFixa,
      resumo: {
        totalRV_BRL: Math.round(totalRV_BRL * 100) / 100,
        totalRF_BRL: Math.round(totalRF_BRL * 100) / 100,
        totalBRL: Math.round(totalBRL * 100) / 100,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

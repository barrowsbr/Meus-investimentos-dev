import { NextResponse } from "next/server";
import { fetchHistory } from "@/lib/cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// ─────────────────────────────────────────────────────────────────────────────
// Timeline 7 dias — retorna closes diários do índice principal + moeda de um
// país nos últimos 7 dias úteis. Usado na aba Resumo do dossiê.
// ─────────────────────────────────────────────────────────────────────────────

const COUNTRY_INDEX: Record<string, string> = {
  "EUA": "^GSPC", "Brasil": "^BVSP", "Canadá": "^GSPTSE", "México": "^MXX",
  "Argentina": "^MERV", "Chile": "^IPSA",
  "Reino Unido": "^FTSE", "Alemanha": "^GDAXI", "França": "^FCHI",
  "Espanha": "^IBEX", "Itália": "^FTSEMIB", "Suíça": "^SSMI",
  "Holanda": "^AEX", "Suécia": "^OMX", "Bélgica": "^BFX", "Portugal": "^PSI20",
  "Japão": "^N225", "Hong Kong": "^HSI", "China": "^SSEC",
  "Coreia do Sul": "^KS11", "Taiwan": "^TWII", "Índia": "^BSESN",
  "Singapura": "^STI", "Indonésia": "^JKSE", "Malásia": "^KLSE",
  "Tailândia": "^SET.BK",
  "Israel": "^TA125.TA", "Austrália": "^AXJO",
  "África do Sul": "^JN0U.JO", "Egito": "^CASE30", "Nigéria": "^NGS30",
};

const COUNTRY_CURRENCY: Record<string, string> = {
  "Brasil": "BRL=X", "Canadá": "CAD=X", "México": "MXN=X",
  "Argentina": "ARS=X", "Chile": "CLP=X",
  "Reino Unido": "GBP=X", "Suíça": "CHF=X", "Suécia": "SEK=X",
  "Noruega": "NOK=X", "Dinamarca": "DKK=X", "Polônia": "PLN=X",
  "Turquia": "TRY=X", "Hungria": "HUF=X",
  "Japão": "JPY=X", "China": "CNY=X", "Coreia do Sul": "KRW=X",
  "Taiwan": "TWD=X", "Índia": "INR=X", "Indonésia": "IDR=X",
  "Tailândia": "THB=X", "Malásia": "MYR=X",
  "Israel": "ILS=X", "África do Sul": "ZAR=X", "Egito": "EGP=X",
  "Nigéria": "NGN=X", "Austrália": "AUD=X", "Nova Zelândia": "NZD=X",
};

interface DayPoint {
  date: string;
  indexClose: number | null;
  indexChangePct: number | null;
  fxRate: number | null;
  fxChangePct: number | null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") ?? "";

  if (!country) {
    return NextResponse.json({ error: "country param required" }, { status: 400 });
  }

  const indexSymbol = COUNTRY_INDEX[country];
  const fxSymbol = COUNTRY_CURRENCY[country];

  const [indexHistory, fxHistory] = await Promise.all([
    indexSymbol
      ? fetchHistory(indexSymbol, "1mo", "1d").catch(() => [])
      : Promise.resolve([]),
    fxSymbol
      ? fetchHistory(fxSymbol, "1mo", "1d").catch(() => [])
      : Promise.resolve([]),
  ]);

  const last7Index = indexHistory.slice(-8);
  const last7Fx = fxHistory.slice(-8);

  const fxMap = new Map(last7Fx.map(p => [p.date, p.close]));

  const timeline: DayPoint[] = [];
  for (let i = 1; i < last7Index.length; i++) {
    const curr = last7Index[i];
    const prev = last7Index[i - 1];
    const fxCurr = fxMap.get(curr.date) ?? null;
    const fxPrev = fxMap.get(prev.date) ?? null;

    timeline.push({
      date: curr.date,
      indexClose: curr.close,
      indexChangePct: prev.close > 0 ? ((curr.close / prev.close) - 1) * 100 : null,
      fxRate: fxCurr,
      fxChangePct: fxPrev && fxCurr && fxPrev > 0 ? ((fxCurr / fxPrev) - 1) * 100 : null,
    });
  }

  return NextResponse.json({
    country,
    indexSymbol: indexSymbol ?? null,
    fxSymbol: fxSymbol ?? null,
    timeline: timeline.slice(-7),
  }, {
    headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=300" },
  });
}

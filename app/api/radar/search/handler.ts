import { NextRequest, NextResponse } from "next/server";
import type { SymbolKind } from "@/lib/radar/types";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// ─────────────────────────────────────────────────────────────────────────────
// Symbol search — busca livre no Yahoo Finance para o Command Palette (⌘K).
// Digite "Petrobras", "AAPL", "ibovespa"… e recebe ativos correspondentes
// (ações, ETFs, índices, fundos, cripto). Clicar abre o candlestick (SymbolDetail).
// Reaproveita o `yf.search` do yahoo-finance2 — sem motor novo.
// ─────────────────────────────────────────────────────────────────────────────

// Moeda por sufixo de bolsa (palpite inicial do eixo; o OHLC corrige depois).
const SUFFIX_CCY: Record<string, string> = {
  SA: "BRL", L: "GBP", T: "JPY", HK: "HKD", TO: "CAD", V: "CAD",
  AX: "AUD", NZ: "NZD", SW: "CHF", DE: "EUR", PA: "EUR", AS: "EUR",
  MI: "EUR", MC: "EUR", BR: "EUR", LS: "EUR", VI: "EUR", HE: "EUR",
  ST: "SEK", OL: "NOK", CO: "DKK", KS: "KRW", KQ: "KRW", TW: "TWD",
  NS: "INR", BO: "INR", SI: "SGD", BK: "THB", JK: "IDR", KL: "MYR",
  MX: "MXN", SR: "RUB", IS: "TRY", WA: "PLN", JO: "ZAR",
};

function guessCurrency(symbol: string, quoteType: string): string {
  if (quoteType === "CRYPTOCURRENCY" || symbol.endsWith("-USD")) return "USD";
  const m = symbol.match(/\.([A-Z]+)$/);
  if (m && SUFFIX_CCY[m[1]]) return SUFFIX_CCY[m[1]];
  return "USD";
}

function typeLabel(quoteType: string): string {
  switch (quoteType) {
    case "EQUITY": return "Ação";
    case "ETF": return "ETF";
    case "INDEX": return "Índice";
    case "MUTUALFUND": return "Fundo";
    case "CRYPTOCURRENCY": return "Cripto";
    case "CURRENCY": return "Moeda";
    case "FUTURE": return "Futuro";
    default: return quoteType;
  }
}

// kind "index" → sem notícias e badge "Índice"; "stock" → busca notícias do ativo.
function kindFor(quoteType: string): SymbolKind {
  return (quoteType === "INDEX" || quoteType === "CURRENCY" || quoteType === "FUTURE") ? "index" : "stock";
}

const ALLOWED = new Set(["EQUITY", "ETF", "INDEX", "MUTUALFUND", "CRYPTOCURRENCY", "CURRENCY"]);

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ query: q, results: [] });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const YF: any = (await import("yahoo-finance2")).default;
    const yf = typeof YF === "function" ? new YF() : YF;
    const res = await yf.search(q, { quotesCount: 14, newsCount: 0 }, { validateResult: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes: any[] = res?.quotes ?? [];

    const seen = new Set<string>();
    const results = quotes
      .filter((it) => it?.symbol && it?.quoteType && ALLOWED.has(it.quoteType) && it.isYahooFinance !== false)
      .filter((it) => { if (seen.has(it.symbol)) return false; seen.add(it.symbol); return true; })
      .slice(0, 8)
      .map((it) => ({
        symbol: it.symbol as string,
        name: (it.longname || it.shortname || it.symbol) as string,
        exchange: (it.exchDisp || it.exchange || "") as string,
        type: typeLabel(it.quoteType),
        kind: kindFor(it.quoteType),
        moeda: guessCurrency(it.symbol, it.quoteType),
      }));

    return NextResponse.json({ query: q, results }, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=120" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "search failed";
    // Falha de busca não deve quebrar o palette — devolve lista vazia.
    return NextResponse.json({ query: q, results: [], error: msg });
  }
}

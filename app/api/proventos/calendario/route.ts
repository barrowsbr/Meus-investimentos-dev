import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { fetchCotacoes, yahooTicker } from "@/lib/cotacoes";
import { calcularSnapshot } from "@/lib/portfolio";
import { identificarSetor, isRendaFixa } from "@/lib/sectors";

// Rota própria (não passa pelo catch-all [...path]): o quoteSummary em lote pode
// levar dezenas de segundos; precisa do maxDuration 45 REAL.
export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ── Agenda de dividendos (próximos eventos) ──────────────────────────────────
// Para cada ativo de RENDA VARIÁVEL da carteira, busca no Yahoo (calendarEvents
// + summaryDetail) as próximas datas EX e de PAGAMENTO de dividendos. É só
// LEITURA de mercado (não toca no motor de portfólio nem na planilha).
// Cache em memória de 6h — datas de dividendo mudam devagar e evita martelar o
// Yahoo a cada abertura do popup.

interface EventoDividendo {
  ticker: string;
  tipo: "ex" | "pagamento";
  date: string;          // YYYY-MM-DD
  moeda: string;
  dividendRate: number | null;   // dividendo anual (moeda nativa)
  dividendYield: number | null;  // % (ex.: 3.2 = 3,2%)
}

interface CalendarioPayload { eventos: EventoDividendo[]; geradoEm: string; tickers: number }

let cache: { at: number; payload: CalendarioPayload } | null = null;
const CACHE_MS = 6 * 60 * 60 * 1000;

function toISODate(v: unknown): string | null {
  if (v == null) return null;
  let d: Date;
  if (v instanceof Date) d = v;
  else if (typeof v === "number") d = new Date(v > 1e12 ? v : v * 1000);
  else if (typeof v === "string") d = new Date(v);
  else return null;
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function GET(): Promise<NextResponse> {
  try {
    if (cache && Date.now() - cache.at < CACHE_MS) {
      return NextResponse.json(cache.payload, { headers: { "Cache-Control": "s-maxage=3600" } });
    }

    const store = getDataStore();
    const transacoes = await store.fetchTab("meus_ativos");

    // Tickers da carteira (moeda/corretora p/ resolver a grafia Yahoo).
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

    // Snapshot só para saber QUAIS ativos ainda são detidos (qty>0) e o setor.
    // proventos/fixa vazios: não usados aqui (só as posições importam).
    const cotacoes = await fetchCotacoes(tickers);
    const snapshot = calcularSnapshot(transacoes, [], [], cotacoes.quotes, cotacoes.fx, cotacoes.fx);

    // Renda variável viva, exceto cripto (não paga dividendo).
    const yahooSymbols: { ySym: string; ticker: string; moeda: string }[] = [];
    const seen = new Set<string>();
    for (const p of snapshot.positions) {
      if ((p.quantidade ?? 0) <= 0 || (p.valorAtualBRL ?? 0) <= 0) continue;
      if (isRendaFixa(p.setor) || p.setor === "Cripto") continue;
      const info = tickerSet.get(p.ticker);
      const ySym = yahooTicker(p.ticker, info?.moeda ?? "BRL", info?.corretora ?? "");
      if (seen.has(ySym)) continue;
      seen.add(ySym);
      yahooSymbols.push({ ySym, ticker: p.ticker.replace(/\.SA$/i, ""), moeda: info?.moeda ?? "BRL" });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const YF: any = (await import("yahoo-finance2")).default;
    const yf = typeof YF === "function" ? new YF() : YF;

    // Só eventos de hoje-2d em diante (agenda = o que vem).
    const hoje = new Date();
    hoje.setUTCHours(0, 0, 0, 0);
    const piso = new Date(hoje.getTime() - 2 * 86400000).toISOString().slice(0, 10);

    const eventos: EventoDividendo[] = [];
    const BATCH = 6;
    for (let i = 0; i < yahooSymbols.length; i += BATCH) {
      const batch = yahooSymbols.slice(i, i + BATCH);
      await Promise.all(batch.map(async ({ ySym, ticker, moeda }) => {
        try {
          const s = await yf.quoteSummary(ySym, { modules: ["calendarEvents", "summaryDetail"] });
          const exDate = toISODate(s?.calendarEvents?.exDividendDate ?? s?.summaryDetail?.exDividendDate);
          const payDate = toISODate(s?.calendarEvents?.dividendDate);
          const rate = typeof s?.summaryDetail?.dividendRate === "number" ? s.summaryDetail.dividendRate : null;
          const yld = typeof s?.summaryDetail?.dividendYield === "number" ? s.summaryDetail.dividendYield * 100 : null;
          if (exDate && exDate >= piso) eventos.push({ ticker, tipo: "ex", date: exDate, moeda, dividendRate: rate, dividendYield: yld });
          if (payDate && payDate >= piso && payDate !== exDate) eventos.push({ ticker, tipo: "pagamento", date: payDate, moeda, dividendRate: rate, dividendYield: yld });
        } catch {
          // ticker sem calendário/dividendo → ignora
        }
      }));
    }

    eventos.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ticker.localeCompare(b.ticker)));
    const payload: CalendarioPayload = { eventos, geradoEm: new Date().toISOString(), tickers: yahooSymbols.length };
    cache = { at: Date.now(), payload };
    return NextResponse.json(payload, { headers: { "Cache-Control": "s-maxage=3600" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

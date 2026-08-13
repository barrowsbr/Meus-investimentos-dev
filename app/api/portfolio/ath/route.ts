import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { fetchCotacoes, yahooTicker } from "@/lib/cotacoes";
import { calcularSnapshot } from "@/lib/portfolio";
import { isRendaFixa } from "@/lib/sectors";

// Rota própria (fora do catch-all): busca histórico mensal no Yahoo por ativo.
export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ── Máximas históricas (ATH) da carteira ─────────────────────────────────────
// Para cada ativo de RENDA VARIÁVEL detido, compara o preço ATUAL com o topo
// histórico até ONTEM: candles MENSAIS do Yahoo desde 1970 (sem o mês
// corrente) + candles DIÁRIOS do mês corrente até ontem (dia de São Paulo).
// Preço >= esse topo ⇒ o ativo está furando a máxima histórica HOJE — o item
// só existe no dia do rompimento e some sozinho no dia seguinte (regra do
// dono: o aviso do sino é só no dia). Alimenta o sino. Só leitura de mercado.

interface ItemAth {
  ticker: string;   // grafia da carteira (sem .SA — como nas outras listas)
  ySym: string;     // símbolo Yahoo
  preco: number;    // preço atual (moeda nativa)
  athPrevio: number;// topo histórico até ontem
  athAno: number | null; // ano do topo prévio
  moeda: string;
}
interface PayloadAth { itens: ItemAth[]; geradoEm: string; dia: string; avaliados: number }

// "Hoje" no fuso do dono (São Paulo) — o dia do alerta é o dia dele, não UTC
// (21h BRT já é outro dia UTC e o aviso sumiria no meio do pregão americano).
const diaSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const dataSP = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

let cache: { at: number; dia: string; payload: PayloadAth } | null = null;
const CACHE_MS = 6 * 60 * 60 * 1000;

// Topo MENSAL por símbolo (sem o mês corrente) — quase estático, cache por mês.
const mensalCache = new Map<string, { mes: string; ath: number; ano: number | null } | null>();
// Topo do mês corrente até ONTEM — muda todo dia, cache por dia.
const diarioCache = new Map<string, { dia: string; ath: number }>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAthPrevio(yf: any, sym: string): Promise<{ athPrevio: number; ano: number | null } | null> {
  const hoje = diaSP();
  const mes = hoje.slice(0, 7);

  let mensal = mensalCache.get(sym);
  if (mensal === undefined || (mensal !== null && mensal.mes !== mes)) {
    try {
      const r = await yf.chart(sym, { period1: "1970-01-01", interval: "1mo" });
      const quotes: Array<{ high?: number | null; close?: number | null; date?: Date }> = r?.quotes ?? [];
      let ath = 0;
      let ano: number | null = null;
      for (const q of quotes) {
        const qMes = q.date ? dataSP(new Date(q.date)).slice(0, 7) : null;
        if (qMes !== null && qMes >= mes) continue; // exclui o mês corrente
        const v = (typeof q.high === "number" && isFinite(q.high) ? q.high : null) ?? (typeof q.close === "number" && isFinite(q.close) ? q.close : null);
        if (v !== null && v > ath) { ath = v; ano = q.date ? new Date(q.date).getUTCFullYear() : null; }
      }
      mensal = ath > 0 ? { mes, ath, ano } : null;
      mensalCache.set(sym, mensal);
    } catch {
      return null; // falha não cacheia — re-tenta na próxima
    }
  }
  if (!mensal) return null;

  let diario = diarioCache.get(sym);
  if (!diario || diario.dia !== hoje) {
    try {
      const r = await yf.chart(sym, { period1: `${mes}-01`, interval: "1d" });
      const quotes: Array<{ high?: number | null; close?: number | null; date?: Date }> = r?.quotes ?? [];
      let ath = 0;
      for (const q of quotes) {
        const qDia = q.date ? dataSP(new Date(q.date)) : null;
        if (qDia === null || qDia >= hoje) continue; // só até ontem
        const v = (typeof q.high === "number" && isFinite(q.high) ? q.high : null) ?? (typeof q.close === "number" && isFinite(q.close) ? q.close : null);
        if (v !== null && v > ath) ath = v;
      }
      diario = { dia: hoje, ath };
      diarioCache.set(sym, diario);
    } catch {
      return null; // sem o pedaço diário o veredito ficaria errado — pula
    }
  }

  const anoAtual = Number(hoje.slice(0, 4));
  const athPrevio = Math.max(mensal.ath, diario.ath);
  return { athPrevio: Math.round(athPrevio * 10000) / 10000, ano: diario.ath > mensal.ath ? anoAtual : mensal.ano };
}

export async function GET(): Promise<NextResponse> {
  try {
    // Cache só vale DENTRO do mesmo dia (SP) — virou o dia, a lista zera.
    if (cache && cache.dia === diaSP() && Date.now() - cache.at < CACHE_MS) {
      return NextResponse.json(cache.payload, { headers: { "Cache-Control": "s-maxage=3600" } });
    }

    const store = getDataStore();
    const transacoes = await store.fetchTab("meus_ativos");

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

    // Snapshot só para saber o que ainda é DETIDO (qty>0) e o setor.
    const cotacoes = await fetchCotacoes(tickers);
    const snapshot = calcularSnapshot(transacoes, [], [], cotacoes.quotes, cotacoes.fx, cotacoes.fx);

    // RV viva, exceto cripto — mesma régua da agenda de proventos.
    const alvos: { ySym: string; ticker: string; preco: number; moeda: string }[] = [];
    const seen = new Set<string>();
    for (const p of snapshot.positions) {
      if ((p.quantidade ?? 0) <= 0 || (p.valorAtualBRL ?? 0) <= 0) continue;
      if (isRendaFixa(p.setor) || p.setor === "Cripto") continue;
      const info = tickerSet.get(p.ticker);
      const ySym = yahooTicker(p.ticker, info?.moeda ?? "BRL", info?.corretora ?? "");
      if (seen.has(ySym)) continue;
      seen.add(ySym);
      const q = cotacoes.quotes[p.ticker];
      const preco = typeof q?.price === "number" && isFinite(q.price) && q.price > 0 ? q.price : null;
      if (preco === null) continue; // sem cotação ao vivo → sem veredito
      alvos.push({ ySym, ticker: p.ticker.replace(/\.SA$/i, ""), preco, moeda: q?.currency || (info?.moeda ?? "BRL") });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const YF: any = (await import("yahoo-finance2")).default;
    const yf = typeof YF === "function" ? new YF() : YF;

    const itens: ItemAth[] = [];
    const BATCH = 6;
    for (let i = 0; i < alvos.length; i += BATCH) {
      const leva = alvos.slice(i, i + BATCH);
      const res = await Promise.all(leva.map((a) => fetchAthPrevio(yf, a.ySym)));
      leva.forEach((a, j) => {
        const info = res[j];
        if (!info) return;
        if (a.preco >= info.athPrevio) {
          itens.push({ ticker: a.ticker, ySym: a.ySym, preco: a.preco, athPrevio: info.athPrevio, athAno: info.ano, moeda: a.moeda });
        }
      });
    }

    itens.sort((a, b) => a.ticker.localeCompare(b.ticker));
    const payload: PayloadAth = { itens, geradoEm: new Date().toISOString(), dia: diaSP(), avaliados: alvos.length };
    cache = { at: Date.now(), dia: payload.dia, payload };
    return NextResponse.json(payload, { headers: { "Cache-Control": "s-maxage=3600" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

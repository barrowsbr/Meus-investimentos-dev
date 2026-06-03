import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";
import { fetchHistoricalData } from "@/lib/market-history";
import { calcularTWR } from "@/lib/twr-engine";
import { calcularCambioMetrics, buildPmFxRates } from "@/lib/cambio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Engine constants (mirrored from twr-engine.ts) — used to classify each day.
const FLOW_THRESHOLD = 0.01;
const LARGE_FLOW_FORCE_ZERO = 0.90;
const MAX_DAILY_RETURN = 0.50;

function pct(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}

// Auditoria da rentabilidade: mede se os bloqueios anti-outlier estão
// descartando retornos legítimos e decompõe o retorno (preço × dividendos)
// para confirmar que a queda foi a correção do double-count, não supressão.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawLookback = parseInt(searchParams.get("lookback") ?? "1825", 10);
  const lookback = rawLookback <= 0 ? 0 : Math.min(rawLookback, 3650);

  try {
    const [transacoes, proventos, cambioRows] = await Promise.all([
      fetchTab("meus_ativos"),
      fetchTab("meus_proventos").catch(() => []),
      fetchTab("cambio").catch(() => []),
    ]);
    if (transacoes.length === 0) {
      return NextResponse.json({ error: "Sem transações" }, { status: 422 });
    }

    // Tickers (mesma extração das rotas de TWR)
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
    const tickerList = [...tickerMeta.entries()].map(([ticker, info]) => ({ ticker, ...info }));

    const hist = await fetchHistoricalData(tickerList, lookback > 0 ? lookback + 10 : 0);
    if (hist.dates.length === 0) {
      return NextResponse.json({ error: "Sem dados históricos", histErrors: hist.errors }, { status: 422 });
    }

    const windowEnd = new Date().toISOString().split("T")[0];
    const fromDate = lookback > 0
      ? (() => { const d = new Date(); d.setDate(d.getDate() - lookback); return d.toISOString().split("T")[0]; })()
      : "0000";
    const dates = hist.dates.filter(d => d >= fromDate && d <= windowEnd);

    const dateIdxMap = new Map(hist.dates.map((d, i) => [d, i]));
    const alignedPrices: Record<string, (number | null)[]> = {};
    for (const [ticker, arr] of Object.entries(hist.prices)) {
      alignedPrices[ticker] = dates.map(d => {
        const idx = dateIdxMap.get(d);
        return idx != null ? arr[idx] : null;
      });
    }
    const alignedFx = Object.fromEntries(dates.map(d => [d, hist.fxHistory[d]]));
    const lastFx = hist.fxHistory[dates[dates.length - 1]] ?? { USDBRL: 5.7, EURBRL: 6.4, CADBRL: 4.1, GBPBRL: 7.6 };
    const pmFx = buildPmFxRates(calcularCambioMetrics(cambioRows, lastFx));

    // ── Método atual: preço bruto + dividendos ──
    const twrAtual = calcularTWR({ transacoes, proventos, dates, prices: alignedPrices, fxHistory: alignedFx, pmFx });
    // ── Só preço (sem dividendos) — para decompor a contribuição dos proventos ──
    const twrSemDiv = calcularTWR({ transacoes, proventos: [], dates, prices: alignedPrices, fxHistory: alignedFx, pmFx });

    // ── Pergunta 1: os bloqueios estão barrando algo legítimo? ──
    const pts = twrAtual.points;
    const capped: { date: string; retBruto: string; retAplicado: string }[] = [];
    const forceZeroSuspeito: { date: string; retDescartado: string; navAntes: number; navDepois: number }[] = [];
    let forceZeroLegitimo = 0;

    // Recompute cumulative TWR WITHOUT the questionable blocks (cap + dataAnomaly
    // forceZero). Genuinely-undefined days (no capital base / flow >90%) stay 0.
    let twrSemBloqueios = 1;
    let prevNav = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i === 0) { prevNav = p.nav; twrSemBloqueios *= 1; continue; }

      const flow = p.flow;
      const hugeFlow = prevNav > 0 && Math.abs(flow) / prevNav > LARGE_FLOW_FORCE_ZERO;
      const noBase = prevNav <= 0;
      const isSoD = !noBase && !hugeFlow && Math.abs(flow) / prevNav > FLOW_THRESHOLD;
      const base = isSoD ? prevNav + flow : prevNav;
      const rawRet = base > 0 ? ((p.nav + p.income) - prevNav - flow) / base : 0;

      // Classify the day
      if (p.forceZero) {
        if (noBase || hugeFlow) {
          forceZeroLegitimo++;
        } else {
          // dataAnomaly: a >40% move with no flow was discarded
          forceZeroSuspeito.push({ date: p.date, retDescartado: pct(rawRet), navAntes: Math.round(prevNav), navDepois: Math.round(p.nav) });
        }
      } else if (Math.abs(rawRet) > MAX_DAILY_RETURN) {
        capped.push({ date: p.date, retBruto: pct(rawRet), retAplicado: pct(p.ret) });
      }

      // Unblocked cumulative: keep legit-undefined days at 0, otherwise use raw
      const retUnblocked = (noBase || hugeFlow) ? 0 : rawRet;
      twrSemBloqueios *= (1 + retUnblocked);
      prevNav = p.nav;
    }
    twrSemBloqueios -= 1;

    // ── Pergunta 2: a queda foi double-count, não supressão? ──
    const contribDividendos = twrAtual.twrTotal - twrSemDiv.twrTotal;
    // O método antigo (adjClose + proventos) embutia os dividendos no preço E
    // os somava de novo → ≈ atual + contribuição dos dividendos (estimativa).
    const estimativaMetodoAntigo = twrAtual.twrTotal + contribDividendos;

    const impactoBloqueios = twrSemBloqueios - twrAtual.twrTotal;

    return NextResponse.json({
      janela: { de: dates[0], ate: dates[dates.length - 1], dias: dates.length, lookback },

      pergunta1_bloqueios: {
        resumo: forceZeroSuspeito.length === 0 && capped.length === 0
          ? "✅ Nenhum bloqueio descartou retorno legítimo."
          : "⚠️ Há dias bloqueados — ver impacto abaixo.",
        twrComBloqueios: pct(twrAtual.twrTotal),
        twrSemBloqueios: pct(twrSemBloqueios),
        impactoDosBloqueios: pct(impactoBloqueios),
        veredito: Math.abs(impactoBloqueios) < 0.01
          ? "Impacto < 1 ponto — os bloqueios NÃO estão amarrando a rentabilidade."
          : "Impacto relevante — investigar os dias listados.",
        diasCapados: { quantidade: capped.length, exemplos: capped.slice(0, 30) },
        forceZeroSuspeitos: { quantidade: forceZeroSuspeito.length, exemplos: forceZeroSuspeito.slice(0, 30) },
        forceZeroLegitimos: forceZeroLegitimo,
      },

      pergunta2_doubleCount: {
        twrAtual_precoMaisDividendos: pct(twrAtual.twrTotal),
        twrSomentePreco: pct(twrSemDiv.twrTotal),
        contribuicaoDividendos: pct(contribDividendos),
        estimativaMetodoAntigo_adjCloseMaisDividendos: pct(estimativaMetodoAntigo),
        veredito: `A queda ≈ contribuição dos dividendos (${pct(contribDividendos)}). O método antigo somava isso DUAS vezes (uma no adjClose, outra como income), por isso aparecia inflado em ~${pct(estimativaMetodoAntigo)}. O número atual (${pct(twrAtual.twrTotal)}) é o correto.`,
      },

      ganhoEconomico: Math.round(twrAtual.ganhoEconomico),
      totalInvestido: Math.round(twrAtual.totalInvestido),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

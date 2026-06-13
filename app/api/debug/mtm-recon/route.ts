import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";
import { fetchHistoricalData } from "@/lib/market-history";
import { calcularTWR, buildRfTimeline, parseRVTransactions } from "@/lib/twr-engine";
import { calcularCambioMetrics, buildPmFxRates } from "@/lib/cambio";
import { calcularSnapshot } from "@/lib/portfolio";
import { identificarSetor, getMoedaEfetiva, isRendaFixaManual } from "@/lib/sectors";
import { fetchCdiDiario } from "@/lib/bcb";
import type { FxRates } from "@/lib/cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Reconciliação MTM: decompõe a diferença entre o ganho econômico do motor TWR
// (navFinal − Σflows + Σincome) e o ganho canônico do Resumo (FIFO + RF manual
// + proventos) em componentes nomeados — RV, RF, proventos e os dois efeitos
// estruturais conhecidos (flows a preço de mercado × preço de execução; custo
// a pmDólar × FX spot). Serve de validador: cada componente perto de 0 = dados
// e motores consistentes; componente grande aponta ONDE divergem.

type Row = Record<string, unknown>;

function tickerOf(row: Row): string {
  return String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? "").toUpperCase().trim();
}

function fxToBRL(moeda: string, fx: FxRates): number {
  const c = moeda.toUpperCase();
  if (c === "BRL") return 1;
  if (c === "USD") return fx.USDBRL;
  if (c === "EUR") return fx.EURBRL;
  if (c === "CAD") return fx.CADBRL;
  if (c === "GBP") return fx.GBPBRL;
  return 1;
}

const CASH_TICKERS = new Set(["CAIXA", "SALDO", "CASH", "RESERVA", "DISPONIVEL"]);
const isCashTicker = (t: string) => {
  const u = t.toUpperCase().trim();
  return CASH_TICKERS.has(u) || u.includes("CAIXA") || u.includes("SALDO") || u.includes("CASH") || u.includes("DISPONIVEL");
};
const normTicker = (t: string) => t.trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

export async function GET() {
  try {
    const [transacoes, proventos, cambioRows, rfTransacoes, fixaAberta] = await Promise.all([
      fetchTab("meus_ativos"),
      fetchTab("meus_proventos").catch(() => []),
      fetchTab("cambio").catch(() => []),
      fetchTab("renda_fixa").catch(() => []),
      fetchTab("fixa_aberta").catch(() => []),
    ]);

    const tickerMeta = new Map<string, { moeda: string; corretora: string }>();
    for (const row of transacoes) {
      const tk = tickerOf(row);
      if (!tk || tickerMeta.has(tk)) continue;
      tickerMeta.set(tk, {
        moeda: String(row["moeda"] ?? "BRL").toUpperCase().trim(),
        corretora: String(row["corretora"] ?? "").trim(),
      });
    }
    const tickerList = [...tickerMeta.entries()].map(([ticker, info]) => ({ ticker, ...info }));
    const hist = await fetchHistoricalData(tickerList, 0);
    const todayStr = new Date().toISOString().split("T")[0];
    const dates = hist.dates.filter(d => d <= todayStr);
    if (dates.length === 0) return NextResponse.json({ error: "Sem datas" }, { status: 422 });

    // ffill+bfill (mesma preparação da rota performance/advanced)
    for (const ticker of Object.keys(hist.prices)) {
      const arr = hist.prices[ticker];
      let lastKnown: number | null = null;
      for (let j = 0; j < arr.length; j++) {
        if (arr[j] != null && arr[j]! > 0) lastKnown = arr[j];
        else if (lastKnown != null) arr[j] = lastKnown;
      }
      let firstKnown: number | null = null;
      for (let j = arr.length - 1; j >= 0; j--) {
        if (arr[j] != null && arr[j]! > 0) firstKnown = arr[j];
        else if (firstKnown != null) arr[j] = firstKnown;
      }
    }
    const dateIdxMap = new Map(hist.dates.map((d, i) => [d, i]));
    const alignedPrices: Record<string, (number | null)[]> = {};
    for (const [ticker, arr] of Object.entries(hist.prices)) {
      alignedPrices[ticker] = dates.map(d => {
        const idx = dateIdxMap.get(d);
        return idx != null ? arr[idx] : null;
      });
    }
    const alignedFx = Object.fromEntries(dates.map(d => [d, hist.fxHistory[d]]));

    const lastFx = (() => {
      for (let i = dates.length - 1; i >= 0; i--) {
        const fx = hist.fxHistory[dates[i]];
        if (fx) return fx;
      }
      return { USDBRL: 5.7, EURBRL: 6.4, CADBRL: 4.1, GBPBRL: 7.6 };
    })();
    const cambioMetrics = calcularCambioMetrics(cambioRows, lastFx);
    const pmFx = buildPmFxRates(cambioMetrics);

    const cdiDiario = await fetchCdiDiario(dates[0], dates[dates.length - 1]);
    const { navByDate: rfNavByDate, flowByDate: rfFlowByDate, navFxByDate: rfNavFxByDate } =
      buildRfTimeline(rfTransacoes, fixaAberta, dates, alignedFx, cdiDiario);

    const twr = calcularTWR({ transacoes, proventos, dates, prices: alignedPrices, fxHistory: alignedFx, pmFx, rfNavByDate, rfFlowByDate, rfNavFxByDate });

    // Snapshot canônico com preços da golden source (mesmo goldenQuotes da
    // rota performance/advanced) — independente do Yahoo.
    const goldenQuotes: Record<string, { price: number; change: number; changePercent: number; currency: string; name: string }> = {};
    for (const [ticker, meta] of tickerMeta) {
      const arr = hist.prices[ticker];
      if (!arr) continue;
      let last: number | null = null;
      for (let j = arr.length - 1; j >= 0; j--) {
        if (arr[j] != null && arr[j]! > 0) { last = arr[j]!; break; }
      }
      if (last == null) continue;
      goldenQuotes[ticker] = {
        price: last, change: 0, changePercent: 0,
        currency: getMoedaEfetiva(ticker, meta.moeda, identificarSetor(ticker)),
        name: ticker,
      };
    }
    const snapshot = calcularSnapshot(transacoes, proventos, fixaAberta, goldenQuotes, lastFx, pmFx);

    // ── Lado MOTOR: decompõe GE em RV + RF + income ──────────────────────────
    const lastDate = dates[dates.length - 1];
    const navRF0 = rfNavByDate[dates[0]] ?? 0;
    const navRFfinal = rfNavByDate[lastDate] ?? 0;
    let rfFlowsInWindow = 0;
    for (const [d, v] of Object.entries(rfFlowByDate)) {
      if (d > dates[0]) rfFlowsInWindow += v;
    }
    const engineRfGain = navRFfinal - navRF0 - rfFlowsInWindow;
    const income = twr.ganhoDecomposicao.incomeFromFirst;
    const engineRvGain = twr.ganhoEconomico - engineRfGain - income;

    // ── Lado CANÔNICO ────────────────────────────────────────────────────────
    const realizadoRV = snapshot.retornoTotalRVBRL - snapshot.lucroBRL - snapshot.proventosRVBRL;
    const canonRvGain = snapshot.lucroBRL + realizadoRV;

    // RF canônico — replica composicao/resumo: abertas (atual − custo líquido)
    // + encerradas (venda − compra − imposto, com venda ≥ 95% da compra).
    const rfCostBasis: Record<string, number> = {};
    const rfAgg: Record<string, { compra: number; venda: number; imposto: number; moeda: string; display: string }> = {};
    const isImpostoTipo = (t: string) => /\b(imposto|irrf|ir|tributo|iof)\b/.test(t);
    for (const row of rfTransacoes) {
      const rawTicker = String(row["ticker"] ?? "").trim();
      if (!rawTicker || isCashTicker(rawTicker)) continue;
      if (!isRendaFixaManual(identificarSetor(rawTicker))) continue;
      const key = normTicker(rawTicker);
      const tipo = String(row["tipo"] ?? "").toLowerCase();
      const valor = parseFloat(String(row["valor"] ?? "0").replace(",", "."));
      const ehImposto = isImpostoTipo(tipo);
      if (valor <= 0 && !ehImposto) continue;
      const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
      if (!rfAgg[key]) rfAgg[key] = { compra: 0, venda: 0, imposto: 0, moeda, display: rawTicker };
      const valorBRL = valor * fxToBRL(moeda, lastFx);
      if (tipo.includes("compra") || tipo.includes("aporte")) {
        rfAgg[key].compra += valor;
        rfCostBasis[key] = (rfCostBasis[key] ?? 0) + valorBRL;
      } else if (tipo.includes("venda") || tipo.includes("resgate")) {
        rfAgg[key].venda += valor;
        rfCostBasis[key] = (rfCostBasis[key] ?? 0) - valorBRL;
      } else if (ehImposto) {
        rfAgg[key].imposto += Math.abs(valor);
      }
    }
    for (const key of Object.keys(rfCostBasis)) {
      if (rfCostBasis[key] < 0) rfCostBasis[key] = 0;
    }

    const rfAbertasDetalhe: Array<{ ticker: string; atual: number; custo: number; lucro: number }> = [];
    const abertasKeys = new Set<string>();
    for (const row of fixaAberta) {
      const ticker = String(row["ticker"] ?? row["ativo"] ?? "").trim();
      if (!ticker || isCashTicker(ticker)) continue;
      if (!isRendaFixaManual(identificarSetor(ticker))) continue;
      const valorRaw = parseFloat(String(row["atual"] ?? row["valor_atual"] ?? row["saldo"] ?? row["valor atual"] ?? "0").replace(",", "."));
      if (valorRaw <= 0) continue;
      const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
      const valorBRL = valorRaw * fxToBRL(moeda, lastFx);
      const key = normTicker(ticker);
      abertasKeys.add(key);
      const custo = rfCostBasis[key] ?? 0;
      rfAbertasDetalhe.push({ ticker, atual: Math.round(valorBRL), custo: Math.round(custo), lucro: Math.round(custo > 0 ? valorBRL - custo : 0) });
    }
    const rfEncerradasDetalhe: Array<{ ticker: string; compra: number; venda: number; imposto: number; lucro: number }> = [];
    for (const [key, agg] of Object.entries(rfAgg)) {
      if (abertasKeys.has(key) || agg.venda <= 0) continue;
      if (agg.venda < agg.compra * 0.95) continue;
      const fxF = fxToBRL(agg.moeda, lastFx);
      const lucro = (agg.venda - agg.compra - agg.imposto) * fxF;
      rfEncerradasDetalhe.push({
        ticker: agg.display,
        compra: Math.round(agg.compra * fxF), venda: Math.round(agg.venda * fxF),
        imposto: Math.round(agg.imposto * fxF), lucro: Math.round(lucro),
      });
    }
    const canonRfGain = rfAbertasDetalhe.reduce((s, r) => s + r.lucro, 0)
      + rfEncerradasDetalhe.reduce((s, r) => s + r.lucro, 0);

    const canonProventos = snapshot.totalProventosBRL;
    const canonGE = canonRvGain + canonRfGain + canonProventos;

    // ── Efeitos estruturais conhecidos (quantificados) ───────────────────────
    // A: motor usa preço de MERCADO do dia nos flows; canônico usa preço de
    //    execução. ΔflowsA > 0 → motor viu mais aporte → GE do motor MENOR.
    // B: motor usa FX SPOT do dia nos flows; canônico usa pmDólar no custo.
    //    ΔflowsB > 0 → idem.
    const rvTxs = parseRVTransactions(transacoes).filter(tx => tx.date <= lastDate);
    const idxOf = new Map(dates.map((d, i) => [d, i]));
    const priceAt = (ticker: string, idx: number): number | null => {
      const arr = alignedPrices[ticker];
      if (!arr) return null;
      for (let j = idx; j >= Math.max(0, idx - 5); j--) {
        if (arr[j] != null) return arr[j]!;
      }
      return null;
    };
    let effectMktPrice = 0;
    let effectFxCusto = 0;
    for (const tx of rvTxs) {
      if (tx.bizDate < dates[0] || tx.bizDate > lastDate) continue;
      let idx = idxOf.get(tx.bizDate);
      if (idx == null) {
        idx = dates.findIndex(d => d >= tx.bizDate);
        if (idx < 0) continue;
      }
      const fxSpot = fxToBRL(tx.moeda, alignedFx[dates[idx]] ?? lastFx);
      const fxPm = fxToBRL(tx.moeda, pmFx);
      const mkt = priceAt(tx.ticker, idx) ?? tx.preco;
      const sign = tx.tipo === "Compra" ? 1 : -1;
      // A: mesmo FX (spot), preço mercado vs execução
      effectMktPrice += sign * tx.quantidade * (mkt - tx.preco) * fxSpot;
      // B: mesmo preço (execução), FX spot vs pmDólar
      effectFxCusto += sign * tx.quantidade * tx.preco * (fxSpot - fxPm);
    }

    const diff = twr.ganhoEconomico - canonGE;
    return NextResponse.json({
      grid: { primeiraData: dates[0], ultimaData: lastDate, dias: dates.length },
      motor: {
        ganhoEconomico: Math.round(twr.ganhoEconomico),
        rv: Math.round(engineRvGain),
        rf: Math.round(engineRfGain),
        income: Math.round(income),
        navFinal: Math.round(twr.navFinal),
        nav0: Math.round(twr.ganhoDecomposicao.navInicial),
        navRF0: Math.round(navRF0),
        navRFfinal: Math.round(navRFfinal),
        rfFlowsInWindow: Math.round(rfFlowsInWindow),
        twrTotal: +(twr.twrTotal * 100).toFixed(2),
      },
      canonico: {
        ganhoCanonical: Math.round(canonGE),
        rv: Math.round(canonRvGain),
        rvNaoRealizado: Math.round(snapshot.lucroBRL),
        rvRealizado: Math.round(realizadoRV),
        rf: Math.round(canonRfGain),
        proventos: Math.round(canonProventos),
        proventosRV: Math.round(snapshot.proventosRVBRL),
      },
      divergencia: {
        absoluta: Math.round(diff),
        pct: twr.ganhoEconomico !== 0 ? +((Math.abs(diff) / Math.abs(twr.ganhoEconomico)) * 100).toFixed(1) : null,
        porComponente: {
          rv: Math.round(engineRvGain - canonRvGain),
          rf: Math.round(engineRfGain - canonRfGain),
          proventosVsIncome: Math.round(income - canonProventos),
        },
        efeitosConhecidos: {
          // Δflow positivo = motor contou MAIS aporte = GE do motor MENOR.
          // O impacto no GE é o valor com sinal trocado.
          flowsPrecoMercadoVsExecucao: Math.round(-effectMktPrice),
          flowsFxSpotVsPmDolar: Math.round(-effectFxCusto),
        },
      },
      rfDetalhe: { abertas: rfAbertasDetalhe, encerradas: rfEncerradasDetalhe },
      // NAV final do motor por ticker RF — roda buildRfTimeline isolado por
      // ticker para apontar resíduos (posição encerrada que não zerou no NAV).
      rfNavFinalPorTicker: (() => {
        const out: Array<{ ticker: string; navFinal: number; flowsNet: number; txs: Array<{ date: string; tipo: string; valor: number }> }> = [];
        const tickersRf = new Set<string>();
        for (const row of [...rfTransacoes, ...fixaAberta]) {
          const t = normTicker(String(row["ticker"] ?? row["ativo"] ?? ""));
          if (t && !isCashTicker(t) && isRendaFixaManual(identificarSetor(t))) tickersRf.add(t);
        }
        for (const t of tickersRf) {
          const txRows = rfTransacoes.filter(r => normTicker(String(r["ticker"] ?? r["ativo"] ?? "")) === t);
          const faRows = fixaAberta.filter(r => normTicker(String(r["ticker"] ?? r["ativo"] ?? "")) === t);
          const { navByDate, flowByDate } = buildRfTimeline(txRows, faRows, dates, alignedFx, cdiDiario);
          const navFinal = navByDate[lastDate] ?? 0;
          const flowsNet = Object.values(flowByDate).reduce((s, v) => s + v, 0);
          if (Math.abs(navFinal) < 1 && Math.abs(flowsNet) < 1) continue;
          out.push({
            ticker: t,
            navFinal: Math.round(navFinal),
            flowsNet: Math.round(flowsNet),
            txs: txRows.map(r => ({
              date: String(r["compra"] ?? r["data"] ?? ""),
              tipo: String(r["tipo"] ?? ""),
              valor: parseFloat(String(r["valor"] ?? "0").replace(",", ".")),
            })),
          });
        }
        return out.sort((a, b) => b.navFinal - a.navFinal);
      })(),
      diagnostics: twr.diagnostics,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

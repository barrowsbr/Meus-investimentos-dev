import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { fetchFixaAbertaComIbkr } from "@/lib/ibkr-cash";
import { fetchHistoricalData } from "@/lib/market-history";
import { calcularTWR, buildRfTimeline } from "@/lib/twr-engine";
import { calcularCambioMetrics, buildPmFxRates } from "@/lib/cambio";
import { tickerBase } from "@/lib/portfolio";
import { identificarSetor, isRendaFixa, isRendaFixaPrecificavel } from "@/lib/sectors";
import { fetchCdiDiario } from "@/lib/bcb";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function tickerOf(row: Record<string, unknown>): string {
  return String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? "").toUpperCase().trim();
}
function today(): string { return new Date().toISOString().split("T")[0]; }
const isYmd = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Painel "carteira nesta data": devolve a composição da carteira EXATAMENTE como
// o motor TWR a enxerga em cada data pedida (mesma fonte do gráfico — auditável).
// Aceita 1 ou 2 datas (`datas=YYYY-MM-DD[,YYYY-MM-DD]`) para o modo comparar.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const datasRaw = (searchParams.get("datas") ?? searchParams.get("date") ?? "")
    .split(",").map(s => s.trim()).filter(isYmd).slice(0, 2);
  if (datasRaw.length === 0) {
    return NextResponse.json({ error: "Parâmetro 'datas' ausente ou inválido (YYYY-MM-DD)" }, { status: 400 });
  }

  // Mesmos filtros do gráfico (a carteira mostrada tem que ser a mesma lente).
  const classe = (searchParams.get("classe") ?? "tudo").toLowerCase();
  const setorFiltro = searchParams.get("setor") ?? "";
  const setoresFiltro = new Set(setorFiltro.split(",").map(s => s.trim()).filter(Boolean));
  const tickerFiltro = (searchParams.get("ticker") ?? "").toUpperCase().trim();
  const corretoraFiltro = (searchParams.get("corretora") ?? "").trim();

  try {
    const store = getDataStore();
    const [transacoes, proventos, cambioRows, rfTransacoes, fixaAberta] = await Promise.all([
      store.fetchTab("meus_ativos"),
      store.fetchTab("meus_proventos").catch(() => []),
      store.fetchTab("cambio").catch(() => []),
      store.fetchTab("renda_fixa").catch(() => []),
      fetchFixaAbertaComIbkr(store).catch(() => []),
    ]);
    if (transacoes.length === 0) {
      return NextResponse.json({ error: "Sem transações" }, { status: 422 });
    }

    // Filtro por corretora (mesma regra da rota advanced).
    const transacoesCorretora = corretoraFiltro
      ? transacoes.filter(r => String(r["corretora"] ?? "").trim().toLowerCase() === corretoraFiltro.toLowerCase())
      : transacoes;

    const tickerMeta = new Map<string, { moeda: string; corretora: string }>();
    for (const row of transacoesCorretora) {
      const ticker = tickerOf(row);
      if (!ticker) continue;
      if (!tickerMeta.has(ticker)) {
        tickerMeta.set(ticker, {
          moeda: String(row["moeda"] ?? "BRL").toUpperCase().trim(),
          corretora: String(row["corretora"] ?? "").trim(),
        });
      }
    }
    const tickerList = [...tickerMeta.entries()].map(([ticker, info]) => ({ ticker, ...info }));

    // Histórico completo (lookback=0) — a grade cobre qualquer data pedida.
    const hist = await fetchHistoricalData(tickerList, 0);
    if (hist.dates.length === 0) {
      return NextResponse.json({ error: "Sem dados históricos" }, { status: 422 });
    }
    const dates = hist.dates.filter(d => d <= today());
    if (dates.length === 0) {
      return NextResponse.json({ error: "Janela sem dados" }, { status: 422 });
    }

    // Snap: cada data pedida vira a última data de grade ≤ pedida (dia útil real).
    const gridSet = new Set(dates);
    const snapped = new Map<string, string>(); // pedida → grade
    for (const req of datasRaw) {
      if (gridSet.has(req)) { snapped.set(req, req); continue; }
      let best = "";
      for (const d of dates) { if (d <= req && d > best) best = d; }
      if (best) snapped.set(req, best);
    }
    const captureDates = [...new Set(snapped.values())];
    if (captureDates.length === 0) {
      return NextResponse.json({ error: "Nenhuma data cai dentro do histórico" }, { status: 422 });
    }

    // Alinha preços/FX à grade (ffill igual à rota advanced para herdar preço
    // anterior à data quando a cotação do dia falta).
    for (const ticker of Object.keys(hist.prices)) {
      const arr = hist.prices[ticker];
      let lastKnown: number | null = null;
      for (let j = 0; j < arr.length; j++) {
        if (arr[j] != null && arr[j]! > 0) lastKnown = arr[j];
        else if (lastKnown != null) arr[j] = lastKnown;
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

    const lastFx = hist.fxHistory[dates[dates.length - 1]] ?? { USDBRL: 5.7, EURBRL: 6.4, CADBRL: 4.1, GBPBRL: 7.6 };
    const cambioMetrics = calcularCambioMetrics(cambioRows, lastFx);
    const pmFx = buildPmFxRates(cambioMetrics);

    // ── Filtros de classe/setor/ticker (idênticos à rota advanced) ──
    function keepRvTicker(tk: string): boolean {
      if (tickerFiltro && tk !== tickerFiltro) return false;
      const setor = identificarSetor(tk);
      if (classe === "rf") return isRendaFixaPrecificavel(setor);
      if (isRendaFixa(setor)) return false;
      if (setoresFiltro.size > 0) return setoresFiltro.has(setor);
      return true;
    }
    const includeRF = (classe === "tudo" || classe === "rf") && !tickerFiltro;
    const filtroAtivo = classe !== "tudo" || setoresFiltro.size > 0 || tickerFiltro !== "" || !!corretoraFiltro;
    const transacoesF = filtroAtivo ? transacoesCorretora.filter(r => keepRvTicker(tickerOf(r))) : transacoesCorretora;
    const keptTickers = new Set(transacoesF.map(r => tickerOf(r)));
    const keptBase = new Set([...keptTickers].map(tickerBase));
    const proventosF = filtroAtivo
      ? proventos.filter(r => keptBase.has(tickerBase(String(r["ticker"] ?? ""))))
      : proventos;
    const fixaAbertaF = includeRF
      ? (corretoraFiltro
          ? fixaAberta.filter(r => String(r["corretora"] ?? "").trim().toLowerCase() === corretoraFiltro.toLowerCase())
          : fixaAberta)
      : [];
    const rfTransacoesF = includeRF
      ? (corretoraFiltro
          ? rfTransacoes.filter(r => String(r["corretora"] ?? "").trim().toLowerCase() === corretoraFiltro.toLowerCase())
          : rfTransacoes)
      : [];

    const cdiDiario = await fetchCdiDiario(dates[0], dates[dates.length - 1]);
    const { navByDate: rfNavByDate, flowByDate: rfFlowByDate, navFxByDate: rfNavFxByDate, costBasisAtual: rfCostBasis } = includeRF
      ? buildRfTimeline(rfTransacoesF, fixaAbertaF, dates, alignedFx, cdiDiario)
      : { navByDate: {}, flowByDate: {}, navFxByDate: {}, costBasisAtual: 0 };

    const twr = calcularTWR({
      transacoes: transacoesF, proventos: proventosF, dates,
      prices: alignedPrices, fxHistory: alignedFx, pmFx,
      rfNavByDate, rfFlowByDate, rfNavFxByDate, rfCostBasis,
      capturePositions: captureDates,
    });

    const snaps = twr.positionSnapshots ?? {};
    // Uma entrada por DATA PEDIDA (na ordem), apontando para a data de grade real.
    const carteiras = datasRaw.map(req => {
      const grid = snapped.get(req);
      const snap = grid ? snaps[grid] : undefined;
      if (!snap) return { pedida: req, encontrada: null, positions: [], setores: [] };
      const total = snap.navTotal || 1;
      const positions = snap.positions.map(p => ({
        ...p,
        pesoPct: (p.valorBRL / total) * 100,
        gainDiaPct: p.valorBRL - p.gainDiaBRL !== 0 ? (p.gainDiaBRL / (p.valorBRL - p.gainDiaBRL)) * 100 : 0,
      }));
      // Composição por setor.
      const bySetor = new Map<string, number>();
      for (const p of snap.positions) bySetor.set(p.setor, (bySetor.get(p.setor) ?? 0) + p.valorBRL);
      const setores = [...bySetor.entries()]
        .map(([setor, valorBRL]) => ({ setor, valorBRL, pesoPct: (valorBRL / total) * 100 }))
        .sort((a, b) => b.valorBRL - a.valorBRL);
      return {
        pedida: req,
        encontrada: snap.date,
        navTotal: snap.navTotal,
        navRV: snap.navRV,
        navRF: snap.navRF,
        positions,
        setores,
      };
    });

    return NextResponse.json(
      { carteiras, errors: hist.errors },
      { headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { fetchFixaAbertaComIbkr, loadIbkrCashBalances } from "@/lib/ibkr-cash";
import { calcularSnapshot } from "@/lib/portfolio";
import { fetchCotacoes, fxToBRL } from "@/lib/cotacoes";
import { calcularCambioMetrics, buildPmFxRates, buildFxDateMap } from "@/lib/cambio";
import { buildIbkrOverview } from "@/lib/ibkr-overview";
import { dedupTk } from "@/lib/broker-import";
import { isRendaVariavel } from "@/lib/sectors";
import { toNumber } from "@/lib/format";

// Rota própria (fora do catch-all [...path]): baixa o extrato Flex (~10-40s),
// então precisa do maxDuration 60 REAL.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Reconciliação de PATRIMÔNIO: IBKR real × canônico (FIFO) ──────────────────
// Depois de somar o caixa da IBKR ao canônico, os baldes Brasil e Cripto batem
// entre a Home e o canônico (vêm do MESMO snapshot). A diferença que sobra está
// no book INTERNACIONAL: a Home o valoriza pelas posições REAIS da IBKR
// (OpenPosition, preço da IBKR); o canônico, pelo FIFO de `meus_ativos` (preço
// Yahoo). Esta rota casa ticker a ticker e decompõe a diferença em:
//   • quantidade — FIFO ≠ holding real (trade faltando/errado no ledger)
//   • preço      — mesma qtd, preço IBKR (extrato) × Yahoo (ao vivo)
// para apontar EXATAMENTE de onde vêm os "alguns milhares".

export async function GET() {
  try {
    const store = getDataStore();
    const [transacoes, proventos, fixaAberta, cambioRows, ptaxRows] = await Promise.all([
      store.fetchTab("meus_ativos"),
      store.fetchTab("meus_proventos"),
      fetchFixaAbertaComIbkr(store),
      store.fetchTab("cambio").catch(() => []),
      store.fetchTab("p_tax").catch(() => []),
    ]);

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

    const cotacoes = await fetchCotacoes(tickers);
    const fxAtual = cotacoes.fx;
    const cambio = calcularCambioMetrics(cambioRows, fxAtual);
    const fxCusto = buildPmFxRates(cambio);
    const fxByDate = buildFxDateMap(ptaxRows, cambio.historico);
    const snapshot = calcularSnapshot(transacoes, proventos, fixaAberta, cotacoes.quotes, fxAtual, fxCusto, fxByDate);

    // ── Lado CANÔNICO: posições internacionais (RV, moeda ≠ BRL, não-cripto) ──
    interface Lado { qty: number; precoNativo: number | null; moeda: string; valorBRL: number }
    const canon = new Map<string, Lado>();
    for (const p of snapshot.positions) {
      if (!isRendaVariavel(p.setor)) continue;
      if ((p.moeda ?? "BRL") === "BRL" || p.setor === "Cripto") continue;
      if ((p.quantidade ?? 0) <= 0) continue;
      canon.set(dedupTk(p.ticker), {
        qty: p.quantidade,
        precoNativo: p.precoAtual,
        moeda: p.moeda,
        valorBRL: p.valorAtualBRL,
      });
    }

    // ── Lado IBKR: OpenPositions reais (não-forex) ───────────────────────────
    let ibkrErro: string | null = null;
    const ibkr = new Map<string, Lado>();
    let ibkrCaixaBRL = 0;
    try {
      const ov = await buildIbkrOverview();
      for (const p of ov.positions) {
        if ((p.quantidade ?? 0) === 0) continue;
        ibkr.set(dedupTk(p.ticker), {
          qty: p.quantidade,
          precoNativo: p.markPrice,
          moeda: p.moeda,
          valorBRL: p.marketValueBRL ?? 0,
        });
      }
      ibkrCaixaBRL = ov.kpis.caixaBRL ?? 0;
    } catch (e) {
      ibkrErro = e instanceof Error ? e.message : String(e);
    }

    // ── Casa os dois lados por ticker base ───────────────────────────────────
    const bases = new Set<string>([...canon.keys(), ...ibkr.keys()]);
    const linhas: Array<Record<string, unknown>> = [];
    let deltaQtd = 0;   // efeito quantidade (ledger ≠ real)
    let deltaPreco = 0; // efeito preço (extrato IBKR × Yahoo)
    let deltaTotal = 0;

    for (const base of bases) {
      const c = canon.get(base);
      const k = ibkr.get(base);
      const fx = fxToBRL((c ?? k)!.moeda, fxAtual);
      const qtyC = c?.qty ?? 0;
      const qtyK = k?.qty ?? 0;
      const precoC = c?.precoNativo ?? k?.precoNativo ?? 0;
      const precoK = k?.precoNativo ?? c?.precoNativo ?? 0;
      const valC = c?.valorBRL ?? 0;
      const valK = k?.valorBRL ?? 0;

      // Decomposição da diferença (IBKR − canônico) em quantidade × preço.
      const efeitoQtd = (qtyK - qtyC) * precoC * fx;
      const efeitoPreco = qtyC * (precoK - precoC) * fx;
      deltaQtd += efeitoQtd;
      deltaPreco += efeitoPreco;
      deltaTotal += valK - valC;

      const causa = Math.abs(qtyK - qtyC) > 1e-6
        ? (!c ? "só na IBKR (trade faltando no ledger)" : !k ? "só no ledger (não está na IBKR)" : "quantidade difere")
        : Math.abs(valK - valC) >= 1 ? "preço (timing IBKR × Yahoo)" : "ok";

      if (Math.abs(valK - valC) >= 1 || Math.abs(qtyK - qtyC) > 1e-6) {
        linhas.push({
          ticker: base,
          moeda: (c ?? k)!.moeda,
          qtd_canonico: qtyC,
          qtd_ibkr: qtyK,
          preco_canonico: precoC ? Math.round(precoC * 100) / 100 : null,
          preco_ibkr: precoK ? Math.round(precoK * 100) / 100 : null,
          valor_canonico_brl: Math.round(valC),
          valor_ibkr_brl: Math.round(valK),
          delta_brl: Math.round(valK - valC),
          causa,
        });
      }
    }
    linhas.sort((a, b) => Math.abs(Number(b.delta_brl)) - Math.abs(Number(a.delta_brl)));

    // ── Caixa: IBKR × o que já entrou no canônico via fixa_aberta ────────────
    const ibkrCash = await loadIbkrCashBalances();
    let caixaFixaBRL = 0;
    for (const row of fixaAberta) {
      const ticker = String(row["ticker"] ?? row["ativo"] ?? "").toUpperCase();
      if (!/CAIXA|SALDO|CASH|RESERVA|DISPONIVEL/.test(ticker)) continue;
      const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
      if (moeda === "BRL") continue; // caixa BRL não é da IBKR
      const valor = toNumber(row["atual"] ?? row["valor_atual"] ?? row["saldo"] ?? row["valor atual"]) ?? 0;
      caixaFixaBRL += valor * fxToBRL(moeda, fxAtual);
    }

    return NextResponse.json(
      {
        resumo: {
          patrimonio_canonico_brl: Math.round(snapshot.totalPatrimonioBRL),
          diferenca_internacional_brl: Math.round(deltaTotal),
          por_causa: {
            quantidade_brl: Math.round(deltaQtd),
            preco_brl: Math.round(deltaPreco),
          },
          nota: "diferenca_internacional_brl = quanto a IBKR (holdings reais) supera/fica abaixo do FIFO canônico. Positivo = canônico está SUBcontando.",
        },
        caixa: {
          ibkr_flex_brl: Math.round(ibkrCash.reduce((s, c) => s + c.saldo * fxToBRL(c.moeda, fxAtual), 0)),
          ja_no_canonico_brl: Math.round(caixaFixaBRL),
          ibkr_caixa_overview_brl: Math.round(ibkrCaixaBRL),
        },
        linhas,
        ibkr_erro: ibkrErro,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

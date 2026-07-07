import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { calcularSnapshot } from "@/lib/portfolio";
import { fetchCotacoes, fxToBRL } from "@/lib/cotacoes";
import { calcularCambioMetrics, buildPmFxRates, buildFxDateMap } from "@/lib/cambio";
import { buildIbkrOverview } from "@/lib/ibkr-overview";
import { isRendaFixa, getMoedaExposicao } from "@/lib/sectors";
import { toNumber } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Auditoria do Patrimônio do DIA (Home) — decomposição item a item ─────────
// Reproduz EXATAMENTE as parcelas que a Home soma no rodapé do painel
// (IBKR real + Brasil + Cripto + RF/Caixa) e devolve cada item que entra em
// cada balde, para localizar divergências. Não substitui o snapshot canônico.

type Row = Record<string, unknown>;

function getVal(row: Row, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  return undefined;
}

export async function GET() {
  try {
    const store = getDataStore();
    const [transacoes, proventos, fixaAberta, cambioRows, ptaxRows] = await Promise.all([
      store.fetchTab("meus_ativos"),
      store.fetchTab("meus_proventos"),
      store.fetchTab("fixa_aberta"),
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
    const usdbrl = fxAtual.USDBRL;
    const cambio = calcularCambioMetrics(cambioRows, fxAtual);
    const fxCusto = buildPmFxRates(cambio);
    const fxByDate = buildFxDateMap(ptaxRows, cambio.historico);
    const snapshot = calcularSnapshot(transacoes, proventos, fixaAberta, cotacoes.quotes, fxAtual, fxCusto, fxByDate);

    // ── Balde Brasil — MESMO filtro da faixa "Brasil" da Home ────────────────
    const brasilItens: Row[] = [];
    const criptoItens: Row[] = [];
    const rfCaixaPosicoes: Row[] = [];
    let brasilBRL = 0;
    let criptoBRL = 0;
    let expoBRLPosicoes = 0;

    for (const p of snapshot.positions) {
      const moeda = p.moeda ?? "BRL";
      const emBrasil = moeda === "BRL" && !isRendaFixa(p.setor ?? "") && p.setor !== "Cripto" && (p.quantidade ?? 0) > 0;
      const moedaExpo = getMoedaExposicao(p.setor, moeda);
      const naExpoBRL = moedaExpo === "BRL" && p.valorAtualBRL >= 1;
      const naExpoCripto = moedaExpo === "Cripto" && p.valorAtualBRL >= 1;

      const item: Row = {
        ticker: p.ticker,
        setor: p.setor,
        moeda,
        quantidade: p.quantidade,
        precoAtual: p.precoAtual,
        valorAtualBRL: Math.round(p.valorAtualBRL * 100) / 100,
        ...(emBrasil && p.valorAtualBRL < 1 ? { alerta: "SEM COTAÇÃO — conta como ativo mas soma R$ 0" } : {}),
      };

      if (emBrasil) {
        brasilItens.push(item);
        brasilBRL += p.valorAtualBRL;
      }
      if (naExpoCripto) {
        criptoItens.push(item);
        criptoBRL += p.valorAtualBRL;
      }
      if (naExpoBRL) {
        expoBRLPosicoes += p.valorAtualBRL;
        // BRL mas fora do balde Brasil ⇒ cai em RF + Caixa (é o "resto" da expo BRL)
        if (!emBrasil) rfCaixaPosicoes.push({ ...item, motivo: isRendaFixa(p.setor ?? "") ? `setor "${p.setor}" é RF` : (p.quantidade ?? 0) <= 0 ? "quantidade ≤ 0" : "?" });
      }
    }

    // ── fixa_aberta — RF manual + caixa (entra na expo por moeda) ────────────
    const fixaItens: Row[] = [];
    const foraDaSoma: Row[] = [];
    let fixaBRL = 0;
    for (const row of fixaAberta) {
      const valor = toNumber(getVal(row, "atual", "valor_atual", "saldo", "valor atual")) ?? 0;
      if (valor <= 0) continue;
      const moeda = String(getVal(row, "moeda") ?? "BRL").toUpperCase().trim() || "BRL";
      const valorBRL = valor * fxToBRL(moeda, fxAtual);
      if (valorBRL < 1) continue;
      const item: Row = {
        ticker: String(getVal(row, "ticker", "ativo") ?? "?"),
        tipo: String(getVal(row, "tipo") ?? ""),
        moeda,
        valor,
        valorBRL: Math.round(valorBRL * 100) / 100,
      };
      if (moeda === "BRL") {
        fixaItens.push(item);
        fixaBRL += valorBRL;
      } else {
        // Não-BRL: entra na exposição da própria moeda — a fórmula da Home assume
        // que moeda forte está na IBKR; se houver caixa USD FORA da IBKR, aparece
        // aqui como possível dupla-contagem/omissão.
        foraDaSoma.push({ ...item, motivo: `moeda ${moeda} — fora da parcela RF+Caixa (assumida dentro da IBKR)` });
      }
    }

    const expoBRLTotal = expoBRLPosicoes + fixaBRL; // = exposicaoCambial.BRL do snapshot
    const rfCaixaBRL = Math.max(0, expoBRLTotal - brasilBRL);

    // ── IBKR — mesma fonte da faixa (posições + caixa, US$ × dólar de agora) ─
    let ibkr: Row = { ok: false };
    try {
      const ov = await buildIbkrOverview();
      const usd = ov.kpis.patrimonioTotalUSD ?? 0;
      ibkr = { ok: usd > 0, patrimonioTotalUSD: usd, patrimonioTotalBRL: Math.round(usd * usdbrl * 100) / 100 };
    } catch (e) {
      ibkr = { ok: false, erro: e instanceof Error ? e.message : String(e) };
    }

    const ibkrBRL = typeof ibkr.patrimonioTotalBRL === "number" ? ibkr.patrimonioTotalBRL : 0;
    const total = ibkrBRL + brasilBRL + criptoBRL + rfCaixaBRL;

    return NextResponse.json(
      {
        usdbrl,
        partes: {
          ibkr_brl: ibkrBRL,
          brasil_brl: Math.round(brasilBRL * 100) / 100,
          cripto_brl: Math.round(criptoBRL * 100) / 100,
          rf_caixa_brl: Math.round(rfCaixaBRL * 100) / 100,
          total_brl: Math.round(total * 100) / 100,
        },
        conferencia: {
          expo_brl_snapshot: Math.round((snapshot.exposicaoCambial?.["BRL"] ?? 0) * 100) / 100,
          expo_brl_recalculada: Math.round(expoBRLTotal * 100) / 100,
          expo_cripto_snapshot: Math.round((snapshot.exposicaoCambial?.["Cripto"] ?? 0) * 100) / 100,
        },
        ibkr,
        brasil_itens: brasilItens,
        cripto_itens: criptoItens,
        rf_caixa_itens: [
          ...rfCaixaPosicoes.map((i) => ({ origem: "meus_ativos", ...i })),
          ...fixaItens.map((i) => ({ origem: "fixa_aberta", ...i })),
        ],
        fora_da_soma: foraDaSoma,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

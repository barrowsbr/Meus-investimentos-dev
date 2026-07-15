// ── Patrimônio do dia da Home — cálculo ÚNICO (fonte única) ──────────────────
// Antes, três rotas (/api/patrimonio-dia, /api/patrimonio-dia/detalhe e a strip
// da IBKR) refaziam o MESMO trabalho: ler a planilha, rodar calcularSnapshot,
// buscar cotações e GERAR o extrato Flex da IBKR (o passo lento, até ~38s). Em
// cold start isso virava 3-4 lambdas frios gerando o Flex em paralelo.
//
// Este módulo faz tudo UMA vez e devolve os três payloads que a Home consome:
//   - overview:      buildIbkrOverview completo (faixa IBKR)
//   - patrimonioDia: quadro "Patrimônio do dia"
//   - detalhe:       auditoria das parcelas (mesma decomposição de antes)
//
// As rotas /api/home, /api/patrimonio-dia e /api/patrimonio-dia/detalhe todas
// delegam para cá — a matemática vive num lugar só (regra FONTE ÚNICA).

import { getDataStore } from "./data-store";
import { fetchFixaAbertaComIbkr } from "./ibkr-cash";
import { calcularSnapshot, type PortfolioSnapshot } from "./portfolio";
import { fetchCotacoes, fxToBRL } from "./cotacoes";
import { calcularCambioMetrics, buildPmFxRates, buildFxDateMap } from "./cambio";
import { buildIbkrOverview, type IbkrOverview } from "./ibkr-overview";
import { isRendaFixa, getMoedaExposicao } from "./sectors";
import { toNumber } from "./format";
import { MARGIN_TAB, parseMarginRows } from "./margin";

type Row = Record<string, unknown>;

function getVal(row: Row, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  return undefined;
}

export interface PatrimonioDiaPayload {
  // "Valor disponível total (net)": IBKR já líquido da margem (NLV) + BR +
  // Cripto − dívida de margem fora da IBKR. É o que a Home mostra e o
  // histórico patrimonial grava.
  patrimonio_dia_brl: number;
  patrimonio_dia_usd: number | null;
  usdbrl: number;
  ibkr_ok: boolean;
  breakdown: { ibkr_brl: number; ibkr_usd: number; br_brl: number; cripto_brl: number; divida_fora_ibkr_brl: number };
}

export interface DetalhePayload {
  usdbrl: number;
  partes: { ibkr_brl: number; brasil_brl: number; cripto_brl: number; rf_caixa_brl: number; divida_fora_ibkr_brl: number; total_brl: number };
  conferencia: { expo_brl_snapshot: number; expo_brl_recalculada: number; expo_cripto_snapshot: number };
  ibkr: Row;
  brasil_itens: Row[];
  cripto_itens: Row[];
  rf_caixa_itens: Row[];
  ibkr_caixa_conciliado: Row[];
  fora_da_soma: Row[];
}

export interface HomePatrimonio {
  overview: IbkrOverview | null;
  overviewErro: string | null;
  patrimonioDia: PatrimonioDiaPayload;
  detalhe: DetalhePayload;
  snapshot: PortfolioSnapshot;
}

export async function computeHomePatrimonio(opts: { skipIbkr?: boolean } = {}): Promise<HomePatrimonio> {
  const store = getDataStore();
  const [transacoes, proventos, fixaAberta, cambioRows, ptaxRows, marginRows] = await Promise.all([
    store.fetchTab("meus_ativos"),
    store.fetchTab("meus_proventos"),
    fetchFixaAbertaComIbkr(store),
    store.fetchTab("cambio").catch(() => []),
    store.fetchTab("p_tax").catch(() => []),
    store.fetchTab(MARGIN_TAB).catch(() => []),
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

  // Cotações do snapshot e o extrato Flex da IBKR em paralelo — o Flex é o passo
  // lento, então não esperamos ele terminar para começar as cotações. Contas
  // extras (esposa) NÃO veem o book do dono: skipIbkr pula a geração do Flex.
  const ibkrPromise: Promise<{ ov: IbkrOverview | null; erro: string | null }> = opts.skipIbkr
    ? Promise.resolve({ ov: null, erro: "IBKR é da conta principal" })
    : buildIbkrOverview().then(
        (ov) => ({ ov, erro: null as string | null }),
        (e) => ({ ov: null as IbkrOverview | null, erro: e instanceof Error ? e.message : String(e) }),
      );
  const [cotacoes, ibkrResult] = await Promise.all([fetchCotacoes(tickers), ibkrPromise]);

  const fxAtual = cotacoes.fx;
  const usdbrl = fxAtual.USDBRL;
  const cambio = calcularCambioMetrics(cambioRows, fxAtual);
  const fxCusto = buildPmFxRates(cambio);
  const fxByDate = buildFxDateMap(ptaxRows, cambio.historico);
  const snapshot = calcularSnapshot(transacoes, proventos, fixaAberta, cotacoes.quotes, fxAtual, fxCusto, fxByDate);

  const overview = ibkrResult.ov;
  const overviewErro = ibkrResult.erro;

  // ── Baldes Brasil / Cripto / RF+Caixa (mesma decomposição do /detalhe) ──────
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
      if (!emBrasil) rfCaixaPosicoes.push({ ...item, motivo: isRendaFixa(p.setor ?? "") ? `setor "${p.setor}" é RF` : (p.quantidade ?? 0) <= 0 ? "quantidade ≤ 0" : "?" });
    }
  }

  // ── fixa_aberta — RF manual + caixa ─────────────────────────────────────────
  const fixaItens: Row[] = [];
  const foraDaSoma: Row[] = [];
  const ibkrCaixaConciliado: Row[] = [];
  let fixaBRL = 0;
  for (const row of fixaAberta) {
    const valor = toNumber(getVal(row, "atual", "valor_atual", "saldo", "valor atual")) ?? 0;
    if (valor <= 0) continue;
    const moeda = String(getVal(row, "moeda") ?? "BRL").toUpperCase().trim() || "BRL";
    const valorBRL = valor * fxToBRL(moeda, fxAtual);
    if (valorBRL < 1) continue;
    const tk = String(getVal(row, "ticker", "ativo") ?? "?");
    const corr = String(getVal(row, "corretora") ?? "").toUpperCase();
    const item: Row = { ticker: tk, tipo: String(getVal(row, "tipo") ?? ""), moeda, valor, valorBRL: Math.round(valorBRL * 100) / 100 };
    if (moeda === "BRL") {
      fixaItens.push(item);
      fixaBRL += valorBRL;
    } else if (corr.includes("IBKR") || tk.toUpperCase().includes("IBKR")) {
      ibkrCaixaConciliado.push({ ...item, motivo: "caixa em moeda forte — já contabilizado dentro da IBKR" });
    } else {
      foraDaSoma.push({ ...item, motivo: `moeda ${moeda} — caixa fora da IBKR; confira se deveria entrar na soma` });
    }
  }

  const expoBRLTotal = expoBRLPosicoes + fixaBRL;
  const rfCaixaBRL = Math.max(0, expoBRLTotal - brasilBRL);

  // ── IBKR — a partir do overview já calculado (sem gerar o Flex de novo) ──────
  let ibkrDetalhe: Row = { ok: false };
  let ibkrUSD = 0;
  let ibkrBRL = 0;
  if (overview) {
    const usd = overview.kpis.patrimonioTotalUSD ?? 0; // já LÍQUIDO da margem (NLV)
    const caixaBRL = overview.kpis.caixaBRL ?? 0;
    const margemBRL = overview.kpis.margemBRL ?? 0;
    const posBRL = overview.kpis.patrimonioBRL ?? 0;
    ibkrUSD = usd;
    ibkrBRL = Math.round(usd * usdbrl * 100) / 100;
    ibkrDetalhe = {
      ok: usd > 0,
      patrimonioTotalUSD: usd,
      patrimonioTotalBRL: ibkrBRL,
      posicoes_brl: Math.round(posBRL * 100) / 100,
      caixa_brl: Math.round(caixaBRL * 100) / 100,
      ...(margemBRL > 0 ? { margem_brl: Math.round(margemBRL * 100) / 100, nota: "dívida de margem ABATIDA do total (Net Liquidation Value)" } : {}),
    };
  } else {
    ibkrDetalhe = { ok: false, erro: overviewErro ?? "IBKR indisponível" };
  }

  const brBRL = snapshot.exposicaoCambial?.["BRL"] ?? 0;
  const criptoExpoBRL = snapshot.exposicaoCambial?.["Cripto"] ?? 0;

  // Dívida de margem FORA da IBKR (aba alavancagem, outras corretoras).
  // A da IBKR já está abatida dentro do ibkrBRL (NLV do overview) — abater de
  // novo aqui duplicaria; por isso o filtro por corretora.
  const dividaForaIbkrBRL = parseMarginRows(marginRows)
    .filter((e) => e.status === "aberta" && e.corretora.toUpperCase() !== "IBKR")
    .reduce((s, e) => s + e.valor * fxToBRL(e.moeda, fxAtual), 0);

  // "Valor disponível total (net)" = IBKR (NLV) + BRL (expo) + Cripto (expo)
  // − margem fora da IBKR. É o número do card da Home e do histórico.
  const patrimonioDiaBRL = ibkrBRL + brBRL + criptoExpoBRL - dividaForaIbkrBRL;

  const patrimonioDia: PatrimonioDiaPayload = {
    patrimonio_dia_brl: patrimonioDiaBRL,
    patrimonio_dia_usd: usdbrl > 0 ? patrimonioDiaBRL / usdbrl : null,
    usdbrl,
    ibkr_ok: ibkrUSD > 0,
    breakdown: { ibkr_brl: ibkrBRL, ibkr_usd: ibkrUSD, br_brl: brBRL, cripto_brl: criptoExpoBRL, divida_fora_ibkr_brl: Math.round(dividaForaIbkrBRL * 100) / 100 },
  };

  const totalDetalhe = ibkrBRL + brasilBRL + criptoBRL + rfCaixaBRL - dividaForaIbkrBRL;
  const detalhe: DetalhePayload = {
    usdbrl,
    partes: {
      ibkr_brl: ibkrBRL,
      brasil_brl: Math.round(brasilBRL * 100) / 100,
      cripto_brl: Math.round(criptoBRL * 100) / 100,
      rf_caixa_brl: Math.round(rfCaixaBRL * 100) / 100,
      divida_fora_ibkr_brl: Math.round(dividaForaIbkrBRL * 100) / 100,
      total_brl: Math.round(totalDetalhe * 100) / 100,
    },
    conferencia: {
      expo_brl_snapshot: Math.round((snapshot.exposicaoCambial?.["BRL"] ?? 0) * 100) / 100,
      expo_brl_recalculada: Math.round(expoBRLTotal * 100) / 100,
      expo_cripto_snapshot: Math.round((snapshot.exposicaoCambial?.["Cripto"] ?? 0) * 100) / 100,
    },
    ibkr: ibkrDetalhe,
    brasil_itens: brasilItens,
    cripto_itens: criptoItens,
    rf_caixa_itens: [
      ...rfCaixaPosicoes.map((i) => ({ origem: "meus_ativos", ...i })),
      ...fixaItens.map((i) => ({ origem: "fixa_aberta", ...i })),
    ],
    ibkr_caixa_conciliado: ibkrCaixaConciliado,
    fora_da_soma: foraDaSoma,
  };

  return { overview, overviewErro, patrimonioDia, detalhe, snapshot };
}

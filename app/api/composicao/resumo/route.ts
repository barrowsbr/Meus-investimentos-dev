import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";
import { fetchCotacoes, yahooTicker } from "@/lib/cotacoes";
import { calcularSnapshot, calcularCarteiraFIFO } from "@/lib/portfolio";
import { calcularCambioMetrics, buildPmFxRates, parsePtax, buildFxDateMap } from "@/lib/cambio";
import { identificarSetor, isRendaFixa, isRendaVariavel, isRendaFixaManual, getMoedaExposicao } from "@/lib/sectors";
import { computeLookThrough, loadFromGSheets, computeFromStored } from "@/lib/etf-holdings";
import { computeCountryAllocation } from "@/lib/ticker-country";
import { MARGIN_TAB, parseMarginRows, computeMarginResumo, aplicarAlavancagem } from "@/lib/margin";
import type { Position } from "@/lib/portfolio";
import type { FxRates } from "@/lib/cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ── Macro classification ──────────────────────────────────────────────────────

// Matches Streamlit classificar_camadas() — maps (ticker, setor) → (macro, sub)
const RF_SETORES = new Set(["Renda Fixa", "Renda Fixa USD", "Caixa/Liquidez"]);
const RF_USD_TICKERS = new Set<string>([]);
const ETF_KEYWORDS = ["VWRA", "WRLD", "ACWI", "VT", "URTH", "SPY", "QQQ", "IVV", "VOO", "VNQ", "BND", "AGG"];
const MUNDO_TICKERS = ["ASML", "DPM", "TSM", "BABA", "JD", "TCEHY"];

function classificarCamadas(ticker: string, setor: string): { macro: string; sub: string } {
  const t = ticker.toUpperCase().replace(".SA", "").replace(".L", "");
  let macro = RF_SETORES.has(setor) ? "Renda Fixa" : "Renda Variável";
  let sub = setor;

  if (RF_USD_TICKERS.has(t) || setor === "Renda Fixa USD") {
    macro = "Renda Fixa";
    sub = "Renda Fixa USD";
  } else if (ETF_KEYWORDS.some(k => t.includes(k)) || setor === "ETF USA" || setor === "ETF") {
    macro = "Renda Variável";
    sub = "ETFs";
  } else if (macro === "Renda Fixa") {
    if (t.includes("CAIXA") || t.includes("SALDO") || t.includes("CASH") || t.includes("DISPONIVEL") || setor === "Caixa/Liquidez") sub = "Caixa";
    else if (t.includes("CDB")) sub = "CDBs";
    else if (t.includes("LCI") || t.includes("LCA")) sub = "LCI/LCA";
    else if (t.includes("DEBENTURE") || t.includes("DEB")) sub = "Debêntures";
    else sub = "Tesouro Direto";
  } else if (setor === "Ações Internacional") {
    if (MUNDO_TICKERS.some(k => t.includes(k)) || t.includes(".TO")) sub = "Ações Mundo";
    else sub = "Ações EUA";
  }

  return { macro, sub };
}

function getMacro(setor: string): string {
  const map: Record<string, string> = {
    "Ações Brasil": "Renda Variável", "FIIs": "Renda Variável", "BDRs": "Renda Variável",
    "ETFs": "Renda Variável", "ETF": "Renda Variável", "ETF USA": "Renda Variável",
    "Ações EUA": "Renda Variável", "Ações Mundo": "Renda Variável",
    "Ações Internacional": "Renda Variável",
    "Renda Fixa": "Renda Fixa", "Renda Fixa USD": "Renda Fixa",
    "Tesouro Direto": "Renda Fixa", "CDBs": "Renda Fixa",
    "LCI/LCA": "Renda Fixa", "Debêntures": "Renda Fixa", "Caixa": "Renda Fixa",
    "Commodities": "Renda Variável", "Cripto": "Renda Variável",
  };
  return map[setor] ?? "Renda Variável";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fxFactor(moeda: string, fx: FxRates): number {
  const c = moeda.toUpperCase();
  if (c === "BRL") return 1;
  if (c === "USD") return fx.USDBRL;
  if (c === "EUR") return fx.EURBRL;
  if (c === "CAD") return fx.CADBRL;
  if (c === "GBP") return fx.GBPBRL;
  return 1;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const errors: string[] = [];

  try {
    // ── 1. Load all data ──────────────────────────────────────────────────────
    const [transacoes, proventos, fixaAberta, rfTransacoes, cambioRows, ptaxRows, marginRows] = await Promise.all([
      fetchTab("meus_ativos"),
      fetchTab("meus_proventos").catch(() => []),
      fetchTab("fixa_aberta").catch(() => []),
      fetchTab("renda_fixa").catch(() => []),
      fetchTab("cambio").catch(() => []),
      fetchTab("p_tax").catch(() => []),
      fetchTab(MARGIN_TAB).catch(() => []),
    ]);

    // ── 2. Get quotes and build snapshot ─────────────────────────────────────
    const tickerSet = new Map<string, { moeda: string; corretora: string }>();
    for (const row of transacoes) {
      const ticker = String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? "").toUpperCase().trim();
      if (!ticker) continue;
      if (!tickerSet.has(ticker)) {
        tickerSet.set(ticker, {
          moeda: String(row["moeda"] ?? "BRL").toUpperCase().trim(),
          corretora: String(row["corretora"] ?? "").trim(),
        });
      }
    }

    const tickers = [...tickerSet.entries()].map(([ticker, info]) => ({
      ticker,
      moeda: info.moeda,
      corretora: info.corretora,
    }));

    const cotacoes = await fetchCotacoes(tickers);
    const fxAtual = cotacoes.fx;

    const cambio = calcularCambioMetrics(cambioRows, fxAtual);
    const fxCusto = buildPmFxRates(cambio);
    const ptax = parsePtax(ptaxRows);

    const fxByDate = buildFxDateMap(ptaxRows, cambio.historico);
    const snapshot = calcularSnapshot(transacoes, proventos, fixaAberta, cotacoes.quotes, fxAtual, fxCusto, fxByDate);
    const positions = snapshot.positions;

    // ── 3. Top / Bottom performers (native currency return) ──────────────────
    const rvPositions = positions.filter(p => isRendaVariavel(p.setor) && p.valorAtual !== null && p.custoTotal > 0);
    let topPerformer: { ticker: string; lucro_pct: number; setor: string } | null = null;
    let bottomPerformer: { ticker: string; lucro_pct: number; setor: string } | null = null;

    if (rvPositions.length > 0) {
      const nativeRet = (p: Position) => ((p.valorAtual! / p.custoTotal) - 1) * 100;
      const sorted = [...rvPositions].sort((a, b) => nativeRet(b) - nativeRet(a));
      const top = sorted[0];
      const bot = sorted[sorted.length - 1];
      if (top) topPerformer = { ticker: top.ticker, lucro_pct: nativeRet(top), setor: top.setor };
      if (bot) bottomPerformer = { ticker: bot.ticker, lucro_pct: nativeRet(bot), setor: bot.setor };
    }

    // ── 5. Exposição cambial detalhada (includes fixa_aberta) ───────────────
    const exposicaoCambial: Record<string, number> = {};
    for (const pos of positions) {
      const moedaExp = getMoedaExposicao(pos.setor, pos.moeda);
      const key = pos.setor === "Cripto" ? "Cripto" : moedaExp;
      exposicaoCambial[key] = (exposicaoCambial[key] ?? 0) + pos.valorAtualBRL;
    }
    for (const row of fixaAberta) {
      const valorRaw = parseFloat(String(row["atual"] ?? row["valor_atual"] ?? row["saldo"] ?? row["valor atual"] ?? "0").replace(",", "."));
      if (valorRaw <= 0) continue;
      const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
      const valorBRL = valorRaw * fxFactor(moeda, fxAtual);
      exposicaoCambial[moeda] = (exposicaoCambial[moeda] ?? 0) + valorBRL;
    }

    // ── 6. Estrutura da carteira (Treemap: Macro > Setor > Ticker) ────────────
    const macroMap = new Map<string, Map<string, Map<string, number>>>();
    for (const pos of positions) {
      const { macro, sub: subSetor } = classificarCamadas(pos.ticker, pos.setor);
      if (!macroMap.has(macro)) macroMap.set(macro, new Map());
      const setorMap = macroMap.get(macro)!;
      if (!setorMap.has(subSetor)) setorMap.set(subSetor, new Map());
      const tickerMap = setorMap.get(subSetor)!;
      tickerMap.set(pos.ticker, (tickerMap.get(pos.ticker) ?? 0) + pos.valorAtualBRL);
    }

    // Include fixa_aberta positions (not in snapshot.positions but counted in totalPatrimonioBRL)
    for (const row of fixaAberta) {
      const ticker = String(row["ticker"] ?? row["ativo"] ?? "").trim();
      if (!ticker) continue;
      const valorRaw = parseFloat(
        String(row["atual"] ?? row["valor_atual"] ?? row["saldo"] ?? row["valor atual"] ?? "0").replace(",", ".")
      );
      if (valorRaw <= 0) continue;
      const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim();
      const valorBRL = moeda === "USD" ? valorRaw * fxAtual.USDBRL
        : moeda === "EUR" ? valorRaw * fxAtual.EURBRL
        : valorRaw;
      const { macro, sub: subSetor } = classificarCamadas(ticker, "Renda Fixa");
      if (!macroMap.has(macro)) macroMap.set(macro, new Map());
      const setorMap = macroMap.get(macro)!;
      if (!setorMap.has(subSetor)) setorMap.set(subSetor, new Map());
      const tickerMap = setorMap.get(subSetor)!;
      tickerMap.set(ticker, (tickerMap.get(ticker) ?? 0) + valorBRL);
    }

    const totalPortfolio = snapshot.totalPatrimonioBRL;
    const estruturaCarteira = Array.from(macroMap.entries())
      .map(([macro, setorMap]) => {
        const children = Array.from(setorMap.entries()).map(([setor, tickerMap]) => {
          const setorChildren = Array.from(tickerMap.entries()).map(([ticker, value]) => ({
            name: ticker,
            value,
            pct: totalPortfolio > 0 ? (value / totalPortfolio) * 100 : 0,
          }));
          const setorValue = setorChildren.reduce((s, c) => s + c.value, 0);
          return {
            name: setor,
            value: setorValue,
            pct: totalPortfolio > 0 ? (setorValue / totalPortfolio) * 100 : 0,
            children: setorChildren.sort((a, b) => b.value - a.value),
          };
        });
        const macroValue = children.reduce((s, c) => s + c.value, 0);
        return {
          name: macro,
          value: macroValue,
          pct: totalPortfolio > 0 ? (macroValue / totalPortfolio) * 100 : 0,
          children: children.sort((a, b) => b.value - a.value),
        };
      })
      .sort((a, b) => b.value - a.value);

    // ── 7. Custódia Brasil vs Exterior (includes fixa_aberta) ──────────────
    let brasil = 0;
    let exterior = 0;
    for (const pos of positions) {
      if (pos.moeda === "BRL") brasil += pos.valorAtualBRL;
      else exterior += pos.valorAtualBRL;
    }
    for (const row of fixaAberta) {
      const valorRaw = parseFloat(String(row["atual"] ?? row["valor_atual"] ?? row["saldo"] ?? row["valor atual"] ?? "0").replace(",", "."));
      if (valorRaw <= 0) continue;
      const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
      const valorBRL = valorRaw * fxFactor(moeda, fxAtual);
      if (moeda === "BRL") brasil += valorBRL;
      else exterior += valorBRL;
    }
    const totalCustodia = brasil + exterior;
    const custodia = {
      brasil,
      exterior,
      brasil_pct: totalCustodia > 0 ? (brasil / totalCustodia) * 100 : 0,
      exterior_pct: totalCustodia > 0 ? (exterior / totalCustodia) * 100 : 0,
    };

    // ── 8. Rentabilidade por ativo (all positions: active, sold, RF) ─────────
    const proventosPorTicker = snapshot.proventosPorTicker;
    const rawPortfolio = calcularCarteiraFIFO(transacoes, fxByDate);
    const activeTickerSet = new Set(positions.map(p => p.ticker));

    // Normalize ticker: uppercase, strip accents, collapse whitespace
    const normTicker = (t: string) =>
      t.trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

    // Cash tickers: no P&L (just cash on hand)
    const CASH_TICKERS = new Set(["CAIXA", "SALDO", "CASH", "RESERVA", "DISPONIVEL"]);
    const isCashTicker = (t: string) => {
      const u = t.toUpperCase().trim();
      return CASH_TICKERS.has(u) || u.includes("CAIXA") || u.includes("SALDO") || u.includes("CASH") || u.includes("DISPONIVEL");
    };

    // RF net cost basis: compras − vendas/resgates (remaining invested amount)
    const rfCostBasis: Record<string, number> = {};
    for (const row of rfTransacoes) {
      const tipo = String(row["tipo"] ?? "").toLowerCase();
      const isCompra = tipo.includes("compra") || tipo.includes("aporte");
      const isVenda = tipo.includes("venda") || tipo.includes("resgate") || tipo.includes("vencimento");
      if (!isCompra && !isVenda) continue;
      const ticker = String(row["ticker"] ?? "").trim();
      const valor = parseFloat(String(row["valor"] ?? "0").replace(",", "."));
      if (!ticker || valor <= 0) continue;
      if (isCashTicker(ticker)) continue;
      if (!isRendaFixaManual(identificarSetor(ticker))) continue;
      const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
      const valorBRL = valor * fxFactor(moeda, fxAtual);
      const key = normTicker(ticker);
      rfCostBasis[key] = (rfCostBasis[key] ?? 0) + (isCompra ? valorBRL : -valorBRL);
    }
    for (const key of Object.keys(rfCostBasis)) {
      if (rfCostBasis[key] < 0) rfCostBasis[key] = 0;
    }

    type RentItem = {
      ticker: string; setor: string; macro: string; moeda: string; status: string;
      valor_atual_brl: number; custo_brl: number;
      lucro_nao_realizado_brl: number; lucro_realizado_brl: number;
      proventos_brl: number; resultado_total_brl: number;
      imposto_brl: number;
      retorno_nao_realizado_pct: number;
      retorno_realizado_proventos_pct: number;
      retorno_total_pct: number;
    };
    const rentabilidade: RentItem[] = [];

    // Active positions from snapshot — returns computed in native currency
    for (const p of positions) {
      if (p.lucroPct === null) continue;
      const lucroNaoRealizadoBRL = p.lucroBRL ?? 0;
      const lucroRealizadoBRL = p.lucroRealizado * fxFactor(p.moeda, fxAtual);
      const proventosAtivo = proventosPorTicker[p.ticker] ?? 0;
      const resultadoTotal = lucroNaoRealizadoBRL + lucroRealizadoBRL + proventosAtivo;

      const nativeFx = fxFactor(p.moeda, fxAtual);
      const nativeNaoRealizado = p.valorAtual !== null ? p.valorAtual - p.custoTotal : 0;
      const nativeRealizado = p.lucroRealizado;
      const nativeProventos = nativeFx > 0 ? proventosAtivo / nativeFx : 0;
      const retNaoRealizadoPct = p.custoTotal > 0 ? (nativeNaoRealizado / p.custoTotal) * 100 : 0;
      const retRealizadoProventosPct = p.custoTotal > 0 ? ((nativeRealizado + nativeProventos) / p.custoTotal) * 100 : 0;

      rentabilidade.push({
        ticker: p.ticker, setor: p.setor, moeda: p.moeda,
        macro: classificarCamadas(p.ticker, p.setor).macro,
        status: "Ativo", valor_atual_brl: p.valorAtualBRL, custo_brl: p.custoTotalBRL,
        lucro_nao_realizado_brl: lucroNaoRealizadoBRL, lucro_realizado_brl: lucroRealizadoBRL,
        proventos_brl: proventosAtivo, resultado_total_brl: resultadoTotal,
        imposto_brl: 0,
        retorno_nao_realizado_pct: retNaoRealizadoPct,
        retorno_realizado_proventos_pct: retRealizadoProventosPct,
        retorno_total_pct: retNaoRealizadoPct + retRealizadoProventosPct,
      });
    }

    // Sold positions (qty=0, have realized P&L or proventos)
    for (const [ticker, pos] of rawPortfolio) {
      if (activeTickerSet.has(ticker)) continue;
      const qtdTotal = pos.lotes.reduce((s, l) => s + l.qty, 0);
      if (qtdTotal >= 0.000001) continue;
      const proventosAtivo = proventosPorTicker[ticker] ?? 0;
      if (Math.abs(pos.lucroRealizado) < 0.01 && proventosAtivo < 0.01) continue;
      const setor = identificarSetor(ticker);
      const nativeFx = fxFactor(pos.moeda, fxAtual);
      const lucroRealizadoBRL = pos.lucroRealizado * nativeFx;
      const resultadoTotal = lucroRealizadoBRL + proventosAtivo;
      const custoNativo = pos.custoVendido;
      const nativeProventos = nativeFx > 0 ? proventosAtivo / nativeFx : 0;
      const retRealizadoProventosPct = custoNativo > 0 ? ((pos.lucroRealizado + nativeProventos) / custoNativo) * 100 : 0;
      const custoBRL = custoNativo * nativeFx;
      rentabilidade.push({
        ticker, setor, moeda: pos.moeda,
        macro: classificarCamadas(ticker, setor).macro,
        status: "Vendido", valor_atual_brl: 0, custo_brl: custoBRL,
        lucro_nao_realizado_brl: 0, lucro_realizado_brl: lucroRealizadoBRL,
        proventos_brl: proventosAtivo, resultado_total_brl: resultadoTotal,
        imposto_brl: 0,
        retorno_nao_realizado_pct: 0,
        retorno_realizado_proventos_pct: retRealizadoProventosPct,
        retorno_total_pct: retRealizadoProventosPct,
      });
    }

    // fixa_aberta RF positions (Tesouro Direto, CDBs, etc.) — already in native BRL
    for (const row of fixaAberta) {
      const ticker = String(row["ticker"] ?? row["ativo"] ?? "").trim();
      if (!ticker || activeTickerSet.has(ticker.toUpperCase())) continue;
      if (!isRendaFixaManual(identificarSetor(ticker))) continue;
      const valorRaw = parseFloat(String(row["atual"] ?? row["valor_atual"] ?? row["saldo"] ?? row["valor atual"] ?? "0").replace(",", "."));
      if (valorRaw <= 0) continue;
      const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
      const valorBRL = valorRaw * fxFactor(moeda, fxAtual);
      const isCaixa = isCashTicker(ticker);
      const custo = isCaixa ? 0 : (rfCostBasis[normTicker(ticker)] ?? 0);
      const proventosAtivo = proventosPorTicker[ticker] ?? proventosPorTicker[ticker.toUpperCase()] ?? 0;
      const lucroNaoRealizado = (!isCaixa && custo > 0) ? valorBRL - custo : 0;
      const resultadoTotal = lucroNaoRealizado + proventosAtivo;
      const retNaoRealizadoPct = custo > 0 ? (lucroNaoRealizado / custo) * 100 : 0;
      const retRealizadoProventosPct = custo > 0 && proventosAtivo > 0 ? (proventosAtivo / custo) * 100 : 0;
      const { macro, sub } = classificarCamadas(ticker, "Renda Fixa");
      rentabilidade.push({
        ticker, setor: sub, macro, moeda,
        status: "Ativo", valor_atual_brl: valorBRL, custo_brl: custo,
        lucro_nao_realizado_brl: lucroNaoRealizado, lucro_realizado_brl: 0,
        proventos_brl: proventosAtivo, resultado_total_brl: resultadoTotal,
        imposto_brl: 0,
        retorno_nao_realizado_pct: retNaoRealizadoPct,
        retorno_realizado_proventos_pct: retRealizadoProventosPct,
        retorno_total_pct: retNaoRealizadoPct + retRealizadoProventosPct,
      });
    }

    // Sold RF positions from renda_fixa transactions (CDBs, Tesouro, etc.)
    const isImpostoTipo = (t: string) => /\b(imposto|irrf|ir|tributo|iof)\b/.test(t);
    const rfTickersInRent = new Set(rentabilidade.map(r => normTicker(r.ticker)));
    const rfAgg: Record<string, { compra: number; venda: number; imposto: number; moeda: string; display: string }> = {};
    for (const row of rfTransacoes) {
      const rawTicker = String(row["ticker"] ?? "").trim();
      if (!rawTicker) continue;
      if (isCashTicker(rawTicker)) continue;
      if (!isRendaFixaManual(identificarSetor(rawTicker))) continue;
      const key = normTicker(rawTicker);
      const tipo = String(row["tipo"] ?? "").toLowerCase();
      const valorRaw = parseFloat(String(row["valor"] ?? "0").replace(",", "."));
      const ehImposto = isImpostoTipo(tipo);
      if (valorRaw <= 0 && !ehImposto) continue;
      const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
      if (!rfAgg[key]) rfAgg[key] = { compra: 0, venda: 0, imposto: 0, moeda, display: rawTicker };
      if (tipo.includes("compra") || tipo.includes("aporte")) {
        rfAgg[key].compra += valorRaw;
      } else if (tipo.includes("venda") || tipo.includes("resgate")) {
        rfAgg[key].venda += valorRaw;
      } else if (ehImposto) {
        rfAgg[key].imposto += Math.abs(valorRaw);
      }
    }
    for (const [key, agg] of Object.entries(rfAgg)) {
      if (rfTickersInRent.has(key)) continue;
      if (agg.venda <= 0) continue;
      // Skip partial redemptions: if venda < compra, the position is still active
      // and should be reflected in fixa_aberta, not counted as a realized loss.
      if (agg.venda < agg.compra * 0.95) continue;
      const display = agg.display;
      const lucroRealizado = agg.venda - agg.compra - agg.imposto;
      const proventosAtivo = proventosPorTicker[display] ?? proventosPorTicker[display.toUpperCase()] ?? proventosPorTicker[key] ?? 0;
      const resultadoTotal = lucroRealizado + proventosAtivo;
      const nativeFx = fxFactor(agg.moeda, fxAtual);
      const retRealizadoProventosPct = agg.compra > 0 ? ((lucroRealizado + (nativeFx > 0 ? proventosAtivo / nativeFx : 0)) / agg.compra) * 100 : 0;
      const { macro, sub } = classificarCamadas(display, "Renda Fixa");
      rentabilidade.push({
        ticker: display, setor: sub, macro, moeda: agg.moeda,
        status: "Vendido", valor_atual_brl: 0, custo_brl: agg.compra * nativeFx,
        lucro_nao_realizado_brl: 0, lucro_realizado_brl: lucroRealizado * nativeFx,
        proventos_brl: proventosAtivo, resultado_total_brl: resultadoTotal * nativeFx,
        imposto_brl: agg.imposto * nativeFx,
        retorno_nao_realizado_pct: 0,
        retorno_realizado_proventos_pct: retRealizadoProventosPct,
        retorno_total_pct: retRealizadoProventosPct,
      });
    }

    rentabilidade.sort((a, b) => b.resultado_total_brl - a.resultado_total_brl);

    // ── 9. Risco x Retorno ────────────────────────────────────────────────────
    const riscoRetorno = positions
      .filter(p => p.lucroPct !== null && p.valorAtualBRL > 100)
      .map(p => {
        const { macro } = classificarCamadas(p.ticker, p.setor);
        return {
          ticker: p.ticker,
          setor: p.setor,
          macro,
          valor_atual_brl: p.valorAtualBRL,
          retorno_acumulado: p.lucroPct ?? 0,
        };
      });

    // ── 10. Pareto (concentração) ─────────────────────────────────────────────
    const sortedByValue = [...positions].sort((a, b) => b.valorAtualBRL - a.valorAtualBRL);
    let acumulado = 0;
    const pareto = sortedByValue.map(p => {
      const { macro } = classificarCamadas(p.ticker, p.setor);
      acumulado += p.valorAtualBRL;
      return {
        ticker: p.ticker,
        setor: p.setor,
        macro,
        valor_brl: p.valorAtualBRL,
        pct: totalPortfolio > 0 ? (p.valorAtualBRL / totalPortfolio) * 100 : 0,
        acumulado_pct: totalPortfolio > 0 ? (acumulado / totalPortfolio) * 100 : 0,
      };
    });

    // ── 11. ETF Look-Through ──────────────────────────────────────────────────
    const ltPositions = positions.map(p => ({
      ticker: p.ticker,
      setor: p.setor,
      valorAtualBRL: p.valorAtualBRL,
      quantidade: p.quantidade,
    }));

    let ltResult: Awaited<ReturnType<typeof computeLookThrough>>;
    const { stored, storedSources, updatedAt } = await loadFromGSheets();
    if (Object.keys(stored).length > 0) {
      ltResult = computeFromStored(stored, ltPositions, 50, storedSources);
      if (updatedAt) ltResult.updated_at = updatedAt;
    } else {
      ltResult = await computeLookThrough(ltPositions, 50);
    }
    // Merece refresh manual: stored com 30+ dias, origem embedded (hardcoded
    // Q1-2025) ou proveniência desconhecida ("stored" seco = aba escrita pelo
    // pipeline legado, sem coluna source legível).
    const ltAgeDays = ltResult.updated_at
      ? (Date.now() - new Date(ltResult.updated_at.replace(" ", "T")).getTime()) / 86400000
      : null;
    const ltStale = (ltAgeDays !== null && ltAgeDays > 30)
      || Object.values(ltResult.sources).some(s => s === "stored" || s.includes("embedded"));

    const lookThroughCompositions: Record<string, { ticker: string; valor_brl: number; components: Array<{ ativo: string; name: string; peso: number }> }> = {};
    for (const [etfTicker, data] of Object.entries(ltResult.per_etf)) {
      if (data.status !== "ok" || !data.holdings) continue;
      const totalWeight = data.holdings.reduce((s, h) => s + h.weight_pct, 0);
      lookThroughCompositions[etfTicker] = {
        ticker: etfTicker,
        valor_brl: data.value_brl,
        components: data.holdings.map(h => ({
          ativo: h.ticker,
          name: h.name,
          peso: totalWeight > 0 ? h.weight_pct / totalWeight : 0,
        })).sort((a, b) => b.peso - a.peso),
      };
    }

    // ── RF manual (fixa_aberta) com corretora — alimenta custódia e mapa ─────
    // Inclui Tesouro, CDBs, caixa etc. A fixa_aberta não tem coluna de
    // corretora; a fonte é a aba renda_fixa (transações), casando por
    // ticker+moeda (ex.: Caixa BRL → Nubank, Caixa USD → IBKR).
    const rfCorretoraPorTickerMoeda = new Map<string, string>();
    const rfCorretoraPorTicker = new Map<string, string>();
    for (const row of rfTransacoes) {
      const tk = String(row["ticker"] ?? row["ativo"] ?? "").trim().toUpperCase();
      const corr = String(row["corretora"] ?? row["instituição"] ?? row["instituicao"] ?? row["banco"] ?? "").trim();
      if (!tk || !corr) continue;
      const m = String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
      if (!rfCorretoraPorTickerMoeda.has(`${tk}|${m}`)) rfCorretoraPorTickerMoeda.set(`${tk}|${m}`, corr);
      if (!rfCorretoraPorTicker.has(tk)) rfCorretoraPorTicker.set(tk, corr);
    }

    const rfPosicoes: Array<{
      ticker: string; setor: string; macro: string; valor_brl: number;
      moeda: string; corretora: string; pais: string; is_caixa: boolean;
    }> = [];
    for (const row of fixaAberta) {
      const ticker = String(row["ticker"] ?? row["ativo"] ?? "").trim();
      if (!ticker) continue;
      const valorRaw = parseFloat(
        String(row["atual"] ?? row["valor_atual"] ?? row["saldo"] ?? row["valor atual"] ?? "0").replace(",", ".")
      );
      if (valorRaw <= 0) continue;
      const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
      const corretora = (
        String(row["corretora"] ?? row["instituição"] ?? row["instituicao"] ?? row["banco"] ?? row["custódia"] ?? row["custodia"] ?? "").trim()
        || rfCorretoraPorTickerMoeda.get(`${ticker.toUpperCase()}|${moeda}`)
        || rfCorretoraPorTicker.get(ticker.toUpperCase())
        || ""
      );
      const valorBRL = valorRaw * fxFactor(moeda, fxAtual);
      const { sub } = classificarCamadas(ticker, "Renda Fixa");
      const isCaixa = sub === "Caixa";
      rfPosicoes.push({
        ticker, setor: sub, macro: "Renda Fixa", valor_brl: valorBRL, moeda,
        corretora, pais: moeda === "BRL" ? "BR" : "US", is_caixa: isCaixa,
      });
    }

    // ── Country allocation (geographic map) ──────────────────────────────────
    const directForGeo = positions
      .filter(p => !["ETF USA", "ETF"].includes(p.setor) && p.quantidade > 0 && p.valorAtualBRL > 0)
      .map(p => ({
        ticker: p.ticker, setor: p.setor, valorAtualBRL: p.valorAtualBRL,
        macro: isRendaVariavel(p.setor) ? "Renda Variável" : "Renda Fixa",
      }));
    const rfForGeo = rfPosicoes.map(r => ({
      ticker: r.ticker, setor: r.setor, valorAtualBRL: r.valor_brl, macro: "Renda Fixa", pais: r.pais,
    }));
    const countryAllocation = await computeCountryAllocation(lookThroughCompositions, [...directForGeo, ...rfForGeo]);

    return NextResponse.json(
      {
        computed_at: new Date().toISOString(),
        fx: {
          USDBRL: fxAtual.USDBRL,
          EURBRL: fxAtual.EURBRL,
          CADBRL: fxAtual.CADBRL,
          GBPBRL: fxAtual.GBPBRL,
        },
        alavancagem: (() => {
          const m = computeMarginResumo(parseMarginRows(marginRows), {
            BRL: 1, USD: fxAtual.USDBRL, EUR: fxAtual.EURBRL, GBP: fxAtual.GBPBRL,
            CAD: fxAtual.CADBRL, CHF: fxAtual.CHFBRL ?? 0, JPY: fxAtual.JPYBRL ?? 0,
          });
          return aplicarAlavancagem(totalPortfolio, m);
        })(),
        resumo: {
          total_portfolio: totalPortfolio,
          rv_value: snapshot.rvPatrimonioBRL,
          rf_value: snapshot.rfPatrimonioBRL,
          total_proventos: snapshot.totalProventosBRL,
          lucro_total_brl: rentabilidade.reduce((s, r) => s + r.resultado_total_brl, 0),
          rf_ganho: rentabilidade.filter(r => r.macro === "Renda Fixa").reduce((s, r) => s + r.lucro_nao_realizado_brl + r.lucro_realizado_brl, 0),
          top_performer: topPerformer,
          bottom_performer: bottomPerformer,
        },
        estrutura_carteira: estruturaCarteira,
        exposicao_cambial: exposicaoCambial,
        custodia,
        rentabilidade,
        risco_retorno: riscoRetorno,
        pareto,
        look_through: {
          supported: ltResult.supported,
          unsupported: ltResult.unsupported,
          compositions: lookThroughCompositions,
          total_look_through_brl: ltResult.total_look_through_brl,
          sources: ltResult.sources,
          updated_at: ltResult.updated_at,
          stale: ltStale,
        },
        country_allocation: countryAllocation,
        rf_posicoes: rfPosicoes,
        errors,
      },
      {
        headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" },
      }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    errors.push(message);
    return NextResponse.json({ error: message, errors }, { status: 500 });
  }
}

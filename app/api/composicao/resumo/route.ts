import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";
import { fetchCotacoes, yahooTicker } from "@/lib/cotacoes";
import { calcularSnapshot } from "@/lib/portfolio";
import { calcularCambioMetrics, buildPmFxRates, parsePtax } from "@/lib/cambio";
import { identificarSetor, isRendaFixa, isRendaVariavel, getMoedaExposicao } from "@/lib/sectors";
import type { Position } from "@/lib/portfolio";
import type { FxRates } from "@/lib/cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ── ETF Holdings (embedded fallback Q1-2025) ──────────────────────────────────

const ETF_HOLDINGS: Record<string, Array<{ ticker: string; name: string; weight: number }>> = {
  QQQ: [
    { ticker: "AAPL",  name: "Apple Inc",               weight: 8.9 },
    { ticker: "MSFT",  name: "Microsoft Corp",           weight: 8.1 },
    { ticker: "NVDA",  name: "NVIDIA Corp",              weight: 8.0 },
    { ticker: "AMZN",  name: "Amazon.com Inc",           weight: 5.4 },
    { ticker: "META",  name: "Meta Platforms",           weight: 4.8 },
    { ticker: "AVGO",  name: "Broadcom Inc",             weight: 4.6 },
    { ticker: "GOOGL", name: "Alphabet Class A",         weight: 4.2 },
    { ticker: "TSLA",  name: "Tesla Inc",                weight: 3.6 },
    { ticker: "GOOG",  name: "Alphabet Class C",         weight: 3.5 },
    { ticker: "COST",  name: "Costco Wholesale",         weight: 2.7 },
    { ticker: "NFLX",  name: "Netflix Inc",              weight: 1.9 },
    { ticker: "AMD",   name: "Advanced Micro Devices",   weight: 1.7 },
    { ticker: "ADBE",  name: "Adobe Inc",                weight: 1.5 },
    { ticker: "QCOM",  name: "Qualcomm Inc",             weight: 1.5 },
    { ticker: "INTU",  name: "Intuit Inc",               weight: 1.4 },
    { ticker: "TXN",   name: "Texas Instruments",        weight: 1.3 },
    { ticker: "AMAT",  name: "Applied Materials",        weight: 1.2 },
    { ticker: "AMGN",  name: "Amgen Inc",                weight: 1.1 },
    { ticker: "HON",   name: "Honeywell International",  weight: 1.0 },
    { ticker: "SBUX",  name: "Starbucks Corp",           weight: 0.9 },
    { ticker: "ISRG",  name: "Intuitive Surgical",       weight: 0.9 },
    { ticker: "MU",    name: "Micron Technology",        weight: 0.8 },
    { ticker: "LRCX",  name: "Lam Research",             weight: 0.8 },
    { ticker: "PDD",   name: "PDD Holdings",             weight: 0.8 },
    { ticker: "REGN",  name: "Regeneron Pharmaceuticals",weight: 0.7 },
  ],
  "VWRA.L": [
    { ticker: "AAPL",  name: "Apple Inc",               weight: 4.2 },
    { ticker: "MSFT",  name: "Microsoft Corp",           weight: 3.9 },
    { ticker: "NVDA",  name: "NVIDIA Corp",              weight: 3.8 },
    { ticker: "AMZN",  name: "Amazon.com Inc",           weight: 2.5 },
    { ticker: "META",  name: "Meta Platforms",           weight: 2.3 },
    { ticker: "GOOGL", name: "Alphabet Class A",         weight: 2.0 },
    { ticker: "AVGO",  name: "Broadcom Inc",             weight: 1.8 },
    { ticker: "TSLA",  name: "Tesla Inc",                weight: 1.7 },
    { ticker: "GOOG",  name: "Alphabet Class C",         weight: 1.5 },
    { ticker: "BRK-B", name: "Berkshire Hathaway B",     weight: 1.3 },
    { ticker: "JPM",   name: "JPMorgan Chase",           weight: 1.2 },
    { ticker: "LLY",   name: "Eli Lilly",                weight: 1.0 },
    { ticker: "V",     name: "Visa Inc",                 weight: 0.9 },
    { ticker: "XOM",   name: "Exxon Mobil",              weight: 0.8 },
    { ticker: "JNJ",   name: "Johnson & Johnson",        weight: 0.8 },
    { ticker: "UNH",   name: "UnitedHealth Group",       weight: 0.8 },
    { ticker: "MA",    name: "Mastercard",               weight: 0.8 },
    { ticker: "COST",  name: "Costco Wholesale",         weight: 0.7 },
    { ticker: "HD",    name: "Home Depot",               weight: 0.7 },
    { ticker: "ASML",  name: "ASML Holding",             weight: 0.7 },
    { ticker: "PG",    name: "Procter & Gamble",         weight: 0.7 },
    { ticker: "WMT",   name: "Walmart Inc",              weight: 0.6 },
    { ticker: "BAC",   name: "Bank of America",          weight: 0.6 },
    { ticker: "NFLX",  name: "Netflix Inc",              weight: 0.6 },
    { ticker: "ABBV",  name: "AbbVie Inc",               weight: 0.6 },
  ],
  SPY: [
    { ticker: "AAPL",  name: "Apple Inc",               weight: 7.1 },
    { ticker: "MSFT",  name: "Microsoft Corp",           weight: 6.5 },
    { ticker: "NVDA",  name: "NVIDIA Corp",              weight: 6.3 },
    { ticker: "AMZN",  name: "Amazon.com Inc",           weight: 3.7 },
    { ticker: "META",  name: "Meta Platforms",           weight: 2.8 },
    { ticker: "AVGO",  name: "Broadcom Inc",             weight: 2.5 },
    { ticker: "GOOGL", name: "Alphabet Class A",         weight: 2.2 },
    { ticker: "TSLA",  name: "Tesla Inc",                weight: 2.0 },
    { ticker: "GOOG",  name: "Alphabet Class C",         weight: 1.9 },
    { ticker: "BRK-B", name: "Berkshire Hathaway B",     weight: 1.7 },
    { ticker: "JPM",   name: "JPMorgan Chase",           weight: 1.5 },
    { ticker: "LLY",   name: "Eli Lilly",                weight: 1.4 },
    { ticker: "UNH",   name: "UnitedHealth Group",       weight: 1.3 },
    { ticker: "XOM",   name: "Exxon Mobil",              weight: 1.3 },
    { ticker: "COST",  name: "Costco Wholesale",         weight: 1.2 },
    { ticker: "V",     name: "Visa Inc",                 weight: 1.1 },
    { ticker: "NFLX",  name: "Netflix Inc",              weight: 1.1 },
    { ticker: "MA",    name: "Mastercard",               weight: 1.0 },
    { ticker: "HD",    name: "Home Depot",               weight: 0.9 },
    { ticker: "PG",    name: "Procter & Gamble",         weight: 0.9 },
    { ticker: "JNJ",   name: "Johnson & Johnson",        weight: 0.8 },
    { ticker: "WMT",   name: "Walmart Inc",              weight: 0.8 },
    { ticker: "ABBV",  name: "AbbVie Inc",               weight: 0.8 },
    { ticker: "BAC",   name: "Bank of America",          weight: 0.7 },
    { ticker: "CRM",   name: "Salesforce Inc",           weight: 0.7 },
  ],
  VOO: [],
};
ETF_HOLDINGS.VOO = ETF_HOLDINGS.SPY;
ETF_HOLDINGS.IVV = ETF_HOLDINGS.SPY;
ETF_HOLDINGS.IVVB11 = ETF_HOLDINGS.SPY;
ETF_HOLDINGS.VWRA = ETF_HOLDINGS["VWRA.L"];

// ETFs that support look-through expansion
const LOOKTHROUGH_ETFS = new Set(["QQQ", "VWRA", "VWRA.L", "SPY", "VOO", "IVV", "IVVB11"]);

// ── Macro classification ──────────────────────────────────────────────────────

const SETOR_TO_MACRO: Record<string, string> = {
  "Ações Brasil":       "Brasil",
  "FIIs":               "Brasil",
  "BDRs":               "Brasil",
  "ETF":                "Brasil",
  "Ações Internacional":"Exterior",
  "ETF USA":            "Exterior",
  "Renda Fixa":         "Renda Fixa",
  "Renda Fixa USD":     "Renda Fixa",
  "Tesouro Direto":     "Renda Fixa",
  "CDBs":               "Renda Fixa",
  "LCI/LCA":            "Renda Fixa",
  "Debêntures":         "Renda Fixa",
  "Caixa":              "Renda Fixa",
  "Commodities":        "Commodities",
  "Cripto":             "Cripto",
};

function getMacro(setor: string): string {
  return SETOR_TO_MACRO[setor] ?? "Outros";
}

function getSubSetor(ticker: string, setor: string): string {
  if (setor === "Renda Fixa USD") return "Renda Fixa USD";
  if (setor !== "Renda Fixa") return setor;

  const t = ticker.toUpperCase();
  if (t.includes("CAIXA") || t.includes("CASH") || t.includes("SALDO") || t.includes("DISPONIVEL")) return "Caixa";
  if (t.includes("CDB")) return "CDBs";
  if (t.includes("LCI") || t.includes("LCA")) return "LCI/LCA";
  if (t.includes("DEBENTURE") || t.includes("DEB")) return "Debêntures";
  return "Tesouro Direto";
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
    const [transacoes, proventos, fixaAberta, cambioRows, ptaxRows, composicaoRows] = await Promise.all([
      fetchTab("meus_ativos"),
      fetchTab("meus_proventos").catch(() => []),
      fetchTab("fixa_aberta").catch(() => []),
      fetchTab("cambio").catch(() => []),
      fetchTab("p_tax").catch(() => []),
      fetchTab("composicao").catch(() => []),
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

    const snapshot = calcularSnapshot(transacoes, proventos, fixaAberta, cotacoes.quotes, fxAtual, fxCusto);
    const positions = snapshot.positions;

    // ── 3. Load stored ETF compositions from GSheets ─────────────────────────
    const storedCompositions: Record<string, Array<{ ticker: string; name: string; weight: number }>> = {};
    if (composicaoRows.length > 0) {
      for (const row of composicaoRows) {
        const etf = String(row["etf"] ?? "").toUpperCase().trim();
        const ticker = String(row["ticker"] ?? "").trim();
        const weightRaw = String(row["weight_pct"] ?? row["peso"] ?? row["percentual"] ?? "0");
        const weight = parseFloat(weightRaw.replace(",", "."));
        if (!etf || !ticker || isNaN(weight)) continue;
        if (!storedCompositions[etf]) storedCompositions[etf] = [];
        storedCompositions[etf].push({
          ticker,
          name: String(row["name"] ?? row["nome"] ?? ticker),
          weight,
        });
      }
    }

    // ── 4. Top / Bottom performers ────────────────────────────────────────────
    const rvPositions = positions.filter(p => isRendaVariavel(p.setor) && p.lucroPct !== null);
    let topPerformer: { ticker: string; lucro_pct: number; setor: string } | null = null;
    let bottomPerformer: { ticker: string; lucro_pct: number; setor: string } | null = null;

    if (rvPositions.length > 0) {
      const sorted = [...rvPositions].sort((a, b) => (b.lucroPct ?? 0) - (a.lucroPct ?? 0));
      const top = sorted[0];
      const bot = sorted[sorted.length - 1];
      if (top) topPerformer = { ticker: top.ticker, lucro_pct: top.lucroPct ?? 0, setor: top.setor };
      if (bot) bottomPerformer = { ticker: bot.ticker, lucro_pct: bot.lucroPct ?? 0, setor: bot.setor };
    }

    // ── 5. Exposição cambial detalhada ────────────────────────────────────────
    const exposicaoCambial: Record<string, number> = {};
    for (const pos of positions) {
      const moedaExp = getMoedaExposicao(pos.setor, pos.moeda);
      const key = pos.setor === "Cripto" ? "Cripto" : moedaExp;
      exposicaoCambial[key] = (exposicaoCambial[key] ?? 0) + pos.valorAtualBRL;
    }

    // ── 6. Estrutura da carteira (Treemap: Macro > Setor > Ticker) ────────────
    const macroMap = new Map<string, Map<string, Map<string, number>>>();
    for (const pos of positions) {
      const subSetor = getSubSetor(pos.ticker, pos.setor);
      const macro = getMacro(subSetor);
      if (!macroMap.has(macro)) macroMap.set(macro, new Map());
      const setorMap = macroMap.get(macro)!;
      if (!setorMap.has(subSetor)) setorMap.set(subSetor, new Map());
      const tickerMap = setorMap.get(subSetor)!;
      tickerMap.set(pos.ticker, (tickerMap.get(pos.ticker) ?? 0) + pos.valorAtualBRL);
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

    // ── 7. Custódia Brasil vs Exterior ────────────────────────────────────────
    let brasil = 0;
    let exterior = 0;
    for (const pos of positions) {
      const setor = pos.setor;
      if (["Ações Brasil", "FIIs", "ETF", "BDRs", "Renda Fixa"].includes(setor)) {
        brasil += pos.valorAtualBRL;
      } else {
        exterior += pos.valorAtualBRL;
      }
    }
    const totalRV = brasil + exterior;
    const custodia = {
      brasil,
      exterior,
      brasil_pct: totalRV > 0 ? (brasil / totalRV) * 100 : 0,
      exterior_pct: totalRV > 0 ? (exterior / totalRV) * 100 : 0,
    };

    // ── 8. Rentabilidade por ativo ────────────────────────────────────────────
    const rentabilidade = positions
      .filter(p => p.lucroPct !== null)
      .map(p => ({
        ticker: p.ticker,
        setor: p.setor,
        macro: getMacro(p.setor),
        valor_atual_brl: p.valorAtualBRL,
        lucro_nao_realizado_brl: p.lucroBRL ?? 0,
        lucro_realizado_brl: p.lucroRealizado * fxFactor(p.moeda, fxAtual),
        retorno_total_pct: p.lucroPct ?? 0,
      }))
      .sort((a, b) => b.retorno_total_pct - a.retorno_total_pct);

    // ── 9. Risco x Retorno ────────────────────────────────────────────────────
    const riscoRetorno = positions
      .filter(p => p.lucroPct !== null && p.valorAtualBRL > 100)
      .map(p => ({
        ticker: p.ticker,
        setor: p.setor,
        macro: getMacro(p.setor),
        valor_atual_brl: p.valorAtualBRL,
        retorno_acumulado: p.lucroPct ?? 0,
      }));

    // ── 10. Pareto (concentração) ─────────────────────────────────────────────
    const sortedByValue = [...positions].sort((a, b) => b.valorAtualBRL - a.valorAtualBRL);
    let acumulado = 0;
    const pareto = sortedByValue.map(p => {
      acumulado += p.valorAtualBRL;
      return {
        ticker: p.ticker,
        setor: p.setor,
        macro: getMacro(p.setor),
        valor_brl: p.valorAtualBRL,
        pct: totalPortfolio > 0 ? (p.valorAtualBRL / totalPortfolio) * 100 : 0,
        acumulado_pct: totalPortfolio > 0 ? (acumulado / totalPortfolio) * 100 : 0,
      };
    });

    // ── 11. ETF Look-Through ──────────────────────────────────────────────────
    const etfPositions = positions.filter(p =>
      ["ETF USA", "ETF"].includes(p.setor) && LOOKTHROUGH_ETFS.has(p.ticker)
    );

    const lookThroughCompositions: Record<string, {
      ticker: string;
      valor_brl: number;
      components: Array<{ ativo: string; peso: number }>;
    }> = {};
    const supported: string[] = [];
    const unsupported: string[] = [];
    let totalLookThroughBRL = 0;

    for (const pos of etfPositions) {
      const holdings =
        storedCompositions[pos.ticker] ||
        ETF_HOLDINGS[pos.ticker] ||
        ETF_HOLDINGS[pos.ticker.replace(".SA", "")] ||
        null;

      if (holdings && holdings.length > 0) {
        const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);
        supported.push(pos.ticker);
        totalLookThroughBRL += pos.valorAtualBRL;
        lookThroughCompositions[pos.ticker] = {
          ticker: pos.ticker,
          valor_brl: pos.valorAtualBRL,
          components: holdings.map(h => ({
            ativo: h.ticker,
            peso: totalWeight > 0 ? h.weight / totalWeight : 0,
          })).sort((a, b) => b.peso - a.peso),
        };
      } else {
        unsupported.push(pos.ticker);
      }
    }

    // ETF positions without look-through
    const allEtfPositions = positions.filter(p =>
      ["ETF USA", "ETF"].includes(p.setor) && !LOOKTHROUGH_ETFS.has(p.ticker)
    );
    for (const pos of allEtfPositions) {
      unsupported.push(pos.ticker);
    }

    return NextResponse.json(
      {
        computed_at: new Date().toISOString(),
        fx: {
          USDBRL: fxAtual.USDBRL,
          EURBRL: fxAtual.EURBRL,
          CADBRL: fxAtual.CADBRL,
          GBPBRL: fxAtual.GBPBRL,
        },
        resumo: {
          total_portfolio: totalPortfolio,
          rv_value: snapshot.rvPatrimonioBRL,
          rf_value: snapshot.rfPatrimonioBRL,
          total_proventos: snapshot.totalProventosBRL,
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
          supported,
          unsupported: [...new Set(unsupported)],
          compositions: lookThroughCompositions,
          total_look_through_brl: totalLookThroughBRL,
        },
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

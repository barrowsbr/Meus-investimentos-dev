import { toNumber } from "./format";
import type { Quote, FxRates } from "./cotacoes";
import { fxToBRL } from "./cotacoes";
import { identificarSetor, isRendaFixa, isRendaVariavel, getMoedaEfetiva, getMoedaExposicao } from "./sectors";

interface Lote {
  qty: number;
  pm: number;
  date?: string;
  fxBRL?: number;
}

interface PosicaoInterna {
  ticker: string;
  lotes: Lote[];
  lucroRealizado: number;
  custoVendido: number;
  moeda: string;
  corretora: string;
}

export interface Position {
  ticker: string;
  setor: string;
  quantidade: number;
  moeda: string;
  corretora: string;
  custoMedio: number;
  custoTotal: number;
  lucroRealizado: number;
  lucroRealizadoBRL: number;
  precoAtual: number | null;
  quoteCurrency: string | null;
  valorAtual: number | null;
  valorAtualBRL: number;
  custoTotalBRL: number;
  lucroBRL: number | null;
  lucroPct: number | null;            // Valorização % (preço + câmbio, SEM proventos)
  proventosBRL: number;               // proventos líquidos (bruto − IR) deste ticker, em BRL
  retornoTotalBRL: number | null;     // lucroBRL + proventosBRL
  retornoTotalPct: number | null;     // Retorno Total % = retornoTotalBRL / custoTotalBRL
  ganhoAtivoBRL: number | null;
  ganhoCambioBRL: number | null;
  // ── Decomposição analítica multimoeda (3 fatores) ──────────────────────────
  // V0/V1 = capital na moeda funcional (USD); P0/P1 = câmbio de aquisição/atual.
  ganhoAtivoPuroBRL: number | null;   // (V1−V0)·P0  — lucro do ativo ao câmbio de custo
  ganhoFXPrincipalBRL: number | null; // V0·(P1−P0)  — câmbio sobre o capital aportado
  ganhoCruzadoBRL: number | null;     // (V1−V0)·(P1−P0) — câmbio sobre o lucro do ativo
  pmFxAquisicao: number | null;       // P0 efetivo (R$/USD médio de aquisição)
  fxAtualBRL: number | null;          // P1 (R$/USD atual)
  dayChange: number | null;
  dayChangePct: number | null;
  dayChangeBRL: number | null;     // variação real em R$ no dia (preço + câmbio)
  dayChangeFxBRL: number | null;   // parte do dayChangeBRL vinda do câmbio do dia
  marketState?: string;
  fatorBRL: number;
  fatorCusto: number;
}

export interface PortfolioSnapshot {
  positions: Position[];
  rvPatrimonioBRL: number;
  rfPatrimonioBRL: number;
  totalPatrimonioBRL: number;
  totalProventosBRL: number;
  proventosMensais: Record<string, number>;
  proventosPorTicker: Record<string, number>;
  totalImpostoProventosBRL: number;
  impostoProventosPorTicker: Record<string, number>;
  lucroBRL: number;                  // RV: valorização total (preço + câmbio)
  lucroPct: number;                  // RV: Valorização % (sem proventos)
  proventosRVBRL: number;            // RV: proventos líquidos acumulados
  retornoTotalRVBRL: number;         // RV: valorização + proventos
  retornoTotalRVPct: number;         // RV: Retorno Total %
  ganhoAtivoTotalBRL: number;
  ganhoCambioTotalBRL: number;
  ganhoAtivoPuroTotalBRL: number;
  ganhoFXPrincipalTotalBRL: number;
  ganhoCruzadoTotalBRL: number;
  dayChangeTotalBRL: number;
  dayChangeTotalPct: number;
  dayChangeFxTotalBRL: number;     // parcela do resultado do dia vinda do câmbio
  usdbrl: number;
  eurbrl: number;
  cadbrl: number;
  exposicaoCambial: Record<string, number>;
  setorAlocacao: Record<string, number>;
}

type Row = Record<string, unknown>;

function getVal(row: Row, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  return null;
}

function getTipo(row: Row): string {
  const raw = String(
    getVal(row, "tipo de transação", "tipo de transacao", "tipo_transacao", "tipo") ?? ""
  ).toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (raw.includes("compra") || raw.includes("buy") || raw.includes("aporte") || raw.includes("entrada") || raw.includes("subscri")) return "Compra";
  if (raw.includes("venda") || raw.includes("sell") || raw.includes("resgate") || raw.includes("saida")) return "Venda";
  if (raw.includes("bonif")) return "Compra";
  return raw;
}

function getTicker(row: Row): string {
  return String(getVal(row, "símbolo", "simbolo", "ticker", "symbol") ?? "").toUpperCase().trim();
}

function getMoeda(row: Row): string {
  const m = String(getVal(row, "moeda", "currency") ?? "BRL").toUpperCase().trim();
  return m || "BRL";
}

function getCorretora(row: Row): string {
  return String(getVal(row, "corretora", "broker") ?? "").trim();
}

function getData(row: Row): number {
  const val = getVal(row, "data", "date", "compra");
  if (val === null) return 0;
  if (typeof val === "number") {
    return new Date((val - 25569) * 86400 * 1000).getTime();
  }
  const s = String(val).trim();
  const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    return new Date(`${brMatch[3]}-${brMatch[2].padStart(2, "0")}-${brMatch[1].padStart(2, "0")}`).getTime();
  }
  return new Date(s).getTime() || 0;
}

function getDataISO(row: Row): string {
  const val = getVal(row, "data", "date", "compra");
  if (val === null) return "";
  if (typeof val === "number") {
    return new Date((val - 25569) * 86400 * 1000).toISOString().split("T")[0];
  }
  const s = String(val).trim();
  const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2].padStart(2, "0")}-${brMatch[1].padStart(2, "0")}`;
  const ts = new Date(s).getTime();
  return ts ? new Date(ts).toISOString().split("T")[0] : "";
}

export function calcularCarteiraFIFO(
  transacoes: Row[],
  fxByDate?: Map<string, number>,
): Map<string, PosicaoInterna> {
  const portfolio = new Map<string, PosicaoInterna>();
  const sorted = [...transacoes].sort((a, b) => getData(a) - getData(b));
  const hojeISO = new Date().toISOString().split("T")[0];

  for (const row of sorted) {
    const ticker = getTicker(row);
    if (!ticker) continue;

    // Transação com data futura (typo/import errado) não é posição atual.
    // O motor TWR já exclui (tx.date <= lastDate); sem este filtro o snapshot
    // contaria a posição e divergiria da Performance.
    const dataISO = getDataISO(row);
    if (dataISO && dataISO > hojeISO) continue;

    const tipo = getTipo(row);
    if (tipo !== "Compra" && tipo !== "Venda") continue;

    const quantidade = Math.abs(toNumber(getVal(row, "quantidade", "qtd", "quantity")) ?? 0);
    if (quantidade === 0) continue;

    const preco = Math.abs(toNumber(getVal(row, "preço", "preco", "price")) ?? 0);
    const taxas = Math.abs(toNumber(getVal(row, "taxa de corretagem", "taxas", "taxa")) ?? 0);
    const moedaRaw = getMoeda(row);
    const setor = identificarSetor(ticker);
    const moeda = getMoedaEfetiva(ticker, moedaRaw, setor);
    const corretora = getCorretora(row);
    const dateISO = getDataISO(row);

    if (!portfolio.has(ticker)) {
      portfolio.set(ticker, { ticker, lotes: [], lucroRealizado: 0, custoVendido: 0, moeda, corretora });
    }
    const pos = portfolio.get(ticker)!;

    const isUsdAsset = moeda === "USD";
    const lotFx = isUsdAsset && fxByDate ? lookupFx(fxByDate, dateISO) : undefined;

    if (tipo === "Compra") {
      const custoTotal = quantidade * preco + taxas;
      const pmLote = custoTotal / quantidade;
      pos.lotes.push({ qty: quantidade, pm: pmLote, date: dateISO || undefined, fxBRL: lotFx });
    } else if (tipo === "Venda") {
      let qtdVender = quantidade;
      let lucroOp = 0;

      let custoOp = 0;
      while (qtdVender > 0.000001 && pos.lotes.length > 0) {
        const lote = pos.lotes[0];
        const qtdConsumida = Math.min(lote.qty, qtdVender);
        lucroOp += (preco - lote.pm) * qtdConsumida;
        custoOp += lote.pm * qtdConsumida;
        lote.qty -= qtdConsumida;
        qtdVender -= qtdConsumida;
        if (lote.qty < 0.000001) pos.lotes.shift();
      }

      // Corretagem da venda reduz o lucro realizado — simétrico à compra,
      // onde a taxa entra no custo do lote (linha do custoTotal acima).
      pos.lucroRealizado += lucroOp - taxas;
      pos.custoVendido += custoOp;
    }
  }

  return portfolio;
}

function lookupFx(fxMap: Map<string, number>, date: string): number | undefined {
  if (!date) return undefined;
  const exact = fxMap.get(date);
  if (exact) return exact;
  let best: number | undefined;
  for (const [d, rate] of fxMap) {
    if (d <= date) best = rate;
    else break;
  }
  return best;
}

export type FxDayChange = Record<string, { changePct: number }>;

export function enriquecerPosicoes(
  portfolio: Map<string, PosicaoInterna>,
  quotes: Record<string, Quote>,
  fxAtual: FxRates,
  fxCusto: FxRates,
  fxDayChange: FxDayChange = {}
): Position[] {
  const positions: Position[] = [];

  for (const [ticker, pos] of portfolio) {
    const qtdTotal = pos.lotes.reduce((sum, l) => sum + l.qty, 0);
    if (qtdTotal < 0.000001) continue;

    const custoTotal = pos.lotes.reduce((sum, l) => sum + l.qty * l.pm, 0);
    const custoMedio = qtdTotal > 0 ? custoTotal / qtdTotal : 0;
    const setor = identificarSetor(ticker);
    const moeda = getMoedaEfetiva(ticker, pos.moeda, setor);
    const fatorAtual = fxToBRL(moeda, fxAtual);
    const fatorCusto = fxToBRL(moeda, fxCusto);

    const quote = quotes[ticker];
    const precoAtual = quote?.price ?? null;
    const quoteCurrency = quote?.currency ?? null;

    let valorAtual: number | null = null;
    let valorAtualBRL: number;
    let dayChange: number | null = null;
    let dayChangePct: number | null = null;
    let dayChangeBRL: number | null = null;
    let dayChangeFxBRL: number | null = null;

    if (precoAtual !== null) {
      valorAtual = qtdTotal * precoAtual;
      const fatorQuote = quoteCurrency ? fxToBRL(quoteCurrency, fxAtual) : fatorAtual;
      valorAtualBRL = valorAtual * fatorQuote;

      if (quote) {
        dayChange = quote.change * qtdTotal;
        dayChangePct = quote.changePercent;
        // Efeito-preço: variação do papel em moeda nativa, ao câmbio de HOJE.
        const priceEffectBRL = dayChange * fatorQuote;
        // Efeito-câmbio: reavaliação do principal estrangeiro pela variação da moeda
        // no dia. Reconstrói o valor de ontem (BRL) descontando preço e câmbio do dia.
        // Identidade: priceEffect + fxEffect = (valorHoje − valorOntem) em R$.
        const convCcy = quoteCurrency ?? moeda;
        const fxFrac = convCcy !== "BRL" && typeof fxDayChange[convCcy]?.changePct === "number"
          ? fxDayChange[convCcy]!.changePct / 100
          : 0;
        const assetFrac = quote.changePercent / 100;
        const denom = (1 + assetFrac) * (1 + fxFrac);
        const valorOntemBRL = denom !== 0 ? valorAtualBRL / denom : valorAtualBRL;
        dayChangeFxBRL = valorOntemBRL * fxFrac;
        dayChangeBRL = priceEffectBRL + dayChangeFxBRL;
      }
    } else {
      valorAtualBRL = custoTotal * fatorAtual;
    }

    // ── Custo cambial híbrido (fonte única de "efeito cambial") ───────────────
    // Para ativos em moeda estrangeira, o custo em BRL e a decomposição usam o
    // pmDólar/pmEuro REAL das suas remessas (via fxCusto = buildPmFxRates), e não
    // a PTAX da data de compra. Assim "Investido", "Lucro" e a "Decomposição de
    // Fatores" do Resumo passam a usar a MESMA taxa de referência que a página
    // Câmbio. Fallback: PTAX por lote → câmbio atual, quando não há remessa.
    const isCrypto = setor === "Cripto";
    const isUsdAsset = moeda === "USD";
    const isForeign = moeda !== "BRL" && !isCrypto;
    const pmFxRate = fxToBRL(moeda, fxCusto); // pmDólar-based (0 se sem remessa na moeda)
    const hasPerLotFx = (isUsdAsset || isForeign) && pos.lotes.some(l => l.fxBRL != null && l.fxBRL > 0);

    let custoTotalBRL: number;
    let fxCostBasis: number; // P0 — câmbio médio de aquisição (R$/moeda)
    if (isForeign && pmFxRate > 0) {
      fxCostBasis = pmFxRate;
      custoTotalBRL = custoTotal * pmFxRate;
    } else if (hasPerLotFx) {
      custoTotalBRL = pos.lotes.reduce((sum, l) => sum + l.qty * l.pm * (l.fxBRL ?? fatorCusto), 0);
      fxCostBasis = custoTotal > 0 ? custoTotalBRL / custoTotal : fatorCusto;
    } else {
      const rate = fatorCusto > 0 ? fatorCusto : fatorAtual;
      custoTotalBRL = custoTotal * rate;
      fxCostBasis = rate;
    }

    const lucroBRL = precoAtual !== null ? valorAtualBRL - custoTotalBRL : null;
    const lucroPct = lucroBRL !== null && custoTotalBRL > 0
      ? (lucroBRL / custoTotalBRL) * 100
      : null;

    let ganhoAtivoBRL: number | null = null;
    let ganhoCambioBRL: number | null = null;
    // 3-way analytic decomposition (asset-pure / FX-on-principal / cross-product)
    let ganhoAtivoPuroBRL: number | null = null;
    let ganhoFXPrincipalBRL: number | null = null;
    let ganhoCruzadoBRL: number | null = null;
    let pmFxAquisicao: number | null = null;
    let fxAtualBRL: number | null = null;

    if (precoAtual !== null && isForeign) {
      // Capital na moeda funcional (V0 custo, V1 atual) e câmbios P0/P1.
      const V0 = custoTotal;                                   // USD custo
      const V1 = precoAtual * qtdTotal;                        // USD atual
      const P0 = fxCostBasis;                                  // câmbio médio aquisição (pmDólar)
      const fatorQuote = quoteCurrency ? fxToBRL(quoteCurrency, fxAtual) : fatorAtual;
      const P1 = fatorQuote;                                   // câmbio atual
      pmFxAquisicao = P0;
      fxAtualBRL = P1;
      ganhoAtivoPuroBRL = (V1 - V0) * P0;
      ganhoFXPrincipalBRL = V0 * (P1 - P0);
      ganhoCruzadoBRL = (V1 - V0) * (P1 - P0);
      // 2-way (compat): ativo = puro+cruzado (valorizado ao câmbio atual); câmbio = principal
      ganhoAtivoBRL = ganhoAtivoPuroBRL + ganhoCruzadoBRL;
      ganhoCambioBRL = ganhoFXPrincipalBRL;
    } else if (precoAtual !== null) {
      // BRL ou cripto: sem efeito cambial separável
      ganhoAtivoBRL = lucroBRL;
      ganhoCambioBRL = 0;
      ganhoAtivoPuroBRL = lucroBRL;
      ganhoFXPrincipalBRL = 0;
      ganhoCruzadoBRL = 0;
      pmFxAquisicao = fatorCusto;
      fxAtualBRL = fatorAtual;
    }

    positions.push({
      ticker,
      setor,
      quantidade: qtdTotal,
      moeda,
      corretora: pos.corretora,
      custoMedio,
      custoTotal,
      lucroRealizado: pos.lucroRealizado,
      lucroRealizadoBRL: pos.lucroRealizado * fatorAtual,
      precoAtual,
      quoteCurrency,
      valorAtual,
      valorAtualBRL,
      custoTotalBRL,
      lucroBRL,
      lucroPct,
      proventosBRL: 0,            // preenchido em calcularSnapshot (precisa de prov.porTicker)
      retornoTotalBRL: lucroBRL,
      retornoTotalPct: lucroPct,
      ganhoAtivoBRL,
      ganhoCambioBRL,
      ganhoAtivoPuroBRL,
      ganhoFXPrincipalBRL,
      ganhoCruzadoBRL,
      pmFxAquisicao,
      fxAtualBRL,
      dayChange,
      dayChangePct,
      dayChangeBRL,
      dayChangeFxBRL,
      marketState: quote?.marketState,
      fatorBRL: fatorAtual,
      fatorCusto,
    });
  }

  positions.sort((a, b) => b.valorAtualBRL - a.valorAtualBRL);
  return positions;
}

// Chave canônica para casar proventos × posições: o import B3 grava "ITUB4"
// enquanto as transações usam "ITUB4.SA" — sem normalizar, o Retorno Total
// por ativo perde os proventos no formato divergente.
export function tickerBase(t: string): string {
  return t.toUpperCase().trim().replace(/\.SA$/, "");
}

export function calcularProventosBRL(
  proventos: Row[],
  fx: FxRates
): {
  totalBRL: number; porMes: Record<string, number>; porTicker: Record<string, number>;
  impostoBRL: number; impostoPorTicker: Record<string, number>;
} {
  let totalBRL = 0;
  let impostoBRL = 0; // custo total de IR retido (positivo)
  const porMes: Record<string, number> = {};
  const porTicker: Record<string, number> = {};
  const impostoPorTicker: Record<string, number> = {};

  for (const row of proventos) {
    const valorRaw = toNumber(getVal(row, "valor", "value")) ?? 0;
    if (valorRaw === 0) continue;

    // IMPOSTO retido na fonte abate o provento (líquido = bruto − IR).
    // Para IMPOSTO: Math.abs garante negativo independente do sinal na planilha.
    // Para dividendos: preserva o sinal original (negativo = reversão/correção).
    const decisao = String(getVal(row, "decisao", "decisão") ?? "").toLowerCase();
    const isImposto = decisao.includes("imposto");

    const moeda = getMoeda(row);
    const fator = fxToBRL(moeda, fx);
    const valorBRL = isImposto ? -Math.abs(valorRaw) * fator : valorRaw * fator;
    totalBRL += valorBRL;

    const ticker = tickerBase(String(getVal(row, "ticker", "símbolo", "simbolo") ?? ""));
    if (ticker) porTicker[ticker] = (porTicker[ticker] ?? 0) + valorBRL;

    if (isImposto) {
      const impBRL = Math.abs(valorRaw) * fator;
      impostoBRL += impBRL;
      if (ticker) impostoPorTicker[ticker] = (impostoPorTicker[ticker] ?? 0) + impBRL;
    }

    const dataStr = String(getVal(row, "data", "date", "pagamento") ?? "");
    const isoMatch = dataStr.match(/^(\d{4})-(\d{2})/);
    const brMatch = dataStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (isoMatch) {
      const key = `${isoMatch[1]}-${isoMatch[2]}`;
      porMes[key] = (porMes[key] ?? 0) + valorBRL;
    } else if (brMatch) {
      const key = `${brMatch[3]}-${brMatch[2].padStart(2, "0")}`;
      porMes[key] = (porMes[key] ?? 0) + valorBRL;
    }
  }

  return { totalBRL, porMes, porTicker, impostoBRL, impostoPorTicker };
}

export function calcularRendaFixaBRL(fixaAberta: Row[], fx: FxRates): number {
  let totalBRL = 0;
  for (const row of fixaAberta) {
    const valor = toNumber(getVal(row, "atual", "valor_atual", "saldo", "valor atual")) ?? 0;
    if (valor <= 0) continue;
    const moeda = getMoeda(row);
    totalBRL += valor * fxToBRL(moeda, fx);
  }
  return totalBRL;
}

export function calcularSnapshot(
  transacoes: Row[],
  proventos: Row[],
  fixaAberta: Row[],
  quotes: Record<string, Quote>,
  fxAtual: FxRates,
  fxCusto: FxRates,
  fxByDate?: Map<string, number>,
  fxDayChange: FxDayChange = {},
): PortfolioSnapshot {
  const portfolio = calcularCarteiraFIFO(transacoes, fxByDate);
  const positions = enriquecerPosicoes(portfolio, quotes, fxAtual, fxCusto, fxDayChange);
  const prov = calcularProventosBRL(proventos, fxAtual);
  const rfFixaAberta = calcularRendaFixaBRL(fixaAberta, fxAtual);

  // Anexa proventos líquidos por posição e o Retorno Total
  // (= valorização não realizada + lucro realizado + proventos líquidos).
  // lucroPct continua sendo a "Valorização %" (só preço/câmbio, não realizado).
  for (const p of positions) {
    p.proventosBRL = prov.porTicker[tickerBase(p.ticker)] ?? 0;
    if (p.lucroBRL !== null) {
      p.retornoTotalBRL = p.lucroBRL + p.lucroRealizadoBRL + p.proventosBRL;
      p.retornoTotalPct = p.custoTotalBRL > 0 ? (p.retornoTotalBRL / p.custoTotalBRL) * 100 : null;
    }
  }

  const rvPositions = positions.filter((p) => isRendaVariavel(p.setor));
  const rvPatrimonioBRL = rvPositions
    .filter((p) => p.valorAtualBRL > 1.0)
    .reduce((sum, p) => sum + p.valorAtualBRL, 0);

  const rfDePosicoes = positions
    .filter((p) => isRendaFixa(p.setor))
    .reduce((sum, p) => sum + p.valorAtualBRL, 0);

  const rfPatrimonioBRL = rfFixaAberta + rfDePosicoes;
  const totalPatrimonioBRL = rvPatrimonioBRL + rfPatrimonioBRL;

  const totalInvestidoRV = rvPositions.reduce((s, p) => s + p.custoTotalBRL, 0);
  const totalAtualRV = rvPositions.reduce((s, p) => s + p.valorAtualBRL, 0);
  const lucroBRL = totalAtualRV - totalInvestidoRV;            // valorização (preço+câmbio)
  const lucroPct = totalInvestidoRV > 0 ? (lucroBRL / totalInvestidoRV) * 100 : 0;
  // Realized gains from open positions only
  const realizadoOpenBRL = rvPositions.reduce((s, p) => s + p.lucroRealizadoBRL, 0);
  // Include realized gains from CLOSED positions (qty=0, skipped by enriquecerPosicoes)
  let realizadoClosedBRL = 0;
  for (const [ticker, pos] of portfolio) {
    const qtd = pos.lotes.reduce((sum, l) => sum + l.qty, 0);
    if (qtd >= 0.000001) continue;
    if (Math.abs(pos.lucroRealizado) < 0.01) continue;
    const setor = identificarSetor(ticker);
    if (!isRendaVariavel(setor)) continue;
    const moeda = getMoedaEfetiva(ticker, pos.moeda, setor);
    realizadoClosedBRL += pos.lucroRealizado * fxToBRL(moeda, fxAtual);
  }
  const realizadoRVBRL = realizadoOpenBRL + realizadoClosedBRL;
  // Proventos from closed positions are already in prov.porTicker (not filtered by qty)
  const proventosClosedBRL = (() => {
    const openTickers = new Set(rvPositions.map(p => p.ticker));
    let total = 0;
    for (const [ticker, val] of Object.entries(prov.porTicker)) {
      if (openTickers.has(ticker)) continue;
      const setor = identificarSetor(ticker);
      if (!isRendaVariavel(setor)) continue;
      total += val;
    }
    return total;
  })();
  const proventosRVBRL = rvPositions.reduce((s, p) => s + p.proventosBRL, 0) + proventosClosedBRL;
  const retornoTotalRVBRL = lucroBRL + realizadoRVBRL + proventosRVBRL;
  const retornoTotalRVPct = totalInvestidoRV > 0 ? (retornoTotalRVBRL / totalInvestidoRV) * 100 : 0;

  const ganhoAtivoTotalBRL = rvPositions.reduce((s, p) => s + (p.ganhoAtivoBRL ?? 0), 0);
  const ganhoCambioTotalBRL = rvPositions.reduce((s, p) => s + (p.ganhoCambioBRL ?? 0), 0);
  const ganhoAtivoPuroTotalBRL = rvPositions.reduce((s, p) => s + (p.ganhoAtivoPuroBRL ?? 0), 0);
  const ganhoFXPrincipalTotalBRL = rvPositions.reduce((s, p) => s + (p.ganhoFXPrincipalBRL ?? 0), 0);
  const ganhoCruzadoTotalBRL = rvPositions.reduce((s, p) => s + (p.ganhoCruzadoBRL ?? 0), 0);

  const dayChangeTotalBRL = rvPositions.reduce((s, p) => s + (p.dayChangeBRL ?? 0), 0);
  const dayChangeTotalPct = rvPatrimonioBRL > 0 ? (dayChangeTotalBRL / rvPatrimonioBRL) * 100 : 0;
  const dayChangeFxTotalBRL = rvPositions.reduce((s, p) => s + (p.dayChangeFxBRL ?? 0), 0);

  const exposicaoCambial: Record<string, number> = {};
  for (const p of positions) {
    if (p.valorAtualBRL < 1) continue;
    const moedaKey = getMoedaExposicao(p.setor, p.moeda);
    exposicaoCambial[moedaKey] = (exposicaoCambial[moedaKey] ?? 0) + p.valorAtualBRL;
  }
  // Inclui a RF manual e o caixa (fixa_aberta) na exposição por moeda — inclusive
  // caixa em dólar — para o % cambial refletir TODO o patrimônio, não só as posições.
  for (const row of fixaAberta) {
    const valor = toNumber(getVal(row, "atual", "valor_atual", "saldo", "valor atual")) ?? 0;
    if (valor <= 0) continue;
    const moeda = getMoeda(row);
    const valorBRL = valor * fxToBRL(moeda, fxAtual);
    if (valorBRL < 1) continue;
    exposicaoCambial[moeda] = (exposicaoCambial[moeda] ?? 0) + valorBRL;
  }

  const setorAlocacao: Record<string, number> = {};
  for (const p of positions) {
    if (p.valorAtualBRL < 1) continue;
    setorAlocacao[p.setor] = (setorAlocacao[p.setor] ?? 0) + p.valorAtualBRL;
  }

  return {
    positions,
    rvPatrimonioBRL,
    rfPatrimonioBRL,
    totalPatrimonioBRL,
    totalProventosBRL: prov.totalBRL,
    proventosMensais: prov.porMes,
    proventosPorTicker: prov.porTicker,
    totalImpostoProventosBRL: prov.impostoBRL,
    impostoProventosPorTicker: prov.impostoPorTicker,
    lucroBRL,
    lucroPct,
    proventosRVBRL,
    retornoTotalRVBRL,
    retornoTotalRVPct,
    ganhoAtivoTotalBRL,
    ganhoCambioTotalBRL,
    ganhoAtivoPuroTotalBRL,
    ganhoFXPrincipalTotalBRL,
    ganhoCruzadoTotalBRL,
    dayChangeTotalBRL,
    dayChangeTotalPct,
    dayChangeFxTotalBRL,
    usdbrl: fxAtual.USDBRL,
    eurbrl: fxAtual.EURBRL,
    cadbrl: fxAtual.CADBRL,
    exposicaoCambial,
    setorAlocacao,
  };
}

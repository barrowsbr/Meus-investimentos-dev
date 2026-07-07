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
  // ── Realizado decomposto em BRL (câmbio da DATA DA VENDA, fiscalmente correto) ──
  // Acumulados só para as parcelas "cobertas" (USD com PTAX da compra e da venda).
  realizadoAtivoBRL: number;      // Σ (preço−pm)·qtd·Pvenda − corretagem·Pvenda
  realizadoCambioBRL: number;     // Σ pm·qtd·(Pvenda − Pcompra)
  realizadoCoveredNative: number; // parcela native (USD) que foi convertida acima
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
  realizadoAtivoBRL: number;          // realizado: parte do ATIVO (ex-câmbio), R$
  realizadoCambioBRL: number;         // realizado: parte do CÂMBIO, R$
  precoAtual: number | null;
  quoteCurrency: string | null;
  valorAtual: number | null;
  valorAtualBRL: number;
  custoTotalBRL: number;
  lucroBRL: number | null;
  lucroPct: number | null;            // Valorização % (preço + câmbio, SEM proventos)
  proventosBRL: number;               // proventos líquidos (bruto − IR) deste ticker, em BRL
  retornoTotalBRL: number | null;     // POSIÇÃO ATUAL: não realizado + proventos (SEM realizado
                                      // de ciclos anteriores — vender no prejuízo e recomprar
                                      // não contamina a leitura da posição de agora)
  retornoTotalPct: number | null;     // retornoTotalBRL / custoTotalBRL (denominador = mesmo ciclo)
  custoVendidoBRL: number;            // custo FIFO dos lotes JÁ VENDIDOS, em BRL (capital que saiu)
  resultadoHistBRL: number | null;    // VIDA TODA no ticker: não realizado + realizado + proventos
  resultadoHistPct: number | null;    // resultadoHistBRL / (custoTotalBRL + custoVendidoBRL)
  ganhoAtivoBRL: number | null;
  ganhoCambioBRL: number | null;
  // ── Decomposição analítica multimoeda (3 fatores) ──────────────────────────
  // V0/V1 = capital na moeda funcional (USD); P0/P1 = câmbio de aquisição/atual.
  ganhoAtivoPuroBRL: number | null;   // (V1−V0)·P0  — lucro do ativo ao câmbio de custo
  ganhoFXPrincipalBRL: number | null; // V0·(P1−P0)  — câmbio sobre o capital aportado
  ganhoCruzadoBRL: number | null;     // (V1−V0)·(P1−P0) — câmbio sobre o lucro do ativo
  pmFxAquisicao: number | null;       // P0 efetivo (R$/USD médio de aquisição)
  fxAtualBRL: number | null;          // P1 (R$/USD atual)
  dataInicioPos: string | null;      // data ISO do lote mais antigo (1ª compra ainda em carteira)
  retornoAnualizadoPct: number | null; // CAGR do retorno total
  dayChange: number | null;
  dayChangePct: number | null;
  dayChangeBRL: number | null;     // variação real em R$ no dia (preço + câmbio)
  dayChangeFxBRL: number | null;   // parte do dayChangeBRL vinda do câmbio do dia
  marketState?: string;
  fatorBRL: number;
  fatorCusto: number;
  vendido?: boolean;                  // true = posição encerrada (qtd atual = 0)
  dataVenda?: string | null;          // data ISO da última venda (só posições encerradas)
}

export interface PortfolioSnapshot {
  positions: Position[];
  closedPositions: Position[];        // ativos já comprados e TOTALMENTE vendidos (qtd=0)
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
  realizadoRVBRL: number;            // RV: lucro realizado (FIFO) — ABERTAS + ENCERRADAS
  realizadoAtivoRVBRL: number;       // RV: realizado — parte do ATIVO (ex-câmbio)
  realizadoCambioRVBRL: number;      // RV: realizado — parte do CÂMBIO (PTAX da venda)
  retornoTotalRVBRL: number;         // RV: valorização + realizado + proventos
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
    getVal(row, "tipo de transação", "tipo de transacao", "tipo_transacao", "tipo", "operação", "operacao") ?? ""
  ).toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (raw.includes("compra") || raw.includes("buy") || raw.includes("aporte") || raw.includes("entrada") || raw.includes("subscri")) return "Compra";
  if (raw.includes("venda") || raw.includes("sell") || raw.includes("resgate") || raw.includes("saida")) return "Venda";
  if (raw.includes("bonif")) return "Compra";
  return raw;
}

function getTicker(row: Row): string {
  return String(getVal(row, "símbolo", "simbolo", "ticker", "symbol", "ativo", "papel") ?? "").toUpperCase().trim();
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
      portfolio.set(ticker, { ticker, lotes: [], lucroRealizado: 0, custoVendido: 0, moeda, corretora, realizadoAtivoBRL: 0, realizadoCambioBRL: 0, realizadoCoveredNative: 0 });
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

      // Câmbio (PTAX) da DATA DA VENDA — base do realizado fiscalmente correto.
      // Só disponível para USD (fxByDate é USD); demais moedas caem no fallback.
      const saleFx = isUsdAsset && fxByDate ? lookupFx(fxByDate, dateISO) : undefined;
      let coveredAtivoBRL = 0;   // (preço−pm)·qtd·Pvenda  das parcelas com PTAX
      let coveredCambioBRL = 0;  // pm·qtd·(Pvenda−Pcompra)
      let coveredNative = 0;     // (preço−pm)·qtd native das mesmas parcelas

      while (qtdVender > 0.000001 && pos.lotes.length > 0) {
        const lote = pos.lotes[0];
        const qtdConsumida = Math.min(lote.qty, qtdVender);
        const ativoNative = (preco - lote.pm) * qtdConsumida;
        lucroOp += ativoNative;
        custoOp += lote.pm * qtdConsumida;
        // "Coberto" = USD com PTAX da venda E da compra → decomposição real.
        if (saleFx != null && lote.fxBRL != null && lote.fxBRL > 0) {
          coveredAtivoBRL += ativoNative * saleFx;
          coveredCambioBRL += lote.pm * qtdConsumida * (saleFx - lote.fxBRL);
          coveredNative += ativoNative;
        }
        lote.qty -= qtdConsumida;
        qtdVender -= qtdConsumida;
        if (lote.qty < 0.000001) pos.lotes.shift();
      }

      // Corretagem da venda reduz o lucro realizado — simétrico à compra, onde a
      // taxa entra no custo do lote. No bucket coberto, convertida ao câmbio da venda.
      if (saleFx != null) {
        coveredAtivoBRL -= taxas * saleFx;
        coveredNative -= taxas;
      }
      pos.lucroRealizado += lucroOp - taxas;
      pos.custoVendido += custoOp;
      pos.realizadoAtivoBRL += coveredAtivoBRL;
      pos.realizadoCambioBRL += coveredCambioBRL;
      pos.realizadoCoveredNative += coveredNative;
    }
  }

  return portfolio;
}

// Lucro por VENDA (FIFO): motor puro em lib/lucro-venda.ts (sem deps de
// cotacoes/yahoo, para poder ser importado por client components sem quebrar o
// build). Re-exportado aqui por conveniência do lado servidor.
export { calcularLucroPorVenda } from "./lucro-venda";
export type { LucroVenda } from "./lucro-venda";

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

/** Finaliza o realizado em BRL decomposto em ativo × câmbio. As parcelas USD
 *  com PTAX (compra+venda) usam o câmbio da data da venda (fiscalmente correto);
 *  o restante (BRL, ou USD sem PTAX) cai no câmbio ATUAL no bucket ativo, sem
 *  efeito câmbio separável. ativoBRL + cambioBRL = lucroRealizadoBRL (reconcilia). */
function finalizeRealizado(pos: PosicaoInterna, fatorAtual: number): {
  lucroRealizadoBRL: number; realizadoAtivoBRL: number; realizadoCambioBRL: number;
} {
  const uncoveredNative = pos.lucroRealizado - pos.realizadoCoveredNative;
  const realizadoAtivoBRL = pos.realizadoAtivoBRL + uncoveredNative * fatorAtual;
  const realizadoCambioBRL = pos.realizadoCambioBRL;
  return {
    lucroRealizadoBRL: realizadoAtivoBRL + realizadoCambioBRL,
    realizadoAtivoBRL,
    realizadoCambioBRL,
  };
}

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
    const dataInicioPos = pos.lotes.reduce<string | null>((min, l) => {
      if (!l.date) return min;
      return min === null || l.date < min ? l.date : min;
    }, null);
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
      ...((): { lucroRealizadoBRL: number; realizadoAtivoBRL: number; realizadoCambioBRL: number } =>
        finalizeRealizado(pos, fatorAtual))(),
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
      custoVendidoBRL: pos.custoVendido * fatorCusto,
      resultadoHistBRL: null,     // preenchido em calcularSnapshot
      resultadoHistPct: null,
      ganhoAtivoBRL,
      ganhoCambioBRL,
      ganhoAtivoPuroBRL,
      ganhoFXPrincipalBRL,
      ganhoCruzadoBRL,
      pmFxAquisicao,
      fxAtualBRL,
      dataInicioPos,
      retornoAnualizadoPct: null,   // preenchido em calcularSnapshot
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
    const decisao = String(getVal(row, "decisao", "decisão", "lancamento", "lançamento", "tipo") ?? "").toLowerCase();
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

// Posições ENCERRADAS — ativos comprados e totalmente vendidos (qtd atual = 0).
// O enriquecerPosicoes descarta esses (não fazem parte do patrimônio/NAV), mas a
// página de RV precisa deles para os filtros "Todos" e "Vendidos". Aqui montamos
// objetos Position compatíveis, com os valores REALIZADOS (lucro de venda +
// proventos) em vez dos não realizados. NÃO entram em nenhuma métrica agregada.
export function construirPosicoesFechadas(
  portfolio: Map<string, PosicaoInterna>,
  transacoes: Row[],
  quotes: Record<string, Quote>,
  provPorTicker: Record<string, number>,
  fxAtual: FxRates,
): Position[] {
  // Primeira compra e última venda por ticker (para datas de início/encerramento).
  const datas = new Map<string, { firstBuy: string; lastSell: string }>();
  for (const row of transacoes) {
    const ticker = getTicker(row);
    if (!ticker) continue;
    const iso = getDataISO(row);
    if (!iso) continue;
    const tipo = getTipo(row);
    const d = datas.get(ticker) ?? { firstBuy: "", lastSell: "" };
    if (tipo === "Compra" && (!d.firstBuy || iso < d.firstBuy)) d.firstBuy = iso;
    if (tipo === "Venda" && (!d.lastSell || iso > d.lastSell)) d.lastSell = iso;
    datas.set(ticker, d);
  }

  const closed: Position[] = [];
  for (const [ticker, pos] of portfolio) {
    const qtd = pos.lotes.reduce((sum, l) => sum + l.qty, 0);
    if (qtd >= 0.000001) continue;        // ainda em carteira → não é fechada
    if (pos.custoVendido <= 0) continue;   // nunca teve posição real comprada/vendida

    const setor = identificarSetor(ticker);
    const moeda = getMoedaEfetiva(ticker, pos.moeda, setor);
    const fator = fxToBRL(moeda, fxAtual);
    const quote = quotes[ticker];

    const custoHistBRL = pos.custoVendido * fator;            // capital historicamente aportado
    // Realizado decomposto (câmbio da venda p/ USD; fallback câmbio atual).
    const real = finalizeRealizado(pos, fator);
    const lucroRealizadoBRL = real.lucroRealizadoBRL;        // lucro das vendas FIFO
    const proventosBRL = provPorTicker[tickerBase(ticker)] ?? 0;
    const retornoTotalBRL = lucroRealizadoBRL + proventosBRL; // resultado total realizado
    const retornoTotalPct = custoHistBRL > 0 ? (retornoTotalBRL / custoHistBRL) * 100 : null;
    const d = datas.get(ticker);

    closed.push({
      ticker,
      setor,
      quantidade: 0,
      moeda,
      corretora: pos.corretora,
      custoMedio: 0,
      custoTotal: pos.custoVendido,
      lucroRealizado: pos.lucroRealizado,
      lucroRealizadoBRL,
      realizadoAtivoBRL: real.realizadoAtivoBRL,
      realizadoCambioBRL: real.realizadoCambioBRL,
      precoAtual: quote?.price ?? null,
      quoteCurrency: quote?.currency ?? null,
      valorAtual: 0,
      valorAtualBRL: 0,
      custoTotalBRL: custoHistBRL,
      lucroBRL: null,
      lucroPct: null,
      proventosBRL,
      retornoTotalBRL,
      retornoTotalPct,
      custoVendidoBRL: custoHistBRL,
      resultadoHistBRL: retornoTotalBRL,
      resultadoHistPct: retornoTotalPct,
      ganhoAtivoBRL: null,
      ganhoCambioBRL: null,
      ganhoAtivoPuroBRL: null,
      ganhoFXPrincipalBRL: null,
      ganhoCruzadoBRL: null,
      pmFxAquisicao: null,
      fxAtualBRL: null,
      dataInicioPos: d?.firstBuy || null,
      retornoAnualizadoPct: null,
      dayChange: null,
      dayChangePct: null,
      dayChangeBRL: null,
      dayChangeFxBRL: null,
      marketState: quote?.marketState,
      fatorBRL: fator,
      fatorCusto: fator,
      vendido: true,
      dataVenda: d?.lastSell || null,
    });
  }

  // Mais recentes (última venda) primeiro.
  closed.sort((a, b) => (b.dataVenda ?? "").localeCompare(a.dataVenda ?? ""));
  return closed;
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

  // Anexa proventos e calcula as DUAS leituras de retorno por posição:
  //  • retornoTotal (POSIÇÃO ATUAL) = não realizado + proventos ÷ custo atual.
  //    SEM lucro realizado de ciclos anteriores — vender no prejuízo e
  //    recomprar não pode contaminar a leitura da posição de agora (o bug
  //    do SIVR: realizado de −R$1.3k sobre custo de outro ciclo dava −46%
  //    numa posição que estava −4,7%).
  //  • resultadoHist (VIDA TODA) = não realizado + realizado + proventos ÷
  //    (custo atual + custo vendido) — numerador e denominador simétricos.
  // lucroPct continua sendo a "Valorização %" (só preço/câmbio).
  const hojeMs = Date.now();
  for (const p of positions) {
    p.proventosBRL = prov.porTicker[tickerBase(p.ticker)] ?? 0;
    if (p.lucroBRL !== null) {
      p.retornoTotalBRL = p.lucroBRL + p.proventosBRL;
      p.retornoTotalPct = p.custoTotalBRL > 0 ? (p.retornoTotalBRL / p.custoTotalBRL) * 100 : null;
      p.resultadoHistBRL = p.lucroBRL + p.lucroRealizadoBRL + p.proventosBRL;
      const custoHist = p.custoTotalBRL + p.custoVendidoBRL;
      p.resultadoHistPct = custoHist > 0 ? (p.resultadoHistBRL / custoHist) * 100 : null;
    }
    if (p.retornoTotalPct !== null && p.dataInicioPos) {
      const dias = (hojeMs - new Date(p.dataInicioPos).getTime()) / 86_400_000;
      if (dias >= 1) {
        const r = p.retornoTotalPct / 100;
        p.retornoAnualizadoPct = (Math.pow(1 + r, 365 / dias) - 1) * 100;
      }
    }
  }

  // Posições encerradas (qtd=0) — para os filtros "Todos"/"Vendidos" na página RV.
  // Separadas de `positions` para NÃO entrarem em patrimônio/NAV/setores/métricas.
  const closedPositions = construirPosicoesFechadas(portfolio, transacoes, quotes, prov.porTicker, fxAtual);

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
  // Realizado RV CANÔNICO = ABERTAS + ENCERRADAS, decomposto em ativo × câmbio
  // (câmbio da DATA DA VENDA para USD; fallback câmbio atual). As duas lentes do
  // Resumo — por natureza e por fator — reconciliam no mesmo Retorno Total.
  const rvClosed = closedPositions.filter((p) => isRendaVariavel(p.setor));
  const realizadoRVBRL =
    rvPositions.reduce((s, p) => s + p.lucroRealizadoBRL, 0) +
    rvClosed.reduce((s, p) => s + p.lucroRealizadoBRL, 0);
  const realizadoAtivoRVBRL =
    rvPositions.reduce((s, p) => s + p.realizadoAtivoBRL, 0) +
    rvClosed.reduce((s, p) => s + p.realizadoAtivoBRL, 0);
  const realizadoCambioRVBRL =
    rvPositions.reduce((s, p) => s + p.realizadoCambioBRL, 0) +
    rvClosed.reduce((s, p) => s + p.realizadoCambioBRL, 0);
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
    closedPositions,
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
    realizadoRVBRL,
    realizadoAtivoRVBRL,
    realizadoCambioRVBRL,
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

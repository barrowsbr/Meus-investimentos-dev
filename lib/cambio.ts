import { toNumber } from "./format";
import type { FxRates } from "./cotacoes";

type Row = Record<string, unknown>;

function fuzzyGet(row: Row, ...patterns: string[]): unknown {
  const keys = Object.keys(row);
  for (const p of patterns) {
    if (row[p] !== undefined && row[p] !== null && row[p] !== "") return row[p];
  }
  for (const p of patterns) {
    const normalized = p.replace(/[_\s]/g, "").toLowerCase();
    for (const k of keys) {
      const kNorm = k.replace(/[_\s]/g, "").toLowerCase();
      if (kNorm === normalized && row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
    }
  }
  for (const p of patterns) {
    for (const k of keys) {
      if (k.toLowerCase().includes(p.toLowerCase()) && row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
    }
  }
  return null;
}

// ── Layer 2 currency data (USD → other) ──────────────────────────────────────

export interface Fx2CurrencyData {
  moeda: string;
  qtd: number;
  usdGasto: number;
  pmUSD: number;
  pmBRL: number;
  brlCusto: number;
  cotBRL: number;
  cotUSD: number;
  valBRL: number;
  ganhoBRL: number;
  ganhoPct: number;
  deltaUSD: number;
}

export interface CambioMetrics {
  // Layer 1: BRL → USD
  pmDolar: number;
  usdComprado: number;
  usdVendido: number;
  usdNet: number;
  brlGastoUSD: number;
  brlCustoUsdNet: number;
  valorUsdHoje: number;
  ganhoUsdBRL: number;
  ganhoUsdPct: number;
  deltaPmUsd: number;

  // Layer 2: USD → other currencies
  fx2: Fx2CurrencyData[];

  // Totals
  totalEnviadoBRL: number;
  totalValBRL: number;
  totalCustoBRL: number;
  ganhoTotal_BRL: number;
  ganhoTotalPct: number;
  numMoedas: number;

  // PM rates (for portfolio cost basis)
  pmEuro: number;
  pmCad: number;
  pmGbp: number;

  // Spot
  spotUSD: number;
  spotEUR: number;
  spotCAD: number;
  spotGBP: number;

  // Legacy compat
  totalRecebidoUSD: number;
  totalRecebidoEUR: number;
  totalRecebidoCAD: number;
  totalRecebidoGBP: number;
  ganhoCambialUSD_BRL: number;
  ganhoCambialEUR_BRL: number;
  ganhoCambialCAD_BRL: number;
  ganhoCambialGBP_BRL: number;

  operacoes: number;
  historico: CambioOp[];
  debug: { rowsParsed: number; rowsTotal: number; usdOps: number; sampleKeys: string[] };
}

export interface CambioOp {
  data: string;
  moedaOrigem: string;
  moedaDestino: string;
  valorOrigem: number;
  valorDestino: number;
  taxa: number;
  corretora: string;
}

export interface PtaxRates {
  USDBRL: number;
  EURBRL: number;
  data: string;
}

// ── Main calculation (matches Streamlit 1_Investimentos.py Câmbio tab) ───────

export function calcularCambioMetrics(cambioRows: Row[], fxAtual: FxRates): CambioMetrics {
  const historico: CambioOp[] = [];
  const sampleKeys = cambioRows.length > 0 ? Object.keys(cambioRows[0]) : [];
  let rowsParsed = 0;
  let usdOps = 0;

  // Accumulators per currency pair
  let brlGastoUSD = 0;
  let usdComprado = 0;
  let usdVendido = 0;
  let totalEnviadoBRL = 0;

  // Track USD → other conversions
  const usdToOther: Record<string, { usdGasto: number; qtdRecebida: number }> = {};

  // Track BRL → other (direct, non-USD)
  const brlToOther: Record<string, { brlGasto: number; qtdRecebida: number }> = {};

  for (const row of cambioRows) {
    const moedaOrig = String(fuzzyGet(row, "moeda_origem", "moeda origem", "de", "origem") ?? "BRL").toUpperCase().trim();
    const moedaDest = String(fuzzyGet(row, "moeda_destino", "moeda destino", "para", "destino") ?? "USD").toUpperCase().trim();
    const valorOrig = Math.abs(toNumber(fuzzyGet(row, "valor_origem", "valor total entrada", "valor entrada", "valor_entrada", "valor enviado", "enviado", "brl")) ?? 0);
    const valorDest = Math.abs(toNumber(fuzzyGet(row, "valor_destino", "valor total saída", "valor total saida", "valor saída", "valor_saida", "valor saida", "valor recebido", "recebido", "usd")) ?? 0);
    const taxaRaw = toNumber(fuzzyGet(row, "taxa", "vet", "câmbio", "cambio", "cotação", "cotacao", "rate"));
    const taxa = taxaRaw ?? (valorOrig > 0 && valorDest > 0 ? valorOrig / valorDest : 0);
    const data = String(fuzzyGet(row, "data", "date") ?? "");
    const corretora = String(fuzzyGet(row, "corretora", "corretora destino", "instituição", "instituicao", "banco") ?? "");

    if (valorOrig === 0 && valorDest === 0 && taxa === 0) continue;
    rowsParsed++;

    historico.push({ data, moedaOrigem: moedaOrig, moedaDestino: moedaDest, valorOrigem: valorOrig, valorDestino: valorDest, taxa, corretora });

    // Layer 1: BRL → USD
    if ((moedaOrig === "BRL" || moedaOrig === "") && (moedaDest === "USD" || moedaDest === "")) {
      usdOps++;
      brlGastoUSD += valorOrig;
      usdComprado += valorDest;
      totalEnviadoBRL += valorOrig;
    }
    // Layer 1: BRL → other (direct, e.g. BRL → EUR)
    else if (moedaOrig === "BRL" && moedaDest !== "USD" && moedaDest !== "" && moedaDest !== "BRL") {
      totalEnviadoBRL += valorOrig;
      if (!brlToOther[moedaDest]) brlToOther[moedaDest] = { brlGasto: 0, qtdRecebida: 0 };
      brlToOther[moedaDest].brlGasto += valorOrig;
      brlToOther[moedaDest].qtdRecebida += valorDest;
    }
    // Layer 2: USD → other currency (e.g. USD → EUR, USD → CAD)
    else if (moedaOrig === "USD") {
      usdVendido += valorOrig;
      if (moedaDest && moedaDest !== "BRL" && moedaDest !== "USD") {
        if (!usdToOther[moedaDest]) usdToOther[moedaDest] = { usdGasto: 0, qtdRecebida: 0 };
        usdToOther[moedaDest].usdGasto += valorOrig;
        usdToOther[moedaDest].qtdRecebida += valorDest;
      }
    }
  }

  // Fallback: if no BRL values but have USD values with taxa
  if (brlGastoUSD === 0 && usdComprado > 0) {
    const avgTaxa = historico
      .filter((h) => (h.moedaDestino === "USD" || h.moedaDestino === "") && h.taxa > 0)
      .reduce((s, h) => s + h.taxa * h.valorDestino, 0) /
      Math.max(usdComprado, 0.01);
    if (avgTaxa > 0) brlGastoUSD = usdComprado * avgTaxa;
  }

  // ── Layer 1 calculations (matching Streamlit lines 2909-2920) ──────────────

  const pmDolar = usdComprado > 0 ? brlGastoUSD / usdComprado : fxAtual.USDBRL;
  const usdNet = Math.max(0, usdComprado - usdVendido);
  const brlCustoUsdNet = usdNet * pmDolar;
  const cotUsdBrl = fxAtual.USDBRL;
  const valorUsdHoje = usdNet * cotUsdBrl;
  const ganhoUsdBRL = valorUsdHoje - brlCustoUsdNet;
  const ganhoUsdPct = brlCustoUsdNet > 0 ? (ganhoUsdBRL / brlCustoUsdNet) * 100 : 0;
  const deltaPmUsd = pmDolar > 0 ? ((cotUsdBrl - pmDolar) / pmDolar) * 100 : 0;

  // ── Layer 2 calculations (matching Streamlit lines 2930-2959) ──────────────

  const spotMap: Record<string, number> = {
    EUR: fxAtual.EURBRL,
    CAD: fxAtual.CADBRL,
    GBP: fxAtual.GBPBRL,
  };

  const fx2: Fx2CurrencyData[] = [];

  for (const [moeda, d] of Object.entries(usdToOther)) {
    const qtd = d.qtdRecebida;
    const usdGasto = d.usdGasto;
    const pmUSD = qtd > 0 ? usdGasto / qtd : 0;
    const brlCusto = usdGasto * pmDolar; // inherited BRL cost from Layer 1
    const pmBRL = qtd > 0 ? brlCusto / qtd : 0;
    const cotBRL = spotMap[moeda] ?? 0;
    const cotUSD = cotUsdBrl > 0 ? cotBRL / cotUsdBrl : 0;
    const valBRL = qtd * cotBRL;
    const ganhoBRL = valBRL - brlCusto;
    const ganhoPct = brlCusto > 0 ? (ganhoBRL / brlCusto) * 100 : 0;
    const deltaUSD = pmUSD > 0 ? ((cotUSD - pmUSD) / pmUSD) * 100 : 0;

    fx2.push({ moeda, qtd, usdGasto, pmUSD, pmBRL, brlCusto, cotBRL, cotUSD, valBRL, ganhoBRL, ganhoPct, deltaUSD });
  }

  // Add BRL → other (direct) currencies not already covered via USD
  for (const [moeda, d] of Object.entries(brlToOther)) {
    if (usdToOther[moeda]) continue; // already handled via USD chain
    const qtd = d.qtdRecebida;
    const brlCusto = d.brlGasto;
    const pmBRL = qtd > 0 ? brlCusto / qtd : 0;
    const cotBRL = spotMap[moeda] ?? 0;
    const valBRL = qtd * cotBRL;
    const ganhoBRL = valBRL - brlCusto;
    const ganhoPct = brlCusto > 0 ? (ganhoBRL / brlCusto) * 100 : 0;

    fx2.push({ moeda, qtd, usdGasto: 0, pmUSD: 0, pmBRL, brlCusto, cotBRL, cotUSD: 0, valBRL, ganhoBRL, ganhoPct, deltaUSD: 0 });
  }

  // ── Totals (matching Streamlit lines 2962-2965) ────────────────────────────

  const totalValBRL = valorUsdHoje + fx2.reduce((s, c) => s + c.valBRL, 0);
  const totalCustoBRL = brlGastoUSD;
  const ganhoTotal_BRL = totalValBRL - totalCustoBRL;
  const ganhoTotalPct = totalCustoBRL > 0 ? (ganhoTotal_BRL / totalCustoBRL) * 100 : 0;
  const numMoedas = 1 + fx2.length;

  // ── PM rates for portfolio cost basis ──────────────────────────────────────

  const findFx2 = (m: string) => fx2.find(c => c.moeda === m);
  const eurData = findFx2("EUR");
  const cadData = findFx2("CAD");
  const gbpData = findFx2("GBP");

  const pmEuro = eurData ? eurData.pmBRL : (brlToOther["EUR"]?.qtdRecebida ? brlToOther["EUR"].brlGasto / brlToOther["EUR"].qtdRecebida : fxAtual.EURBRL);
  const pmCad = cadData ? cadData.pmBRL : (brlToOther["CAD"]?.qtdRecebida ? brlToOther["CAD"].brlGasto / brlToOther["CAD"].qtdRecebida : fxAtual.CADBRL);
  const pmGbp = gbpData ? gbpData.pmBRL : (brlToOther["GBP"]?.qtdRecebida ? brlToOther["GBP"].brlGasto / brlToOther["GBP"].qtdRecebida : fxAtual.GBPBRL);

  // Legacy compat fields
  const totalRecebidoEUR = eurData?.qtd ?? brlToOther["EUR"]?.qtdRecebida ?? 0;
  const totalRecebidoCAD = cadData?.qtd ?? brlToOther["CAD"]?.qtdRecebida ?? 0;
  const totalRecebidoGBP = gbpData?.qtd ?? brlToOther["GBP"]?.qtdRecebida ?? 0;

  return {
    pmDolar,
    usdComprado,
    usdVendido,
    usdNet,
    brlGastoUSD,
    brlCustoUsdNet,
    valorUsdHoje,
    ganhoUsdBRL,
    ganhoUsdPct,
    deltaPmUsd,

    fx2,

    totalEnviadoBRL,
    totalValBRL,
    totalCustoBRL,
    ganhoTotal_BRL,
    ganhoTotalPct,
    numMoedas,

    pmEuro,
    pmCad,
    pmGbp,

    spotUSD: fxAtual.USDBRL,
    spotEUR: fxAtual.EURBRL,
    spotCAD: fxAtual.CADBRL,
    spotGBP: fxAtual.GBPBRL,

    totalRecebidoUSD: usdComprado,
    totalRecebidoEUR,
    totalRecebidoCAD,
    totalRecebidoGBP,
    ganhoCambialUSD_BRL: ganhoUsdBRL,
    ganhoCambialEUR_BRL: eurData?.ganhoBRL ?? 0,
    ganhoCambialCAD_BRL: cadData?.ganhoBRL ?? 0,
    ganhoCambialGBP_BRL: gbpData?.ganhoBRL ?? 0,

    operacoes: historico.length,
    historico,
    debug: { rowsParsed, rowsTotal: cambioRows.length, usdOps, sampleKeys },
  };
}

export function buildPmFxRates(cambio: CambioMetrics): FxRates {
  return {
    USDBRL: cambio.pmDolar,
    EURBRL: cambio.pmEuro,
    GBPBRL: cambio.pmGbp,
    CADBRL: cambio.pmCad,
  };
}

export function parsePtax(ptaxRows: Row[]): PtaxRates | null {
  if (ptaxRows.length === 0) return null;

  let latestDate = "";
  let latestUSD = 0;
  let latestEUR = 0;

  for (const row of ptaxRows) {
    const data = String(fuzzyGet(row, "data", "date", "data cotação", "data cotacao") ?? "");
    const moeda = String(fuzzyGet(row, "moeda", "currency", "par") ?? "USD").toUpperCase();
    const venda = toNumber(fuzzyGet(row, "venda", "ptax_venda", "cotacao", "cotação", "valor", "ptax")) ?? 0;

    if (!data || venda === 0) continue;

    if (data >= latestDate) {
      latestDate = data;
      if (moeda.includes("USD") || !moeda.includes("EUR")) latestUSD = venda;
      if (moeda.includes("EUR")) latestEUR = venda;
    }
  }

  if (latestUSD === 0) return null;
  return { USDBRL: latestUSD, EURBRL: latestEUR || latestUSD * 1.08, data: latestDate };
}

export function buildFxDateMap(ptaxRows: Row[], cambioOps: CambioOp[]): Map<string, number> {
  const map = new Map<string, number>();

  for (const row of ptaxRows) {
    const data = String(fuzzyGet(row, "data", "date", "data cotação", "data cotacao") ?? "");
    const moeda = String(fuzzyGet(row, "moeda", "currency", "par") ?? "USD").toUpperCase();
    const venda = toNumber(fuzzyGet(row, "venda", "ptax_venda", "cotacao", "cotação", "valor", "ptax")) ?? 0;
    if (!data || venda === 0) continue;
    if (moeda.includes("EUR")) continue;
    const dateISO = normalizeDate(data);
    if (dateISO) map.set(dateISO, venda);
  }

  for (const op of cambioOps) {
    if (op.taxa <= 0) continue;
    if (op.moedaOrigem === "BRL" && (op.moedaDestino === "USD" || op.moedaDestino === "")) {
      const dateISO = normalizeDate(op.data);
      if (dateISO && !map.has(dateISO)) map.set(dateISO, op.taxa);
    }
  }

  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function normalizeDate(s: string): string {
  if (!s) return "";
  const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2].padStart(2, "0")}-${brMatch[1].padStart(2, "0")}`;
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];
  return "";
}

export function parseLbHistoric(rows: Row[]): { data: string; patrimonio: number; rv: number; rf: number }[] {
  const result: { data: string; patrimonio: number; rv: number; rf: number }[] = [];

  for (const row of rows) {
    const data = String(fuzzyGet(row, "data", "date", "mes", "mês") ?? "");
    if (!data) continue;

    const patrimonio = toNumber(fuzzyGet(row, "patrimonio", "patrimônio", "total", "patrimonio_total")) ?? 0;
    const rv = toNumber(fuzzyGet(row, "rv", "renda_variavel", "renda variável", "renda variavel")) ?? 0;
    const rf = toNumber(fuzzyGet(row, "rf", "renda_fixa", "renda fixa")) ?? 0;

    if (patrimonio === 0 && rv === 0 && rf === 0) continue;
    result.push({ data, patrimonio: patrimonio || (rv + rf), rv, rf });
  }

  result.sort((a, b) => a.data.localeCompare(b.data));
  return result;
}

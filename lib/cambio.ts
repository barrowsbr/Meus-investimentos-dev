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

export interface CambioMetrics {
  pmDolar: number;
  pmEuro: number;
  pmCad: number;
  pmGbp: number;
  totalEnviadoBRL: number;
  totalRecebidoUSD: number;
  totalRecebidoEUR: number;
  ganhoCambialUSD_BRL: number;
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

export function calcularCambioMetrics(cambioRows: Row[], fxAtual: FxRates): CambioMetrics {
  let totalBRL_paraUSD = 0;
  let totalUSD_recebido = 0;
  let totalBRL_paraEUR = 0;
  let totalEUR_recebido = 0;
  let totalBRL_paraCAD = 0;
  let totalCAD_recebido = 0;
  let totalBRL_paraGBP = 0;
  let totalGBP_recebido = 0;
  let totalEnviadoBRL = 0;
  let usdOps = 0;
  let rowsParsed = 0;

  const historico: CambioOp[] = [];
  const sampleKeys = cambioRows.length > 0 ? Object.keys(cambioRows[0]) : [];

  for (const row of cambioRows) {
    const moedaOrig = String(fuzzyGet(row, "moeda_origem", "moeda origem", "de", "origem") ?? "BRL").toUpperCase().trim();
    const moedaDest = String(fuzzyGet(row, "moeda_destino", "moeda destino", "para", "destino") ?? "USD").toUpperCase().trim();
    const valorOrig = Math.abs(toNumber(fuzzyGet(row, "valor_origem", "valor entrada", "valor_entrada", "valor enviado", "enviado", "brl")) ?? 0);
    const valorDest = Math.abs(toNumber(fuzzyGet(row, "valor_destino", "valor saída", "valor_saida", "valor saida", "valor recebido", "recebido", "usd")) ?? 0);
    const taxaRaw = toNumber(fuzzyGet(row, "taxa", "vet", "câmbio", "cambio", "cotação", "cotacao", "rate"));
    const taxa = taxaRaw ?? (valorOrig > 0 && valorDest > 0 ? valorOrig / valorDest : 0);
    const data = String(fuzzyGet(row, "data", "date") ?? "");
    const corretora = String(fuzzyGet(row, "corretora", "corretora destino", "instituição", "instituicao", "banco") ?? "");

    if (valorOrig === 0 && valorDest === 0 && taxa === 0) continue;
    rowsParsed++;

    historico.push({ data, moedaOrigem: moedaOrig, moedaDestino: moedaDest, valorOrigem: valorOrig, valorDestino: valorDest, taxa, corretora });

    if (moedaOrig === "BRL" || moedaOrig === "") {
      totalEnviadoBRL += valorOrig;
      if (moedaDest === "USD" || moedaDest === "") {
        usdOps++;
        totalBRL_paraUSD += valorOrig;
        totalUSD_recebido += valorDest;
        if (totalBRL_paraUSD === 0 && taxa > 0 && valorDest > 0) {
          totalBRL_paraUSD = valorDest * taxa;
        }
      }
      if (moedaDest === "EUR") { totalBRL_paraEUR += valorOrig; totalEUR_recebido += valorDest; }
      if (moedaDest === "CAD") { totalBRL_paraCAD += valorOrig; totalCAD_recebido += valorDest; }
      if (moedaDest === "GBP") { totalBRL_paraGBP += valorOrig; totalGBP_recebido += valorDest; }
    }
  }

  if (totalBRL_paraUSD === 0 && totalUSD_recebido > 0) {
    const avgTaxa = historico
      .filter((h) => h.moedaDestino === "USD" && h.taxa > 0)
      .reduce((s, h) => s + h.taxa * h.valorDestino, 0) /
      Math.max(totalUSD_recebido, 0.01);
    if (avgTaxa > 0) totalBRL_paraUSD = totalUSD_recebido * avgTaxa;
  }

  const pmDolar = totalUSD_recebido > 0 ? totalBRL_paraUSD / totalUSD_recebido : fxAtual.USDBRL;
  const pmEuro = totalEUR_recebido > 0 ? totalBRL_paraEUR / totalEUR_recebido : fxAtual.EURBRL;
  const pmCad = totalCAD_recebido > 0 ? totalBRL_paraCAD / totalCAD_recebido : fxAtual.CADBRL;
  const pmGbp = totalGBP_recebido > 0 ? totalBRL_paraGBP / totalGBP_recebido : fxAtual.GBPBRL;

  const ganhoCambialUSD_BRL = totalUSD_recebido > 0 ? totalUSD_recebido * (fxAtual.USDBRL - pmDolar) : 0;

  return {
    pmDolar,
    pmEuro,
    pmCad,
    pmGbp,
    totalEnviadoBRL,
    totalRecebidoUSD: totalUSD_recebido,
    totalRecebidoEUR: totalEUR_recebido,
    ganhoCambialUSD_BRL,
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

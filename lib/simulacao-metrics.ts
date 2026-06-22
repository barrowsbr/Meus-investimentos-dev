// ── Motor de métricas de simulação (risco/retorno, concentração, diagnóstico) ──
//
// Puramente determinístico e self-contained: deriva o PERFIL de risco/retorno da
// carteira a partir da alocação por classe (blend de premissas de mercado), além
// de concentração e um diagnóstico em linguagem natural do que a operação muda.
//
// NÃO projeta o futuro (sem Monte Carlo) — caracteriza o estado atual × simulado.
// O objetivo da página de Simulações é "como minha carteira fica depois de comprar
// outros ativos"; estas métricas dão a leitura de RISCO dessa mudança.

// ── Premissas de mercado por classe (anuais, nominais, em BRL) ──────────────────
// Capital Market Assumptions conservadoras. Editáveis pelo usuário via sliders.

export type Bucket = "RV_BR" | "RV_EXT" | "RF" | "CRIPTO" | "COMMOD";

export interface BucketCMA {
  retorno: number; // retorno esperado anual (ex.: 0.12 = 12%)
  vol: number;     // volatilidade anual (ex.: 0.24 = 24%)
}

export const BUCKET_LABELS: Record<Bucket, string> = {
  RV_BR: "Renda Variável Brasil",
  RV_EXT: "Renda Variável Exterior",
  RF: "Renda Fixa & Caixa",
  CRIPTO: "Criptoativos",
  COMMOD: "Commodities",
};

export const BUCKET_COLORS: Record<Bucket, string> = {
  RV_BR: "#3b82f6",
  RV_EXT: "#6366f1",
  RF: "#22c55e",
  CRIPTO: "#f59e0b",
  COMMOD: "#d97706",
};

// Premissas-padrão (o usuário ajusta retorno/vol nos sliders).
export const DEFAULT_CMA: Record<Bucket, BucketCMA> = {
  RV_BR:  { retorno: 0.12, vol: 0.24 },
  RV_EXT: { retorno: 0.11, vol: 0.18 },
  RF:     { retorno: 0.105, vol: 0.04 },
  CRIPTO: { retorno: 0.25, vol: 0.70 },
  COMMOD: { retorno: 0.07, vol: 0.20 },
};

// Taxa livre de risco padrão (Selic/CDI nominal) — base do Sharpe.
export const DEFAULT_RF_RATE = 0.105;

// Matriz de correlação entre buckets (simétrica). Habilita o benefício real de
// diversificação: a vol da carteira fica abaixo da média ponderada das vols.
const CORR: Record<Bucket, Record<Bucket, number>> = {
  RV_BR:  { RV_BR: 1.00, RV_EXT: 0.55, RF: 0.10, CRIPTO: 0.35, COMMOD: 0.30 },
  RV_EXT: { RV_BR: 0.55, RV_EXT: 1.00, RF: 0.05, CRIPTO: 0.40, COMMOD: 0.25 },
  RF:     { RV_BR: 0.10, RV_EXT: 0.05, RF: 1.00, CRIPTO: 0.00, COMMOD: 0.05 },
  CRIPTO: { RV_BR: 0.35, RV_EXT: 0.40, RF: 0.00, CRIPTO: 1.00, COMMOD: 0.20 },
  COMMOD: { RV_BR: 0.30, RV_EXT: 0.25, RF: 0.05, COMMOD: 1.00, CRIPTO: 0.20 } as Record<Bucket, number>,
};

export const ALL_BUCKETS: Bucket[] = ["RV_BR", "RV_EXT", "RF", "CRIPTO", "COMMOD"];

// ── Mapeamento setor (da carteira) → bucket de risco ──────────────────────────
// Os setores vêm de identificarSetor() / SETOR_COLORS na página de Simulações.

export function setorToBucket(setor: string): Bucket {
  switch (setor) {
    case "Cripto": return "CRIPTO";
    case "Commodities": return "COMMOD";
    case "Renda Fixa":
    case "Renda Fixa USD":
    case "Caixa/Liquidez": return "RF";
    case "Ações Internacional":
    case "ETF USA": return "RV_EXT";
    case "Ações Brasil":
    case "ETF":
    case "FIIs":
    case "BDRs": return "RV_BR";
    default: return "RV_BR";
  }
}

// Pesos por bucket (0..1, somando ~1) a partir do dict setor→valorBRL.
export function bucketWeights(setorDict: Record<string, number>, total: number): Record<Bucket, number> {
  const w: Record<Bucket, number> = { RV_BR: 0, RV_EXT: 0, RF: 0, CRIPTO: 0, COMMOD: 0 };
  if (total <= 0) return w;
  for (const [setor, valor] of Object.entries(setorDict)) {
    if (valor <= 0) continue;
    w[setorToBucket(setor)] += valor / total;
  }
  return w;
}

// ── Perfil de risco/retorno da carteira ────────────────────────────────────────

export interface RiskProfile {
  retorno: number;          // retorno esperado anual (fração)
  vol: number;              // volatilidade anual (fração)
  sharpe: number;           // (retorno − rf) / vol
  weights: Record<Bucket, number>;
}

export function computeProfile(
  setorDict: Record<string, number>,
  total: number,
  cma: Record<Bucket, BucketCMA> = DEFAULT_CMA,
  rfRate: number = DEFAULT_RF_RATE,
): RiskProfile {
  const weights = bucketWeights(setorDict, total);

  // Retorno esperado = Σ wᵢ·μᵢ
  let retorno = 0;
  for (const b of ALL_BUCKETS) retorno += weights[b] * cma[b].retorno;

  // Vol da carteira = √(wᵀ Σ w), com Σᵢⱼ = σᵢ·σⱼ·ρᵢⱼ
  let variance = 0;
  for (const i of ALL_BUCKETS) {
    for (const j of ALL_BUCKETS) {
      variance += weights[i] * weights[j] * cma[i].vol * cma[j].vol * CORR[i][j];
    }
  }
  const vol = Math.sqrt(Math.max(0, variance));
  const sharpe = vol > 1e-9 ? (retorno - rfRate) / vol : 0;

  return { retorno, vol, sharpe, weights };
}

// ── Concentração & diversificação ──────────────────────────────────────────────

export interface ConcentrationStats {
  hhi: number;       // Herfindahl-Hirschman (0..1) sobre frações das posições
  nEff: number;      // nº efetivo de ativos = 1/HHI
  top1: number;      // % da maior posição
  top3: number;      // % das 3 maiores
  top5: number;      // % das 5 maiores
  count: number;     // nº de posições
  maiorTicker: string;
}

export function computeConcentration(
  positions: { ticker: string; valor: number }[],
): ConcentrationStats {
  const total = positions.reduce((s, p) => s + Math.max(0, p.valor), 0);
  if (total <= 0) {
    return { hhi: 0, nEff: 0, top1: 0, top3: 0, top5: 0, count: 0, maiorTicker: "—" };
  }
  const sorted = [...positions].filter(p => p.valor > 0).sort((a, b) => b.valor - a.valor);
  const fracs = sorted.map(p => p.valor / total);
  const hhi = fracs.reduce((s, f) => s + f * f, 0);
  const cum = (n: number) => fracs.slice(0, n).reduce((s, f) => s + f, 0) * 100;
  return {
    hhi,
    nEff: hhi > 1e-9 ? 1 / hhi : 0,
    top1: cum(1),
    top3: cum(3),
    top5: cum(5),
    count: sorted.length,
    maiorTicker: sorted[0]?.ticker ?? "—",
  };
}

// Score de diversificação 0..100. Combina nº efetivo de ativos (penaliza
// concentração) e a dispersão entre classes (penaliza carteira mono-classe).
export function scoreDiversificacao(conc: ConcentrationStats, weights: Record<Bucket, number>): number {
  // Componente 1: posições — nEff de 1→25 mapeado para 0→100 (saturando).
  const compPos = Math.min(1, Math.log(Math.max(1, conc.nEff)) / Math.log(25));

  // Componente 2: classes — entropia normalizada das classes ativas.
  const ws = ALL_BUCKETS.map(b => weights[b]).filter(w => w > 0.001);
  let entropy = 0;
  for (const w of ws) entropy += -w * Math.log(w);
  const maxEntropy = Math.log(ALL_BUCKETS.length);
  const compClass = maxEntropy > 0 ? entropy / maxEntropy : 0;

  return Math.round((compPos * 0.6 + compClass * 0.4) * 100);
}

// ── Diagnóstico do cenário (linguagem natural) ─────────────────────────────────

export type InsightTipo = "positivo" | "negativo" | "neutro" | "alerta";
export interface Insight {
  tipo: InsightTipo;
  texto: string;
}

const pp = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}pp`;
const pctFmt = (v: number) => `${(v * 100).toFixed(1)}%`;

export interface DiagnosticoInput {
  patrimAntes: number;
  patrimDepois: number;
  profAntes: RiskProfile;
  profDepois: RiskProfile;
  concAntes: ConcentrationStats;
  concDepois: ConcentrationStats;
  // setor econômico (% por setor) — para concentração setorial
  setorEcoAntes: Record<string, number>;
  setorEcoDepois: Record<string, number>;
  totalAntes: number;
  totalDepois: number;
  // exposição cambial (% BRL)
  moedaAntes: Record<string, number>;
  moedaDepois: Record<string, number>;
}

function pctMaiorSetor(dict: Record<string, number>, total: number): { setor: string; pct: number } {
  let best = "—", bestV = 0;
  for (const [k, v] of Object.entries(dict)) if (v > bestV) { best = k; bestV = v; }
  return { setor: best, pct: total > 0 ? (bestV / total) * 100 : 0 };
}

export function gerarDiagnostico(d: DiagnosticoInput): Insight[] {
  const out: Insight[] = [];

  // 1. Retorno esperado
  const dRet = (d.profDepois.retorno - d.profAntes.retorno) * 100;
  if (Math.abs(dRet) >= 0.1) {
    out.push({
      tipo: dRet > 0 ? "positivo" : "neutro",
      texto: `Retorno esperado vai de ${pctFmt(d.profAntes.retorno)} para ${pctFmt(d.profDepois.retorno)} a.a. (${pp(dRet)}).`,
    });
  }

  // 2. Volatilidade (risco)
  const dVol = (d.profDepois.vol - d.profAntes.vol) * 100;
  if (Math.abs(dVol) >= 0.1) {
    out.push({
      tipo: dVol > 0.5 ? "alerta" : dVol < -0.1 ? "positivo" : "neutro",
      texto: `Volatilidade ${dVol > 0 ? "sobe" : "cai"} de ${pctFmt(d.profAntes.vol)} para ${pctFmt(d.profDepois.vol)} a.a. (${pp(dVol)}) — ${dVol > 0 ? "mais risco" : "menos risco"}.`,
    });
  }

  // 3. Sharpe (eficiência risco-ajustada)
  const dSharpe = d.profDepois.sharpe - d.profAntes.sharpe;
  if (Math.abs(dSharpe) >= 0.02) {
    out.push({
      tipo: dSharpe > 0 ? "positivo" : "negativo",
      texto: `Índice de Sharpe ${dSharpe > 0 ? "melhora" : "piora"} de ${d.profAntes.sharpe.toFixed(2)} para ${d.profDepois.sharpe.toFixed(2)} — ${dSharpe > 0 ? "melhor retorno por unidade de risco" : "pior retorno por unidade de risco"}.`,
    });
  }

  // 4. Concentração setorial (maior setor)
  const mAntes = pctMaiorSetor(d.setorEcoAntes, d.totalAntes);
  const mDepois = pctMaiorSetor(d.setorEcoDepois, d.totalDepois);
  const dMaior = mDepois.pct - mAntes.pct;
  if (Math.abs(dMaior) >= 0.5) {
    const concentra = dMaior > 0;
    out.push({
      tipo: concentra && mDepois.pct > 35 ? "alerta" : concentra ? "neutro" : "positivo",
      texto: `${concentra ? "Aumenta" : "Reduz"} exposição a ${mDepois.setor} para ${mDepois.pct.toFixed(1)}% (${pp(dMaior)})${concentra && mDepois.pct > 35 ? " — atenção à concentração setorial." : "."}`,
    });
  }

  // 5. Nº efetivo de ativos
  const dNeff = d.concDepois.nEff - d.concAntes.nEff;
  if (Math.abs(dNeff) >= 0.3) {
    out.push({
      tipo: dNeff > 0 ? "positivo" : "neutro",
      texto: `Nº efetivo de ativos vai de ${d.concAntes.nEff.toFixed(1)} para ${d.concDepois.nEff.toFixed(1)} — carteira ${dNeff > 0 ? "mais diversificada" : "mais concentrada"}.`,
    });
  }

  // 6. Maior posição (alerta de concentração unitária)
  if (d.concDepois.top1 > 20 && d.concDepois.top1 > d.concAntes.top1 + 0.3) {
    out.push({
      tipo: "alerta",
      texto: `${d.concDepois.maiorTicker} passa a representar ${d.concDepois.top1.toFixed(1)}% da carteira — posição relevante em um único ativo.`,
    });
  }

  // 7. Exposição cambial (BRL)
  const brlAntes = d.totalAntes > 0 ? ((d.moedaAntes["BRL"] ?? 0) / d.totalAntes) * 100 : 0;
  const brlDepois = d.totalDepois > 0 ? ((d.moedaDepois["BRL"] ?? 0) / d.totalDepois) * 100 : 0;
  const dBrl = brlDepois - brlAntes;
  if (Math.abs(dBrl) >= 0.5) {
    out.push({
      tipo: "neutro",
      texto: `Exposição em real ${dBrl > 0 ? "sobe" : "cai"} de ${brlAntes.toFixed(0)}% para ${brlDepois.toFixed(0)}% (${pp(dBrl)}) — ${dBrl < 0 ? "mais" : "menos"} exposição internacional.`,
    });
  }

  // 8. Patrimônio
  const dPat = d.patrimDepois - d.patrimAntes;
  if (Math.abs(dPat) > 1) {
    out.push({
      tipo: "neutro",
      texto: `Patrimônio ${dPat > 0 ? "aporta" : "reduz"} ${Math.abs(dPat / Math.max(1, d.patrimAntes) * 100).toFixed(1)}% com o cenário.`,
    });
  }

  return out;
}

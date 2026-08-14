// Matemática da aba Risco — módulo PURO (client-safe, sem deps server-only).
// Tudo derivado da série diária que a página já carrega (activeChart):
// beta/alfa/correlação vs benchmark, histograma de retornos diários e tempo
// de recuperação do drawdown máximo. Metodologia alinhada ao PortfolioAnalyst
// da IBKR (CAPM sobre retornos diários em excesso ao rf; alfa anualizado
// ×252; correlação de Pearson sobre retornos brutos) para os números serem
// comparáveis com o relatório oficial da corretora.

export interface PontoRisco {
  date: string;            // YYYY-MM-DD
  ret: number | null;      // retorno DIÁRIO do portfólio (fração)
  twr: number;             // retorno ACUMULADO do portfólio (fração)
  bench: number | null;    // retorno ACUMULADO do benchmark (fração)
  rf: number | null;       // retorno ACUMULADO da taxa livre de risco (CDI; fração)
}

export interface VsMercado {
  beta: number;
  alfaAA: number;          // alfa anualizado (fração a.a.)
  correlacao: number;      // -1..1
  pregoes: number;         // pares usados no cálculo
}

// Mínimo de pregões em comum para o número ser estável. Menos que isso a UI
// mostra "—" com o motivo, em vez de um beta frágil.
export const MIN_PREGOES = 60;

/** Retornos diários a partir de uma série ACUMULADA (fração): r=(1+c)/(1+c₋₁)−1. */
export function retornosDiarios(cum: Array<number | null>): Array<number | null> {
  const out: Array<number | null> = [null];
  for (let i = 1; i < cum.length; i++) {
    const a = cum[i - 1], b = cum[i];
    out.push(a != null && b != null && 1 + a !== 0 ? (1 + b) / (1 + a) - 1 : null);
  }
  return out;
}

const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Beta, alfa anualizado e correlação vs benchmark (CAPM diário, rf = CDI). */
export function vsMercado(serie: PontoRisco[]): VsMercado | null {
  const rb = retornosDiarios(serie.map((p) => p.bench));
  const rfD = retornosDiarios(serie.map((p) => p.rf));
  const pares: Array<{ rp: number; rb: number; rf: number }> = [];
  for (let i = 0; i < serie.length; i++) {
    const rp = serie[i].ret, b = rb[i];
    if (rp == null || b == null) continue;
    pares.push({ rp, rb: b, rf: rfD[i] ?? 0 }); // sem CDI no dia → rf 0 (visão USD)
  }
  if (pares.length < MIN_PREGOES) return null;

  const xp = pares.map((p) => p.rp - p.rf); // excesso do portfólio
  const xb = pares.map((p) => p.rb - p.rf); // excesso do benchmark
  const mxp = media(xp), mxb = media(xb);
  let cov = 0, varB = 0;
  for (let i = 0; i < pares.length; i++) {
    cov += (xp[i] - mxp) * (xb[i] - mxb);
    varB += (xb[i] - mxb) ** 2;
  }
  if (varB === 0) return null;
  const beta = cov / varB;
  const alfaAA = (mxp - beta * mxb) * 252;

  // Correlação de Pearson sobre retornos BRUTOS (como no relatório da IBKR).
  const rps = pares.map((p) => p.rp), rbs = pares.map((p) => p.rb);
  const mrp = media(rps), mrb = media(rbs);
  let cv = 0, vp = 0, vb = 0;
  for (let i = 0; i < pares.length; i++) {
    cv += (rps[i] - mrp) * (rbs[i] - mrb);
    vp += (rps[i] - mrp) ** 2;
    vb += (rbs[i] - mrb) ** 2;
  }
  const correlacao = vp > 0 && vb > 0 ? cv / Math.sqrt(vp * vb) : 0;

  return { beta, alfaAA, correlacao, pregoes: pares.length };
}

// ── Histograma de retornos diários ───────────────────────────────────────────

export interface FaixaHistograma { faixa: string; n: number; neg: boolean }

const FAIXAS: Array<{ faixa: string; min: number; max: number; neg: boolean }> = [
  { faixa: "< −2%", min: -Infinity, max: -0.02, neg: true },
  { faixa: "−2 a −1%", min: -0.02, max: -0.01, neg: true },
  { faixa: "−1 a 0%", min: -0.01, max: 0, neg: true },
  { faixa: "0 a +1%", min: 0, max: 0.01, neg: false },
  { faixa: "+1 a +2%", min: 0.01, max: 0.02, neg: false },
  { faixa: "> +2%", min: 0.02, max: Infinity, neg: false },
];

export interface Histograma {
  faixas: FaixaHistograma[];
  positivos: number;  // pregões com retorno > 0
  total: number;      // pregões com retorno conhecido
}

export function histogramaRetornos(rets: Array<number | null>): Histograma {
  const faixas = FAIXAS.map((f) => ({ faixa: f.faixa, n: 0, neg: f.neg }));
  let positivos = 0, total = 0;
  for (const r of rets) {
    if (r == null) continue;
    total++;
    if (r > 0) positivos++;
    // [min, max) — o zero exato conta como "0 a +1%" (dia que não caiu).
    const i = FAIXAS.findIndex((f) => r >= f.min && r < f.max);
    if (i >= 0) faixas[i].n++;
  }
  return { faixas, positivos, total };
}

// ── Recuperação do drawdown máximo ───────────────────────────────────────────

export interface Recuperacao {
  recuperado: boolean;
  dias: number;        // recuperado: vale→volta ao pico; senão: vale→última data
  ate: string | null;  // data da recuperação (YYYY-MM-DD) quando recuperado
}

const diasCorridos = (a: string, b: string) =>
  Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 86400000);

/**
 * Quanto tempo levou para voltar ao pico depois do drawdown máximo.
 * peakDate/troughDate vêm do Summary (mesmo episódio exibido nos cards).
 */
export function recuperacaoDrawdown(
  serie: Array<{ date: string; twr: number }>,
  peakDate: string | null | undefined,
  troughDate: string | null | undefined,
): Recuperacao | null {
  if (!peakDate || !troughDate || serie.length === 0) return null;
  const pico = serie.find((p) => p.date === peakDate);
  if (!pico) return null;
  for (const p of serie) {
    if (p.date > troughDate && p.twr >= pico.twr) {
      return { recuperado: true, dias: diasCorridos(troughDate, p.date), ate: p.date };
    }
  }
  const ultima = serie[serie.length - 1].date;
  return { recuperado: false, dias: diasCorridos(troughDate, ultima), ate: null };
}

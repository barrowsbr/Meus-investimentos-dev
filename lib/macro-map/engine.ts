// Motor de cálculo (Fase 2) — PURO e server-safe (sem deps de rede; a busca de
// dados vive em adapters.ts). Recebe séries de preço já alinhadas e produz o
// veredito de divergência do dia + a taxa de concordância de sinal ao vivo.
//
// Decisões de MVP (assumidas de propósito — ver README/INVENTARIO):
//  • z-score rolante em DUAS janelas (60d e 250d); o disparo exige concordância
//    das duas (as duas cruzam o limiar) — reduz falso positivo de ruído curto.
//  • taxa_acerto ao vivo = fração de episódios passados em que o efeito primário
//    veio no sinal esperado dentro da defasagem (sign-agreement — a métrica
//    central do briefing). Nunca escrita à mão.
//  • "regime_rompido" automático fica para a Fase 2 formal (precisa de faixa de
//    validade numérica); aqui o estado é Confirmado / Anômalo / Quiescente.

import type { Rule, RuleEvaluation, EffectOutcome, Estado, Efeito, Confianca } from "./types";

export interface Series {
  dates: string[]; // ascendente
  values: number[]; // alinhado 1:1 com dates
}

export interface EngineParams {
  zCurto: number; // janela curta (default 60)
  zLongo: number; // janela longa (default 250)
  janelaChoqueDias: number; // quão recente o choque precisa ser p/ contar como "hoje"
  deadband: number; // |retorno| abaixo disso conta como movimento nulo
  // Efeitos medidos por DIFERENÇA de nível (Δ pontos percentuais / 100), não por
  // razão b/a−1: séries de juro/spread cruzam zero (curva invertida, yield real
  // negativo) e a razão inverte o sinal com base negativa. /100 deixa a escala
  // comparável a retorno (10 bps ≈ 0,001 = deadband).
  efeitoNivel?: Set<string>;
}

export const DEFAULT_PARAMS: EngineParams = {
  zCurto: 60,
  zLongo: 250,
  janelaChoqueDias: 5,
  deadband: 0.001,
};

// ── métricas derivadas ───────────────────────────────────────────────────────

// Converte a série de preço/nível na métrica escalar do choque. z-score é
// invariante à escala, então convenções (ex.: ^TNX ×10) não afetam o disparo.
export function metricSeries(price: Series, metrica: string): Series {
  const m = metrica.trim().toLowerCase();
  const ret = m.match(/^retorno_(\d+)d$/);
  if (ret) {
    const n = Number(ret[1]);
    return shiftDerive(price, n, (a, b) => (a === 0 ? 0 : b / a - 1));
  }
  const bps = m.match(/^variacao_bps_(\d+)d$/);
  if (bps) {
    const n = Number(bps[1]);
    return shiftDerive(price, n, (a, b) => b - a);
  }
  // nivel / nivel_percentil / qualquer outra → o próprio nível
  return { dates: [...price.dates], values: [...price.values] };
}

function shiftDerive(s: Series, n: number, f: (prev: number, cur: number) => number): Series {
  const dates: string[] = [];
  const values: number[] = [];
  for (let i = n; i < s.values.length; i++) {
    dates.push(s.dates[i]);
    values.push(f(s.values[i - n], s.values[i]));
  }
  return { dates, values };
}

// ── z-score rolante ──────────────────────────────────────────────────────────

export function rollingZ(s: Series, window: number): Series {
  const dates: string[] = [];
  const values: number[] = [];
  for (let i = window - 1; i < s.values.length; i++) {
    const win = s.values.slice(i - window + 1, i + 1);
    const mean = win.reduce((a, b) => a + b, 0) / win.length;
    const varc = win.reduce((a, b) => a + (b - mean) * (b - mean), 0) / win.length;
    const sd = Math.sqrt(varc);
    dates.push(s.dates[i]);
    values.push(sd === 0 ? 0 : (s.values[i] - mean) / sd);
  }
  return { dates, values };
}

// ── detecção de choque ───────────────────────────────────────────────────────

export interface Shock {
  date: string;
  z: number;
}

function crossed(z: number, limiar: number, direcao: string): boolean {
  return direcao === "alta" ? z >= limiar : z <= -limiar;
}

// Choques que cruzam o limiar NAS DUAS janelas (concordância curto+longo).
export function detectShocks(
  price: Series,
  metrica: string,
  limiar: number,
  direcao: string,
  p: EngineParams
): Shock[] {
  const metric = metricSeries(price, metrica);
  const zc = rollingZ(metric, p.zCurto);
  const zl = rollingZ(metric, p.zLongo);
  const zlByDate = new Map(zl.dates.map((d, i) => [d, zl.values[i]]));
  const out: Shock[] = [];
  for (let i = 0; i < zc.dates.length; i++) {
    const d = zc.dates[i];
    const zcur = zc.values[i];
    const zlong = zlByDate.get(d);
    if (zlong == null) continue; // sem janela longa ainda
    if (crossed(zcur, limiar, direcao) && crossed(zlong, limiar, direcao)) {
      out.push({ date: d, z: zcur });
    }
  }
  return out;
}

// ── utilidades de série ──────────────────────────────────────────────────────

// valor do último pregão em ou antes de `date` (tolera calendários diferentes).
export function valueOnOrBefore(s: Series, date: string): number | null {
  let lo = 0,
    hi = s.dates.length - 1,
    ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.dates[mid] <= date) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans >= 0 ? s.values[ans] : null;
}

export function returnBetween(s: Series, from: string, to: string): number | null {
  const a = valueOnOrBefore(s, from);
  const b = valueOnOrBefore(s, to);
  if (a == null || b == null || a === 0) return null;
  return b / a - 1;
}

const sign = (x: number, deadband: number): -1 | 0 | 1 => (x > deadband ? 1 : x < -deadband ? -1 : 0);

// ── classificação de uma regra ───────────────────────────────────────────────

// Retorno realizado do efeito na janela de defasagem, medido a partir do pregão
// ANTERIOR à abertura da janela (baseIdx = choque + lagMin − 1) até o fim
// (choque + lagMax, limitado por endClampIdx). Assim uma defasagem [0,n] captura
// o próprio dia do choque (ex.: regra 6, contemporânea), sem virar 0 quando o
// choque cai no último pregão. hasSpan=false quando a janela ainda não abriu.
function effectReturn(
  effPrice: Series,
  cal: string[],
  shockIdx: number,
  lagMin: number,
  lagMax: number,
  endClampIdx: number,
  deadband: number,
  nivel = false
): { outcome: Omit<EffectOutcome, "ativo" | "esperado" | "confianca"> | null; hasSpan: boolean } {
  const baseIdx = Math.max(0, shockIdx + lagMin - 1);
  const endIdx = Math.min(shockIdx + lagMax, endClampIdx);
  if (endIdx <= baseIdx) return { outcome: null, hasSpan: false };
  let ret: number | null;
  if (nivel) {
    const a = valueOnOrBefore(effPrice, cal[baseIdx]);
    const b = valueOnOrBefore(effPrice, cal[endIdx]);
    ret = a == null || b == null ? null : (b - a) / 100;
  } else {
    ret = returnBetween(effPrice, cal[baseIdx], cal[endIdx]);
  }
  if (ret == null) return { outcome: null, hasSpan: false };
  const obs = sign(ret, deadband);
  return { outcome: { observado: obs, confirmado: false, retorno: ret }, hasSpan: true };
}

export function classifyRule(
  rule: Rule,
  driverPrice: Series | undefined,
  effectPrices: Record<string, Series | undefined>,
  params: EngineParams = DEFAULT_PARAMS
): RuleEvaluation {
  const base = {
    id: rule.id,
    titulo: rule.titulo,
    familia: rule.familia,
    choque: rule.choque,
    relevancia_portfolio: rule.relevancia_portfolio,
    canal: rule.canal,
    falsificacao: rule.falsificacao,
  };

  const driverOk = !!driverPrice && driverPrice.values.length >= params.zLongo;
  const efeitosDisponiveis = rule.efeitos.filter((e) => !!effectPrices[e.ativo]);
  const efeitosNaoMedidos = rule.efeitos.filter((e) => !effectPrices[e.ativo]).map((e) => e.ativo);

  // sem_dados só quando falta o DRIVER ou TODOS os efeitos. Com o driver e ao
  // menos um efeito, a regra roda nos disponíveis (os demais viram "não medido").
  if (!driverOk || efeitosDisponiveis.length === 0) {
    const faltando: string[] = [];
    if (!driverOk) faltando.push(rule.choque.driver);
    faltando.push(...efeitosNaoMedidos);
    return {
      ...base,
      estado: "sem_dados" as Estado,
      disponivel: false,
      driversFaltando: [...new Set(faltando)],
      efeitosNaoMedidos,
      choqueAtivo: false,
      ultimoChoque: null,
      ultimoChoqueGeral: null,
      efeitos: [],
      taxaAcertoLive: null,
      nEventos: 0,
    };
  }

  const dp = driverPrice!;
  const cal = dp.dates;
  const shocks = detectShocks(dp, rule.choque.metrica, rule.choque.limiar_sigma, rule.choque.direcao, params);

  // z das duas janelas para exibir no último choque
  const metric = metricSeries(dp, rule.choque.metrica);
  const zcSeries = rollingZ(metric, params.zCurto);
  const zlSeries = rollingZ(metric, params.zLongo);
  const zcMap = new Map(zcSeries.dates.map((d, i) => [d, zcSeries.values[i]]));
  const zlMap = new Map(zlSeries.dates.map((d, i) => [d, zlSeries.values[i]]));

  const lastIdx = cal.length - 1;

  // ── taxa de concordância ao vivo: episódios com defasagem JÁ decorrida ──
  const primary = pickPrimary(efeitosDisponiveis);
  const primaryPrice = effectPrices[primary.ativo]!;
  let conf = 0;
  let tot = 0;
  for (const sh of shocks) {
    const idx = forwardIdx(cal, sh.date);
    if (idx + primary.defasagem_dias[1] > lastIdx) continue; // janela ainda não decorreu
    const { outcome, hasSpan } = effectReturn(primaryPrice, cal, idx, primary.defasagem_dias[0], primary.defasagem_dias[1], lastIdx, params.deadband, params.efeitoNivel?.has(primary.ativo));
    if (!hasSpan || !outcome) continue;
    tot++;
    if (outcome.observado === primary.sinal) conf++;
  }
  const taxaAcertoLive = tot > 0 ? conf / tot : null;

  // ── último choque da série inteira (informa o card mesmo em dia calmo) ──
  let ultimoChoqueGeral: RuleEvaluation["ultimoChoqueGeral"] = null;
  if (shocks.length) {
    const sh = shocks[shocks.length - 1];
    const idx = forwardIdx(cal, sh.date);
    let primarioConfirmado: boolean | null = null;
    if (idx + primary.defasagem_dias[1] <= lastIdx) {
      const { outcome, hasSpan } = effectReturn(primaryPrice, cal, idx, primary.defasagem_dias[0], primary.defasagem_dias[1], lastIdx, params.deadband, params.efeitoNivel?.has(primary.ativo));
      if (hasSpan && outcome) primarioConfirmado = outcome.observado === primary.sinal;
    }
    ultimoChoqueGeral = { date: sh.date, z60: round(zcMap.get(sh.date) ?? sh.z), z250: round(zlMap.get(sh.date) ?? 0), primarioConfirmado };
  }

  // ── estado de hoje: choque mais recente dentro da janela ──
  const recentes = shocks.filter((s) => withinLastDays(cal, s.date, params.janelaChoqueDias));
  const ultimo = recentes.length ? recentes[recentes.length - 1] : null;

  let estado: Estado = "quiescente";
  let efeitos: EffectOutcome[] = [];
  if (ultimo) {
    const shockIdx = forwardIdx(cal, ultimo.date);
    efeitos = efeitosDisponiveis
      .map((ef): EffectOutcome | null => {
        const { outcome, hasSpan } = effectReturn(effectPrices[ef.ativo]!, cal, shockIdx, ef.defasagem_dias[0], ef.defasagem_dias[1], lastIdx, params.deadband, params.efeitoNivel?.has(ef.ativo));
        if (!hasSpan || !outcome) return null;
        return { ativo: ef.ativo, esperado: ef.sinal, observado: outcome.observado, confirmado: outcome.observado === ef.sinal, retorno: outcome.retorno, confianca: ef.confianca };
      })
      .filter((x): x is EffectOutcome => x != null);
    if (efeitos.length === 0) {
      // houve choque, mas nenhuma janela de efeito abriu ainda
      estado = "observando";
    } else {
      const considerados = efeitos.filter((e) => e.confianca !== "baixa");
      const pool = considerados.length ? considerados : efeitos;
      const okFrac = pool.filter((e) => e.confirmado).length / pool.length;
      estado = okFrac >= 0.5 ? "confirmado" : "anomalo";
    }
  }

  return {
    ...base,
    estado,
    disponivel: true,
    driversFaltando: [],
    efeitosNaoMedidos,
    choqueAtivo: !!ultimo,
    ultimoChoque: ultimo
      ? { date: ultimo.date, z60: round(zcMap.get(ultimo.date) ?? ultimo.z), z250: round(zlMap.get(ultimo.date) ?? 0) }
      : null,
    ultimoChoqueGeral,
    efeitos,
    taxaAcertoLive,
    nEventos: tot,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function pickPrimary(efeitos: Efeito[]): Efeito {
  return efeitos.find((e) => e.confianca === "alta") ?? efeitos[0];
}

function forwardIdx(cal: string[], from: string): number {
  let idx = -1,
    lo = 0,
    hi = cal.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cal[mid] <= from) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return idx < 0 ? 0 : idx;
}

function withinLastDays(cal: string[], date: string, k: number): boolean {
  const idx = forwardIdx(cal, date);
  return idx >= cal.length - k;
}

const round = (x: number) => Math.round(x * 100) / 100;

export function summarize(avaliacoes: RuleEvaluation[]) {
  return {
    anomalo: avaliacoes.filter((a) => a.estado === "anomalo").length,
    confirmado: avaliacoes.filter((a) => a.estado === "confirmado").length,
    observando: avaliacoes.filter((a) => a.estado === "observando").length,
    quiescente: avaliacoes.filter((a) => a.estado === "quiescente").length,
    semDados: avaliacoes.filter((a) => a.estado === "sem_dados").length,
  };
}

// Adapter de dados (Fase 0 → runtime) — SERVER-ONLY (puxa lib/cotacoes → Yahoo).
// Contrato do briefing: LÊ a camada de dados existente do Radar; só as séries que
// o Radar não cobre precisariam de fonte externa. Aqui, para o MVP, todas as
// séries `yahoo` (prontas + backfill) vêm por fetchHistory — o mesmo caminho que
// o Radar usa. As séries `fonte_nova` (yield real, HY spread, Focus, juro longo
// BR, prêmio de risco) ainda NÃO existem → retornam indisponível e a regra fica
// "sem_dados" (nunca inventamos número).

import { fetchHistory } from "@/lib/cotacoes";
import { classifyRule, summarize, DEFAULT_PARAMS, type Series, type EngineParams } from "./engine";
import { RULES, DRIVERS } from "./rules.generated";
import type { DivergenceReport, RuleEvaluation, Estado } from "./types";

const driverBySym = new Map(DRIVERS.map((d) => [d.simbolo, d]));

// Converte {date,close}[] do Yahoo numa Series ascendente e deduplicada.
function toSeries(rows: { date: string; close: number }[]): Series {
  const byDate = new Map<string, number>();
  for (const r of rows) {
    if (typeof r.close === "number" && isFinite(r.close) && r.close > 0) byDate.set(r.date, r.close);
  }
  const dates = [...byDate.keys()].sort();
  return { dates, values: dates.map((d) => byDate.get(d)!) };
}

async function fetchSeries(sym: string): Promise<Series | undefined> {
  const d = driverBySym.get(sym);
  if (!d || d.fonte !== "yahoo" || d.prontidao === "fonte_nova") return undefined; // fonte não integrada
  try {
    const rows = await fetchHistory(d.simbolo_fonte, "2y", "1d");
    if (!rows.length) return undefined;
    const s = toSeries(rows);
    return s.dates.length ? s : undefined;
  } catch {
    return undefined;
  }
}

// Busca cada símbolo UMA vez (dedup driver/efeito) e em paralelo.
async function fetchAllSeries(symbols: string[]): Promise<Record<string, Series | undefined>> {
  const uniq = [...new Set(symbols)];
  const results = await Promise.all(uniq.map((s) => fetchSeries(s)));
  const out: Record<string, Series | undefined> = {};
  uniq.forEach((s, i) => (out[s] = results[i]));
  return out;
}

// Prioridade visual: o produto são os alertas de alta prioridade primeiro.
const ORDEM: Record<Estado, number> = {
  anomalo: 0,
  regime_rompido: 0,
  observando: 1,
  confirmado: 2,
  quiescente: 3,
  sem_dados: 4,
};

export async function buildDivergenceReport(params?: Partial<EngineParams>): Promise<DivergenceReport> {
  const symbols: string[] = [];
  for (const r of RULES) {
    symbols.push(r.choque.driver);
    for (const e of r.efeitos) symbols.push(e.ativo);
  }
  const series = await fetchAllSeries(symbols);

  const p: EngineParams | undefined = params ? { ...DEFAULT_PARAMS, ...params } : undefined;

  const avaliacoes: RuleEvaluation[] = RULES.map((r) => {
    const effects: Record<string, Series | undefined> = {};
    for (const e of r.efeitos) effects[e.ativo] = series[e.ativo];
    return classifyRule(r, series[r.choque.driver], effects, p);
  });

  avaliacoes.sort((a, b) => ORDEM[a.estado] - ORDEM[b.estado] || a.id.localeCompare(b.id));

  // último pregão observado = data mais recente entre as séries disponíveis
  let dataPregao: string | null = null;
  for (const s of Object.values(series)) {
    if (s && s.dates.length) {
      const last = s.dates[s.dates.length - 1];
      if (!dataPregao || last > dataPregao) dataPregao = last;
    }
  }

  return {
    geradoEm: new Date().toISOString(),
    dataPregao,
    avaliacoes,
    resumo: summarize(avaliacoes),
  };
}

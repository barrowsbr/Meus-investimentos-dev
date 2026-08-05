// Adapter de dados (Fase 0 → runtime) — SERVER-ONLY (puxa lib/cotacoes → Yahoo).
// Contrato do briefing: LÊ a camada de dados existente do Radar; só as séries que
// o Radar não cobre precisariam de fonte externa. Aqui, para o MVP, todas as
// séries `yahoo` (prontas + backfill) vêm por fetchHistory — o mesmo caminho que
// o Radar usa. As séries `fonte_nova` (yield real, HY spread, Focus, juro longo
// BR, prêmio de risco) ainda NÃO existem → retornam indisponível e a regra fica
// "sem_dados" (nunca inventamos número).

import { fetchHistory } from "@/lib/cotacoes";
import { classifyRule, summarize, DEFAULT_PARAMS, type Series, type EngineParams } from "./engine";
import { fetchFred, fetchFocusSelic } from "./sources";
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

// Proxy de prêmio de risco Brasil: razão S&P 500 / EWZ (Brasil, USD). Sobe quando
// o Brasil desempenha PIOR que os EUA — ou seja, cresce com o prêmio de risco. Os
// dois já vêm do Yahoo, então isso vira uma série de 5 anos sem fonte externa.
async function fetchRatio(numer: string, denom: string): Promise<{ date: string; close: number }[]> {
  const [ra, rb] = await Promise.all([fetchHistory(numer, "5y", "1d"), fetchHistory(denom, "5y", "1d")]);
  const mb = new Map(rb.map((r) => [r.date, r.close]));
  const out: { date: string; close: number }[] = [];
  for (const r of ra) {
    const vb = mb.get(r.date);
    if (vb && vb > 0 && r.close > 0) out.push({ date: r.date, close: r.close / vb });
  }
  return out;
}

// Proxy de YIELD a partir do PREÇO de um ETF de renda fixa (Yahoo). Preço de bond
// sobe quando o yield cai → invertemos (1000/preço) para a série se mover JUNTO
// com o juro. Usado no juro longo BR via IMA-B (cesta de NTN-B). Escala 1000 só
// para números legíveis; retornos são invariantes à escala.
async function fetchInverseYahoo(sym: string): Promise<{ date: string; close: number }[]> {
  const rows = await fetchHistory(sym, "5y", "1d");
  return rows.filter((r) => r.close > 0).map((r) => ({ date: r.date, close: 1000 / r.close }));
}

async function fetchSeries(sym: string): Promise<Series | undefined> {
  const d = driverBySym.get(sym);
  if (!d) return undefined;
  try {
    let rows: { date: string; close: number }[];
    if (sym === "BR_RISK_PREMIUM") rows = await fetchRatio("^GSPC", "EWZ"); // proxy S&P/EWZ
    else if (sym === "BR_10Y") rows = await fetchInverseYahoo("IMAB11.SA"); // proxy: inverso do ETF IMA-B (NTN-B)
    // 5 anos: choques >= 2σ são raros; janela curta demais deixa a taxa de
    // concordância com n minúsculo. O z-score segue em 60/250d.
    else if (d.fonte === "yahoo") rows = await fetchHistory(d.simbolo_fonte, "5y", "1d");
    else if (d.fonte === "fred") rows = await fetchFred(d.simbolo_fonte);
    else if (d.fonte === "bcb") rows = await fetchFocusSelic();
    else return undefined; // fonte ainda não integrada
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

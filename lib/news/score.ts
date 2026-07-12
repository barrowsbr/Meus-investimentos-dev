// Scoring ÚNICO de notícias — substitui as 4 listas de keywords dessincronizadas
// que viviam copiadas nas rotas. score() combina:
//   impacto (keywords) + interesse do perfil + recência (half-life) + bônus de
//   imagem (foto real > sem foto, decisão de produto) + curadoria LLM (0-10).

import type { NewsItem, NewsImpacto } from "./types";
import type { Tema } from "./temas";

const HIGH_IMPACT: string[] = [
  "selic", "copom", "fomc", "fed ", "rate cut", "rate hike",
  "corte de juros", "alta de juros", "decisão de juros",
  "inflação", "ipca", "cpi ", "pce ", "pib", "gdp", "recessão", "recession",
  "ipo", "falência", "bankruptcy", "recuperação judicial",
  "fusão", "merger", "aquisição", "acquisition", "takeover",
  "default", "moratória", "downgrade soberano",
  "guerra", "war ", "sanções", "sanctions", "tarifa", "tariff",
  "payroll", "unemployment", "breaking", "urgente",
];

const MEDIUM_IMPACT: string[] = [
  "balanço", "resultados", "earnings", "guidance", "projeção",
  "preço-alvo", "price target", "upgrade", "downgrade", "rating",
  "volatilidade", "sell-off", "rally", "câmbio", "dólar", "petróleo", "crude oil",
  "treasury", "bond yield", "lucro", "profit", "receita", "revenue",
  "dividendo", "dividend", "recompra", "buyback", "regulação", "regulation",
];

export function scoreImpacto(titulo: string): NewsImpacto {
  const t = titulo.toLowerCase();
  if (HIGH_IMPACT.some((kw) => t.includes(kw))) return "alto";
  if (MEDIUM_IMPACT.some((kw) => t.includes(kw))) return "medio";
  return "baixo";
}

const W_IMPACTO: Record<NewsImpacto, number> = { alto: 30, medio: 12, baixo: 0 };
const W_INTERESSE = 28;      // tema bate com o perfil
const W_IMAGEM = 18;         // foto real disponível
const W_RECENCIA_MAX = 40;   // agora; decai exponencial
const HALF_LIFE_H = 18;      // meia-vida da recência (horas)
const W_CURADORIA = 4;       // × rel (0-10) do curador LLM

export interface ScoreCtx {
  interesses: Set<Tema>;
  agora?: number;
  curadoria?: Map<string, { rel: number }>; // por link
}

export function scoreNoticia(item: NewsItem, ctx: ScoreCtx): number {
  let s = W_IMPACTO[item.impacto] ?? 0;
  const tema = (item.tema ?? "outros") as Tema;
  if (ctx.interesses.has(tema)) s += W_INTERESSE;
  if (item.imagem) s += W_IMAGEM;
  const ts = item.data ? new Date(item.data).getTime() : 0;
  if (ts > 0) {
    const horas = Math.max(0, ((ctx.agora ?? Date.now()) - ts) / 3_600_000);
    s += W_RECENCIA_MAX * Math.pow(0.5, horas / HALF_LIFE_H);
  }
  const cur = ctx.curadoria?.get(item.link);
  if (cur) s += W_CURADORIA * cur.rel;
  return s;
}

export function rankNoticias(items: NewsItem[], ctx: ScoreCtx): NewsItem[] {
  const agora = ctx.agora ?? Date.now();
  return [...items]
    .map((it) => ({ it, s: scoreNoticia(it, { ...ctx, agora }) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.it);
}

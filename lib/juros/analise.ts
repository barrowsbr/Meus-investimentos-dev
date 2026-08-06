// Análise da curva de juros — PURO (sem rede), por isso testável em CI.
// Deriva: formato da curva, inclinação, inflação implícita (breakeven) e uma
// leitura em português. Nada aqui inventa dado: se falta vértice, devolve null.

import type { Vertice, Breakeven, AnaliseCurva } from "./types";

/** Prazo em anos entre hoje e o vencimento (fração, base 365,25). */
export function anosAte(vencimentoISO: string, hojeISO: string): number {
  const v = Date.parse(vencimentoISO + (vencimentoISO.length <= 10 ? "T12:00:00Z" : ""));
  const h = Date.parse(hojeISO + (hojeISO.length <= 10 ? "T12:00:00Z" : ""));
  if (!isFinite(v) || !isFinite(h)) return 0;
  return Math.max(0, (v - h) / (365.25 * 86400000));
}

/**
 * Inflação implícita (breakeven) de Fisher entre um título nominal e um real de
 * prazo próximo: (1+nominal)/(1+real) − 1. É o que o mercado precifica de IPCA
 * médio até aquele vencimento.
 */
export function breakeven(nominalPct: number, realPct: number): number {
  const n = nominalPct / 100;
  const r = realPct / 100;
  return ((1 + n) / (1 + r) - 1) * 100;
}

/**
 * Casa cada prefixado com o título real (IPCA+) de vencimento MAIS PRÓXIMO,
 * respeitando uma tolerância de prazo — senão o breakeven compara maçã com
 * laranja. Devolve ordenado por prazo.
 */
export function calcularBreakevens(
  prefixados: Vertice[],
  reais: Vertice[],
  toleranciaAnos = 2.5,
): Breakeven[] {
  const out: Breakeven[] = [];
  for (const p of prefixados) {
    let melhor: Vertice | null = null;
    let dist = Infinity;
    for (const r of reais) {
      const d = Math.abs(r.anos - p.anos);
      if (d < dist) { dist = d; melhor = r; }
    }
    if (!melhor || dist > toleranciaAnos) continue;
    out.push({
      anos: p.anos,
      vencimentoNominal: p.vencimento,
      vencimentoReal: melhor.vencimento,
      nominal: p.taxa,
      real: melhor.taxa,
      implicita: breakeven(p.taxa, melhor.taxa),
    });
  }
  return out.sort((a, b) => a.anos - b.anos);
}

const fmt = (x: number, d = 2) => x.toFixed(d).replace(".", ",");

/**
 * Formato da curva + leitura em português. A inclinação é medida entre o vértice
 * mais curto e o mais longo dos PREFIXADOS (a curva nominal).
 * Limiar de 25 bps para chamar de "plana" — abaixo disso é ruído.
 */
export function analisarCurva(
  prefixados: Vertice[],
  reais: Vertice[],
  breakevens: Breakeven[],
  planaBps = 25,
): AnaliseCurva {
  const ord = [...prefixados].sort((a, b) => a.anos - b.anos);
  const curto = ord[0] ?? null;
  const longo = ord.length > 1 ? ord[ord.length - 1] : null;

  const inclinacaoBps = curto && longo ? Math.round((longo.taxa - curto.taxa) * 100) : 0;
  const formato: AnaliseCurva["formato"] =
    Math.abs(inclinacaoBps) < planaBps ? "plana" : inclinacaoBps > 0 ? "inclinada" : "invertida";

  const reaisOrd = [...reais].sort((a, b) => a.anos - b.anos);
  const juroRealLongo = reaisOrd.length ? reaisOrd[reaisOrd.length - 1].taxa : null;
  const implicitaMedia = breakevens.length
    ? breakevens.reduce((s, b) => s + b.implicita, 0) / breakevens.length
    : null;

  let leitura: string;
  if (!curto || !longo) {
    leitura = "Dados insuficientes para ler o formato da curva.";
  } else {
    const desc =
      formato === "invertida"
        ? `Curva INVERTIDA: o juro longo (${fmt(longo.taxa)}%) está ABAIXO do curto (${fmt(curto.taxa)}%) — o mercado precifica queda de juros à frente, o que costuma vir junto de desaceleração.`
        : formato === "plana"
          ? `Curva PLANA: juro curto (${fmt(curto.taxa)}%) e longo (${fmt(longo.taxa)}%) praticamente no mesmo nível — o mercado não vê mudança relevante de rumo.`
          : `Curva INCLINADA: o juro longo (${fmt(longo.taxa)}%) está ACIMA do curto (${fmt(curto.taxa)}%), diferença de ${inclinacaoBps} bps — prêmio por prazo, típico de expectativa de juros ou risco fiscal maiores à frente.`;
    const real = juroRealLongo != null ? ` Juro real longo em ${fmt(juroRealLongo)}% ao ano acima do IPCA.` : "";
    const inf = implicitaMedia != null ? ` Inflação implícita média de ${fmt(implicitaMedia)}% ao ano.` : "";
    leitura = desc + real + inf;
  }

  return { formato, inclinacaoBps, curto, longo, juroRealLongo, implicitaMedia, leitura };
}

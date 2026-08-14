import { describe, expect, it } from "vitest";
import { histogramaRetornos, recuperacaoDrawdown, retornosDiarios, vsMercado, type PontoRisco } from "../risco-metricas";

// Série sintética: portfólio = 1,5× o benchmark todo dia → beta 1,5, corr ~1,
// alfa ~0. Retornos alternados para ter variância.
function serieSintetica(n: number, fator: number): PontoRisco[] {
  const out: PontoRisco[] = [];
  let cumB = 0, cumP = 0;
  for (let i = 0; i < n; i++) {
    const rb = (i % 2 === 0 ? 1 : -1) * 0.01 + 0.0005; // ±1% alternado + drift
    const rp = rb * fator;
    cumB = (1 + cumB) * (1 + rb) - 1;
    cumP = (1 + cumP) * (1 + rp) - 1;
    out.push({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, ret: i === 0 ? null : rp, twr: cumP, bench: cumB, rf: 0 });
  }
  return out;
}

describe("retornosDiarios", () => {
  it("recupera o retorno diário da série acumulada", () => {
    const rets = retornosDiarios([0, 0.01, 0.0302]); // dia2 +1%, dia3 +2%
    expect(rets[0]).toBeNull();
    expect(rets[1]!).toBeCloseTo(0.01, 10);
    expect(rets[2]!).toBeCloseTo(0.02, 10);
  });
  it("propaga null sem quebrar", () => {
    expect(retornosDiarios([0, null, 0.02])).toEqual([null, null, null]);
  });
});

describe("vsMercado", () => {
  it("beta 1,5 e correlação ~1 para portfólio 1,5× o benchmark", () => {
    const r = vsMercado(serieSintetica(120, 1.5))!;
    expect(r.beta).toBeCloseTo(1.5, 2);
    expect(r.correlacao).toBeCloseTo(1, 3);
    expect(Math.abs(r.alfaAA)).toBeLessThan(0.01);
    expect(r.pregoes).toBeGreaterThanOrEqual(100);
  });
  it("beta defensivo <1", () => {
    const r = vsMercado(serieSintetica(120, 0.5))!;
    expect(r.beta).toBeCloseTo(0.5, 2);
  });
  it("null com menos de 60 pregões em comum", () => {
    expect(vsMercado(serieSintetica(40, 1))).toBeNull();
  });
  it("null quando o benchmark não tem dados", () => {
    const s = serieSintetica(120, 1).map((p) => ({ ...p, bench: null }));
    expect(vsMercado(s)).toBeNull();
  });
});

describe("histogramaRetornos", () => {
  it("conta faixas e pregões positivos", () => {
    const h = histogramaRetornos([null, -0.03, -0.015, -0.002, 0, 0.004, 0.012, 0.05]);
    expect(h.total).toBe(7);
    expect(h.positivos).toBe(3); // 0 exato NÃO conta como positivo
    expect(h.faixas.map((f) => f.n)).toEqual([1, 1, 1, 2, 1, 1]); // zero cai em "0 a +1%"
  });
});

describe("recuperacaoDrawdown", () => {
  const serie = [
    { date: "2026-01-01", twr: 0.10 },  // pico
    { date: "2026-01-05", twr: 0.02 },  // vale
    { date: "2026-01-12", twr: 0.08 },
    { date: "2026-01-20", twr: 0.11 },  // recuperou
  ];
  it("mede vale→recuperação em dias corridos", () => {
    const r = recuperacaoDrawdown(serie, "2026-01-01", "2026-01-05")!;
    expect(r.recuperado).toBe(true);
    expect(r.ate).toBe("2026-01-20");
    expect(r.dias).toBe(15);
  });
  it("em andamento quando nunca volta ao pico", () => {
    const r = recuperacaoDrawdown(serie.slice(0, 3), "2026-01-01", "2026-01-05")!;
    expect(r.recuperado).toBe(false);
    expect(r.dias).toBe(7); // vale → última data
  });
});

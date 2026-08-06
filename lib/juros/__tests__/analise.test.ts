import { describe, it, expect } from "vitest";
import { anosAte, breakeven, calcularBreakevens, analisarCurva } from "../analise";
import type { Vertice } from "../types";

const v = (nm: string, idx: Vertice["indexador"], venc: string, anos: number, taxa: number): Vertice => ({
  titulo: nm, indexador: idx, vencimento: venc, anos, taxa, taxaResgate: null, precoUnitario: null, juroSemestral: false,
});

describe("anosAte", () => {
  it("calcula o prazo em anos (fração)", () => {
    expect(anosAte("2027-01-01", "2026-01-01")).toBeCloseTo(1, 1);
    expect(anosAte("2031-01-01", "2026-01-01")).toBeCloseTo(5, 1);
  });
  it("nunca devolve negativo (título vencido)", () => {
    expect(anosAte("2020-01-01", "2026-01-01")).toBe(0);
  });
});

describe("breakeven (Fisher)", () => {
  it("nominal 13% e real 7% dão ~5,6% de inflação implícita", () => {
    // (1.13/1.07 - 1) = 5.607%
    expect(breakeven(13, 7)).toBeCloseTo(5.607, 2);
  });
  it("não é subtração simples (usa Fisher, não 13-7=6)", () => {
    expect(breakeven(13, 7)).toBeLessThan(6);
  });
});

describe("calcularBreakevens", () => {
  const pre = [v("Pre 2029", "PREFIXADO", "2029-01-01", 3, 13), v("Pre 2033", "PREFIXADO", "2033-01-01", 7, 13.5)];
  const ipca = [v("IPCA 2029", "IPCA", "2029-05-15", 3.4, 7), v("IPCA 2035", "IPCA", "2035-05-15", 9.4, 7.2)];

  it("casa cada prefixado com o real de prazo mais próximo", () => {
    const bes = calcularBreakevens(pre, ipca);
    expect(bes).toHaveLength(2);
    expect(bes[0].vencimentoReal).toBe("2029-05-15");
    expect(bes[0].implicita).toBeCloseTo(5.607, 2);
  });

  it("descarta par fora da tolerância de prazo (não compara maçã com laranja)", () => {
    const so2035 = [v("IPCA 2035", "IPCA", "2035-05-15", 9.4, 7.2)];
    const bes = calcularBreakevens(pre, so2035, 2.5); // 3 vs 9.4 anos e 7 vs 9.4
    expect(bes.map((b) => b.anos)).toEqual([7]); // só o de 7 anos entra (dist 2.4)
  });

  it("devolve vazio quando não há títulos reais", () => {
    expect(calcularBreakevens(pre, [])).toEqual([]);
  });

  it("sai ordenado por prazo", () => {
    const bes = calcularBreakevens([...pre].reverse(), ipca);
    expect(bes[0].anos).toBeLessThan(bes[1].anos);
  });
});

describe("analisarCurva", () => {
  it("INCLINADA quando o longo está acima do curto", () => {
    const pre = [v("Pre 2027", "PREFIXADO", "2027-01-01", 1, 12), v("Pre 2033", "PREFIXADO", "2033-01-01", 7, 14)];
    const a = analisarCurva(pre, [], []);
    expect(a.formato).toBe("inclinada");
    expect(a.inclinacaoBps).toBe(200);
    expect(a.leitura).toContain("INCLINADA");
  });

  it("INVERTIDA quando o longo está abaixo do curto", () => {
    const pre = [v("Pre 2027", "PREFIXADO", "2027-01-01", 1, 14), v("Pre 2033", "PREFIXADO", "2033-01-01", 7, 12.5)];
    const a = analisarCurva(pre, [], []);
    expect(a.formato).toBe("invertida");
    expect(a.inclinacaoBps).toBe(-150);
    expect(a.leitura).toContain("queda de juros");
  });

  it("PLANA quando a diferença é menor que o limiar", () => {
    const pre = [v("Pre 2027", "PREFIXADO", "2027-01-01", 1, 13), v("Pre 2033", "PREFIXADO", "2033-01-01", 7, 13.1)];
    const a = analisarCurva(pre, [], []);
    expect(a.formato).toBe("plana");
  });

  it("inclui juro real longo e inflação implícita média na leitura", () => {
    const pre = [v("Pre 2027", "PREFIXADO", "2027-01-01", 1, 12), v("Pre 2033", "PREFIXADO", "2033-01-01", 7, 14)];
    const ipca = [v("IPCA 2033", "IPCA", "2033-05-15", 7.4, 7)];
    const bes = calcularBreakevens(pre, ipca);
    const a = analisarCurva(pre, ipca, bes);
    expect(a.juroRealLongo).toBe(7);
    expect(a.implicitaMedia).not.toBeNull();
    expect(a.leitura).toContain("Juro real longo");
    expect(a.leitura).toContain("Inflação implícita");
  });

  it("degrada com honestidade quando falta vértice", () => {
    const a = analisarCurva([], [], []);
    expect(a.curto).toBeNull();
    expect(a.leitura).toContain("insuficientes");
  });
});

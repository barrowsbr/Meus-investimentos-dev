import { describe, expect, it } from "vitest";
import { construirCenarios } from "../cenarios";
import type { RuleEvaluation } from "../types";

const av = (over: Partial<RuleEvaluation>): RuleEvaluation => ({
  id: "r", titulo: "t", familia: "credito",
  estado: "quiescente", disponivel: true,
  driversFaltando: [], efeitosNaoMedidos: [],
  choque: { driver: "BRENT", metrica: "retorno_5d", direcao: "queda", limiar_sigma: 2 },
  choqueAtivo: false, ultimoChoque: null, ultimoChoqueGeral: null,
  zAtual: { z60: -1, z250: -0.8 },
  efeitos: [],
  efeitosEsperados: [{ ativo: "US10Y", sinal: -1, defasagem_dias: [0, 3], confianca: "alta" }],
  taxaAcertoLive: 0.55, nEventos: 18,
  relevancia_portfolio: ["VWRA"],
  canal: "c", falsificacao: "f",
  ...over,
});

describe("construirCenarios — eventos nativos e espelhados", () => {
  it("agrupa por driver·direção e cria o espelho da direção sem regra", () => {
    const { nativos, espelhados } = construirCenarios([av({})]);
    expect(nativos).toHaveLength(1);
    expect(nativos[0].titulo).toBe("Petróleo despenca");
    expect(nativos[0].espelhado).toBe(false);
    expect(nativos[0].efeitos[0]).toMatchObject({ ativo: "US10Y", sinal: -1, espelhado: false });

    expect(espelhados).toHaveLength(1);
    expect(espelhados[0].titulo).toBe("Petróleo dispara");
    expect(espelhados[0].espelhado).toBe(true);
    expect(espelhados[0].efeitos[0]).toMatchObject({ ativo: "US10Y", sinal: 1, espelhado: true }); // sinal invertido
  });

  it("driver com regra nas DUAS direções não gera espelho (caso VIX)", () => {
    const { nativos, espelhados } = construirCenarios([
      av({ id: "a", choque: { driver: "VIX", metrica: "retorno_2d", direcao: "alta", limiar_sigma: 2.5 } }),
      av({ id: "b", choque: { driver: "VIX", metrica: "nivel_percentil", direcao: "queda", limiar_sigma: 2 } }),
    ]);
    expect(nativos).toHaveLength(2);
    expect(espelhados).toHaveLength(0);
  });

  it("proximidade = z na direção do cenário ÷ limiar (negativo vira 0)", () => {
    const { nativos, espelhados } = construirCenarios([av({ zAtual: { z60: -1.5, z250: -1 } })]);
    // nativo é QUEDA: z −1,5 na direção queda = 1,5/2 = 0,75 do caminho
    expect(nativos[0].proximidade).toBeCloseTo(0.75, 6);
    // espelho é ALTA: z −1,5 não anda para alta → 0
    expect(espelhados[0].proximidade).toBe(0);
  });

  it("proximidade clampa em 1,5 e escolhe a regra mais avançada", () => {
    const { nativos } = construirCenarios([
      av({ id: "a", zAtual: { z60: -8, z250: -5 } }),
      av({ id: "b", zAtual: { z60: -0.5, z250: -0.2 } }),
    ]);
    expect(nativos[0].proximidade).toBe(1.5);
    expect(nativos[0].zRef).toEqual({ z60: -8, limiar: 2 });
  });

  it("dedup por ativo fica com a regra de melhor histórico e une a carteira", () => {
    const { nativos } = construirCenarios([
      av({ id: "fraca", taxaAcertoLive: 0.2, nEventos: 20, relevancia_portfolio: ["VWRA"] }),
      av({ id: "forte", taxaAcertoLive: 0.8, nEventos: 20, relevancia_portfolio: ["SHV"] }),
    ]);
    expect(nativos[0].efeitos).toHaveLength(1);
    expect(nativos[0].efeitos[0].regraId).toBe("forte");
    expect(nativos[0].carteira).toEqual(["SHV", "VWRA"]);
  });

  it("último episódio vem só do lado nativo (espelho não tem histórico)", () => {
    const { nativos, espelhados } = construirCenarios([
      av({ ultimoChoqueGeral: { date: "2026-04-10", z60: -2, z250: -2.4, primarioConfirmado: true } }),
    ]);
    expect(nativos[0].ultimoEpisodio).toEqual({ date: "2026-04-10", veio: true });
    expect(espelhados[0].ultimoEpisodio).toBeNull();
  });

  it("regra sem dados fica fora dos cenários", () => {
    const { nativos, espelhados } = construirCenarios([av({ disponivel: false })]);
    expect(nativos).toHaveLength(0);
    expect(espelhados).toHaveLength(0);
  });
});

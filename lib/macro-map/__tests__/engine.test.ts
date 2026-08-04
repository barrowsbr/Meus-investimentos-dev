import { describe, it, expect } from "vitest";
import { metricSeries, rollingZ, detectShocks, classifyRule, summarize, DEFAULT_PARAMS, type Series } from "../engine";
import { RULES } from "../rules.generated";
import type { Rule } from "../types";

// Séries sintéticas. O motor trata `dates` como rótulos ordenáveis opacos (não
// parseia data), então usamos "d0000".."dNNNN" — o teste controla o resultado.
function mkSeries(n: number, jumps: Record<number, number> = {}, noise = 0.0003, base = 100): Series {
  const dates: string[] = [];
  for (let i = 0; i < n; i++) dates.push("d" + String(i).padStart(4, "0"));
  const values: number[] = [base];
  for (let i = 1; i < n; i++) {
    const j = jumps[i];
    values.push(j != null ? values[i - 1] * (1 + j) : values[i - 1] * (1 + (i % 2 === 0 ? 1 : -1) * noise));
  }
  return { dates, values };
}

const RULE6 = RULES.find((r) => r.id === "fx.usdbrl_alta.confirma_dxy") as Rule; // USDBRL↑ → DXY esperado +1, lag [0,1]

describe("metricSeries", () => {
  it("retorno_Nd calcula variação percentual sobre N pregões", () => {
    const s: Series = { dates: ["a", "b", "c"], values: [100, 110, 121] };
    const m = metricSeries(s, "retorno_1d");
    expect(m.dates).toEqual(["b", "c"]);
    expect(m.values[0]).toBeCloseTo(0.1, 6);
    expect(m.values[1]).toBeCloseTo(0.1, 6);
  });
  it("variacao_bps_Nd é diferença de nível", () => {
    const s: Series = { dates: ["a", "b", "c"], values: [4.0, 4.2, 4.1] };
    const m = metricSeries(s, "variacao_bps_1d");
    expect(m.values[0]).toBeCloseTo(0.2, 6);
    expect(m.values[1]).toBeCloseTo(-0.1, 6);
  });
  it("nivel_percentil usa o próprio nível", () => {
    const s: Series = { dates: ["a", "b"], values: [15, 20] };
    expect(metricSeries(s, "nivel_percentil").values).toEqual([15, 20]);
  });
});

describe("rollingZ", () => {
  it("z é 0 quando a janela é constante (desvio zero)", () => {
    const s: Series = { dates: ["a", "b", "c"], values: [5, 5, 5] };
    const z = rollingZ(s, 3);
    expect(z.values).toEqual([0]);
  });
  it("um outlier isolado produz z alto", () => {
    const vals = Array(59).fill(1).concat([10]);
    const dates = vals.map((_, i) => "d" + i);
    const z = rollingZ({ dates, values: vals }, 60);
    expect(z.values[z.values.length - 1]).toBeGreaterThan(5);
  });
});

describe("detectShocks — concordância curto+longo", () => {
  it("dispara quando o último retorno cruza o limiar nas duas janelas", () => {
    const s = mkSeries(300, { 299: 0.03 });
    const shocks = detectShocks(s, "retorno_1d", 1.5, "alta", DEFAULT_PARAMS);
    expect(shocks.length).toBeGreaterThanOrEqual(1);
    expect(shocks[shocks.length - 1].date).toBe("d0299");
  });
  it("não dispara em série sem choque (só ruído)", () => {
    const s = mkSeries(300, {});
    expect(detectShocks(s, "retorno_1d", 1.5, "alta", DEFAULT_PARAMS)).toHaveLength(0);
  });
});

describe("classifyRule", () => {
  it("CONFIRMADO: choque no driver + efeito no sinal esperado", () => {
    const driver = mkSeries(300, { 299: 0.03 }); // USDBRL sobe forte hoje
    const dxy = mkSeries(300, { 299: 0.02 }); // DXY confirma (sobe)
    const ev = classifyRule(RULE6, driver, { DXY: dxy });
    expect(ev.estado).toBe("confirmado");
    expect(ev.choqueAtivo).toBe(true);
    expect(ev.ultimoChoque?.date).toBe("d0299");
    expect(ev.efeitos[0].confirmado).toBe(true);
  });

  it("ANÔMALO: choque no driver mas o efeito NÃO vem (a divergência = o produto)", () => {
    const driver = mkSeries(300, { 299: 0.03 }); // USDBRL sobe
    const dxy = mkSeries(300, {}); // DXY parado → não confirma
    const ev = classifyRule(RULE6, driver, { DXY: dxy });
    expect(ev.estado).toBe("anomalo");
    expect(ev.efeitos[0].confirmado).toBe(false);
  });

  it("SEM_DADOS: efeito indisponível (fonte não integrada)", () => {
    const driver = mkSeries(300, { 299: 0.03 });
    const ev = classifyRule(RULE6, driver, {}); // DXY ausente
    expect(ev.estado).toBe("sem_dados");
    expect(ev.disponivel).toBe(false);
    expect(ev.driversFaltando).toContain("DXY");
  });

  it("SEM_DADOS: histórico do driver curto demais para z-score longo", () => {
    const driver = mkSeries(120, { 119: 0.03 }); // < zLongo (250)
    const ev = classifyRule(RULE6, driver, { DXY: mkSeries(120, { 119: 0.02 }) });
    expect(ev.estado).toBe("sem_dados");
    expect(ev.driversFaltando).toContain("USDBRL");
  });

  it("QUIESCENTE: sem choque hoje", () => {
    const driver = mkSeries(300, {}); // sem choque
    const ev = classifyRule(RULE6, driver, { DXY: mkSeries(300, {}) });
    expect(ev.estado).toBe("quiescente");
    expect(ev.choqueAtivo).toBe(false);
  });

  it("EFEITO PARCIAL: com 1 de N efeitos disponível, a regra roda nos demais e lista o não medido", () => {
    const RULE1 = RULES.find((r) => r.id === "energia.brent_queda.desinflacao_eua") as Rule; // efeitos: US10Y, GOLD, SPX
    const driver = mkSeries(300, { 299: -0.08 }); // Brent cai forte (retorno_5d, queda)
    const spx = mkSeries(300, { 299: 0.02 }); // SPX sobe (efeito esperado +1)
    const ev = classifyRule(RULE1, driver, { SPX: spx }); // só SPX disponível
    expect(ev.disponivel).toBe(true);
    expect(ev.estado).toBe("confirmado");
    expect(ev.efeitosNaoMedidos.sort()).toEqual(["GOLD", "US10Y"]);
    expect(ev.efeitos.map((e) => e.ativo)).toEqual(["SPX"]);
  });

  it("taxa de concordância ao vivo: mede episódios passados com janela decorrida", () => {
    // choque no meio (d0280) para a defasagem já ter decorrido; efeito confirma
    const driver = mkSeries(300, { 280: 0.03 });
    const dxy = mkSeries(300, { 280: 0.02 });
    const ev = classifyRule(RULE6, driver, { DXY: dxy });
    expect(ev.nEventos).toBeGreaterThanOrEqual(1);
    expect(ev.taxaAcertoLive).toBe(1); // o único episódio veio no sinal esperado
    expect(ev.estado).toBe("quiescente"); // nada hoje
  });
});

describe("summarize", () => {
  it("conta estados corretamente", () => {
    const driver = mkSeries(300, { 299: 0.03 });
    const anom = classifyRule(RULE6, driver, { DXY: mkSeries(300, {}) });
    const semDados = classifyRule(RULE6, driver, {});
    const s = summarize([anom, semDados]);
    expect(s.anomalo).toBe(1);
    expect(s.semDados).toBe(1);
  });
});

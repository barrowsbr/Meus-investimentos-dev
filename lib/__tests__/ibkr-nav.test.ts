import { describe, expect, it } from "vitest";
import { calcularTwrNav, mesclarNav, anexarFluxos, apararInicioIrrisorio, type NavPonto } from "../ibkr-nav";

const p = (date: string, nav: number, fluxo = 0): NavPonto => ({ date, nav, fluxo });

describe("calcularTwrNav — a conta do PortfolioAnalyst", () => {
  it("compõe retornos diários NAV a NAV", () => {
    const r = calcularTwrNav([p("2026-01-02", 100000), p("2026-01-03", 101000), p("2026-01-06", 100495)]);
    // dia 1: +1% · dia 2: −0,5% → (1.01)(0.995) − 1
    expect(r.twrTotal).toBeCloseTo(1.01 * 0.995 - 1, 10);
    expect(r.pontos).toHaveLength(3);
    expect(r.pontos[0].twr).toBe(0); // âncora
  });

  it("depósito NÃO vira retorno: NAV dobrou por aporte → TWR 0", () => {
    const r = calcularTwrNav([p("2026-01-02", 100000), p("2026-01-03", 200000, 100000)]);
    expect(r.twrTotal).toBeCloseTo(0, 10);
    expect(r.fluxoTotal).toBe(100000);
  });

  it("retirada não vira prejuízo", () => {
    const r = calcularTwrNav([p("2026-01-02", 100000), p("2026-01-03", 50500, -50000)]);
    // base = 100000 − 50000 = 50000 → 50500/50000 = +1%
    expect(r.twrTotal).toBeCloseTo(0.01, 10);
  });

  it("agrega retornos por mês (composto dentro do mês)", () => {
    const r = calcularTwrNav([
      p("2026-01-30", 100), p("2026-01-31", 102), // jan: +2%
      p("2026-02-02", 102), p("2026-02-27", 96.9), // fev: 0% e −5%
    ]);
    const meses = Object.fromEntries(r.mensal.map((m) => [m.mes, m.ret]));
    expect(meses["2026-01"]).toBeCloseTo(0.02, 10);
    expect(meses["2026-02"]).toBeCloseTo(96.9 / 102 - 1, 10);
  });

  it("menos de 2 pontos válidos → vazio (sem inventar retorno)", () => {
    expect(calcularTwrNav([p("2026-01-02", 100000)]).pontos).toHaveLength(0);
    expect(calcularTwrNav([]).twrTotal).toBe(0);
  });
});

describe("apararInicioIrrisorio — o teste de câmbio da abertura", () => {
  it("corta o prefixo de NAV irrisório e ancora no primeiro capital real", () => {
    const r = apararInicioIrrisorio([
      p("2025-09-01", 20), p("2025-09-02", 15), // teste de câmbio: US$ 20 → 15 (−25%!)
      p("2025-09-10", 100000, 100000), p("2025-09-11", 101000),
    ]);
    expect(r.cortados).toBe(2);
    expect(r.dataInicio).toBe("2025-09-10");
    // a curva limpa: só o +1% real — o −25% do teste não contamina
    expect(calcularTwrNav(r.pontos).twrTotal).toBeCloseTo(0.01, 10);
  });

  it("sem prefixo irrisório, não corta nada", () => {
    const r = apararInicioIrrisorio([p("2026-01-02", 90000), p("2026-01-03", 91000)]);
    expect(r.cortados).toBe(0);
  });

  it("NAV baixo NO MEIO da série não é cortado (só prefixo)", () => {
    const r = apararInicioIrrisorio([
      p("2026-01-02", 100000), p("2026-01-03", 500, -99500), p("2026-01-06", 100500, 100000),
    ]);
    expect(r.cortados).toBe(0);
  });

  it("série inteira irrisória fica intacta (não há o que aparar)", () => {
    const r = apararInicioIrrisorio([p("2026-01-02", 0.5), p("2026-01-03", 0.4)]);
    expect(r.cortados).toBe(0);
    expect(r.pontos).toHaveLength(2);
  });
});

describe("mesclarNav — planilha + Flex", () => {
  it("Flex vence na interseção; união ordenada; nav ≤ 0 fica fora", () => {
    const m = mesclarNav(
      [p("2026-01-02", 100), p("2026-01-03", 999), p("2026-01-04", 0)],
      [p("2026-01-03", 101), p("2026-01-06", 102)],
    );
    expect(m.map((x) => [x.date, x.nav])).toEqual([
      ["2026-01-02", 100], ["2026-01-03", 101], ["2026-01-06", 102],
    ]);
  });
});

describe("anexarFluxos", () => {
  it("fluxo em dia sem NAV cai no próximo dia com NAV; depois do fim fica fora", () => {
    const pts = anexarFluxos(
      [{ date: "2026-01-02", nav: 100 }, { date: "2026-01-06", nav: 210 }],
      [{ date: "2026-01-04", valor: 100 }, { date: "2026-01-06", valor: 5 }, { date: "2026-02-01", valor: 999 }],
    );
    expect(pts[0].fluxo).toBe(0);
    expect(pts[1].fluxo).toBe(105); // 100 (sábado→próximo pregão) + 5 (no dia)
    // e o TWR com esse fluxo: base = 100+105 → 210/205 − 1
    expect(calcularTwrNav(pts).twrTotal).toBeCloseTo(210 / 205 - 1, 10);
  });
});

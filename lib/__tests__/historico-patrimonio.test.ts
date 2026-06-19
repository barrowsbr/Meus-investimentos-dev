import { describe, it, expect } from "vitest";
import { parseHistoricoPatrimonio } from "../historico-patrimonio";

describe("parseHistoricoPatrimonio — formato LONGO (1 linha por período)", () => {
  it("usa coluna de total explícita e mantém composição como partes", () => {
    const s = parseHistoricoPatrimonio([
      { data: "2024-01-31", "patrimonio total": 100000, rv: 60000, rf: 40000 },
      { data: "2024-02-29", "patrimonio total": 110000, rv: 66000, rf: 44000 },
    ]);
    expect(s.pontos).toHaveLength(2);
    expect(s.pontos[0].total).toBe(100000);
    expect(s.pontos[1].total).toBe(110000);
    expect(s.partesKeys).toEqual(["rv", "rf"]);
    expect(s.pontos[1].partes).toEqual({ rv: 66000, rf: 44000 });
  });

  it("ordena por data e detecta granularidade mensal (mmm/yy)", () => {
    const s = parseHistoricoPatrimonio([
      { mes: "mar/24", total: 130 },
      { mes: "jan/24", total: 100 },
      { mes: "fev/24", total: 120 },
    ]);
    expect(s.formato).toBe("month");
    expect(s.pontos.map((p) => p.total)).toEqual([100, 120, 130]);
    expect(s.pontos[0].label).toBe("jan/24");
  });

  it("soma colunas numéricas quando não há coluna de total", () => {
    const s = parseHistoricoPatrimonio([
      { data: "2023-12-31", rv: 70, rf: 30 },
    ]);
    expect(s.pontos[0].total).toBe(100);
  });

  it("ignora colunas de percentual/variação", () => {
    const s = parseHistoricoPatrimonio([
      { data: "2024-06-30", total: 100, "variacao %": 5, cdi: 1.2 },
      { data: "2024-07-31", total: 105, "variacao %": 5, cdi: 1.1 },
    ]);
    expect(s.partesKeys).not.toContain("variacao %");
    expect(s.partesKeys).not.toContain("cdi");
  });
});

describe("parseHistoricoPatrimonio — formato LARGO (anos como colunas)", () => {
  it("transpõe anos em série e soma contas (ignorando linha Total)", () => {
    const s = parseHistoricoPatrimonio([
      { "": "Conta A", "2022": 100, "2023": 150 },
      { "": "Conta B", "2022": 50, "2023": 50 },
      { "": "Total", "2022": 150, "2023": 200 },
    ]);
    expect(s.formato).toBe("year");
    expect(s.pontos.map((p) => p.label)).toEqual(["2022", "2023"]);
    expect(s.pontos[0].total).toBe(150);
    expect(s.pontos[1].total).toBe(200);
    expect(s.partesKeys).toEqual(["Conta A", "Conta B"]);
  });
});

describe("parseHistoricoPatrimonio — vazio", () => {
  it("retorna série vazia sem quebrar", () => {
    const s = parseHistoricoPatrimonio([]);
    expect(s.pontos).toEqual([]);
    expect(s.partesKeys).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { layoutHierarquico, type NoSunburst } from "../sunburst-layout";

const no = (name: string, value: number, parentName?: string): NoSunburst =>
  ({ name, value, pct: value / 10, color: "#000", parentName });

const L1 = [no("Renda Variável", 700), no("Renda Fixa", 300)];
const L2 = [
  no("Tecnologia", 400, "Renda Variável"), no("ETF USA", 300, "Renda Variável"),
  no("Tesouro", 300, "Renda Fixa"),
];
const L3 = [
  no("NVDA", 250, "Tecnologia"), no("MSFT", 150, "Tecnologia"),
  no("VOO", 300, "ETF USA"), no("SELIC29", 300, "Tesouro"),
];

const dentro = (filho: { a1: number; a2: number }, pai: { a1: number; a2: number }) =>
  filho.a1 >= pai.a1 - 0.01 && filho.a2 <= pai.a2 + 0.01;

describe("layoutHierarquico", () => {
  it("hierarquia REAL: filho contido no intervalo angular do pai (o bug antigo)", () => {
    const arcos = layoutHierarquico(L1, L2, L3, null, null);
    for (const setor of arcos.filter(a => a.level === 2)) {
      const classe = arcos.find(a => a.level === 1 && a.name === setor.parentName)!;
      expect(dentro(setor, classe), `${setor.name} fora de ${classe.name}`).toBe(true);
    }
    for (const ativo of arcos.filter(a => a.level === 3)) {
      const setor = arcos.find(a => a.level === 2 && a.name === ativo.parentName)!;
      expect(dentro(ativo, setor), `${ativo.name} fora de ${setor.name}`).toBe(true);
    }
  });

  it("proporção: RV com 70% do valor ocupa ~70% do círculo", () => {
    const arcos = layoutHierarquico(L1, L2, L3, null, null);
    const rv = arcos.find(a => a.key === "1:Renda Variável")!;
    expect((rv.a2 - rv.a1) / 360).toBeCloseTo(0.7, 1);
    expect(rv.pctPai).toBeCloseTo(70, 5);
  });

  it("zoom na classe: selecionada vira 360°, irmã colapsa em span 0", () => {
    const arcos = layoutHierarquico(L1, L2, L3, "Renda Variável", null);
    const rv = arcos.find(a => a.key === "1:Renda Variável")!;
    const rf = arcos.find(a => a.key === "1:Renda Fixa")!;
    expect(rv.a1).toBe(0); expect(rv.a2).toBe(360);
    expect(rf.a2 - rf.a1).toBeCloseTo(0, 6);
    // setores da RV se redistribuem pelos 360° (contidos no novo intervalo)
    const tec = arcos.find(a => a.key === "2:Tecnologia")!;
    expect(dentro(tec, rv)).toBe(true);
    expect(tec.a2 - tec.a1).toBeGreaterThan(150); // 400/700 de 360° ≈ 205°
  });

  it("zoom no setor: setor 360° e ativos redistribuídos dentro dele", () => {
    const arcos = layoutHierarquico(L1, L2, L3, "Renda Variável", "Tecnologia");
    const tec = arcos.find(a => a.key === "2:Tecnologia")!;
    expect(tec.a2 - tec.a1).toBeCloseTo(360, 5);
    const nvda = arcos.find(a => a.level === 3 && a.name === "NVDA")!;
    expect(nvda.pctPai).toBeCloseTo(62.5, 1); // 250/400
    expect(nvda.a2 - nvda.a1).toBeGreaterThan(200);
  });

  it("migalhas (2+) agregam em 'outros (N)' com os nomes guardados", () => {
    const l3 = [
      no("VOO", 399, "ETF USA"),
      no("PING1", 0.5, "ETF USA"), no("PING2", 0.5, "ETF USA"),
    ];
    const l2 = [no("ETF USA", 400, "Renda Variável")];
    const arcos = layoutHierarquico([no("Renda Variável", 400)], l2, l3, null, null);
    const outros = arcos.find(a => a.level === 3 && a.name.startsWith("outros"));
    expect(outros).toBeDefined();
    expect(outros!.agregado).toEqual(["PING1", "PING2"]);
    expect(outros!.value).toBe(1);
    // e NADA some: a soma dos valores do anel 3 é o total
    const soma = arcos.filter(a => a.level === 3).reduce((s, a) => s + a.value, 0);
    expect(soma).toBe(400);
  });
});

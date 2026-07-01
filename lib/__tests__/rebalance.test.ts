import { describe, it, expect } from "vitest";
import { computeRebalance, classesFromEstrutura, type AllocClass, type RebalanceMeta } from "@/lib/rebalance";

const CLASSES: AllocClass[] = [
  { classe: "Ações EUA", macro: "Renda Variável", valorBRL: 60000 },
  { classe: "Tesouro Direto", macro: "Renda Fixa", valorBRL: 40000 },
];
const METAS_50_50: RebalanceMeta[] = [
  { classe: "Ações EUA", pesoAlvoPct: 50, bandaPct: 5 },
  { classe: "Tesouro Direto", pesoAlvoPct: 50, bandaPct: 5 },
];

describe("computeRebalance — drift e ajuste", () => {
  const r = computeRebalance(CLASSES, METAS_50_50, { aporteBRL: 0 });
  const rv = r.rows.find((x) => x.classe === "Ações EUA")!;
  const rf = r.rows.find((x) => x.classe === "Tesouro Direto")!;

  it("total = soma das classes", () => expect(r.totalBRL).toBe(100000));
  it("drift = atual − alvo", () => { expect(rv.driftPct).toBeCloseTo(10, 6); expect(rf.driftPct).toBeCloseTo(-10, 6); });
  it("ajuste = alvo − atual (>0 comprar)", () => { expect(rv.ajusteBRL).toBeCloseTo(-10000, 6); expect(rf.ajusteBRL).toBeCloseTo(10000, 6); });
  it("status fora da banda", () => { expect(rv.status).toBe("reduzir"); expect(rf.status).toBe("aportar"); });

  it("sem aporte: vende o excesso e aporta o déficit (reconcilia)", () => {
    const aportar = r.actions.find((a) => a.tipo === "aportar");
    const reduzir = r.actions.find((a) => a.tipo === "reduzir");
    expect(aportar?.valorBRL).toBeCloseTo(10000, 6);
    expect(reduzir?.valorBRL).toBeCloseTo(10000, 6);
    expect(r.vendasEvitadasPorAporte).toBe(false);
  });

  it("venda de RV recebe aviso de IR; compra não", () => {
    const reduzir = r.actions.find((a) => a.tipo === "reduzir")!;
    const aportar = r.actions.find((a) => a.tipo === "aportar")!;
    expect(reduzir.avisoImposto).toBe(true);   // Ações EUA = Renda Variável
    expect(aportar.avisoImposto).toBe(false);
  });
});

describe("computeRebalance — cash-first", () => {
  it("aporte cobre o déficit → nenhuma venda", () => {
    const r = computeRebalance(CLASSES, METAS_50_50, { aporteBRL: 10000 });
    expect(r.vendasEvitadasPorAporte).toBe(true);
    expect(r.actions.some((a) => a.tipo === "reduzir")).toBe(false);
    expect(r.actions.find((a) => a.tipo === "aportar")?.valorBRL).toBeCloseTo(10000, 6);
  });
});

describe("computeRebalance — banda e sem-alvo", () => {
  it("dentro da banda → manter (sem ação)", () => {
    const metas: RebalanceMeta[] = [
      { classe: "Ações EUA", pesoAlvoPct: 58, bandaPct: 5 },     // drift +2 ≤ 5
      { classe: "Tesouro Direto", pesoAlvoPct: 42, bandaPct: 5 }, // drift -2 ≤ 5
    ];
    const r = computeRebalance(CLASSES, metas, {});
    expect(r.rows.every((x) => x.status === "manter")).toBe(true);
    expect(r.actions.length).toBe(0);
  });

  it("classe sem meta → status sem-alvo, drift null", () => {
    const classes: AllocClass[] = [...CLASSES, { classe: "Cripto", macro: "Renda Variável", valorBRL: 10000 }];
    const r = computeRebalance(classes, METAS_50_50, {});
    const cripto = r.rows.find((x) => x.classe === "Cripto")!;
    expect(cripto.status).toBe("sem-alvo");
    expect(cripto.driftPct).toBeNull();
  });
});

describe("classesFromEstrutura — achata a árvore no nível das subclasses", () => {
  it("extrai filhas com macro e valor", () => {
    const est = [
      { name: "Renda Variável", value: 100, pct: 100, children: [{ name: "Ações EUA", value: 60, pct: 60 }, { name: "Cripto", value: 0, pct: 0 }] },
      { name: "Renda Fixa", value: 40, pct: 40, children: [{ name: "Caixa", value: 40, pct: 40 }] },
    ];
    const cls = classesFromEstrutura(est);
    expect(cls.map((c) => c.classe)).toEqual(["Ações EUA", "Caixa"]); // Cripto value=0 é descartada
    expect(cls.find((c) => c.classe === "Caixa")?.macro).toBe("Renda Fixa");
  });
});

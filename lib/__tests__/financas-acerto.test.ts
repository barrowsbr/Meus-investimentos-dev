import { describe, expect, it } from "vitest";
import {
  mesPagamento, faturaPagaEm, calcularAcerto, construirProximaFatura,
  caudaComprometida, serieSobras, type TransacaoAcerto,
} from "../financas/acerto";

const t = (data: string, valor: number, extra?: Partial<TransacaoAcerto>): TransacaoAcerto =>
  ({ data, valor, parcela: null, ...extra });

describe("mesPagamento — a defasagem de 1 mês do modelo", () => {
  it("compra ATÉ o fechamento paga no mês seguinte; depois, pula 2", () => {
    expect(mesPagamento("2026-08-10", 28)).toBe("2026-09"); // dentro do ciclo
    expect(mesPagamento("2026-08-28", 28)).toBe("2026-09"); // no dia do fechamento
    expect(mesPagamento("2026-08-29", 28)).toBe("2026-10"); // empurrou
    expect(mesPagamento("2026-12-30", 28)).toBe("2027-02"); // vira o ano
  });
});

describe("calcularAcerto — entradas − fixas − faturas", () => {
  const mensal = [
    { categoria: "entrada", nome: "Salário Lucas", valor: 10000 },
    { categoria: "entrada", nome: "Salário Maria", valor: 5000 },
    { categoria: "saida", nome: "Aluguel", valor: 3000 },
    { categoria: "saida", nome: "Luz", valor: 500 },
    { categoria: "cartao", nome: "Nubank Lucas", valor: 4100 },   // manual (conferência)
    { categoria: "cartao", nome: "Nubank Maria", valor: 1500 },
    { categoria: "cartao", nome: "AMEX", valor: 800 },
  ];
  const trans = [
    t("2026-07-05", 2000), t("2026-07-20", 1800), // ciclo de julho → pago em agosto
    t("2026-08-02", 999),                          // ciclo de agosto → setembro (fora)
  ];

  it("usa o OFX como golden source do Nubank e soma os outros cartões manuais", () => {
    const a = calcularAcerto({ mensal, trans, ymAtual: "2026-08", diaFechamento: 28 });
    expect(a.entradas).toBe(15000);
    expect(a.fixas).toBe(3500);
    expect(a.faturaNubank).toBe(3800);        // 2000+1800 do ciclo passado (não os 4100 manuais)
    expect(a.faturaNubankManual).toBe(4100);  // exposto p/ conferência
    expect(a.faturasOutras).toBe(2300);       // Maria + AMEX
    expect(a.sobra).toBe(15000 - 3500 - 3800 - 2300);
  });

  it("sem OFX (aba vazia) cai no valor manual", () => {
    const a = calcularAcerto({ mensal, trans: [], ymAtual: "2026-08", diaFechamento: 28 });
    expect(a.faturaNubank).toBe(4100);
  });

  it("estorno (valor negativo) não infla a fatura", () => {
    const comEstorno = [...trans, t("2026-07-22", -500)];
    expect(faturaPagaEm(comEstorno, "2026-08", 28)).toBe(3800);
  });
});

describe("construirProximaFatura — o ciclo em andamento", () => {
  const trans = [
    t("2026-08-01", 300),                                    // variável
    t("2026-08-05", 200, { assinatura: true }),              // assinatura já cobrada
    t("2026-08-10", 400, { parcela: { n: 3, total: 10 } }),  // parcela lançada
    t("2026-07-15", 9999),                                   // ciclo passado — fora
  ];

  it("separa variável | parcelado | assinaturas e projeta pelo ritmo", () => {
    const p = construirProximaFatura({
      trans, hoje: "2026-08-14", diaFechamento: 28,
      assinaturasMensais: 350, parcelasRestantes: [{ valorParcela: 400, restantes: 7 }],
    });
    expect(p.ymPagamento).toBe("2026-09");
    expect(p.fimCiclo).toBe("2026-08-28");
    expect(p.variavel).toBe(300);
    expect(p.parcelado).toBe(400);
    expect(p.assinaturas).toBe(200);
    expect(p.assinaturasQueVemAi).toBe(150);       // 350 previstas − 200 já cobradas
    expect(p.parcelasQueVemAi).toBe(0);            // a parcela do ciclo já caiu
    // ritmo: 300 em 17 dias (28/07→14/08) + 14 restantes
    expect(p.projecaoVariavel).toBeCloseTo(300 + (300 / 17) * 14, 6);
    expect(p.totalPrevisto).toBeCloseTo(p.projecaoVariavel + 400 + 200 + 150, 6);
  });

  it("depois do fechamento o ciclo é o do mês seguinte", () => {
    const p = construirProximaFatura({
      trans: [], hoje: "2026-08-30", diaFechamento: 28,
      assinaturasMensais: 0, parcelasRestantes: [],
    });
    expect(p.fimCiclo).toBe("2026-09-28");
    expect(p.ymPagamento).toBe("2026-10");
  });

  it("sem parcela lançada no ciclo, as séries vivas entram como 'vem aí'", () => {
    const p = construirProximaFatura({
      trans: [t("2026-08-01", 100)], hoje: "2026-08-14", diaFechamento: 28,
      assinaturasMensais: 0,
      parcelasRestantes: [{ valorParcela: 250, restantes: 4 }, { valorParcela: 90, restantes: 0 }],
    });
    expect(p.parcelasQueVemAi).toBe(250); // só a série viva
  });
});

describe("caudaComprometida — o futuro já contratado", () => {
  it("cada mês recebe as parcelas que ainda existem + assinaturas", () => {
    const cauda = caudaComprometida({
      parcelasRestantes: [{ valorParcela: 400, restantes: 2 }, { valorParcela: 100, restantes: 5 }],
      assinaturasMensais: 300, ymAtual: "2026-08", meses: 6,
    });
    expect(cauda.map(m => m.parcelas)).toEqual([500, 500, 100, 100, 100, 0]);
    expect(cauda.every(m => m.assinaturas === 300)).toBe(true);
    expect(cauda[0].ym).toBe("2026-09");
  });
});

describe("serieSobras — a poupança incremental", () => {
  it("soma sobras dos meses FECHADOS em ordem, com acumulado", () => {
    const s = serieSobras([
      { mes: "2026-07", entradas: 15000, fixas: 3500, cartao: 9000, fechado: true },
      { mes: "2026-06", entradas: 15000, fixas: 3500, cartao: 12500, fechado: true },
      { mes: "2026-08", entradas: 0, fixas: 0, cartao: 0, fechado: false }, // aberto — fora
    ]);
    expect(s.map(x => x.ym)).toEqual(["2026-06", "2026-07"]);
    expect(s[0].sobra).toBe(-1000);
    expect(s[1].sobra).toBe(2500);
    expect(s[1].acumulado).toBe(1500);
  });
});

import { describe, it, expect } from "vitest";
import { calcularCarteiraFIFO, enriquecerPosicoes, calcularSnapshot, type Position } from "@/lib/portfolio";
import { isRendaVariavel } from "@/lib/sectors";
import type { Quote, FxRates } from "@/lib/cotacoes";

// ── Helpers ──────────────────────────────────────────────────────────────────
function fx(usdbrl: number): FxRates {
  return { USDBRL: usdbrl, EURBRL: usdbrl * 1.08, GBPBRL: usdbrl * 1.27, CADBRL: usdbrl * 0.73 };
}
function quote(price: number, currency = "USD"): Quote {
  return { price, change: 0, changePercent: 0, currency, name: "" };
}
function compra(ticker: string, qty: number, preco: number, moeda: string, data: string) {
  return {
    "símbolo": ticker,
    "tipo de transação": "Compra",
    quantidade: qty,
    "preço": preco,
    moeda,
    data,
  } as Record<string, unknown>;
}

function build(rows: Record<string, unknown>[], quotes: Record<string, Quote>, fxAtual: FxRates, fxCusto: FxRates, fxByDate?: Map<string, number>): Position[] {
  const carteira = calcularCarteiraFIFO(rows, fxByDate);
  return enriquecerPosicoes(carteira, quotes, fxAtual, fxCusto);
}

// ── Caso canônico: pmDólar (fxCusto) é o P0, mesmo havendo PTAX por lote ──────
// Regra híbrida (CALCULOS.md §20): o câmbio de custo é o pmDólar REAL das
// remessas (fxCusto), NÃO a PTAX da data de compra. pmDólar = 5,50.
// V0 = US$ 1.000 ; V1 = US$ 1.200 ; P0 = 5,50 ; P1 = 6,00
describe("decomposição multimoeda — pmDólar (fxCusto) tem precedência sobre PTAX por lote", () => {
  const fxByDate = new Map<string, number>([["2023-01-02", 5.0]]); // PTAX por lote (ignorada quando há pmDólar)
  const positions = build(
    [compra("AAPL", 10, 100, "USD", "2023-01-02")],
    { AAPL: quote(120) },
    fx(6.0),    // P1 = 6,00
    fx(5.5),    // pmDólar = 5,50 → P0
    fxByDate,
  );
  const p = positions.find(x => x.ticker === "AAPL")!;

  it("usa o pmDólar (fxCusto) como P0, ignorando a PTAX por lote", () => {
    expect(p.pmFxAquisicao).toBeCloseTo(5.5, 6);
    expect(p.fxAtualBRL).toBeCloseTo(6.0, 6);
    expect(p.custoTotalBRL).toBeCloseTo(5500, 6); // 1000 USD × 5,50
  });

  it("ativo puro = (V1−V0)·P0", () => {
    expect(p.ganhoAtivoPuroBRL).toBeCloseTo(1100, 6); // 200 USD × 5,50
  });

  it("câmbio sobre o principal = V0·(P1−P0)", () => {
    expect(p.ganhoFXPrincipalBRL).toBeCloseTo(500, 6); // 1000 USD × 0,50
  });

  it("efeito cruzado = (V1−V0)·(P1−P0)", () => {
    expect(p.ganhoCruzadoBRL).toBeCloseTo(100, 6); // 200 USD × 0,50
  });

  it("identidade: os 3 fatores somam exatamente o lucro em BRL", () => {
    const soma = (p.ganhoAtivoPuroBRL ?? 0) + (p.ganhoFXPrincipalBRL ?? 0) + (p.ganhoCruzadoBRL ?? 0);
    expect(soma).toBeCloseTo(p.lucroBRL ?? 0, 6);
    expect(p.lucroBRL).toBeCloseTo(1700, 6); // 7200 − 5500
  });

  it("compat 2-vias: ativo = puro+cruzado e câmbio = principal", () => {
    expect(p.ganhoAtivoBRL).toBeCloseTo(1200, 6);   // 1100 + 100
    expect(p.ganhoCambioBRL).toBeCloseTo(500, 6);
  });
});

// ── Fallback: sem remessa na moeda (pmDólar = 0) cai para a PTAX por lote ─────
describe("sem pmDólar (fxCusto=0) usa a PTAX por lote como P0", () => {
  const fxByDate = new Map<string, number>([["2023-01-02", 5.0]]);
  const positions = build(
    [compra("AAPL", 10, 100, "USD", "2023-01-02")],
    { AAPL: quote(120) },
    fx(6.0),
    { USDBRL: 0, EURBRL: 0, GBPBRL: 0, CADBRL: 0 }, // sem remessa ⇒ pmDólar inválido
    fxByDate,
  );
  const p = positions.find(x => x.ticker === "AAPL")!;

  it("P0 vem da PTAX por lote (5,00)", () => {
    expect(p.pmFxAquisicao).toBeCloseTo(5.0, 6);
    expect(p.custoTotalBRL).toBeCloseTo(5000, 6); // 1000 USD × 5,00
    expect(p.lucroBRL).toBeCloseTo(2200, 6);      // 7200 − 5000
  });
});

// ── Dólar caindo: ganho do ativo continua positivo, câmbio corrói ────────────
describe("dólar em queda sobre ativo que subiu", () => {
  const fxByDate = new Map<string, number>([["2023-01-02", 6.0]]);
  const positions = build(
    [compra("MSFT", 5, 200, "USD", "2023-01-02")], // V0 = 1000 USD
    { MSFT: quote(240) },                          // V1 = 1200 USD
    fx(5.4),   // P1 = 5,40 (dólar caiu de 6,00)
    fx(6.0),
    fxByDate,
  );
  const p = positions.find(x => x.ticker === "MSFT")!;

  it("ativo puro é positivo mesmo com dólar caindo", () => {
    expect(p.ganhoAtivoPuroBRL).toBeCloseTo(1200, 6); // 200 USD × 6,00
  });
  it("câmbio principal e cruzado ficam negativos", () => {
    expect(p.ganhoFXPrincipalBRL).toBeCloseTo(-600, 6);  // 1000 × (5,4−6,0)
    expect(p.ganhoCruzadoBRL).toBeCloseTo(-120, 6);      // 200 × (−0,6)
  });
  it("soma bate com o lucro líquido", () => {
    const soma = (p.ganhoAtivoPuroBRL ?? 0) + (p.ganhoFXPrincipalBRL ?? 0) + (p.ganhoCruzadoBRL ?? 0);
    expect(soma).toBeCloseTo(p.lucroBRL ?? 0, 6);
    expect(p.lucroBRL).toBeCloseTo(480, 6); // 1200×5,4 − 1000×6,0 = 6480 − 6000
  });
});

// ── Ativo em BRL: sem efeito cambial ─────────────────────────────────────────
describe("ativo em BRL não tem decomposição cambial", () => {
  const positions = build(
    [compra("PETR4", 100, 30, "BRL", "2023-01-02")],
    { PETR4: quote(35, "BRL") },
    fx(6.0),
    fx(6.0),
  );
  const p = positions.find(x => x.ticker === "PETR4")!;

  it("todo o resultado é ativo puro; FX = 0", () => {
    expect(p.ganhoAtivoPuroBRL).toBeCloseTo(500, 6); // (35−30)×100
    expect(p.ganhoFXPrincipalBRL).toBeCloseTo(0, 6);
    expect(p.ganhoCruzadoBRL).toBeCloseTo(0, 6);
    expect(p.lucroBRL).toBeCloseTo(500, 6);
  });
});

// ── Sem FX por lote: P0 cai para o PM (fxCusto) ──────────────────────────────
describe("ativo USD sem FX por lote usa o PM do dólar (fxCusto)", () => {
  const positions = build(
    [compra("GOOGL", 10, 100, "USD", "2023-01-02")],
    { GOOGL: quote(100) },  // sem ganho de ativo: V1 == V0
    fx(6.0),                // P1 = 6,00
    fx(5.0),                // PM = 5,00 → P0
    undefined,              // sem fxByDate ⇒ sem FX por lote
  );
  const p = positions.find(x => x.ticker === "GOOGL")!;

  it("P0 vem do PM e só há câmbio sobre o principal", () => {
    expect(p.pmFxAquisicao).toBeCloseTo(5.0, 6);
    expect(p.ganhoAtivoPuroBRL).toBeCloseTo(0, 6);      // V1 == V0
    expect(p.ganhoFXPrincipalBRL).toBeCloseTo(1000, 6); // 1000 USD × (6−5)
    expect(p.ganhoCruzadoBRL).toBeCloseTo(0, 6);
    expect(p.lucroBRL).toBeCloseTo(1000, 6);
  });
});

// ── BLINDAGEM (Camada 2): reconciliação de métricas do snapshot ───────────────
// Estes testes falham se alguém quebrar a SIMETRIA entre métricas em mudanças
// futuras. São as identidades que devem valer SEMPRE, em qualquer página.
function provento(ticker: string, valor: number, moeda: string, decisao = "", data = "2023-06-01") {
  return { ticker, valor, moeda, decisao, data } as Record<string, unknown>;
}
function rfAberta(ticker: string, atual: number, moeda = "BRL") {
  return { ticker, atual, moeda } as Record<string, unknown>;
}

describe("blindagem — identidades de reconciliação do snapshot", () => {
  // AAPL (USD): custo 1000 USD × pmDólar 5,00 = R$5.000 ; atual 1200 USD × 6,00 = R$7.200
  //   proventos: +50 USD dividendo, −10 USD imposto ⇒ líquido 40 USD × 6,00 = R$240
  // PETR4 (BRL): custo R$3.000 ; atual R$3.500 ; proventos R$20
  // RF manual (fixa_aberta): CDB R$10.000
  const snap = calcularSnapshot(
    [compra("AAPL", 10, 100, "USD", "2023-01-02"), compra("PETR4", 100, 30, "BRL", "2023-01-02")],
    [provento("AAPL", 50, "USD"), provento("AAPL", 10, "USD", "imposto"), provento("PETR4", 20, "BRL")],
    [rfAberta("CDB X", 10000, "BRL")],
    { AAPL: quote(120), PETR4: quote(35, "BRL") },
    fx(6.0),   // fxAtual
    fx(5.0),   // fxCusto = pmDólar
  );
  const rv = snap.positions.filter(p => isRendaVariavel(p.setor));

  it("patrimônio total = RV + RF (sem sobra nem falta)", () => {
    expect(snap.totalPatrimonioBRL).toBeCloseTo(snap.rvPatrimonioBRL + snap.rfPatrimonioBRL, 6);
    expect(snap.rvPatrimonioBRL).toBeCloseTo(7200 + 3500, 6);
    expect(snap.rfPatrimonioBRL).toBeCloseTo(10000, 6); // só o CDB manual
  });

  it("por posição: retornoTotal = não realizado + realizado + proventos", () => {
    for (const p of rv) {
      expect(p.retornoTotalBRL ?? 0).toBeCloseTo((p.lucroBRL ?? 0) + p.lucroRealizadoBRL + p.proventosBRL, 6);
      if (p.custoTotalBRL > 0) {
        expect(p.retornoTotalPct ?? 0).toBeCloseTo(((p.retornoTotalBRL ?? 0) / p.custoTotalBRL) * 100, 6);
      }
    }
  });

  it("por posição: decomposição cambial soma exatamente o lucro", () => {
    for (const p of rv) {
      const soma = (p.ganhoAtivoPuroBRL ?? 0) + (p.ganhoFXPrincipalBRL ?? 0) + (p.ganhoCruzadoBRL ?? 0);
      expect(soma).toBeCloseTo(p.lucroBRL ?? 0, 6);
    }
  });

  it("totais RV = soma das posições RV", () => {
    const somaLucro = rv.reduce((s, p) => s + (p.lucroBRL ?? 0), 0);
    const somaProv = rv.reduce((s, p) => s + p.proventosBRL, 0);
    const somaRetTot = rv.reduce((s, p) => s + (p.retornoTotalBRL ?? 0), 0);
    expect(snap.lucroBRL).toBeCloseTo(somaLucro, 6);              // valorização
    expect(snap.proventosRVBRL).toBeCloseTo(somaProv, 6);
    expect(snap.retornoTotalRVBRL).toBeCloseTo(somaRetTot, 6);
  });

  it("retorno total RV = não realizado + realizado + proventos (identidade central)", () => {
    const realizadoRV = rv.reduce((s, p) => s + p.lucroRealizadoBRL, 0);
    expect(snap.retornoTotalRVBRL).toBeCloseTo(snap.lucroBRL + realizadoRV + snap.proventosRVBRL, 6);
    expect(snap.retornoTotalRVBRL).toBeCloseTo(2700 + 260, 6); // sem vendas: (2200+500) + (240+20)
  });

  it("proventos líquidos abatem o IR retido (40 USD × 6,00 = R$240)", () => {
    const aapl = rv.find(p => p.ticker === "AAPL")!;
    expect(aapl.proventosBRL).toBeCloseTo(240, 6);
  });

  it("Valorização % e Retorno Total % usam o mesmo denominador (investido)", () => {
    const totalInvestidoRV = rv.reduce((s, p) => s + p.custoTotalBRL, 0);
    expect(snap.lucroPct).toBeCloseTo((snap.lucroBRL / totalInvestidoRV) * 100, 6);
    expect(snap.retornoTotalRVPct).toBeCloseTo((snap.retornoTotalRVBRL / totalInvestidoRV) * 100, 6);
  });
});

import { describe, it, expect } from "vitest";
import { calcularCarteiraFIFO, enriquecerPosicoes, type Position } from "@/lib/portfolio";
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

// ── Caso canônico: ativo em USD com câmbio por lote ──────────────────────────
// V0 = 10 × 100 = US$ 1.000 ; V1 = 10 × 120 = US$ 1.200
// P0 = 5,00 (câmbio da compra) ; P1 = 6,00 (câmbio atual)
describe("decomposição multimoeda — ativo USD com FX por lote", () => {
  const fxByDate = new Map<string, number>([["2023-01-02", 5.0]]);
  const positions = build(
    [compra("AAPL", 10, 100, "USD", "2023-01-02")],
    { AAPL: quote(120) },
    fx(6.0),    // P1 = 6,00
    fx(5.5),    // PM fallback (não usado pois há FX por lote)
    fxByDate,
  );
  const p = positions.find(x => x.ticker === "AAPL")!;

  it("usa o câmbio de aquisição por lote como P0", () => {
    expect(p.pmFxAquisicao).toBeCloseTo(5.0, 6);
    expect(p.fxAtualBRL).toBeCloseTo(6.0, 6);
    expect(p.custoTotalBRL).toBeCloseTo(5000, 6); // 1000 USD × 5,00
  });

  it("ativo puro = (V1−V0)·P0", () => {
    expect(p.ganhoAtivoPuroBRL).toBeCloseTo(1000, 6); // 200 USD × 5,00
  });

  it("câmbio sobre o principal = V0·(P1−P0)", () => {
    expect(p.ganhoFXPrincipalBRL).toBeCloseTo(1000, 6); // 1000 USD × 1,00
  });

  it("efeito cruzado = (V1−V0)·(P1−P0)", () => {
    expect(p.ganhoCruzadoBRL).toBeCloseTo(200, 6); // 200 USD × 1,00
  });

  it("identidade: os 3 fatores somam exatamente o lucro em BRL", () => {
    const soma = (p.ganhoAtivoPuroBRL ?? 0) + (p.ganhoFXPrincipalBRL ?? 0) + (p.ganhoCruzadoBRL ?? 0);
    expect(soma).toBeCloseTo(p.lucroBRL ?? 0, 6);
    expect(p.lucroBRL).toBeCloseTo(2200, 6); // 7200 − 5000
  });

  it("compat 2-vias: ativo = puro+cruzado e câmbio = principal", () => {
    expect(p.ganhoAtivoBRL).toBeCloseTo(1200, 6);   // 1000 + 200
    expect(p.ganhoCambioBRL).toBeCloseTo(1000, 6);
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

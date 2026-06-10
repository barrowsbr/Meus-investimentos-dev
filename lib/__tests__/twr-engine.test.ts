import { describe, it, expect } from "vitest";
import { calcularTWR, businessDays, type PriceMatrix, type FxHistory } from "@/lib/twr-engine";
import type { FxRates } from "@/lib/cotacoes";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fx(usdbrl = 5.0): FxRates {
  return { USDBRL: usdbrl, EURBRL: usdbrl * 1.08, GBPBRL: usdbrl * 1.27, CADBRL: usdbrl * 0.73 };
}

function fxHist(dates: string[], usdbrl = 5.0): FxHistory {
  return Object.fromEntries(dates.map(d => [d, fx(usdbrl)]));
}

function compra(ticker: string, qty: number, preco: number, data: string, moeda = "BRL", taxas = 0) {
  return {
    "símbolo": ticker,
    "tipo de transação": "Compra",
    quantidade: qty,
    "preço": preco,
    "taxa de corretagem": taxas,
    moeda,
    data,
  } as Record<string, unknown>;
}

function provento(ticker: string, valor: number, data: string, moeda = "BRL", decisao = "Dividendo") {
  return { ticker, valor, data, moeda, decisao } as Record<string, unknown>;
}

function flatPrices(dates: string[], tickers: Record<string, number>): PriceMatrix {
  return Object.fromEntries(
    Object.entries(tickers).map(([t, p]) => [t, dates.map(() => p)])
  );
}

// ── Dia-âncora: NUNCA contribui retorno ──────────────────────────────────────
// Cenário da regressão: janela (YTD) onde uma transação cai exatamente no
// pre-window day. O NAV do dia 0 carrega o portfólio pré-janela inteiro, mas o
// flow do dia é minúsculo. Modified Dietz ingênuo daria ret = NAV/flow (explosão
// de +20.000%). O dia 0 deve ancorar em ret = 0.
describe("dia-âncora (day 0)", () => {
  it("não explode o TWR quando há transação no dia-âncora de uma janela", () => {
    const dates = ["2025-06-02", "2025-06-03", "2025-06-04"];
    const transacoes = [
      compra("AAAA3", 100, 10, "2025-01-02"), // pré-janela: estabelece a posição
      compra("AAAA3", 1, 10, "2025-06-02"),   // transação NO dia-âncora
    ];
    const prices: PriceMatrix = { AAAA3: [10, 11, 11] };
    const twr = calcularTWR({ transacoes, dates, prices, fxHistory: fxHist(dates) });

    // NAV dia 0 = 101 × 10 = 1010; dia 1 = 101 × 11 = 1111 → TWR ≈ +10%
    expect(twr.twrTotal).toBeGreaterThan(0.09);
    expect(twr.twrTotal).toBeLessThan(0.11);
    expect(twr.points[0].ret).toBe(0);
  });

  it("all-time: o dia da primeira compra (i > 0) computa Dietz normalmente", () => {
    const dates = ["2025-06-02", "2025-06-03", "2025-06-04", "2025-06-05"];
    // Compra no 2º dia da grade — prevNav = 0, base = flow > 0: retorno válido.
    const transacoes = [compra("AAAA3", 100, 10, "2025-06-03")];
    const prices: PriceMatrix = { AAAA3: [10, 10, 12, 12] };
    const twr = calcularTWR({ transacoes, dates, prices, fxHistory: fxHist(dates) });

    // Dia da compra: flow = 100×10 = 1000 (preço de mercado), NAV = 1000, ret = 0.
    // Dia seguinte: 1000 → 1200 = +20%.
    expect(twr.twrTotal).toBeGreaterThan(0.19);
    expect(twr.twrTotal).toBeLessThan(0.21);
  });
});

// ── MWR: proventos são fluxo do investidor ───────────────────────────────────
describe("MWR (XIRR)", () => {
  it("XIRR bate com a taxa anual exata num caso fechado (sem fluxos)", () => {
    // 1 compra, preço cresce geometricamente +21% em ~2 anos ⇒ TIR ≈ 10% a.a.
    const dates = businessDays("2023-01-02", "2025-01-02");
    const transacoes = [compra("AAAA3", 100, 10, "2023-01-02")];
    const n = dates.length;
    const prices: PriceMatrix = {
      AAAA3: dates.map((_, i) => 10 * Math.pow(1.21, i / (n - 1))),
    };
    const twr = calcularTWR({ transacoes, dates, prices, fxHistory: fxHist(dates) });

    // Sem fluxos: TWR acumulado = crescimento do preço…
    expect(twr.twrTotal).toBeCloseTo(0.21, 2);
    // …e o XIRR = mesma taxa anualizada (TWR e MWR convergem sem aportes).
    expect(twr.mwr).not.toBeNull();
    expect(twr.mwr!).toBeGreaterThan(0.09);
    expect(twr.mwr!).toBeLessThan(0.11);
  });

  it("MWR > TWR quando os aportes chegam antes do período bom (efeito timing)", () => {
    // Fase 1 (capital pequeno): preço flat. Aporte grande. Fase 2: +20%.
    const dates = businessDays("2024-01-01", "2024-12-31");
    const meio = dates[Math.floor(dates.length / 2)];
    const transacoes = [
      compra("AAAA3", 10, 10, dates[0]),     // capital pequeno na fase flat
      compra("AAAA3", 1000, 10, meio),       // capital grande antes da alta
    ];
    const n = dates.length;
    const half = Math.floor(n / 2);
    const prices: PriceMatrix = {
      AAAA3: dates.map((_, i) => (i <= half ? 10 : 10 * (1 + 0.2 * (i - half) / (n - 1 - half)))),
    };
    const twr = calcularTWR({ transacoes, dates, prices, fxHistory: fxHist(dates) });

    // TWR ≈ +20% (neutro a aportes). MWR anualizado deve superar o TWR
    // anualizado: quase todo o capital só existiu na metade boa do ano.
    expect(twr.twrTotal).toBeCloseTo(0.20, 1);
    expect(twr.mwr!).toBeGreaterThan(twr.twrAnualizado);
  });
  it("inclui dividendos recebidos como inflow do investidor", () => {
    const dates = businessDays("2025-01-06", "2025-03-31");
    const transacoes = [compra("AAAA3", 100, 10, "2025-01-06")];
    const proventos = [provento("AAAA3", 10, "2025-02-10")]; // 1% do NAV em caixa
    const prices = flatPrices(dates, { AAAA3: 10 });

    const com = calcularTWR({ transacoes, proventos, dates, prices, fxHistory: fxHist(dates) });
    const sem = calcularTWR({ transacoes, dates, prices, fxHistory: fxHist(dates) });

    // Preço flat: todo o retorno vem do dividendo. MWR sem dividendo = 0;
    // com dividendo tem que ser positivo.
    expect(sem.mwr ?? 0).toBeCloseTo(0, 3);
    expect(com.mwr).not.toBeNull();
    expect(com.mwr!).toBeGreaterThan(0.01);
  });
});

// ── Ganho econômico: identidade contábil ─────────────────────────────────────
describe("ganho econômico", () => {
  it("janela: income no dia-âncora NÃO conta; income dentro da janela conta", () => {
    const dates = ["2025-06-02", "2025-06-03", "2025-06-04"];
    const transacoes = [compra("AAAA3", 100, 10, "2025-01-02")];
    const proventos = [
      provento("AAAA3", 50, "2025-05-31"), // sáb → bizDate = 2025-06-02 (âncora): fora
      provento("AAAA3", 30, "2025-06-03"), // dentro da janela
    ];
    const prices = flatPrices(dates, { AAAA3: 10 });
    const twr = calcularTWR({ transacoes, proventos, dates, prices, fxHistory: fxHist(dates) });

    // Preço flat: GE = só o provento da janela = 30.
    expect(twr.ganhoEconomico).toBeCloseTo(30, 1);
  });

  it("all-time: GE = navFinal − Σ flows + Σ income (identidade exata)", () => {
    const dates = businessDays("2025-06-02", "2025-06-13");
    const transacoes = [compra("AAAA3", 100, 10, "2025-06-04")];
    const proventos = [provento("AAAA3", 25, "2025-06-09")];
    const prices = flatPrices(dates, { AAAA3: 10 });
    const twr = calcularTWR({ transacoes, proventos, dates, prices, fxHistory: fxHist(dates) });

    // Flat: navF = 1000, flow = 1000, income = 25 → GE = 25.
    expect(twr.ganhoEconomico).toBeCloseTo(25, 1);
  });

  it("GE bate com a soma telescópica dos ganhos diários", () => {
    const dates = businessDays("2025-06-02", "2025-06-30");
    const transacoes = [
      compra("AAAA3", 100, 10, "2025-06-03"),
      compra("AAAA3", 50, 11, "2025-06-10"),
    ];
    const proventos = [provento("AAAA3", 40, "2025-06-17")];
    // Preço sobe linearmente 10 → 12
    const prices: PriceMatrix = {
      AAAA3: dates.map((_, i) => 10 + (2 * i) / (dates.length - 1)),
    };
    const twr = calcularTWR({ transacoes, proventos, dates, prices, fxHistory: fxHist(dates) });

    const pts = twr.points;
    const firstIdx = pts.findIndex(p => p.nav > 0);
    let soma = 0;
    for (let i = firstIdx === 0 ? 1 : firstIdx; i < pts.length; i++) {
      const prev = i > 0 ? pts[i - 1].nav : 0;
      soma += pts[i].nav + pts[i].income - prev - pts[i].flow;
    }
    expect(twr.ganhoEconomico).toBeCloseTo(soma, 4);
  });
});

// ── Custo FIFO canônico (P0): pmFx + taxas ───────────────────────────────────
describe("custoPosicoesAtuais", () => {
  it("usa pmFx (não o spot) e inclui taxas — alinhado ao snapshot", () => {
    const dates = businessDays("2025-06-02", "2025-06-06");
    const transacoes = [compra("VOO", 10, 100, "2025-06-02", "USD", 5)];
    const prices = flatPrices(dates, { VOO: 100 });
    const twr = calcularTWR({
      transacoes, dates, prices,
      fxHistory: fxHist(dates, 6.0), // spot = 6.00
      pmFx: fx(5.0),                 // pmDólar das remessas = 5.00 (P0)
    });

    // (10 × 100 + 5) × 5.00 = 5025 — NÃO (…) × 6.00 = 6030
    expect(twr.custoPosicoesAtuais).toBeCloseTo(5025, 0);
  });
});

// ── Taxas de transação: retorno líquido de custos (GIPS) ─────────────────────
describe("taxas de transação nos flows", () => {
  it("corretagem da compra é drag no retorno e no ganho econômico", () => {
    const dates = businessDays("2025-06-02", "2025-06-10");
    // Compra no 2º dia com taxa de 10: investidor paga 1010, NAV ganha 1000.
    const transacoes = [compra("AAAA3", 100, 10, "2025-06-03", "BRL", 10)];
    const prices = flatPrices(dates, { AAAA3: 10 });
    const twr = calcularTWR({ transacoes, dates, prices, fxHistory: fxHist(dates) });

    // Preço flat: o único retorno é a perda da taxa: −10/1010.
    expect(twr.twrTotal).toBeCloseTo(-10 / 1010, 4);
    expect(twr.ganhoEconomico).toBeCloseTo(-10, 1);
  });
});

// ── Diagnostics ──────────────────────────────────────────────────────────────
describe("diagnostics", () => {
  it("forceZeroDays não conta dias pré-capital (antes da primeira compra)", () => {
    const dates = businessDays("2025-06-02", "2025-06-20");
    const transacoes = [compra("AAAA3", 100, 10, "2025-06-12")]; // compra tardia
    const prices = flatPrices(dates, { AAAA3: 10 });
    const twr = calcularTWR({ transacoes, dates, prices, fxHistory: fxHist(dates) });

    expect(twr.diagnostics.forceZeroDays).toBe(0);
    expect(twr.twrTotal).toBeCloseTo(0, 6);
  });
});

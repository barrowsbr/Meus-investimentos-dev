import { describe, it, expect } from "vitest";
import { calcularTWR, businessDays, buildRfTimeline, buildCDIBenchmark, type PriceMatrix, type FxHistory } from "@/lib/twr-engine";
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

// ── Captura de composição (painel "carteira nesta data") ─────────────────────
describe("capturePositions", () => {
  it("captura posições por ticker com valor/peso corretos na data pedida", () => {
    const dates = businessDays("2025-06-02", "2025-06-06");
    const transacoes = [
      compra("PETR4", 100, 30, "2025-06-02", "BRL"),   // 100 × 30 = 3000
      compra("VOO", 10, 100, "2025-06-02", "USD"),      // 10 × 100 × 5 = 5000 BRL
    ];
    const prices = flatPrices(dates, { PETR4: 30, VOO: 100 });
    const alvo = "2025-06-04";
    const twr = calcularTWR({
      transacoes, dates, prices, fxHistory: fxHist(dates, 5.0),
      capturePositions: [alvo],
    });
    const snap = twr.positionSnapshots?.[alvo];
    expect(snap).toBeTruthy();
    expect(snap!.navTotal).toBeCloseTo(8000, 0);
    const petr = snap!.positions.find(p => p.ticker === "PETR4")!;
    const voo = snap!.positions.find(p => p.ticker === "VOO")!;
    expect(petr.valorBRL).toBeCloseTo(3000, 0);
    expect((petr.valorBRL / snap!.navTotal) * 100).toBeCloseTo(37.5, 1);
    expect(voo.valorBRL).toBeCloseTo(5000, 0);
    expect(voo.moeda).toBe("USD");
    // Ordenado por valor desc (VOO antes de PETR4)
    expect(snap!.positions[0].ticker).toBe("VOO");
  });

  it("sem capturePositions, positionSnapshots fica undefined (zero overhead)", () => {
    const dates = businessDays("2025-06-02", "2025-06-06");
    const twr = calcularTWR({
      transacoes: [compra("PETR4", 100, 30, "2025-06-02", "BRL")],
      dates, prices: flatPrices(dates, { PETR4: 30 }), fxHistory: fxHist(dates),
    });
    expect(twr.positionSnapshots).toBeUndefined();
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

// ── Contribuição por setor: identidade exata Σ contrib = twrTotal ────────────
describe("contribuições por setor", () => {
  it("Σ contribuições = twrTotal (identidade telescópica) num cenário misto", () => {
    const dates = businessDays("2025-06-02", "2025-07-31");
    const n = dates.length;
    const transacoes = [
      compra("PETR4", 100, 10, "2025-06-02"),          // Ações Brasil
      compra("VOO", 10, 100, "2025-06-02", "USD"),      // ETF USA
      compra("PETR4", 50, 10.5, "2025-06-20"),          // aporte no meio
    ];
    const proventos = [provento("PETR4", 35, "2025-07-01")];
    const prices: PriceMatrix = {
      PETR4: dates.map((_, i) => 10 * (1 + 0.08 * i / (n - 1))),   // +8%
      VOO: dates.map((_, i) => 100 * (1 - 0.03 * i / (n - 1))),    // −3%
    };
    const twr = calcularTWR({ transacoes, proventos, dates, prices, fxHistory: fxHist(dates) });

    const soma = twr.contribuicoes.reduce((s, c) => s + c.contrib, 0);
    expect(soma).toBeCloseTo(twr.twrTotal, 8);

    const setores = new Map(twr.contribuicoes.map(c => [c.setor, c.contrib]));
    // PETR4 sobe + paga dividendo → contribuição positiva; VOO cai → negativa.
    expect(setores.get("Ações Brasil")!).toBeGreaterThan(0);
    const vooSetor = [...setores.entries()].find(([s]) => s !== "Ações Brasil");
    expect(vooSetor![1]).toBeLessThan(0);
  });

  it("preço flat + dividendo: contribuição vem 100% do setor do pagador", () => {
    const dates = businessDays("2025-06-02", "2025-06-30");
    const transacoes = [
      compra("PETR4", 100, 10, "2025-06-02"),
      compra("VOO", 10, 100, "2025-06-02", "USD"),
    ];
    const proventos = [provento("PETR4", 20, "2025-06-16")];
    const prices = flatPrices(dates, { PETR4: 10, VOO: 100 });
    const twr = calcularTWR({ transacoes, proventos, dates, prices, fxHistory: fxHist(dates) });

    const soma = twr.contribuicoes.reduce((s, c) => s + c.contrib, 0);
    expect(soma).toBeCloseTo(twr.twrTotal, 8);
    const br = twr.contribuicoes.find(c => c.setor === "Ações Brasil");
    expect(br!.contrib).toBeCloseTo(twr.twrTotal, 8);
  });
});

// ── navFx: parcela estrangeira do NAV (decomposição cambial ponderada) ───────
describe("navFx", () => {
  it("rastreia só os ativos em moeda estrangeira", () => {
    const dates = businessDays("2025-06-02", "2025-06-06");
    const transacoes = [
      compra("PETR4", 100, 10, "2025-06-02"),       // 1000 BRL
      compra("VOO", 10, 100, "2025-06-02", "USD"),  // 1000 USD × 5 = 5000 BRL
    ];
    const prices = flatPrices(dates, { PETR4: 10, VOO: 100 });
    const twr = calcularTWR({ transacoes, dates, prices, fxHistory: fxHist(dates, 5.0) });

    const last = twr.points[twr.points.length - 1];
    expect(last.nav).toBeCloseTo(6000, 0);
    expect(last.navFx).toBeCloseTo(5000, 0);
  });
});

// ── RF: acrual a taxa real + true-up — o passado NUNCA muda ──────────────────
describe("buildRfTimeline (taxa implícita + congelamento)", () => {
  const rfCompra = (ticker: string, valor: number, data: string, moeda = "BRL") =>
    ({ ticker, tipo: "Compra", valor, compra: data, moeda } as Record<string, unknown>);
  const aberta = (ticker: string, atual: number, data: string, moeda = "BRL") =>
    ({ ticker, atual, data, moeda } as Record<string, unknown>);

  it("taxa implícita: caminho suave atinge o saldo manual no último dia", () => {
    const dates = businessDays("2025-06-02", "2025-09-30");
    const txs = [rfCompra("CDB Banco X", 10000, "2025-06-02")];
    const { navByDate } = buildRfTimeline(
      txs, [aberta("CDB Banco X", 10300, "2025-08-01")], dates, fxHist(dates),
    );
    const last = dates[dates.length - 1];
    // NAV atinge o saldo manual no último dia do grid (data da aberta é ignorada)
    expect(navByDate[last]).toBeCloseTo(10300, -1);
    // Caminho é suave (variação diária constante, < 0.2%)
    for (let i = 1; i < dates.length; i++) {
      expect(Math.abs(navByDate[dates[i]] / navByDate[dates[i - 1]] - 1)).toBeLessThan(0.002);
    }
  });

  it("fixa_aberta = hoje: taxa implícita resolve até o último dia do grid", () => {
    const dates = businessDays("2025-06-02", "2025-06-30");
    const txs = [rfCompra("CDB Banco X", 10000, "2025-06-02")];
    const { navByDate } = buildRfTimeline(
      txs, [aberta("CDB Banco X", 10200, "2025-06-16")], dates, fxHist(dates),
    );
    const last = dates[dates.length - 1];
    // A data da fixa_aberta é ignorada — sempre resolve até lastDate
    expect(navByDate[last]).toBeCloseTo(10200, -1);
    // Caminho suave o grid inteiro (sem congelamento mid-grid)
    expect(navByDate[dates[1]]).toBeGreaterThan(navByDate[dates[0]]);
  });

  it("janela filtrada: compra pré-janela vira saldo de abertura (sem degrau)", () => {
    const dates = businessDays("2025-06-02", "2025-09-30");
    const txs = [rfCompra("CDB Banco X", 10000, "2025-01-02")]; // ANTES da janela
    const { navByDate, flowByDate } = buildRfTimeline(
      txs, [aberta("CDB Banco X", 10800, "2025-08-01")], dates, fxHist(dates),
    );
    const last = dates[dates.length - 1];
    // Dia-âncora já carrega a posição acruada desde a compra
    expect(navByDate[dates[0]]).toBeGreaterThan(10000);
    // Compra pré-janela NÃO reaparece como fluxo dentro da janela
    expect(flowByDate[dates[0]] ?? 0).toBe(0);
    // Variação diária suave (taxa implícita constante)
    for (let i = 1; i < dates.length; i++) {
      expect(Math.abs(navByDate[dates[i]] / navByDate[dates[i - 1]] - 1)).toBeLessThan(0.01);
    }
    // NAV atinge o saldo manual no último dia (não na data da aberta)
    expect(navByDate[last]).toBeCloseTo(10800, -1);
  });

  it("posição USD entra em navFxByDate (exposição cambial de RF)", () => {
    const dates = businessDays("2025-06-02", "2025-06-13");
    const txs = [rfCompra("CDB Global USD", 1000, "2025-06-02", "USD")];
    const { navByDate, navFxByDate } = buildRfTimeline(txs, [], dates, fxHist(dates, 5.0));
    const last = dates[dates.length - 1];
    expect(navFxByDate[last]).toBeCloseTo(navByDate[last], 4);
    expect(navFxByDate[last]).toBeGreaterThan(4900);
  });

  // Grid com TODOS os dias corridos (cripto cota sáb/dom) — é o grid real do
  // db_cotacoes. A regressão: taxa por dia útil aplicada em dias corridos
  // estourava o alvo e deixava resíduo fantasma após o resgate.
  const calendarDays = (start: string, end: string): string[] => {
    const out: string[] = [];
    const d = new Date(start + "T12:00:00Z");
    const e = new Date(end + "T12:00:00Z");
    while (d <= e) {
      out.push(d.toISOString().split("T")[0]);
      d.setDate(d.getDate() + 1);
    }
    return out;
  };
  const rfVenda = (ticker: string, valor: number, data: string, moeda = "BRL") =>
    ({ ticker, tipo: "Venda", valor, compra: data, moeda } as Record<string, unknown>);
  const rfImposto = (ticker: string, valor: number, data: string, moeda = "BRL") =>
    ({ ticker, tipo: "Imposto", valor, compra: data, moeda } as Record<string, unknown>);

  it("posição encerrada: NAV zera no resgate e NÃO deixa resíduo fantasma", () => {
    const dates = calendarDays("2025-01-02", "2025-12-30");
    const txs = [
      rfCompra("CDB Banco X", 10000, "2025-01-02"),
      rfVenda("CDB Banco X", 11000, "2025-06-16"),
    ];
    const { navByDate, flowByDate } = buildRfTimeline(txs, [], dates, fxHist(dates));
    // Após o resgate total, NAV = 0 para sempre (nada de acruar fantasma)
    expect(navByDate["2025-06-17"]).toBe(0);
    expect(navByDate[dates[dates.length - 1]]).toBe(0);
    // Caminho até a venda não estoura o valor resgatado (taxa por dia útil
    // aplicada só em dias úteis, mesmo com grid de dias corridos)
    expect(navByDate["2025-06-13"]).toBeLessThan(11000 * 1.01);
    // Ganho econômico da posição = Σflows = −(venda − compra) = −1000
    const flows = Object.values(flowByDate).reduce((s, v) => s + v, 0);
    expect(flows).toBeCloseTo(-1000, 0);
  });

  it("IR de resgate NÃO entra no retorno — carteira acrua e resgata BRUTO (GIPS)", () => {
    const dates = calendarDays("2025-01-02", "2025-08-29");
    const txs = [
      rfCompra("CDB Banco X", 10000, "2025-01-02"),
      rfVenda("CDB Banco X", 11000, "2025-06-16"),
      rfImposto("CDB Banco X", 200, "2025-06-16"),
    ];
    const { navByDate, flowByDate } = buildRfTimeline(txs, [], dates, fxHist(dates));
    // Flow do resgate = valor BRUTO; o IR é do investidor, fora da carteira.
    // Descontar IR do retorno distorcia o TWR (perda fantasma no dia da venda).
    expect(flowByDate["2025-06-16"]).toBeCloseTo(-11000, 0);
    // Ganho econômico da carteira = 1000 (bruto)
    const flows = Object.values(flowByDate).reduce((s, v) => s + v, 0);
    expect(flows).toBeCloseTo(-1000, 0);
    expect(navByDate[dates[dates.length - 1]]).toBe(0);
  });

  it("grid com fins de semana: caminho da taxa implícita atinge o saldo sem overshoot", () => {
    const dates = calendarDays("2025-01-02", "2025-06-30");
    const txs = [rfCompra("CDB Banco X", 10000, "2025-01-02")];
    const { navByDate } = buildRfTimeline(
      txs, [aberta("CDB Banco X", 10500, "2025-06-30")], dates, fxHist(dates),
    );
    const last = dates[dates.length - 1];
    expect(navByDate[last]).toBeCloseTo(10500, -1);
    // Em nenhum dia o NAV passa do saldo manual além de tolerância mínima —
    // antes o overshoot chegava perto do true-up e caía num degrau no fim.
    for (const d of dates) {
      expect(navByDate[d]).toBeLessThan(10500 * 1.005);
    }
    // Fim de semana não acrua (taxa é por dia útil)
    expect(navByDate["2025-03-09"]).toBeCloseTo(navByDate["2025-03-07"], 6); // sáb/dom = sexta
  });

  // Regressão (TWR inflado 76%→96%): mergeIbkrCashIntoFixaAberta injeta o caixa
  // ao vivo da IBKR como linha sintética "Caixa USD (IBKR)". O filtro de caixa
  // era match EXATO ({CAIXA,SALDO,CASH,RESERVA}) → não pegava o nome descritivo,
  // e identificarSetor("CAIXA USD (IBKR)")="Renda Fixa" → o saldo entrava como
  // posição RF manual, injetado como aporte em dates[0] e revalorizado por
  // câmbio TODO dia. Anos de alta do dólar viravam "rendimento" fantasma no TWR.
  it("caixa IBKR (nome descritivo, sem compra) NÃO entra na timeline de RF", () => {
    const dates = businessDays("2020-06-02", "2025-06-30"); // janela longa (5 anos)
    const caixaIbkr = { ticker: "Caixa USD (IBKR)", atual: 50000, moeda: "USD", tipo: "Caixa" } as Record<string, unknown>;
    const { navByDate, flowByDate, navFxByDate } = buildRfTimeline([], [caixaIbkr], dates, fxHist(dates, 5.0));
    // Excluído por completo: sem NAV, sem fluxo, sem exposição cambial de RF.
    for (const d of dates) {
      expect(navByDate[d] ?? 0).toBe(0);
      expect(flowByDate[d] ?? 0).toBe(0);
      expect(navFxByDate[d] ?? 0).toBe(0);
    }
  });

  it("caixa com true-up (CAIXA cru) segue excluído da timeline de RF", () => {
    const dates = businessDays("2025-06-02", "2025-06-30");
    const caixa = aberta("CAIXA", 30000, "2025-06-16", "BRL");
    const { navByDate } = buildRfTimeline([], [caixa], dates, fxHist(dates));
    for (const d of dates) expect(navByDate[d] ?? 0).toBe(0);
  });
});

// ── Benchmark CDI com série real do BCB ──────────────────────────────────────
describe("buildCDIBenchmark", () => {
  it("usa a taxa real do dia e NÃO acrua em feriado (data sem entrada)", () => {
    const dates = ["2025-06-02", "2025-06-03", "2025-06-04"];
    const cdi = { "2025-06-03": 0.0005 }; // 02 e 04 = sem entrada (feriado)
    const pts = buildCDIBenchmark(dates, cdi);
    expect(pts[1].ret).toBeCloseTo(0.0005, 10);
    expect(pts[2].ret).toBe(0);
    expect(pts[2].twr).toBeCloseTo(0.0005, 10);
  });

  it("sem série do BCB cai na tabela SELIC embutida", () => {
    const dates = ["2025-07-01", "2025-07-02"];
    const pts = buildCDIBenchmark(dates);
    // 15% a.a. (COPOM 18/06/2025) → diária ≈ 0.000555
    expect(pts[1].ret).toBeCloseTo(Math.pow(1.15, 1 / 252) - 1, 8);
  });
});

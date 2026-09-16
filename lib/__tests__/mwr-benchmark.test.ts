import { describe, expect, it } from "vitest";
import { calcularMWRDiario, mwrBenchmarkDiario, navSimuladoBenchmark, type PontoFluxo } from "../mwr";

// O defeito que estes testes guardam: o gráfico de Performance comparava a
// linha MWR da carteira (que embute tamanho e momento dos aportes) com
// benchmarks TWR (buy-and-hold, que expurgam exatamente isso). A régua certa é
// a TIR que o benchmark teria produzido com os MESMOS fluxos.

const dias = (n: number): string[] => {
  const out: string[] = [];
  const d = new Date(Date.UTC(2024, 0, 1));
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
};

/** Benchmark com retorno diário constante (o CDI é quase isso). */
const benchConstante = (datas: string[], g: number) =>
  new Map<string, number | null>(datas.map((d, i) => [d, Math.pow(1 + g, i) - 1]));

/** Benchmark parado na 1ª metade e em alta forte na 2ª (timing importa). */
const benchComRally = (datas: string[]) => {
  const m = new Map<string, number | null>();
  const meio = Math.floor(datas.length / 2);
  datas.forEach((d, i) => m.set(d, i < meio ? 0 : (i - meio + 1) * 0.004));
  return m;
};

const ultimo = (m: Map<string, number | null>, datas: string[]) => m.get(datas[datas.length - 1]) ?? null;

describe("navSimuladoBenchmark — os seus fluxos aplicados no índice", () => {
  const datas = dias(5);
  const bench = benchConstante(datas, 0.001);

  it("compra cotas do índice a cada aporte", () => {
    const pts: PontoFluxo[] = datas.map((date, i) => ({
      date, nav: 0, flow: i === 0 ? 1000 : i === 2 ? 500 : 0, income: 0,
    }));
    pts[0].nav = 1000;
    const sim = navSimuladoBenchmark(pts, bench)!;
    expect(sim[0].nav).toBeCloseTo(1000, 6);
    // Dia 2: 1000 rendendo 0,1%/dia por 2 dias + 500 entrando agora.
    expect(sim[2].nav).toBeCloseTo(1000 * Math.pow(1.001, 2) + 500, 6);
    // Dia 4: os dois blocos seguem rendendo.
    expect(sim[4].nav).toBeCloseTo(1000 * Math.pow(1.001, 4) + 500 * Math.pow(1.001, 2), 6);
  });

  it("provento recebido SAI da carteira simulada (mesmo fluxo da real)", () => {
    const pts: PontoFluxo[] = datas.map((date, i) => ({
      date, nav: i === 0 ? 1000 : 0, flow: 0, income: i === 2 ? 100 : 0,
    }));
    const sim = navSimuladoBenchmark(pts, bench)!;
    expect(sim[2].nav).toBeCloseTo(1000 * Math.pow(1.001, 2) - 100, 6);
  });

  it("dia sem cotação do índice repete o último nível (não vira fluxo fantasma)", () => {
    const furado = new Map(bench);
    furado.set(datas[3], null);
    const pts: PontoFluxo[] = datas.map((date, i) => ({ date, nav: i === 0 ? 1000 : 0, flow: 0, income: 0 }));
    const sim = navSimuladoBenchmark(pts, furado)!;
    expect(sim[3].nav).toBeCloseTo(sim[2].nav, 6);
    expect(sim[4].nav).toBeCloseTo(1000 * Math.pow(1.001, 4), 6);
  });

  it("benchmark que não cobre o início da janela devolve null, não um base inventado", () => {
    const pts: PontoFluxo[] = datas.map((date) => ({ date, nav: 1000, flow: 0, income: 0 }));
    expect(navSimuladoBenchmark(pts, new Map())).toBeNull();
  });
});

describe("mwrBenchmarkDiario — a régua certa para o MWR", () => {
  const datas = dias(200);

  it("sem fluxo depois do primeiro dia, a TIR do índice É o retorno dele", () => {
    // Caso degenerado de controle: sem timing para capturar, MWR = TWR.
    const bench = benchConstante(datas, 0.0004);
    const pts: PontoFluxo[] = datas.map((date, i) => ({ date, nav: i === 0 ? 10000 : 0, flow: 0, income: 0 }));
    const r = ultimo(mwrBenchmarkDiario(pts, bench), datas)!;
    expect(r).toBeCloseTo(ultimo(bench, datas)!, 6);
  });

  it("com taxa constante, fluxo nenhum muda a TIR (propriedade do CDI)", () => {
    // O CDI rende todo dia: aportar antes ou depois não cria nem destrói
    // retorno. Por isso a régua MWR do CDI fica colada na TWR dele — e é
    // justamente contra os índices VOLÁTEIS que a distinção aparece.
    const bench = benchConstante(datas, 0.0004);
    const pts: PontoFluxo[] = datas.map((date, i) => ({
      date,
      nav: i === 0 ? 10000 : 0,
      flow: i === 0 ? 10000 : i % 30 === 0 ? 5000 : i === 150 ? -8000 : 0,
      income: 0,
    }));
    const r = ultimo(mwrBenchmarkDiario(pts, bench), datas)!;
    expect(r).toBeCloseTo(ultimo(bench, datas)!, 4);
  });

  it("num índice volátil, aportar ANTES da alta levanta a TIR acima do TWR", () => {
    // Contraprova do defeito: comparar o MWR da carteira com o TWR do IBOV
    // dava crédito ao investidor por um timing que o próprio índice teria
    // capturado com os mesmos fluxos.
    const bench = benchComRally(datas);
    const meio = Math.floor(datas.length / 2);
    const pts: PontoFluxo[] = datas.map((date, i) => ({
      date, nav: i === 0 ? 10000 : 0, flow: i === meio - 1 ? 90000 : 0, income: 0,
    }));
    const mwr = ultimo(mwrBenchmarkDiario(pts, bench), datas)!;
    const twr = ultimo(bench, datas)!;
    expect(mwr).toBeGreaterThan(twr + 0.05);
  });

  it("aportar ANTES da queda derruba a TIR abaixo do TWR", () => {
    const m = new Map<string, number | null>();
    const meio = Math.floor(datas.length / 2);
    // Sobe na 1ª metade, devolve tudo na 2ª: TWR final ~0, mas quem entrou
    // pesado no topo perde.
    datas.forEach((d, i) => m.set(d, i < meio ? i * 0.004 : (2 * meio - i) * 0.004));
    const pts: PontoFluxo[] = datas.map((date, i) => ({
      date, nav: i === 0 ? 10000 : 0, flow: i === meio ? 90000 : 0, income: 0,
    }));
    const mwr = ultimo(mwrBenchmarkDiario(pts, m), datas)!;
    expect(Math.abs(ultimo(m, datas)!)).toBeLessThan(0.01); // índice volta ao ponto de partida
    expect(mwr).toBeLessThan(-0.05);
  });

  it("usa o MESMO solver da carteira (nenhum caminho paralelo de cálculo)", () => {
    // Se a simulação e a carteira usassem TIRs diferentes, a comparação seria
    // entre réguas distintas — o defeito original, só que escondido.
    const bench = benchComRally(datas);
    const pts: PontoFluxo[] = datas.map((date, i) => ({
      date, nav: i === 0 ? 10000 : 0, flow: i === 50 ? 20000 : 0, income: 0,
    }));
    const viaHelper = mwrBenchmarkDiario(pts, bench);
    const viaSolver = calcularMWRDiario(navSimuladoBenchmark(pts, bench)!);
    expect([...viaHelper.entries()]).toEqual([...viaSolver.entries()]);
  });
});

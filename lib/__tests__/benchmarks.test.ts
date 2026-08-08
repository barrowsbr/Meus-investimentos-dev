import { describe, it, expect } from "vitest";
import { mergeTotalReturnHybrid, buildIpcaBenchmark } from "../twr-engine";

// Benchmarks do gráfico de Performance — helpers puros.

describe("mergeTotalReturnHybrid", () => {
  it("usa retornos da série TR quando ela cobre", () => {
    const tr = [100, 110, 121];
    const pr = [50, 50, 50]; // preço flat — não pode contaminar
    const out = mergeTotalReturnHybrid(tr, pr) as number[];
    expect(out[0]).toBe(100);
    expect(out[1]).toBeCloseTo(110, 6);
    expect(out[2]).toBeCloseTo(121, 6);
  });

  it("encadeia pelo preço nas datas sem TR (fallback histórico)", () => {
    // TR só existe a partir do dia 2; dias 0→1 vêm do preço (+10%).
    const tr = [null, null, 200, 220];
    const pr = [100, 110, 110, 110];
    const out = mergeTotalReturnHybrid(tr, pr) as number[];
    expect(out[0]).toBe(100);
    expect(out[1]).toBeCloseTo(110, 6);   // +10% do preço
    expect(out[2]).toBeCloseTo(110, 6);   // TR ainda sem par (tPrev null), preço flat
    expect(out[3]).toBeCloseTo(121, 6);   // +10% do TR (200→220)
  });

  it("sem dado nenhum devolve null até a primeira observação", () => {
    const out = mergeTotalReturnHybrid([null, null], [null, 100]);
    expect(out[0]).toBeNull();
    expect(out[1]).toBe(100);
  });
});

describe("buildIpcaBenchmark", () => {
  it("distribui a taxa do mês pro-rata pelos dias do grid (compõe exato no fim do mês)", () => {
    // 4 dias úteis em jan; IPCA do mês = 1%.
    const dates = ["2025-01-02", "2025-01-03", "2025-01-06", "2025-01-07"];
    const out = buildIpcaBenchmark(dates, { "2025-01": 0.01 });
    expect(out[3].twr).toBeCloseTo(0.01, 10); // fim do mês = exatamente 1%
    expect(out[1].twr).toBeCloseTo(Math.pow(1.01, 2 / 4) - 1, 10); // meio: (1,01)^(2/4)−1
  });

  it("mês sem taxa publicada fica flat (sem extrapolação)", () => {
    const dates = ["2025-01-31", "2025-02-03", "2025-02-04"];
    const out = buildIpcaBenchmark(dates, { "2025-01": 0.01 });
    // Janeiro tem 1 dia no grid → acumula o mês inteiro nele.
    expect(out[0].twr).toBeCloseTo(0.01, 10);
    // Fevereiro sem taxa → linha para de subir.
    expect(out[2].twr).toBeCloseTo(0.01, 10);
  });

  it("meses consecutivos compõem (não somam)", () => {
    const dates = ["2025-01-31", "2025-02-28"];
    const out = buildIpcaBenchmark(dates, { "2025-01": 0.01, "2025-02": 0.02 });
    expect(out[1].twr).toBeCloseTo(1.01 * 1.02 - 1, 10);
  });
});

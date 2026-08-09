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

// ── Curva do Tesouro destilada (fonte nova, ago/2026) ────────────────────────
import { parseCurvaGerada } from "../juros/fontes";

describe("parseCurvaGerada", () => {
  const raw = {
    dataBase: "2026-08-07",
    titulos: [
      { tipo: "Tesouro Prefixado", vencimento: "2029-01-01", taxaCompra: 14.1, taxaVenda: 14.22, puCompra: 731.24 },
      { tipo: "Tesouro IPCA+ com Juros Semestrais", vencimento: "2035-05-15", taxaCompra: 8.04, taxaVenda: 8.16, puCompra: 4238.5 },
      { tipo: "Tesouro Selic", vencimento: "2028-03-01", taxaCompra: 0.02, taxaVenda: 0.03, puCompra: 19615.41 },
      { tipo: "Tesouro Educa+", vencimento: "2035-12-15", taxaCompra: 8.1, taxaVenda: 8.22, puCompra: 2799 },
      { tipo: "Tesouro Renda+ Aposentadoria Extra", vencimento: "2054-12-15", taxaCompra: 7.51, taxaVenda: 7.63, puCompra: 1374.08 },
      { tipo: "Tesouro IGPM+ com Juros Semestrais", vencimento: "2031-01-01", taxaCompra: 8.18, taxaVenda: 8.3, puCompra: 7559.54 },
      { tipo: "Tesouro Prefixado", vencimento: "2020-01-01", taxaCompra: 10, taxaVenda: 10.1, puCompra: 900 }, // vencido
    ],
  };
  const r = parseCurvaGerada(raw, "2026-08-08");

  it("mantém só Prefixado e IPCA+ (Selic/Educa+/Renda+/IGPM+/vencidos fora)", () => {
    expect(r.vertices.map((v) => v.indexador).sort()).toEqual(["IPCA", "PREFIXADO"]);
  });

  it("monta o vértice com nome, taxa de compra e cupom detectado", () => {
    const ipca = r.vertices.find((v) => v.indexador === "IPCA")!;
    expect(ipca.titulo).toBe("Tesouro IPCA+ com Juros Semestrais 2035");
    expect(ipca.taxa).toBeCloseTo(8.04);
    expect(ipca.juroSemestral).toBe(true);
    expect(ipca.taxaResgate).toBeCloseTo(8.16);
  });

  it("usa a data-base do arquivo como fechamento", () => {
    expect(r.fechamento).toBe("2026-08-07");
    expect(r.ok).toBe(true);
  });
});

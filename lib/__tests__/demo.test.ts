import { describe, it, expect } from "vitest";
import { scaleRowsForTab, DEMO_FACTOR } from "../demo";

describe("modo demonstração — scaleRowsForTab", () => {
  it("escala quantidade e valores de meus_ativos, mas NÃO o preço unitário", () => {
    const [row] = scaleRowsForTab("meus_ativos", [
      {
        símbolo: "PETR4",
        quantidade: 100,
        preço: 38.5,
        "valor bruto": 3850,
        "valor líquido": 3845,
        "taxa de corretagem": 5,
        moeda: "BRL",
      },
    ]);
    expect(row["quantidade"]).toBe(100 * DEMO_FACTOR);
    expect(row["valor bruto"]).toBe(3850 * DEMO_FACTOR);
    expect(row["valor líquido"]).toBe(3845 * DEMO_FACTOR);
    expect(row["taxa de corretagem"]).toBe(5 * DEMO_FACTOR);
    // preço unitário e moeda permanecem reais → preserva preço, % e câmbio
    expect(row["preço"]).toBe(38.5);
    expect(row["símbolo"]).toBe("PETR4");
    expect(row["moeda"]).toBe("BRL");
  });

  it("escala proventos e aceita número em formato BR (vírgula)", () => {
    const [row] = scaleRowsForTab("meus_proventos", [{ ticker: "ITUB4", valor: "12,50" }]);
    expect(row["valor"]).toBeCloseTo(12.5 * DEMO_FACTOR, 6);
    expect(row["ticker"]).toBe("ITUB4");
  });

  it("escala valores de câmbio mas mantém a taxa (VET) real", () => {
    const [row] = scaleRowsForTab("cambio", [
      { valor_origem: 1000, valor_destino: 190, taxa: 5.26, vet: 5.3 },
    ]);
    expect(row["valor_origem"]).toBe(1000 * DEMO_FACTOR);
    expect(row["valor_destino"]).toBe(190 * DEMO_FACTOR);
    expect(row["taxa"]).toBe(5.26);
    expect(row["vet"]).toBe(5.3);
  });

  it("não toca em abas não escaláveis (cotações, ptax, composição)", () => {
    const cot = [{ data: "2025-01-02", PETR4: 38.5, "BRL=X": 5.2 }];
    expect(scaleRowsForTab("db_cotacoes", cot)).toEqual(cot);
    const comp = [{ ticker: "AAPL", peso: 7.1 }];
    expect(scaleRowsForTab("composicao", comp)).toEqual(comp);
  });
});

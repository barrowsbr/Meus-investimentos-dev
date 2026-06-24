import { describe, it, expect } from "vitest";
import { computeFromStored } from "../etf-holdings";

// ─────────────────────────────────────────────────────────────────────────────
// Regressão do bucket "Outros · diversificação": prova que um ETF amplo
// (VWRA) nunca aparece como "10 ações = 100%", que a cobertura é honesta
// (<100%) e que as partes (top holdings + Outros) somam o valor do fundo.
// Sem rede: computeFromStored é puro.
// ─────────────────────────────────────────────────────────────────────────────

const VWRA_NAMES = ["MSFT", "NVDA", "AVGO", "TSLA", "AMZN", "GOOG", "META", "BRK-B", "AAPL", "JPM"];

describe("ETF look-through — bucket Outros (diversificação)", () => {
  it("VWRA com pesos corrompidos (10×10%) usa curado e emite Outros", () => {
    // Dado corrompido: top-10 inflados a 10% cada (somando 100%).
    const corrupt = VWRA_NAMES.map(t => ({ ticker: t, name: t, weight_pct: 10 }));
    const out = computeFromStored(
      { VWRA: corrupt },
      [{ ticker: "VWRA", setor: "ETF USA", valorAtualBRL: 18_400, quantidade: 1 }],
      50,
      { VWRA: "yahoo" },
    );
    const etf = out.per_etf["VWRA"];
    expect(etf.status).toBe("ok");

    // Tem bucket Outros e ele domina (a maior parte de um All-World é difusa).
    const outros = etf.holdings!.find(h => h.ticker.startsWith("OUTROS."));
    expect(outros).toBeDefined();
    expect(outros!.weight_pct).toBeGreaterThan(50);

    // Cobertura honesta (<80%), não os 100% corrompidos.
    expect(etf.covered_pct).toBeLessThan(80);

    // Usou pesos curados, não os 10% iguais.
    expect(etf.source).toContain("curado");
    expect(etf.holdings!.some(h => h.ticker === "AAPL" && h.weight_pct > 3 && h.weight_pct < 6)).toBe(true);

    // Soma das partes = 100% do valor do ETF (bate).
    const totalW = etf.holdings!.reduce((s, h) => s + h.weight_pct, 0);
    expect(totalW).toBeCloseTo(100, 0);
  });

  it("não duplica Outros quando o input já tem um bucket", () => {
    const out = computeFromStored(
      { QQQ: [
        { ticker: "AAPL", name: "Apple", weight_pct: 9 },
        { ticker: "OUTROS.QQQ", name: "x", weight_pct: 50 },
      ] },
      [{ ticker: "QQQ", setor: "ETF USA", valorAtualBRL: 11_500, quantidade: 1 }],
      50,
      { QQQ: "embedded" },
    );
    const etf = out.per_etf["QQQ"];
    const outrosRows = etf.holdings!.filter(h => h.ticker.startsWith("OUTROS."));
    expect(outrosRows.length).toBe(1);
    const totalW = etf.holdings!.reduce((s, h) => s + h.weight_pct, 0);
    expect(totalW).toBeCloseTo(100, 0);
  });
});

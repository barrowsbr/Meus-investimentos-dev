import { describe, it, expect } from "vitest";
import { fillQuotesWithGolden, type GoldenLastMaps, type Quote } from "@/lib/cotacoes";

// Golden source fake: último fechamento por coluna (exato + base sem sufixo).
const golden: GoldenLastMaps = {
  exact: new Map<string, number>([["ITUB4", 32.5], ["VALE3", 60], ["VOO", 500]]),
  byBase: new Map<string, number>([["ITUB4", 32.5], ["VALE3", 60], ["VOO", 500]]),
};

describe("fillQuotesWithGolden (fallback de valor sem inflar — vetores do #561)", () => {
  it("preenche ticker sem cotação com o último fechamento (não o custo)", () => {
    const { quotes, filled } = fillQuotesWithGolden(
      {}, [{ ticker: "ITUB4.SA", moeda: "BRL", corretora: "B3" }], golden,
    );
    expect(filled).toEqual(["ITUB4.SA"]);
    expect(quotes["ITUB4.SA"].price).toBe(32.5);   // base match ITUB4 (não .SA exato)
    expect(quotes["ITUB4.SA"].change).toBe(0);      // sem retorno inventado
    expect(quotes["ITUB4.SA"].currency).toBe("BRL");
  });

  it("VETOR 2 (moeda): ativo USD fica USD — NUNCA vira BRL×5,7", () => {
    const { quotes } = fillQuotesWithGolden(
      {}, [{ ticker: "VOO", moeda: "USD", corretora: "IBKR" }], golden,
    );
    // getMoedaEfetiva(ETF USA) = USD → o motor multiplica pelo dólar UMA vez.
    expect(quotes["VOO"].currency).toBe("USD");
    expect(quotes["VOO"].price).toBe(500);
  });

  it("VETOR 1 (colisão): base de ITUB4.SA NÃO retorna preço de outro ticker", () => {
    const { quotes } = fillQuotesWithGolden(
      {}, [{ ticker: "ITUB4.SA", moeda: "BRL", corretora: "B3" }], golden,
    );
    expect(quotes["ITUB4.SA"].price).toBe(32.5);
    expect(quotes["ITUB4.SA"].price).not.toBe(60);  // não pega VALE3
  });

  it("NÃO sobrescreve cotação ao vivo já existente", () => {
    const vivo: Record<string, Quote> = {
      "VALE3.SA": { price: 61, change: 1, changePercent: 1.6, currency: "BRL", name: "VALE3" },
    };
    const { quotes, filled } = fillQuotesWithGolden(
      vivo, [{ ticker: "VALE3.SA", moeda: "BRL", corretora: "B3" }], golden,
    );
    expect(filled).toEqual([]);
    expect(quotes["VALE3.SA"].price).toBe(61);       // preço ao vivo preservado
  });

  it("ticker ausente da golden não é preenchido (motor cai no custo, como antes)", () => {
    const { quotes, filled } = fillQuotesWithGolden(
      {}, [{ ticker: "XPTO3.SA", moeda: "BRL", corretora: "B3" }], golden,
    );
    expect(filled).toEqual([]);
    expect(quotes["XPTO3.SA"]).toBeUndefined();
  });
});

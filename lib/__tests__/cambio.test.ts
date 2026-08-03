import { describe, it, expect } from "vitest";
import { calcularCambioMetrics } from "@/lib/cambio";
import type { FxRates } from "@/lib/cotacoes";

const fx: FxRates = { USDBRL: 5.0, EURBRL: 5.4, GBPBRL: 6.35, CADBRL: 3.65 };

const row = (moeda_origem: string, moeda_destino: string, valor_origem: number, valor_destino: number, data = "2025-06-02") =>
  ({ moeda_origem, moeda_destino, valor_origem, valor_destino, data } as Record<string, unknown>);

describe("câmbio — repatriação USD→BRL entra no ganho total", () => {
  it("comprou 1000 USD @ 5 e repatriou @ 6: ganho realizado = +1000 (não some)", () => {
    const rows = [
      row("BRL", "USD", 5000, 1000), // compra 1000 USD por R$5.000 (pmDólar 5,0)
      row("USD", "BRL", 1000, 6000), // repatria 1000 USD → R$6.000 (dólar a 6,0)
    ];
    const m = calcularCambioMetrics(rows, fx);
    // Todo o USD foi repatriado → não há USD líquido; o ganho vem do BRL recebido.
    expect(m.ganhoRepatriadoBRL).toBeCloseTo(1000, 6); // 6000 − 1000×5,0
    expect(m.ganhoTotal_BRL).toBeCloseTo(1000, 6);     // antes sumia (dava −5000)
  });

  it("repatriação parcial mantém o USD restante no total", () => {
    const rows = [
      row("BRL", "USD", 10000, 2000), // 2000 USD @ 5,0
      row("USD", "BRL", 1000, 6000),  // repatria metade @ 6,0 → +1000 realizado
    ];
    const m = calcularCambioMetrics(rows, fx);
    // Restam 1000 USD a mercado (5,0) = R$5.000; realizado da repatriação = +1000.
    // Custo total 10.000; valor = 5.000 (USD restante) + 6.000 (BRL recebido) = 11.000.
    expect(m.ganhoRepatriadoBRL).toBeCloseTo(1000, 6);
    expect(m.ganhoTotal_BRL).toBeCloseTo(1000, 6);
  });
});

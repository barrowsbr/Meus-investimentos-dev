import { describe, it, expect } from "vitest";
import {
  dedupProventos,
  dedupTrades,
  dedupCambio,
  makeProvento,
  makeTradeRow,
  makeCambioRow,
  parseValor,
} from "../broker-import";

describe("parseValor — decimal BR e EN (separador decimal = o último)", () => {
  it("número passa direto", () => expect(parseValor(1234.56)).toBeCloseTo(1234.56, 6));
  it("BR só vírgula: 1,5 → 1.5", () => expect(parseValor("1,5")).toBeCloseTo(1.5, 6));
  it("BR milhar+decimal: 1.234,56 → 1234.56", () => expect(parseValor("1.234,56")).toBeCloseTo(1234.56, 6));
  it("EN milhar+decimal: 1,234.56 → 1234.56 (não 1.23456)", () => expect(parseValor("1,234.56")).toBeCloseTo(1234.56, 6));
  it("EN grande: 1,234,567.89 → 1234567.89", () => expect(parseValor("1,234,567.89")).toBeCloseTo(1234567.89, 6));
  it("só ponto decimal: 512.34 → 512.34", () => expect(parseValor("512.34")).toBeCloseTo(512.34, 6));
});

// Caso 1 e 4: planilha tem VOW3.DE (Yahoo exige o sufixo), a IBKR manda VOW3.
describe("dedup — sufixo de bolsa (VOW3.DE ≡ VOW3)", () => {
  it("reconhece provento existente mesmo com sufixo na planilha", () => {
    const existing = [{ ticker: "VOW3.DE", data: "2026-03-10", valor: "5,00", decisao: "Dividendo" }];
    const incoming = [makeProvento("VOW3", "2026-03-10", "Dividendo", 5, "EUR", "Ação Internacional")];
    expect(dedupProventos(existing, incoming).get(0)).toBe("existente");
  });

  it("reconhece trade existente mesmo com sufixo na planilha", () => {
    const existing = [{ "símbolo": "VOW3.DE", "tipo de transação": "Compra", quantidade: "10", "preço": "100" }];
    const incoming = [makeTradeRow({ data: "2026-03-10", tipo: "Compra", ticker: "VOW3", qtd: 10, preco: 100, valorBruto: 1000, comissao: 0, moeda: "EUR" })];
    expect(dedupTrades(existing, incoming).get(0)).toBe("existente");
  });
});

// Caso 2 e 3: forex USD.CAD — micro-ajustes filtrados; câmbio real reconhecido.
describe("câmbio", () => {
  it("filtra micro-ajuste de câmbio (<10)", () => {
    expect(makeCambioRow({ date: "2026-01-17", base: "USD", quote: "CAD", signedQty: 0.533, price: 1.3687 })).toBeNull();
  });

  it("reconhece câmbio já registrado (mesma data/moedas/valor ±2)", () => {
    const c = makeCambioRow({ date: "2026-04-27", base: "USD", quote: "CAD", signedQty: -398.92, price: 1.36715 })!;
    const existing = [{ data: "2026-04-27", moeda_origem: "USD", moeda_destino: "CAD", valor_origem: "398,92", valor_destino: "545,39", taxa: "0,73", corretora: "IBKR" }];
    expect(dedupCambio(existing, [c]).get(0)).toBe("existente");
  });
});

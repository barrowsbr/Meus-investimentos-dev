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

describe("dedup — a DATA faz parte da identidade do trade", () => {
  const existente = [{ "símbolo": "CMIG4.SA", "tipo de transação": "Compra", quantidade: "100", "preço": "10,20", data: "2026-01-15" }];

  it("compra IDÊNTICA em outra data é NOVO (aporte mensal não é descartado)", () => {
    const incoming = [makeTradeRow({ data: "2026-02-15", tipo: "Compra", ticker: "CMIG4.SA", qtd: 100, preco: 10.20, valorBruto: 1020, comissao: 0, moeda: "BRL" })];
    expect(dedupTrades(existente, incoming).get(0)).toBe("novo");
  });

  it("mesma compra reimportada (mesma data) é 'existente'", () => {
    const incoming = [makeTradeRow({ data: "2026-01-15", tipo: "Compra", ticker: "CMIG4.SA", qtd: 100, preco: 10.20, valorBruto: 1020, comissao: 0, moeda: "BRL" })];
    expect(dedupTrades(existente, incoming).get(0)).toBe("existente");
  });

  it("preços próximos mas distintos (10,20 vs 10,49) não casam por arredondamento", () => {
    const incoming = [makeTradeRow({ data: "2026-01-15", tipo: "Compra", ticker: "CMIG4.SA", qtd: 100, preco: 10.49, valorBruto: 1049, comissao: 0, moeda: "BRL" })];
    expect(dedupTrades(existente, incoming).get(0)).toBe("novo");
  });
});

// Caso real (ago/2026): a planilha guarda a data do PREGÃO e o preço da nota;
// a Movimentação da B3 traz a LIQUIDAÇÃO (D+2, até -4 dias corridos na virada
// de ano) e o valor de liquidação (~0,6% diferente). O dedup exigia data igual
// e 0,5% de preço → 6 operações já registradas apareciam como "novas" e o
// Aplicar duplicaria tudo.
describe("dedup — pregão × liquidação (Movimentação B3)", () => {
  it("reinvestimento de FII: liquidação D+2 e preço 0,6% acima casam", () => {
    const existente = [{ "símbolo": "KNCR11.SA", "tipo de transação": "Compra", quantidade: "1", "preço": "105.62", data: "2025-09-19" }];
    const incoming = [makeTradeRow({ data: "2025-09-23", tipo: "Compra", ticker: "KNCR11", qtd: 1, preco: 105.0, valorBruto: 105, comissao: 0, moeda: "BRL" })];
    expect(dedupTrades(existente, incoming).get(0)).toBe("existente");
  });

  it("venda na virada de ano: 29/12 (pregão) ≡ 02/01 (liquidação)", () => {
    const existente = [{ "símbolo": "IVVB11.SA", "tipo de transação": "Venda", quantidade: "15", "preço": "432,26", data: "2025-12-29" }];
    const incoming = [makeTradeRow({ data: "2026-01-02", tipo: "Venda", ticker: "IVVB11", qtd: 15, preco: 432.26, valorBruto: 6483.9, comissao: 0, moeda: "BRL" })];
    expect(dedupTrades(existente, incoming).get(0)).toBe("existente");
  });

  it("reinvestimentos MENSAIS seguem distintos (janela não engole o mês seguinte)", () => {
    const existente = [{ "símbolo": "KNCR11.SA", "tipo de transação": "Compra", quantidade: "1", "preço": "105.39", data: "2025-10-21" }];
    const incoming = [makeTradeRow({ data: "2025-11-26", tipo: "Compra", ticker: "KNCR11", qtd: 1, preco: 105.416, valorBruto: 105.42, comissao: 0, moeda: "BRL" })];
    expect(dedupTrades(existente, incoming).get(0)).toBe("novo");
  });

  it("com data exata E deslocada disponíveis, casa com a exata", () => {
    const existente = [
      { "símbolo": "KNCR11.SA", "tipo de transação": "Compra", quantidade: "1", "preço": "105", data: "2025-09-21" },
      { "símbolo": "KNCR11.SA", "tipo de transação": "Compra", quantidade: "1", "preço": "105", data: "2025-09-23" },
    ];
    const incoming = [makeTradeRow({ data: "2025-09-23", tipo: "Compra", ticker: "KNCR11", qtd: 1, preco: 105.0, valorBruto: 105, comissao: 0, moeda: "BRL" })];
    const st = dedupTrades(existente, incoming);
    expect(st.get(0)).toBe("existente");
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

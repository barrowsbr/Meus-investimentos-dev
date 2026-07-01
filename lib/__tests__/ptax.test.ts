import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { buildMultiCurrencyPtaxDetalhado, loadPtaxFromBcb, resetPtaxCache } from "@/lib/ptax";

// BCB sempre fora do ar nestes testes — o que está em teste é exatamente o
// comportamento de fallback (planilha → constantes com aviso), sem rede.
beforeEach(() => {
  resetPtaxCache();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("BCB offline (teste)")));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const SHEET = [
  { data: "2024-01-02", moeda: "USD", taxa: 4.85 },
  { data: "2024-06-03", moeda: "USD", taxa: 5.10 },
  { data: "2024-03-01", moeda: "EUR", taxa: 5.40 },
];

describe("buildMultiCurrencyPtaxDetalhado — fallback planilha", () => {
  it("BCB fora do ar → usa a planilha, SEM aviso para moedas cobertas", async () => {
    const { ptax, avisos } = await buildMultiCurrencyPtaxDetalhado(SHEET, ["USD", "EUR"]);
    expect(ptax("USD", "2024-01-02")).toBe(4.85);
    expect(ptax("EUR", "2024-03-01")).toBe(5.40);
    expect(avisos).toHaveLength(0);
  });

  it("forward-fill: data entre cotações usa a última anterior", async () => {
    const { ptax } = await buildMultiCurrencyPtaxDetalhado(SHEET, ["USD"]);
    expect(ptax("USD", "2024-04-15")).toBe(4.85); // entre 01/2024 e 06/2024
    expect(ptax("USD", "2025-01-01")).toBe(5.10); // depois da última
  });

  it("BRL sempre 1", async () => {
    const { ptax } = await buildMultiCurrencyPtaxDetalhado(SHEET, ["USD"]);
    expect(ptax("BRL", "2024-01-02")).toBe(1);
  });
});

describe("buildMultiCurrencyPtaxDetalhado — fallback constante é BARULHENTO", () => {
  it("moeda sem NENHUM dado → aviso proativo + constante no lookup", async () => {
    const { ptax, avisos } = await buildMultiCurrencyPtaxDetalhado(SHEET, ["USD", "CAD"]);
    expect(avisos.some(a => a.includes("CAD"))).toBe(true);
    expect(ptax("CAD", "2024-05-01")).toBe(4.0); // DEFAULTS.CAD
  });

  it("lookup de moeda não solicitada e sem dados também registra aviso (dedup)", async () => {
    const { ptax, avisos } = await buildMultiCurrencyPtaxDetalhado(SHEET, ["USD"]);
    ptax("GBP", "2024-05-01");
    ptax("GBP", "2024-06-01");
    expect(avisos.filter(a => a.includes("GBP"))).toHaveLength(1);
  });
});

describe("regressão: falha do BCB não pode bloquear a planilha", () => {
  it("loadPtaxFromBcb falha (cache vazio) e a planilha AINDA semeia depois", async () => {
    // Passo 1: BCB falha → grava marcador vazio no cache.
    await loadPtaxFromBcb("EUR");
    // Passo 2 (bug antigo): o mapa vazio com TTL de 6h impedia o seed da
    // planilha, forçando o DEFAULT (6.0). Corrigido: planilha sobrepõe vazio.
    const { ptax, avisos } = await buildMultiCurrencyPtaxDetalhado(SHEET, ["EUR"]);
    expect(ptax("EUR", "2024-03-01")).toBe(5.40);
    expect(avisos).toHaveLength(0);
  });
});

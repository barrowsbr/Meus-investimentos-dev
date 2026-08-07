import { describe, it, expect } from "vitest";
import { ehNavegacaoDeReload, comCacheBuster } from "../client-cache";

// Regra de produto: "puxar para baixo" no mobile é um RELOAD e significa
// "quero dado fresco". O sessionStorage sobrevive ao reload, então sem tratar
// isso o gesto parecia não fazer nada — recarregava e servia o mesmo dado velho.

describe("ehNavegacaoDeReload", () => {
  it("reconhece o reload da API moderna (PerformanceNavigationTiming)", () => {
    expect(ehNavegacaoDeReload("reload")).toBe(true);
  });

  it("reconhece o reload da API legada (Safari iOS antigo: type 1)", () => {
    expect(ehNavegacaoDeReload(1)).toBe(true);
  });

  it("NÃO trata navegação normal como pedido de atualização", () => {
    expect(ehNavegacaoDeReload("navigate")).toBe(false);
    expect(ehNavegacaoDeReload(0)).toBe(false);
  });

  it("NÃO trata voltar/avançar como pedido de atualização (cache deve valer)", () => {
    expect(ehNavegacaoDeReload("back_forward")).toBe(false);
    expect(ehNavegacaoDeReload(2)).toBe(false);
  });

  it("tolera ausência da API sem quebrar", () => {
    expect(ehNavegacaoDeReload(undefined)).toBe(false);
    expect(ehNavegacaoDeReload(null)).toBe(false);
  });
});

describe("comCacheBuster", () => {
  it("sem reload, não altera a URL (mantém o cache do CDN valendo)", () => {
    expect(comCacheBuster("/api/cotacoes", null)).toBe("/api/cotacoes");
  });

  it("anexa com ? quando a URL não tem query", () => {
    expect(comCacheBuster("/api/cotacoes", "123")).toBe("/api/cotacoes?_r=123");
  });

  it("anexa com & PRESERVANDO a query existente (ex.: ?v=data-version)", () => {
    expect(comCacheBuster("/api/cotacoes?v=7", "123")).toBe("/api/cotacoes?v=7&_r=123");
  });

  it("não duplica parâmetro quando há vários na query", () => {
    const out = comCacheBuster("/api/x?a=1&b=2", "9");
    expect(out).toBe("/api/x?a=1&b=2&_r=9");
    expect(out.match(/_r=/g)).toHaveLength(1);
  });
});

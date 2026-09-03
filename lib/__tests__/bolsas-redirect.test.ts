import { describe, expect, it, vi } from "vitest";

// O sino de alertas aponta para a Transmissão Macro por deep-link. O redirect
// /bolsas → /radar tinha uma ALLOWLIST (só symbol/country) e engolia o
// `transmissao` em silêncio: o Radar abria, mas sem o painel. Estes testes
// prendem o contrato "repassa tudo".
const destinos: string[] = [];
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { destinos.push(url); },
}));

async function irPara(params: Record<string, string | string[] | undefined>) {
  destinos.length = 0;
  const { default: BolsasRedirect } = await import("@/app/bolsas/page");
  BolsasRedirect({ searchParams: params });
  return destinos[0];
}

describe("/bolsas → /radar preserva os deep-links", () => {
  it("?transmissao=1 (sino de alertas) CHEGA no radar", async () => {
    expect(await irPara({ transmissao: "1" })).toBe("/radar?transmissao=1");
  });

  it("sem parâmetro nenhum vai para /radar limpo", async () => {
    expect(await irPara({})).toBe("/radar");
  });

  it("os deep-links antigos seguem funcionando", async () => {
    const url = new URL(await irPara({ country: "Brasil", symbol: "^BVSP" }), "http://x");
    expect(url.searchParams.get("country")).toBe("Brasil");
    expect(url.searchParams.get("symbol")).toBe("^BVSP");
  });

  it("parâmetro NOVO passa sem precisar editar esta rota (a causa do bug)", async () => {
    const url = new URL(await irPara({ transmissao: "1", camada: "cambio" }), "http://x");
    expect(url.searchParams.get("transmissao")).toBe("1");
    expect(url.searchParams.get("camada")).toBe("cambio");
  });

  it("valor com caractere especial é escapado (^BVSP não quebra a URL)", async () => {
    expect(await irPara({ symbol: "^BVSP" })).toContain("symbol=%5EBVSP");
  });

  it("parâmetro repetido não some", async () => {
    expect(await irPara({ tag: ["a", "b"] })).toBe("/radar?tag=a&tag=b");
  });
});

// A cascata é FONTE ÚNICA (lib/llm-models.ts). Estes testes existem para o
// próximo "atualizei o modelo" não voltar a divergir entre a página e o bot.

import { describe, expect, it } from "vitest";
import { MODEL_CASCADE, chaveDoModelo } from "../llm-models";

describe("cascata de modelos — fonte única", () => {
  it("tem entradas e nenhum modelo repetido", () => {
    expect(MODEL_CASCADE.length).toBeGreaterThan(3);
    const nomes = MODEL_CASCADE.map(m => m.model);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it("todo modelo openai-compat declara baseUrl (senão o fetch vai para lugar nenhum)", () => {
    for (const m of MODEL_CASCADE.filter(x => x.provider === "openai-compat")) {
      expect(m.baseUrl, `${m.label} sem baseUrl`).toMatch(/^https:\/\//);
    }
  });

  it("todo modelo declara a env var da chave", () => {
    for (const m of MODEL_CASCADE) expect(m.keyEnv, m.label).toBeTruthy();
  });

  it("xAI está na cascata (o projeto já o usa no comentário da Home)", () => {
    // Sem chave, a entrada é PULADA — custo zero. Está aqui para o dia em que
    // a XAI_API_KEY existir, e porque /api/hoje/comentario já fala com o xAI.
    const xai = MODEL_CASCADE.find(m => m.baseUrl?.includes("api.x.ai"));
    expect(xai).toBeDefined();
    expect(xai!.keyEnv).toBe("XAI_API_KEY");
    expect(xai!.fallbackKeyEnv).toBe("GROK_API_KEY");
  });

  it("Groq está na cascata — é o fallback com chave hoje", () => {
    const groq = MODEL_CASCADE.filter(m => m.baseUrl?.includes("api.groq.com"));
    expect(groq.length).toBeGreaterThan(0);
    expect(groq[0].keyEnv).toBe("GROQ_API_KEY");
  });

  // Nomes quase idênticos, empresas diferentes — a confusão já aconteceu uma
  // vez nesta base. Este teste existe para ela não voltar.
  it("xAI e Groq são provedores DIFERENTES e coexistem", () => {
    const xai = MODEL_CASCADE.filter(m => m.baseUrl?.includes("api.x.ai"));
    const groq = MODEL_CASCADE.filter(m => m.baseUrl?.includes("api.groq.com"));
    expect(xai.length).toBeGreaterThan(0);
    expect(groq.length).toBeGreaterThan(0);
    expect(xai[0].keyEnv).not.toBe(groq[0].keyEnv);
  });

  it("o xAI vem antes dos tiers baixos na ordem de preferência", () => {
    const iXai = MODEL_CASCADE.findIndex(m => m.baseUrl?.includes("api.x.ai"));
    const iGroq = MODEL_CASCADE.findIndex(m => m.baseUrl?.includes("api.groq.com"));
    expect(iXai).toBeLessThan(iGroq);
  });

  it("chaveDoModelo cai para a env alternativa", () => {
    const entry = { provider: "openai-compat" as const, model: "m", label: "L", keyEnv: "NAO_EXISTE_X", fallbackKeyEnv: "EXISTE_Y" };
    process.env.EXISTE_Y = "chave-alternativa";
    expect(chaveDoModelo(entry)).toBe("chave-alternativa");
    delete process.env.EXISTE_Y;
    expect(chaveDoModelo(entry)).toBeUndefined();
  });
});

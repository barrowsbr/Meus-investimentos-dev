import { describe, expect, it } from "vitest";
import { normalizarChatId, parseConvidados, destinatarios, podeUsarBot } from "../alertas-store";

// Convidados têm o MESMO acesso do dono (decisão dele, 13/09/2026): recebem o
// resumo e o bot responde a eles com os dados reais da carteira. Por isso a
// lista é a fronteira de segurança — quem está nela vê tudo.

const cfg = (chatId: string, convidados: string[] = []) => ({ chatId, convidados });

describe("normalizarChatId — o que é um chat_id aceitável", () => {
  it("aceita id do dono e de GRUPO (negativo)", () => {
    expect(normalizarChatId("123456")).toBe("123456");
    expect(normalizarChatId("-1001234567890")).toBe("-1001234567890");
    expect(normalizarChatId("  123456  ")).toBe("123456");
  });

  it("recusa qualquer coisa que não seja um id numérico", () => {
    // Sem isso, um "@usuario" ou string vazia entraria na allowlist e o
    // comparador de igualdade poderia casar por acidente.
    for (const lixo of ["@fulano", "", "12a34", "123 456", null, undefined, "*", "0x1"]) {
      expect(normalizarChatId(lixo)).toBe("");
    }
  });
});

describe("parseConvidados — o que a UI salva vira lista", () => {
  it("separa por vírgula, ponto e vírgula ou espaço", () => {
    expect(parseConvidados("111, 222;333 444")).toEqual(["111", "222", "333", "444"]);
  });

  it("descarta entradas inválidas em vez de guardar lixo", () => {
    expect(parseConvidados("111, @fulano, , 222, abc")).toEqual(["111", "222"]);
  });

  it("não repete o mesmo id", () => {
    expect(parseConvidados("111,111,222")).toEqual(["111", "222"]);
  });

  it("lista vazia continua vazia (não vira [''])", () => {
    expect(parseConvidados("")).toEqual([]);
    expect(parseConvidados(null)).toEqual([]);
  });
});

describe("destinatarios — quem recebe", () => {
  it("dono primeiro, convidados depois", () => {
    expect(destinatarios(cfg("100", ["200", "300"]))).toEqual(["100", "200", "300"]);
  });

  it("dono repetido entre os convidados NÃO recebe duas vezes", () => {
    expect(destinatarios(cfg("100", ["100", "200"]))).toEqual(["100", "200"]);
  });

  it("sem convidados, o comportamento é o de antes", () => {
    expect(destinatarios(cfg("100"))).toEqual(["100"]);
  });

  it("sem dono configurado, não inventa destinatário", () => {
    expect(destinatarios(cfg(""))).toEqual([]);
    expect(destinatarios(cfg("", ["200"]))).toEqual(["200"]);
  });
});

describe("podeUsarBot — a fronteira de segurança", () => {
  const c = cfg("100", ["200"]);

  it("dono e convidado são atendidos", () => {
    expect(podeUsarBot(c, "100")).toBe(true);
    expect(podeUsarBot(c, "200")).toBe(true);
  });

  it("ESTRANHO é recusado", () => {
    expect(podeUsarBot(c, "999")).toBe(false);
  });

  it("não cai em truque de formato", () => {
    // Prefixo, sufixo, espaço e sinal trocado são chats DIFERENTES.
    for (const impostor of ["1001", "10", "+100", "-100", "100 ", " 100", "100abc", ""]) {
      const esperado = impostor.trim() === "100";
      expect(podeUsarBot(c, impostor)).toBe(esperado);
    }
  });

  it("com a lista vazia, NINGUÉM é atendido (fail-closed)", () => {
    // Config corrompida/zerada não pode virar bot aberto.
    expect(podeUsarBot(cfg(""), "100")).toBe(false);
    expect(podeUsarBot(cfg("", []), "999")).toBe(false);
  });

  it("convidado inválido na config não abre a porta", () => {
    expect(podeUsarBot(cfg("100", ["@todos"]), "@todos")).toBe(false);
    expect(podeUsarBot(cfg("100", [""]), "")).toBe(false);
  });
});

describe("envio e allowlist saem da MESMA lista", () => {
  it("todo mundo que recebe também pode perguntar — e vice-versa", () => {
    // Se estas duas listas divergirem, ou alguém recebe o resumo sem poder
    // usar o bot, ou pior: é atendido sem constar em lugar nenhum.
    const c = cfg("100", ["200", "300", "100", "@lixo"]);
    const recebem = destinatarios(c);
    expect(recebem).toEqual(["100", "200", "300"]);
    for (const id of recebem) expect(podeUsarBot(c, id)).toBe(true);
    expect(podeUsarBot(c, "400")).toBe(false);
  });
});

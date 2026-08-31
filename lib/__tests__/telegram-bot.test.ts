import { describe, expect, it } from "vitest";
import { detectarTickers, parseManchetes } from "../telegram-contexto";
import { formatarFio, type MensagemFio } from "../telegram-conversas";

describe("detectarTickers — achar o ativo na pergunta", () => {
  const carteira = ["CMIG4.SA", "VALE3.SA", "NVDA", "VOO", "DPM.TO", "KO"];

  it("acha pela base, que é como se escreve no chat", () => {
    expect(detectarTickers("por que a NVDA caiu hoje?", carteira)).toEqual(["NVDA"]);
    expect(detectarTickers("como está a CMIG4?", carteira)).toEqual(["CMIG4.SA"]);
    expect(detectarTickers("e a DPM?", carteira)).toEqual(["DPM.TO"]);
  });

  it("acha pela grafia completa também", () => {
    expect(detectarTickers("me fala da VALE3.SA", carteira)).toEqual(["VALE3.SA"]);
  });

  it("é indiferente a maiúsculas e pega mais de um ativo", () => {
    expect(detectarTickers("compare nvda com voo", carteira)).toEqual(["NVDA", "VOO"]);
  });

  it("NÃO casa ticker no meio de outra palavra (falso positivo)", () => {
    // "KO" dentro de "KOMBI"/"tóKObi" não pode virar a posição em Coca-Cola
    expect(detectarTickers("comprei uma kombi", carteira)).toEqual([]);
    expect(detectarTickers("fui a Tóquio", carteira)).toEqual([]);
  });

  it("pergunta sem ticker devolve vazio (contexto de mercado nem é montado)", () => {
    expect(detectarTickers("como está meu resultado no mês?", carteira)).toEqual([]);
  });

  it("teto de 3 ativos por pergunta", () => {
    expect(detectarTickers("nvda voo ko cmig4 vale3", carteira)).toHaveLength(3);
  });
});

describe("parseManchetes — RSS do Google News", () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[NVIDIA cai 5% após resultado]]></title>
      <pubDate>Fri, 29 Aug 2026 20:00:00 GMT</pubDate><source url="x">InfoMoney</source></item>
    <item><title>Ação sobe com guidance &amp; recompra</title>
      <pubDate>Fri, 29 Aug 2026 18:00:00 GMT</pubDate><source url="y">Valor</source></item>
  </channel></rss>`;

  it("extrai título, data e fonte, decodificando entidades e CDATA", () => {
    const m = parseManchetes(xml);
    expect(m).toHaveLength(2);
    expect(m[0]).toEqual({ titulo: "NVIDIA cai 5% após resultado", data: "Fri, 29 Aug 2026 20:00:00 GMT", fonte: "InfoMoney" });
    expect(m[1].titulo).toBe("Ação sobe com guidance & recompra");
  });

  it("respeita o limite e aguenta XML quebrado sem estourar", () => {
    expect(parseManchetes(xml, 1)).toHaveLength(1);
    expect(parseManchetes("<rss></rss>")).toEqual([]);
    expect(parseManchetes("lixo")).toEqual([]);
  });
});

describe("formatarFio — memória da conversa no prompt", () => {
  const fio: MensagemFio[] = [
    { papel: "user", texto: "por que a NVDA caiu?", timestamp: "t1" },
    { papel: "assistant", texto: "Caiu 5% após o resultado.", timestamp: "t2" },
  ];

  it("rotula quem falou, para o follow-up fazer sentido", () => {
    const t = formatarFio(fio);
    expect(t).toContain("Dono: por que a NVDA caiu?");
    expect(t).toContain("Você: Caiu 5% após o resultado.");
  });

  it("fio vazio não polui o prompt", () => {
    expect(formatarFio([])).toBe("");
  });
});

import { describe as d2, expect as e2, it as i2, vi as v2 } from "vitest";

// __erro__ no fio: registrado na aba para o diag, mas NUNCA no prompt do LLM.
d2("lerConversa — papéis técnicos fora do prompt", () => {
  i2("__erro__ não entra no fio e não desloca mensagens reais", async () => {
    v2.resetModules();
    v2.doMock("@/lib/data-store", () => ({
      getDataStore: () => ({
        fetchTab: async () => [
          { chat_id: "42", timestamp: "t1", papel: "user", texto: "oi" },
          { chat_id: "42", timestamp: "t2", papel: "__erro__", texto: "can't parse entities" },
          { chat_id: "42", timestamp: "t3", papel: "assistant", texto: "olá!" },
        ],
      }),
    }));
    const { lerConversa } = await import("../telegram-conversas");
    const fio = await lerConversa("42", 2);
    e2(fio.map((m) => m.texto)).toEqual(["oi", "olá!"]);
    v2.doUnmock("@/lib/data-store");
  });
});

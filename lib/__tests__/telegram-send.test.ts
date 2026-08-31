import { afterEach, describe, expect, it, vi } from "vitest";
import { sendTelegramMessage } from "../telegram";

// O modo de falha que deixa o bot MUDO: o LLM escreve um `*`/`_` desbalanceado,
// o Telegram recusa o Markdown com 400 "can't parse entities" e a mensagem não
// chega — sem nenhum erro visível para o dono. O reenvio em texto puro garante
// que a resposta SEMPRE chega (sem negrito é melhor que sem nada).

type Chamada = { parse_mode?: string; text: string };
const chamadas: Chamada[] = [];

function mockTelegram(respostas: Array<{ ok: boolean; description?: string }>) {
  let i = 0;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    chamadas.push(JSON.parse(String(init?.body ?? "{}")));
    const r = respostas[Math.min(i++, respostas.length - 1)];
    return { ok: r.ok, json: async () => (r.ok ? { ok: true } : { ok: false, description: r.description }) };
  }));
}

afterEach(() => { vi.unstubAllGlobals(); chamadas.length = 0; });

describe("sendTelegramMessage — fallback para texto puro", () => {
  it("Markdown aceito → 1 envio só, com parse_mode", async () => {
    mockTelegram([{ ok: true }]);
    expect(await sendTelegramMessage("tok", "42", "olá *mundo*")).toEqual({ ok: true });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].parse_mode).toBe("Markdown");
  });

  it("erro de parse → reenvia SEM parse_mode e a mensagem chega", async () => {
    mockTelegram([{ ok: false, description: "Bad Request: can't parse entities: ..." }, { ok: true }]);
    expect(await sendTelegramMessage("tok", "42", "quebrado _aqui")).toEqual({ ok: true });
    expect(chamadas).toHaveLength(2);
    expect(chamadas[1].parse_mode).toBeUndefined();
    expect(chamadas[1].text).toBe("quebrado _aqui");
  });

  it("erro que NÃO é de parse (chat not found) → não insiste, devolve o erro", async () => {
    mockTelegram([{ ok: false, description: "Bad Request: chat not found" }]);
    const r = await sendTelegramMessage("tok", "42", "oi");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("chat not found");
    expect(chamadas).toHaveLength(1);
  });
});

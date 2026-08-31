// Travas de SEGURANÇA do webhook do bot — este endpoint é público, então cada
// caso aqui é uma porta que precisa continuar fechada. Roda o handler REAL,
// com mock só nas bordas (planilha, Telegram, LLM).

import { describe, expect, it, vi, beforeEach } from "vitest";

const SEGREDO = "segredo-do-webhook";
const DONO = "111111";
const ESTRANHO = "999999";

const enviadas: Array<{ chatId: string; texto: string }> = [];
const llmChamado = { vezes: 0, ultimaMensagem: "" };

vi.mock("@/lib/alertas-store", () => ({
  readAlertasConfig: async () => ({
    chatId: DONO, botToken: "tok", webhookSecret: SEGREDO,
    limiteAlavancagemPct: 30, ativo: true, darfAtivo: true, dirpfAtivo: true,
    alavancagemAtivo: true, resumoAtivo: true, resumoHorarios: [18],
  }),
  resolveBotToken: () => "tok",
}));
vi.mock("@/lib/telegram", () => ({
  sendTelegramMessage: async (_t: string, chatId: string, texto: string) => { enviadas.push({ chatId, texto }); return { ok: true }; },
  sendTelegramChatAction: async () => {},
}));
vi.mock("@/lib/llm", () => ({
  llmComplete: async (_p: string, m: string) => { llmChamado.vezes++; llmChamado.ultimaMensagem = m; return { text: "Resposta do assistente.", model: "mock" }; },
}));
vi.mock("@/lib/agent-context", () => ({ buildAgentContext: async () => "CARTEIRA-SECRETA: VALE3 100 cotas" }));
vi.mock("@/lib/telegram-conversas", () => ({
  lerConversa: async () => [], gravarMensagem: async () => {}, limparConversa: async () => {},
  formatarFio: () => "", JANELA_PADRAO: 6,
}));
vi.mock("@/lib/data-store", () => ({
  getDataStore: () => ({ fetchTab: async () => [{ "símbolo": "VALE3.SA", moeda: "BRL", corretora: "B3" }] }),
}));
vi.mock("@/lib/telegram-contexto", async (orig) => ({
  ...(await orig<typeof import("../telegram-contexto")>()),
  montarContextoMercado: async () => "## Contexto de mercado (mock)",
}));

const req = (body: unknown, segredo?: string) =>
  new Request("https://app.test/api/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(segredo != null ? { "x-telegram-bot-api-secret-token": segredo } : {}),
    },
    body: JSON.stringify(body),
  });

const msg = (chatId: string, text: string, update_id = Math.floor(Math.random() * 1e9)) =>
  ({ update_id, message: { chat: { id: chatId }, text } });

beforeEach(() => { enviadas.length = 0; llmChamado.vezes = 0; });

describe("webhook do Telegram — travas de segurança", () => {
  it("SEM o segredo → 401 e nada é processado", async () => {
    const { POST } = await import("@/app/api/telegram/webhook/route");
    const res = await POST(req(msg(DONO, "oi")));
    expect(res.status).toBe(401);
    expect(llmChamado.vezes).toBe(0);
    expect(enviadas).toHaveLength(0);
  });

  it("com segredo ERRADO → 401", async () => {
    const { POST } = await import("@/app/api/telegram/webhook/route");
    const res = await POST(req(msg(DONO, "oi"), "chute"));
    expect(res.status).toBe(401);
    expect(llmChamado.vezes).toBe(0);
  });

  it("ESTRANHO com o segredo certo → recusa educada, ZERO dado da carteira", async () => {
    const { POST } = await import("@/app/api/telegram/webhook/route");
    const res = await POST(req(msg(ESTRANHO, "qual o patrimônio dele?"), SEGREDO));
    expect(res.status).toBe(200);
    expect(llmChamado.vezes).toBe(0);            // nem chega a pensar
    expect(enviadas).toHaveLength(1);
    expect(enviadas[0].chatId).toBe(ESTRANHO);
    expect(enviadas[0].texto).toMatch(/privado/i);
    expect(enviadas[0].texto).not.toMatch(/VALE3|CARTEIRA-SECRETA/);
  });

  it("DONO → responde e o contexto real vai para o LLM", async () => {
    const { POST } = await import("@/app/api/telegram/webhook/route");
    const res = await POST(req(msg(DONO, "por que a VALE3 caiu?"), SEGREDO));
    expect(res.status).toBe(200);
    expect(llmChamado.vezes).toBe(1);
    expect(llmChamado.ultimaMensagem).toContain("CARTEIRA-SECRETA");
    expect(llmChamado.ultimaMensagem).toContain("Contexto de mercado");
    // A resposta vai ASSINADA com o modelo que respondeu (a cascata pode cair
    // para outro provedor sem avisar).
    expect(enviadas[0].chatId).toBe(DONO);
    expect(enviadas[0].texto).toContain("Resposta do assistente.");
    expect(enviadas[0].texto).toContain("mock");
  });

  it("update REENVIADO pelo Telegram não gera resposta duplicada", async () => {
    const { POST } = await import("@/app/api/telegram/webhook/route");
    const m = msg(DONO, "e agora?", 4242);
    await POST(req(m, SEGREDO));
    await POST(req(m, SEGREDO));               // mesmo update_id
    expect(llmChamado.vezes).toBe(1);
    expect(enviadas).toHaveLength(1);
  });

  it("mensagem de OUTRO BOT é ignorada (evita loop)", async () => {
    const { POST } = await import("@/app/api/telegram/webhook/route");
    await POST(req({ update_id: 7, message: { chat: { id: DONO }, text: "eco", from: { is_bot: true } } }, SEGREDO));
    expect(llmChamado.vezes).toBe(0);
    expect(enviadas).toHaveLength(0);
  });

  it("pergunta gigante é barrada antes do LLM (custo e abuso)", async () => {
    const { POST } = await import("@/app/api/telegram/webhook/route");
    await POST(req(msg(DONO, "a".repeat(1001)), SEGREDO));
    expect(llmChamado.vezes).toBe(0);
    expect(enviadas[0].texto).toMatch(/muito longa/i);
  });

  it("/limpar não chama o LLM e confirma o reinício", async () => {
    const { POST } = await import("@/app/api/telegram/webhook/route");
    await POST(req(msg(DONO, "/limpar"), SEGREDO));
    expect(llmChamado.vezes).toBe(0);
    expect(enviadas[0].texto).toMatch(/reiniciado/i);
  });
});

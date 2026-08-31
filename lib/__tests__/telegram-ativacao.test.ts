import { afterEach, describe, expect, it, vi } from "vitest";

// Auto-ativação: o cron re-arma o webhook sozinho quando o registro cai.
const salvo: Record<string, unknown>[] = [];
vi.mock("@/lib/alertas-store", () => ({
  readAlertasConfig: async () => (globalThis as Record<string, unknown>).__cfgAtivacao,
  writeAlertasConfig: async (c: Record<string, unknown>) => { salvo.push(c); },
  resolveBotToken: (c: { botToken?: string }) => c.botToken ?? "",
}));

function mockTelegram(urlRegistrada: string) {
  const chamadas: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    chamadas.push(String(url));
    if (String(url).includes("getWebhookInfo")) {
      return { ok: true, json: async () => ({ ok: true, result: { url: urlRegistrada } }) };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  }));
  return chamadas;
}

afterEach(() => { vi.unstubAllGlobals(); salvo.length = 0; });

describe("garantirWebhookTelegram — auto-curativo", () => {
  it("registro OK + segredo salvo → não mexe em nada", async () => {
    (globalThis as Record<string, unknown>).__cfgAtivacao = { botToken: "tok", chatId: "42", webhookSecret: "abc" };
    const chamadas = mockTelegram("https://meus-investimentos-dev.vercel.app/api/telegram/webhook");
    const { garantirWebhookTelegram } = await import("../telegram-ativacao");
    const r = await garantirWebhookTelegram();
    expect(r).toEqual({ ok: true, acao: "ja_ativo" });
    expect(chamadas.some((u) => u.includes("setWebhook"))).toBe(false);
    expect(salvo).toHaveLength(0);
  });

  it("registro CAIU → re-arma com segredo novo e salva", async () => {
    (globalThis as Record<string, unknown>).__cfgAtivacao = { botToken: "tok", chatId: "42", webhookSecret: "abc" };
    const chamadas = mockTelegram("");
    const { garantirWebhookTelegram } = await import("../telegram-ativacao");
    const r = await garantirWebhookTelegram();
    expect(r).toEqual({ ok: true, acao: "reativado" });
    expect(chamadas.some((u) => u.includes("setWebhook"))).toBe(true);
    expect(String(salvo[0].webhookSecret)).toMatch(/^[0-9a-f]{48}$/);
  });

  it("sem chat_id → NÃO arma (webhook recusaria todo mundo; e não é erro)", async () => {
    (globalThis as Record<string, unknown>).__cfgAtivacao = { botToken: "tok", chatId: "" };
    const chamadas = mockTelegram("");
    const { garantirWebhookTelegram } = await import("../telegram-ativacao");
    const r = await garantirWebhookTelegram();
    expect(r).toEqual({ ok: true, acao: "sem_config" });
    expect(chamadas).toHaveLength(0);
  });
});

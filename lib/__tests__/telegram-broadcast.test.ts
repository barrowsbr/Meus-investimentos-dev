import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { paraTodos, resumoEnvio } from "../telegram-broadcast";

const cfg = (chatId: string, convidados: string[] = []) => ({ chatId, convidados });

describe("paraTodos — envio para a lista inteira", () => {
  it("manda para dono e convidados, nessa ordem", async () => {
    const vistos: string[] = [];
    const r = await paraTodos(cfg("100", ["200", "300"]), async (d) => { vistos.push(d); return { ok: true }; });
    expect(vistos).toEqual(["100", "200", "300"]);
    expect(r).toEqual({ enviados: 3, de: 3, erro: undefined });
  });

  it("um destino com erro NÃO impede os outros", async () => {
    // O resumo do dono não pode deixar de sair porque um convidado bloqueou o bot.
    const vistos: string[] = [];
    const r = await paraTodos(cfg("100", ["200", "300"]), async (d) => {
      vistos.push(d);
      return d === "200" ? { ok: false, error: "bot was blocked by the user" } : { ok: true };
    });
    expect(vistos).toEqual(["100", "200", "300"]); // seguiu depois da falha
    expect(r.enviados).toBe(2);
    expect(r.de).toBe(3);
    expect(r.erro).toContain("blocked");
  });

  it("exceção do fetch vira falha daquele destino, não do envio todo", async () => {
    const r = await paraTodos(cfg("100", ["200"]), async (d) => {
      if (d === "100") throw new Error("rede caiu");
      return { ok: true };
    });
    expect(r.enviados).toBe(1);
    expect(r.erro).toContain("rede caiu");
  });

  it("sem destinatário nenhum, não envia e não quebra", async () => {
    let chamou = false;
    const r = await paraTodos(cfg(""), async () => { chamou = true; return { ok: true }; });
    expect(chamou).toBe(false);
    expect(r).toEqual({ enviados: 0, de: 0, erro: undefined });
  });
});

describe("resumoEnvio — o que a UI mostra", () => {
  it("conta os destinos quando há mais de um", () => {
    expect(resumoEnvio({ enviados: 1, de: 1 })).toBe("enviado");
    expect(resumoEnvio({ enviados: 3, de: 3 })).toBe("enviado para 3");
  });

  it("deixa VISÍVEL quando alguém não recebeu", () => {
    // O bug que o dono achou era exatamente este: parecia sucesso porque
    // chegava para ele. O parcial tem que aparecer.
    expect(resumoEnvio({ enviados: 2, de: 3, erro: "x" })).toBe("enviado para 2 de 3");
  });

  it("lista vazia é dito explicitamente, não como sucesso", () => {
    expect(resumoEnvio({ enviados: 0, de: 0 })).toBe("nenhum destinatário configurado");
  });
});

// ── Guarda estrutural ────────────────────────────────────────────────────────
// Os convidados entraram e eu atualizei os dois crons, deixando passar o botão
// "Testar" e o "Enviar resumo agora" — o dono descobriu testando. Este teste
// existe para a próxima rota de envio não repetir isso: quem manda para a LISTA
// tem que passar pelo helper.

function rotasDeApi(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) out.push(...rotasDeApi(caminho));
    else if (nome.endsWith(".ts")) out.push(caminho);
  }
  return out;
}

describe("nenhuma rota manda para a lista por fora do helper", () => {
  it("todo envio de broadcast passa por paraTodos", () => {
    const ofensores: string[] = [];
    for (const arquivo of rotasDeApi(join(process.cwd(), "app/api"))) {
      const src = readFileSync(arquivo, "utf8");
      if (!/sendTelegram(Message|Photo)\s*\(/.test(src)) continue;
      // O webhook é 1-para-1 de propósito: responde a QUEM perguntou. Mandar a
      // resposta de um convidado para a lista seria vazar conversa.
      if (arquivo.includes("telegram/webhook")) continue;
      if (!src.includes("paraTodos")) ofensores.push(arquivo.replace(process.cwd() + "/", ""));
    }
    expect(ofensores, `estas rotas enviam sem usar paraTodos: ${ofensores.join(", ")}`).toEqual([]);
  });
});

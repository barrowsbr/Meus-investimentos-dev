// Envio para TODOS os destinatários (dono + convidados), num lugar só.
//
// Por que existe: quando os convidados entraram, eu atualizei os dois crons e
// deixei passar o botão "Testar" e o "Enviar resumo agora" — o dono descobriu
// testando. O modo de falha é traiçoeiro porque o envio FUNCIONA: chega no
// dono, e só quem não recebeu percebe. Com um helper único, um ponto de envio
// novo ou usa isto ou fica visivelmente diferente na revisão.
//
// NÃO use isto no webhook: lá a resposta vai para QUEM PERGUNTOU (1 para 1),
// não para a lista — mandar a resposta de um convidado para todos seria
// vazamento de conversa.

import { destinatarios, type AlertasConfig } from "./alertas-store";

export interface ResultadoEnvio {
  /** Quantos destinos receberam. */
  enviados: number;
  /** Quantos destinos foram tentados. */
  de: number;
  /** Primeiro erro encontrado (para a UI mostrar algo acionável). */
  erro?: string;
}

/**
 * Executa `enviar` para cada destinatário, em sequência.
 *
 * Um destino que falha (bloqueou o bot, apagou a conversa, id errado) NÃO
 * interrompe os demais: o resumo do dono não pode deixar de sair porque um
 * convidado saiu do Telegram.
 */
export async function paraTodos(
  cfg: Pick<AlertasConfig, "chatId" | "convidados">,
  enviar: (destino: string) => Promise<{ ok: boolean; error?: string }>,
): Promise<ResultadoEnvio> {
  const destinos = destinatarios(cfg);
  let enviados = 0;
  let erro: string | undefined;
  for (const destino of destinos) {
    const r = await enviar(destino).catch((e) => ({
      ok: false,
      error: e instanceof Error ? e.message : "falha no envio",
    }));
    if (r.ok) enviados++;
    else if (!erro) erro = r.error;
  }
  return { enviados, de: destinos.length, erro: enviados === destinos.length ? undefined : erro };
}

/** Texto curto para a UI: "enviado para 3" / "enviado para 2 de 3". */
export function resumoEnvio(r: ResultadoEnvio): string {
  if (r.de === 0) return "nenhum destinatário configurado";
  if (r.enviados === r.de) return r.de === 1 ? "enviado" : `enviado para ${r.de}`;
  return `enviado para ${r.enviados} de ${r.de}`;
}

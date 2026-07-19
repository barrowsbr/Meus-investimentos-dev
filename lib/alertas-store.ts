// Persistência da config e do estado (throttle) do recurso de Alertas.
// Vive nos escopos `alertas` e `alertas_estado` da aba app_config
// (lib/app-config — as antigas alertas_config/alertas_estado valem como
// fallback de leitura até a primeira gravação). A escrita herda
// assertNotDemo() e backup automático via writeTab.
//
// TOKEN DO BOT: por decisão do dono, o token pode ser salvo aqui (planilha)
// para ficar persistente sem depender de env var. Risco aceito: a planilha é
// compartilhada como Leitor, então quem tiver o link consegue ler o token.
// Mitigação no código: o token NUNCA é devolvido por nenhuma rota (a API só
// informa se está configurado), e continua havendo o fallback para a env var
// TELEGRAM_BOT_TOKEN (que tem prioridade quando existe).

import { lerEscopo, gravarEscopo } from "@/lib/app-config";

const DEFAULT_LIMITE_ALAVANCAGEM_PCT = 30;
// Horário padrão do resumo (18h BRT) — comportamento anterior à configuração.
const DEFAULT_RESUMO_HORARIOS = [18];

export interface AlertasConfig {
  chatId: string;
  botToken: string;          // token do bot salvo na planilha (opcional; env var tem prioridade)
  limiteAlavancagemPct: number;
  ativo: boolean;            // master switch — desliga tudo
  darfAtivo: boolean;        // avisos de DARF (a vencer/vencido)
  dirpfAtivo: boolean;       // avisos de prazo da DIRPF
  alavancagemAtivo: boolean; // aviso de alavancagem acima do limite
  resumoAtivo: boolean;      // resumo do dia (imagem) via Telegram
  /** Horas do dia (0–23, fuso de Brasília) em que o resumo é enviado. O cron
   *  roda de hora em hora e só envia quando a hora atual está na lista —
   *  assim o horário é configurável pela UI sem deploy (cron fixo). */
  resumoHorarios: number[];
}

function parseHorarios(raw: string | undefined): number[] {
  if (!raw) return DEFAULT_RESUMO_HORARIOS;
  const hs = raw.split(",")
    .map(s => Number(String(s).trim()))
    .filter(h => Number.isInteger(h) && h >= 0 && h <= 23);
  return hs.length > 0 ? [...new Set(hs)].sort((a, b) => a - b) : DEFAULT_RESUMO_HORARIOS;
}

// Token efetivo: env var tem prioridade (mais segura); senão, o salvo na planilha.
export function resolveBotToken(config: Pick<AlertasConfig, "botToken">): string {
  const env = process.env.TELEGRAM_BOT_TOKEN;
  if (env && env.trim()) return env.trim();
  return (config.botToken ?? "").trim();
}

export async function readAlertasConfig(): Promise<AlertasConfig> {
  const map = await lerEscopo("alertas");
  const limite = Number(map.get("limite_alavancagem_pct"));
  // Todos os flags default = ligado (só desligam quando salvos explicitamente como "false").
  const on = (chave: string) => map.get(chave) !== "false";
  return {
    chatId: map.get("telegram_chat_id") ?? "",
    botToken: map.get("telegram_bot_token") ?? "",
    limiteAlavancagemPct: Number.isFinite(limite) && limite > 0 ? limite : DEFAULT_LIMITE_ALAVANCAGEM_PCT,
    ativo: on("ativo"),
    darfAtivo: on("darf_ativo"),
    dirpfAtivo: on("dirpf_ativo"),
    alavancagemAtivo: on("alavancagem_ativo"),
    resumoAtivo: on("resumo_ativo"),
    resumoHorarios: parseHorarios(map.get("resumo_horarios")),
  };
}

export async function writeAlertasConfig(config: AlertasConfig): Promise<void> {
  await gravarEscopo("alertas", [
    ["telegram_chat_id", config.chatId],
    ["telegram_bot_token", config.botToken],
    ["limite_alavancagem_pct", String(config.limiteAlavancagemPct)],
    ["ativo", String(config.ativo)],
    ["darf_ativo", String(config.darfAtivo)],
    ["dirpf_ativo", String(config.dirpfAtivo)],
    ["alavancagem_ativo", String(config.alavancagemAtivo)],
    ["resumo_ativo", String(config.resumoAtivo)],
    ["resumo_horarios", config.resumoHorarios.join(",")],
  ]);
}

// chave do alerta → data (YYYY-MM-DD) do último envio, para throttle.
export type AlertasEstado = Record<string, string>;

export async function readAlertasEstado(): Promise<AlertasEstado> {
  const map = await lerEscopo("alertas_estado");
  return Object.fromEntries(map);
}

export async function writeAlertasEstado(estado: AlertasEstado): Promise<void> {
  await gravarEscopo("alertas_estado", Object.entries(estado));
}

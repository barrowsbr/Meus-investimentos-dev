// Persistência da config e do estado (throttle) do recurso de Alertas.
// Usa writeTab/ensureTab de lib/gsheets.ts — herda assertNotDemo() e backup
// automático (mesmo padrão de notas/route.ts). O segredo real (token do bot)
// NUNCA passa por aqui — só o chat_id (inofensivo sem o token) e o estado.

import { getDataStore } from "@/lib/data-store";
import { ensureTab, writeTab } from "@/lib/gsheets";

export const ALERTAS_CONFIG_TAB = "alertas_config";
export const ALERTAS_ESTADO_TAB = "alertas_estado";

const DEFAULT_LIMITE_ALAVANCAGEM_PCT = 30;

export interface AlertasConfig {
  chatId: string;
  limiteAlavancagemPct: number;
  ativo: boolean;
}

export async function readAlertasConfig(): Promise<AlertasConfig> {
  const store = getDataStore();
  let rows: Record<string, unknown>[] = [];
  try { rows = await store.fetchTab(ALERTAS_CONFIG_TAB); } catch { /* aba ainda não existe */ }
  const map = new Map(rows.map((r) => [String(r["chave"] ?? "").trim(), String(r["valor"] ?? "").trim()]));
  const limite = Number(map.get("limite_alavancagem_pct"));
  return {
    chatId: map.get("telegram_chat_id") ?? "",
    limiteAlavancagemPct: Number.isFinite(limite) && limite > 0 ? limite : DEFAULT_LIMITE_ALAVANCAGEM_PCT,
    ativo: map.get("ativo") !== "false", // default ligado (só desliga se explicitamente salvo como "false")
  };
}

export async function writeAlertasConfig(config: AlertasConfig): Promise<void> {
  await ensureTab(ALERTAS_CONFIG_TAB, ["chave", "valor"]);
  await writeTab(ALERTAS_CONFIG_TAB, ["chave", "valor"], [
    ["telegram_chat_id", config.chatId],
    ["limite_alavancagem_pct", String(config.limiteAlavancagemPct)],
    ["ativo", String(config.ativo)],
  ]);
}

// chave do alerta → data (YYYY-MM-DD) do último envio, para throttle.
export type AlertasEstado = Record<string, string>;

export async function readAlertasEstado(): Promise<AlertasEstado> {
  const store = getDataStore();
  let rows: Record<string, unknown>[] = [];
  try { rows = await store.fetchTab(ALERTAS_ESTADO_TAB); } catch { /* aba ainda não existe */ }
  const out: AlertasEstado = {};
  for (const r of rows) {
    const chave = String(r["chave"] ?? "").trim();
    if (chave) out[chave] = String(r["data_envio"] ?? "").trim();
  }
  return out;
}

export async function writeAlertasEstado(estado: AlertasEstado): Promise<void> {
  await ensureTab(ALERTAS_ESTADO_TAB, ["chave", "data_envio"]);
  const rows = Object.entries(estado).map(([chave, data]) => [chave, data]);
  await writeTab(ALERTAS_ESTADO_TAB, ["chave", "data_envio"], rows);
}

// ── app_config — aba ÚNICA de configuração do app (escopo/chave/valor) ───────
// Funde as antigas abas de configuração (historico_config, alertas_config,
// alertas_estado, automacoes_config) numa aba só, reduzindo a poluição do
// gdados. A aba `config` (login/senha/fundo) NÃO participa — fica intocada.
//
// Migração PREGUIÇOSA, sem passo manual:
// - Leitura: tenta `app_config` primeiro; se o escopo ainda não existe lá,
//   cai para a aba legada correspondente (os dados antigos seguem valendo).
// - Escrita: sempre vai para `app_config` (a primeira gravação do escopo o
//   migra de vez). As abas legadas ficam paradas até o dono apagar à mão.
// - Cada gravação inclui um marcador `__migrado` por escopo — assim um escopo
//   gravado VAZIO (ex.: estado de alertas zerado) não volta a ler o legado.
//
// Risco aceito: gravar um escopo reescreve a aba inteira (read-modify-write);
// duas gravações SIMULTÂNEAS de escopos diferentes podem perder uma. Na
// prática escrita só acontece em toggles manuais de Configurações e no
// throttle diário dos alertas — e o writeTab faz backup automático da aba.

import { getDataStore } from "@/lib/data-store";
import { ensureTab, writeTab } from "@/lib/gsheets";

export const APP_CONFIG_TAB = "app_config";
const HEADERS = ["escopo", "chave", "valor"];
const MARCADOR = "__migrado";

export type EscopoConfig = "historico" | "alertas" | "alertas_estado" | "automacoes";

// Aba legada de cada escopo (fallback de leitura). `valorCol` porque a antiga
// alertas_estado usava a coluna `data_envio` no lugar de `valor`.
const LEGADO: Record<EscopoConfig, { tab: string; valorCol: string }> = {
  historico: { tab: "historico_config", valorCol: "valor" },
  alertas: { tab: "alertas_config", valorCol: "valor" },
  alertas_estado: { tab: "alertas_estado", valorCol: "data_envio" },
  automacoes: { tab: "automacoes_config", valorCol: "valor" },
};

async function fetchTabSeguro(tab: string): Promise<Record<string, unknown>[]> {
  try { return await getDataStore().fetchTab(tab); } catch { return []; }
}

/** Lê as chaves de um escopo como Map chave→valor (strings já com trim).
 *  Escopo ausente em app_config → fallback para a aba legada; nada em lugar
 *  nenhum → Map vazio (os stores aplicam seus defaults "ligado"). */
export async function lerEscopo(escopo: EscopoConfig): Promise<Map<string, string>> {
  const rows = await fetchTabSeguro(APP_CONFIG_TAB);
  const doEscopo = rows.filter((r) => String(r["escopo"] ?? "").trim() === escopo);
  const map = new Map<string, string>();
  if (doEscopo.length > 0) {
    for (const r of doEscopo) {
      const chave = String(r["chave"] ?? "").trim();
      if (chave && chave !== MARCADOR) map.set(chave, String(r["valor"] ?? "").trim());
    }
    return map;
  }
  const leg = LEGADO[escopo];
  for (const r of await fetchTabSeguro(leg.tab)) {
    const chave = String(r["chave"] ?? "").trim();
    if (chave) map.set(chave, String(r[leg.valorCol] ?? "").trim());
  }
  return map;
}

/** Regrava TODAS as chaves de um escopo em app_config, preservando as linhas
 *  dos demais escopos. RAW para o Sheets não reinterpretar "18,19" como número. */
export async function gravarEscopo(escopo: EscopoConfig, valores: Iterable<readonly string[]>): Promise<void> {
  const atuais = await fetchTabSeguro(APP_CONFIG_TAB);
  const outras: string[][] = [];
  for (const r of atuais) {
    const esc = String(r["escopo"] ?? "").trim();
    if (esc && esc !== escopo) outras.push([esc, String(r["chave"] ?? "").trim(), String(r["valor"] ?? "").trim()]);
  }
  const novas: string[][] = [[escopo, MARCADOR, "1"]];
  for (const par of valores) {
    const chave = String(par[0] ?? "").trim();
    if (chave && chave !== MARCADOR) novas.push([escopo, chave, String(par[1] ?? "")]);
  }
  await ensureTab(APP_CONFIG_TAB, HEADERS);
  await writeTab(APP_CONFIG_TAB, HEADERS, [...outras, ...novas], { raw: true });
}

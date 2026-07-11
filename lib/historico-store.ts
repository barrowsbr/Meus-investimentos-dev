// ── Histórico patrimonial — gravação da série `historico_patrimonio` ─────────
// Alimenta a página Patrimônio (série longa: 1 linha por snapshot). O writer
// antigo (script Python externo) parou em jun/2026; esta é a versão canônica
// em TS, disparada pelo GitHub Action `historico.yml` (3×/dia) — NÃO é cron da
// Vercel (o plano Hobby só permite 1×/dia).
//
// Liga/desliga fica em `historico_config` (chave/valor), controlado por
// Configurações. Cálculo pela FONTE ÚNICA (`calcularSnapshot`).

import { getDataStore } from "@/lib/data-store";
import { ensureTab, writeTab, appendRowsTyped } from "@/lib/gsheets";
import { computeHomePatrimonio } from "@/lib/home-patrimonio";

export const HISTORICO_TAB = "historico_patrimonio";
export const HISTORICO_CONFIG_TAB = "historico_config";

// Ordem EXATA das colunas da aba (não reordenar — o append é posicional).
const COLUNAS = ["timestamp", "data", "hora", "patrimonio_total", "rv", "rf", "variacao_dia_pct", "n_ativos"] as const;

export interface HistoricoConfig { ativo: boolean }

export interface RecordResult {
  written: boolean;
  skipped?: string;
  data?: string;
  hora?: number;
  patrimonio_total?: number;
}

// ── Config (liga/desliga) ────────────────────────────────────────────────────

export async function readHistoricoConfig(): Promise<HistoricoConfig> {
  const store = getDataStore();
  let rows: Record<string, unknown>[] = [];
  try { rows = await store.fetchTab(HISTORICO_CONFIG_TAB); } catch { /* aba ainda não existe → default */ }
  const map = new Map(rows.map((r) => [String(r["chave"] ?? "").trim(), String(r["valor"] ?? "").trim()]));
  // Default LIGADO — só desliga quando salvo explicitamente como "false".
  return { ativo: map.get("ativo") !== "false" };
}

export async function writeHistoricoConfig(cfg: HistoricoConfig): Promise<void> {
  await ensureTab(HISTORICO_CONFIG_TAB, ["chave", "valor"]);
  await writeTab(HISTORICO_CONFIG_TAB, ["chave", "valor"], [["ativo", cfg.ativo ? "true" : "false"]]);
}

// ── Data/hora no fuso de Brasília + serial do Excel ──────────────────────────

function brtParts(): { data: string; hora: number; serial: number } {
  const brtMs = Date.now() - 3 * 3600 * 1000; // UTC-3 (Brasília)
  const d = new Date(brtMs);
  const data = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const hora = d.getUTCHours();
  // Serial do Excel: dias desde 1899-12-30 (25569 = 1970-01-01), com fração do dia.
  const serial = Math.round((25569 + brtMs / 86400000) * 1e6) / 1e6;
  return { data, hora, serial };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Gravação de um ponto no histórico ────────────────────────────────────────

export async function recordHistorico(opts: { force?: boolean } = {}): Promise<RecordResult> {
  if (!opts.force) {
    const cfg = await readHistoricoConfig();
    if (!cfg.ativo) return { written: false, skipped: "desligado em Configurações" };
  }

  // Grava o MESMO valor do card "Patrimônio total" da Home: IBKR Flex (posições
  // + caixa, US$ × dólar de agora) + BR + Cripto — NÃO o total canônico do
  // snapshot. Fonte única: computeHomePatrimonio (a mesma do /api/home).
  const { patrimonioDia, detalhe, snapshot } = await computeHomePatrimonio();

  // Só grava quando o book real da IBKR entrou — senão o total ficaria parcial
  // (só BR + cripto) e não bateria com o card. 3×/dia dá redundância.
  if (!patrimonioDia.ibkr_ok) {
    return { written: false, skipped: "IBKR Flex indisponível — não grava valor parcial" };
  }
  const total = patrimonioDia.patrimonio_dia_brl;
  if (!(total > 0)) return { written: false, skipped: "patrimônio total = 0" };

  const { data, hora, serial } = brtParts();

  // Dedup: se a última linha já é desta data + hora, não duplica (o GH Action
  // pode disparar junto de uma execução manual).
  const store = getDataStore();
  try {
    const hist = await store.fetchTab(HISTORICO_TAB);
    const last = hist[hist.length - 1];
    if (last && String(last["data"]).trim() === data && Number(last["hora"]) === hora) {
      return { written: false, skipped: `já registrado hoje às ${hora}h`, data, hora, patrimonio_total: round2(total) };
    }
  } catch { /* aba pode não existir ainda — segue e cria via append */ }

  await ensureTab(HISTORICO_TAB, COLUNAS as unknown as string[]);

  // rf = renda fixa + caixa (parcela do detalhe); rv = total − rf (mantém a
  // identidade rv + rf = total, coerente com o total IBKR-âncora).
  const rf = round2(detalhe.partes.rf_caixa_brl);
  const rv = round2(total - detalhe.partes.rf_caixa_brl);
  const varPct = Number.isFinite(snapshot.dayChangeTotalPct) ? round2(snapshot.dayChangeTotalPct) : 0;
  const nAtivos = snapshot.positions.filter((p) => (p.quantidade ?? 0) > 0).length;

  // Ordem: timestamp, data, hora, patrimonio_total, rv, rf, variacao_dia_pct, n_ativos
  const linha: (string | number)[] = [serial, data, hora, round2(total), rv, rf, varPct, nAtivos];
  await appendRowsTyped(HISTORICO_TAB, [linha]);

  return { written: true, data, hora, patrimonio_total: round2(total) };
}

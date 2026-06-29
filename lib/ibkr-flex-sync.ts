/**
 * Orquestração do sync IBKR via Flex Web Service:
 * busca → parseia → deduplica → grava (com backup). Implementação ÚNICA
 * compartilhada pelo endpoint manual (handler) e pelo cron diário.
 */

import { getDataStore } from "./data-store";
import { backupTab } from "./backup";
import { findMissingProventos, findMissingTrades } from "./ibkr-sync";
import { fetchFlexStatement, parseFlexXml } from "./ibkr-flex";

export async function runFlexSync(
  opts: { mode?: string; dryRun?: boolean } = {},
): Promise<Record<string, unknown>> {
  const mode = opts.mode ?? "both";
  const dryRun = opts.dryRun ?? false;

  const token = process.env.IBKR_FLEX_TOKEN;
  const queryId = process.env.IBKR_FLEX_QUERY_ID;
  if (!token || !queryId) {
    throw new Error("IBKR_FLEX_TOKEN e/ou IBKR_FLEX_QUERY_ID não configurados");
  }

  const xml = await fetchFlexStatement(token, queryId);
  const { proventos, trades, positions } = parseFlexXml(xml);

  const store = getDataStore();
  const result: Record<string, unknown> = {
    source: "flex",
    dry_run: dryRun,
    parsed: { proventos: proventos.length, trades: trades.length, positions: positions.length },
  };

  if (["proventos", "both"].includes(mode) && proventos.length > 0) {
    const existing = await store.fetchTab("meus_proventos");
    const missing = findMissingProventos(existing, proventos);
    result.proventos = { total: proventos.length, faltantes: missing.length, preview: missing.slice(0, 300) };

    if (!dryRun && missing.length > 0) {
      await backupTab("meus_proventos").catch(() => {});
      const COLS = ["ticker", "data", "decisao", "mes", "ano", "lancamento", "categoria", "valor", "moeda"];
      const rows = missing.map((e) => COLS.map((c) => (e as unknown as Record<string, string>)[c] ?? ""));
      await store.appendRows("meus_proventos", rows);
      (result.proventos as Record<string, unknown>).inserted = missing.length;
    }
  }

  if (["trades", "both"].includes(mode) && trades.length > 0) {
    const existing = await store.fetchTab("meus_ativos");
    const allMissing = findMissingTrades(existing, trades);
    const trulyMissing = allMissing.filter((t) => t.status_match === "MISSING");
    const potentialSplits = allMissing.filter((t) => t.status_match === "POTENTIAL_SPLIT");

    result.trades = {
      total: trades.length,
      existing_count: existing.length,
      faltantes: trulyMissing.length,
      potential_splits: potentialSplits.length,
      preview: allMissing.slice(0, 300),
    };

    if (!dryRun && trulyMissing.length > 0) {
      await backupTab("meus_ativos").catch(() => {});
      const COLS = ["Data", "Tipo de transação", "Símbolo", "Quantidade", "Preço", "Valor bruto", "Taxa de corretagem", "Valor líquido", "Moeda", "Corretora"];
      const rows = trulyMissing.map((t) => COLS.map((c) => (t as unknown as Record<string, string>)[c] ?? ""));
      await store.appendRows("meus_ativos", rows);
      (result.trades as Record<string, unknown>).inserted = trulyMissing.length;
    }
  }

  // Foto das posições (reconciliação) — não gravada na planilha.
  result.positions = positions.slice(0, 50);
  return result;
}

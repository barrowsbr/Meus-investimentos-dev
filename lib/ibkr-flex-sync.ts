/**
 * Orquestração do sync IBKR via Flex Web Service:
 * busca → parseia → deduplica → grava (com backup). Implementação ÚNICA
 * compartilhada pelo endpoint manual (handler) e pelo cron diário.
 *
 * Usa a MESMA dedup/filtros do import por arquivo (lib/broker-import.ts):
 * trades → meus_ativos, proventos → meus_proventos, forex → cambio.
 */

import { getDataStore } from "./data-store";
import { backupTab } from "./backup";
import {
  dedupProventos,
  dedupTrades,
  dedupCambio,
  cambioRowsForSheet,
  sigProvento,
  normalizeDate,
  dedupTk,
  parseValor,
} from "./broker-import";
import { fetchFlexStatement, parseFlexXml } from "./ibkr-flex";

export async function runFlexSync(
  opts: { mode?: string; dryRun?: boolean; debug?: boolean } = {},
): Promise<Record<string, unknown>> {
  const mode = opts.mode ?? "both";
  const dryRun = opts.dryRun ?? false;
  const debug = opts.debug ?? false;
  const wantProv = ["proventos", "both"].includes(mode);
  const wantTrades = ["trades", "both"].includes(mode);

  const token = process.env.IBKR_FLEX_TOKEN;
  const queryId = process.env.IBKR_FLEX_QUERY_ID;
  if (!token || !queryId) {
    throw new Error("IBKR_FLEX_TOKEN e/ou IBKR_FLEX_QUERY_ID não configurados");
  }

  const xml = await fetchFlexStatement(token, queryId);
  const { proventos, trades, cambio, positions, proventosDupsRemoved } = parseFlexXml(xml);

  const store = getDataStore();
  const result: Record<string, unknown> = {
    source: "flex",
    dry_run: dryRun,
    parsed: {
      proventos: proventos.length,
      trades: trades.length,
      cambio: cambio.length,
      positions: positions.length,
      proventos_duplicados_removidos: proventosDupsRemoved,
    },
  };

  // ── Proventos → meus_proventos ──
  if (wantProv && proventos.length > 0) {
    const existing = await store.fetchTab("meus_proventos");
    const st = dedupProventos(existing, proventos);
    const novos = proventos.filter((_, i) => st.get(i) === "novo");
    result.proventos = { total: proventos.length, faltantes: novos.length, preview: novos.slice(0, 300) };

    // ── Diagnóstico (?debug=1): por que os proventos não casam? ──
    if (debug) {
      // Chaves existentes por ticker (sem sufixo) para enxergar os "near misses".
      const existingByTk: Record<string, string[]> = {};
      const existingSample = existing.slice(0, 8).map((row) => {
        const data = normalizeDate(String(row["data"] ?? ""));
        const ticker = String(row["ticker"] ?? "");
        const valor = parseValor(String(row["valor"] ?? "0"));
        const decisao = String(row["decisao"] ?? row["lancamento"] ?? "");
        const tk = dedupTk(ticker);
        const sig = sigProvento(data, ticker, valor, decisao);
        (existingByTk[tk] ??= []).push(sig);
        return { ticker, tk, data, valor, decisao, sig, headers: Object.keys(row) };
      });
      for (const row of existing) {
        const tk = dedupTk(String(row["ticker"] ?? ""));
        const sig = sigProvento(normalizeDate(String(row["data"] ?? "")), String(row["ticker"] ?? ""), parseValor(String(row["valor"] ?? "0")), String(row["decisao"] ?? row["lancamento"] ?? ""));
        (existingByTk[tk] ??= []).push(sig);
      }
      const incomingSample = proventos.slice(0, 12).map((ev, i) => {
        const tk = dedupTk(ev.ticker);
        return {
          ticker: ev.ticker, tk, data: ev.data, valor: ev.valor, decisao: ev.decisao,
          sig: sigProvento(normalizeDate(ev.data), ev.ticker, parseValor(ev.valor), ev.decisao),
          status: st.get(i),
          existentesMesmoTicker: [...new Set(existingByTk[tk] ?? [])].slice(0, 6),
        };
      });
      (result.proventos as Record<string, unknown>).debug = {
        existingCount: existing.length,
        existingHeaders: existing[0] ? Object.keys(existing[0]) : [],
        existingSample,
        incomingSample,
      };
    }

    if (!dryRun && novos.length > 0) {
      await backupTab("meus_proventos").catch(() => {});
      const COLS = ["ticker", "data", "decisao", "mes", "ano", "lancamento", "categoria", "valor", "moeda"];
      const rows = novos.map((e) => COLS.map((c) => (e as unknown as Record<string, string>)[c] ?? ""));
      await store.appendRows("meus_proventos", rows);
      (result.proventos as Record<string, unknown>).inserted = novos.length;
    }
  }

  // ── Trades → meus_ativos ──
  if (wantTrades && trades.length > 0) {
    const existing = await store.fetchTab("meus_ativos");
    const st = dedupTrades(existing, trades);
    const novos = trades.filter((_, i) => st.get(i) === "novo");
    const splits = trades.filter((_, i) => st.get(i) === "split");
    const preview = trades
      .map((t, i) => ({ ...t, status_match: st.get(i) }))
      .filter((t) => t.status_match !== "existente")
      .slice(0, 300);

    result.trades = {
      total: trades.length,
      existing_count: existing.length,
      faltantes: novos.length,
      potential_splits: splits.length,
      preview,
    };

    if (!dryRun && novos.length > 0) {
      await backupTab("meus_ativos").catch(() => {});
      const COLS = ["Data", "Tipo de transação", "Símbolo", "Quantidade", "Preço", "Valor bruto", "Taxa de corretagem", "Valor líquido", "Moeda", "Corretora"];
      const rows = novos.map((t) => COLS.map((c) => (t as unknown as Record<string, string>)[c] ?? ""));
      await store.appendRows("meus_ativos", rows);
      (result.trades as Record<string, unknown>).inserted = novos.length;
    }
  }

  // ── Forex → cambio ──
  if (wantTrades && cambio.length > 0) {
    const existing = await store.fetchTab("cambio");
    const st = dedupCambio(existing, cambio);
    const novos = cambio.filter((_, i) => st.get(i) === "novo");
    result.cambio = { total: cambio.length, faltantes: novos.length, preview: novos.slice(0, 300) };

    if (!dryRun && novos.length > 0) {
      await backupTab("cambio").catch(() => {});
      const headers = existing.length > 0 ? Object.keys(existing[0]) : [];
      const rows = cambioRowsForSheet(headers, novos);
      await store.appendRows("cambio", rows);
      (result.cambio as Record<string, unknown>).inserted = novos.length;
    }
  }

  // Foto das posições (reconciliação) — não gravada na planilha.
  result.positions = positions.slice(0, 50);
  return result;
}

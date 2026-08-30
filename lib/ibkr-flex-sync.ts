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
  proventoRowsForSheet,
  tradeRowsForSheet,
  sigProvento,
  normalizeDate,
  normalizeTipo,
  dedupTk,
  parseValor,
  pick,
} from "./broker-import";
import { fetchFlexStatement, parseFlexXml, parseFlexMeta } from "./ibkr-flex";
import { canonicalizeTickersForSheet, persistAssetMeta } from "./asset-meta";
import { activeUserKey } from "./user-sheet";

// Maior data (ISO yyyy-mm-dd) já presente na aba — o "corte" do sync.
// Comparação lexicográfica de yyyy-mm-dd == comparação cronológica.
function maxExistingISO(rows: Record<string, unknown>[], aliases: string[]): string {
  let max = "";
  for (const row of rows) {
    const iso = normalizeDate(pick(row, ...aliases));
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && iso > max) max = iso;
  }
  return max;
}

// (2026-07) O corte por data deixou de BLOQUEAR: linha apagada da planilha
// (caso VOW3.DE do dono) ou um 2º trade do MESMO dia de outro já gravado
// ficavam irrecuperáveis para sempre — o dedup por assinatura (ticker base +
// tipo + qtd + preço, com ordens fragmentadas e splits) é o guardião real
// contra duplicatas. O corte segue no relatório como informação
// (anteriores_ao_corte) e o CRON tem trava de volume (maxNovos) como cinto
// de segurança caso a dedup enlouqueça.
function afterCutoff(rawDate: string, cutoff: string): boolean {
  if (!cutoff) return true; // aba vazia → aceita tudo
  return normalizeDate(rawDate) > cutoff;
}

export async function runFlexSync(
  opts: { mode?: string; dryRun?: boolean; debug?: boolean; maxNovos?: number } = {},
): Promise<Record<string, unknown>> {
  const mode = opts.mode ?? "both";
  const dryRun = opts.dryRun ?? false;
  const debug = opts.debug ?? false;
  const wantProv = ["proventos", "both"].includes(mode);
  const wantTrades = ["trades", "both"].includes(mode);

  // O token Flex é da CONTA PRINCIPAL — rodar logado numa conta extra gravaria
  // os trades do dono na planilha da outra pessoa.
  if (activeUserKey()) {
    throw new Error("O sync IBKR usa o token da conta principal — entre com a conta principal para sincronizar");
  }

  const token = process.env.IBKR_FLEX_TOKEN;
  const queryId = process.env.IBKR_FLEX_QUERY_ID;
  if (!token || !queryId) {
    throw new Error("IBKR_FLEX_TOKEN e/ou IBKR_FLEX_QUERY_ID não configurados");
  }

  const xml = await fetchFlexStatement(token, queryId);
  const { proventos, trades, cambio, positions, proventosDupsRemoved, exchangeBySymbol, navDiario, fluxosExternos } = parseFlexXml(xml);

  // ── Garantia de grafia Yahoo (regra do dono) ──────────────────────────────
  // ANTES de qualquer escrita, cada ticker vira o símbolo EXATO do Yahoo
  // (DPM→DPM.TO, VOW3→VOW3.DE, CMIG4→CMIG4.SA; EUA sem sufixo). Usa a bolsa de
  // listagem do Flex como pista determinística e VALIDA no Yahoo. Se o Yahoo
  // estiver fora do ar, o sync segue com o ticker original (nunca bloqueia).
  const tickerAjustes: { de: string; para: string }[] = [];
  let tickersPendentes = 0;
  try {
    const itens = [
      ...trades.map(t => ({ ticker: t.Símbolo, moeda: t.Moeda, corretora: t.Corretora, exchange: exchangeBySymbol[t.Símbolo] })),
      ...proventos.map(p => ({ ticker: p.ticker, moeda: p.moeda, corretora: "IBKR", exchange: exchangeBySymbol[p.ticker] })),
    ];
    // Orçamento de 15s para o Yahoo: a rota tem maxDuration 60 e o Flex já
    // consome até ~40s — sem teto, a 1ª rodada (ativos_meta vazio) estourava a
    // função e a Vercel devolvia erro em texto puro.
    const { renames, metas, skipped } = await canonicalizeTickersForSheet(itens, { timeBudgetMs: 15_000 });
    if (renames.size > 0) {
      for (const t of trades) t.Símbolo = renames.get(t.Símbolo) ?? t.Símbolo;
      for (const p of proventos) p.ticker = renames.get(p.ticker) ?? p.ticker;
      // As POSITIONS alimentam a golden (marks): sem o rename, "VOW3" abriria
      // coluna paralela à "VOW3.DE" e partiria a série do ativo em duas.
      for (const pos of positions) pos.ticker = renames.get(pos.ticker) ?? pos.ticker;
      for (const [de, para] of renames) tickerAjustes.push({ de, para });
    }
    tickersPendentes = skipped;
    if (!dryRun && metas.length > 0) await persistAssetMeta(metas).catch(() => {});
  } catch { /* validação é best-effort — o sync nunca para por causa dela */ }

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
    // Grafias corrigidas para o padrão Yahoo antes da escrita (auditoria).
    ticker_ajustes: tickerAjustes,
    // Tickers que não couberam no orçamento Yahoo desta rodada (passaram com a
    // grafia original — a próxima rodada/verificador cobre).
    ticker_validacao_pendente: tickersPendentes,
  };

  // ── Proventos → meus_proventos ──
  if (wantProv && proventos.length > 0) {
    const existing = await store.fetchTab("meus_proventos");
    const st = dedupProventos(existing, proventos);
    const cutoff = maxExistingISO(existing, ["data", "date", "pagamento"]);
    const novos = proventos.filter((_, i) => st.get(i) === "novo");
    result.proventos = {
      total: proventos.length,
      corte_data: cutoff,
      faltantes: novos.length,
      anteriores_ao_corte: novos.filter((p) => !afterCutoff(p.data, cutoff)).length,
      preview: novos.slice(0, 300),
    };

    // ── Diagnóstico (?debug=1): por que os proventos não casam? ──
    if (debug) {
      // Chaves existentes por ticker (sem sufixo) para enxergar os "near misses".
      const existingByTk: Record<string, string[]> = {};
      const existingSample = existing.slice(0, 8).map((row) => {
        const data = normalizeDate(String(row["data"] ?? ""));
        const ticker = String(row["ticker"] ?? "");
        const valor = parseValor(String(row["valor"] ?? "0"));
        const decisao = String(row["decisao"] ?? row["lancamento"] ?? row["tipo"] ?? "");
        const tk = dedupTk(ticker);
        const sig = sigProvento(data, ticker, valor, decisao);
        (existingByTk[tk] ??= []).push(sig);
        return { ticker, tk, data, valor, decisao, sig, headers: Object.keys(row) };
      });
      for (const row of existing) {
        const tk = dedupTk(String(row["ticker"] ?? ""));
        const sig = sigProvento(normalizeDate(String(row["data"] ?? "")), String(row["ticker"] ?? ""), parseValor(String(row["valor"] ?? "0")), String(row["decisao"] ?? row["lancamento"] ?? row["tipo"] ?? ""));
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

    if (!dryRun && opts.maxNovos && novos.length > opts.maxNovos) {
      (result.proventos as Record<string, unknown>).bloqueado_por_volume =
        `${novos.length} novos > trava de ${opts.maxNovos} — rode manualmente em Configurações para revisar`;
    } else if (!dryRun && novos.length > 0) {
      await backupTab("meus_proventos").catch(() => {});
      // Header-aware: grava cada campo na coluna certa pelo NOME (não por posição),
      // senão a data cai em "lançamento" e o Sheets a vira serial.
      const headers = existing.length > 0 ? Object.keys(existing[0]) : [];
      const rows = proventoRowsForSheet(headers, novos);
      await store.appendRows("meus_proventos", rows);
      (result.proventos as Record<string, unknown>).inserted = novos.length;
    }
  }

  // ── Trades → meus_ativos ──
  if (wantTrades && trades.length > 0) {
    const existing = await store.fetchTab("meus_ativos");
    const st = dedupTrades(existing, trades);
    const cutoff = maxExistingISO(existing, ["data", "date"]);
    const novos = trades.filter((_, i) => st.get(i) === "novo");
    const splits = trades.filter((_, i) => st.get(i) === "split");
    const preview = trades
      .map((t, i) => ({ ...t, status_match: st.get(i) }))
      .filter((t) => t.status_match !== "existente")
      .slice(0, 300);

    result.trades = {
      total: trades.length,
      existing_count: existing.length,
      corte_data: cutoff,
      faltantes: novos.length,
      anteriores_ao_corte: novos.filter((t) => !afterCutoff(t.Data, cutoff)).length,
      potential_splits: splits.length,
      preview,
    };

    // ── Diagnóstico de trades (?debug=1) ──
    if (debug) {
      const readTrade = (row: Record<string, unknown>) => ({
        ticker: dedupTk(String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? "")),
        tipo: normalizeTipo(String(row["tipo de transação"] ?? row["tipo de transacao"] ?? row["tipo"] ?? "")),
        qty: parseValor(String(row["quantidade"] ?? "0")),
        preco: parseValor(String(row["preço"] ?? row["preco"] ?? row["precio"] ?? "0")),
      });
      (result.trades as Record<string, unknown>).debug = {
        existingCount: existing.length,
        existingHeaders: existing[0] ? Object.keys(existing[0]) : [],
        existingSample: existing.slice(0, 6).map((r) => ({ ...readTrade(r), headers: Object.keys(r) })),
        incomingSample: trades.slice(0, 8).map((t, i) => ({
          ticker: dedupTk(t.Símbolo), tipo: normalizeTipo(t["Tipo de transação"]),
          qty: parseValor(t.Quantidade), preco: parseValor(t.Preço),
          status: st.get(i),
        })),
      };
    }

    if (!dryRun && opts.maxNovos && novos.length > opts.maxNovos) {
      (result.trades as Record<string, unknown>).bloqueado_por_volume =
        `${novos.length} novos > trava de ${opts.maxNovos} — rode manualmente em Configurações para revisar`;
    } else if (!dryRun && novos.length > 0) {
      await backupTab("meus_ativos").catch(() => {});
      const headers = existing.length > 0 ? Object.keys(existing[0]) : [];
      const rows = tradeRowsForSheet(headers, novos);
      await store.appendRows("meus_ativos", rows);
      (result.trades as Record<string, unknown>).inserted = novos.length;
    }
  }

  // ── Forex → cambio ──
  if (wantTrades && cambio.length > 0) {
    const existing = await store.fetchTab("cambio");
    const st = dedupCambio(existing, cambio);
    const cutoff = maxExistingISO(existing, ["data", "date"]);
    const novos = cambio.filter((_, i) => st.get(i) === "novo");
    result.cambio = {
      total: cambio.length,
      corte_data: cutoff,
      faltantes: novos.length,
      anteriores_ao_corte: novos.filter((c) => !afterCutoff(c.data, cutoff)).length,
      preview: novos.slice(0, 300),
    };

    if (!dryRun && opts.maxNovos && novos.length > opts.maxNovos) {
      (result.cambio as Record<string, unknown>).bloqueado_por_volume =
        `${novos.length} novos > trava de ${opts.maxNovos} — rode manualmente em Configurações para revisar`;
    } else if (!dryRun && novos.length > 0) {
      await backupTab("cambio").catch(() => {});
      const headers = existing.length > 0 ? Object.keys(existing[0]) : [];
      const rows = cambioRowsForSheet(headers, novos);
      await store.appendRows("cambio", rows);
      (result.cambio as Record<string, unknown>).inserted = novos.length;
    }
  }

  // ── NAV diário → aba ibkr_nav (TWR oficial — acumula além dos 365d do Flex) ──
  if (!dryRun && navDiario.length > 0) {
    try {
      const { persistirNavIbkr } = await import("./ibkr-nav-store");
      const { anexarFluxos } = await import("./ibkr-nav");
      const inseridos = await persistirNavIbkr(anexarFluxos(navDiario, fluxosExternos));
      result.nav = { pontos_flex: navDiario.length, inseridos };
    } catch (e) {
      result.nav = { pontos_flex: navDiario.length, erro: e instanceof Error ? e.message : "falha ao gravar" };
    }
  } else if (navDiario.length === 0) {
    result.nav = { pontos_flex: 0, aviso: "seção Equity Summary in Base ausente na Flex query" };
  }

  // ── Marks oficiais → golden source (regime híbrido, decisão do dono 27/08) ──
  // Para os ativos IBKR, o fechamento do pregão toDate na db_cotacoes passa a
  // ser o markPrice do PRÓPRIO extrato — o cron de cotações RESERVA essas
  // células (ver sync-cotacoes) e este passo as preenche na manhã seguinte.
  // Só células vazias: o gate da golden garante que nada existente muda.
  // Best-effort e desligável (Configurações → Automações, chave golden_ibkr).
  if (!dryRun && positions.length > 0) {
    try {
      const { isAutomacaoAtiva } = await import("./automacoes");
      if (await isAutomacaoAtiva("golden_ibkr")) {
        const { montarMarksParaGolden, aplicarMarksNaGolden } = await import("./ibkr-marks");
        const { getMarketDataStore } = await import("./data-store");
        const meta = parseFlexMeta(xml);
        const mktStore = getMarketDataStore();
        const golden = await mktStore.read();
        const marks = montarMarksParaGolden(positions, meta.toDate, golden.tickers, golden);
        if (marks) {
          const { data, preenchidos } = aplicarMarksNaGolden(golden, marks);
          // rejeitados = marks que divergem do histórico da coluna (unidade/
          // moeda/coluna errada). Ficam FORA e o Yahoo preenche em T−2.
          const rejeitados = marks.rejeitados;
          if (preenchidos > 0) {
            const w = await mktStore.write(data);
            result.golden_ibkr = { data: marks.date, preenchidos, modo: w.mode, motivo: w.reason, rejeitados };
          } else {
            result.golden_ibkr = { data: marks.date, preenchidos: 0, aviso: "células já preenchidas", rejeitados };
          }
        }
      } else {
        result.golden_ibkr = { desligado: true };
      }
    } catch (e) {
      result.golden_ibkr = { erro: e instanceof Error ? e.message : "falha ao gravar marks" };
    }
  }

  // Foto das posições (reconciliação) — não gravada na planilha.
  result.positions = positions.slice(0, 50);
  return result;
}

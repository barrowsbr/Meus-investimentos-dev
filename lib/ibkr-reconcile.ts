/**
 * Reconciliação pontual de VALORES de proventos: IBKR (fonte correta) → planilha.
 *
 * Casa cada lançamento por (data + ticker + tipo) — IGNORANDO o valor — e, quando
 * o valor da planilha difere do da IBKR, corrige a célula para o valor da IBKR.
 * Usado quando a IBKR revisa retenções/valores (ações estrangeiras) e o que foi
 * lançado um dia deixa de bater. Ação MANUAL (fora do cron); dry-run por padrão.
 *
 * Atualiza só a célula do valor (preservando o sinal da planilha) — não reescreve
 * a aba. Faz backup antes de gravar.
 */

import { getDataStore } from "./data-store";
import { dedupTk, normalizeDate, parseValor } from "./broker-import";
import { fetchFlexStatement, parseFlexXml } from "./ibkr-flex";

function typeOf(decisao: string): "I" | "D" {
  return decisao.toLowerCase().includes("imposto") ? "I" : "D";
}

// índice 0 → "A" (suficiente para meus_proventos, < 26 colunas)
function colLetter(idx: number): string {
  return String.fromCharCode(65 + idx);
}

export interface ReconcileResult {
  dry_run: boolean;
  divergencias: number;
  detalhes: Array<{ ticker: string; data: string; tipo: string; de: string; para: string }>;
  corrigidas?: number;
  error?: string;
}

export async function reconcileProventoValues(opts: { dryRun?: boolean } = {}): Promise<ReconcileResult> {
  const dryRun = opts.dryRun ?? true;

  const token = process.env.IBKR_FLEX_TOKEN;
  const queryId = process.env.IBKR_FLEX_QUERY_ID;
  if (!token || !queryId) throw new Error("IBKR_FLEX_TOKEN e/ou IBKR_FLEX_QUERY_ID não configurados");

  const { proventos } = parseFlexXml(await fetchFlexStatement(token, queryId));
  const store = getDataStore();
  const existing = await store.fetchTab("meus_proventos");
  if (existing.length === 0) return { dry_run: dryRun, divergencias: 0, detalhes: [], error: "meus_proventos vazio" };

  const headers = Object.keys(existing[0]);
  const valorIdx = headers.indexOf("valor");
  if (valorIdx < 0) throw new Error("Coluna 'valor' não encontrada em meus_proventos");
  const valorCol = colLetter(valorIdx);

  // Valor correto da IBKR por (ticker | data | tipo).
  const ibkr = new Map<string, string>();
  for (const p of proventos) {
    ibkr.set(`${dedupTk(p.ticker)}|${normalizeDate(p.data)}|${typeOf(p.decisao)}`, p.valor);
  }

  const detalhes: ReconcileResult["detalhes"] = [];
  const updates: { a1: string; value: string }[] = [];

  for (let i = 0; i < existing.length; i++) {
    const row = existing[i];
    const key = `${dedupTk(String(row.ticker ?? ""))}|${normalizeDate(String(row.data ?? ""))}|${typeOf(String(row.decisao ?? row.lancamento ?? ""))}`;
    const ibValor = ibkr.get(key);
    if (ibValor === undefined) continue; // sem contrapartida na IBKR — não mexe

    const sheetRaw = String(row.valor ?? "0");
    const sheetNum = parseValor(sheetRaw);
    if (Math.round(Math.abs(sheetNum) * 100) === Math.round(Math.abs(parseValor(ibValor)) * 100)) continue; // já igual

    const newValue = (sheetNum < 0 ? "-" : "") + ibValor; // corrige magnitude, preserva sinal
    const rowNumber = i + 2; // linha 1 = cabeçalho
    detalhes.push({
      ticker: String(row.ticker ?? ""),
      data: normalizeDate(String(row.data ?? "")),
      tipo: key.endsWith("|I") ? "Imposto" : "Dividendo",
      de: sheetRaw,
      para: newValue,
    });
    updates.push({ a1: `${valorCol}${rowNumber}`, value: newValue });
  }

  const result: ReconcileResult = { dry_run: dryRun, divergencias: detalhes.length, detalhes };

  if (!dryRun && updates.length > 0) {
    await store.updateCells("meus_proventos", updates);
    result.corrigidas = updates.length;
  }
  return result;
}

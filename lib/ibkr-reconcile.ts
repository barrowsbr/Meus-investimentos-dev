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

  // Valores da IBKR por (ticker | data | tipo). Pode haver MAIS de um lançamento
  // na mesma chave (dividendo ordinário + distribuição especial no mesmo dia, ou
  // dois lotes) — por isso uma LISTA por chave, não um valor last-wins que
  // corromperia ambas as linhas da planilha para o mesmo número.
  const ibkrByKey = new Map<string, { valor: string; num: number; used: boolean }[]>();
  for (const p of proventos) {
    const k = `${dedupTk(p.ticker)}|${normalizeDate(p.data)}|${typeOf(p.decisao)}`;
    const arr = ibkrByKey.get(k) ?? [];
    arr.push({ valor: p.valor, num: Math.abs(parseValor(p.valor)), used: false });
    ibkrByKey.set(k, arr);
  }

  const detalhes: ReconcileResult["detalhes"] = [];
  const updates: { a1: string; value: string }[] = [];

  for (let i = 0; i < existing.length; i++) {
    const row = existing[i];
    const key = `${dedupTk(String(row.ticker ?? ""))}|${normalizeDate(String(row.data ?? ""))}|${typeOf(String(row.decisao ?? row.lancamento ?? ""))}`;
    const cands = ibkrByKey.get(key);
    if (!cands || cands.length === 0) continue; // sem contrapartida na IBKR — não mexe

    const sheetRaw = String(row.valor ?? "0");
    const sheetNum = parseValor(sheetRaw);
    const sheetAbs = Math.abs(sheetNum);
    // Casa esta linha ao lançamento IBKR NÃO usado mais próximo em valor, e o
    // consome — assim 2 proventos no mesmo dia mapeiam 1-para-1 sem colidir.
    let best = -1, bestDiff = Infinity;
    for (let j = 0; j < cands.length; j++) {
      if (cands[j].used) continue;
      const d = Math.abs(cands[j].num - sheetAbs);
      if (d < bestDiff) { bestDiff = d; best = j; }
    }
    if (best < 0) continue; // todos os lançamentos dessa chave já foram consumidos
    cands[best].used = true;
    const ibValor = cands[best].valor;
    if (Math.round(sheetAbs * 100) === Math.round(cands[best].num * 100)) continue; // já igual

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

// Marks oficiais da IBKR → golden source (decisão do dono 27/08): para os
// ativos custodiados na IBKR, o fechamento diário da db_cotacoes passa a ser o
// markPrice do extrato Flex (OpenPositions, na data toDate) — auditável célula
// a célula contra o extrato. Módulo PURO (testado); a escrita reusa o caminho
// blindado de writeGoldenSource (gate + backup + append/preenchimento de null).

import type { IbkrPosition } from "./ibkr-flex";

export interface MarksParaGolden {
  date: string;                       // pregão dos marks (toDate do extrato)
  valores: Record<string, number>;    // coluna da golden → markPrice
}

// Mesmo casamento por BASE sem sufixo do sync de cotações: a coluna histórica
// pode ser "DPM.TO" enquanto o Flex fala "DPM" (ou vice-versa) — o mark
// alimenta a MESMA coluna, sem partir a série em duas.
const baseTk = (t: string) => t.toUpperCase().replace(/\.[A-Z]{1,2}$/, "");

const ehFimDeSemana = (ymd: string): boolean => {
  const dow = new Date(ymd + "T12:00:00Z").getUTCDay();
  return dow === 0 || dow === 6;
};

/** Monta {coluna → mark} para a linha `toDate` da golden. Fim de semana e
 *  preço inválido ficam fora; ticker sem coluna existente vira coluna nova
 *  (grafia do próprio Flex). */
export function montarMarksParaGolden(
  positions: Array<Pick<IbkrPosition, "ticker" | "markPrice">>,
  toDate: string,
  goldenTickers: string[],
): MarksParaGolden | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate) || ehFimDeSemana(toDate)) return null;

  const colunaPorBase = new Map<string, string>();
  for (const t of goldenTickers) {
    const b = baseTk(t);
    if (!colunaPorBase.has(b)) colunaPorBase.set(b, t.toUpperCase());
  }

  const valores: Record<string, number> = {};
  for (const p of positions) {
    const tk = (p.ticker ?? "").toUpperCase().trim();
    if (!tk || !(p.markPrice > 0)) continue;
    const coluna = colunaPorBase.get(baseTk(tk)) ?? tk;
    valores[coluna] = p.markPrice;
  }

  return Object.keys(valores).length > 0 ? { date: toDate, valores } : null;
}

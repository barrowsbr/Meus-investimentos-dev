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

// ── Merge dos marks na golden (puro, testado) ────────────────────────────────

export interface GoldenLike {
  tickers: string[];
  dates: string[];
  prices: Record<string, Record<string, number>>;
}

/** Aplica os marks na golden SÓ em células vazias — nenhuma célula existente
 *  é alterada (compatível com o checkGoldenGuard por construção: o resultado
 *  é sempre superset do original). Devolve o próximo estado + quantas células
 *  foram de fato preenchidas. */
export function aplicarMarksNaGolden(
  golden: GoldenLike,
  marks: MarksParaGolden,
): { data: GoldenLike; preenchidos: number } {
  const prices: Record<string, Record<string, number>> = {};
  for (const d of golden.dates) prices[d] = { ...golden.prices[d] };

  const tickers = new Set(golden.tickers.map((t) => t.toUpperCase()));
  const dates = new Set(golden.dates);
  dates.add(marks.date);
  if (!prices[marks.date]) prices[marks.date] = {};

  let preenchidos = 0;
  for (const [col, preco] of Object.entries(marks.valores)) {
    tickers.add(col);
    if (prices[marks.date][col] == null) {
      prices[marks.date][col] = preco;
      preenchidos++;
    }
  }

  return {
    data: { tickers: [...tickers].sort(), dates: [...dates].sort(), prices },
    preenchidos,
  };
}

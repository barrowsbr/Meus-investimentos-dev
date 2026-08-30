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

// Divergência máxima tolerada entre o mark da IBKR e o último fechamento
// conhecido na coluna. Mesma régua do detectAnomalies (25%): acima disso o
// mark NÃO é o mesmo ativo/unidade que a coluna guarda. Barra os três modos
// de falha que corromperiam o TWR de forma silenciosa:
//   • unidade: Yahoo cota LSE em PENCE e a IBKR em libra (fator 100×);
//   • moeda: mark em base (US$) numa coluna que guarda CAD/EUR;
//   • coluna errada: casamento por base levando o mark ao ativo vizinho.
// Split legítimo também é barrado — e aí o Yahoo (que ajusta split) preenche
// a célula em T−2 pelo fallback. Preferimos perder 1 dia a gravar lixo.
const DIVERGENCIA_MAX = 0.25;

/** Último fechamento conhecido de cada coluna (varre de trás p/ frente). */
function ultimoFechamento(golden: GoldenLike, ateData: string): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = golden.dates.length - 1; i >= 0; i--) {
    const d = golden.dates[i];
    if (d >= ateData) continue; // referência é o PASSADO, não o próprio dia
    const row = golden.prices[d];
    if (!row) continue;
    for (const [col, v] of Object.entries(row)) {
      if (v > 0 && !out.has(col)) out.set(col, v);
    }
  }
  return out;
}

export interface MarkRejeitado {
  coluna: string;
  /** mark ÷ último fechamento — 100.3 denuncia pence×libra, 5.4 denuncia US$×BRL. */
  fator: number;
}

/** Monta {coluna → mark} para a linha `toDate` da golden. Ficam de fora: fim de
 *  semana, preço inválido e marks que DIVERGEM do histórico da coluna (ver
 *  DIVERGENCIA_MAX). Ticker sem coluna existente vira coluna nova (grafia do
 *  próprio Flex) — sem referência, nada a comparar. */
export function montarMarksParaGolden(
  positions: Array<Pick<IbkrPosition, "ticker" | "markPrice">>,
  toDate: string,
  goldenTickers: string[],
  golden?: GoldenLike,
): (MarksParaGolden & { rejeitados: MarkRejeitado[] }) | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate) || ehFimDeSemana(toDate)) return null;

  const colunaPorBase = new Map<string, string>();
  for (const t of goldenTickers) {
    const b = baseTk(t);
    if (!colunaPorBase.has(b)) colunaPorBase.set(b, t.toUpperCase());
  }
  const referencia = golden ? ultimoFechamento(golden, toDate) : new Map<string, number>();

  const valores: Record<string, number> = {};
  const rejeitados: MarkRejeitado[] = [];
  for (const p of positions) {
    const tk = (p.ticker ?? "").toUpperCase().trim();
    if (!tk || !(p.markPrice > 0)) continue;
    const coluna = colunaPorBase.get(baseTk(tk)) ?? tk;

    const ref = referencia.get(coluna);
    if (ref != null && ref > 0) {
      const fator = p.markPrice / ref;
      if (Math.abs(fator - 1) > DIVERGENCIA_MAX) {
        rejeitados.push({ coluna, fator: Math.round(fator * 1000) / 1000 });
        continue; // não entra na golden — o Yahoo preenche em T−2
      }
    }
    valores[coluna] = p.markPrice;
  }

  return Object.keys(valores).length > 0 || rejeitados.length > 0
    ? { date: toDate, valores, rejeitados }
    : null;
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

// Helper puro (client-safe) para derivar a série DIÁRIA do patrimônio a partir
// das linhas cruas da aba `historico_patrimonio` (que tem ~3 snapshots/dia).
// Usado pelo sparkline do herói (janela de 3 semanas) e pelos marcadores de
// "últimos pregões" na Home. Sem deps server-only — só parsing de array.

export interface DiaPatrimonio {
  date: string; // rótulo original (YYYY-MM-DD)
  ts: number; // timestamp (ms) para janela por data
  total: number; // patrimônio total no fim do dia (BRL)
  /** `variacao_dia_pct` do último snapshot do dia — o retorno do dia vindo do
   *  MOTOR (snapshot.dayChangeTotalPct), não derivado do patrimônio. */
  varDiaPct: number | null;
}

function parseData(s: string): number {
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return Date.UTC(y, +m[2] - 1, +m[1]);
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
}

// Agrega para 1 ponto por dia = o ÚLTIMO snapshot do dia (fechamento). As linhas
// vêm cronológicas do append; o Map preserva a ordem de 1ª inserção da chave e o
// último `set` sobrescreve o valor — resultando em ordem cronológica por data.
export function toDailySeries(rows: unknown[]): DiaPatrimonio[] {
  if (!Array.isArray(rows)) return [];
  const byDate = new Map<string, { total: number; varDiaPct: number | null }>();
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    const date = String(row?.data ?? "").trim();
    const total = Number(row?.patrimonio_total);
    if (!date || !(total > 0)) continue;
    const bruto = row?.variacao_dia_pct;
    const v = Number(bruto);
    const varDiaPct = bruto === null || bruto === undefined || bruto === "" || !Number.isFinite(v) ? null : v;
    byDate.set(date, { total, varDiaPct }); // last-write-wins = último snapshot do dia
  }
  const out: DiaPatrimonio[] = [];
  for (const [date, o] of byDate) out.push({ date, ts: parseData(date), total: o.total, varDiaPct: o.varDiaPct });
  return out;
}

// ── Resultados por pregão ───────────────────────────────────────────────────
// ⚠️ A versão antiga derivava o retorno de (patrimônio_hoje / patrimônio_ontem),
// e isso estava ERRADO de três jeitos, medidos na série real (03/09/2026):
//   • APORTE virava "lucro": 04/08 aparecia +18,45% (real: +1,66%) e 11/06
//     +11,92% (real: +1,23%). Dinheiro que ENTROU não é rendimento.
//   • BURACO na série virava "um pregão": o cron pula quando o book da IBKR
//     não entra, então uma barra chegava a somar 17 dias corridos.
//   • Resultado: 13 de 48 barras com a COR TROCADA (verde em dia de queda).
// A aba já traz `variacao_dia_pct` = snapshot.dayChangeTotalPct, o retorno do
// dia calculado pelo motor a partir de PREÇOS — imune a aporte e a buraco.
// Regra do projeto: reusar o campo canônico, nunca recalcular ad-hoc.
export interface DiaResultado { date: string; pct: number }

/** Sábado/domingo não são pregão (o cron roda todo dia e gravava fim de semana
 *  como se fosse; 14 dos "53 pregões" eram sábado ou domingo). */
function ehFimDeSemana(ts: number): boolean {
  const dia = new Date(ts).getUTCDay();
  return dia === 0 || dia === 6;
}

/** Últimos N pregões com retorno canônico. Dia sem o campo é PULADO — melhor
 *  uma barra a menos do que uma barra errada. */
export function ultimosResultados(daily: DiaPatrimonio[], n: number): DiaResultado[] {
  const out: DiaResultado[] = [];
  for (const d of daily) {
    if (d.varDiaPct === null) continue;
    if (Number.isFinite(d.ts) && ehFimDeSemana(d.ts)) continue;
    out.push({ date: d.date, pct: d.varDiaPct });
  }
  return out.slice(-n);
}

/** Referência de altura das barras: percentil 90 das magnitudes, não o MÁXIMO.
 *  Com o máximo, um único dia atípico empurra todo o resto para o piso — era o
 *  que deixava 92% das barras indistinguíveis. Com o p90, o dia típico ocupa
 *  altura média e o atípico satura no topo (o clamp de quem chama). */
export function escalaBarras(pcts: number[], minimo = 0.4): number {
  const mags = pcts.map(Math.abs).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (mags.length === 0) return minimo;
  const p90 = mags[Math.min(mags.length - 1, Math.floor(mags.length * 0.9))];
  return Math.max(minimo, p90);
}

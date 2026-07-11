// Helper puro (client-safe) para derivar a série DIÁRIA do patrimônio a partir
// das linhas cruas da aba `historico_patrimonio` (que tem ~3 snapshots/dia).
// Usado pelo sparkline do herói (janela de 3 semanas) e pelos marcadores de
// "últimos pregões" na Home. Sem deps server-only — só parsing de array.

export interface DiaPatrimonio {
  date: string; // rótulo original (YYYY-MM-DD)
  ts: number; // timestamp (ms) para janela por data
  total: number; // patrimônio total no fim do dia (BRL)
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
  const byDate = new Map<string, number>();
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    const date = String(row?.data ?? "").trim();
    const total = Number(row?.patrimonio_total);
    if (!date || !(total > 0)) continue;
    byDate.set(date, total); // last-write-wins = último snapshot do dia
  }
  const out: DiaPatrimonio[] = [];
  for (const [date, total] of byDate) out.push({ date, ts: parseData(date), total });
  return out;
}

// Últimos N resultados diários (variação % de fechamento a fechamento) — "como
// foi cada pregão". Precisa de N+1 fechamentos; devolve o que houver.
export interface DiaResultado { date: string; pct: number }
export function ultimosResultados(daily: DiaPatrimonio[], n: number): DiaResultado[] {
  const out: DiaResultado[] = [];
  for (let i = 1; i < daily.length; i++) {
    const prev = daily[i - 1].total;
    const cur = daily[i].total;
    if (prev > 0) out.push({ date: daily[i].date, pct: (cur / prev - 1) * 100 });
  }
  return out.slice(-n);
}

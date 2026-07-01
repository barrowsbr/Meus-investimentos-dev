/**
 * Rebalanceamento — cálculo PURO de desvio (drift) vs alvo e sugestão de ações.
 *
 * NÃO recalcula patrimônio: a alocação atual por classe vem da árvore canônica
 * `estrutura_carteira` (/api/composicao/resumo). Aqui só entra matemática de
 * alvo × atual. As metas do usuário são persistidas na aba `rebalanceamento`.
 */

// ── Persistência (aba do Sheets) ─────────────────────────────────────────────
export const REBALANCE_TAB = "rebalanceamento";
export const REBALANCE_HEADERS = ["classe", "peso_alvo_pct", "banda_pct"] as const;

export interface RebalanceMeta {
  classe: string;
  pesoAlvoPct: number;
  bandaPct: number;
}

// ── Alocação atual (derivada da estrutura_carteira canônica) ─────────────────
export interface AllocClass {
  classe: string;
  macro: string;      // "Renda Variável" | "Renda Fixa"
  valorBRL: number;
}

interface EstruturaNode { name: string; value: number; pct: number; children?: EstruturaNode[] }

/** Achata a árvore Classe→subclasse→ticker no NÍVEL das subclasses (as filhas
 *  do macro): Ações Brasil, Ações EUA, ETFs, FIIs, Cripto, Commodities, Tesouro,
 *  Caixa… — o eixo que o usuário pensa em alvo. */
export function classesFromEstrutura(estrutura: EstruturaNode[] | undefined): AllocClass[] {
  const out: AllocClass[] = [];
  for (const macro of estrutura ?? []) {
    for (const c of macro.children ?? []) {
      if (c.value > 0) out.push({ classe: c.name, macro: macro.name, valorBRL: c.value });
    }
  }
  return out;
}

const isCaixa = (classe: string) => /caixa|liquidez|dispon/i.test(classe);

// ── Resultado do cálculo ──────────────────────────────────────────────────────
export interface RebalanceRow {
  classe: string;
  macro: string;
  atualBRL: number;
  atualPct: number;
  alvoPct: number | null;      // null = classe sem alvo definido
  bandaPct: number;
  driftPct: number | null;     // atual − alvo (>0 sobrealocado)
  alvoBRL: number | null;
  ajusteBRL: number | null;    // alvo − atual (>0 comprar, <0 vender)
  status: "manter" | "aportar" | "reduzir" | "sem-alvo";
}

export interface RebalanceAction {
  classe: string;
  tipo: "aportar" | "reduzir";
  valorBRL: number;
  avisoImposto: boolean;       // venda de RV → pode gerar ganho tributável
}

export interface RebalanceResult {
  totalBRL: number;
  rows: RebalanceRow[];
  somaAlvosPct: number;        // soma dos alvos definidos (deve tender a 100)
  temAlvos: boolean;
  caixaBRL: number;
  aporteBRL: number;
  actions: RebalanceAction[];
  vendasEvitadasPorAporte: boolean; // aporte cobre todo o déficit → nenhuma venda
}

export function computeRebalance(
  classes: AllocClass[],
  metas: RebalanceMeta[],
  opts: { aporteBRL?: number } = {},
): RebalanceResult {
  const totalBRL = classes.reduce((s, c) => s + c.valorBRL, 0);
  const metaMap = new Map(metas.map((m) => [m.classe, m]));
  const caixaBRL = classes.filter((c) => isCaixa(c.classe)).reduce((s, c) => s + c.valorBRL, 0);
  const aporteBRL = Math.max(0, opts.aporteBRL ?? 0);

  const rows: RebalanceRow[] = classes.map((c) => {
    const atualPct = totalBRL > 0 ? (c.valorBRL / totalBRL) * 100 : 0;
    const meta = metaMap.get(c.classe);
    if (!meta) {
      return { classe: c.classe, macro: c.macro, atualBRL: c.valorBRL, atualPct, alvoPct: null, bandaPct: 0, driftPct: null, alvoBRL: null, ajusteBRL: null, status: "sem-alvo" };
    }
    const alvoPct = meta.pesoAlvoPct;
    const drift = atualPct - alvoPct;
    // Alvo em R$ sobre o total ATUAL (drift e ajuste na mesma base). O aporte
    // NÃO entra aqui — ele reduz as VENDAS na etapa de ações (cash-first).
    const alvoBRL = totalBRL * alvoPct / 100;
    const ajuste = alvoBRL - c.valorBRL;
    let status: RebalanceRow["status"];
    if (Math.abs(drift) <= meta.bandaPct) status = "manter";
    else status = ajuste > 0 ? "aportar" : "reduzir";
    return { classe: c.classe, macro: c.macro, atualBRL: c.valorBRL, atualPct, alvoPct, bandaPct: meta.bandaPct, driftPct: drift, alvoBRL, ajusteBRL: ajuste, status };
  });

  const somaAlvosPct = metas.reduce((s, m) => s + m.pesoAlvoPct, 0);
  const temAlvos = metas.length > 0;

  // ── Ações sugeridas (só classes fora da banda) ──────────────────────────────
  // Cash-first: o aporte novo é distribuído nos DÉFICITS antes de sugerir venda.
  const deficits = rows.filter((r) => r.status === "aportar" && (r.ajusteBRL ?? 0) > 0);
  const excessos = rows.filter((r) => r.status === "reduzir" && (r.ajusteBRL ?? 0) < 0);
  const totalDeficit = deficits.reduce((s, r) => s + (r.ajusteBRL ?? 0), 0);

  const actions: RebalanceAction[] = [];

  // Compras: cada déficit recebe o ajuste cheio (será financiado por aporte+vendas).
  for (const r of deficits) {
    actions.push({ classe: r.classe, tipo: "aportar", valorBRL: r.ajusteBRL ?? 0, avisoImposto: false });
  }

  // Vendas: só o déficit que o aporte NÃO cobre precisa vir de venda das classes
  // sobrealocadas (rateado pelo excesso de cada uma).
  const deficitResidual = Math.max(0, totalDeficit - aporteBRL);
  const totalExcesso = excessos.reduce((s, r) => s + Math.abs(r.ajusteBRL ?? 0), 0);
  if (deficitResidual > 0.01 && totalExcesso > 0) {
    for (const r of excessos) {
      const parcela = (Math.abs(r.ajusteBRL ?? 0) / totalExcesso) * deficitResidual;
      if (parcela > 0.01) {
        actions.push({ classe: r.classe, tipo: "reduzir", valorBRL: parcela, avisoImposto: r.macro === "Renda Variável" && !isCaixa(r.classe) });
      }
    }
  }

  const vendasEvitadasPorAporte = totalDeficit > 0.01 && deficitResidual <= 0.01;

  actions.sort((a, b) => b.valorBRL - a.valorBRL);
  return { totalBRL, rows, somaAlvosPct, temAlvos, caixaBRL, aporteBRL, actions, vendasEvitadasPorAporte };
}

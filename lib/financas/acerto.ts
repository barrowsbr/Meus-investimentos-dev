// Motor do "Acerto" — o modelo de finanças do dono, formalizado (15/08/2026):
// tudo no cartão; as contas do mês M = fixas(M) + fatura(M), e a fatura de M é
// o CONSUMO do ciclo anterior (defasagem de 1 mês). Sobra = entradas − contas;
// positiva vira poupança incremental, negativa sai da poupança.
// Módulo PURO client-safe (datas entram como string ISO; nada de Date.now aqui
// dentro — "hoje" é parâmetro). O dia de fechamento da fatura vem aprendido do
// próprio OFX (app_config escopo cartao, via /api/financas/cartao).

export interface TransacaoAcerto {
  data: string;   // YYYY-MM-DD
  valor: number;  // >0 = gasto (padrão da aba cartao_transacoes)
  parcela: { n: number; total: number } | null;
  assinatura?: boolean; // marcada pela detecção (nomesCasam com a lista)
}

// ── Ciclo da fatura ──────────────────────────────────────────────────────────
// Compra até o dia de fechamento (inclusive) entra na fatura que fecha naquele
// mês e é PAGA no mês seguinte; depois do fechamento, empurra 1 mês. Ex.:
// fechamento dia 28 → compra 10/ago paga em set; compra 29/ago paga em out.

const ymAdd = (ym: string, n: number): string => {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + n;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** Mês (YYYY-MM) em que a compra é PAGA. */
export function mesPagamento(dataISO: string, diaFechamento: number): string {
  const ym = dataISO.slice(0, 7);
  const dia = Number(dataISO.slice(8, 10));
  return dia <= diaFechamento ? ymAdd(ym, 1) : ymAdd(ym, 2);
}

/** Total do cartão pago no mês `ym` (= consumo do ciclo anterior). */
export function faturaPagaEm(trans: TransacaoAcerto[], ym: string, diaFechamento: number): number {
  return trans.reduce((s, t) => s + (t.valor > 0 && mesPagamento(t.data, diaFechamento) === ym ? t.valor : 0), 0);
}

// ── Bloco 1: o acerto do mês vigente ─────────────────────────────────────────

export interface Acerto {
  entradas: number;
  fixas: number;
  faturaNubank: number;      // do OFX (consumo do ciclo passado)
  faturasOutras: number;     // cartões sem OFX (valores manuais da aba pessoal)
  faturaNubankManual: number;// o que está digitado na aba (p/ conferência)
  sobra: number;
}

export function calcularAcerto(args: {
  mensal: Array<{ categoria: string; nome: string; valor: number }>;
  trans: TransacaoAcerto[];
  ymAtual: string;
  diaFechamento: number;
}): Acerto {
  const { mensal, trans, ymAtual, diaFechamento } = args;
  const entradas = mensal.filter(r => r.categoria === "entrada").reduce((s, r) => s + r.valor, 0);
  const fixas = mensal.filter(r => r.categoria === "saida").reduce((s, r) => s + r.valor, 0);
  const ehNubankLucas = (nome: string) => /nubank/i.test(nome) && !/maria/i.test(nome);
  const faturaNubankManual = mensal.filter(r => r.categoria === "cartao" && ehNubankLucas(r.nome)).reduce((s, r) => s + r.valor, 0);
  const faturasOutras = mensal.filter(r => r.categoria === "cartao" && !ehNubankLucas(r.nome)).reduce((s, r) => s + r.valor, 0);
  const faturaNubank = faturaPagaEm(trans, ymAtual, diaFechamento);
  // OFX é a golden source do Nubank; se não há transações (aba vazia), cai no manual.
  const nubank = faturaNubank > 0 ? faturaNubank : faturaNubankManual;
  return {
    entradas, fixas, faturaNubank: nubank, faturasOutras, faturaNubankManual,
    sobra: entradas - fixas - nubank - faturasOutras,
  };
}

// ── Bloco 2: a próxima fatura em construção ─────────────────────────────────

export interface ProximaFatura {
  ymPagamento: string;       // mês em que essa fatura será paga
  fimCiclo: string;          // YYYY-MM-DD do fechamento
  diasPassados: number;
  diasRestantes: number;
  variavel: number;          // gasto avulso já feito no ciclo
  parcelado: number;         // parcelas já lançadas no ciclo
  assinaturas: number;       // assinaturas já cobradas no ciclo
  parcelasQueVemAi: number;  // parcelas conhecidas que AINDA vão cair no ciclo
  assinaturasQueVemAi: number; // assinaturas previstas que ainda não bateram
  projecaoVariavel: number;  // variável extrapolado pelo ritmo diário
  totalPrevisto: number;
}

const diasEntre = (a: string, b: string): number =>
  Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);

const fimDoCiclo = (hoje: string, diaFechamento: number): string => {
  const ym = Number(hoje.slice(8, 10)) <= diaFechamento ? hoje.slice(0, 7) : ymAdd(hoje.slice(0, 7), 1);
  // Clampa p/ meses curtos (fechamento 31 em fevereiro → último dia do mês).
  const ultimo = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
  return `${ym}-${String(Math.min(diaFechamento, ultimo)).padStart(2, "0")}`;
};

export function construirProximaFatura(args: {
  trans: TransacaoAcerto[];
  hoje: string;             // YYYY-MM-DD
  diaFechamento: number;
  assinaturasMensais: number;         // Σ valorMensal das assinaturas ativas
  parcelasRestantes: Array<{ valorParcela: number; restantes: number }>;
}): ProximaFatura {
  const { trans, hoje, diaFechamento, assinaturasMensais, parcelasRestantes } = args;
  const fimCiclo = fimDoCiclo(hoje, diaFechamento);
  const inicioCiclo = `${ymAdd(fimCiclo.slice(0, 7), -1)}-${fimCiclo.slice(8, 10)}`;
  const ymPagamento = ymAdd(fimCiclo.slice(0, 7), 1);

  let variavel = 0, parcelado = 0, assinaturas = 0;
  for (const t of trans) {
    if (t.valor <= 0) continue;
    if (t.data <= inicioCiclo || t.data > hoje) continue;
    if (t.parcela) parcelado += t.valor;
    else if (t.assinatura) assinaturas += t.valor;
    else variavel += t.valor;
  }

  const diasPassados = Math.max(diasEntre(inicioCiclo, hoje), 1);
  const diasRestantes = Math.max(diasEntre(hoje, fimCiclo), 0);
  const projecaoVariavel = variavel + (variavel / diasPassados) * diasRestantes;

  // Parcelas conhecidas que ainda caem NESTE ciclo: 1 parcela de cada série viva
  // que ainda não apareceu no ciclo. Aproximação honesta: séries com restantes>0
  // lançam 1×/mês — se ainda não lançou no ciclo, vai lançar.
  const jaNoCiclo = parcelado > 0; // parcelas costumam cair juntas no fim do ciclo
  const parcelasQueVemAi = jaNoCiclo ? 0 : parcelasRestantes.reduce((s, p) => s + (p.restantes > 0 ? p.valorParcela : 0), 0);
  const assinaturasQueVemAi = Math.max(assinaturasMensais - assinaturas, 0);

  return {
    ymPagamento, fimCiclo, diasPassados, diasRestantes,
    variavel, parcelado, assinaturas, parcelasQueVemAi, assinaturasQueVemAi,
    projecaoVariavel,
    totalPrevisto: projecaoVariavel + parcelado + parcelasQueVemAi + assinaturas + assinaturasQueVemAi,
  };
}

// ── Bloco 3: a cauda dos meses futuros ───────────────────────────────────────

export interface MesComprometido { ym: string; parcelas: number; assinaturas: number }

export function caudaComprometida(args: {
  parcelasRestantes: Array<{ valorParcela: number; restantes: number }>;
  assinaturasMensais: number;
  ymAtual: string;
  meses?: number;
}): MesComprometido[] {
  const { parcelasRestantes, assinaturasMensais, ymAtual, meses = 12 } = args;
  const out: MesComprometido[] = [];
  for (let k = 1; k <= meses; k++) {
    const parcelas = parcelasRestantes.reduce((s, p) => s + (p.restantes >= k ? p.valorParcela : 0), 0);
    out.push({ ym: ymAdd(ymAtual, k), parcelas, assinaturas: assinaturasMensais });
  }
  return out;
}

// ── Bloco 4: série da poupança incremental ───────────────────────────────────

export interface SobraMes { ym: string; sobra: number; acumulado: number }

export function serieSobras(
  fechamentos: Array<{ mes: string; entradas: number; fixas: number; cartao: number; fechado: boolean }>,
): SobraMes[] {
  const out: SobraMes[] = [];
  let acc = 0;
  for (const f of [...fechamentos].filter(f2 => f2.fechado).sort((a, b) => a.mes.localeCompare(b.mes))) {
    const sobra = f.entradas - f.fixas - f.cartao;
    acc += sobra;
    out.push({ ym: f.mes, sobra, acumulado: acc });
  }
  return out;
}

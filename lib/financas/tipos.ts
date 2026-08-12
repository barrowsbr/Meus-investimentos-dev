// Tipos e parsers das abas MANUAIS de Finanças (financas_pessoal,
// financas_assinaturas, financas_parcelamentos) — client-safe, sem deps.
// Mantêm o formato das abas da planilha da página antiga (compatibilidade).

export interface RowMensal {
  categoria: "entrada" | "saida" | "cartao" | "poupanca";
  nome: string;
  valor: number;
}

export interface Assinatura { nome: string; valor: number; dia: number; ativa: boolean }
export interface Parcelamento { nome: string; valor_total: number; parcelas: number; data_compra: string }
export interface ParcelamentoCalc extends Parcelamento {
  parcelaAtual: number; restantes: number; valorParcela: number; valorRestante: number; quitado: boolean;
}

const num = (v: unknown): number =>
  typeof v === "number" ? v : parseFloat(String(v ?? "0").replace(",", ".")) || 0;

export function parseMensalRows(raw: Record<string, unknown>[]): RowMensal[] {
  if (!raw.length) return defaultMensalRows();
  const result = raw
    .filter(r => r.categoria && r.nome)
    .map(r => ({
      categoria: (String(r.categoria ?? "entrada").toLowerCase().trim()) as RowMensal["categoria"],
      nome: String(r.nome ?? "").trim(),
      valor: num(r.valor),
    }));
  if (!result.some(r => r.categoria === "poupanca")) {
    result.push({ categoria: "poupanca", nome: "Poupança Esperada", valor: 0 });
  }
  return result;
}

export function defaultMensalRows(): RowMensal[] {
  return [
    { categoria: "entrada", nome: "Salário Lucas", valor: 0 },
    { categoria: "entrada", nome: "Benefícios Lucas", valor: 0 },
    { categoria: "entrada", nome: "Salário Maria", valor: 0 },
    { categoria: "entrada", nome: "Benefícios Maria", valor: 0 },
    { categoria: "saida", nome: "Luz", valor: 0 },
    { categoria: "saida", nome: "Gás", valor: 0 },
    { categoria: "saida", nome: "Condomínio", valor: 0 },
    { categoria: "saida", nome: "Aluguel", valor: 0 },
    { categoria: "cartao", nome: "XP", valor: 0 },
    { categoria: "cartao", nome: "Nubank Lucas", valor: 0 },
    { categoria: "cartao", nome: "Nubank Maria", valor: 0 },
    { categoria: "cartao", nome: "AMEX", valor: 0 },
    { categoria: "poupanca", nome: "Poupança Esperada", valor: 0 },
  ];
}

export function parseAssinaturas(raw: Record<string, unknown>[]): Assinatura[] {
  return raw
    .filter(r => r.nome)
    .map(r => {
      const av = r.ativa;
      let ativa = true;
      if (typeof av === "boolean") ativa = av;
      else if (av != null) {
        ativa = !["false", "0", "inativo", "não", "nao"].includes(String(av).toLowerCase().trim());
      }
      return { nome: String(r.nome ?? "").trim(), valor: num(r.valor), dia: Math.trunc(num(r.dia)), ativa };
    });
}

export function parseParcelamentos(raw: Record<string, unknown>[]): Parcelamento[] {
  return raw
    .filter(r => r.nome)
    .map(r => ({
      nome: String(r.nome ?? "").trim(),
      valor_total: num(r.valor_total),
      parcelas: Math.max(Math.trunc(num(r.parcelas)) || 1, 1),
      data_compra: String(r.data_compra ?? "").trim(),
    }));
}

// ── Dinâmica de meses (aba financas_meses) ───────────────────────────────────
// 1 linha por mês (YYYY-MM). Duas metades no MESMO registro:
//   FECHAMENTO — snapshot de como o mês FOI (entradas/fixas/compromissos no
//     momento do fechamento + gasto real do cartão + avaliação e notas);
//   PLANO — o que foi combinado PARA este mês (teto de cartão, meta de aporte
//     e intenções), gravado normalmente no fim do mês anterior.

export interface MesRegistro {
  mes: string;          // YYYY-MM
  fechado: boolean;
  entradas: number;     // snapshot no fechamento
  fixas: number;
  compromissos: number;
  cartao: number;       // gasto real do cartão no mês (registrado ao fechar)
  avaliacao: number;    // 0 = sem nota; 1..5
  notas: string;        // como foi, em texto livre
  tetoCartao: number;   // plano para ESTE mês
  metaAporte: number;
  plano: string;        // intenções para este mês
}

export function mesVazio(mes: string): MesRegistro {
  return { mes, fechado: false, entradas: 0, fixas: 0, compromissos: 0, cartao: 0, avaliacao: 0, notas: "", tetoCartao: 0, metaAporte: 0, plano: "" };
}

export function parseMeses(raw: Record<string, unknown>[]): MesRegistro[] {
  const porMes = new Map<string, MesRegistro>();
  for (const r of raw) {
    const mes = String(r.mes ?? "").trim();
    if (!/^\d{4}-\d{2}$/.test(mes)) continue; // estrito: protege contra aba errada
    porMes.set(mes, {
      mes,
      fechado: ["true", "1", "sim"].includes(String(r.fechado ?? "").toLowerCase().trim()),
      entradas: num(r.entradas),
      fixas: num(r.fixas),
      compromissos: num(r.compromissos),
      cartao: num(r.cartao),
      avaliacao: Math.max(0, Math.min(5, Math.trunc(num(r.avaliacao)))),
      notas: String(r.notas ?? "").trim(),
      tetoCartao: num(r.teto_cartao ?? r.tetocartao),
      metaAporte: num(r.meta_aporte ?? r.metaaporte),
      plano: String(r.plano ?? "").trim(),
    });
  }
  return [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

/** Soma meses a um YYYY-MM (delta pode ser negativo). */
export function ymAdd(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + delta;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Progresso de um parcelamento MANUAL a partir da data de compra. */
export function calcParcelamento(p: Parcelamento, hoje = new Date()): ParcelamentoCalc {
  let dt: Date = hoje;
  try {
    const s = p.data_compra;
    if (s.includes("-")) {
      const [y, m, d] = s.split("-").map(Number);
      dt = new Date(y, m - 1, d);
    } else if (s.includes("/")) {
      const parts = s.split("/");
      if (parts.length === 3) dt = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    }
    if (isNaN(dt.getTime())) dt = hoje;
  } catch { dt = hoje; }

  const monthsElapsed = (hoje.getFullYear() - dt.getFullYear()) * 12 + (hoje.getMonth() - dt.getMonth());
  const n = Math.max(p.parcelas, 1);
  const quitado = monthsElapsed >= n;
  const parcelaAtual = Math.max(Math.min(monthsElapsed + 1, n), 1);
  const restantes = Math.max(n - parcelaAtual, 0);
  const valorParcela = p.valor_total / n;
  const valorRestante = !quitado ? valorParcela * (restantes + 1) : 0;
  return { ...p, parcelaAtual, restantes, valorParcela, valorRestante, quitado };
}

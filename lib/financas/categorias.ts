// Categorização e detecção automática nos lançamentos do cartão — PURO.
//
// A categoria automática é por palavra-chave do estabelecimento (regra simples,
// auditável). O dono pode recategorizar na aba Cartão: a escolha vira uma REGRA
// por estabelecimento (aba cartao_categorias) que vence a automática — inclusive
// para importações futuras do mesmo lugar.

import type { TransacaoCartao } from "./ofx";

export const CATEGORIAS = [
  "Mercado", "Alimentação", "Transporte", "Combustível", "Pets", "Saúde",
  "Assinaturas", "Compras", "Beleza & Cuidados", "Lazer", "Tarifas & IOF",
  "Pagamento", "Outros",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const COR_CATEGORIA: Record<Categoria, string> = {
  Mercado: "#34d399", "Alimentação": "#f59e0b", Transporte: "#38bdf8", "Combustível": "#818cf8",
  Pets: "#f472b6", "Saúde": "#f87171", Assinaturas: "#a78bfa", Compras: "#fbbf24",
  "Beleza & Cuidados": "#e879f9", Lazer: "#2dd4bf", "Tarifas & IOF": "#94a3b8",
  Pagamento: "#4ade80", Outros: "#71717a",
};

/** Nome "canônico" do estabelecimento: sem prefixos de adquirente, sem sufixo
 *  de parcela, minúsculo — é a chave das regras e das detecções. */
export function normalizarEstabelecimento(memo: string): string {
  return memo
    .replace(/\s*-\s*Parcela\s+\d+\/\d+\s*$/i, "")
    .replace(/\s*-\s*NuPay\s*$/i, "")
    .replace(/^(ifd|mp|ebn|pag|pg|mercadopago)\s*\*\s*/i, "")
    .replace(/\*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Ordem importa: a primeira regra que casar vence.
const REGRAS_AUTO: Array<[RegExp, Categoria]> = [
  [/pagamento recebido/i, "Pagamento"],
  [/estorno|iof de volta/i, "Tarifas & IOF"],
  [/\biof\b|anuidade|juros|multa|tarifa/i, "Tarifas & IOF"],
  [/anthropic|claude|openai|chatgpt|google (one|youtubepremium|storage)|youtube ?premium|netflix|spotify|disney|hbo|max\b|prime ?video|icloud|apple\.com|deezer|globoplay|paramount|crunchyroll/i, "Assinaturas"],
  [/carrefour|mambo|spazio|p[aã]o de a[cç][uú]car|extra\b|dia\b|assai|atacad|mercado|sacol[aã]o|hortifruti|emp[oó]rio|supermerc/i, "Mercado"],
  [/ifd\*|ifood|restaurante|lanche|pizza|burger|hamburg|padaria|cafe|caf[eé]\b|gelateria|sorvet|esfiha|sushi|temaki|churrasc|bar\b|boteco|doceria|doce|confeitaria|zigpay|food|cozinha|trattoria|cantina|bistro|quintal|saborarte|tabac/i, "Alimentação"],
  [/auto posto|posto\b|combust|ipiranga|shell|petrobras|br mania|ale\b/i, "Combustível"],
  [/uber|99app|99\*|taxi|nutag|pedagio|ped[aá]gio|rodoanel|estacion|parkimetro|park\b|valet|metr[oô]|cptm|bilhete/i, "Transporte"],
  [/petz|cobasi|petlove|pet\b|veterin|bestpaws|racao|ra[cç][aã]o/i, "Pets"],
  [/drogasil|drogaria|farmacia|farm[aá]cia|pague menos|panvel|raia|clinica|cl[ií]nica|hospital|laborat|exame|dentista|medic/i, "Saúde"],
  [/barbearia|barber|salao|sal[aã]o|estetica|est[eé]tica|manicure|spa\b|cuca/i, "Beleza & Cuidados"],
  [/cinema|cinemark|ingresso|show|teatro|steam|playstation|xbox|nintendo|epic games|riot/i, "Lazer"],
  [/amazon|mercadolivre|meli|shopee|aliexpress|magalu|magazine|americanas|casas bahia|pernambucanas|renner|hering|c&a|riachuelo|zara|nike|adidas|centauro|decathlon|leroy|telha|pichau|kabum|terabyte|shopping|loja|lj\b/i, "Compras"],
  [/tokio marine|porto seguro|seguro|azul seguros|allianz|bradesco seguros/i, "Outros"],
];

export function categorizarAuto(memo: string): Categoria {
  for (const [re, cat] of REGRAS_AUTO) if (re.test(memo)) return cat;
  return "Outros";
}

/** Categoria efetiva: regra manual do dono (por estabelecimento) vence a automática. */
export function categoriaEfetiva(memo: string, regras: Map<string, string>): string {
  const manual = regras.get(normalizarEstabelecimento(memo));
  if (manual && (CATEGORIAS as readonly string[]).includes(manual)) return manual;
  return categorizarAuto(memo);
}

// ── Assinaturas detectadas ───────────────────────────────────────────────────

export interface AssinaturaDetectada {
  nome: string;              // estabelecimento normalizado (exibível)
  valorMensal: number;       // última cobrança (positivo)
  ultimaData: string;
  ocorrencias: number;
  meses: number;             // meses distintos com cobrança
}

const RE_ASSINATURA_CONHECIDA = REGRAS_AUTO.find(([, c]) => c === "Assinaturas")![0];

/**
 * Assinatura = cobrança RECORRENTE: mesmo estabelecimento em ≥2 meses distintos
 * com valor estável (±10% ou ±R$ 3), sem parcela. Serviços de assinatura
 * CONHECIDOS (Google One, Claude, Netflix…) entram já na 1ª cobrança — com um
 * arquivo só de 30 dias ainda não há recorrência observável, mas a natureza do
 * estabelecimento é inequívoca. A base cresce a cada importação.
 */
export function detectarAssinaturas(transacoes: TransacaoCartao[]): AssinaturaDetectada[] {
  const porNome = new Map<string, TransacaoCartao[]>();
  for (const t of transacoes) {
    if (t.valor >= 0 || t.parcela) continue;
    if (/pagamento recebido|estorno|iof/i.test(t.descricao)) continue;
    const nome = normalizarEstabelecimento(t.descricao);
    if (!nome) continue;
    porNome.set(nome, [...(porNome.get(nome) ?? []), t]);
  }

  const out: AssinaturaDetectada[] = [];
  for (const [nome, ts] of porNome) {
    const meses = new Set(ts.map((t) => t.data.slice(0, 7)));
    const ultima = ts.reduce((a, b) => (a.data > b.data ? a : b));
    const valores = ts.map((t) => -t.valor);
    const vMin = Math.min(...valores);
    const vMax = Math.max(...valores);
    const estavel = vMax - vMin <= Math.max(3, vMax * 0.1);
    const conhecida = RE_ASSINATURA_CONHECIDA.test(ultima.descricao);
    const recorrente = meses.size >= 2 && estavel;
    if (!recorrente && !conhecida) continue;
    out.push({
      nome,
      valorMensal: -ultima.valor,
      ultimaData: ultima.data,
      ocorrencias: ts.length,
      meses: meses.size,
    });
  }
  return out.sort((a, b) => b.valorMensal - a.valorMensal);
}

// ── Parcelamentos detectados ─────────────────────────────────────────────────

export interface ParcelamentoDetectado {
  nome: string;
  valorParcela: number;      // positivo
  totalParcelas: number;
  parcelaAtual: number;      // maior parcela vista
  restantes: number;
  valorTotal: number;        // valorParcela × total
  valorRestante: number;
  fimPrevisto: string;       // yyyy-mm do fim (mês da última vista + restantes)
  ultimaData: string;
}

export function detectarParcelamentos(transacoes: TransacaoCartao[]): ParcelamentoDetectado[] {
  const porCompra = new Map<string, TransacaoCartao[]>();
  for (const t of transacoes) {
    if (!t.parcela || t.valor >= 0) continue;
    // chave = estabelecimento + total de parcelas + valor da parcela (2 compras
    // diferentes no mesmo lugar com mesmo plano são raras; valor separa a maioria)
    const k = `${normalizarEstabelecimento(t.descricao)}|${t.parcela.total}|${(-t.valor).toFixed(2)}`;
    porCompra.set(k, [...(porCompra.get(k) ?? []), t]);
  }

  const out: ParcelamentoDetectado[] = [];
  for (const ts of porCompra.values()) {
    const ultima = ts.reduce((a, b) => (a.parcela!.n > b.parcela!.n ? a : b));
    const total = ultima.parcela!.total;
    const atual = ultima.parcela!.n;
    const valorParcela = -ultima.valor;
    const restantes = Math.max(0, total - atual);
    const [y, m] = ultima.data.slice(0, 7).split("-").map(Number);
    const fim = new Date(Date.UTC(y, m - 1 + restantes, 1));
    out.push({
      nome: normalizarEstabelecimento(ultima.descricao),
      valorParcela,
      totalParcelas: total,
      parcelaAtual: atual,
      restantes,
      valorTotal: valorParcela * total,
      valorRestante: valorParcela * restantes,
      fimPrevisto: `${fim.getUTCFullYear()}-${String(fim.getUTCMonth() + 1).padStart(2, "0")}`,
      ultimaData: ultima.data,
    });
  }
  return out.sort((a, b) => b.valorRestante - a.valorRestante);
}

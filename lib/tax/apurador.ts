// ─────────────────────────────────────────────────────────────────────────────
// Apurador: transforma eventos realizados em apuração MENSAL (B3) e ANUAL
// (exterior — Lei 14.754/23), com:
//  • Isenção de R$20k/mês SOMENTE para ações (ETF/BDR/FII nunca isentos).
//  • Compensação de prejuízo em BUCKETS isolados (swing ≠ day ≠ fii ≠ exterior),
//    com carry-forward indefinido.
//  • Alíquotas e regras puxadas do rule engine datado (rules.ts).
// ─────────────────────────────────────────────────────────────────────────────

import type { RealizedEvent } from "./engine";
import { regra, vencimentoDarf, type OffsetBucket } from "./rules";

export interface BucketResult {
  bucket: OffsetBucket;
  resultado: number;        // resultado líquido do mês (BRL)
  isento: boolean;          // ganho isento (ações ≤ R$20k) — só swing
  prejuizoAcumIni: number;
  baseTributavel: number;
  prejuizoAcumFim: number;
  aliquota: number;
  irDevido: number;
}

export interface MesApuracao {
  mes: string;              // YYYY-MM
  acoesVendas: number;      // total alienado em AÇÕES no mês (BRL)
  acoesResultado: number;
  etfBdrResultado: number;
  fiiResultado: number;
  dayResultado: number;
  isencaoAcoes: boolean;
  buckets: BucketResult[];
  irTotal: number;
  darfCodigo: string;
  vencimento: string;
  irrfDedoDuro: number;     // IRRF estimado (1% day-trade) — dedutível do DARF
}

export interface AnoExterior {
  ano: string;
  resultado: number;        // BRL (já convertido por PTAX nos eventos)
  prejuizoAcumIni: number;
  baseTributavel: number;
  prejuizoAcumFim: number;
  aliquota: number;
  irDevido: number;
}

export interface Apuracao {
  meses: MesApuracao[];
  exterior: AnoExterior[];
  prejuizoFinal: Record<OffsetBucket, number>;
  irTotalMensal: number;
  irTotalExterior: number;
}

// ─── Apuração mensal (B3: swing/day/fii) ──────────────────────────────────────

export function apurar(events: RealizedEvent[]): Apuracao {
  const mensais = events.filter(e => e.modalidade !== "exterior" && e.modalidade !== "rf");
  const exteriores = events.filter(e => e.modalidade === "exterior");

  // ── Mensal ──
  const meses = [...new Set(mensais.map(e => e.month))].sort();
  const prejuizo: Record<OffsetBucket, number> = { swing: 0, day: 0, fii: 0, exterior: 0, rf: 0 };
  const mesesOut: MesApuracao[] = [];

  for (const mes of meses) {
    const ref = `${mes}-01`;
    const evs = mensais.filter(e => e.month === mes);

    const acoesEvs = evs.filter(e => e.modalidade === "acoes_swing");
    const etfBdrEvs = evs.filter(e => e.modalidade === "etf_acoes" || e.modalidade === "bdr");
    const fiiEvs = evs.filter(e => e.modalidade === "fii");
    const dayEvs = evs.filter(e => e.modalidade === "day_trade");

    const acoesVendas = acoesEvs.reduce((s, e) => s + e.proceedsBRL, 0);
    const acoesResultado = acoesEvs.reduce((s, e) => s + e.gainBRL, 0);
    const etfBdrResultado = etfBdrEvs.reduce((s, e) => s + e.gainBRL, 0);
    const fiiResultado = fiiEvs.reduce((s, e) => s + e.gainBRL, 0);
    const dayResultado = dayEvs.reduce((s, e) => s + e.gainBRL, 0);

    // Isenção: só AÇÕES, e só se total alienado em ações ≤ limite.
    const limite = regra("acoes_swing", ref).isencaoMensalVendas ?? 0;
    const isencaoAcoes = acoesVendas > 0 && acoesVendas <= limite;
    // Se isento, o resultado das ações (ganho OU prejuízo) é descartado.
    const acoesParaBucket = isencaoAcoes ? 0 : acoesResultado;

    const buckets: BucketResult[] = [];
    // swing = ações (se não isento) + ETF + BDR
    buckets.push(computeBucket("swing", acoesParaBucket + etfBdrResultado, regra("acoes_swing", ref).aliquota, prejuizo, isencaoAcoes && etfBdrResultado === 0));
    // day trade
    if (dayEvs.length > 0) buckets.push(computeBucket("day", dayResultado, regra("day_trade", ref).aliquota, prejuizo, false));
    // fii
    if (fiiEvs.length > 0) buckets.push(computeBucket("fii", fiiResultado, regra("fii", ref).aliquota, prejuizo, false));

    const irTotal = buckets.reduce((s, b) => s + b.irDevido, 0);
    const irrfDedoDuro = dayEvs.reduce((s, e) => s + Math.max(0, e.gainBRL), 0) * 0.01;

    mesesOut.push({
      mes, acoesVendas, acoesResultado, etfBdrResultado, fiiResultado, dayResultado,
      isencaoAcoes, buckets, irTotal,
      darfCodigo: regra("acoes_swing", ref).darfCodigo ?? "6015",
      vencimento: vencimentoDarf(mes),
      irrfDedoDuro,
    });
  }

  // ── Anual: exterior (Lei 14.754/23 a partir de 2024; antes, mensal — aqui
  //    consolidamos por ano, que é como a declaração trata) ──
  const anos = [...new Set(exteriores.map(e => e.year))].sort();
  const exteriorOut: AnoExterior[] = [];
  for (const ano of anos) {
    const ref = `${ano}-01-01`;
    const resultado = exteriores.filter(e => e.year === ano).reduce((s, e) => s + e.gainBRL, 0);
    const aliquota = regra("exterior", ref).aliquota;
    const prejuizoAcumIni = prejuizo.exterior;
    let base = resultado - prejuizoAcumIni;
    let prejuizoAcumFim = 0;
    if (base < 0) { prejuizoAcumFim = -base; base = 0; }
    prejuizo.exterior = prejuizoAcumFim;
    exteriorOut.push({
      ano, resultado, prejuizoAcumIni, baseTributavel: base, prejuizoAcumFim,
      aliquota, irDevido: base * aliquota,
    });
  }

  return {
    meses: mesesOut,
    exterior: exteriorOut,
    prejuizoFinal: prejuizo,
    irTotalMensal: mesesOut.reduce((s, m) => s + m.irTotal, 0),
    irTotalExterior: exteriorOut.reduce((s, a) => s + a.irDevido, 0),
  };
}

function computeBucket(
  bucket: OffsetBucket, resultado: number, aliquota: number,
  prejuizo: Record<OffsetBucket, number>, isento: boolean,
): BucketResult {
  const prejuizoAcumIni = prejuizo[bucket];
  if (isento) {
    return { bucket, resultado, isento: true, prejuizoAcumIni, baseTributavel: 0, prejuizoAcumFim: prejuizoAcumIni, aliquota, irDevido: 0 };
  }
  let base = resultado - prejuizoAcumIni;
  let prejuizoAcumFim = 0;
  if (base < 0) { prejuizoAcumFim = -base; base = 0; }
  prejuizo[bucket] = prejuizoAcumFim;
  return { bucket, resultado, isento: false, prejuizoAcumIni, baseTributavel: base, prejuizoAcumFim, aliquota, irDevido: base * aliquota };
}

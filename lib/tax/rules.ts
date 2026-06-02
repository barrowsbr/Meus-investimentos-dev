// ─────────────────────────────────────────────────────────────────────────────
// Motor de regras tributárias DATADO (compra/venda de investimentos — PF Brasil)
//
// Por que datado? A tributação de investimentos no Brasil muda com frequência
// (Lei 14.754/2023 alterou o exterior a partir de 2024; há propostas de unificar
// alíquotas em 2026). Em vez de "hard-coded", cada conjunto de regras vale por um
// período (`effectiveFrom`/`effectiveTo`). Para refletir uma nova lei, adiciona-se
// um ruleset — não se reescreve a lógica.
//
// Escopo: ALIENAÇÃO (ganho de capital). Aporte/entrada de capital NÃO é fato
// gerador e é ignorado.
// ─────────────────────────────────────────────────────────────────────────────

/** Classe do ativo, derivada de ticker/moeda/corretora. */
export type AssetClass =
  | "acoes"       // ações à vista B3
  | "fii"         // fundos imobiliários / Fiagro
  | "etf_acoes"   // ETF de ações B3
  | "bdr"         // BDR
  | "exterior"    // ativo no exterior (IBKR etc.) — Lei 14.754/23
  | "rf";         // renda fixa (tributada na fonte)

/** Modalidade de apuração de uma OPERAÇÃO (já considera dia-trade vs swing). */
export type Modalidade =
  | "acoes_swing"
  | "etf_acoes"
  | "bdr"
  | "fii"
  | "day_trade"
  | "exterior"
  | "rf";

/** Bucket de compensação de prejuízo — prejuízo só compensa dentro do mesmo bucket. */
export type OffsetBucket = "swing" | "day" | "fii" | "exterior" | "rf";

export interface ModalidadeRule {
  aliquota: number;                 // alíquota do ganho líquido (ex.: 0.15)
  offsetBucket: OffsetBucket;       // com quem o prejuízo se compensa
  apuracao: "mensal" | "anual";     // periodicidade da apuração
  /** Isenção: se o total de ALIENAÇÕES da classe isentável no mês ≤ este valor,
   *  o ganho daquela classe é isento (e o prejuízo não é compensável). */
  isencaoMensalVendas?: number;
  /** A classe goza da isenção mensal? (só ações à vista — ETF/BDR/FII não gozam.) */
  isentavel?: boolean;
  darfCodigo?: string;              // código do DARF (ex.: "6015")
  irrfPercent?: number;             // IR retido na fonte ("dedo-duro" day trade = 1%)
}

export interface TaxRuleset {
  effectiveFrom: string;            // "YYYY-MM-DD" inclusive
  effectiveTo?: string;             // "YYYY-MM-DD" inclusive (undefined = vigente)
  label: string;
  fonte: string;                    // base legal
  modalidades: Record<Modalidade, ModalidadeRule>;
}

// ─── Vencimento do DARF: último dia útil do mês seguinte ao fato gerador ──────
export function vencimentoDarf(mesApuracao: string): string {
  // mesApuracao = "YYYY-MM" → último dia útil do mês seguinte
  const [y, m] = mesApuracao.split("-").map(Number);
  const proximo = new Date(Date.UTC(y, m, 1)); // 1º dia do mês seguinte (m é 1-based → Date 0-based já avança)
  const ultimoDia = new Date(Date.UTC(proximo.getUTCFullYear(), proximo.getUTCMonth() + 1, 0));
  // recua para o último dia útil
  while (ultimoDia.getUTCDay() === 0 || ultimoDia.getUTCDay() === 6) {
    ultimoDia.setUTCDate(ultimoDia.getUTCDate() - 1);
  }
  return ultimoDia.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// RULESETS
// ─────────────────────────────────────────────────────────────────────────────

// Regra base B3 (vigente há anos e mantida) + exterior no regime ANTIGO
// (ganho de capital, isenção de pequeno valor R$35k/mês), válido até 2023.
const RULESET_ATE_2023: TaxRuleset = {
  effectiveFrom: "2000-01-01",
  effectiveTo: "2023-12-31",
  label: "B3 padrão + exterior (ganho de capital até 2023)",
  fonte: "Lei 11.033/2004; IN RFB 1.585/2015; IN SRF 118/2000",
  modalidades: {
    acoes_swing: { aliquota: 0.15, offsetBucket: "swing", apuracao: "mensal", isencaoMensalVendas: 20000, isentavel: true, darfCodigo: "6015", irrfPercent: 0.00005 },
    etf_acoes:   { aliquota: 0.15, offsetBucket: "swing", apuracao: "mensal", isentavel: false, darfCodigo: "6015", irrfPercent: 0.00005 },
    bdr:         { aliquota: 0.15, offsetBucket: "swing", apuracao: "mensal", isentavel: false, darfCodigo: "6015", irrfPercent: 0.00005 },
    fii:         { aliquota: 0.20, offsetBucket: "fii",   apuracao: "mensal", isentavel: false, darfCodigo: "6015" },
    day_trade:   { aliquota: 0.20, offsetBucket: "day",   apuracao: "mensal", isentavel: false, darfCodigo: "6015", irrfPercent: 0.01 },
    exterior:    { aliquota: 0.15, offsetBucket: "exterior", apuracao: "mensal", isencaoMensalVendas: 35000, isentavel: true, darfCodigo: "4600" },
    rf:          { aliquota: 0.15, offsetBucket: "rf", apuracao: "mensal" }, // na fonte (tabela regressiva — ver rfAliquotaRegressiva)
  },
};

// A partir de 01/01/2024: Lei 14.754/2023 muda o EXTERIOR — aplicações
// financeiras no exterior passam a 15% ANUAL, sem isenção de pequeno valor,
// apuradas na declaração anual. B3 segue igual.
const RULESET_2024: TaxRuleset = {
  effectiveFrom: "2024-01-01",
  label: "B3 padrão + exterior 15% anual (Lei 14.754/2023)",
  fonte: "Lei 14.754/2023; Lei 11.033/2004; IN RFB 1.585/2015",
  modalidades: {
    acoes_swing: { aliquota: 0.15, offsetBucket: "swing", apuracao: "mensal", isencaoMensalVendas: 20000, isentavel: true, darfCodigo: "6015", irrfPercent: 0.00005 },
    etf_acoes:   { aliquota: 0.15, offsetBucket: "swing", apuracao: "mensal", isentavel: false, darfCodigo: "6015", irrfPercent: 0.00005 },
    bdr:         { aliquota: 0.15, offsetBucket: "swing", apuracao: "mensal", isentavel: false, darfCodigo: "6015", irrfPercent: 0.00005 },
    fii:         { aliquota: 0.20, offsetBucket: "fii",   apuracao: "mensal", isentavel: false, darfCodigo: "6015" },
    day_trade:   { aliquota: 0.20, offsetBucket: "day",   apuracao: "mensal", isentavel: false, darfCodigo: "6015", irrfPercent: 0.01 },
    // Exterior: 15% ANUAL, sem isenção, apuração anual na DAA. DARF 4600 (ganhos no exterior).
    exterior:    { aliquota: 0.15, offsetBucket: "exterior", apuracao: "anual", isentavel: false, darfCodigo: "4600" },
    rf:          { aliquota: 0.15, offsetBucket: "rf", apuracao: "mensal" },
  },
};

// NOTA: quando/se a unificação de 2026 (proposta — MP 1.303/2025 e afins) virar lei,
// basta adicionar aqui um RULESET_2026 com effectiveFrom "2026-01-01" e as novas
// alíquotas (ex.: 17,5% e fim da isenção de R$20k). Nenhuma outra mudança no motor.

const RULESETS: TaxRuleset[] = [RULESET_ATE_2023, RULESET_2024].sort(
  (a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)
);

/** Retorna o ruleset vigente em uma data "YYYY-MM-DD". */
export function rulesetParaData(dateISO: string): TaxRuleset {
  let escolhido = RULESETS[0];
  for (const rs of RULESETS) {
    if (rs.effectiveFrom <= dateISO && (!rs.effectiveTo || dateISO <= rs.effectiveTo)) {
      escolhido = rs;
    }
  }
  return escolhido;
}

/** Regra de uma modalidade na data informada. */
export function regra(modalidade: Modalidade, dateISO: string): ModalidadeRule {
  return rulesetParaData(dateISO).modalidades[modalidade];
}

// ─── Renda fixa: tabela regressiva (IRRF na fonte) ───────────────────────────
// Aplica-se sobre o RENDIMENTO no resgate, conforme prazo da aplicação.
export function rfAliquotaRegressiva(diasCorridos: number): number {
  if (diasCorridos <= 180) return 0.225;
  if (diasCorridos <= 360) return 0.20;
  if (diasCorridos <= 720) return 0.175;
  return 0.15;
}

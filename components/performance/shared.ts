"use client";

// Extraído de app/performance/page.tsx — tipos, constantes e helpers de data
// compartilhados entre a página de Performance e seus componentes.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Summary {
  twrTotal: number;
  twrAnualizado: number;
  mwr: number;
  navFinal: number;
  navInicial: number;
  totalInvestido: number;
  custoPosicoesAtuais?: number;
  patrimonio?: { total: number; rv: number; rf: number; caixa: number; divida?: number; net?: number; alavancagemPct?: number };
  filtros?: { classe: string; setor: string; ticker: string; corretora: string; rvSetores: string[]; tickers: string[]; tickerSectors: Record<string, string>; corretoras: string[]; temCripto: boolean; temRF: boolean };
  duracaoAnos: number;
  primeiraData: string;
  ultimaData: string;
  vsCDI: number;
  vsIBOV: number;
  vsSP500BRL?: number;
  vsSP500?: number;
  cdiTotal: number;
  ibovTotal: number;
  sp500BrlTotal?: number;
  sp500Total?: number;
  maxDrawdown: number;
  volatility: number;
  sharpe: number;
  sortino: number;
  var95: number;
  var99: number;
  riskFreeRate?: number;
  ganhoEconomico: number;
  ganhoDecomposicao?: {
    navFinal: number; navInicial: number; flowsFromFirst: number;
    firstMeaningfulFlow: number; incomeFromFirst: number;
    forceZeroDays: number;
  };
  resultadoTotal?: number;
  resultadoTotalPct?: number;
  custoFIFOSnapshot?: number;
  peakDate?: string;
  troughDate?: string;
  peakTwr?: number;
  troughTwr?: number;
}

export interface ChartPoint { date: string; nav: number; flow?: number; ret: number; twr: number; mwr_twr?: number | null; cdi_twr?: number | null; ibov_twr?: number | null; sp500_twr?: number | null; fx_twr?: number | null; ativo_twr?: number | null; ativo_mwr?: number | null }
export interface DrawdownPoint { date: string; drawdown: number; nav: number }
export interface RollingPoint { date: string; "1M": number; "3M": number; "6M": number; "1A": number }
export interface MonthlyReturn { month: string; return_pct: number }
export interface MonthlyMTM { month: string; gain: number; gainPct: number; navEnd: number }
export interface FlowEntry { date: string; flow: number; nav: number; nav_before: number; daily_return: number; cumulative_twr: number }
export interface AttributionEntry { setor: string; macro: string; contrib_pct: number; nav_medio: number }

export interface UsdView {
  summary: Summary;
  chart: ChartPoint[];
  monthlyReturns: MonthlyReturn[];
  monthlyLocked?: string[];
  monthlyMTM?: MonthlyMTM[];
  fxDecomposition?: { r_total: number; r_ativo: number; r_fx: number; r_combinado: number };
}

export interface PerformanceResponse {
  summary: Summary;
  chart: ChartPoint[];
  benchmarks: { cdi: ChartPoint[]; ibov: ChartPoint[]; sp500brl?: ChartPoint[] };
  drawdownData: DrawdownPoint[];
  rolling: RollingPoint[];
  monthlyReturns: MonthlyReturn[];
  monthlyLocked?: string[];
  monthlyDivergencias?: Array<{ month: string; locked: number; computado: number }>;
  monthlyMTM?: MonthlyMTM[];
  flowLedger: FlowEntry[];
  attribution: AttributionEntry[];
  fxDecomposition: { r_total: number; r_ativo: number; r_fx: number; r_combinado: number };
  usdView: UsdView | null;
  errors: string[];
  lookback: number;
}

export interface DecomposicaoBucket {
  currency: string;
  valor_brl: number;
  custo_brl: number;
  ganho_ativo_brl: number;
  ganho_cambio_brl: number;
  retorno_ativo_pct: number;
  retorno_cambio_pct: number;
  retorno_total_pct: number;
  num_positions: number;
}

export interface DecomposicaoResponse {
  buckets: DecomposicaoBucket[];
  total: {
    valor_brl: number;
    custo_brl: number;
    ganho_ativo_brl: number;
    ganho_cambio_brl: number;
    retorno_ativo_pct: number;
    retorno_cambio_pct: number;
  };
}

// ── Rentabilidade types ──────────────────────────────────────────────────────

export interface RentabilidadeItem { ticker: string; setor: string; macro: string; moeda: string; status: string; valor_atual_brl: number; custo_brl: number; lucro_nao_realizado_brl: number; lucro_realizado_brl: number; proventos_brl: number; resultado_total_brl: number; imposto_brl: number; retorno_nao_realizado_pct: number; retorno_realizado_proventos_pct: number; retorno_total_pct: number; valor_atual_native?: number; lucro_nao_realizado_native?: number; lucro_realizado_native?: number; proventos_native?: number; resultado_total_native?: number }
export interface RiscoRetornoItem { ticker: string; setor: string; macro: string; valor_atual_brl: number; retorno_acumulado: number }

// ── Tipos derivados na página (compartilhados com os componentes) ────────────

// Linha do gráfico principal (chartData — chart mapeado em % na página)
export interface ChartRow { date: string; fullDate: string; portfolio: number; mwr: number | null; cdi: number | null; ibov: number | null; sp500: number | null; nav: number; ret: number | null; fx: number | null; ativo: number | null; ativoMwr: number | null }

// Paleta canônica das linhas do gráfico — hex sólido (necessário p/ os
// swatches da legenda-filtro, que concatenam alpha). Uma cor por série, sem
// colisões entre as séries exibidas simultaneamente.
export interface ChartPalette { twr: string; mwr: string; cdi: string; ibov: string; sp500: string; ativo: string; ativoMwr: string; fx: string }

// Ganho econômico / MTM — FONTE ÚNICA (geInfo na página)
export interface GeInfo { value: number; loading: boolean }

// ── Constants ─────────────────────────────────────────────────────────────────

export const TOOLTIP_STYLE = {
  background: "#09090b",
  border: "1px solid #27272a",
  borderRadius: 12,
  color: "var(--text)",
  fontSize: 12,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatDate(s: string) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateShort(s: string) {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y?.slice(2)}`;
}

export function formatDuracao(anos: number): string {
  if (anos < 0.1) return "< 1 mês";
  if (anos < 1) return `${Math.round(anos * 12)} meses`;
  const y = Math.floor(anos);
  const m = Math.round((anos - y) * 12);
  return m > 0 ? `${y}a ${m}m` : `${y} ano${y > 1 ? "s" : ""}`;
}

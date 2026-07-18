"use client";

// Extraído de app/resumo/page.tsx — tipos, constantes e helpers compartilhados
// pelos componentes do Resumo (components/resumo/*).

import { SETOR_ECONOMICO_COLORS } from "@/lib/gics-sectors";
import type { CountryAllocation } from "@/lib/ticker-country";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Performer { ticker: string; lucro_pct: number; setor: string }
export interface ParetoItem { ticker: string; setor: string; macro: string; valor_brl: number; pct: number; acumulado_pct: number }
export interface RentabilidadeItem { ticker: string; setor: string; macro: string; moeda: string; status: string; valor_atual_brl: number; custo_brl: number; lucro_nao_realizado_brl: number; lucro_realizado_brl: number; proventos_brl: number; resultado_total_brl: number; imposto_brl: number; retorno_nao_realizado_pct: number; retorno_realizado_proventos_pct: number; retorno_total_pct: number }
export interface RiscoRetornoItem { ticker: string; setor: string; macro: string; valor_atual_brl: number; retorno_acumulado: number }
export interface LookThroughComp { ativo: string; name?: string; peso: number }
export interface LookThroughETF { ticker: string; valor_brl: number; components: LookThroughComp[] }
export interface TreeNode { name: string; value: number; pct: number; children?: TreeNode[] }
export interface RfPosicao { ticker: string; setor: string; macro: string; valor_brl: number; moeda: string; corretora: string; pais: string; is_caixa: boolean }

export interface SetorPosition { ticker: string; nome: string; setor: string; setorEconomico: string; industry: string; valorBRL: number; custoTotalBRL: number; lucroBRL: number; lucroPct: number; retornoTotalPct: number; moeda: string; tipo: string }
export interface SetorAgg { setor: string; valorBRL: number; pct: number; posicoes: SetorPosition[] }
export interface SetoresApiData { totalBRL: number; rvBRL: number; rfBRL: number; sectors: SetorAgg[]; positions: SetorPosition[]; lookthrough?: { supported: string[]; unsupported: string[]; sources: Record<string, string> } }

export interface ComposicaoData {
  computed_at: string;
  fx: { USDBRL: number; EURBRL: number; CADBRL: number; GBPBRL: number };
  resumo: { total_portfolio: number; rv_value: number; rf_value: number; total_proventos: number; lucro_total_brl: number; top_performer: Performer | null; bottom_performer: Performer | null };
  estrutura_carteira: TreeNode[];
  exposicao_cambial: Record<string, number>;
  custodia: { brasil: number; exterior: number; brasil_pct: number; exterior_pct: number };
  rentabilidade: RentabilidadeItem[];
  risco_retorno: RiscoRetornoItem[];
  pareto: ParetoItem[];
  look_through: { supported: string[]; unsupported: string[]; compositions: Record<string, LookThroughETF>; total_look_through_brl: number; sources?: Record<string, string>; updated_at?: string };
  country_allocation?: CountryAllocation[];
  rf_posicoes?: RfPosicao[];
  errors: string[];
}

// Estatísticas setoriais (concentração, HHI) — shape do useMemo `setoresStats`
// da página, compartilhado pelos componentes da aba Alocação.
export interface SetoresStats { sorted: SetorAgg[]; top3: number; top5: number; effN: number }

// Resposta de /api/portfolio/historico — shape do estado `histData` da página.
export interface HistoricoData {
  date: string;
  priceDate: string | null;
  fxRate: number | null;
  rendaVariavel: { ticker: string; quantidade: number; custoMedio: number; moeda: string; precoHistorico: number | null; valorHistorico: number | null }[];
  rendaFixa: { ticker: string; tipo: string; valorInvestido: number; moeda: string }[];
  resumo: { totalRV_BRL: number; totalRF_BRL: number; totalBRL: number };
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const MACRO_MAP: Record<string, string> = {
  "Ações Brasil": "Brasil", "FIIs": "Brasil", "BDRs": "Brasil", "ETF": "Brasil",
  "Ações Internacional": "Exterior", "ETF USA": "Exterior",
  "Renda Fixa": "Renda Fixa", "Renda Fixa USD": "Renda Fixa",
  "Commodities": "Commodities", "Cripto": "Cripto",
};

export const SECTOR_COLORS: Record<string, string> = {
  "Ações Brasil": "#db2777", "Ações Internacional": "#8b5cf6", "Ações EUA": "#8b5cf6", "Ações Mundo": "#a78bfa",
  "ETF USA": "#06b6d4", "ETFs": "#6366f1", "ETF": "#6366f1",
  "FIIs": "#f97316", "Cripto": "#eab308",
  "Commodities": "#84cc16", "BDRs": "#a855f7", "Renda Fixa": "#0f766e", "Renda Fixa USD": "#1d4ed8",
  "Tesouro Direto": "#10b981", "CDBs": "#0ea5e9", "LCI/LCA": "#06b6d4", "Debêntures": "#3b82f6", "Caixa": "#64748b",
};

export const CURRENCY_COLORS: Record<string, string> = {
  BRL: "#3b82f6", USD: "#10b981", "USD (RF)": "#1d4ed8", EUR: "#8b5cf6", GBP: "#f59e0b", CAD: "#ef4444", Cripto: "#f97316",
};

export const TOOLTIP_STYLE = {
  background: "#13141A", border: "1px solid #1E2028", borderRadius: 12,
  color: "var(--text)", fontSize: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
};

export const SECTOR_FALLBACK = "#64748b";
export function sectorEconColor(name: string): string { return SETOR_ECONOMICO_COLORS[name] ?? SECTOR_FALLBACK; }

// ── Helpers ────────────────────────────────────────────────────────────────────

export function formatComputedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

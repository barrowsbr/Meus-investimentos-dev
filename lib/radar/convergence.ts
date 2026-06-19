// ─────────────────────────────────────────────────────────────────────────────
// Convergence detector — Fase 3 do Radar V2.
//
// Detecta quando múltiplos sinais se alinham no mesmo país:
//   • Instabilidade elevada (score ≥ 45)
//   • Moeda local enfraquecendo (changePct > 1%)
//   • Mercado caindo (índice < -1.5%)
//   • Notícias de alto impacto (≥ 2)
//   • Sinais preditivos de risco (≥ 1)
//
// Quando ≥3 sinais convergem → "convergência ativa" → halo pulsante no mapa.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  InstabilityData, CurrencyData, IndexData,
  CountryNewsResponse, SignalsResponse,
} from "./types";

export interface ConvergenceSignal {
  type: "instability" | "currency" | "market" | "news" | "predictive";
  label: string;
  detail: string;
}

export interface ConvergenceResult {
  active: boolean;       // ≥3 sinais = ativo
  count: number;         // total de sinais alinhados
  signals: ConvergenceSignal[];
  intensity: "none" | "low" | "medium" | "high";
}

export function detectConvergence({
  instability,
  currency,
  indices,
  news,
  signals,
}: {
  instability: InstabilityData | null;
  currency: CurrencyData | null;
  indices: IndexData[];
  news: CountryNewsResponse | null;
  signals: SignalsResponse | null;
}): ConvergenceResult {
  const detected: ConvergenceSignal[] = [];

  if (instability && instability.score >= 45) {
    detected.push({
      type: "instability",
      label: "Instabilidade elevada",
      detail: `Score ${instability.score}/100 (${instability.level})`,
    });
  }

  if (currency && Math.abs(currency.changePct) > 1) {
    const weakening = currency.changePct > 0;
    if (weakening) {
      detected.push({
        type: "currency",
        label: "Moeda enfraquecendo",
        detail: `${currency.code} -${Math.abs(currency.changePct).toFixed(2)}% vs USD`,
      });
    }
  }

  const tradable = indices.filter(i => i.symbol !== "^VIX");
  if (tradable.length > 0) {
    const worst = tradable.reduce((a, b) => b.changePct < a.changePct ? b : a);
    if (worst.changePct < -1.5) {
      detected.push({
        type: "market",
        label: "Mercado em queda",
        detail: `${worst.name} ${worst.changePct.toFixed(2)}%`,
      });
    }
  }

  if (news) {
    const highImpact = news.articles.filter(a => a.impacto === "alto").length;
    if (highImpact >= 2) {
      detected.push({
        type: "news",
        label: "Notícias de alto impacto",
        detail: `${highImpact} manchetes relevantes`,
      });
    }
  }

  if (signals && signals.signals.length >= 1) {
    const riskSignals = signals.signals.filter(s => {
      const t = s.title.toLowerCase();
      return t.includes("war") || t.includes("conflict") || t.includes("sanction") ||
        t.includes("crisis") || t.includes("default") || t.includes("collapse");
    });
    if (riskSignals.length >= 1) {
      detected.push({
        type: "predictive",
        label: "Sinais preditivos de risco",
        detail: `${riskSignals.length} evento(s) em mercados preditivos`,
      });
    }
  }

  const count = detected.length;
  const active = count >= 3;
  const intensity = count >= 4 ? "high" : count >= 3 ? "medium" : count >= 2 ? "low" : "none";

  return { active, count, signals: detected, intensity };
}

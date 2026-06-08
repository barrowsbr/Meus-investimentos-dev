"use client";

import {
  BrainCircuit, Shuffle, LineChart, Waves, Network, ImageIcon,
  FlaskConical, Sigma, Clock, Database,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";

// ── Methods catalog ──────────────────────────────────────────────────────────

const METHODS = [
  {
    id: "monte-carlo",
    icon: Shuffle,
    title: "Simulação de Monte Carlo",
    tag: "Estocástico",
    color: "#34d399",
    description:
      "Geração de N caminhos estocásticos via GBM (Geometric Brownian Motion) calibrado com μ e σ históricos do portfólio. Permite estimar percentis da distribuição terminal e probabilidade de ruína.",
    detail: "10.000 simulações · GBM · Drift + Difusão",
    chartLabel: "Caminhos estocásticos + percentis P5/P50/P95",
    chartCount: 1,
  },
  {
    id: "arima",
    icon: LineChart,
    title: "ARIMA(p,d,q)",
    tag: "Série Temporal",
    color: "#60a5fa",
    description:
      "Modelo autoregressivo integrado de média móvel. Seleção automática de ordem via AIC/BIC, teste de estacionariedade (ADF), e geração de intervalos de confiança expandidos no horizonte de previsão (fan chart).",
    detail: "Auto-ARIMA · ADF test · IC 80%/95%",
    chartLabel: "Fan chart com intervalos de confiança",
    chartCount: 1,
  },
  {
    id: "prophet",
    icon: BrainCircuit,
    title: "Prophet (Meta)",
    tag: "Decomposição Aditiva",
    color: "#8b5cf6",
    description:
      "Decomposição aditiva da série em tendência (piecewise linear/logistic), sazonalidade (Fourier) e efeitos de regressores externos. Robusto a dados faltantes e mudanças de regime.",
    detail: "Tendência + Sazonalidade + Regressores",
    chartLabel: "Previsão + decomposição de componentes",
    chartCount: 1,
  },
  {
    id: "garch",
    icon: Waves,
    title: "GARCH(1,1)",
    tag: "Volatilidade",
    color: "#f59e0b",
    description:
      "Modelagem da variância condicional via GARCH(1,1). Captura clusters de volatilidade, estima VaR paramétrico e projeta a volatilidade futura anualizada. Essencial para sizing de posição e gestão de risco.",
    detail: "Variância condicional · VaR · Vol Forecast",
    chartLabel: "Volatilidade realizada vs. condicional",
    chartCount: 1,
  },
  {
    id: "var",
    icon: Network,
    title: "VAR(p) — Vetores Autorregressivos",
    tag: "Multivariado",
    color: "#ec4899",
    description:
      "Sistema de equações simultâneas para modelar interdependências entre ativos, taxas de juros, câmbio e índices. Permite análise de impulso-resposta e decomposição de variância para entender transmissão de choques.",
    detail: "IRF · Decomposição de Variância · Granger",
    chartLabel: "Impulso-resposta entre variáveis",
    chartCount: 4,
  },
];

// ── Chart placeholder ────────────────────────────────────────────────────────

function ChartPlaceholder({ label, color }: { label: string; color: string }) {
  return (
    <div
      className="relative w-full aspect-[16/9] rounded-lg border flex flex-col items-center justify-center gap-2 group transition-all duration-300"
      style={{
        borderColor: `${color}18`,
        background: `linear-gradient(180deg, ${color}04 0%, transparent 100%)`,
      }}
    >
      <div className="flex items-center gap-2 opacity-40 group-hover:opacity-60 transition-opacity">
        <ImageIcon size={18} style={{ color }} />
        <span className="text-[10px] font-mono font-medium" style={{ color }}>
          {label}
        </span>
      </div>
      <div className="absolute bottom-2 left-3 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
        <span className="text-[8px] font-mono text-zinc-700 uppercase tracking-widest">
          aguardando dados
        </span>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PreditivoPage() {
  return (
    <>
      <PageHeader
        title="Estatísticas Preditivas"
        description="Econometria aplicada ao portfólio"
      />

      {/* ── Status bar ── */}
      <div className="glass-card p-4 mb-6 flex flex-wrap items-center gap-4 text-[11px]">
        <div className="flex items-center gap-2">
          <Database size={13} className="text-zinc-500" />
          <span className="text-zinc-500">Fonte:</span>
          <span className="text-zinc-300 font-semibold">db_cotacoes · retornos diários</span>
        </div>
        <div className="hidden sm:block h-3 w-px bg-zinc-800" />
        <div className="flex items-center gap-2">
          <Clock size={13} className="text-zinc-500" />
          <span className="text-zinc-500">Horizonte:</span>
          <span className="text-zinc-300 font-semibold">252 dias úteis (1 ano)</span>
        </div>
        <div className="hidden sm:block h-3 w-px bg-zinc-800" />
        <div className="flex items-center gap-2">
          <Sigma size={13} className="text-zinc-500" />
          <span className="text-zinc-500">Confiança:</span>
          <span className="text-zinc-300 font-semibold">95%</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/8 border border-amber-500/15">
          <FlaskConical size={12} className="text-amber-400" />
          <span className="text-amber-400 font-semibold uppercase tracking-wider text-[9px]">Em calibração</span>
        </div>
      </div>

      {/* ── Methods ── */}
      <div className="space-y-4">
        {METHODS.map((method, idx) => (
          <div
            key={method.id}
            className="glass-card overflow-hidden"
            style={{ borderColor: `${method.color}0a` }}
          >
            {/* Header */}
            <div className="flex items-center gap-4 px-6 py-4 border-b border-zinc-800/50">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${method.color}10` }}
              >
                <method.icon size={18} style={{ color: method.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-sm font-bold text-zinc-200 truncate">
                    {method.title}
                  </h2>
                  <span
                    className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                    style={{ color: method.color, background: `${method.color}12` }}
                  >
                    {method.tag}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-600 font-mono mt-0.5">
                  {method.detail}
                </p>
              </div>
              <span className="text-[10px] text-zinc-700 font-mono shrink-0">
                #{String(idx + 1).padStart(2, "0")}
              </span>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              <p className="text-[13px] text-zinc-400 leading-relaxed mb-5">
                {method.description}
              </p>

              {method.chartCount === 1 ? (
                <ChartPlaceholder label={method.chartLabel} color={method.color} />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array.from({ length: method.chartCount }).map((_, i) => (
                    <ChartPlaceholder
                      key={i}
                      label={`${method.chartLabel} (${i + 1})`}
                      color={method.color}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

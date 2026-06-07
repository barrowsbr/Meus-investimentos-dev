"use client";

import {
  BrainCircuit, TrendingUp, Target, BarChart2, Gauge, Activity,
  GitBranch, Lock, Shuffle, LineChart, Waves, Network, ImageIcon,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";

// ── Planned feature cards ────────────────────────────────────────────────────

const PLANNED = [
  {
    icon: TrendingUp,
    title: "Projeção de Patrimônio",
    desc: "Monte Carlo com 10.000 simulações baseado em retornos históricos reais do seu portfólio. Intervalos de confiança 50/75/95%.",
    color: "#34d399",
  },
  {
    icon: Target,
    title: "Probabilidade de Meta",
    desc: "Qual a chance de atingir R$ X em Y anos? Calibrado com seu CAGR, volatilidade e padrão de aportes.",
    color: "#60a5fa",
  },
  {
    icon: BarChart2,
    title: "Value at Risk Condicional",
    desc: "CVaR / Expected Shortfall — quanto você pode perder nos piores cenários? Stress test com crise 2008, 2020 e custom.",
    color: "#f87171",
  },
  {
    icon: Gauge,
    title: "Regime de Mercado",
    desc: "Detecção de regime (bull/bear/lateral) via Hidden Markov Model. Indicadores de transição e probabilidade do regime atual.",
    color: "#f59e0b",
  },
  {
    icon: Activity,
    title: "Correlação Dinâmica",
    desc: "Matriz de correlação rolling entre seus ativos. Detecte quando diversificação falha (correlações sobem em crises).",
    color: "#8b5cf6",
  },
  {
    icon: GitBranch,
    title: "Cenários What-If",
    desc: "E se o dólar for a R$ 7? E se a Selic cair 3pp? Simule choques em variáveis macro e veja o impacto no portfólio.",
    color: "#ec4899",
  },
];

// ── Methods catalog ──────────────────────────────────────────────────────────

const METHODS = [
  {
    id: "monte-carlo",
    icon: Shuffle,
    title: "Simulação de Monte Carlo",
    color: "#34d399",
    description:
      "Método que utiliza variáveis aleatórias para projetar múltiplos cenários futuros (caminhos estocásticos) a partir de um valor presente. Gera um \"Gráfico de Espaguete\", permitindo visualizar a distribuição de probabilidades e a concentração dos resultados possíveis.",
    chartLabel: "Gráfico de caminhos estocásticos",
    chartCount: 1,
  },
  {
    id: "arima",
    icon: LineChart,
    title: "Modelos ARIMA",
    subtitle: "Autoregressivos Integrados de Média Móvel",
    color: "#60a5fa",
    description:
      "Modelo clássico de econometria para análise de séries temporais. Prevê o futuro com base nos valores e erros passados da própria série, gerando uma previsão central e intervalos de confiança que se expandem com o tempo (Gráfico de Leque).",
    chartLabel: "Gráfico de leque ARIMA",
    chartCount: 1,
  },
  {
    id: "prophet",
    icon: BrainCircuit,
    title: "Prophet",
    subtitle: "Modelos Aditivos",
    color: "#8b5cf6",
    description:
      "Ferramenta desenvolvida para séries temporais com forte sazonalidade. O modelo decompõe a série em tendências, padrões sazonais e efeitos de feriados, gerando uma previsão acompanhada por bandas sombreadas de incerteza.",
    chartLabel: "Previsão e decomposição sazonal",
    chartCount: 1,
  },
  {
    id: "garch",
    icon: Waves,
    title: "Modelos GARCH",
    subtitle: "Heterocedasticidade Condicional Autorregressiva Generalizada",
    color: "#f59e0b",
    description:
      "Método projetado especificamente para prever a volatilidade (risco ou variância) futura, em vez de apenas o preço direcional. O gráfico demonstra visualmente como a dispersão dos resultados e o risco de oscilações extremas se expandem agressivamente.",
    chartLabel: "Previsão de volatilidade",
    chartCount: 1,
  },
  {
    id: "var",
    icon: Network,
    title: "Vetores Autorregressivos (VAR)",
    subtitle: "Modelos Multivariados",
    color: "#ec4899",
    description:
      "Modelos multivariados que preveem múltiplas variáveis simultaneamente, considerando como elas interagem entre si em sistemas complexos. A visualização utiliza múltiplos leques de confiança sobrepostos para ilustrar as dependências.",
    chartLabel: "Leques de confiança interligados",
    chartCount: 4,
  },
];

// ── Chart placeholder ────────────────────────────────────────────────────────

function ChartPlaceholder({ label, color }: { label: string; color: string }) {
  return (
    <div
      className="relative w-full aspect-[16/9] rounded-xl border border-dashed flex flex-col items-center justify-center gap-3 transition-colors hover:border-solid"
      style={{
        borderColor: `${color}30`,
        background: `linear-gradient(135deg, ${color}05 0%, ${color}02 100%)`,
      }}
    >
      <ImageIcon size={28} style={{ color: `${color}40` }} />
      <span className="text-[11px] font-medium" style={{ color: `${color}60` }}>
        {label}
      </span>
      <span className="absolute bottom-2 right-3 text-[9px] text-zinc-600 uppercase tracking-wider">
        placeholder
      </span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PreditivoPage() {
  return (
    <>
      <PageHeader
        title="Estatísticas Preditivas"
        description="Simulações, projeções e análise de cenários"
      />

      {/* ── Banner ── */}
      <div className="glass-card p-6 mb-6 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 mb-4">
          <Lock size={14} className="text-purple-400" />
          <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Em construção</span>
        </div>
        <h2 className="text-lg font-bold text-zinc-200 mb-2">
          Módulo preditivo em desenvolvimento
        </h2>
        <p className="text-sm text-zinc-500 max-w-lg mx-auto">
          Projeções Monte Carlo, análise de cenários, detecção de regime de mercado
          e stress testing — tudo calibrado com os dados reais do seu portfólio.
        </p>
      </div>

      {/* ── Methods Catalog ── */}
      <div className="space-y-5 mb-8">
        {METHODS.map(method => (
          <div
            key={method.id}
            className="glass-card p-6"
            style={{ borderColor: `${method.color}10` }}
          >
            <div className="flex items-start gap-4 mb-4">
              <div
                className="p-2.5 rounded-xl shrink-0"
                style={{ background: `${method.color}12` }}
              >
                <method.icon size={22} style={{ color: method.color }} />
              </div>
              <div>
                <h2 className="text-base font-bold text-zinc-200">
                  {method.title}
                </h2>
                {method.subtitle && (
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {method.subtitle}
                  </p>
                )}
              </div>
            </div>

            <p className="text-sm text-zinc-400 leading-relaxed mb-5">
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
        ))}
      </div>

      {/* ── Planned Features Grid ── */}
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3 px-1">
        Funcionalidades planejadas
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PLANNED.map(item => (
          <div key={item.title} className="glass-card p-5 opacity-60 hover:opacity-80 transition-opacity">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg" style={{ background: `${item.color}15` }}>
                <item.icon size={18} style={{ color: item.color }} />
              </div>
              <h3 className="text-sm font-semibold text-zinc-300">{item.title}</h3>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    </>
  );
}

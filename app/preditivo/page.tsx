"use client";

import { BrainCircuit, TrendingUp, Target, BarChart2, Gauge, Activity, GitBranch, Lock } from "lucide-react";
import PageHeader from "@/components/PageHeader";

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

export default function PreditivoPage() {
  return (
    <>
      <PageHeader
        title="Estatísticas Preditivas"
        description="Simulações, projeções e análise de cenários"
      />

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

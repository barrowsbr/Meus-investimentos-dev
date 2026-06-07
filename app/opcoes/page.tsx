"use client";

import { Crosshair, TrendingUp, TrendingDown, Activity, BarChart2, Shield, Zap, Lock } from "lucide-react";
import PageHeader from "@/components/PageHeader";

const PLANNED = [
  {
    icon: Crosshair,
    title: "Book de Opções",
    desc: "Visualize calls e puts abertos, strikes, vencimentos e gregas (delta, gamma, theta, vega) de cada posição.",
    color: "#60a5fa",
  },
  {
    icon: TrendingUp,
    title: "P&L de Estratégias",
    desc: "Trava de alta, trava de baixa, straddle, strangle, butterfly — payoff diagram interativo com breakeven.",
    color: "#34d399",
  },
  {
    icon: Activity,
    title: "Superfície de Volatilidade",
    desc: "Mapa 3D de vol implícita por strike × vencimento. Smile, skew e term structure em tempo real.",
    color: "#f59e0b",
  },
  {
    icon: Shield,
    title: "Hedge & Proteção",
    desc: "Simule collar, protective put e covered call sobre posições existentes do portfólio.",
    color: "#8b5cf6",
  },
  {
    icon: BarChart2,
    title: "Histórico de Exercício",
    desc: "Registro de opções exercidas, abandonadas e roladas com resultado realizado.",
    color: "#ec4899",
  },
  {
    icon: Zap,
    title: "Alertas de Vencimento",
    desc: "Notificações automáticas de opções perto do vencimento, deep ITM ou com theta acelerado.",
    color: "#f97316",
  },
];

export default function OpcoesPage() {
  return (
    <>
      <PageHeader
        title="Opções"
        description="Derivativos, estratégias e gregas"
      />

      <div className="glass-card p-6 mb-6 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 mb-4">
          <Lock size={14} className="text-amber-400" />
          <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Em construção</span>
        </div>
        <h2 className="text-lg font-bold text-zinc-200 mb-2">
          Módulo de opções em desenvolvimento
        </h2>
        <p className="text-sm text-zinc-500 max-w-lg mx-auto">
          Esta página será o centro de controle para derivativos — book de opções,
          estratégias montadas, gregas, superfície de volatilidade e simulação de payoff.
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

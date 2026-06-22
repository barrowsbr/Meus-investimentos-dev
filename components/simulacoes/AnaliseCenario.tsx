"use client";

import { useMemo } from "react";
import { TrendingUp, Activity, Gauge, Shield, Stethoscope, ChevronRight, CheckCircle2, AlertTriangle, Minus } from "lucide-react";
import {
  type Insight,
  DEFAULT_CMA, DEFAULT_RF_RATE,
  computeProfile, computeConcentration, scoreDiversificacao, gerarDiagnostico,
} from "@/lib/simulacao-metrics";

// Estrutura mínima da alocação que o componente consome (espelha Allocation da página).
interface AllocLike {
  setor: Record<string, number>;
  setorEconomico: Record<string, number>;
  moeda: Record<string, number>;
  allPositions: { ticker: string; valor: number }[];
  total: number;
}

interface Props {
  current: AllocLike;
  sim: AllocLike | null;
}

// ── Tile de métrica antes → depois ─────────────────────────────────────────────

function MetricTile({ label, icon, atual, simulado, fmt, betterUp, suffixDelta }: {
  label: string;
  icon: React.ReactNode;
  atual: number;
  simulado: number | null;
  fmt: (v: number) => string;
  betterUp: boolean;
  suffixDelta?: string;
}) {
  const delta = simulado !== null ? simulado - atual : 0;
  const hasDelta = simulado !== null && Math.abs(delta) > 1e-6;
  const good = betterUp ? delta > 0 : delta < 0;
  return (
    <div className="glass-card p-3.5">
      <div className="flex items-center gap-1.5 mb-2 text-zinc-500">
        {icon}
        <span className="text-[9px] uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold text-zinc-100 font-mono tabular-nums">{fmt(simulado ?? atual)}</span>
      </div>
      {hasDelta && (
        <div className="flex items-center gap-1.5 mt-1 text-[10px] font-mono">
          <span className="text-zinc-600">{fmt(atual)}</span>
          <ChevronRight size={9} className="text-zinc-700" />
          <span className={good ? "text-emerald-400" : "text-amber-400"}>
            {delta > 0 ? "+" : "−"}{fmt(Math.abs(delta)).replace(/^[+−-]/, "")}{suffixDelta ?? ""}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function AnaliseCenario({ current, sim }: Props) {
  const hasSim = sim !== null;

  // Perfis (premissas de mercado padrão — usadas para concentração/diagnóstico)
  const profAtual = useMemo(() => computeProfile(current.setor, current.total, DEFAULT_CMA, DEFAULT_RF_RATE), [current.setor, current.total]);
  const profSim = useMemo(() => sim ? computeProfile(sim.setor, sim.total, DEFAULT_CMA, DEFAULT_RF_RATE) : null, [sim]);

  // Concentração
  const concAtual = useMemo(() => computeConcentration(current.allPositions), [current.allPositions]);
  const concSim = useMemo(() => sim ? computeConcentration(sim.allPositions) : null, [sim]);

  const scoreAtual = useMemo(() => scoreDiversificacao(concAtual, profAtual.weights), [concAtual, profAtual.weights]);
  const scoreSim = useMemo(() => (concSim && profSim) ? scoreDiversificacao(concSim, profSim.weights) : null, [concSim, profSim]);

  // Diagnóstico
  const insights: Insight[] = useMemo(() => {
    if (!sim || !profSim || !concSim) return [];
    return gerarDiagnostico({
      patrimAntes: current.total, patrimDepois: sim.total,
      profAntes: profAtual, profDepois: profSim,
      concAntes: concAtual, concDepois: concSim,
      setorEcoAntes: current.setorEconomico, setorEcoDepois: sim.setorEconomico,
      totalAntes: current.total, totalDepois: sim.total,
      moedaAntes: current.moeda, moedaDepois: sim.moeda,
    });
  }, [sim, profSim, concSim, profAtual, concAtual, current]);

  const insightIcon = (t: Insight["tipo"]) =>
    t === "positivo" ? <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
    : t === "alerta" ? <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
    : t === "negativo" ? <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
    : <Minus size={13} className="text-zinc-500 shrink-0 mt-0.5" />;

  return (
    <div className="space-y-4">
      {/* ── Saúde da Carteira ── */}
      <div className="glass-card p-5">
        <h2 className="text-xs font-semibold text-zinc-300 flex items-center gap-2 mb-4">
          <Shield size={14} className="text-emerald-400" /> Saúde da Carteira
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricTile label="Nº efetivo de ativos" icon={<Activity size={12} />} atual={concAtual.nEff} simulado={concSim?.nEff ?? null} fmt={(v) => v.toFixed(1)} betterUp />
          <MetricTile label="Top-5 concentração" icon={<Gauge size={12} />} atual={concAtual.top5} simulado={concSim?.top5 ?? null} fmt={(v) => `${v.toFixed(0)}%`} betterUp={false} suffixDelta="pp" />
          <MetricTile label="Maior posição" icon={<TrendingUp size={12} />} atual={concAtual.top1} simulado={concSim?.top1 ?? null} fmt={(v) => `${v.toFixed(0)}%`} betterUp={false} suffixDelta="pp" />
          <MetricTile label="Score diversificação" icon={<Shield size={12} />} atual={scoreAtual} simulado={scoreSim} fmt={(v) => `${v.toFixed(0)}`} betterUp />
        </div>
      </div>

      {/* ── Diagnóstico do Cenário ── */}
      {hasSim && insights.length > 0 && (
        <div className="glass-card p-5">
          <h2 className="text-xs font-semibold text-zinc-300 flex items-center gap-2 mb-4">
            <Stethoscope size={14} className="text-sky-400" /> Diagnóstico do Cenário
          </h2>
          <div className="space-y-2.5">
            {insights.map((ins, i) => (
              <div key={i} className="flex items-start gap-2.5">
                {insightIcon(ins.tipo)}
                <span className="text-xs text-zinc-300 leading-relaxed">{ins.texto}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { Shield, Brain, Loader2, AlertTriangle, ChevronRight, Zap } from "lucide-react";
import type { InstabilityData, BriefData } from "@/lib/radar/types";
import type { ConvergenceResult } from "@/lib/radar/convergence";

const LEVEL_CONFIG = {
  baixo: { color: "#4ade80", bg: "rgba(74,222,128,0.08)", border: "rgba(74,222,128,0.2)", label: "Baixo" },
  moderado: { color: "#facc15", bg: "rgba(250,204,21,0.08)", border: "rgba(250,204,21,0.2)", label: "Moderado" },
  elevado: { color: "#fb923c", bg: "rgba(251,146,60,0.08)", border: "rgba(251,146,60,0.2)", label: "Elevado" },
  crítico: { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.2)", label: "Crítico" },
};

function ScoreGauge({ score, level }: { score: number; level: InstabilityData["level"] }) {
  const config = LEVEL_CONFIG[level];
  return (
    <div className="flex items-center gap-4 rounded-xl p-4" style={{ background: config.bg, border: `1px solid ${config.border}` }}>
      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="14" fill="none"
            stroke={config.color} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 88} 88`}
          />
        </svg>
        <span className="absolute font-mono text-lg font-bold" style={{ color: config.color }}>
          {score}
        </span>
      </div>
      <div>
        <div className="flex items-center gap-1.5">
          <Shield size={13} style={{ color: config.color }} />
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: config.color }}>
            Instabilidade {config.label}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          Score composto de 4 dimensões — político, fiscal, mercado e externo.
        </p>
      </div>
    </div>
  );
}

function DimensionBar({ label, score, detail }: { label: string; score: number; detail: string }) {
  const color = score >= 70 ? "#f87171" : score >= 45 ? "#fb923c" : score >= 20 ? "#facc15" : "#4ade80";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-300">{label}</span>
        <span className="font-mono text-[11px] font-semibold" style={{ color }}>{score}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      <p className="text-[10px] text-zinc-600">{detail}</p>
    </div>
  );
}

interface Props {
  instability: InstabilityData | null;
  instabilityLoading: boolean;
  brief: BriefData | null;
  briefLoading: boolean;
  convergence?: ConvergenceResult | null;
}

export default function InteligenciaTab({ instability, instabilityLoading, brief, briefLoading, convergence }: Props) {
  return (
    <div className="space-y-4 p-4">
      {/* AI Brief */}
      <section>
        <div className="mb-2 flex items-center gap-1.5">
          <Brain size={13} className="text-purple-400" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-purple-300">Leitura IA</span>
        </div>
        {briefLoading ? (
          <div className="flex items-center gap-2 rounded-xl p-3 text-xs text-zinc-500" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            <Loader2 size={14} className="animate-spin" /> Gerando leitura…
          </div>
        ) : brief?.brief ? (
          <div className="rounded-xl p-3" style={{ background: "rgba(147,51,234,0.06)", border: "1px solid rgba(147,51,234,0.18)" }}>
            <p className="text-[13px] leading-relaxed text-zinc-200">{brief.brief}</p>
            {brief.model && (
              <p className="mt-2 text-[9px] text-zinc-600">Modelo: {brief.model}</p>
            )}
          </div>
        ) : (
          <div className="rounded-xl p-3 text-xs text-zinc-500" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            Leitura IA indisponível.
          </div>
        )}
      </section>

      {/* Instability Index */}
      <section>
        <div className="mb-2 flex items-center gap-1.5">
          <AlertTriangle size={13} className="text-amber-400" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-300">Índice de Instabilidade</span>
        </div>
        {instabilityLoading ? (
          <div className="flex items-center gap-2 rounded-xl p-3 text-xs text-zinc-500" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            <Loader2 size={14} className="animate-spin" /> Calculando instabilidade…
          </div>
        ) : instability ? (
          <div className="space-y-3">
            <ScoreGauge score={instability.score} level={instability.level} />
            <div className="space-y-3 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              {instability.dimensions.map((d) => (
                <DimensionBar key={d.label} label={d.label} score={d.score} detail={d.detail} />
              ))}
            </div>
            <p className="flex items-center gap-1 text-[10px] text-zinc-600">
              <ChevronRight size={10} />
              Atualizado em {new Date(instability.cachedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            </p>
          </div>
        ) : (
          <div className="rounded-xl p-3 text-xs text-zinc-500" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            Dados de instabilidade indisponíveis.
          </div>
        )}
      </section>

      {/* Convergence */}
      {convergence && convergence.signals.length >= 2 && (
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <Zap size={13} className={convergence.active ? "text-orange-400" : "text-zinc-500"} />
            <span className={`text-[10px] font-semibold uppercase tracking-widest ${convergence.active ? "text-orange-300" : "text-zinc-500"}`}>
              Convergência {convergence.active ? "Ativa" : "Parcial"} · {convergence.count} sinais
            </span>
          </div>
          <div
            className="space-y-1.5 rounded-xl p-3"
            style={{
              background: convergence.active ? "rgba(251,146,60,0.06)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${convergence.active ? "rgba(251,146,60,0.18)" : "rgba(255,255,255,0.06)"}`,
            }}
          >
            {convergence.signals.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: convergence.active ? "#fb923c" : "#71717a" }} />
                <div>
                  <p className="text-xs font-medium text-zinc-200">{s.label}</p>
                  <p className="text-[10px] text-zinc-500">{s.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

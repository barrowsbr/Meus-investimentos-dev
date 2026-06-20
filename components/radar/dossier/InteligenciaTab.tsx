"use client";

import { Shield, Brain, Loader2, AlertTriangle, ChevronRight, Zap, AlertCircle } from "lucide-react";
import type { InstabilityData, BriefData } from "@/lib/radar/types";
import type { ConvergenceResult } from "@/lib/radar/convergence";
import SpiderChart from "../charts/SpiderChart";
import GaugeCluster from "../charts/GaugeCluster";
import { freshLabel } from "./fresh-label";

const LEVEL_CONFIG = {
  baixo: { color: "#4ade80", bg: "rgba(74,222,128,0.08)", border: "rgba(74,222,128,0.2)", label: "Baixo" },
  moderado: { color: "#facc15", bg: "rgba(250,204,21,0.08)", border: "rgba(250,204,21,0.2)", label: "Moderado" },
  elevado: { color: "#fb923c", bg: "rgba(251,146,60,0.08)", border: "rgba(251,146,60,0.2)", label: "Elevado" },
  crítico: { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.2)", label: "Crítico" },
};

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
              <p className="mt-2 text-[9px] text-zinc-600">
                Modelo: {brief.model}{brief.cachedAt ? ` · ${freshLabel(brief.cachedAt)}` : ""}
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl p-3 text-xs text-zinc-500" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            <AlertCircle size={13} className="shrink-0 text-zinc-600" />
            Não foi possível gerar a leitura IA no momento.
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
            {/* Spider: perfil multidimensional */}
            <div className="flex justify-center rounded-xl py-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <SpiderChart
                dimensions={instability.dimensions.map((d) => ({ name: d.label, score: d.score }))}
                size={200}
              />
            </div>
            {/* Gauges: score numérico por dimensão */}
            <div className="rounded-xl px-3 py-3" style={{ background: LEVEL_CONFIG[instability.level].bg, border: `1px solid ${LEVEL_CONFIG[instability.level].border}` }}>
              <div className="mb-2 flex items-center gap-1.5">
                <Shield size={12} style={{ color: LEVEL_CONFIG[instability.level].color }} />
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: LEVEL_CONFIG[instability.level].color }}>
                  Instabilidade {LEVEL_CONFIG[instability.level].label}
                </span>
              </div>
              <GaugeCluster
                items={instability.dimensions.map((d) => ({ label: d.label, score: d.score }))}
                total={{ label: "TOTAL", score: instability.score }}
              />
            </div>
            <p className="flex items-center gap-1 text-[10px] text-zinc-600">
              <ChevronRight size={10} />
              Atualizado em {new Date(instability.cachedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl p-3 text-xs text-zinc-500" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            <AlertCircle size={13} className="shrink-0 text-zinc-600" />
            Índice de instabilidade indisponível. Os dados serão recalculados automaticamente.
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

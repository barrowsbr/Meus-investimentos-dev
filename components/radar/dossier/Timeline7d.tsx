"use client";

import { Calendar, Loader2 } from "lucide-react";
import type { TimelineResponse } from "@/lib/radar/types";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

function formatWeekday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
}

interface Props {
  timeline: TimelineResponse | null;
  timelineLoading: boolean;
}

export default function Timeline7d({ timeline, timelineLoading }: Props) {
  if (timelineLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl p-3 text-xs text-zinc-500" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <Loader2 size={14} className="animate-spin" /> Carregando timeline…
      </div>
    );
  }

  if (!timeline || timeline.timeline.length === 0) return null;

  const days = timeline.timeline;
  const maxAbsIdx = Math.max(...days.map(d => Math.abs(d.indexChangePct ?? 0)), 0.5);

  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5">
        <Calendar size={13} className="text-indigo-400" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-indigo-300">Últimos 7 dias</span>
      </div>
      <div className="overflow-hidden rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        {/* Sparkline bars */}
        <div className="flex items-end gap-px px-2 pb-1 pt-3 sm:px-3" style={{ height: 64 }}>
          {days.map((day, i) => {
            const pct = day.indexChangePct ?? 0;
            const height = Math.max(Math.abs(pct) / maxAbsIdx * 28, 2);
            const color = pct >= 0 ? "#4ade80" : "#f87171";
            return (
              <div key={i} className="flex flex-1 flex-col items-center justify-end gap-0.5" style={{ height: "100%" }}>
                <span className="font-mono text-[8px] font-semibold" style={{ color }}>
                  {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                </span>
                <div
                  className="w-full max-w-[20px] rounded-t"
                  style={{ height, background: color, opacity: 0.7 }}
                />
              </div>
            );
          })}
        </div>

        {/* Day labels */}
        <div className="flex gap-px border-t border-white/[0.04] px-2 pb-2 pt-1 sm:px-3">
          {days.map((day, i) => (
            <div key={i} className="flex flex-1 flex-col items-center">
              <span className="text-[8px] font-medium text-zinc-500">{formatWeekday(day.date)}</span>
              <span className="text-[7px] text-zinc-600">{formatDate(day.date)}</span>
            </div>
          ))}
        </div>

        {/* FX row */}
        {days.some(d => d.fxChangePct !== null) && (
          <div className="flex gap-px border-t border-white/[0.04] px-3 py-1.5">
            <span className="shrink-0 text-[8px] text-zinc-600 sm:w-4">FX</span>
            <div className="flex flex-1 gap-px">
              {days.map((day, i) => {
                const fx = day.fxChangePct;
                if (fx === null) return <div key={i} className="flex-1 text-center text-[8px] text-zinc-700">—</div>;
                const fxLocal = -fx;
                const color = fxLocal >= 0 ? "#4ade80" : "#f87171";
                return (
                  <div key={i} className="flex-1 text-center font-mono text-[8px] font-medium" style={{ color }}>
                    {fxLocal >= 0 ? "+" : ""}{fxLocal.toFixed(1)}%
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

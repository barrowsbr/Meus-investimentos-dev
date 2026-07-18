"use client";

// Extraído de app/resumo/page.tsx — Pareto de concentração por ativo (barras +
// curva acumulada) e métricas de concentração setorial.

import React from "react";
import { BarChart3 } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip,
  Bar, Cell, Line, ReferenceLine,
} from "recharts";
import { compactBRL } from "@/lib/format";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import {
  SECTOR_COLORS, TOOLTIP_STYLE,
  type ParetoItem, type SetoresApiData, type SetoresStats,
} from "@/components/resumo/shared";

interface ParetoCardProps {
  filteredPareto: ParetoItem[];
  pareto: ParetoItem[] | undefined;
  setoresStats: SetoresStats | null;
  activeSetoresData: SetoresApiData | null;
}

export default function ParetoCard({ filteredPareto, pareto, setoresStats, activeSetoresData }: ParetoCardProps) {
  return (
    <div className="glass-card p-5">
      <h2 className="section-title mb-4"><BarChart3 size={15} />Pareto — Concentração</h2>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={filteredPareto} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" vertical={false} />
          <XAxis dataKey="ticker" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
            interval={0} angle={-35} textAnchor="end" height={50} />
          <YAxis yAxisId="left" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
            tickFormatter={v => compactBRL(v)} />
          <YAxis yAxisId="right" orientation="right" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
            tickFormatter={v => `${v.toFixed(0)}%`} domain={[0, 100]} />
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(v: number, name: string) => [
              name === "valor_brl" ? compactBRL(v) : `${v.toFixed(1)}%`,
              name === "valor_brl" ? "Valor" : "Acumulado",
            ]} />
          <Bar yAxisId="left" dataKey="valor_brl" radius={[4, 4, 0, 0]} maxBarSize={28}>
            {filteredPareto.map((entry, i) => (
              <Cell key={i} fill={SECTOR_COLORS[entry.setor] || "#3b82f6"} fillOpacity={0.85} />
            ))}
          </Bar>
          <Line yAxisId="right" type="monotone" dataKey="acumulado_pct" stroke="#E8A33D" strokeWidth={2}
            dot={{ fill: "#E8A33D", r: 3 }} name="acumulado_pct" />
          <ReferenceLine yAxisId="right" y={80} stroke="#E8A33D" strokeDasharray="6 3" strokeOpacity={0.45}
            label={{ value: "80%", position: "right", fontSize: 9, fill: "#E8A33D" }} />
        </ComposedChart>
      </ResponsiveContainer>
      {pareto && pareto.length > 0 && (
        <p className="text-[10px] text-zinc-600 mt-2">
          Top {Math.min(filteredPareto.length, 10)} ativos representam{" "}
          <span className="text-zinc-400 font-semibold">
            {filteredPareto[Math.min(9, filteredPareto.length - 1)]?.acumulado_pct.toFixed(1)}%
          </span>{" "}
          do portfólio
        </p>
      )}

      {/* Concentração setorial (mesma lente do detalhamento) */}
      {setoresStats && activeSetoresData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
          {[
            { label: "Top 1 setor", value: setoresStats.sorted[0]?.pct ?? 0 },
            { label: "Top 3 setores", value: setoresStats.top3 },
            { label: "Top 5 setores", value: setoresStats.top5 },
            { label: "# Efetivo (1/HHI)", value: setoresStats.effN, isCount: true },
          ].map(c => (
            <div key={c.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-zinc-500">{c.label}</span>
                <span className="text-xs text-zinc-300 font-mono font-bold">
                  {c.isCount ? c.value.toFixed(1) : `${c.value.toFixed(1)}%`}
                </span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-full rounded-full" style={{
                  width: `${Math.min(c.isCount ? (c.value / activeSetoresData.sectors.length) * 100 : c.value, 100)}%`,
                  background: (!c.isCount && c.value > 60) ? "#f59e0b" : "#3b82f6",
                }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

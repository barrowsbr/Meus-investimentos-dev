"use client";

// Extraído de app/resumo/page.tsx — linha com os cards Exposição Cambial
// (pizza por moeda) e Custódia (Brasil vs Exterior).

import React from "react";
import { DollarSign, Globe } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { compactBRL } from "@/lib/format";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import { CURRENCY_COLORS, TOOLTIP_STYLE, type ComposicaoData } from "@/components/resumo/shared";

interface CambioCustodiaRowProps {
  filteredExposicao: { name: string; value: number }[];
  currencyTotal: number;
  custodia: ComposicaoData["custodia"] | undefined;
}

export default function CambioCustodiaRow({ filteredExposicao, currencyTotal, custodia }: CambioCustodiaRowProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Currency exposure */}
      <div className="glass-card p-5">
        <h2 className="section-title mb-4"><DollarSign size={15} />Exposição Cambial</h2>
        {filteredExposicao.length > 0 ? (
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0 w-44">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={filteredExposicao} cx="50%" cy="50%" innerRadius={42} outerRadius={70} dataKey="value" stroke="none" paddingAngle={1}>
                    {filteredExposicao.map(entry => <Cell key={entry.name} fill={CURRENCY_COLORS[entry.name] || "#71717a"} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => [compactBRL(v), "Valor"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2.5 pt-2">
              {filteredExposicao.map(c => {
                const pctVal = currencyTotal > 0 ? (c.value / currencyTotal) * 100 : 0;
                const color = CURRENCY_COLORS[c.name] || "#71717a";
                return (
                  <div key={c.name}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-xs text-zinc-300 font-medium">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400">{compactBRL(c.value)}</span>
                        <span className="text-xs font-mono font-semibold tabular-nums" style={{ color }}>{pctVal.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-0.5 rounded-full bg-zinc-800/60 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pctVal}%`, backgroundColor: color, opacity: 0.6 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : <p className="text-zinc-600 text-sm">Sem dados.</p>}
      </div>

      {/* Custódia (Brasil vs Exterior) */}
      <div className="glass-card p-5">
        <h2 className="section-title mb-4"><Globe size={15} />Custódia</h2>
        {custodia ? (
          <div className="grid grid-cols-2 gap-8">
            {[
              { label: "Brasil", value: custodia.brasil, pct: custodia.brasil_pct, color: "#3b82f6", icon: "🇧🇷" },
              { label: "Exterior", value: custodia.exterior, pct: custodia.exterior_pct, color: "#8b5cf6", icon: "🌐" },
            ].map(c => (
              <div key={c.label}>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-sm font-semibold text-zinc-300">{c.label}</span>
                  <span className="text-xl font-bold" style={{ color: c.color }}>{c.pct.toFixed(1)}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-zinc-800/60 overflow-hidden mb-2">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${c.pct}%`, backgroundColor: c.color, boxShadow: `0 0 12px ${c.color}40` }} />
                </div>
                <span className="text-sm text-zinc-400">{compactBRL(c.value)}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-zinc-600 text-sm">Sem dados.</p>}
      </div>
    </div>
  );
}

"use client";

// Extraído de app/performance/page.tsx — aba Rentabilidade: barras por ativo,
// tabela P&L detalhada e dispersão Risco x Retorno (dados de /composicao/resumo).

import React from "react";
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell, ReferenceLine, ScatterChart, Scatter, ZAxis,
} from "recharts";
import { Target, BarChart3, PieChart as PieIcon } from "lucide-react";
import { compactBRL } from "@/lib/format";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import type { RentabilidadeItem, RiscoRetornoItem } from "@/components/performance/shared";

// ── Rentabilidade constants ──────────────────────────────────────────────────

const RENT_SECTOR_COLORS: Record<string, string> = {
  "Ações Brasil": "#db2777", "Ações Internacional": "#8b5cf6", "Ações EUA": "#8b5cf6", "Ações Mundo": "#a78bfa",
  "ETF USA": "#06b6d4", "ETFs": "#6366f1", "ETF": "#6366f1",
  "FIIs": "#f97316", "Cripto": "#eab308",
  "Commodities": "#84cc16", "BDRs": "#a855f7", "Renda Fixa": "#0f766e", "Renda Fixa USD": "#1d4ed8",
  "Tesouro Direto": "#10b981", "CDBs": "#0ea5e9", "LCI/LCA": "#06b6d4", "Debêntures": "#3b82f6", "Caixa": "#64748b",
};

const RENT_TOOLTIP_STYLE = {
  background: "#13141A", border: "1px solid #1E2028", borderRadius: 12,
  color: "var(--text)", fontSize: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
};

export default function RentabilidadeTab({
  rentStatusFilter, setRentStatusFilter, filteredRentabilidade, filteredRiscoRetorno,
}: {
  rentStatusFilter: "Todos" | "Ativo" | "Vendido";
  setRentStatusFilter: React.Dispatch<React.SetStateAction<"Todos" | "Ativo" | "Vendido">>;
  filteredRentabilidade: RentabilidadeItem[];
  filteredRiscoRetorno: RiscoRetornoItem[];
}) {
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Status filter */}
      <div className="flex gap-1.5">
        {(["Todos", "Ativo", "Vendido"] as const).map(s => (
          <button key={s} onClick={() => setRentStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${rentStatusFilter === s
              ? "border-emerald-600/50 bg-emerald-600/15 text-emerald-400"
              : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
            }`}>
            {s}
          </button>
        ))}
      </div>

      {/* Horizontal bar chart — stacked unrealized + realized/proventos */}
      {filteredRentabilidade.filter(r => r.status === "Ativo").length > 0 && (() => {
        const activeItems = filteredRentabilidade
          .filter(r => r.status === "Ativo" && r.retorno_total_pct !== 0)
          .sort((a, b) => b.retorno_total_pct - a.retorno_total_pct);
        const chartHeight = Math.max(320, activeItems.length * 28);
        return (
          <div className="glass-card p-5">
            <h2 className="section-title mb-4"><Target size={15} />Rentabilidade por Ativo</h2>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart layout="vertical" data={activeItems} barCategoryGap="18%" margin={{ left: 10, right: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v.toFixed(0)}%`} />
                <YAxis type="category" dataKey="ticker" width={70} tick={{ fill: "#a1a1aa", fontSize: 11, fontWeight: 600 }}
                  axisLine={false} tickLine={false} />
                <Tooltip contentStyle={RENT_TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
                  formatter={(v: number, name: string) => [
                    `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`,
                    name === "retorno_nao_realizado_pct" ? "Não Realizado" : "Realiz. + Prov.",
                  ]}
                  labelFormatter={(label) => {
                    const item = activeItems.find(r => r.ticker === label);
                    return item ? `${label} (${item.moeda})` : label;
                  }}
                />
                <ReferenceLine x={0} stroke="#3f3f46" strokeWidth={1} />
                <Bar dataKey="retorno_nao_realizado_pct" stackId="a" radius={[0, 0, 0, 0]} maxBarSize={18} name="retorno_nao_realizado_pct">
                  {activeItems.map((entry, i) => (
                    <Cell key={i} fill={entry.retorno_total_pct >= 0 ? "#34d399" : "#f87171"} fillOpacity={0.85} />
                  ))}
                </Bar>
                <Bar dataKey="retorno_realizado_proventos_pct" stackId="a" radius={[0, 4, 4, 0]} maxBarSize={18} name="retorno_realizado_proventos_pct"
                  label={(props: Record<string, unknown>) => {
                    const { x, y, width, height, index } = props as { x: number; y: number; width: number; height: number; index: number };
                    const item = activeItems[index];
                    if (!item) return <text />;
                    const total = item.retorno_total_pct;
                    const isRight = total >= 0;
                    return (
                      <text
                        x={isRight ? x + width + 4 : x + width - 4}
                        y={y + height / 2}
                        textAnchor={isRight ? "start" : "end"}
                        dominantBaseline="central"
                        fill={total >= 0 ? "#34d399" : "#f87171"}
                        fontSize={10}
                        fontWeight={600}
                        fontFamily="ui-monospace, monospace"
                      >
                        {total >= 0 ? "+" : ""}{total.toFixed(1)}%
                      </text>
                    );
                  }}
                >
                  {activeItems.map((entry, i) => (
                    <Cell key={i} fill={entry.retorno_total_pct >= 0 ? "#34d399" : "#f87171"} fillOpacity={0.3} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-3 text-[10px] text-zinc-500">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm" style={{ background: "#34d399", opacity: 0.85 }} />
                Não Realizado
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm" style={{ background: "#34d399", opacity: 0.3 }} />
                Realizado + Proventos
              </div>
              <span className="text-zinc-600 ml-auto">Retorno em moeda nativa</span>
            </div>
          </div>
        );
      })()}

      {/* Detailed P&L table */}
      {filteredRentabilidade.length > 0 && (
        <div className="glass-card p-5">
          <h2 className="section-title mb-4"><BarChart3 size={15} />Detalhamento P&L</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: "#1E2028" }}>
                  {["Ativo", "Setor", "Status", "Valor Atual", "Não Real.", "Real.+Prov.", "Total", "Ret %"].map((h, i) => (
                    <th key={h} className={`px-2 py-2 text-[9px] text-zinc-500 font-semibold uppercase tracking-wider ${i > 1 ? "text-right" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRentabilidade.map((r, i) => {
                  const fmtNative = (v: number) => {
                    if (r.moeda === "USD") return `$${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`;
                    return compactBRL(v);
                  };
                  const naoReal = r.lucro_nao_realizado_native ?? r.lucro_nao_realizado_brl;
                  const realizado = r.lucro_realizado_native ?? r.lucro_realizado_brl;
                  const proventos = r.proventos_native ?? r.proventos_brl;
                  const realizadoProv = realizado + proventos;
                  const total = r.resultado_total_native ?? r.resultado_total_brl;
                  const valorAtual = r.valor_atual_native ?? r.valor_atual_brl;
                  return (
                    <tr key={r.ticker} className={`border-b hover:bg-white/[0.025] transition-colors ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`} style={{ borderColor: "rgba(30,32,40,0.5)" }}>
                      <td className="px-2 py-2">
                        <span className="font-semibold text-zinc-200">{r.ticker}</span>
                        <span className="text-zinc-600 text-[9px] ml-1">{r.moeda}</span>
                      </td>
                      <td className="px-2 py-2">
                        <span className="tag" style={{ backgroundColor: `${RENT_SECTOR_COLORS[r.setor] || "#71717a"}15`, color: RENT_SECTOR_COLORS[r.setor] || "#71717a" }}>
                          {r.setor}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <span className={`text-[10px] font-semibold ${r.status === "Ativo" ? "text-emerald-500" : "text-zinc-600"}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right text-zinc-400 font-mono">{fmtNative(valorAtual)}</td>
                      <td className={`px-2 py-2 text-right font-mono ${naoReal >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {naoReal !== 0 ? `${naoReal >= 0 ? "+" : ""}${fmtNative(naoReal)}` : "—"}
                      </td>
                      <td className={`px-2 py-2 text-right font-mono ${realizadoProv >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {(Math.abs(realizado) + proventos) > 0.01 ? `${realizadoProv >= 0 ? "+" : ""}${fmtNative(realizadoProv)}` : "—"}
                      </td>
                      <td className={`px-2 py-2 text-right font-mono font-semibold ${total >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {total >= 0 ? "+" : ""}{fmtNative(total)}
                      </td>
                      <td className={`px-2 py-2 text-right font-bold ${r.retorno_total_pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {r.retorno_total_pct >= 0 ? "+" : ""}{r.retorno_total_pct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t" style={{ borderColor: "#3f3f46" }}>
                  <td className="px-2 py-2 font-bold text-zinc-200" colSpan={3}>Total</td>
                  <td className="px-2 py-2 text-right font-mono text-zinc-300">{compactBRL(filteredRentabilidade.reduce((s, r) => s + r.valor_atual_brl, 0))}</td>
                  <td colSpan={2} className="px-2 py-2 text-right text-zinc-500">{"—"}</td>
                  <td className="px-2 py-2 text-right font-mono font-semibold text-zinc-300">{compactBRL(filteredRentabilidade.reduce((s, r) => s + r.resultado_total_brl, 0))}</td>
                  <td className="px-2 py-2 text-right text-zinc-500">{"—"}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[9px] text-zinc-700 mt-2">Valores em moeda do ativo (USD ativos em d&oacute;lar, demais em BRL). Retorno % calculado em moeda nativa.</p>
        </div>
      )}

      {/* Risco x Retorno */}
      {filteredRiscoRetorno.length > 0 && (
        <div className="glass-card p-5">
          <h2 className="section-title mb-4"><PieIcon size={15} />Risco x Retorno</h2>
          <ResponsiveContainer width="100%" height={340}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" />
              <XAxis dataKey="retorno_acumulado" name="Retorno" unit="%" type="number"
                tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                label={{ value: "Retorno Acumulado (%)", position: "insideBottom", offset: -5, fill: "#52525b", fontSize: 10 }} />
              <YAxis dataKey="valor_atual_brl" name="Valor" type="number"
                tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => compactBRL(v)} />
              <ZAxis dataKey="valor_atual_brl" range={[40, 600]} />
              <Tooltip contentStyle={RENT_TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload as RiscoRetornoItem;
                  return (
                    <div style={RENT_TOOLTIP_STYLE} className="px-3 py-2 rounded-xl">
                      <p className="font-bold text-zinc-200">{d.ticker}</p>
                      <p className="text-zinc-400 text-[11px]">{d.setor}</p>
                      <p className="text-zinc-300 text-xs mt-1">{compactBRL(d.valor_atual_brl)}</p>
                      <p className={`text-xs font-semibold ${d.retorno_acumulado >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {d.retorno_acumulado >= 0 ? "+" : ""}{d.retorno_acumulado.toFixed(2)}%
                      </p>
                    </div>
                  );
                }} />
              <ReferenceLine x={0} stroke="#3f3f46" strokeWidth={1} strokeDasharray="4 4" />
              <Scatter data={filteredRiscoRetorno} fill="#8b5cf6">
                {filteredRiscoRetorno.map((entry, i) => (
                  <Cell key={i} fill={RENT_SECTOR_COLORS[entry.setor] || "#8b5cf6"} fillOpacity={0.85} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {[...new Set(filteredRiscoRetorno.map(r => r.setor))].map(s => (
              <span key={s} className="tag" style={{ backgroundColor: `${RENT_SECTOR_COLORS[s] || "#71717a"}18`, color: RENT_SECTOR_COLORS[s] || "#71717a" }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useMemo, useState } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Treemap,
} from "recharts";
import {
  PieChart as PieIcon, TrendingUp, TrendingDown, Briefcase,
  ChevronDown, ChevronRight, Layers, BarChart3,
} from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { compactBRL, pct } from "@/lib/format";
import { isRendaFixa } from "@/lib/sectors";
import { getSetorEconomico, SETOR_ECONOMICO_COLORS } from "@/lib/gics-sectors";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

const TOOLTIP_STYLE = {
  background: "#13141A", border: "1px solid #1E2028", borderRadius: 12,
  color: "var(--text)", fontSize: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
};

const FALLBACK_COLOR = "#64748b";
function sColor(name: string): string { return SETOR_ECONOMICO_COLORS[name] ?? FALLBACK_COLOR; }

interface SectorPos {
  ticker: string;
  setor: string;
  setorEconomico: string;
  valorBRL: number;
  retornoTotalPct: number | null;
  moeda: string;
  tipo: "RV" | "RF" | "Caixa";
}

interface SectorAgg {
  setor: string;
  valorBRL: number;
  pct: number;
  posicoes: SectorPos[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SectorTreemapContent(props: any) {
  const { x, y, width, height, name, pct: treePct, fill } = props;
  if (width < 30 || height < 20) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="rgba(0,0,0,0.4)" strokeWidth={1} rx={2} />
      {width > 50 && height > 28 && (
        <>
          <text x={x + 6} y={y + 14} fill="rgba(255,255,255,0.9)" fontSize={10} fontWeight={700} fontFamily="var(--font-mono)">
            {name?.length > Math.floor(width / 7) ? name?.slice(0, Math.floor(width / 7)) + "…" : name}
          </text>
          {height > 38 && (
            <text x={x + 6} y={y + 27} fill="rgba(255,255,255,0.5)" fontSize={9} fontFamily="var(--font-mono)">
              {typeof treePct === "number" ? `${treePct.toFixed(1)}%` : ""}
            </text>
          )}
        </>
      )}
    </g>
  );
}

export default function SetoresPage() {
  const { data: portfolio, loading, error } = usePortfolio();
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());

  const { sectors, positions: allPositions, totalBRL, rvBRL, rfManualBRL } = useMemo(() => {
    if (!portfolio) return { sectors: [], positions: [], totalBRL: 0, rvBRL: 0, rfManualBRL: 0 };

    const positions: SectorPos[] = [];

    for (const p of portfolio.positions) {
      if (p.quantidade <= 0 || p.valorAtualBRL <= 0) continue;
      const se = getSetorEconomico(p.ticker, p.setor);
      positions.push({
        ticker: p.ticker.replace(/\.SA$/, ""),
        setor: p.setor,
        setorEconomico: se,
        valorBRL: p.valorAtualBRL,
        retornoTotalPct: p.retornoTotalPct ?? null,
        moeda: p.moeda,
        tipo: isRendaFixa(p.setor) ? "RF" : "RV",
      });
    }

    const positionsRvBRL = positions.filter(p => p.tipo === "RV").reduce((s, p) => s + p.valorBRL, 0);
    const positionsRfBRL = positions.filter(p => p.tipo === "RF").reduce((s, p) => s + p.valorBRL, 0);
    const rfManual = Math.max(0, portfolio.rfPatrimonioBRL - positionsRfBRL);

    if (rfManual > 100) {
      positions.push({
        ticker: "RF Manual",
        setor: "Renda Fixa",
        setorEconomico: "Renda Fixa",
        valorBRL: rfManual,
        retornoTotalPct: null,
        moeda: "BRL",
        tipo: "RF",
      });
    }

    const total = positions.reduce((s, p) => s + p.valorBRL, 0);
    const sectorMap = new Map<string, SectorAgg>();

    for (const p of positions) {
      const existing = sectorMap.get(p.setorEconomico);
      if (existing) {
        existing.valorBRL += p.valorBRL;
        existing.posicoes.push(p);
      } else {
        sectorMap.set(p.setorEconomico, {
          setor: p.setorEconomico,
          valorBRL: p.valorBRL,
          pct: 0,
          posicoes: [p],
        });
      }
    }

    const sectors = [...sectorMap.values()]
      .map(s => ({ ...s, pct: total > 0 ? (s.valorBRL / total) * 100 : 0 }))
      .sort((a, b) => b.valorBRL - a.valorBRL);

    for (const s of sectors) {
      s.posicoes.sort((a, b) => b.valorBRL - a.valorBRL);
    }

    return { sectors, positions, totalBRL: total, rvBRL: positionsRvBRL, rfManualBRL: rfManual };
  }, [portfolio]);

  const sorted = useMemo(() => [...sectors].sort((a, b) => b.pct - a.pct), [sectors]);
  const top3 = sorted.slice(0, 3).reduce((s, x) => s + x.pct, 0);
  const hhi = sorted.reduce((s, x) => s + (x.pct / 100) ** 2, 0);
  const effN = hhi > 0 ? 1 / hhi : 0;

  const treemapData = useMemo(() =>
    sectors
      .filter(s => s.pct > 0.5)
      .map(s => ({ name: s.setor, value: s.valorBRL, pct: s.pct, fill: sColor(s.setor) })),
    [sectors],
  );

  const pieData = useMemo(() =>
    sectors
      .filter(s => s.pct > 0.3)
      .map(s => ({ name: s.setor, value: s.valorBRL, pct: s.pct })),
    [sectors],
  );

  const topPositions = useMemo(() =>
    [...allPositions].sort((a, b) => b.valorBRL - a.valorBRL).slice(0, 15),
    [allPositions],
  );

  const toggleSector = (setor: string) => {
    setExpandedSectors(prev => {
      const next = new Set(prev);
      if (next.has(setor)) next.delete(setor); else next.add(setor);
      return next;
    });
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;
  if (!portfolio) return null;

  const rvPct = totalBRL > 0 ? (rvBRL / totalBRL) * 100 : 0;
  const rfPct = 100 - rvPct;

  return (
    <>
      <PageHeader title="Setores" description="Composição setorial do portfólio — classificação econômica (GICS)." />

      <div className="space-y-4">
        {/* ── Summary strip ── */}
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded" style={{ background: "var(--accent-wash)", color: "var(--accent)" }}>
              Fonte canônica
            </span>
            <span className="text-[10px] text-zinc-600">calcularSnapshot → getSetorEconomico</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Patrimônio</div>
              <div className="text-sm font-bold text-zinc-100">{compactBRL(totalBRL)}</div>
            </div>
            <div>
              <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Alocação</div>
              <div className="text-sm font-bold">
                <span className="text-blue-400">{rvPct.toFixed(0)}% RV</span>
                <span className="text-zinc-600 mx-1">·</span>
                <span className="text-teal-400">{rfPct.toFixed(0)}% RF</span>
              </div>
            </div>
            <div>
              <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Diversificação</div>
              <div className="text-sm font-bold text-zinc-200">{sectors.length} setores · {allPositions.length} ativos</div>
            </div>
            <div>
              <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Concentração</div>
              <div className="text-sm font-bold text-zinc-200">
                Top 3 {top3.toFixed(0)}%
                <span className="text-[10px] text-zinc-600 ml-1">N eff {effN.toFixed(1)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Charts: Treemap + Pie side by side ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Treemap */}
          {treemapData.length > 0 && (
            <div className="glass-card p-4 lg:col-span-3">
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <BarChart3 size={12} /> Mapa de Alocação
              </h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <Treemap data={treemapData} dataKey="value" nameKey="name" stroke="none" animationDuration={500}
                    content={<SectorTreemapContent />}>
                    <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
                      formatter={(v: number) => compactBRL(v)} labelFormatter={(l: string) => l} />
                  </Treemap>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Donut chart */}
          {pieData.length > 0 && (
            <div className="glass-card p-4 lg:col-span-2">
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <PieIcon size={12} /> Distribuição
              </h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      innerRadius={50} outerRadius={85} paddingAngle={1.5} stroke="none">
                      {pieData.map((d, i) => (
                        <Cell key={i} fill={sColor(d.name)} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE}
                      formatter={(v: number, _: string, entry: { payload?: { pct?: number } }) =>
                        `${compactBRL(v)} (${(entry.payload?.pct ?? 0).toFixed(1)}%)`
                      } />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                {pieData.slice(0, 8).map(d => (
                  <div key={d.name} className="flex items-center gap-1.5 text-[10px]">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sColor(d.name) }} />
                    <span className="text-zinc-400">{d.name}</span>
                    <span className="text-zinc-600 font-mono">{d.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Sector breakdown table ── */}
        <div className="glass-card p-4">
          <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Layers size={12} /> Detalhamento por Setor ({sectors.length})
          </h3>
          <div className="space-y-0.5">
            {sectors.map(s => {
              const isExpanded = expandedSectors.has(s.setor);
              return (
                <div key={s.setor}>
                  <button onClick={() => toggleSector(s.setor)}
                    className="w-full flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                    {isExpanded ? <ChevronDown size={10} className="text-zinc-500 shrink-0" /> : <ChevronRight size={10} className="text-zinc-500 shrink-0" />}
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sColor(s.setor) }} />
                    <span className="text-xs font-semibold text-zinc-200 flex-1 text-left truncate">{s.setor}</span>
                    <span className="text-[10px] text-zinc-600 font-mono shrink-0 w-6 text-right">{s.posicoes.length}</span>
                    <span className="text-xs text-zinc-300 font-mono font-bold shrink-0 w-20 text-right">{compactBRL(s.valorBRL)}</span>
                    <div className="w-16 shrink-0">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(s.pct, 100)}%`, background: sColor(s.setor) }} />
                      </div>
                    </div>
                    <span className="text-xs text-zinc-400 font-mono shrink-0 w-12 text-right">{s.pct.toFixed(1)}%</span>
                  </button>
                  {isExpanded && (
                    <div className="ml-7 mr-1 mb-2 rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.04)" }}>
                      {s.posicoes.map((p, i) => {
                        const retTotal = p.retornoTotalPct;
                        const pos = retTotal !== null && retTotal >= 0;
                        const posPct = totalBRL > 0 ? (p.valorBRL / totalBRL) * 100 : 0;
                        return (
                          <div key={p.ticker} className={`flex items-center gap-2 py-1.5 px-3 ${i % 2 === 0 ? "" : "bg-white/[0.015]"}`}>
                            <span className="text-[11px] font-bold text-zinc-300 w-20 truncate">{p.ticker}</span>
                            <span className="text-[10px] text-zinc-600 flex-1 truncate">{p.setor}</span>
                            <span className="text-[10px] text-zinc-500 font-mono w-14 text-right">{compactBRL(p.valorBRL)}</span>
                            <span className="text-[10px] text-zinc-600 font-mono w-10 text-right">{posPct.toFixed(1)}%</span>
                            {p.tipo === "RV" && retTotal !== null ? (
                              <span className={`text-[10px] font-mono font-bold w-14 text-right flex items-center justify-end gap-0.5 ${pos ? "text-emerald-400" : "text-red-400"}`}>
                                {pos ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                                {retTotal !== 0 ? `${pos ? "+" : ""}${retTotal.toFixed(1)}%` : "—"}
                              </span>
                            ) : (
                              <span className="text-[10px] text-zinc-600 w-14 text-right">{p.moeda}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Bottom row: Top Holdings + Concentration ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top 15 */}
          <div className="glass-card p-4">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Briefcase size={12} /> Top 15 Posições
            </h3>
            <div className="space-y-0.5">
              {topPositions.map((p, i) => {
                const posPct = totalBRL > 0 ? (p.valorBRL / totalBRL) * 100 : 0;
                return (
                  <div key={p.ticker} className="flex items-center gap-2 py-1">
                    <span className="text-[10px] text-zinc-700 font-mono w-4 text-right">{i + 1}</span>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sColor(p.setorEconomico) }} />
                    <span className="text-[11px] font-bold text-zinc-200 w-16 truncate">{p.ticker}</span>
                    <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(posPct * 2.5, 100)}%`, background: sColor(p.setorEconomico), opacity: 0.6 }} />
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono w-10 text-right">{posPct.toFixed(1)}%</span>
                    <span className="text-[10px] text-zinc-500 font-mono w-14 text-right">{compactBRL(p.valorBRL)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Concentration */}
          <div className="glass-card p-4">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <BarChart3 size={12} /> Concentração
            </h3>
            <div className="space-y-4">
              {[
                { label: "Top 1 setor", value: sorted[0]?.pct ?? 0 },
                { label: "Top 3 setores", value: top3 },
                { label: "Top 5 setores", value: sorted.slice(0, 5).reduce((s, x) => s + x.pct, 0) },
                { label: "# Efetivo (1/HHI)", value: effN, isCount: true },
              ].map(c => (
                <div key={c.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-zinc-400">{c.label}</span>
                    <span className="text-sm text-zinc-200 font-mono font-bold">
                      {c.isCount ? c.value.toFixed(1) : `${c.value.toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${Math.min(c.isCount ? (c.value / Math.max(sectors.length, 1)) * 100 : c.value, 100)}%`,
                      background: (!c.isCount && c.value > 60) ? "#f59e0b" : "var(--accent)",
                    }} />
                  </div>
                </div>
              ))}

              {/* Sector weight bars */}
              <div className="pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-2">Peso por setor</div>
                <div className="flex h-4 rounded-full overflow-hidden">
                  {sorted.filter(s => s.pct > 0.5).map(s => (
                    <div key={s.setor} className="h-full relative group" title={`${s.setor}: ${s.pct.toFixed(1)}%`}
                      style={{ width: `${s.pct}%`, background: sColor(s.setor), minWidth: s.pct > 2 ? undefined : 2 }}>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                  {sorted.filter(s => s.pct > 1).map(s => (
                    <div key={s.setor} className="flex items-center gap-1 text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: sColor(s.setor) }} />
                      <span className="text-zinc-500">{s.setor}</span>
                      <span className="text-zinc-600 font-mono">{s.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

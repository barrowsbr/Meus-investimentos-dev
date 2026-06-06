"use client";

import { useState, useEffect, useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  Treemap,
} from "recharts";
import {
  PieChart as PieIcon, ChevronDown, ChevronRight,
  TrendingUp, TrendingDown, Building2, Briefcase,
} from "lucide-react";
import { brl, compactBRL, pct } from "@/lib/format";
import { SETOR_ECONOMICO_COLORS } from "@/lib/gics-sectors";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";

// ── Types ────────────────────────────────────────────────────────────────────

interface Position {
  ticker: string;
  nome: string;
  setor: string;
  setorEconomico: string;
  industry: string;
  valorBRL: number;
  custoTotalBRL: number;
  lucroBRL: number;
  lucroPct: number;
  moeda: string;
  tipo: string;
}

interface SectorAgg {
  setor: string;
  valorBRL: number;
  pct: number;
  posicoes: Position[];
}

interface SectorsData {
  totalBRL: number;
  rvBRL: number;
  rfBRL: number;
  sectors: SectorAgg[];
  positions: Position[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  background: "#18181b",
  border: "1px solid #27272a",
  borderRadius: 12,
  color: "#fafafa",
  fontSize: 12,
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};

const FALLBACK_COLOR = "#64748b";

function sectorColor(name: string): string {
  return SETOR_ECONOMICO_COLORS[name] ?? FALLBACK_COLOR;
}

// ── Treemap custom content ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TreemapContent(props: any) {
  const { x, y, width, height, name, pctVal } = props;
  if (width < 40 || height < 25) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4}
        style={{ fill: sectorColor(name), stroke: "#09090b", strokeWidth: 2, opacity: 0.85 }} />
      {width > 60 && height > 35 && (
        <>
          <text x={x + 6} y={y + 15} fontSize={11} fontWeight={700} fill="#fafafa"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
            {name.length > Math.floor(width / 7) ? name.slice(0, Math.floor(width / 7)) + "…" : name}
          </text>
          <text x={x + 6} y={y + 29} fontSize={10} fill="rgba(255,255,255,0.7)">
            {pctVal?.toFixed(1)}%
          </text>
        </>
      )}
    </g>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function SetoresPage() {
  const [data, setData] = useState<SectorsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/portfolio/sectors")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleSector = (setor: string) => {
    setExpandedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(setor)) next.delete(setor);
      else next.add(setor);
      return next;
    });
  };

  const treemapData = useMemo(() => {
    if (!data) return [];
    return data.sectors.map((s) => ({
      name: s.setor,
      value: s.valorBRL,
      pctVal: s.pct,
      fill: sectorColor(s.setor),
    }));
  }, [data]);

  const pieData = useMemo(() => {
    if (!data) return [];
    return data.sectors.map((s) => ({
      name: s.setor,
      value: s.valorBRL,
      pct: s.pct,
    }));
  }, [data]);

  // Industry sub-breakdown
  const industryBreakdown = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { industry: string; setor: string; valorBRL: number; count: number }>();
    for (const p of data.positions) {
      if (!p.industry) continue;
      const key = `${p.setorEconomico}|${p.industry}`;
      const existing = map.get(key);
      if (existing) {
        existing.valorBRL += p.valorBRL;
        existing.count++;
      } else {
        map.set(key, { industry: p.industry, setor: p.setorEconomico, valorBRL: p.valorBRL, count: 1 });
      }
    }
    return [...map.values()].sort((a, b) => b.valorBRL - a.valorBRL);
  }, [data]);

  if (loading) return <LoadingSpinner />;

  if (error || !data) {
    return (
      <>
        <PageHeader title="Setores" description="Alocação por setor econômico" />
        <div className="glass-card p-8 text-center">
          <p className="text-sm text-red-400">{error ?? "Erro ao carregar dados"}</p>
        </div>
      </>
    );
  }

  const rvPct = data.totalBRL > 0 ? (data.rvBRL / data.totalBRL) * 100 : 0;
  const rfPct = data.totalBRL > 0 ? (data.rfBRL / data.totalBRL) * 100 : 0;

  return (
    <>
      <PageHeader title="Setores" description="Alocação da carteira completa por setor econômico" />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard
          icon={Briefcase}
          label="Patrimônio Total"
          value={compactBRL(data.totalBRL)}
        />
        <SummaryCard
          icon={TrendingUp}
          label="Renda Variável"
          value={compactBRL(data.rvBRL)}
          sub={pct(rvPct, 1)}
        />
        <SummaryCard
          icon={Building2}
          label="Renda Fixa + Caixa"
          value={compactBRL(data.rfBRL)}
          sub={pct(rfPct, 1)}
        />
        <SummaryCard
          icon={PieIcon}
          label="Setores"
          value={String(data.sectors.length)}
          sub={`${data.positions.length} ativos`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Treemap + Pie */}
        <div className="lg:col-span-2 space-y-6">
          {/* Treemap */}
          <div className="glass-card p-5">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
              Mapa de Alocação
            </h2>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <Treemap
                  data={treemapData}
                  dataKey="value"
                  nameKey="name"
                  stroke="none"
                  animationDuration={500}
                  content={<TreemapContent />}
                >
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number) => compactBRL(v)}
                    labelFormatter={(l: string) => l}
                  />
                </Treemap>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Sector breakdown table */}
          <div className="glass-card p-5">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
              Detalhamento por Setor
            </h2>
            <div className="space-y-1">
              {data.sectors.map((s) => {
                const isExpanded = expandedSectors.has(s.setor);
                return (
                  <div key={s.setor}>
                    <button
                      onClick={() => toggleSector(s.setor)}
                      className="w-full flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-white/[0.03] transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown size={12} className="text-zinc-500 shrink-0" />
                      ) : (
                        <ChevronRight size={12} className="text-zinc-500 shrink-0" />
                      )}
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: sectorColor(s.setor) }}
                      />
                      <span className="text-xs font-semibold text-zinc-200 flex-1 text-left">
                        {s.setor}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono shrink-0 w-8 text-right">
                        {s.posicoes.length}
                      </span>
                      <span className="text-xs text-zinc-300 font-mono font-bold shrink-0 w-24 text-right">
                        {compactBRL(s.valorBRL)}
                      </span>
                      <div className="w-16 shrink-0">
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${Math.min(s.pct, 100)}%`, background: sectorColor(s.setor) }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-zinc-400 font-mono shrink-0 w-14 text-right">
                        {s.pct.toFixed(1)}%
                      </span>
                    </button>

                    {/* Expanded positions */}
                    {isExpanded && (
                      <div className="ml-8 mr-2 mb-2">
                        {s.posicoes.map((p) => {
                          const positivePnL = p.lucroBRL >= 0;
                          return (
                            <div
                              key={p.ticker}
                              className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-white/[0.02] transition-colors"
                            >
                              <span className="text-xs font-bold text-zinc-300 w-20 truncate">
                                {p.ticker}
                              </span>
                              <span className="text-[10px] text-zinc-600 flex-1 truncate">
                                {p.nome !== p.ticker ? p.nome : p.industry}
                              </span>
                              <span className="text-[10px] text-zinc-500 font-mono w-16 text-right">
                                {compactBRL(p.valorBRL)}
                              </span>
                              <span className="text-[10px] text-zinc-600 font-mono w-12 text-right">
                                {data.totalBRL > 0 ? ((p.valorBRL / data.totalBRL) * 100).toFixed(1) : "0.0"}%
                              </span>
                              {p.tipo === "RV" && (
                                <span
                                  className={`text-[10px] font-mono font-bold w-16 text-right flex items-center justify-end gap-0.5 ${
                                    positivePnL ? "text-emerald-400" : "text-red-400"
                                  }`}
                                >
                                  {positivePnL ? (
                                    <TrendingUp size={9} />
                                  ) : (
                                    <TrendingDown size={9} />
                                  )}
                                  {p.lucroPct !== 0 ? `${positivePnL ? "+" : ""}${p.lucroPct.toFixed(1)}%` : "—"}
                                </span>
                              )}
                              {p.tipo !== "RV" && (
                                <span className="text-[10px] text-zinc-600 w-16 text-right">
                                  {p.moeda}
                                </span>
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

          {/* Industry breakdown */}
          {industryBreakdown.length > 0 && (
            <div className="glass-card p-5">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
                Detalhamento por Indústria
              </h2>
              <div className="space-y-1">
                {industryBreakdown.slice(0, 20).map((ind) => (
                  <div
                    key={`${ind.setor}|${ind.industry}`}
                    className="flex items-center gap-3 py-1.5 px-2"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: sectorColor(ind.setor) }}
                    />
                    <span className="text-xs text-zinc-300 flex-1 truncate">
                      {ind.industry}
                    </span>
                    <span className="text-[9px] text-zinc-600 shrink-0">{ind.setor}</span>
                    <span className="text-xs text-zinc-300 font-mono font-bold shrink-0 w-20 text-right">
                      {compactBRL(ind.valorBRL)}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono shrink-0 w-12 text-right">
                      {data.totalBRL > 0 ? ((ind.valorBRL / data.totalBRL) * 100).toFixed(1) : "0.0"}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Donut + Top positions */}
        <div className="space-y-6">
          {/* Donut */}
          <div className="glass-card p-5">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Alocação por Setor
            </h2>
            <div className="flex justify-center">
              <div className="w-[200px] h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      dataKey="value"
                      stroke="none"
                      paddingAngle={1}
                    >
                      {pieData.map((e) => (
                        <Cell key={e.name} fill={sectorColor(e.name)} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number) => compactBRL(v)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-4 space-y-1.5">
              {data.sectors.map((s) => (
                <div key={s.setor} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: sectorColor(s.setor) }}
                  />
                  <span className="text-zinc-400 truncate flex-1">{s.setor}</span>
                  <span className="text-zinc-300 font-mono tabular-nums shrink-0 font-bold">
                    {s.pct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Top 15 positions */}
          <div className="glass-card p-5">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Top 15 Posições
            </h2>
            <div className="space-y-1">
              {data.positions.slice(0, 15).map((p) => {
                const posPct = data.totalBRL > 0 ? (p.valorBRL / data.totalBRL) * 100 : 0;
                return (
                  <div key={p.ticker} className="flex items-center gap-2 py-1">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: sectorColor(p.setorEconomico) }}
                    />
                    <span className="text-xs font-bold text-zinc-200 w-20 truncate">
                      {p.ticker}
                    </span>
                    <div
                      className="flex-1 h-1.5 rounded-full overflow-hidden"
                      style={{ background: "rgba(255,255,255,0.04)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(posPct * 2.5, 100)}%`,
                          background: sectorColor(p.setorEconomico),
                          opacity: 0.6,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono w-12 text-right">
                      {posPct.toFixed(1)}%
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono w-16 text-right">
                      {compactBRL(p.valorBRL)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Concentration metrics */}
          <div className="glass-card p-5">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Concentração
            </h2>
            {(() => {
              const sorted = [...data.sectors].sort((a, b) => b.pct - a.pct);
              const top1 = sorted[0]?.pct ?? 0;
              const top3 = sorted.slice(0, 3).reduce((s, x) => s + x.pct, 0);
              const top5 = sorted.slice(0, 5).reduce((s, x) => s + x.pct, 0);
              const hhi = sorted.reduce((s, x) => s + (x.pct / 100) ** 2, 0);
              const effN = hhi > 0 ? 1 / hhi : 0;
              return (
                <div className="space-y-3">
                  <ConcentrationRow label="Top 1 setor" value={`${top1.toFixed(1)}%`} bar={top1} />
                  <ConcentrationRow label="Top 3 setores" value={`${top3.toFixed(1)}%`} bar={top3} />
                  <ConcentrationRow label="Top 5 setores" value={`${top5.toFixed(1)}%`} bar={top5} />
                  <ConcentrationRow label="# Efetivo (1/HHI)" value={effN.toFixed(1)} bar={(effN / sorted.length) * 100} />
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Helper components ────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-zinc-500" />
        <span className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold">
          {label}
        </span>
      </div>
      <div className="text-lg font-bold text-zinc-100">{value}</div>
      {sub && <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ConcentrationRow({
  label,
  value,
  bar,
}: {
  label: string;
  value: string;
  bar: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-zinc-500">{label}</span>
        <span className="text-xs text-zinc-300 font-mono font-bold">{value}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(bar, 100)}%`, background: bar > 60 ? "#f59e0b" : "#3b82f6" }}
        />
      </div>
    </div>
  );
}

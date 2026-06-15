"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import {
  Zap, Plus, Trash2, TrendingUp, TrendingDown,
  Target, Clock, BarChart2,
} from "lucide-react";
import { compactBRL } from "@/lib/format";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import PageHeader from "@/components/PageHeader";

const TOOLTIP_STYLE = {
  background: "#18181b",
  border: "1px solid #27272a",
  borderRadius: 12,
  color: "#fafafa",
  fontSize: 12,
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};

interface Trade {
  id: string;
  tipo: "day-trade" | "swing";
  ativo: string;
  direcao: "long" | "short";
  entrada: number;
  saida: number;
  quantidade: number;
  data: string;
  moeda: string;
  notas: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [filterTipo, setFilterTipo] = useState<"todos" | "day-trade" | "swing">("todos");

  const addTrade = () => {
    setTrades(prev => [...prev, {
      id: uid(),
      tipo: "day-trade",
      ativo: "",
      direcao: "long",
      entrada: 0,
      saida: 0,
      quantidade: 0,
      data: new Date().toISOString().split("T")[0],
      moeda: "BRL",
      notas: "",
    }]);
  };

  const removeTrade = (id: string) => setTrades(prev => prev.filter(t => t.id !== id));

  const updateTrade = (id: string, field: keyof Trade, value: string | number) => {
    setTrades(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const filteredTrades = useMemo(() => {
    if (filterTipo === "todos") return trades;
    return trades.filter(t => t.tipo === filterTipo);
  }, [trades, filterTipo]);

  const stats = useMemo(() => {
    const completed = filteredTrades.filter(t => t.entrada > 0 && t.saida > 0 && t.quantidade > 0);
    const results = completed.map(t => {
      const diff = t.direcao === "long" ? t.saida - t.entrada : t.entrada - t.saida;
      return { ...t, pnl: diff * t.quantidade, pnlPct: t.entrada > 0 ? (diff / t.entrada) * 100 : 0 };
    });

    const wins = results.filter(r => r.pnl > 0);
    const losses = results.filter(r => r.pnl < 0);
    const totalPnl = results.reduce((s, r) => s + r.pnl, 0);
    const winRate = completed.length > 0 ? (wins.length / completed.length) * 100 : 0;
    const avgWin = wins.length > 0 ? wins.reduce((s, w) => s + w.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, l) => s + l.pnl, 0) / losses.length) : 0;
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;
    const avgPnlPct = completed.length > 0 ? results.reduce((s, r) => s + r.pnlPct, 0) / completed.length : 0;
    const maxWin = wins.length > 0 ? Math.max(...wins.map(w => w.pnl)) : 0;
    const maxLoss = losses.length > 0 ? Math.min(...losses.map(l => l.pnl)) : 0;

    return {
      total: completed.length,
      totalPnl,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      avgPnlPct,
      maxWin,
      maxLoss,
      results,
    };
  }, [filteredTrades]);

  const chartData = useMemo(() => {
    return stats.results.map((r, i) => ({
      name: `#${i + 1}`,
      ativo: r.ativo,
      pnl: r.pnl,
      fill: r.pnl >= 0 ? "#22c55e" : "#ef4444",
    }));
  }, [stats.results]);

  return (
    <>
      <PageHeader
        title="Day Trade & Swing Trade"
        description="Performance de operações de curto prazo — apartado dos investimentos de longo prazo"
      />

      {/* Filter tabs */}
      <div className="flex gap-1 bg-zinc-900/60 p-1 rounded-lg w-fit mb-6">
        {([["todos", "Todos"], ["day-trade", "Day Trade"], ["swing", "Swing Trade"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilterTipo(id)}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
              filterTipo === id ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      {stats.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <KpiCard
            icon={stats.totalPnl >= 0 ? TrendingUp : TrendingDown}
            label="P&L Total"
            value={compactBRL(stats.totalPnl)}
            color={stats.totalPnl >= 0 ? "#22c55e" : "#ef4444"}
          />
          <KpiCard
            icon={Target}
            label="Win Rate"
            value={`${stats.winRate.toFixed(1)}%`}
            color={stats.winRate >= 50 ? "#22c55e" : "#f59e0b"}
          />
          <KpiCard
            icon={BarChart2}
            label="Profit Factor"
            value={stats.profitFactor > 0 ? `${stats.profitFactor.toFixed(2)}x` : "—"}
            color={stats.profitFactor >= 1.5 ? "#22c55e" : stats.profitFactor >= 1 ? "#f59e0b" : "#ef4444"}
          />
          <KpiCard
            icon={TrendingUp}
            label="Ganho Médio"
            value={compactBRL(stats.avgWin)}
            color="#22c55e"
          />
          <KpiCard
            icon={TrendingDown}
            label="Perda Média"
            value={compactBRL(stats.avgLoss)}
            color="#ef4444"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Trade entry */}
        <div className="lg:col-span-1">
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-amber-400" />
                <span className="text-xs font-semibold text-zinc-400">Operações</span>
              </div>
              <button
                onClick={addTrade}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all"
                style={{ background: "rgba(232,163,61,0.1)", border: "1px solid rgba(232,163,61,0.2)", color: "#E8A33D" }}
              >
                <Plus size={12} /> Nova
              </button>
            </div>

            {trades.length === 0 ? (
              <div className="py-8 text-center">
                <Zap size={28} className="text-zinc-700 mx-auto mb-2" />
                <p className="text-xs text-zinc-600 mb-1">Nenhuma operação registrada</p>
                <p className="text-[10px] text-zinc-700">Registre day trades e swing trades para acompanhar a performance</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto scrollbar-hide">
                {trades.map(t => {
                  const pnl = t.entrada > 0 && t.saida > 0 && t.quantidade > 0
                    ? (t.direcao === "long" ? t.saida - t.entrada : t.entrada - t.saida) * t.quantidade
                    : null;
                  return (
                    <div key={t.id} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <div className="flex items-center gap-2 mb-2">
                        <select
                          value={t.tipo}
                          onChange={e => updateTrade(t.id, "tipo", e.target.value)}
                          className="bg-transparent text-[10px] font-bold rounded-md px-2 py-1 outline-none cursor-pointer"
                          style={{ border: "1px solid rgba(232,163,61,0.3)", color: t.tipo === "day-trade" ? "#f59e0b" : "#8b5cf6" }}
                        >
                          <option value="day-trade">Day Trade</option>
                          <option value="swing">Swing</option>
                        </select>
                        <select
                          value={t.direcao}
                          onChange={e => updateTrade(t.id, "direcao", e.target.value)}
                          className="bg-transparent text-[10px] font-bold rounded-md px-1.5 py-1 outline-none cursor-pointer"
                          style={{ border: `1px solid ${t.direcao === "long" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, color: t.direcao === "long" ? "#4ade80" : "#f87171" }}
                        >
                          <option value="long">Long</option>
                          <option value="short">Short</option>
                        </select>
                        <input
                          type="text"
                          value={t.ativo}
                          onChange={e => updateTrade(t.id, "ativo", e.target.value.toUpperCase())}
                          placeholder="TICKER"
                          className="flex-1 bg-transparent text-xs font-bold text-zinc-100 outline-none border-b border-zinc-800 focus:border-amber-400/30 px-1 py-1 uppercase"
                        />
                        <button onClick={() => removeTrade(t.id)} className="text-zinc-600 hover:text-red-400 transition-colors p-1">
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <label className="text-[9px] text-zinc-600 uppercase">Entrada</label>
                          <input type="number" value={t.entrada || ""} onChange={e => updateTrade(t.id, "entrada", Number(e.target.value))}
                            className="w-full bg-transparent text-xs text-zinc-200 outline-none border-b border-zinc-800 focus:border-amber-400/30 py-0.5 font-mono" placeholder="0" min={0} step={0.01} />
                        </div>
                        <div>
                          <label className="text-[9px] text-zinc-600 uppercase">Saída</label>
                          <input type="number" value={t.saida || ""} onChange={e => updateTrade(t.id, "saida", Number(e.target.value))}
                            className="w-full bg-transparent text-xs text-zinc-200 outline-none border-b border-zinc-800 focus:border-amber-400/30 py-0.5 font-mono" placeholder="0" min={0} step={0.01} />
                        </div>
                        <div>
                          <label className="text-[9px] text-zinc-600 uppercase">Qtd</label>
                          <input type="number" value={t.quantidade || ""} onChange={e => updateTrade(t.id, "quantidade", Number(e.target.value))}
                            className="w-full bg-transparent text-xs text-zinc-200 outline-none border-b border-zinc-800 focus:border-amber-400/30 py-0.5 font-mono" placeholder="0" min={0} />
                        </div>
                        <div>
                          <label className="text-[9px] text-zinc-600 uppercase">Data</label>
                          <input type="date" value={t.data} onChange={e => updateTrade(t.id, "data", e.target.value)}
                            className="w-full bg-transparent text-xs text-zinc-200 outline-none border-b border-zinc-800 focus:border-amber-400/30 py-0.5 font-mono" />
                        </div>
                      </div>
                      {pnl !== null && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className={`text-xs font-bold font-mono ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {pnl >= 0 ? "+" : ""}{compactBRL(pnl)}
                          </span>
                          <span className="text-[10px] text-zinc-600">
                            {t.entrada > 0 ? `${((t.direcao === "long" ? t.saida - t.entrada : t.entrada - t.saida) / t.entrada * 100).toFixed(2)}%` : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Charts & analytics */}
        <div className="lg:col-span-2 space-y-6">
          {/* P&L chart */}
          {chartData.length > 0 && (
            <div className="glass-card p-5">
              <h2 className="text-xs font-semibold text-zinc-300 mb-4">P&L por Operação</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} />
                    <YAxis tickFormatter={(v: number) => compactBRL(v)} tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => compactBRL(v)} labelFormatter={(l: string) => {
                      const idx = parseInt(l.replace("#", "")) - 1;
                      return chartData[idx]?.ativo || l;
                    }} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                      {chartData.map((e, i) => (
                        <Cell key={i} fill={e.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Trade log */}
          {stats.results.length > 0 && (
            <div className="glass-card p-5">
              <h2 className="text-xs font-semibold text-zinc-300 mb-4">
                Log de Operações ({stats.results.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Data</th>
                      <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Tipo</th>
                      <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Ativo</th>
                      <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Dir.</th>
                      <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Entrada</th>
                      <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Saída</th>
                      <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">P&L</th>
                      <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.results.map(r => (
                      <tr key={r.id} className="border-b border-zinc-900 hover:bg-white/[0.02]">
                        <td className="py-1.5 px-2 text-zinc-500 font-mono">{r.data}</td>
                        <td className="py-1.5 px-2">
                          <span className="text-[9px] px-1.5 py-0.5 rounded-md font-semibold"
                            style={{
                              backgroundColor: r.tipo === "day-trade" ? "rgba(245,158,11,0.12)" : "rgba(139,92,246,0.12)",
                              color: r.tipo === "day-trade" ? "#f59e0b" : "#8b5cf6",
                            }}
                          >
                            {r.tipo === "day-trade" ? "DT" : "SW"}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-zinc-200 font-semibold">{r.ativo}</td>
                        <td className="py-1.5 px-2">
                          <span className={`text-[10px] font-bold ${r.direcao === "long" ? "text-emerald-400" : "text-red-400"}`}>
                            {r.direcao === "long" ? "L" : "S"}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right text-zinc-400 font-mono">{r.entrada.toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-right text-zinc-400 font-mono">{r.saida.toFixed(2)}</td>
                        <td className={`py-1.5 px-2 text-right font-mono font-bold ${r.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {r.pnl >= 0 ? "+" : ""}{compactBRL(r.pnl)}
                        </td>
                        <td className={`py-1.5 px-2 text-right font-mono ${r.pnlPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {r.pnlPct >= 0 ? "+" : ""}{r.pnlPct.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Stats breakdown */}
          {stats.total > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="glass-card p-4">
                <h3 className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold mb-3">Melhor Operação</h3>
                <div className="text-lg font-bold text-emerald-400 font-mono">{compactBRL(stats.maxWin)}</div>
              </div>
              <div className="glass-card p-4">
                <h3 className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold mb-3">Pior Operação</h3>
                <div className="text-lg font-bold text-red-400 font-mono">{compactBRL(stats.maxLoss)}</div>
              </div>
            </div>
          )}

          {/* Empty state / future */}
          {stats.total === 0 && (
            <div className="glass-card p-8 text-center">
              <Zap size={32} className="text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-400 font-semibold mb-1">Registre suas operações</p>
              <p className="text-xs text-zinc-600 mb-4">
                Acompanhe day trades e swing trades separadamente dos investimentos de longo prazo
              </p>
            </div>
          )}

          <div className="glass-card p-5 text-center" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold mb-1">Em breve</p>
            <p className="text-xs text-zinc-500">
              Integração com planilha GSheets, gráfico de equity curve, análise por ativo/horário,
              drawdown máximo, expectativa matemática, journal de operações
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function KpiCard({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<any>;
  label: string; value: string; color: string;
}) {
  return (
    <div className="glass-card p-3 text-center">
      <div className="flex items-center justify-center gap-1.5 mb-1">
        <Icon size={12} style={{ color }} />
        <span className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <div className="text-sm font-bold font-mono" style={{ color }}>{value}</div>
    </div>
  );
}


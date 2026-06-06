"use client";

import { useState, useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  Scale, TrendingUp, TrendingDown, AlertTriangle,
  DollarSign, Landmark, ShieldAlert, Plus, Trash2,
} from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { compactBRL, pct } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";

const TOOLTIP_STYLE = {
  background: "#18181b",
  border: "1px solid #27272a",
  borderRadius: 12,
  color: "#fafafa",
  fontSize: 12,
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};

interface MarginPosition {
  id: string;
  descricao: string;
  tipo: "emprestimo" | "margin" | "financiamento";
  valor: number;
  taxa: number;
  moeda: string;
  vencimento: string;
  corretora: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const TIPO_LABELS: Record<string, string> = {
  emprestimo: "Empréstimo Margin",
  margin: "Margin Utilizada",
  financiamento: "Financiamento",
};

const TIPO_COLORS: Record<string, string> = {
  emprestimo: "#ef4444",
  margin: "#f59e0b",
  financiamento: "#8b5cf6",
};

export default function AlavancagemPage() {
  const { data, loading } = usePortfolio();
  const [passivos, setPassivos] = useState<MarginPosition[]>([]);

  const addPassivo = () => {
    setPassivos(prev => [...prev, {
      id: uid(),
      descricao: "",
      tipo: "margin",
      valor: 0,
      taxa: 0,
      moeda: "BRL",
      vencimento: "",
      corretora: "",
    }]);
  };

  const removePassivo = (id: string) => {
    setPassivos(prev => prev.filter(p => p.id !== id));
  };

  const updatePassivo = (id: string, field: keyof MarginPosition, value: string | number) => {
    setPassivos(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const metrics = useMemo(() => {
    const patrimonioBruto = data?.totalPatrimonioBRL ?? 0;
    const usd = data?.usdbrl ?? 5.7;
    const fxMap: Record<string, number> = { BRL: 1, USD: usd };

    const totalPassivos = passivos.reduce((s, p) => {
      const fx = fxMap[p.moeda] ?? 1;
      return s + (p.valor * fx);
    }, 0);

    const patrimonioLiquido = patrimonioBruto - totalPassivos;
    const alavancagem = patrimonioLiquido > 0 ? patrimonioBruto / patrimonioLiquido : 0;
    const debtToEquity = patrimonioLiquido > 0 ? totalPassivos / patrimonioLiquido : 0;
    const custoAnual = passivos.reduce((s, p) => {
      const fx = fxMap[p.moeda] ?? 1;
      return s + (p.valor * fx * (p.taxa / 100));
    }, 0);
    const custoMensal = custoAnual / 12;
    const marginPct = patrimonioBruto > 0 ? (totalPassivos / patrimonioBruto) * 100 : 0;

    return {
      patrimonioBruto,
      totalPassivos,
      patrimonioLiquido,
      alavancagem,
      debtToEquity,
      custoAnual,
      custoMensal,
      marginPct,
    };
  }, [data, passivos]);

  const breakdownData = useMemo(() => {
    const usd = data?.usdbrl ?? 5.7;
    const fxMap: Record<string, number> = { BRL: 1, USD: usd };
    const byTipo: Record<string, number> = {};
    for (const p of passivos) {
      if (p.valor <= 0) continue;
      const fx = fxMap[p.moeda] ?? 1;
      const label = TIPO_LABELS[p.tipo] ?? p.tipo;
      byTipo[label] = (byTipo[label] ?? 0) + p.valor * fx;
    }
    return Object.entries(byTipo).map(([name, value]) => ({ name, value }));
  }, [passivos, data]);

  const leverageGauge = useMemo(() => {
    const lev = metrics.alavancagem;
    if (lev <= 0) return { color: "#71717a", label: "N/A", risk: "Sem dados" };
    if (lev <= 1.0) return { color: "#22c55e", label: `${lev.toFixed(2)}x`, risk: "Sem alavancagem" };
    if (lev <= 1.5) return { color: "#22c55e", label: `${lev.toFixed(2)}x`, risk: "Conservador" };
    if (lev <= 2.0) return { color: "#f59e0b", label: `${lev.toFixed(2)}x`, risk: "Moderado" };
    if (lev <= 3.0) return { color: "#f97316", label: `${lev.toFixed(2)}x`, risk: "Agressivo" };
    return { color: "#ef4444", label: `${lev.toFixed(2)}x`, risk: "Alto Risco" };
  }, [metrics.alavancagem]);

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <PageHeader
        title="Alavancagem & Margin"
        description="Patrimônio líquido = ativos − passivos. Controle de margin e custo de financiamento"
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard
          icon={DollarSign}
          label="Patrimônio Bruto"
          value={compactBRL(metrics.patrimonioBruto)}
          sub="Total investido"
          color="#3b82f6"
        />
        <KpiCard
          icon={TrendingDown}
          label="Total Passivos"
          value={metrics.totalPassivos > 0 ? `-${compactBRL(metrics.totalPassivos)}` : "R$ 0"}
          sub={metrics.totalPassivos > 0 ? `${metrics.marginPct.toFixed(1)}% do bruto` : "Sem dívidas"}
          color="#ef4444"
        />
        <KpiCard
          icon={TrendingUp}
          label="Patrimônio Líquido"
          value={compactBRL(metrics.patrimonioLiquido)}
          sub="Ativos − Passivos"
          color="#22c55e"
        />
        <KpiCard
          icon={Scale}
          label="Alavancagem"
          value={leverageGauge.label}
          sub={leverageGauge.risk}
          color={leverageGauge.color}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Passivos editor */}
        <div className="lg:col-span-1">
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Landmark size={14} className="text-red-400" />
                <span className="text-xs font-semibold text-zinc-400">Passivos & Margin</span>
              </div>
              <button
                onClick={addPassivo}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
              >
                <Plus size={12} /> Adicionar
              </button>
            </div>

            {passivos.length === 0 ? (
              <div className="py-8 text-center">
                <ShieldAlert size={28} className="text-zinc-700 mx-auto mb-2" />
                <p className="text-xs text-zinc-600 mb-1">Nenhum passivo registrado</p>
                <p className="text-[10px] text-zinc-700">
                  Adicione empréstimos margin, financiamentos e dívidas
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {passivos.map(p => (
                  <div key={p.id} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <select
                        value={p.tipo}
                        onChange={e => updatePassivo(p.id, "tipo", e.target.value)}
                        className="bg-transparent text-xs font-bold rounded-md px-2 py-1 outline-none cursor-pointer"
                        style={{ border: "1px solid rgba(239,68,68,0.3)", color: TIPO_COLORS[p.tipo] ?? "#f87171" }}
                      >
                        <option value="margin">Margin</option>
                        <option value="emprestimo">Empréstimo</option>
                        <option value="financiamento">Financiamento</option>
                      </select>
                      <input
                        type="text"
                        value={p.descricao}
                        onChange={e => updatePassivo(p.id, "descricao", e.target.value)}
                        placeholder="Descrição"
                        className="flex-1 bg-transparent text-xs text-zinc-100 outline-none border-b border-zinc-800 focus:border-red-400/30 px-1 py-1"
                      />
                      <button onClick={() => removePassivo(p.id)} className="text-zinc-600 hover:text-red-400 transition-colors p-1">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[9px] text-zinc-600 uppercase tracking-wider">Valor</label>
                        <input
                          type="number"
                          value={p.valor || ""}
                          onChange={e => updatePassivo(p.id, "valor", Number(e.target.value))}
                          className="w-full bg-transparent text-xs text-zinc-200 outline-none border-b border-zinc-800 focus:border-red-400/30 py-0.5 font-mono"
                          placeholder="0"
                          min={0}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-zinc-600 uppercase tracking-wider">Taxa % a.a.</label>
                        <input
                          type="number"
                          value={p.taxa || ""}
                          onChange={e => updatePassivo(p.id, "taxa", Number(e.target.value))}
                          className="w-full bg-transparent text-xs text-zinc-200 outline-none border-b border-zinc-800 focus:border-red-400/30 py-0.5 font-mono"
                          placeholder="0"
                          min={0}
                          step={0.1}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-zinc-600 uppercase tracking-wider">Moeda</label>
                        <select
                          value={p.moeda}
                          onChange={e => updatePassivo(p.id, "moeda", e.target.value)}
                          className="w-full bg-transparent text-xs text-zinc-200 outline-none border-b border-zinc-800 py-0.5"
                        >
                          <option value="BRL">BRL</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <label className="text-[9px] text-zinc-600 uppercase tracking-wider">Corretora</label>
                        <input
                          type="text"
                          value={p.corretora}
                          onChange={e => updatePassivo(p.id, "corretora", e.target.value)}
                          className="w-full bg-transparent text-xs text-zinc-200 outline-none border-b border-zinc-800 focus:border-red-400/30 py-0.5"
                          placeholder="Ex: IBKR"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-zinc-600 uppercase tracking-wider">Vencimento</label>
                        <input
                          type="text"
                          value={p.vencimento}
                          onChange={e => updatePassivo(p.id, "vencimento", e.target.value)}
                          className="w-full bg-transparent text-xs text-zinc-200 outline-none border-b border-zinc-800 focus:border-red-400/30 py-0.5"
                          placeholder="Revolving"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Dashboard */}
        <div className="lg:col-span-2 space-y-6">
          {/* Equity waterfall */}
          <div className="glass-card p-5">
            <h2 className="text-xs font-semibold text-zinc-300 mb-4">Composição Patrimonial</h2>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: "Ativos", value: metrics.patrimonioBruto, fill: "#3b82f6" },
                    { name: "Passivos", value: -metrics.totalPassivos, fill: "#ef4444" },
                    { name: "Líquido", value: metrics.patrimonioLiquido, fill: "#22c55e" },
                  ]}
                  layout="vertical"
                  margin={{ left: 70, right: 10, top: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v: number) => compactBRL(Math.abs(v))} tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => compactBRL(Math.abs(v))} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {[
                      { fill: "#3b82f6" },
                      { fill: "#ef4444" },
                      { fill: "#22c55e" },
                    ].map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Cost & risk metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Custo Mensal" value={compactBRL(metrics.custoMensal)} />
            <MetricCard label="Custo Anual" value={compactBRL(metrics.custoAnual)} />
            <MetricCard label="Debt / Equity" value={`${metrics.debtToEquity.toFixed(2)}x`} />
            <MetricCard label="Margin Utilizada" value={`${metrics.marginPct.toFixed(1)}%`} />
          </div>

          {/* Breakdown by type */}
          {breakdownData.length > 0 && (
            <div className="glass-card p-5">
              <h2 className="text-xs font-semibold text-zinc-300 mb-4">Breakdown por Tipo</h2>
              <div className="flex items-center gap-6">
                <div className="w-[140px] h-[140px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={breakdownData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" stroke="none" paddingAngle={2}>
                        {breakdownData.map((e, i) => (
                          <Cell key={i} fill={Object.values(TIPO_COLORS)[i % 3]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => compactBRL(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2">
                  {breakdownData.map((e, i) => (
                    <div key={e.name} className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: Object.values(TIPO_COLORS)[i % 3] }} />
                      <span className="text-zinc-400 flex-1">{e.name}</span>
                      <span className="text-zinc-200 font-mono font-semibold">{compactBRL(e.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Risk alerts */}
          {metrics.alavancagem > 2 && (
            <div className="glass-card p-4 flex items-start gap-3" style={{ borderColor: "rgba(239,68,68,0.3)" }}>
              <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-400 mb-0.5">Alavancagem Elevada</p>
                <p className="text-[10px] text-zinc-400">
                  Com {leverageGauge.label} de alavancagem, uma queda de {(100 / metrics.alavancagem).toFixed(0)}% nos ativos
                  zeraria seu patrimônio líquido. Considere reduzir a exposição.
                </p>
              </div>
            </div>
          )}

          {/* Future placeholder */}
          <div className="glass-card p-5 text-center" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold mb-1">Em breve</p>
            <p className="text-xs text-zinc-500">
              Histórico de margin, simulação de margin call, cenários de stress test,
              integração automática com corretoras (IBKR margin account)
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ComponentType<any>;
  label: string; value: string; sub: string; color: string;
}) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} style={{ color }} />
        <span className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <div className="text-lg font-bold text-zinc-100" style={{ color }}>{value}</div>
      <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card p-3 text-center">
      <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">{label}</div>
      <div className="text-sm font-bold text-zinc-100">{value}</div>
    </div>
  );
}

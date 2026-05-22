"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Wallet, TrendingUp, Landmark, Coins, DollarSign, BarChart3 } from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { brl, shortMonth } from "@/lib/format";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

const COLORS = [
  "#d4a574", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b",
  "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#f97316",
];

export default function Dashboard() {
  const { data, loading, error } = usePortfolio();

  const monthlyDividends = useMemo(() => {
    if (!data?.proventosMensais) return [];
    return Object.entries(data.proventosMensais)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, total]) => ({ month: shortMonth(month), total }));
  }, [data]);

  const allocation = useMemo(() => {
    if (!data?.positions) return [];
    return data.positions
      .filter((p) => p.valorAtualBRL > 0)
      .map((p) => ({ name: p.ticker, value: p.valorAtualBRL }))
      .slice(0, 10);
  }, [data]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return <ErrorAlert message="Dados não disponíveis" />;

  const lucroPctStr = data.lucroPct >= 0
    ? `+${data.lucroPct.toFixed(1)}%`
    : `${data.lucroPct.toFixed(1)}%`;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Visão geral dos seus investimentos"
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <MetricCard
          label="Patrimônio Total"
          value={brl(data.patrimonioBRL)}
          sub="Renda variável + fixa"
          icon={<Wallet size={18} />}
        />
        <MetricCard
          label="Renda Variável"
          value={brl(data.totalAtualBRL)}
          sub={`${data.positions.length} ativos`}
          icon={<BarChart3 size={18} />}
        />
        <MetricCard
          label="Renda Fixa"
          value={brl(data.totalRendaFixaBRL)}
          icon={<Landmark size={18} />}
        />
        <MetricCard
          label="Lucro/Prejuízo"
          value={brl(data.lucroBRL)}
          sub={lucroPctStr}
          icon={<TrendingUp size={18} />}
        />
        <MetricCard
          label="Proventos"
          value={brl(data.totalProventosBRL)}
          icon={<Coins size={18} />}
        />
        <MetricCard
          label="Dólar (USD/BRL)"
          value={`R$ ${data.usdbrl.toFixed(2)}`}
          icon={<DollarSign size={18} />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="glass-card p-5 lg:col-span-2">
          <h2 className="text-sm font-medium text-zinc-400 mb-4">
            Proventos Mensais (últimos 12 meses)
          </h2>
          {monthlyDividends.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyDividends}>
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: 12,
                    color: "#fafafa",
                    fontSize: 13,
                  }}
                  formatter={(v: number) => [brl(v), "Total"]}
                />
                <Bar dataKey="total" fill="#d4a574" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-zinc-600 text-sm">Sem dados de proventos.</p>
          )}
        </div>

        <div className="glass-card p-5">
          <h2 className="text-sm font-medium text-zinc-400 mb-4">
            Alocação (valor atual)
          </h2>
          {allocation.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={allocation}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    stroke="none"
                  >
                    {allocation.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#18181b",
                      border: "1px solid #27272a",
                      borderRadius: 12,
                      color: "#fafafa",
                      fontSize: 13,
                    }}
                    formatter={(v: number) => [brl(v), "Valor atual"]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-2">
                {allocation.map((a, i) => (
                  <span
                    key={a.name}
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${COLORS[i % COLORS.length]}20`,
                      color: COLORS[i % COLORS.length],
                    }}
                  >
                    {a.name}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-zinc-600 text-sm">Sem dados de ativos.</p>
          )}
        </div>
      </div>

      {/* Posições */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-medium text-zinc-400 mb-4">
          Posições Abertas
        </h2>
        {data.positions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium">Ativo</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Qtd</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Preço Atual</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Valor Atual</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Lucro (R$)</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Lucro (%)</th>
                </tr>
              </thead>
              <tbody>
                {data.positions.map((p) => {
                  const lucroCor = (p.lucroBRL ?? 0) >= 0 ? "text-positive" : "text-negative";
                  return (
                    <tr key={p.ticker} className="border-b border-border/30">
                      <td className="px-3 py-2.5">
                        <span className="font-medium">{p.ticker}</span>
                        <span className="text-zinc-600 text-xs ml-2">{p.moeda}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-zinc-400">
                        {p.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-right text-zinc-400">
                        {p.precoAtual !== null
                          ? `${p.quoteCurrency ?? p.moeda} ${p.precoAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium">
                        {brl(p.valorAtualBRL)}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-medium ${lucroCor}`}>
                        {p.lucroBRL !== null ? brl(p.lucroBRL) : "—"}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-medium ${lucroCor}`}>
                        {p.lucroPct !== null
                          ? `${p.lucroPct >= 0 ? "+" : ""}${p.lucroPct.toFixed(1)}%`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-zinc-600 text-sm">Nenhuma posição aberta.</p>
        )}
      </div>
    </>
  );
}

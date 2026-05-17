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
import { Briefcase, Coins, Landmark, ArrowLeftRight } from "lucide-react";
import { useSheetData } from "@/lib/hooks";
import { toNumber, brl, formatDate, shortMonth } from "@/lib/format";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";

const COLORS = [
  "#d4a574",
  "#8b5cf6",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
];

export default function Dashboard() {
  const ativos = useSheetData("meus_ativos");
  const proventos = useSheetData("meus_proventos");
  const fixaAberta = useSheetData("fixa_aberta");
  const cambio = useSheetData("cambio");

  const loading =
    ativos.loading || proventos.loading || fixaAberta.loading || cambio.loading;

  const metrics = useMemo(() => {
    const totalInvestido = ativos.data.reduce((sum, r) => {
      const tipo = String(r["tipo de transação"] || r["tipo_de_transacao"] || "").toLowerCase();
      const val = Math.abs(toNumber(r["valor líquido"] || r["valor_liquido"] || r["valor bruto"] || r["valor_bruto"]) || 0);
      if (tipo.includes("compra") || tipo.includes("buy")) return sum + val;
      if (tipo.includes("venda") || tipo.includes("sell")) return sum - val;
      return sum;
    }, 0);

    const totalProventos = proventos.data.reduce(
      (sum, r) => sum + Math.abs(toNumber(r["valor"]) || 0),
      0
    );

    const totalRF = fixaAberta.data.reduce((sum, r) => {
      const val = toNumber(r["atual"] || r["valor_atual"] || r["saldo"] || r["valor atual"]) || 0;
      return sum + val;
    }, 0);

    const totalCambio = cambio.data.reduce(
      (sum, r) => sum + Math.abs(toNumber(r["valor_origem"] || r["valor entrada"]) || 0),
      0
    );

    return { totalInvestido, totalProventos, totalRF, totalCambio };
  }, [ativos.data, proventos.data, fixaAberta.data, cambio.data]);

  const monthlyDividends = useMemo(() => {
    const byMonth: Record<string, number> = {};
    proventos.data.forEach((r) => {
      const dateStr = String(r["data"] || "");
      const match = dateStr.match(/^(\d{4})-(\d{2})/);
      if (!match) return;
      const key = `${match[1]}-${match[2]}`;
      byMonth[key] = (byMonth[key] || 0) + Math.abs(toNumber(r["valor"]) || 0);
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, total]) => ({ month: shortMonth(month), total }));
  }, [proventos.data]);

  const allocation = useMemo(() => {
    const byTicker: Record<string, number> = {};
    ativos.data.forEach((r) => {
      const ticker = String(r["símbolo"] || r["simbolo"] || r["ticker"] || "?").toUpperCase();
      const tipo = String(r["tipo de transação"] || r["tipo_de_transacao"] || "").toLowerCase();
      const val = Math.abs(toNumber(r["valor líquido"] || r["valor_liquido"] || r["valor bruto"] || r["valor_bruto"]) || 0);
      if (tipo.includes("compra") || tipo.includes("buy")) {
        byTicker[ticker] = (byTicker[ticker] || 0) + val;
      }
    });
    return Object.entries(byTicker)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [ativos.data]);

  const recentTx = useMemo(() => {
    return [...ativos.data]
      .sort((a, b) => String(b["data"] || "").localeCompare(String(a["data"] || "")))
      .slice(0, 5);
  }, [ativos.data]);

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Visão geral dos seus investimentos"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Total Investido"
          value={brl(metrics.totalInvestido)}
          sub={`${ativos.data.length} transações`}
          icon={<Briefcase size={18} />}
        />
        <MetricCard
          label="Proventos Recebidos"
          value={brl(metrics.totalProventos)}
          sub={`${proventos.data.length} pagamentos`}
          icon={<Coins size={18} />}
        />
        <MetricCard
          label="Renda Fixa"
          value={brl(metrics.totalRF)}
          sub={`${fixaAberta.data.length} posições`}
          icon={<Landmark size={18} />}
        />
        <MetricCard
          label="Câmbio Enviado"
          value={brl(metrics.totalCambio)}
          sub={`${cambio.data.length} operações`}
          icon={<ArrowLeftRight size={18} />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {/* Dividendos mensais */}
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

        {/* Alocação */}
        <div className="glass-card p-5">
          <h2 className="text-sm font-medium text-zinc-400 mb-4">
            Top 10 Ativos (por valor investido)
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
                    formatter={(v: number) => [brl(v), "Investido"]}
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

      {/* Transações recentes */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-medium text-zinc-400 mb-4">
          Últimas Transações
        </h2>
        {recentTx.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium">Data</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium">Ticker</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium">Tipo</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Qtd</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {recentTx.map((r, i) => {
                  const tipo = String(r["tipo de transação"] || r["tipo_de_transacao"] || "");
                  const isCompra = tipo.toLowerCase().includes("compra") || tipo.toLowerCase().includes("buy");
                  return (
                    <tr key={i} className="border-b border-border/30">
                      <td className="px-3 py-2.5 text-zinc-400">
                        {formatDate(r["data"])}
                      </td>
                      <td className="px-3 py-2.5 font-medium">
                        {String(r["símbolo"] || r["simbolo"] || r["ticker"] || "—")}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            isCompra
                              ? "bg-positive/10 text-positive"
                              : "bg-negative/10 text-negative"
                          }`}
                        >
                          {tipo}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-zinc-400">
                        {toNumber(r["quantidade"])?.toLocaleString("pt-BR") ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium">
                        {brl(r["valor líquido"] || r["valor_liquido"] || r["valor bruto"] || r["valor_bruto"])}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-zinc-600 text-sm">Nenhuma transação encontrada.</p>
        )}
      </div>
    </>
  );
}

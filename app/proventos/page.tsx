"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Coins, Calendar, TrendingUp } from "lucide-react";
import { useSheetData } from "@/lib/hooks";
import { toNumber, brl, currency, formatDate, shortMonth } from "@/lib/format";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

export default function ProventosPage() {
  const { data, loading, error } = useSheetData("meus_proventos");

  const metrics = useMemo(() => {
    let total = 0;
    const months = new Set<string>();
    const tickers = new Set<string>();

    data.forEach((r) => {
      total += Math.abs(toNumber(r["valor"]) || 0);
      const dateStr = String(r["data"] || "");
      const match = dateStr.match(/^(\d{4})-(\d{2})/);
      if (match) months.add(`${match[1]}-${match[2]}`);
      const t = String(r["ticker"] || "");
      if (t) tickers.add(t.toUpperCase());
    });

    const avgMonth = months.size > 0 ? total / months.size : 0;

    return { total, avgMonth, tickers: tickers.size };
  }, [data]);

  const monthlyChart = useMemo(() => {
    const byMonth: Record<string, number> = {};
    data.forEach((r) => {
      const dateStr = String(r["data"] || "");
      const match = dateStr.match(/^(\d{4})-(\d{2})/);
      if (!match) return;
      const key = `${match[1]}-${match[2]}`;
      byMonth[key] = (byMonth[key] || 0) + Math.abs(toNumber(r["valor"]) || 0);
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24)
      .map(([month, total]) => ({ month: shortMonth(month), total }));
  }, [data]);

  const columns = [
    { key: "data", label: "Data", render: (v: unknown) => formatDate(v) },
    {
      key: "ticker",
      label: "Ticker",
      render: (v: unknown) => String(v || "—").toUpperCase(),
    },
    { key: "lancamento", label: "Tipo" },
    { key: "categoria", label: "Categoria" },
    {
      key: "valor",
      label: "Valor",
      align: "right" as const,
      render: (v: unknown, row: Record<string, unknown>) =>
        currency(v, String(row["moeda"] || "BRL")),
    },
    { key: "moeda", label: "Moeda" },
    { key: "mes", label: "Mês" },
  ];

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} tab="meus_proventos" />;

  return (
    <>
      <PageHeader
        title="Proventos"
        description="Dividendos, JCP e rendimentos recebidos"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <MetricCard
          label="Total Recebido"
          value={brl(metrics.total)}
          icon={<Coins size={18} />}
        />
        <MetricCard
          label="Média Mensal"
          value={brl(metrics.avgMonth)}
          icon={<Calendar size={18} />}
        />
        <MetricCard
          label="Ativos Pagadores"
          value={String(metrics.tickers)}
          icon={<TrendingUp size={18} />}
        />
      </div>

      <div className="glass-card p-5 mb-6">
        <h2 className="text-sm font-medium text-zinc-400 mb-4">
          Proventos Mensais (últimos 24 meses)
        </h2>
        {monthlyChart.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyChart}>
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
          <p className="text-zinc-600 text-sm">Sem dados.</p>
        )}
      </div>

      <DataTable data={data} columns={columns} />
    </>
  );
}

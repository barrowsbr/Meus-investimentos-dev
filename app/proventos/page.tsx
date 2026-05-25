"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Coins, Calendar, TrendingUp } from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { useSheetData } from "@/lib/hooks";
import { toNumber, brl, currency, formatDate, shortMonth } from "@/lib/format";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

const TOOLTIP_STYLE = {
  background: "#18181b",
  border: "1px solid #27272a",
  borderRadius: 12,
  color: "#fafafa",
  fontSize: 13,
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};

export default function ProventosPage() {
  const { data: portfolio, loading: portfolioLoading } = usePortfolio();
  const { data: rawData, loading: sheetLoading, error } = useSheetData("meus_proventos");

  const loading = portfolioLoading || sheetLoading;

  const metrics = useMemo(() => {
    if (!portfolio) {
      let total = 0;
      const months = new Set<string>();
      const tickers = new Set<string>();

      rawData.forEach((r) => {
        total += Math.abs(toNumber(r["valor"]) || 0);
        const dateStr = String(r["data"] || "");
        const match = dateStr.match(/^(\d{4})-(\d{2})/);
        if (match) months.add(`${match[1]}-${match[2]}`);
        const t = String(r["ticker"] || "");
        if (t) tickers.add(t.toUpperCase());
      });

      const avgMonth = months.size > 0 ? total / months.size : 0;
      return { total, avgMonth, tickers: tickers.size };
    }

    const total = portfolio.totalProventosBRL;
    const months = Object.keys(portfolio.proventosMensais);
    const avgMonth = months.length > 0 ? total / months.length : 0;
    const tickers = new Set<string>();
    rawData.forEach((r) => {
      const t = String(r["ticker"] || "");
      if (t) tickers.add(t.toUpperCase());
    });

    return { total, avgMonth, tickers: tickers.size };
  }, [portfolio, rawData]);

  const monthlyChart = useMemo(() => {
    if (portfolio?.proventosMensais) {
      return Object.entries(portfolio.proventosMensais)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-24)
        .map(([month, total]) => ({ month: shortMonth(month), total }));
    }

    const byMonth: Record<string, number> = {};
    rawData.forEach((r) => {
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
  }, [portfolio, rawData]);

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-8">
        <div className="animate-fade-in">
          <MetricCard
            label="Total Recebido"
            value={brl(metrics.total)}
            icon={<Coins size={18} />}
           
          />
        </div>
        <div className="animate-fade-in animate-delay-1">
          <MetricCard
            label="Média Mensal"
            value={brl(metrics.avgMonth)}
            icon={<Calendar size={18} />}
           
          />
        </div>
        <div className="animate-fade-in animate-delay-2">
          <MetricCard
            label="Ativos Pagadores"
            value={String(metrics.tickers)}
            icon={<TrendingUp size={18} />}
           
          />
        </div>
      </div>

      <div className="glass-card p-5 mb-6 animate-fade-in">
        <h2 className="section-title mb-4">
          <Coins size={15} />
          Proventos Mensais (últimos 24 meses)
        </h2>
        {monthlyChart.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyChart}>
              <defs>
                <linearGradient id="gradProv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d4a574" stopOpacity={1} />
                  <stop offset="100%" stopColor="#d4a574" stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" />
              <XAxis dataKey="month" tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [brl(v), "Total"]} />
              <Bar dataKey="total" fill="url(#gradProv)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-zinc-600 text-sm">Sem dados.</p>
        )}
      </div>

      <DataTable data={rawData} columns={columns} />
    </>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line, Cell, PieChart, Pie, Legend,
} from "recharts";
import { Coins, Calendar, TrendingUp, Filter, X } from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { useSheetData } from "@/lib/hooks";
import { toNumber, brl, compactBRL, currency, formatDate, shortMonth } from "@/lib/format";
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
};

const COLORS = [
  "#d4a574", "#6366f1", "#34d399", "#f59e0b", "#f87171",
  "#a78bfa", "#60a5fa", "#fb923c", "#4ade80", "#e879f9",
];

function rowYear(r: Record<string, unknown>): string {
  const s = String(r["data"] || r["mes"] || "");
  const m = s.match(/(\d{4})/);
  return m ? m[1] : "";
}

function rowMonth(r: Record<string, unknown>): string {
  const s = String(r["data"] || "");
  const m = s.match(/^(\d{4}-\d{2})/);
  return m ? m[1] : "";
}

function rowValueBRL(r: Record<string, unknown>, usdbrl: number): number {
  const v = Math.abs(toNumber(r["valor"]) ?? 0);
  const moeda = String(r["moeda"] ?? "BRL").toUpperCase();
  return moeda === "USD" ? v * usdbrl : v;
}

// ─── FilterBar ────────────────────────────────────────────────────────────────

interface Filters {
  year: string;
  ticker: string;
  tipo: string;
  moeda: string;
}

function FilterBar({
  filters, onChange, options,
}: {
  filters: Filters;
  onChange: (f: Partial<Filters>) => void;
  options: { years: string[]; tickers: string[]; tipos: string[] };
}) {
  const active = Object.values(filters).some(v => v !== "all");

  return (
    <div className="glass-card p-4 mb-6 flex flex-wrap gap-3 items-center">
      <Filter size={14} className="text-zinc-500 shrink-0" />

      <select
        value={filters.year}
        onChange={e => onChange({ year: e.target.value })}
        className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-3 py-1.5 outline-none focus:border-accent"
      >
        <option value="all">Todos os anos</option>
        {options.years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>

      <select
        value={filters.ticker}
        onChange={e => onChange({ ticker: e.target.value })}
        className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-3 py-1.5 outline-none focus:border-accent"
      >
        <option value="all">Todos os ativos</option>
        {options.tickers.map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      <select
        value={filters.tipo}
        onChange={e => onChange({ tipo: e.target.value })}
        className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-3 py-1.5 outline-none focus:border-accent"
      >
        <option value="all">Todos os tipos</option>
        {options.tipos.map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      <select
        value={filters.moeda}
        onChange={e => onChange({ moeda: e.target.value })}
        className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-3 py-1.5 outline-none focus:border-accent"
      >
        <option value="all">BRL + USD</option>
        <option value="BRL">Apenas BRL</option>
        <option value="USD">Apenas USD</option>
      </select>

      {active && (
        <button
          onClick={() => onChange({ year: "all", ticker: "all", tipo: "all", moeda: "all" })}
          className="ml-auto flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X size={12} /> Limpar filtros
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProventosPage() {
  const { data: portfolio, loading: portfolioLoading } = usePortfolio();
  const { data: rawData, loading: sheetLoading, error } = useSheetData("meus_proventos");
  const loading = portfolioLoading || sheetLoading;

  const usdbrl = portfolio?.usdbrl ?? 5.7;

  const [filters, setFilters] = useState<Filters>({ year: "all", ticker: "all", tipo: "all", moeda: "all" });
  const updateFilter = (f: Partial<Filters>) => setFilters(p => ({ ...p, ...f }));

  // Filter options derived from full dataset
  const options = useMemo(() => {
    const years = [...new Set(rawData.map(r => rowYear(r)).filter(Boolean))].sort().reverse();
    const tickers = [...new Set(rawData.map(r => String(r["ticker"] ?? "").toUpperCase().trim()).filter(Boolean))].sort();
    const tipos = [...new Set(rawData.map(r => String(r["lancamento"] ?? r["decisao"] ?? "").trim()).filter(Boolean))].sort();
    return { years, tickers, tipos };
  }, [rawData]);

  // Apply filters
  const filteredData = useMemo(() => {
    return rawData.filter(r => {
      if (filters.year !== "all" && rowYear(r) !== filters.year) return false;
      if (filters.ticker !== "all" && String(r["ticker"] ?? "").toUpperCase().trim() !== filters.ticker) return false;
      if (filters.tipo !== "all") {
        const tipo = String(r["lancamento"] ?? r["decisao"] ?? "").trim();
        if (tipo !== filters.tipo) return false;
      }
      if (filters.moeda !== "all" && String(r["moeda"] ?? "BRL").toUpperCase() !== filters.moeda) return false;
      return true;
    });
  }, [rawData, filters]);

  // Metrics from filtered data
  const metrics = useMemo(() => {
    const total = filteredData.reduce((s, r) => s + rowValueBRL(r, usdbrl), 0);
    const months = new Set(filteredData.map(r => rowMonth(r)).filter(Boolean));
    const avgMonth = months.size > 0 ? total / months.size : 0;
    const tickers = new Set(filteredData.map(r => String(r["ticker"] ?? "").toUpperCase().trim()).filter(Boolean));

    // Best ticker
    const byTicker: Record<string, number> = {};
    filteredData.forEach(r => {
      const t = String(r["ticker"] ?? "").toUpperCase().trim();
      if (!t) return;
      byTicker[t] = (byTicker[t] ?? 0) + rowValueBRL(r, usdbrl);
    });
    const topEntry = Object.entries(byTicker).sort((a, b) => b[1] - a[1])[0];

    return { total, avgMonth, tickers: tickers.size, topTicker: topEntry?.[0] ?? "—", topValue: topEntry?.[1] ?? 0 };
  }, [filteredData, usdbrl]);

  // Monthly chart
  const monthlyChart = useMemo(() => {
    const byMonth: Record<string, { brl: number; usd: number }> = {};
    filteredData.forEach(r => {
      const key = rowMonth(r);
      if (!key) return;
      const v = Math.abs(toNumber(r["valor"]) ?? 0);
      const moeda = String(r["moeda"] ?? "BRL").toUpperCase();
      if (!byMonth[key]) byMonth[key] = { brl: 0, usd: 0 };
      if (moeda === "USD") byMonth[key].usd += v;
      else byMonth[key].brl += v;
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24)
      .map(([month, v]) => ({ month: shortMonth(month), brl: v.brl, usd: v.usd, total: v.brl + v.usd * usdbrl }));
  }, [filteredData, usdbrl]);

  // By ticker (top 10 in BRL)
  const byTickerChart = useMemo(() => {
    const acc: Record<string, number> = {};
    filteredData.forEach(r => {
      const t = String(r["ticker"] ?? "").toUpperCase().trim();
      if (!t) return;
      acc[t] = (acc[t] ?? 0) + rowValueBRL(r, usdbrl);
    });
    return Object.entries(acc)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([ticker, total]) => ({ ticker, total }));
  }, [filteredData, usdbrl]);

  // By type
  const byTypeChart = useMemo(() => {
    const acc: Record<string, number> = {};
    filteredData.forEach(r => {
      const t = String(r["lancamento"] ?? r["decisao"] ?? "Outro").trim() || "Outro";
      acc[t] = (acc[t] ?? 0) + rowValueBRL(r, usdbrl);
    });
    return Object.entries(acc)
      .sort((a, b) => b[1] - a[1])
      .map(([tipo, total]) => ({ tipo, total }));
  }, [filteredData, usdbrl]);

  // Cumulative line
  const cumulativeChart = useMemo(() => {
    const sorted = [...filteredData]
      .map(r => ({ date: String(r["data"] ?? ""), value: rowValueBRL(r, usdbrl) }))
      .filter(r => r.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    let cum = 0;
    return sorted.map(r => {
      cum += r.value;
      return { date: r.date.slice(0, 7), cumulative: cum };
    });
  }, [filteredData, usdbrl]);

  const columns = [
    { key: "data", label: "Data", render: (v: unknown) => formatDate(v) },
    { key: "ticker", label: "Ticker", render: (v: unknown) => String(v || "—").toUpperCase() },
    { key: "lancamento", label: "Tipo" },
    { key: "categoria", label: "Categoria" },
    {
      key: "valor",
      label: "Valor",
      align: "right" as const,
      render: (v: unknown, row: Record<string, unknown>) => currency(v, String(row["moeda"] || "BRL")),
    },
    { key: "moeda", label: "Moeda" },
    { key: "mes", label: "Mês" },
  ];

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} tab="meus_proventos" />;

  return (
    <>
      <PageHeader title="Proventos" description="Dividendos, JCP e rendimentos recebidos" />

      {/* Filters */}
      <FilterBar filters={filters} onChange={updateFilter} options={options} />

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="animate-fade-in">
          <MetricCard label="Total Recebido" value={compactBRL(metrics.total)} sub={`${filteredData.length} pagamentos`} icon={<Coins size={18} />} glowColor="#d4a574" />
        </div>
        <div className="animate-fade-in animate-delay-1">
          <MetricCard label="Média Mensal" value={compactBRL(metrics.avgMonth)} icon={<Calendar size={18} />} glowColor="#3b82f6" />
        </div>
        <div className="animate-fade-in animate-delay-2">
          <MetricCard label="Ativos Pagadores" value={String(metrics.tickers)} icon={<TrendingUp size={18} />} glowColor="#10b981" />
        </div>
        <div className="animate-fade-in animate-delay-3">
          <MetricCard
            label="Maior Pagador"
            value={metrics.topTicker}
            sub={compactBRL(metrics.topValue)}
            icon={<Coins size={18} />}
            glowColor="#a78bfa"
          />
        </div>
      </div>

      {/* Charts row 1: Monthly + Cumulative */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="glass-card p-5">
          <h2 className="section-title mb-4"><Coins size={15} /> Proventos por Mês</h2>
          {monthlyChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyChart} margin={{ top: 2, right: 4, bottom: 2, left: 0 }}>
                <defs>
                  <linearGradient id="gradBRL" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d4a574" stopOpacity={1} />
                    <stop offset="100%" stopColor="#d4a574" stopOpacity={0.6} />
                  </linearGradient>
                  <linearGradient id="gradUSD" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" />
                <XAxis dataKey="month" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => compactBRL(v)} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [brl(v), name === "brl" ? "BRL" : "USD"]} />
                <Legend formatter={v => v === "brl" ? "BRL" : "USD"} wrapperStyle={{ fontSize: 11, color: "#71717a" }} />
                <Bar dataKey="brl" fill="url(#gradBRL)" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="usd" fill="url(#gradUSD)" radius={[4, 4, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-zinc-600 text-sm">Sem dados.</p>}
        </div>

        <div className="glass-card p-5">
          <h2 className="section-title mb-4"><TrendingUp size={15} /> Acumulado (R$)</h2>
          {cumulativeChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={cumulativeChart} margin={{ top: 2, right: 4, bottom: 2, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" />
                <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => compactBRL(v)} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [brl(v), "Acumulado"]} />
                <Line type="monotone" dataKey="cumulative" stroke="#34d399" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-zinc-600 text-sm">Sem dados.</p>}
        </div>
      </div>

      {/* Charts row 2: By ticker + By type */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* By ticker — takes 2 cols */}
        <div className="glass-card p-5 lg:col-span-2">
          <h2 className="section-title mb-4">Por Ativo (top 12)</h2>
          {byTickerChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byTickerChart} layout="vertical" margin={{ top: 2, right: 16, bottom: 2, left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => compactBRL(v)} />
                <YAxis type="category" dataKey="ticker" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [brl(v), "Total"]} />
                <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                  {byTickerChart.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-zinc-600 text-sm">Sem dados.</p>}
        </div>

        {/* By type — pie */}
        <div className="glass-card p-5">
          <h2 className="section-title mb-4">Por Tipo</h2>
          {byTypeChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={byTypeChart}
                  dataKey="total"
                  nameKey="tipo"
                  cx="50%"
                  cy="45%"
                  outerRadius={80}
                  paddingAngle={2}
                  label={({ tipo, percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""}
                  labelLine={false}
                >
                  {byTypeChart.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [brl(v), name]} />
                <Legend
                  formatter={(v: string) => v}
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, color: "#a1a1aa", paddingTop: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-zinc-600 text-sm">Sem dados.</p>}
        </div>
      </div>

      {/* Table */}
      <h2 className="section-title mb-3">Histórico ({filteredData.length})</h2>
      <DataTable data={filteredData} columns={columns} />
    </>
  );
}

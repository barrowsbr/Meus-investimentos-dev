"use client";

import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line, Cell, PieChart, Pie, Legend,
  Sankey, Rectangle,
} from "recharts";
import { Coins, Calendar, TrendingUp, Filter, X, Layers, Award } from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { useSheetData } from "@/lib/hooks";
import { toNumber, brl, compactBRL, currency, formatDate, shortMonth } from "@/lib/format";
import { identificarSetor } from "@/lib/sectors";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

const TOOLTIP_STYLE = {
  background: "#09090b",
  border: "1px solid #27272a",
  borderRadius: 12,
  color: "#fafafa",
  fontSize: 12,
};

const PALETTE = [
  "#6366f1", "#8b5cf6", "#a78bfa", "#34d399", "#10b981",
  "#60a5fa", "#f59e0b", "#f87171", "#22d3ee", "#fb923c",
];

const ORIGIN_COLORS: Record<string, string> = {
  "FIIs": "#f59e0b",
  "Ações Brasil": "#3b82f6",
  "Ações Internacional": "#8b5cf6",
  "ETF USA": "#06b6d4",
  "ETF": "#10b981",
  "BDRs": "#ec4899",
  "Cripto": "#f97316",
  "Renda Fixa": "#0f766e",
  "Renda Fixa USD": "#1d4ed8",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function rowYear(r: Record<string, unknown>): string {
  const s = String(r["data"] || r["mes"] || "");
  const m = s.match(/(\d{4})/);
  return m ? m[1] : "";
}

function rowMonth(r: Record<string, unknown>): string {
  const s = String(r["data"] || "");
  const isoMatch = s.match(/^(\d{4}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2].padStart(2, "0")}`;
  return "";
}

interface FxRatesSimple { usdbrl: number; eurbrl: number; cadbrl: number; gbpbrl: number }

function rowValueBRL(r: Record<string, unknown>, fx: FxRatesSimple): number {
  const v = Math.abs(toNumber(r["valor"]) ?? 0);
  const moeda = String(r["moeda"] ?? "BRL").toUpperCase();
  if (moeda === "USD") return v * fx.usdbrl;
  if (moeda === "EUR") return v * fx.eurbrl;
  if (moeda === "CAD") return v * fx.cadbrl;
  if (moeda === "GBP") return v * fx.gbpbrl;
  return v;
}

// ── Filter bar ───────────────────────────────────────────────────────────────

interface Filters { year: string; ticker: string; tipo: string; moeda: string }

function FilterBar({
  filters, onChange, options,
}: {
  filters: Filters;
  onChange: (f: Partial<Filters>) => void;
  options: { years: string[]; tickers: string[]; tipos: string[] };
}) {
  const active = Object.values(filters).some(v => v !== "all");
  const sel = "bg-zinc-900/80 border border-zinc-700/60 text-zinc-300 text-xs rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500/50 transition-colors";

  return (
    <div className="glass-card p-4 mb-6 flex flex-wrap gap-3 items-center">
      <Filter size={14} className="text-zinc-500 shrink-0" />
      <select value={filters.year} onChange={e => onChange({ year: e.target.value })} className={sel}>
        <option value="all">Todos os anos</option>
        {options.years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <select value={filters.ticker} onChange={e => onChange({ ticker: e.target.value })} className={sel}>
        <option value="all">Todos os ativos</option>
        {options.tickers.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <select value={filters.tipo} onChange={e => onChange({ tipo: e.target.value })} className={sel}>
        <option value="all">Todos os tipos</option>
        {options.tipos.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <select value={filters.moeda} onChange={e => onChange({ moeda: e.target.value })} className={sel}>
        <option value="all">BRL + USD</option>
        <option value="BRL">Apenas BRL</option>
        <option value="USD">Apenas USD</option>
      </select>
      {active && (
        <button
          onClick={() => onChange({ year: "all", ticker: "all", tipo: "all", moeda: "all" })}
          className="ml-auto flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X size={12} /> Limpar
        </button>
      )}
    </div>
  );
}

// ── Custom Sankey renderers ──────────────────────────────────────────────────

const SANKEY_NODE_COLORS = {
  ticker: "#6366f1",
  setor: "#34d399",
  moeda: "#f59e0b",
};

function SankeyNodeRenderer(props: any) {
  const { x, y, width, height, payload } = props;
  const level = payload?.level ?? "ticker";
  const color = SANKEY_NODE_COLORS[level as keyof typeof SANKEY_NODE_COLORS] ?? "#6366f1";
  return (
    <Rectangle
      x={x} y={y} width={width} height={height}
      fill={color} fillOpacity={0.85}
      radius={[3, 3, 3, 3]}
    />
  );
}

function SankeyLinkRenderer(props: any) {
  const { sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth } = props;
  const sourceLevel = props?.payload?.source?.level ?? "ticker";
  const color = sourceLevel === "ticker" ? "99,102,241" : "52,211,153";
  return (
    <path
      d={`M${sourceX},${sourceY + linkWidth / 2}
          C${sourceControlX},${sourceY + linkWidth / 2}
           ${targetControlX},${targetY + linkWidth / 2}
           ${targetX},${targetY + linkWidth / 2}
          L${targetX},${targetY - linkWidth / 2}
          C${targetControlX},${targetY - linkWidth / 2}
           ${sourceControlX},${sourceY - linkWidth / 2}
           ${sourceX},${sourceY - linkWidth / 2}
          Z`}
      fill={`rgba(${color},0.25)`}
      stroke={`rgba(${color},0.4)`}
      strokeWidth={0.5}
    />
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProventosPage() {
  const { data: portfolio, loading: portfolioLoading } = usePortfolio();
  const { data: rawData, loading: sheetLoading, error } = useSheetData("meus_proventos");
  const loading = portfolioLoading || sheetLoading;

  const fx: FxRatesSimple = {
    usdbrl: portfolio?.usdbrl ?? 5.7,
    eurbrl: portfolio?.eurbrl ?? 6.4,
    cadbrl: portfolio?.fx?.CADBRL ?? 4.1,
    gbpbrl: portfolio?.fx?.GBPBRL ?? 7.6,
  };

  const [filters, setFilters] = useState<Filters>({ year: "all", ticker: "all", tipo: "all", moeda: "all" });
  const updateFilter = (f: Partial<Filters>) => setFilters(p => ({ ...p, ...f }));

  const options = useMemo(() => {
    const years = [...new Set(rawData.map(r => rowYear(r)).filter(Boolean))].sort().reverse();
    const tickers = [...new Set(rawData.map(r => String(r["ticker"] ?? "").toUpperCase().trim()).filter(Boolean))].sort();
    const tipos = [...new Set(rawData.map(r => String(r["lancamento"] ?? r["decisao"] ?? "").trim()).filter(Boolean))].sort();
    return { years, tickers, tipos };
  }, [rawData]);

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

  // ── Metrics ──
  const metrics = useMemo(() => {
    const total = filteredData.reduce((s, r) => s + rowValueBRL(r, fx), 0);
    const months = new Set(filteredData.map(r => rowMonth(r)).filter(Boolean));
    const avgMonth = months.size > 0 ? total / months.size : 0;
    const tickers = new Set(filteredData.map(r => String(r["ticker"] ?? "").toUpperCase().trim()).filter(Boolean));

    const byTicker: Record<string, number> = {};
    filteredData.forEach(r => {
      const t = String(r["ticker"] ?? "").toUpperCase().trim();
      if (!t) return;
      byTicker[t] = (byTicker[t] ?? 0) + rowValueBRL(r, fx);
    });
    const topEntry = Object.entries(byTicker).sort((a, b) => b[1] - a[1])[0];

    // Best month
    const byMonth: Record<string, number> = {};
    filteredData.forEach(r => {
      const m = rowMonth(r);
      if (!m) return;
      byMonth[m] = (byMonth[m] ?? 0) + rowValueBRL(r, fx);
    });
    const bestMonth = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0];

    return {
      total, avgMonth, tickers: tickers.size,
      topTicker: topEntry?.[0] ?? "—", topValue: topEntry?.[1] ?? 0,
      bestMonth: bestMonth ? shortMonth(bestMonth[0]) : "—", bestMonthValue: bestMonth?.[1] ?? 0,
    };
  }, [filteredData, fx]);

  // ── Monthly chart (stacked BRL + exterior + cumulative line) ──
  const monthlyChart = useMemo(() => {
    const byMonth: Record<string, { brl: number; ext: number }> = {};
    filteredData.forEach(r => {
      const key = rowMonth(r);
      if (!key) return;
      const valBRL = rowValueBRL(r, fx);
      const moeda = String(r["moeda"] ?? "BRL").toUpperCase();
      if (!byMonth[key]) byMonth[key] = { brl: 0, ext: 0 };
      if (moeda !== "BRL") byMonth[key].ext += valBRL;
      else byMonth[key].brl += valBRL;
    });
    let cum = 0;
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24)
      .map(([month, v]) => {
        cum += v.brl + v.ext;
        return { month: shortMonth(month), brl: v.brl, ext: v.ext, total: v.brl + v.ext, cum };
      });
  }, [filteredData, fx]);

  // ── By ticker (top 10) ──
  const byTickerChart = useMemo(() => {
    const acc: Record<string, number> = {};
    filteredData.forEach(r => {
      const t = String(r["ticker"] ?? "").toUpperCase().trim();
      if (!t) return;
      acc[t] = (acc[t] ?? 0) + rowValueBRL(r, fx);
    });
    return Object.entries(acc)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ticker, total]) => ({ ticker, total }));
  }, [filteredData, fx]);

  // ── By type ──
  const byTypeChart = useMemo(() => {
    const acc: Record<string, number> = {};
    filteredData.forEach(r => {
      const t = String(r["lancamento"] ?? r["decisao"] ?? "Outro").trim() || "Outro";
      acc[t] = (acc[t] ?? 0) + rowValueBRL(r, fx);
    });
    return Object.entries(acc)
      .sort((a, b) => b[1] - a[1])
      .map(([tipo, total]) => ({ tipo, total }));
  }, [filteredData, fx]);

  // ── By origin (sector) — monthly stacked ──
  const byOriginChart = useMemo(() => {
    const byMonth: Record<string, Record<string, number>> = {};
    const originsSet = new Set<string>();

    filteredData.forEach(r => {
      const key = rowMonth(r);
      if (!key) return;
      const ticker = String(r["ticker"] ?? "").toUpperCase().trim();
      const origin = ticker ? identificarSetor(ticker) : "Outro";
      originsSet.add(origin);
      if (!byMonth[key]) byMonth[key] = {};
      byMonth[key][origin] = (byMonth[key][origin] ?? 0) + rowValueBRL(r, fx);
    });

    const origins = [...originsSet].sort((a, b) => {
      const totalA = Object.values(byMonth).reduce((s, m) => s + (m[a] ?? 0), 0);
      const totalB = Object.values(byMonth).reduce((s, m) => s + (m[b] ?? 0), 0);
      return totalB - totalA;
    });

    const data = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24)
      .map(([month, values]) => {
        const entry: Record<string, unknown> = { month: shortMonth(month) };
        for (const o of origins) entry[o] = values[o] ?? 0;
        return entry;
      });

    return { data, origins };
  }, [filteredData, fx]);

  // ── Sankey data: Ativo → Setor → Moeda ──
  const sankeyData = useMemo(() => {
    const tickerToSetor: Record<string, Record<string, number>> = {};
    const setorToMoeda: Record<string, Record<string, number>> = {};

    filteredData.forEach(r => {
      const ticker = String(r["ticker"] ?? "").toUpperCase().trim();
      if (!ticker) return;
      const val = rowValueBRL(r, fx);
      if (val <= 0) return;
      const setor = identificarSetor(ticker);
      const moeda = String(r["moeda"] ?? "BRL").toUpperCase();

      if (!tickerToSetor[ticker]) tickerToSetor[ticker] = {};
      tickerToSetor[ticker][setor] = (tickerToSetor[ticker][setor] ?? 0) + val;

      if (!setorToMoeda[setor]) setorToMoeda[setor] = {};
      setorToMoeda[setor][moeda] = (setorToMoeda[setor][moeda] ?? 0) + val;
    });

    // Build nodes: tickers first, then setores, then moedas
    const tickerNames = Object.keys(tickerToSetor).sort((a, b) => {
      const ta = Object.values(tickerToSetor[a]).reduce((s, v) => s + v, 0);
      const tb = Object.values(tickerToSetor[b]).reduce((s, v) => s + v, 0);
      return tb - ta;
    }).slice(0, 15);
    const setorNames = [...new Set(Object.values(tickerToSetor).flatMap(s => Object.keys(s)))];
    const moedaNames = [...new Set(Object.values(setorToMoeda).flatMap(m => Object.keys(m)))];

    const nodes: Array<{ name: string; level: string }> = [];
    tickerNames.forEach(t => nodes.push({ name: t, level: "ticker" }));
    setorNames.forEach(s => nodes.push({ name: s, level: "setor" }));
    moedaNames.forEach(m => nodes.push({ name: m, level: "moeda" }));

    const nameToIdx: Record<string, number> = {};
    nodes.forEach((n, i) => { nameToIdx[n.name] = i; });

    const links: Array<{ source: number; target: number; value: number }> = [];

    for (const ticker of tickerNames) {
      for (const [setor, val] of Object.entries(tickerToSetor[ticker])) {
        if (val > 0 && nameToIdx[ticker] != null && nameToIdx[setor] != null) {
          links.push({ source: nameToIdx[ticker], target: nameToIdx[setor], value: val });
        }
      }
    }

    // Aggregate "other" tickers into their setores
    const otherTickers = Object.keys(tickerToSetor).filter(t => !tickerNames.includes(t));
    const otherBySetor: Record<string, number> = {};
    for (const ticker of otherTickers) {
      for (const [setor, val] of Object.entries(tickerToSetor[ticker])) {
        otherBySetor[setor] = (otherBySetor[setor] ?? 0) + val;
      }
    }
    if (Object.keys(otherBySetor).length > 0) {
      const otherIdx = nodes.length;
      nodes.push({ name: "Outros", level: "ticker" });
      for (const [setor, val] of Object.entries(otherBySetor)) {
        if (val > 0 && nameToIdx[setor] != null) {
          links.push({ source: otherIdx, target: nameToIdx[setor], value: val });
        }
      }
    }

    for (const setor of setorNames) {
      for (const [moeda, val] of Object.entries(setorToMoeda[setor] ?? {})) {
        if (val > 0 && nameToIdx[setor] != null && nameToIdx[moeda] != null) {
          links.push({ source: nameToIdx[setor], target: nameToIdx[moeda], value: val });
        }
      }
    }

    if (nodes.length < 3 || links.length < 2) return null;
    return { nodes, links };
  }, [filteredData, fx]);

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

      <FilterBar filters={filters} onChange={updateFilter} options={options} />

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <MetricCard label="Total Recebido" value={compactBRL(metrics.total)} sub={`${filteredData.length} pagamentos`} icon={<Coins size={17} />} glowColor="#6366f1" />
        <MetricCard label="Média Mensal" value={compactBRL(metrics.avgMonth)} icon={<Calendar size={17} />} glowColor="#34d399" />
        <MetricCard label="Ativos Pagadores" value={String(metrics.tickers)} icon={<TrendingUp size={17} />} glowColor="#06b6d4" />
        <MetricCard label="Maior Pagador" value={metrics.topTicker} sub={compactBRL(metrics.topValue)} icon={<Award size={17} />} glowColor="#f59e0b" />
        <MetricCard label="Melhor Mês" value={metrics.bestMonth} sub={compactBRL(metrics.bestMonthValue)} icon={<Calendar size={17} />} glowColor="#a78bfa" />
      </div>

      {/* ── Evolução Mensal (bars + cumulative line) ── */}
      <div className="glass-card p-5 mb-4">
        <h2 className="section-title mb-4"><Coins size={15} /> Evolução Mensal</h2>
        {monthlyChart.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyChart} margin={{ top: 5, right: 40, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id="provBRL" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.85} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0.4} />
                </linearGradient>
                <linearGradient id="provExt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.85} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" />
              <XAxis dataKey="month" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis yAxisId="left" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => compactBRL(v)} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => compactBRL(v)} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [brl(v), name === "brl" ? "BRL" : name === "ext" ? "Exterior (R$)" : "Acumulado"]} />
              <Legend formatter={v => v === "brl" ? "BRL" : v === "ext" ? "Exterior (R$)" : "Acumulado"} iconSize={8} wrapperStyle={{ fontSize: 11, color: "#71717a" }} />
              <Bar yAxisId="left" dataKey="brl" fill="url(#provBRL)" radius={[3, 3, 0, 0]} stackId="a" />
              <Bar yAxisId="left" dataKey="ext" fill="url(#provExt)" radius={[3, 3, 0, 0]} stackId="a" />
              <Line yAxisId="right" type="monotone" dataKey="cum" stroke="#a5b4fc" strokeWidth={2} strokeDasharray="4 2" dot={false} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-zinc-600 text-sm">Sem dados.</p>}
      </div>

      {/* ── Distribution + Ranking ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="glass-card p-5">
          <h2 className="section-title mb-4">Distribuição por Tipo</h2>
          {byTypeChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={byTypeChart}
                  dataKey="total"
                  nameKey="tipo"
                  cx="50%"
                  cy="45%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={3}
                  label={({ tipo, percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""}
                  labelLine={false}
                  strokeWidth={0}
                >
                  {byTypeChart.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.85} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [brl(v), name]} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: "#a1a1aa", paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-zinc-600 text-sm">Sem dados.</p>}
        </div>

        <div className="glass-card p-5 lg:col-span-2">
          <h2 className="section-title mb-4"><Award size={15} /> Ranking por Ativo (top 10)</h2>
          {byTickerChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byTickerChart} layout="vertical" margin={{ top: 2, right: 16, bottom: 2, left: 5 }}>
                <defs>
                  <linearGradient id="rankGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => compactBRL(v)} />
                <YAxis type="category" dataKey="ticker" tick={{ fill: "#e2e8f0", fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [brl(v), "Total"]} />
                <Bar dataKey="total" fill="url(#rankGrad)" radius={[0, 6, 6, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-zinc-600 text-sm">Sem dados.</p>}
        </div>
      </div>

      {/* ── Sankey: Ativo → Setor → Moeda ── */}
      {sankeyData && (
        <div className="glass-card p-5 mb-4">
          <h2 className="section-title mb-2"><Layers size={15} /> Fluxo de Capital — Ativo → Setor → Moeda</h2>
          <p className="text-xs text-zinc-600 mb-4">Visualização do fluxo de proventos dos ativos individuais, passando por seus setores, até a moeda de origem.</p>
          <ResponsiveContainer width="100%" height={Math.max(400, sankeyData.nodes.length * 22)}>
            <Sankey
              data={sankeyData}
              nodeWidth={16}
              nodePadding={14}
              linkCurvature={0.5}
              iterations={64}
              margin={{ top: 10, right: 120, bottom: 10, left: 10 }}
              node={<SankeyNodeRenderer />}
              link={<SankeyLinkRenderer />}
            >
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: number) => [brl(value), "Valor"]}
              />
            </Sankey>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm inline-block" style={{ background: "#6366f1" }} /> Ativos</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm inline-block" style={{ background: "#34d399" }} /> Setores</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm inline-block" style={{ background: "#f59e0b" }} /> Moedas</span>
          </div>
        </div>
      )}

      {/* ── Fluxo por Origem (monthly stacked) ── */}
      <div className="glass-card p-5 mb-4">
        <h2 className="section-title mb-4"><Layers size={15} /> Fluxo por Origem (mensal)</h2>
        {byOriginChart.data.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byOriginChart.data} margin={{ top: 2, right: 4, bottom: 2, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" />
              <XAxis dataKey="month" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => compactBRL(v)} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [brl(v), name]} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: "#71717a" }} />
              {byOriginChart.origins.map((origin, i) => (
                <Bar key={origin} dataKey={origin} stackId="origin" fill={ORIGIN_COLORS[origin] || PALETTE[i % PALETTE.length]} radius={i === 0 ? [3, 3, 0, 0] : undefined} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-zinc-600 text-sm">Sem dados.</p>}
      </div>

      {/* ── Tabela ── */}
      <h2 className="section-title mb-3">Histórico ({filteredData.length})</h2>
      <DataTable data={filteredData} columns={columns} />
    </>
  );
}

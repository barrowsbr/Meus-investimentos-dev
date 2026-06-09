"use client";

import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line, Cell, PieChart, Pie, Legend,
  Sankey, Rectangle,
} from "recharts";
import { Coins, Calendar, TrendingUp, Filter, X, Layers, Award, ArrowUpRight, ArrowDownRight, Percent } from "lucide-react";
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

type FxRatesSimple = Record<string, number>;

function fxRate(moeda: string, fx: FxRatesSimple): number {
  if (!moeda || moeda === "BRL") return 1;
  const key = moeda.toLowerCase() + "brl";
  return fx[key] ?? 1;
}

function rowValueBRL(r: Record<string, unknown>, fx: FxRatesSimple): number {
  const v = Math.abs(toNumber(r["valor"]) ?? 0);
  const decisao = String(r["decisao"] ?? "").toLowerCase();
  const sign = decisao.includes("imposto") ? -1 : 1;
  const moeda = String(r["moeda"] ?? "BRL").toUpperCase();
  return sign * v * fxRate(moeda, fx);
}

function rowIsImposto(r: Record<string, unknown>): boolean {
  return String(r["decisao"] ?? "").toLowerCase().includes("imposto");
}

function rowAbsBRL(r: Record<string, unknown>, fx: FxRatesSimple): number {
  const v = Math.abs(toNumber(r["valor"]) ?? 0);
  const moeda = String(r["moeda"] ?? "BRL").toUpperCase();
  return v * fxRate(moeda, fx);
}

// ── Filter bar ───────────────────────────────────────────────────────────────

interface Filters { year: string; ticker: string; tipo: string; moeda: string }

function FilterBar({
  filters, onChange, options,
}: {
  filters: Filters;
  onChange: (f: Partial<Filters>) => void;
  options: { years: string[]; tickers: string[]; tipos: string[]; moedas: string[] };
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
        <option value="all">Todas as moedas</option>
        {options.moedas.map(m => <option key={m} value={m}>{m}</option>)}
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

const SANKEY_NODE_COLORS: Record<string, string> = {
  ticker: "#818cf8",
  setor: "#34d399",
  moeda: "#fbbf24",
};

function SankeyNodeRenderer(props: any) {
  const { x, y, width, height, payload } = props;
  const level: string = payload?.level ?? "ticker";
  const color = SANKEY_NODE_COLORS[level] ?? "#818cf8";
  const name: string = payload?.name ?? "";
  const value: number = payload?.value ?? 0;

  const isLeft = level === "ticker";
  const isRight = level === "moeda";

  const labelX = isLeft ? x - 4 : x + width + 4;
  const anchor = isLeft ? "end" : "start";
  const labelY = y + height / 2;

  return (
    <g>
      <Rectangle
        x={x} y={y} width={width} height={height}
        fill={color} fillOpacity={0.9}
        radius={[3, 3, 3, 3]}
      />
      {height >= 8 && (
        <>
          <text
            x={labelX} y={labelY - 1}
            textAnchor={anchor}
            dominantBaseline="middle"
            fill="#e4e4e7"
            fontSize={11}
            fontWeight={600}
          >
            {name}
          </text>
          {(isLeft || isRight) && height >= 16 && (
            <text
              x={labelX} y={labelY + 12}
              textAnchor={anchor}
              dominantBaseline="middle"
              fill="#71717a"
              fontSize={9}
            >
              {compactBRL(value)}
            </text>
          )}
        </>
      )}
    </g>
  );
}

function SankeyLinkRenderer(props: any) {
  const { sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth } = props;
  const sourceLevel = props?.payload?.source?.level ?? "ticker";
  const rgb = sourceLevel === "ticker" ? "129,140,248" : "52,211,153";
  const opacity = Math.min(0.45, 0.15 + linkWidth / 100);
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
      fill={`rgba(${rgb},${opacity})`}
      stroke={`rgba(${rgb},0.5)`}
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
    ...Object.fromEntries(
      Object.entries(portfolio?.fx ?? {}).map(([k, v]) => [k.toLowerCase(), v])
    ),
  };

  const [filters, setFilters] = useState<Filters>({ year: "all", ticker: "all", tipo: "all", moeda: "all" });
  const updateFilter = (f: Partial<Filters>) => setFilters(p => ({ ...p, ...f }));

  const options = useMemo(() => {
    const years = [...new Set(rawData.map(r => rowYear(r)).filter(Boolean))].sort().reverse();
    const tickers = [...new Set(rawData.map(r => String(r["ticker"] ?? "").toUpperCase().trim()).filter(Boolean))].sort();
    const tipos = [...new Set(rawData.map(r => String(r["lancamento"] ?? r["decisao"] ?? "").trim()).filter(Boolean))].sort();
    const moedas = [...new Set(rawData.map(r => String(r["moeda"] ?? "BRL").toUpperCase().trim()).filter(Boolean))].sort();
    return { years, tickers, tipos, moedas };
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
  const noFilter = filters.year === "all" && filters.ticker === "all" && filters.tipo === "all" && filters.moeda === "all";
  const metrics = useMemo(() => {
    let bruto = 0;
    let imposto = 0;
    filteredData.forEach(r => {
      const abs = rowAbsBRL(r, fx);
      if (rowIsImposto(r)) imposto += abs;
      else bruto += abs;
    });
    const summed = bruto - imposto;
    const total = noFilter && portfolio?.totalProventosBRL ? portfolio.totalProventosBRL : summed;
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

    const byMonth: Record<string, number> = {};
    filteredData.forEach(r => {
      const m = rowMonth(r);
      if (!m) return;
      byMonth[m] = (byMonth[m] ?? 0) + rowValueBRL(r, fx);
    });
    const bestMonth = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0];

    return {
      total, bruto, imposto, avgMonth, tickers: tickers.size,
      topTicker: topEntry?.[0] ?? "—", topValue: topEntry?.[1] ?? 0,
      bestMonth: bestMonth ? shortMonth(bestMonth[0]) : "—", bestMonthValue: bestMonth?.[1] ?? 0,
    };
  }, [filteredData, fx, noFilter, portfolio]);

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

  // ── YoY comparison ──
  const yoyData = useMemo(() => {
    const byYearMonth: Record<string, Record<string, number>> = {};
    filteredData.forEach(r => {
      const m = rowMonth(r);
      if (!m) return;
      const [year, mon] = m.split("-");
      if (!byYearMonth[year]) byYearMonth[year] = {};
      byYearMonth[year][mon] = (byYearMonth[year][mon] ?? 0) + rowValueBRL(r, fx);
    });
    const years = Object.keys(byYearMonth).sort();
    if (years.length < 2) return null;
    const lastTwo = years.slice(-2);
    const months = ["01","02","03","04","05","06","07","08","09","10","11","12"];
    const MONTH_LABELS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    let cumPrev = 0, cumCurr = 0;
    const rows = months.map((m, i) => {
      const prev = byYearMonth[lastTwo[0]]?.[m] ?? 0;
      const curr = byYearMonth[lastTwo[1]]?.[m] ?? 0;
      cumPrev += prev;
      cumCurr += curr;
      return { month: MONTH_LABELS[i], prev, curr, cumPrev, cumCurr };
    });
    const totalPrev = Object.values(byYearMonth[lastTwo[0]] ?? {}).reduce((s, v) => s + v, 0);
    const totalCurr = Object.values(byYearMonth[lastTwo[1]] ?? {}).reduce((s, v) => s + v, 0);
    const growthPct = totalPrev > 0 ? ((totalCurr - totalPrev) / totalPrev) * 100 : 0;
    return { rows, years: lastTwo, totalPrev, totalCurr, growthPct };
  }, [filteredData, fx]);

  // ── Calendar heatmap ──
  const calendarData = useMemo(() => {
    const byYearMonth: Record<string, Record<string, number>> = {};
    rawData.forEach(r => {
      const m = rowMonth(r);
      if (!m) return;
      const [year, mon] = m.split("-");
      if (!byYearMonth[year]) byYearMonth[year] = {};
      byYearMonth[year][mon] = (byYearMonth[year][mon] ?? 0) + rowValueBRL(r, fx);
    });
    const years = Object.keys(byYearMonth).sort();
    const allValues = Object.values(byYearMonth).flatMap(y => Object.values(y));
    const maxVal = Math.max(...allValues, 1);
    return { byYearMonth, years, maxVal };
  }, [rawData, fx]);

  // ── Projected annual income ──
  const projectedAnnual = useMemo(() => {
    const now = new Date();
    const currentYear = String(now.getFullYear());
    const currentMonth = now.getMonth() + 1;
    let ytdTotal = 0;
    filteredData.forEach(r => {
      if (rowYear(r) === currentYear) ytdTotal += rowValueBRL(r, fx);
    });
    if (currentMonth <= 1) return null;
    return (ytdTotal / currentMonth) * 12;
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

  const MONTH_LABELS_SHORT = ["J","F","M","A","M","J","J","A","S","O","N","D"];

  return (
    <>
      {/* ── Header personalizado ── */}
      <div className="flex items-center gap-4 mb-6 animate-fade-in">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Coins size={24} className="text-zinc-900" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-200 via-emerald-100 to-teal-300 bg-clip-text text-transparent">
            Proventos
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">Dividendos, JCP e rendimentos recebidos</p>
        </div>
      </div>

      <FilterBar filters={filters} onChange={updateFilter} options={options} />

      {/* ── Hero DRE Card ── */}
      <div className="glass-card p-5 mb-5 animate-fade-in" style={{ borderColor: "rgba(52,211,153,0.12)", boxShadow: "0 0 60px rgba(52,211,153,0.04)" }}>
        {/* Bruto → Imposto → Líquido */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-5 mb-4 pb-4 border-b border-zinc-800/40">
          <div className="flex-1">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">Bruto</p>
            <p className="text-xl font-bold text-zinc-200 font-mono">{compactBRL(metrics.bruto)}</p>
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-red-400/70 uppercase tracking-wider font-semibold mb-1">IR Retido</p>
            <p className="text-xl font-bold text-red-400 font-mono">−{compactBRL(metrics.imposto)}</p>
          </div>
          <div className="hidden sm:block text-zinc-700 text-lg">=</div>
          <div className="flex-1">
            <p className="text-[10px] text-emerald-400/70 uppercase tracking-wider font-semibold mb-1">Líquido</p>
            <p className="text-2xl font-bold text-emerald-400 font-mono">{compactBRL(metrics.total)}</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">{filteredData.length} pagamentos</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">Média Mensal</p>
            <p className="text-lg font-bold text-zinc-200 font-mono">{compactBRL(metrics.avgMonth)}</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">{metrics.tickers} ativos pagadores</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">Maior Pagador</p>
            <p className="text-lg font-bold text-zinc-100">{metrics.topTicker}</p>
            <p className="text-[10px] text-emerald-400/70 mt-0.5">{compactBRL(metrics.topValue)}</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">Projeção Anual</p>
            <p className="text-lg font-bold text-teal-400 font-mono">{projectedAnnual ? compactBRL(projectedAnnual) : "—"}</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">Baseado no YTD</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">Alíquota Efetiva</p>
            <p className="text-lg font-bold text-zinc-300 font-mono">
              {metrics.bruto > 0 ? `${((metrics.imposto / metrics.bruto) * 100).toFixed(1)}%` : "—"}
            </p>
            <p className="text-[10px] text-zinc-600 mt-0.5">IR / Bruto</p>
          </div>
        </div>

        {/* YoY growth badge */}
        {yoyData && (
          <div className="flex items-center gap-3 pt-3 border-t border-zinc-800/40">
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${yoyData.growthPct >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
              {yoyData.growthPct >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {yoyData.growthPct >= 0 ? "+" : ""}{yoyData.growthPct.toFixed(1)}%
            </div>
            <span className="text-[11px] text-zinc-500">
              {yoyData.years[1]} vs {yoyData.years[0]} — {compactBRL(yoyData.totalCurr)} vs {compactBRL(yoyData.totalPrev)}
            </span>
          </div>
        )}
      </div>

      {/* ── Evolução Mensal ── */}
      <div className="glass-card overflow-hidden mb-5 animate-fade-in" style={{ borderColor: "rgba(52,211,153,0.08)" }}>
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <Coins size={15} className="text-emerald-400" /> Evolução Mensal
          </h2>
          {monthlyChart.length > 0 && (
            <span className="text-[10px] text-zinc-600">{monthlyChart.length} meses</span>
          )}
        </div>
        <div className="px-5 pb-5">
          {monthlyChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyChart} margin={{ top: 5, right: 40, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="provBRL" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#059669" stopOpacity={0.3} />
                  </linearGradient>
                  <linearGradient id="provExt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis yAxisId="left" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => compactBRL(v)} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => compactBRL(v)} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [brl(v), name === "brl" ? "BRL" : name === "ext" ? "Exterior (R$)" : "Acumulado"]} />
                <Bar yAxisId="left" dataKey="brl" fill="url(#provBRL)" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar yAxisId="left" dataKey="ext" fill="url(#provExt)" radius={[4, 4, 0, 0]} stackId="a" />
                <Line yAxisId="right" type="monotone" dataKey="cum" stroke="#34d399" strokeWidth={2} strokeDasharray="6 3" dot={false} strokeOpacity={0.5} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-zinc-600 text-sm text-center py-8">Sem dados.</p>}
        </div>
        <div className="px-5 py-2.5 border-t border-zinc-800/40 flex items-center gap-4 text-[10px] text-zinc-600 justify-center bg-zinc-900/20">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: "#34d399" }} />BRL</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: "#6366f1" }} />Exterior (R$)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-px" style={{ background: "#34d399", opacity: 0.5 }} />Acumulado</span>
        </div>
      </div>

      {/* ── YoY Comparison + Calendar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* YoY Comparison */}
        {yoyData && (
          <div className="glass-card overflow-hidden animate-fade-in" style={{ borderColor: "rgba(52,211,153,0.08)" }}>
            <div className="px-5 pt-5 pb-3">
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                <TrendingUp size={15} className="text-emerald-400" /> Comparativo Anual
              </h2>
            </div>
            <div className="px-5 pb-5">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={yoyData.rows} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id="yoyPrev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#52525b" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#52525b" stopOpacity={0.2} />
                    </linearGradient>
                    <linearGradient id="yoyCurr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => compactBRL(v)} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [brl(v), name === "prev" ? yoyData.years[0] : yoyData.years[1]]} />
                  <Bar dataKey="prev" fill="url(#yoyPrev)" radius={[3, 3, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="curr" fill="url(#yoyCurr)" radius={[3, 3, 0, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="px-5 py-2.5 border-t border-zinc-800/40 flex items-center gap-4 text-[10px] text-zinc-600 justify-center bg-zinc-900/20">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: "#52525b" }} />{yoyData.years[0]}: {compactBRL(yoyData.totalPrev)}</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: "#34d399" }} />{yoyData.years[1]}: {compactBRL(yoyData.totalCurr)}</span>
            </div>
          </div>
        )}

        {/* Calendar Heatmap */}
        <div className="glass-card overflow-hidden animate-fade-in" style={{ borderColor: "rgba(52,211,153,0.08)" }}>
          <div className="px-5 pt-5 pb-3">
            <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <Calendar size={15} className="text-emerald-400" /> Calendário de Dividendos
            </h2>
          </div>
          <div className="px-5 pb-5 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-[10px] text-zinc-600 font-medium text-left py-1 pr-2 w-12" />
                  {MONTH_LABELS_SHORT.map(m => (
                    <th key={m} className="text-[10px] text-zinc-600 font-medium text-center py-1 px-0.5">{m}</th>
                  ))}
                  <th className="text-[10px] text-zinc-600 font-medium text-right py-1 pl-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {calendarData.years.map(year => {
                  const yearTotal = Object.values(calendarData.byYearMonth[year] ?? {}).reduce((s, v) => s + v, 0);
                  return (
                    <tr key={year}>
                      <td className="text-[11px] text-zinc-400 font-semibold py-0.5 pr-2">{year}</td>
                      {["01","02","03","04","05","06","07","08","09","10","11","12"].map(mon => {
                        const val = calendarData.byYearMonth[year]?.[mon] ?? 0;
                        const intensity = val > 0 ? Math.max(0.15, Math.min(1, val / calendarData.maxVal)) : 0;
                        return (
                          <td key={mon} className="py-0.5 px-0.5 text-center">
                            <div
                              className="w-full aspect-square rounded-sm flex items-center justify-center text-[8px] font-mono transition-all"
                              style={{
                                background: val > 0 ? `rgba(52,211,153,${intensity * 0.7})` : "rgba(39,39,42,0.3)",
                                color: intensity > 0.4 ? "#fff" : intensity > 0 ? "rgba(52,211,153,0.8)" : "transparent",
                                minWidth: 22,
                                minHeight: 22,
                              }}
                              title={val > 0 ? `${year}-${mon}: ${brl(val)}` : ""}
                            >
                              {val > 0 ? compactBRL(val).replace("R$", "").replace(" ", "") : ""}
                            </div>
                          </td>
                        );
                      })}
                      <td className="text-[10px] text-zinc-400 font-mono text-right py-0.5 pl-2">{compactBRL(yearTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Distribution + Ranking ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="glass-card overflow-hidden animate-fade-in" style={{ borderColor: "rgba(52,211,153,0.06)" }}>
          <div className="px-5 pt-5 pb-3">
            <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <Percent size={15} className="text-emerald-400" /> Por Tipo
            </h2>
          </div>
          <div className="px-5 pb-5">
            {byTypeChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={byTypeChart}
                    dataKey="total"
                    nameKey="tipo"
                    cx="50%"
                    cy="45%"
                    innerRadius={45}
                    outerRadius={80}
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
                  <Legend iconSize={7} wrapperStyle={{ fontSize: 10, color: "#a1a1aa", paddingTop: 4 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-zinc-600 text-sm text-center py-8">Sem dados.</p>}
          </div>
        </div>

        <div className="glass-card overflow-hidden lg:col-span-2 animate-fade-in" style={{ borderColor: "rgba(52,211,153,0.06)" }}>
          <div className="px-5 pt-5 pb-3">
            <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <Award size={15} className="text-emerald-400" /> Ranking por Ativo
            </h2>
          </div>
          <div className="px-5 pb-5">
            {byTickerChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(200, byTickerChart.length * 28)}>
                <BarChart data={byTickerChart} layout="vertical" margin={{ top: 2, right: 16, bottom: 2, left: 5 }}>
                  <defs>
                    <linearGradient id="rankGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#059669" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#18181b" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => compactBRL(v)} />
                  <YAxis type="category" dataKey="ticker" tick={{ fill: "#e2e8f0", fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} width={65} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [brl(v), "Total"]} />
                  <Bar dataKey="total" fill="url(#rankGrad)" radius={[0, 6, 6, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-zinc-600 text-sm text-center py-8">Sem dados.</p>}
          </div>
        </div>
      </div>

      {/* ── Sankey: Ativo → Setor → Moeda ── */}
      {sankeyData && (
        <div className="glass-card overflow-hidden mb-5 animate-fade-in" style={{ borderColor: "rgba(52,211,153,0.06)" }}>
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <Layers size={15} className="text-emerald-400" /> Fluxo de Capital
            </h2>
            <p className="text-[10px] text-zinc-600">Ativo → Setor → Moeda</p>
          </div>

          <div className="flex justify-between px-5 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: "#818cf8" }} />
              <span className="text-[10px] font-semibold text-zinc-500">Ativos</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: "#34d399" }} />
              <span className="text-[10px] font-semibold text-zinc-500">Setores</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: "#fbbf24" }} />
              <span className="text-[10px] font-semibold text-zinc-500">Moedas</span>
            </div>
          </div>

          <div className="px-5 pb-5">
            <ResponsiveContainer width="100%" height={Math.max(400, sankeyData.nodes.length * 24)}>
              <Sankey
                data={sankeyData}
                nodeWidth={12}
                nodePadding={16}
                linkCurvature={0.5}
                iterations={64}
                margin={{ top: 8, right: 80, bottom: 8, left: 80 }}
                node={<SankeyNodeRenderer />}
                link={<SankeyLinkRenderer />}
              >
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number) => [brl(value), "Proventos"]} />
              </Sankey>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Fluxo por Origem (monthly stacked) ── */}
      <div className="glass-card overflow-hidden mb-5 animate-fade-in" style={{ borderColor: "rgba(52,211,153,0.06)" }}>
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <Layers size={15} className="text-emerald-400" /> Fluxo por Origem
          </h2>
        </div>
        <div className="px-5 pb-5">
          {byOriginChart.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byOriginChart.data} margin={{ top: 2, right: 4, bottom: 2, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => compactBRL(v)} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [brl(v), name]} />
                <Legend iconSize={7} wrapperStyle={{ fontSize: 10, color: "#71717a" }} />
                {byOriginChart.origins.map((origin, i) => (
                  <Bar key={origin} dataKey={origin} stackId="origin" fill={ORIGIN_COLORS[origin] || PALETTE[i % PALETTE.length]} radius={i === 0 ? [3, 3, 0, 0] : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-zinc-600 text-sm text-center py-8">Sem dados.</p>}
        </div>
      </div>

      {/* ── Tabela ── */}
      <div className="glass-card overflow-hidden animate-fade-in" style={{ borderColor: "rgba(52,211,153,0.06)" }}>
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <Calendar size={15} className="text-emerald-400" /> Histórico
          </h2>
          <span className="text-[10px] text-zinc-600">{filteredData.length} registros</span>
        </div>
        <DataTable data={filteredData} columns={columns} />
      </div>
    </>
  );
}

"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, BarChart, Bar, Cell, ReferenceLine,
  LineChart, Line,
} from "recharts";
import {
  TrendingUp, TrendingDown, BarChart2, Activity, Scale,
  Calendar, Target, AlertTriangle, DollarSign, Zap, RefreshCw,
  Landmark,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";
import MetricCard from "@/components/MetricCard";
import { brl, compactBRL, pct } from "@/lib/format";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Summary {
  twrTotal: number;
  twrAnualizado: number;
  mwr: number;
  navFinal: number;
  navInicial: number;
  totalInvestido: number;
  duracaoAnos: number;
  primeiraData: string;
  ultimaData: string;
  vsCDI: number;
  vsIBOV: number;
  cdiTotal: number;
  ibovTotal: number;
  maxDrawdown: number;
  volatility: number;
  sharpe: number;
  sortino: number;
  var95: number;
  var99: number;
  ganhoEconomico: number;
  peakDate: string;
  troughDate: string;
  peakTwr: number;
  troughTwr: number;
}

interface ChartPoint { date: string; nav: number; flow: number; ret: number; twr: number }
interface DrawdownPoint { date: string; drawdown: number; nav: number }
interface RollingPoint { date: string; "1M": number; "3M": number; "6M": number; "1A": number }
interface MonthlyReturn { month: string; return_pct: number }
interface FlowEntry { date: string; flow: number; nav: number; nav_before: number; daily_return: number; cumulative_twr: number }
interface AttributionEntry { setor: string; macro: string; contrib_pct: number; nav_medio: number }

interface PerformanceResponse {
  summary: Summary;
  chart: ChartPoint[];
  benchmarks: { cdi: ChartPoint[]; ibov: ChartPoint[] };
  drawdownData: DrawdownPoint[];
  rolling: RollingPoint[];
  monthlyReturns: MonthlyReturn[];
  flowLedger: FlowEntry[];
  attribution: AttributionEntry[];
  fxDecomposition: { r_total: number; r_ativo: number; r_fx: number; r_combinado: number };
  errors: string[];
  lookback: number;
}

interface DecomposicaoBucket {
  currency: string;
  valor_brl: number;
  custo_brl: number;
  ganho_ativo_brl: number;
  ganho_cambio_brl: number;
  retorno_ativo_pct: number;
  retorno_cambio_pct: number;
  retorno_total_pct: number;
  num_positions: number;
}

interface DecomposicaoResponse {
  buckets: DecomposicaoBucket[];
  total: {
    valor_brl: number;
    custo_brl: number;
    ganho_ativo_brl: number;
    ganho_cambio_brl: number;
    retorno_ativo_pct: number;
    retorno_cambio_pct: number;
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WINDOWS = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1A", days: 365 },
  { label: "3A", days: 1095 },
  { label: "5A", days: 1825 },
  { label: "Tudo", days: 3650 },
] as const;

const TOOLTIP_STYLE = {
  background: "#09090b",
  border: "1px solid #27272a",
  borderRadius: 12,
  color: "#fafafa",
  fontSize: 12,
};

const SECTOR_COLORS: Record<string, string> = {
  "Ações Brasil": "#3b82f6", "Ações Internacional": "#8b5cf6",
  "ETF USA": "#06b6d4", "ETF": "#10b981", "FIIs": "#f59e0b",
  "Cripto": "#f97316", "Commodities": "#eab308", "BDRs": "#ec4899",
  "Renda Fixa": "#6366f1", "Renda Fixa USD": "#a78bfa",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(s: string) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function formatDateShort(s: string) {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y?.slice(2)}`;
}

function formatDuracao(anos: number): string {
  if (anos < 0.1) return "< 1 mês";
  if (anos < 1) return `${Math.round(anos * 12)} meses`;
  const y = Math.floor(anos);
  const m = Math.round((anos - y) * 12);
  return m > 0 ? `${y}a ${m}m` : `${y} ano${y > 1 ? "s" : ""}`;
}

function RatingBadge({ value, thresholds, labels }: {
  value: number;
  thresholds: [number, number, number];
  labels: [string, string, string, string];
}) {
  const [bad, ok, good] = thresholds;
  const level = value >= good ? 3 : value >= ok ? 2 : value >= bad ? 1 : 0;
  const colors = [
    "bg-red-500/15 text-red-400 border-red-500/25",
    "bg-amber-500/15 text-amber-400 border-amber-500/25",
    "bg-sky-500/15 text-sky-400 border-sky-500/25",
    "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  ];
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${colors[level]}`}>
      {labels[level]}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "overview" | "drawdown" | "rolling" | "monthly" | "fluxos" | "attribution";
const TAB_LABELS: Record<Tab, string> = {
  overview: "Retorno",
  drawdown: "Drawdown",
  rolling: "Rolling",
  monthly: "Mensal",
  fluxos: "Fluxos",
  attribution: "Atribuição",
};

export default function PerformancePage() {
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lookback, setLookback] = useState(1825);
  const [showBenchmarks, setShowBenchmarks] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [decomp, setDecomp] = useState<DecomposicaoResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/api/performance/advanced?lookback=${lookback}`)
      .then(r => r.json())
      .then(body => {
        if (cancelled) return;
        if (body.error) throw new Error(body.error);
        setData(body);
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lookback]);

  useEffect(() => {
    fetch(`${API_URL}/api/twr/decomposicao`)
      .then(r => r.json())
      .then(body => setDecomp(body))
      .catch(() => {});
  }, []);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.chart.map((p, i) => ({
      date: p.date.slice(5),
      fullDate: p.date,
      portfolio: +(p.twr * 100).toFixed(2),
      cdi: data.benchmarks.cdi[i]?.twr != null ? +(data.benchmarks.cdi[i].twr * 100).toFixed(2) : null,
      ibov: data.benchmarks.ibov[i]?.twr != null ? +(data.benchmarks.ibov[i].twr * 100).toFixed(2) : null,
      nav: p.nav,
    }));
  }, [data]);

  const drawdownData = useMemo(() =>
    (data?.drawdownData ?? []).map(d => ({ date: formatDateShort(d.date), drawdown: d.drawdown })),
  [data]);

  const rollingData = useMemo(() =>
    (data?.rolling ?? []).filter((_, i) => i % 5 === 0).map(r => ({
      date: formatDateShort(r.date),
      "1M": r["1M"], "3M": r["3M"], "6M": r["6M"], "1A": r["1A"],
    })),
  [data]);

  const monthlyGrid = useMemo(() => {
    if (!data?.monthlyReturns) return { years: [] as number[], byYearMonth: {} as Record<number, Record<number, number>> };
    const byYearMonth: Record<number, Record<number, number>> = {};
    for (const m of data.monthlyReturns) {
      const [y, mo] = m.month.split("-").map(Number);
      if (!byYearMonth[y]) byYearMonth[y] = {};
      byYearMonth[y][mo] = m.return_pct;
    }
    const years = Object.keys(byYearMonth).map(Number).sort((a, b) => a - b);
    return { years, byYearMonth };
  }, [data]);

  const handleRefresh = () => {
    setLoading(true);
    setData(null);
    fetch(`${API_URL}/api/performance/advanced?lookback=${lookback}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  if (loading) return (<><PageHeader title="Performance" description="Carregando dados..." /><LoadingSpinner /></>);
  if (error) return (<><PageHeader title="Performance" description="" /><ErrorAlert message={error} /></>);
  if (!data) return null;

  const s = data.summary;
  const twrPct = s.twrTotal * 100;
  const mwrPct = s.mwr * 100;
  const isPositive = twrPct >= 0;
  const trendColor = isPositive ? "#34d399" : "#f87171";

  return (
    <>
      <PageHeader
        title="Performance"
        description={`${formatDate(s.primeiraData)} → ${formatDate(s.ultimaData)} · ${formatDuracao(s.duracaoAnos)} · Metodologia GIPS`}
      />

      {/* ── Window selector ── */}
      <div className="flex items-center gap-1.5 mb-6 flex-wrap">
        {WINDOWS.map(w => (
          <button key={w.label} onClick={() => setLookback(w.days)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              lookback === w.days
                ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
            }`}>
            {w.label}
          </button>
        ))}
        <button onClick={() => setShowBenchmarks(v => !v)}
          className={`ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
            showBenchmarks
              ? "bg-indigo-900/50 text-indigo-300 border-indigo-700/40"
              : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
          }`}>
          {showBenchmarks ? "Ocultar benchmarks" : "Ver benchmarks"}
        </button>
        <button onClick={handleRefresh} className="text-zinc-600 hover:text-zinc-400 transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* ── Top Metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <MetricCard
          label="TWR Total"
          value={pct(twrPct)}
          sub={`Anualizado: ${pct(s.twrAnualizado * 100)}`}
          icon={isPositive ? <TrendingUp size={17} /> : <TrendingDown size={17} />}
          trend={isPositive ? "up" : "down"}
          glowColor={trendColor}
        />
        <MetricCard
          label="MWR / IRR"
          value={pct(mwrPct)}
          sub="Retorno ponderado por capital"
          icon={<Scale size={17} />}
          trend={mwrPct >= 0 ? "up" : "down"}
          glowColor={mwrPct >= 0 ? "#34d399" : "#f87171"}
        />
        <MetricCard
          label="NAV Atual"
          value={compactBRL(s.navFinal)}
          sub={`Investido ${compactBRL(s.totalInvestido)}`}
          icon={<DollarSign size={17} />}
          glowColor="#d4a574"
        />
        <MetricCard
          label="vs CDI"
          value={pct(s.vsCDI * 100)}
          sub={`CDI período ${pct(s.cdiTotal * 100)}`}
          icon={<Target size={17} />}
          trend={s.vsCDI >= 0 ? "up" : "down"}
          glowColor={s.vsCDI >= 0 ? "#34d399" : "#f87171"}
        />
        <MetricCard
          label="vs IBOV"
          value={pct(s.vsIBOV * 100)}
          sub={`IBOV período ${pct(s.ibovTotal * 100)}`}
          icon={<Landmark size={17} />}
          trend={s.vsIBOV >= 0 ? "up" : "down"}
          glowColor={s.vsIBOV >= 0 ? "#34d399" : "#f87171"}
        />
        <MetricCard
          label="Ganho Econômico"
          value={compactBRL(s.ganhoEconomico)}
          sub="NAV final − inicial − aportes"
          icon={<BarChart2 size={17} />}
          trend={s.ganhoEconomico >= 0 ? "up" : "down"}
          glowColor={s.ganhoEconomico >= 0 ? "#34d399" : "#f87171"}
        />
      </div>

      {/* ── Risk Metrics ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: "Volatilidade", value: `${(s.volatility * 100).toFixed(1)}%`,
            badge: <RatingBadge value={s.volatility * 100} thresholds={[30, 20, 10]} labels={["Alta", "Moderada", "Baixa", "Muito Baixa"]} /> },
          { label: "Max Drawdown", value: `${s.maxDrawdown.toFixed(1)}%`,
            badge: <RatingBadge value={-s.maxDrawdown} thresholds={[-50, -30, -15]} labels={["Severo", "Alto", "Moderado", "Baixo"]} /> },
          { label: "Sharpe Ratio", value: s.sharpe.toFixed(2),
            badge: <RatingBadge value={s.sharpe} thresholds={[0, 0.5, 1]} labels={["Fraco", "Razoável", "Bom", "Excelente"]} /> },
          { label: "Sortino Ratio", value: s.sortino.toFixed(2),
            badge: <RatingBadge value={s.sortino} thresholds={[0, 0.7, 1.5]} labels={["Fraco", "Razoável", "Bom", "Excelente"]} /> },
          { label: "VaR 95%", value: `${s.var95.toFixed(2)}%`, badge: null },
          { label: "VaR 99%", value: `${s.var99.toFixed(2)}%`, badge: null },
        ].map(m => (
          <div key={m.label} className="glass-card p-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">{m.label}</p>
            <p className="text-xl font-bold text-zinc-100 mb-1">{m.value}</p>
            {m.badge}
          </div>
        ))}
      </div>

      {/* ── Sub-tabs ── */}
      <div className="flex gap-1 bg-zinc-900/60 rounded-xl p-1 mb-6 flex-wrap border border-zinc-800/50">
        {(Object.keys(TAB_LABELS) as Tab[]).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}>
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
           TAB: RETORNO (overview)
         ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* TWR chart */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title"><TrendingUp size={15} />Rentabilidade Acumulada (%)</h2>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Calendar size={12} />
                <span>{formatDate(s.primeiraData)} — {formatDate(s.ultimaData)}</span>
                <span className="text-zinc-600">·</span>
                <span>{formatDuracao(s.duracaoAnos)}</span>
              </div>
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id="gradPortfolio" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={trendColor} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={trendColor} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradCDI" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradIBOV" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                  <ReferenceLine y={0} stroke="#27272a" strokeWidth={1} />
                  <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, name: string) => [
                      `${v > 0 ? "+" : ""}${v.toFixed(2)}%`,
                      name === "portfolio" ? "Portfólio" : name === "cdi" ? "CDI" : "IBOV",
                    ]}
                    labelFormatter={label => `Data: ${label}`} />
                  <Legend formatter={v => v === "portfolio" ? "Portfólio" : v === "cdi" ? "CDI" : "IBOV"}
                    wrapperStyle={{ fontSize: 11, color: "#71717a" }} />
                  <Area type="monotone" dataKey="portfolio" stroke={trendColor} fill="url(#gradPortfolio)"
                    strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  {showBenchmarks && (
                    <>
                      <Area type="monotone" dataKey="cdi" stroke="#6366f1" fill="url(#gradCDI)"
                        strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                      <Area type="monotone" dataKey="ibov" stroke="#f59e0b" fill="url(#gradIBOV)"
                        strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                    </>
                  )}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-zinc-500 text-sm">Sem dados para o período selecionado.</p>
            )}
          </div>

          {/* NAV + Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="glass-card p-5">
              <h2 className="section-title mb-4">Evolução do Patrimônio RV</h2>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="gradNav" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d4a574" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#d4a574" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                    <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => compactBRL(v)} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [brl(v), "NAV BRL"]} />
                    <Area type="monotone" dataKey="nav" stroke="#d4a574" fill="url(#gradNav)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-zinc-500 text-sm">Sem dados.</p>
              )}
            </div>

            <div className="glass-card p-5">
              <h2 className="section-title mb-4">Resumo do Período</h2>
              <div className="space-y-2">
                {[
                  { label: "TWR acumulado", value: pct(twrPct), color: trendColor },
                  { label: "TWR anualizado (CAGR)", value: pct(s.twrAnualizado * 100), color: trendColor },
                  { label: "MWR / TIR anualizado", value: pct(mwrPct), color: mwrPct >= 0 ? "#a78bfa" : "#f87171" },
                  { label: "CDI no período", value: pct(s.cdiTotal * 100), color: "#6366f1" },
                  { label: "IBOV no período", value: pct(s.ibovTotal * 100), color: "#f59e0b" },
                  { label: "Alpha vs CDI", value: pct(s.vsCDI * 100), color: s.vsCDI >= 0 ? "#34d399" : "#f87171" },
                  { label: "Patrimônio inicial", value: compactBRL(s.navInicial) },
                  { label: "Total aportado", value: compactBRL(s.totalInvestido) },
                  { label: "Patrimônio final", value: compactBRL(s.navFinal) },
                  { label: "Ganho econômico", value: compactBRL(s.ganhoEconomico), color: s.ganhoEconomico >= 0 ? "#34d399" : "#f87171" },
                  { label: "Duração", value: formatDuracao(s.duracaoAnos) },
                  { label: "Primeiro aporte", value: formatDate(s.primeiraData) },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center text-sm border-b border-border/20 pb-1.5 last:border-0 last:pb-0">
                    <span className="text-zinc-400">{row.label}</span>
                    <span className="font-semibold" style={{ color: row.color ?? "#f1f5f9" }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* TWR vs MWR + FX Decomposition */}
          <div className="glass-card p-5">
            <h2 className="section-title mb-4"><Activity size={15} />TWR vs MWR — Comparação</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                  <p className="text-xs font-bold text-blue-400 mb-1">TWR — Time-Weighted Return</p>
                  <p className="text-xs text-zinc-500">Elimina o efeito dos aportes e resgates. Mede a qualidade das decisões de investimento independente do timing dos aportes.</p>
                  <p className="text-sm font-bold text-blue-300 mt-2">{pct(twrPct)} total · {pct(s.twrAnualizado * 100)} a.a.</p>
                </div>
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
                  <p className="text-xs font-bold text-purple-400 mb-1">MWR / IRR — Money-Weighted Return</p>
                  <p className="text-xs text-zinc-500">Inclui o impacto do timing dos aportes. Reflete o retorno real do seu dinheiro investido.</p>
                  <p className="text-sm font-bold text-purple-300 mt-2">{pct(mwrPct)} a.a.</p>
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-zinc-400 mb-3">
                  <DollarSign size={13} className="inline" /> Decomposição: Ativo vs Cambial
                </h3>
                <p className="text-[10px] text-zinc-600 mb-3">
                  R<sub>total</sub> = (1 + R<sub>ativo</sub>) × (1 + R<sub>fx</sub>) − 1
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "R. Total", value: data.fxDecomposition.r_total * 100, color: "#60a5fa" },
                    { label: "C. Ativo", value: data.fxDecomposition.r_ativo * 100, color: "#34d399" },
                    { label: "C. Cambial", value: data.fxDecomposition.r_fx * 100, color: "#f59e0b" },
                  ].map(item => (
                    <div key={item.label} className="text-center p-3 rounded-xl bg-zinc-900/50">
                      <p className="text-[10px] text-zinc-500 mb-1">{item.label}</p>
                      <p className="text-lg font-bold" style={{ color: item.color }}>
                        {item.value >= 0 ? "+" : ""}{item.value.toFixed(2)}%
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Currency decomposition */}
          {decomp && decomp.buckets.length > 1 && (
            <div className="glass-card p-5">
              <h2 className="section-title mb-4"><BarChart2 size={15} />Decomposição por Moeda</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/30">
                      {["Moeda", "Posições", "Valor BRL", "Ret. Ativo", "Ret. Câmbio", "Ret. Total"].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {decomp.buckets.map(b => (
                      <tr key={b.currency} className="border-b border-border/10 hover:bg-white/[0.02]">
                        <td className="px-3 py-2.5 font-mono text-xs font-semibold text-zinc-200">{b.currency}</td>
                        <td className="px-3 py-2.5 text-xs text-zinc-500">{b.num_positions}</td>
                        <td className="px-3 py-2.5 text-xs text-zinc-300">{compactBRL(b.valor_brl)}</td>
                        <td className="px-3 py-2.5 text-xs font-semibold" style={{ color: b.retorno_ativo_pct >= 0 ? "#34d399" : "#f87171" }}>
                          {b.retorno_ativo_pct >= 0 ? "+" : ""}{b.retorno_ativo_pct.toFixed(2)}%
                        </td>
                        <td className="px-3 py-2.5 text-xs font-semibold" style={{ color: b.retorno_cambio_pct >= 0 ? "#34d399" : "#f87171" }}>
                          {b.retorno_cambio_pct >= 0 ? "+" : ""}{b.retorno_cambio_pct.toFixed(2)}%
                        </td>
                        <td className="px-3 py-2.5 text-xs font-bold" style={{ color: b.retorno_total_pct >= 0 ? "#34d399" : "#f87171" }}>
                          {b.retorno_total_pct >= 0 ? "+" : ""}{b.retorno_total_pct.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-border/30 bg-white/[0.02]">
                      <td className="px-3 py-2.5 text-xs font-bold text-zinc-200">Total</td>
                      <td className="px-3 py-2.5" />
                      <td className="px-3 py-2.5 text-xs font-bold text-zinc-200">{compactBRL(decomp.total.valor_brl)}</td>
                      <td className="px-3 py-2.5 text-xs font-bold" style={{ color: decomp.total.retorno_ativo_pct >= 0 ? "#34d399" : "#f87171" }}>
                        {decomp.total.retorno_ativo_pct >= 0 ? "+" : ""}{decomp.total.retorno_ativo_pct.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2.5 text-xs font-bold" style={{ color: decomp.total.retorno_cambio_pct >= 0 ? "#34d399" : "#f87171" }}>
                        {decomp.total.retorno_cambio_pct >= 0 ? "+" : ""}{decomp.total.retorno_cambio_pct.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2.5" />
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-zinc-600 mt-2">
                Ret. Ativo = retorno do ativo na moeda original · Ret. Câmbio = impacto do câmbio no BRL · Total = (1+Ativo)×(1+Câmbio)−1
              </p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
           TAB: DRAWDOWN
         ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "drawdown" && (
        <div className="space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="section-title"><AlertTriangle size={15} />Drawdown — Recuo do Pico</h2>
              <span className="text-xs text-red-400 font-semibold">Máx: {s.maxDrawdown.toFixed(2)}%</span>
            </div>
            <p className="text-xs text-zinc-600 mb-4">Mostra quanto o portfólio caiu em relação ao seu valor máximo histórico a cada ponto no tempo.</p>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={drawdownData}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f87171" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" />
                <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                  interval={Math.floor(drawdownData.length / 8)} />
                <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v.toFixed(0)}%`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v.toFixed(2)}%`, "Drawdown"]} />
                <ReferenceLine y={0} stroke="#3f3f46" strokeWidth={1} />
                <Area type="monotone" dataKey="drawdown" stroke="#f87171" fill="url(#ddGrad)" strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Máximo Drawdown", value: `${s.maxDrawdown.toFixed(2)}%`, color: "text-red-400", desc: "Maior recuo observado" },
              { label: "Data do Pico", value: formatDateShort(s.peakDate), color: "text-emerald-400", desc: `TWR máximo: +${(s.peakTwr * 100).toFixed(2)}%` },
              { label: "Data do Vale", value: formatDateShort(s.troughDate), color: "text-amber-400", desc: `TWR mínimo: ${(s.troughTwr * 100).toFixed(2)}%` },
            ].map(item => (
              <div key={item.label} className="glass-card p-4">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{item.label}</p>
                <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-zinc-600 mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
           TAB: ROLLING RETURNS
         ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "rolling" && (
        <div className="glass-card p-5">
          <h2 className="section-title mb-2"><Activity size={15} />Rolling Returns — Retorno Móvel</h2>
          <p className="text-xs text-zinc-600 mb-4">Retorno acumulado em janelas móveis de 1, 3, 6 e 12 meses. Mostra consistência de performance ao longo do tempo.</p>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={rollingData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" />
              <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                interval={Math.floor(rollingData.length / 6)} />
              <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => `${v.toFixed(0)}%`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [`${v.toFixed(2)}%`, `Rolling ${name}`]} />
              <ReferenceLine y={0} stroke="#3f3f46" strokeWidth={1} />
              <Line type="monotone" dataKey="1M" stroke="#60a5fa" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="3M" stroke="#34d399" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="6M" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="1A" stroke="#a78bfa" strokeWidth={2} dot={false} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#71717a" }} formatter={v => `Rolling ${v}`} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
           TAB: MONTHLY HEATMAP
         ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "monthly" && (
        <div className="glass-card p-5">
          <h2 className="section-title mb-4"><Calendar size={15} />Retornos Mensais — Heatmap</h2>
          <p className="text-xs text-zinc-600 mb-5">Cada célula representa o retorno do portfólio naquele mês. Verde = positivo, vermelho = negativo.</p>

          {monthlyGrid.years.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr>
                    <th className="text-left pr-3 pb-3 text-zinc-600 font-semibold uppercase tracking-wider text-[9px] w-12">Ano</th>
                    {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map(m => (
                      <th key={m} className="text-center pb-3 text-zinc-600 font-semibold uppercase tracking-wider text-[9px] min-w-[52px]">{m}</th>
                    ))}
                    <th className="text-center pb-3 text-zinc-600 font-semibold uppercase tracking-wider text-[9px] pl-3 w-16">Ano</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyGrid.years.map(year => {
                    const mths = monthlyGrid.byYearMonth[year] ?? {};
                    const yearVals = Object.values(mths);
                    const yearTotal = yearVals.length > 0
                      ? yearVals.reduce((acc, v) => acc * (1 + v / 100), 1) * 100 - 100
                      : null;
                    return (
                      <tr key={year} className="group">
                        <td className="pr-3 py-1 text-zinc-400 font-bold text-[11px]">{year}</td>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(mo => {
                          const v = mths[mo];
                          if (v === undefined) {
                            return <td key={mo} className="py-1 px-0.5"><div className="rounded-md h-9 bg-zinc-900/40" /></td>;
                          }
                          const isPos = v >= 0;
                          const intensity = Math.min(Math.abs(v) / 5, 1);
                          const bg = isPos
                            ? `rgba(52,211,153,${0.12 + intensity * 0.55})`
                            : `rgba(248,113,113,${0.12 + intensity * 0.55})`;
                          const textColor = isPos ? "#34d399" : "#f87171";
                          return (
                            <td key={mo} className="py-1 px-0.5">
                              <div
                                className="rounded-md h-9 flex items-center justify-center font-semibold cursor-default transition-transform hover:scale-105"
                                style={{ background: bg, color: textColor }}
                                title={`${["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][mo-1]}/${year}: ${v >= 0 ? "+" : ""}${v.toFixed(2)}%`}
                              >
                                {v >= 0 ? "+" : ""}{v.toFixed(1)}%
                              </div>
                            </td>
                          );
                        })}
                        <td className="py-1 pl-3">
                          {yearTotal !== null && (
                            <div
                              className="rounded-md h-9 flex items-center justify-center font-bold text-[11px] border"
                              style={{
                                borderColor: yearTotal >= 0 ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)",
                                color: yearTotal >= 0 ? "#34d399" : "#f87171",
                                background: yearTotal >= 0 ? "rgba(52,211,153,0.07)" : "rgba(248,113,113,0.07)",
                              }}
                            >
                              {yearTotal >= 0 ? "+" : ""}{yearTotal.toFixed(1)}%
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-zinc-600 text-sm text-center py-8">Sem dados mensais disponíveis</p>
          )}

          {monthlyGrid.years.length > 0 && (() => {
            const all = Object.values(monthlyGrid.byYearMonth).flatMap(m => Object.values(m));
            const pos = all.filter(v => v >= 0).length;
            const neg = all.filter(v => v < 0).length;
            const avg = all.length > 0 ? all.reduce((s, v) => s + v, 0) / all.length : 0;
            return (
              <p className="text-xs text-zinc-600 mt-4">
                Média mensal: <span className="text-zinc-400 font-semibold">{avg >= 0 ? "+" : ""}{avg.toFixed(2)}%</span>
                {" · "}Positivos: <span className="text-emerald-400 font-semibold">{pos}</span>
                {" · "}Negativos: <span className="text-red-400 font-semibold">{neg}</span>
                {" · "}Hit rate: <span className="text-zinc-400 font-semibold">{all.length > 0 ? ((pos / all.length) * 100).toFixed(0) : 0}%</span>
              </p>
            );
          })()}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
           TAB: FLOW LEDGER
         ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "fluxos" && (
        <div className="glass-card p-5">
          <h2 className="section-title mb-4"><Zap size={15} />Ledger de Fluxos — Aportes e Resgates</h2>
          {data.flowLedger.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    {["Data", "Fluxo", "NAV Antes", "NAV Após", "Ret Dia", "TWR Acum"].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-zinc-500 font-semibold uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.flowLedger.map((f, i) => (
                    <tr key={i} className="border-b border-zinc-900 hover:bg-white/[0.02]">
                      <td className="py-2 px-3 text-zinc-400 font-mono">{formatDateShort(f.date)}</td>
                      <td className={`py-2 px-3 font-semibold ${f.flow >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {f.flow >= 0 ? "+" : ""}{brl(f.flow)}
                      </td>
                      <td className="py-2 px-3 text-zinc-400">{compactBRL(f.nav_before)}</td>
                      <td className="py-2 px-3 text-zinc-200 font-medium">{compactBRL(f.nav)}</td>
                      <td className={`py-2 px-3 font-mono ${f.daily_return >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {f.daily_return >= 0 ? "+" : ""}{f.daily_return.toFixed(3)}%
                      </td>
                      <td className={`py-2 px-3 font-mono font-semibold ${f.cumulative_twr >= 0 ? "text-blue-400" : "text-red-400"}`}>
                        {f.cumulative_twr >= 0 ? "+" : ""}{f.cumulative_twr.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-zinc-600 text-sm">Nenhum fluxo significativo encontrado no período.</p>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
           TAB: ATTRIBUTION
         ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "attribution" && (
        <div className="glass-card p-5">
          <h2 className="section-title mb-4"><BarChart2 size={15} />Atribuição de Retorno por Setor</h2>
          {data.attribution.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={Math.max(200, data.attribution.length * 36)}>
                <BarChart layout="vertical" data={data.attribution} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${v.toFixed(1)}%`} />
                  <YAxis type="category" dataKey="setor" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                  <Tooltip contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number) => [`${v.toFixed(2)}%`, "Contribuição"]} />
                  <ReferenceLine x={0} stroke="#3f3f46" strokeWidth={1} />
                  <Bar dataKey="contrib_pct" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {data.attribution.map((entry, i) => (
                      <Cell key={i} fill={SECTOR_COLORS[entry.setor] ?? (entry.contrib_pct >= 0 ? "#34d399" : "#f87171")} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-zinc-600 mt-3">
                * Atribuição estimada baseada no peso de cada setor no custo total do portfólio aplicado ao retorno TWR global.
              </p>
            </>
          ) : (
            <p className="text-zinc-600 text-sm">Dados insuficientes para calcular atribuição.</p>
          )}
        </div>
      )}

      {/* ── Data quality warnings ── */}
      {data.errors.length > 0 && (
        <div className="glass-card p-4 border-l-2 border-yellow-600/40 mt-6">
          <p className="text-xs font-semibold text-yellow-500 mb-1">Avisos de dados</p>
          <ul className="space-y-0.5">
            {data.errors.map((e, i) => (
              <li key={i} className="text-xs text-zinc-400">{e}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

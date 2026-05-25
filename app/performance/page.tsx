"use client";

import { useState, useEffect, useMemo } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
  Legend,
} from "recharts";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";
import MetricCard from "@/components/MetricCard";
import { brl, compactBRL, pct } from "@/lib/format";
import { TrendingUp, TrendingDown, Calendar, Target, Landmark, DollarSign, BarChart2, Scale } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TwrPoint {
  date: string;
  nav: number;
  flow: number;
  ret: number;
  twr: number;
}

interface TwrResponse {
  summary: {
    twrTotal: number;
    twrAnualizado: number;
    mwr?: number;
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
    ganhoEconomico?: number;
    usandoLbHistoric?: boolean;
    numAnchors?: number;
  };
  chart: TwrPoint[];
  benchmarks: {
    cdi: TwrPoint[];
    ibov: TwrPoint[];
  };
  errors: string[];
  lookback: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WINDOWS = [
  { label: "1M",  days: 30 },
  { label: "3M",  days: 90 },
  { label: "6M",  days: 180 },
  { label: "1A",  days: 365 },
  { label: "3A",  days: 1095 },
  { label: "5A",  days: 1825 },
  { label: "Tudo",days: 3650 },
] as const;

const TOOLTIP_STYLE = {
  background: "#09090b",
  border: "1px solid #27272a",
  borderRadius: 12,
  color: "#fafafa",
  fontSize: 12,
};

// ─── Chart data merge ─────────────────────────────────────────────────────────

function mergeChartData(
  portfolio: TwrPoint[],
  cdi: TwrPoint[],
  ibov: TwrPoint[]
) {
  const cdiMap = new Map(cdi.map(p => [p.date, p.twr]));
  const ibovMap = new Map(ibov.map(p => [p.date, p.twr]));

  return portfolio.map(p => ({
    date: p.date.slice(5), // MM-DD for compact display
    fullDate: p.date,
    portfolio: +(p.twr * 100).toFixed(2),
    cdi: +((cdiMap.get(p.date) ?? 0) * 100).toFixed(2),
    ibov: +((ibovMap.get(p.date) ?? 0) * 100).toFixed(2),
    nav: p.nav,
  }));
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatDuracao(anos: number): string {
  if (anos < 0.1) return "< 1 mês";
  if (anos < 1) return `${Math.round(anos * 12)} meses`;
  const y = Math.floor(anos);
  const m = Math.round((anos - y) * 12);
  return m > 0 ? `${y}a ${m}m` : `${y} ano${y > 1 ? "s" : ""}`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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

export default function PerformancePage() {
  const [window, setWindow] = useState<number>(365);
  const [data, setData] = useState<TwrResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBenchmarks, setShowBenchmarks] = useState(true);
  const [decomp, setDecomp] = useState<DecomposicaoResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API_URL}/api/twr?lookback=${window}`)
      .then(r => r.json())
      .then(body => {
        if (cancelled) return;
        if (body.error) {
          const parts = [body.error];
          if (body.tickerCount != null) parts.push(`(${body.tickerCount} tickers)`);
          if (body.histErrors?.length) parts.push(...body.histErrors.slice(0, 5));
          throw new Error(parts.join("\n"));
        }
        setData(body);
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [window]);

  useEffect(() => {
    fetch(`${API_URL}/api/twr/decomposicao`)
      .then(r => r.json())
      .then(body => setDecomp(body))
      .catch(() => {});
  }, []);

  const chartData = useMemo(() => {
    if (!data) return [];
    return mergeChartData(data.chart, data.benchmarks.cdi, data.benchmarks.ibov);
  }, [data]);

  const s = data?.summary;
  const isPositive = (s?.twrTotal ?? 0) >= 0;
  const trendColor = isPositive ? "#34d399" : "#f87171";

  return (
    <>
      <PageHeader
        title="Performance"
        description="Rentabilidade Time-Weighted Return (TWR)"
      />

      {/* Window selector */}
      <div className="flex gap-1.5 mb-6 flex-wrap">
        {WINDOWS.map(w => (
          <button
            key={w.label}
            onClick={() => setWindow(w.days)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              window === w.days
                ? "bg-zinc-700 text-white"
                : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {w.label}
          </button>
        ))}
        <button
          onClick={() => setShowBenchmarks(v => !v)}
          className={`ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            showBenchmarks
              ? "bg-indigo-900/50 text-indigo-300 border border-indigo-700/40"
              : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
          }`}
        >
          {showBenchmarks ? "Ocultar benchmarks" : "Ver benchmarks"}
        </button>
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorAlert message={error} />}

      {!loading && !error && s && (
        <>
          {/* Key metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            <MetricCard
              label="TWR Total"
              value={pct(s.twrTotal * 100)}
              sub={`Anualizado (CAGR) ${pct(s.twrAnualizado * 100)}`}
              icon={isPositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              trend={isPositive ? "up" : "down"}
              glowColor={trendColor}
            />
            {s.mwr !== undefined && (
              <MetricCard
                label="MWR (TIR)"
                value={pct(s.mwr * 100)}
                sub="Retorno ponderado por capital"
                icon={<Scale size={18} />}
                trend={s.mwr >= 0 ? "up" : "down"}
                glowColor={s.mwr >= 0 ? "#34d399" : "#f87171"}
              />
            )}
            <MetricCard
              label="NAV Atual"
              value={compactBRL(s.navFinal)}
              sub={`Investido ${compactBRL(s.totalInvestido)}`}
              icon={<DollarSign size={18} />}
              glowColor="#d4a574"
            />
            <MetricCard
              label="vs CDI"
              value={pct(s.vsCDI * 100)}
              sub={`CDI período ${pct(s.cdiTotal * 100)}`}
              icon={<Target size={18} />}
              trend={s.vsCDI >= 0 ? "up" : "down"}
              glowColor={s.vsCDI >= 0 ? "#34d399" : "#f87171"}
            />
            <MetricCard
              label="vs IBOV"
              value={pct(s.vsIBOV * 100)}
              sub={`IBOV período ${pct(s.ibovTotal * 100)}`}
              icon={<Landmark size={18} />}
              trend={s.vsIBOV >= 0 ? "up" : "down"}
              glowColor={s.vsIBOV >= 0 ? "#34d399" : "#f87171"}
            />
            {s.ganhoEconomico !== undefined && (
              <MetricCard
                label="Ganho Econômico"
                value={compactBRL(s.ganhoEconomico)}
                sub="NAV final − inicial − aportes"
                icon={<BarChart2 size={18} />}
                trend={s.ganhoEconomico >= 0 ? "up" : "down"}
                glowColor={s.ganhoEconomico >= 0 ? "#34d399" : "#f87171"}
              />
            )}
          </div>

          {/* TWR Chart */}
          <div className="glass-card p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">
                <TrendingUp size={15} />
                Rentabilidade Acumulada (%)
              </h2>
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
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#52525b", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: "#52525b", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, name: string) => [
                      `${v > 0 ? "+" : ""}${v.toFixed(2)}%`,
                      name === "portfolio" ? "Portfólio" : name === "cdi" ? "CDI" : "IBOV",
                    ]}
                    labelFormatter={label => `Data: ${label}`}
                  />
                  <Legend
                    formatter={v =>
                      v === "portfolio" ? "Portfólio" : v === "cdi" ? "CDI" : "IBOV"
                    }
                    wrapperStyle={{ fontSize: 11, color: "#71717a" }}
                  />

                  <Area
                    type="monotone"
                    dataKey="portfolio"
                    stroke={trendColor}
                    fill="url(#gradPortfolio)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  {showBenchmarks && (
                    <>
                      <Area
                        type="monotone"
                        dataKey="cdi"
                        stroke="#6366f1"
                        fill="url(#gradCDI)"
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                        dot={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="ibov"
                        stroke="#f59e0b"
                        fill="url(#gradIBOV)"
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                        dot={false}
                      />
                    </>
                  )}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-zinc-500 text-sm">Sem dados para o período selecionado.</p>
            )}
          </div>

          {/* NAV evolution + stats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* NAV in BRL */}
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

            {/* Summary stats */}
            <div className="glass-card p-5">
              <h2 className="section-title mb-4">Resumo do Período</h2>
              <div className="space-y-3">
                {[
                  { label: "TWR acumulado", value: pct(s.twrTotal * 100), color: trendColor },
                  { label: "TWR anualizado (CAGR)", value: pct(s.twrAnualizado * 100), color: trendColor },
                  ...(s.mwr !== undefined
                    ? [{ label: "MWR / TIR anualizado", value: pct(s.mwr * 100), color: s.mwr >= 0 ? "#a78bfa" : "#f87171" }]
                    : []),
                  { label: "CDI no período", value: pct(s.cdiTotal * 100), color: "#6366f1" },
                  { label: "IBOV no período", value: pct(s.ibovTotal * 100), color: "#f59e0b" },
                  { label: "Alpha vs CDI", value: pct(s.vsCDI * 100), color: s.vsCDI >= 0 ? "#34d399" : "#f87171" },
                  { label: "Duração", value: formatDuracao(s.duracaoAnos) },
                  { label: "Primeiro aporte", value: formatDate(s.primeiraData) },
                  { label: "Total investido (RV)", value: compactBRL(s.totalInvestido) },
                  { label: "Fonte dos dados", value: s.usandoLbHistoric ? `lb_historic (${s.numAnchors} pontos)` : "Proxy de fluxos", color: s.usandoLbHistoric ? "#34d399" : "#f59e0b" },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center text-sm border-b border-border/20 pb-2 last:border-0 last:pb-0">
                    <span className="text-zinc-400">{row.label}</span>
                    <span className="font-semibold" style={{ color: row.color ?? "#f1f5f9" }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Currency decomposition */}
          {decomp && decomp.buckets.length > 1 && (
            <div className="glass-card p-5 mb-6">
              <h2 className="section-title mb-4">
                <BarChart2 size={15} />
                Decomposição por Moeda
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/30">
                      {["Moeda", "Posições", "Valor BRL", "Ret. Ativo", "Ret. Câmbio", "Ret. Total"].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                          {h}
                        </th>
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

          {/* Data quality warnings */}
          {data.errors.length > 0 && (
            <div className="glass-card p-4 border-l-2 border-yellow-600/40">
              <p className="text-xs font-semibold text-yellow-500 mb-1">Avisos de dados</p>
              <ul className="space-y-0.5">
                {data.errors.map((e, i) => (
                  <li key={i} className="text-xs text-zinc-400">{e}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
}

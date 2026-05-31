"use client";

import { useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, BarChart, Bar, Cell, ReferenceLine,
} from "recharts";
import { Activity, TrendingUp, Landmark, Zap, TrendingDown, ArrowDown } from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { brl, compactBRL, pct } from "@/lib/format";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

/* ── Shared chart styles ────────────────────────────────────────────────────── */

const TOOLTIP_STYLE = {
  background: "#13141A",
  border: "1px solid #1E2028",
  borderRadius: 12,
  color: "#fafafa",
  fontSize: 12,
  padding: "8px 12px",
};

const AXIS_TICK = { fill: "#52525b", fontSize: 10 };
const GRID_STROKE = "#1E2028";

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function shortLabel(data: string) {
  const m = data.match(/^(\d{4})-(\d{2})/);
  if (!m) return data;
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[parseInt(m[2]) - 1]}/${m[1].slice(2)}`;
}

/** Fewer ticks on narrow screens so labels don't overlap */
function smartTickInterval(dataLength: number): number {
  if (dataLength <= 6) return 0;
  if (dataLength <= 12) return 1;
  if (dataLength <= 24) return 3;
  if (dataLength <= 48) return 5;
  return Math.floor(dataLength / 7);
}

/* ── Main page ──────────────────────────────────────────────────────────────── */

export default function EvolucaoPage() {
  const { data: portfolio, loading, error } = usePortfolio();

  /* ── Derived data ────────────────────────────────────────────────────────── */

  const historico = portfolio?.lbHistoric ?? [];

  const computed = useMemo(() => {
    if (historico.length === 0) return null;

    const chartData = historico.map((p) => ({
      label: shortLabel(p.data),
      data: p.data,
      patrimonio: p.patrimonio,
      rv: p.rv,
      rf: p.rf,
    }));

    const first = historico[0];
    const last = historico[historico.length - 1];
    const crescimento = first.patrimonio > 0
      ? (last.patrimonio / first.patrimonio - 1) * 100
      : 0;
    const peakValue = Math.max(...historico.map((p) => p.patrimonio));
    const totalMonths = historico.length;
    const totalYears = totalMonths / 12;
    const cagr =
      first.patrimonio > 0 && last.patrimonio > 0 && totalYears > 0
        ? (Math.pow(last.patrimonio / first.patrimonio, 1 / totalYears) - 1) * 100
        : 0;
    const multiplier = first.patrimonio > 0 ? last.patrimonio / first.patrimonio : 1;

    // Drawdown from peak
    const drawdownFromPeak = peakValue > 0
      ? ((last.patrimonio - peakValue) / peakValue) * 100
      : 0;

    // Monthly variation (month-over-month % change)
    const monthlyVariation = historico.slice(1).map((p, i) => {
      const prev = historico[i];
      const varPct = prev.patrimonio > 0
        ? ((p.patrimonio - prev.patrimonio) / prev.patrimonio) * 100
        : 0;
      return {
        label: shortLabel(p.data),
        data: p.data,
        variacao: +varPct.toFixed(2),
      };
    });

    // Annual returns
    const byYear: Record<string, number[]> = {};
    historico.forEach((p) => {
      const ano = p.data.slice(0, 4);
      if (!byYear[ano]) byYear[ano] = [];
      byYear[ano].push(p.patrimonio);
    });
    const anuais: { ano: string; retorno: number; multiplier: number }[] = [];
    Object.entries(byYear).forEach(([ano, vals]) => {
      if (vals.length < 2) return;
      const ret = (vals[vals.length - 1] / vals[0] - 1) * 100;
      const mult = vals[0] > 0 ? vals[vals.length - 1] / vals[0] : 1;
      anuais.push({ ano, retorno: +ret.toFixed(1), multiplier: +mult.toFixed(2) });
    });

    return {
      chartData,
      first,
      last,
      crescimento,
      peakValue,
      totalMonths,
      totalYears,
      cagr,
      multiplier,
      drawdownFromPeak,
      monthlyVariation,
      anuais,
    };
  }, [historico]);

  /* ── Loading / Error / Empty states ──────────────────────────────────────── */

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;

  if (!computed) {
    return (
      <>
        <PageHeader title="Evolucao Patrimonial" description="Historico de patrimonio ao longo do tempo" />
        <div className="glass-card p-8 text-center">
          <Activity size={32} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">Sem dados historicos.</p>
          <p className="text-zinc-600 text-xs mt-1">Preencha a aba <code>lb_historic</code> na planilha gdados.</p>
        </div>
      </>
    );
  }

  const {
    chartData, first, last, crescimento, peakValue,
    totalMonths, totalYears, cagr, multiplier,
    drawdownFromPeak, monthlyVariation, anuais,
  } = computed;

  const tickInterval = smartTickInterval(chartData.length);
  const monthlyTickInterval = smartTickInterval(monthlyVariation.length);

  /* ── Render ──────────────────────────────────────────────────────────────── */

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* ─ Sticky header: current patrimony ─────────────────────────────────── */}
      <div className="sticky top-0 z-30 -mx-4 px-4 py-3 bg-[#0b0c10]/92 backdrop-blur-xl border-b border-zinc-800/40 sm:static sm:bg-transparent sm:backdrop-blur-none sm:border-none sm:py-0 sm:-mx-0 sm:px-0">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wider font-medium">
              Patrimonio Atual
            </p>
            <p className="text-[1.65rem] sm:text-3xl font-bold tracking-tight text-zinc-50 truncate">
              {brl(last.patrimonio)}
            </p>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span
              className={`inline-flex items-center gap-1 text-sm sm:text-base font-semibold ${
                crescimento >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {crescimento >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {pct(crescimento)}
            </span>
            <p className="text-[10px] text-zinc-600">desde {shortLabel(first.data)}</p>
          </div>
        </div>
      </div>

      {/* Hide PageHeader on mobile (info is already in sticky bar) */}
      <div className="hidden sm:block">
        <PageHeader title="Evolucao Patrimonial" description="Historico completo do patrimonio" />
      </div>

      {/* ─ Metric cards: 2x2 mobile, row of 5 on lg ────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
        <div className="animate-fade-in">
          <MetricCard
            label="Patrimonio"
            value={compactBRL(last.patrimonio)}
            sub={`Desde ${shortLabel(first.data)}`}
            icon={<Landmark size={16} />}
            glowColor="#d4a574"
            compact
          />
        </div>
        <div className="animate-fade-in animate-delay-1">
          <MetricCard
            label="Crescimento"
            value={pct(crescimento)}
            sub={`${multiplier.toFixed(2)}x em ${totalMonths}m`}
            icon={<TrendingUp size={16} />}
            trend={crescimento >= 0 ? "up" : "down"}
            glowColor={crescimento >= 0 ? "#4ade80" : "#f87171"}
            compact
          />
        </div>
        <div className="animate-fade-in animate-delay-2">
          <MetricCard
            label="CAGR"
            value={`${cagr >= 0 ? "+" : ""}${cagr.toFixed(1)}%`}
            sub={`${totalYears.toFixed(1)} anos`}
            icon={<Zap size={16} />}
            trend={cagr >= 0 ? "up" : "down"}
            glowColor="#06b6d4"
            compact
          />
        </div>
        <div className="animate-fade-in animate-delay-3">
          <MetricCard
            label="Pico (ATH)"
            value={compactBRL(peakValue)}
            sub="All-time high"
            icon={<Activity size={16} />}
            glowColor="#6366f1"
            compact
          />
        </div>
        <div className="animate-fade-in animate-delay-4 col-span-2 lg:col-span-1">
          <MetricCard
            label="Drawdown"
            value={drawdownFromPeak === 0 ? "No topo" : `${drawdownFromPeak.toFixed(1)}%`}
            sub={
              drawdownFromPeak === 0
                ? "Patrimonio no ATH"
                : `${compactBRL(last.patrimonio - peakValue)} do pico`
            }
            icon={<ArrowDown size={16} />}
            trend={drawdownFromPeak === 0 ? "up" : "down"}
            glowColor={drawdownFromPeak === 0 ? "#4ade80" : "#f87171"}
            compact
          />
        </div>
      </div>

      {/* ─ Patrimonio total chart ────────────────────────────────────────────── */}
      <div className="glass-card p-3 sm:p-5 animate-fade-in">
        <h2 className="section-title mb-3">Patrimonio Total</h2>
        <div className="w-full" style={{ minHeight: 260 }}>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
              <defs>
                <linearGradient id="gradPatr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#d4a574" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#d4a574" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                interval={tickInterval}
                angle={-35}
                dy={8}
                height={45}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => compactBRL(v)}
                width={58}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number) => [brl(v), "Patrimonio"]}
              />
              <Area
                type="monotone"
                dataKey="patrimonio"
                stroke="#d4a574"
                fill="url(#gradPatr)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6, strokeWidth: 0, fill: "#d4a574" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─ RV vs RF chart (full width, stacks below patrimonio) ──────────────── */}
      <div className="glass-card p-3 sm:p-5 animate-fade-in">
        <h2 className="section-title mb-3">RV vs RF</h2>
        <div className="w-full" style={{ minHeight: 220 }}>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
              <defs>
                <linearGradient id="gradRV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradRF" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                interval={tickInterval}
                angle={-35}
                dy={8}
                height={45}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => compactBRL(v)}
                width={58}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number, name: string) => [
                  brl(v),
                  name === "rv" ? "Renda Variavel" : "Renda Fixa",
                ]}
              />
              <Legend
                formatter={(v) => (v === "rv" ? "RV" : "RF")}
                wrapperStyle={{ fontSize: 11, color: "#71717a", paddingTop: 4 }}
                iconSize={10}
              />
              <Area
                type="monotone"
                dataKey="rv"
                stroke="#06b6d4"
                fill="url(#gradRV)"
                strokeWidth={2}
                dot={false}
                stackId="rvrf"
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
              <Area
                type="monotone"
                dataKey="rf"
                stroke="#8b5cf6"
                fill="url(#gradRF)"
                strokeWidth={2}
                dot={false}
                stackId="rvrf"
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─ Monthly variation bar chart ───────────────────────────────────────── */}
      {monthlyVariation.length > 0 && (
        <div className="glass-card p-3 sm:p-5 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">Variacao Mensal</h2>
            {/* Show last month's variation as a quick badge */}
            {(() => {
              const lastVar = monthlyVariation[monthlyVariation.length - 1];
              return (
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    lastVar.variacao >= 0
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-red-500/15 text-red-400"
                  }`}
                >
                  {lastVar.variacao >= 0 ? "+" : ""}
                  {lastVar.variacao.toFixed(2)}%
                </span>
              );
            })()}
          </div>
          <div className="w-full" style={{ minHeight: 200 }}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyVariation} margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  interval={monthlyTickInterval}
                  angle={-35}
                  dy={8}
                  height={45}
                />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                  width={42}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number) => [
                    `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`,
                    "Variacao",
                  ]}
                  labelFormatter={(label) => label}
                />
                <ReferenceLine y={0} stroke="#3f3f46" strokeWidth={1} />
                <Bar dataKey="variacao" radius={[3, 3, 0, 0]} maxBarSize={18}>
                  {monthlyVariation.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.variacao >= 0 ? "#4ade80" : "#f87171"}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ─ Annual returns chart + table ──────────────────────────────────────── */}
      {anuais.length > 0 && (
        <div className="glass-card p-3 sm:p-5 animate-fade-in">
          <h2 className="section-title mb-3">Retorno Anual</h2>

          {/* Bar chart */}
          <div className="w-full" style={{ minHeight: 200 }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={anuais} margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis
                  dataKey="ano"
                  tick={{ ...AXIS_TICK, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                  width={42}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as {
                      ano: string;
                      retorno: number;
                      multiplier: number;
                    };
                    return (
                      <div style={TOOLTIP_STYLE} className="px-3 py-2 rounded-xl">
                        <p className="font-bold text-zinc-200">{d.ano}</p>
                        <p
                          className={`text-sm font-semibold ${
                            d.retorno >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {d.retorno >= 0 ? "+" : ""}
                          {d.retorno}%
                        </p>
                        <p className="text-xs text-zinc-500">{d.multiplier.toFixed(2)}x</p>
                      </div>
                    );
                  }}
                />
                <ReferenceLine y={0} stroke="#3f3f46" strokeWidth={1} />
                <Bar dataKey="retorno" radius={[4, 4, 0, 0]} maxBarSize={44}>
                  {anuais.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.retorno >= 0 ? "#4ade80" : "#f87171"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Scrollable summary table */}
          <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 mt-4 scrollbar-hide">
            <table className="w-full text-xs min-w-[320px]">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="py-2 text-left text-zinc-600 font-semibold uppercase tracking-wider sticky left-0 bg-[#13141a]/95 backdrop-blur-sm pr-2 z-10">
                    Ano
                  </th>
                  {anuais.map((a) => (
                    <th
                      key={a.ano}
                      className="py-2 px-2.5 text-right text-zinc-600 font-semibold uppercase tracking-wider whitespace-nowrap"
                    >
                      {a.ano}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-900">
                  <td className="py-2 text-zinc-500 sticky left-0 bg-[#13141a]/95 backdrop-blur-sm pr-2 z-10">
                    Retorno
                  </td>
                  {anuais.map((a) => (
                    <td
                      key={a.ano}
                      className={`py-2 px-2.5 text-right font-semibold font-mono tabular-nums whitespace-nowrap ${
                        a.retorno >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {a.retorno >= 0 ? "+" : ""}
                      {a.retorno}%
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 text-zinc-500 sticky left-0 bg-[#13141a]/95 backdrop-blur-sm pr-2 z-10">
                    Mult.
                  </td>
                  {anuais.map((a) => (
                    <td
                      key={a.ano}
                      className={`py-2 px-2.5 text-right font-mono tabular-nums whitespace-nowrap ${
                        a.multiplier >= 1 ? "text-zinc-300" : "text-red-400"
                      }`}
                    >
                      {a.multiplier.toFixed(2)}x
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

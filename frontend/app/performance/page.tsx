"use client";
import { useState } from "react";
import { useTWR, useNavSeries, usePatrimonyHistory } from "@/lib/hooks";
import MetricCard from "@/components/ui/MetricCard";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const PERIODS = [
  { value: "1m",  label: "1M" },
  { value: "3m",  label: "3M" },
  { value: "6m",  label: "6M" },
  { value: "ytd", label: "YTD" },
  { value: "1y",  label: "1A" },
  { value: "all", label: "Tudo" },
];

export default function PerformancePage() {
  const [period, setPeriod] = useState("all");
  const { data: twr, loading: twrLoading } = useTWR(period);
  const { data: navSeries, loading: navLoading } = useNavSeries();

  // Formata série de NAV para recharts
  const navData = (navSeries ?? []).map((p) => ({
    date: p.date,
    nav: p.nav,
  }));

  // Série de retorno acumulado do TWR
  const twrData = twr?.daily_returns?.reduce<{ date: string; acum: number }[]>((acc, p) => {
    const prev = acc[acc.length - 1]?.acum ?? 0;
    acc.push({ date: p.date, acum: parseFloat(((prev + p.return) * 100).toFixed(4)) });
    return acc;
  }, []) ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-50">Performance</h1>
        {/* Seletor de período */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                period === p.value
                  ? "bg-indigo-500 text-white font-medium"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Métricas TWR */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {twrLoading ? (
          [...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white/5 rounded-xl animate-pulse" />)
        ) : twr ? (
          <>
            {[
              { label: "TWR Período",    value: twr.twr_period   != null ? `${(+(twr.twr_period as number) * 100).toFixed(2)}%`  : "—" },
              { label: "TWR Acumulado",  value: twr.twr_total    != null ? `${(+(twr.twr_total as number) * 100).toFixed(2)}%`   : "—" },
              { label: "Drawdown Máx.",  value: twr.max_drawdown != null ? `${(+(twr.max_drawdown as number) * 100).toFixed(2)}%` : "—" },
              { label: "Volatilidade",   value: twr.volatility   != null ? `${(+(twr.volatility as number) * 100).toFixed(2)}%`  : "—" },
            ].map(({ label, value }) => (
              <MetricCard key={label} label={label} value={value} />
            ))}
          </>
        ) : null}
      </div>

      {/* Gráfico NAV */}
      <div className="bg-[#0f1729]/60 border border-white/[0.07] rounded-xl p-4">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">NAV Histórico (BRL)</h2>
        {navLoading ? (
          <div className="h-64 bg-white/5 rounded-lg animate-pulse" />
        ) : navData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={navData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false}
                tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "#0d1526", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                labelStyle={{ color: "#94a3b8" }}
                formatter={(v: number) => [`R$ ${v.toLocaleString("pt-BR")}`, "NAV"]}
              />
              <Line type="monotone" dataKey="nav" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-500 text-sm text-center py-16">Sem dados de NAV</p>
        )}
      </div>

      {/* Gráfico TWR acumulado */}
      {twrData.length > 0 && (
        <div className="bg-[#0f1729]/60 border border-white/[0.07] rounded-xl p-4">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Retorno Acumulado TWR (%)</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={twrData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false}
                tickFormatter={(v) => `${v.toFixed(1)}%`} />
              <Tooltip
                contentStyle={{ background: "#0d1526", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                labelStyle={{ color: "#94a3b8" }}
                formatter={(v: number) => [`${v.toFixed(2)}%`, "TWR"]}
              />
              <Line type="monotone" dataKey="acum" stroke="#34d399" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

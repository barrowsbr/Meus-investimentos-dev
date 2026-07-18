"use client";

// Extraído de app/performance/page.tsx — métodos preditivos (Monte Carlo,
// ARIMA, GARCH, VAR): catálogo de métodos e os gráficos de resultado.

import React from "react";
import {
  Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LineChart, Line, ComposedChart,
} from "recharts";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";

export const PRED_API = process.env.NEXT_PUBLIC_API_URL || "";

export interface PredMethod {
  id: string;
  title: string;
  tag: string;
  color: string;
  detail: string;
}

export const PRED_METHODS: PredMethod[] = [
  { id: "monte-carlo", title: "Monte Carlo (GBM)", tag: "Estocástico", color: "#34d399", detail: "10.000 simulações · Drift + Difusão" },
  { id: "arima", title: "ARIMA(p,d,q)", tag: "Série Temporal", color: "#60a5fa", detail: "Auto-ARIMA · ADF · IC 80/95%" },
  { id: "garch", title: "GARCH(1,1)", tag: "Volatilidade", color: "#f59e0b", detail: "Variância condicional · VaR · Forecast" },
  { id: "var", title: "VAR(p) Multivariado", tag: "Multivariado", color: "#ec4899", detail: "IRF · Decomposição de Variância" },
];

export type PredResult = Record<string, unknown> | null;

function MonteCarloChart({ data }: { data: Record<string, unknown> }) {
  const perc = data.percentiles as { p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[] };
  const samplePaths = data.sample_paths as number[][] | undefined;
  if (!perc) return null;
  const chartData = perc.p50.map((_, i) => {
    const point: Record<string, number> = { t: i, p5: perc.p5[i], p50: perc.p50[i], p95: perc.p95[i] };
    if (samplePaths) samplePaths.forEach((path, j) => { point[`s${j}`] = path[i]; });
    return point;
  });
  const params = data.params as { mu_annual: number; sigma_annual: number } | undefined;
  const pathCount = samplePaths?.length ?? 0;
  return (
    <div>
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" />
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#52525b" }} label={{ value: "Dias", position: "bottom", fontSize: 10, fill: "#52525b" }} />
          <YAxis tick={{ fontSize: 10, fill: "#52525b" }} />
          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
          {Array.from({ length: pathCount }).map((_, j) => (
            <Line key={`s${j}`} type="monotone" dataKey={`s${j}`} stroke="#34d39918" strokeWidth={0.5} dot={false} isAnimationActive={false} legendType="none" />
          ))}
          <Line type="monotone" dataKey="p95" stroke="#34d39960" strokeWidth={1} dot={false} strokeDasharray="4 2" name="P95" />
          <Line type="monotone" dataKey="p5" stroke="#34d39960" strokeWidth={1} dot={false} strokeDasharray="4 2" name="P5" />
          <Line type="monotone" dataKey="p50" stroke="#34d399" strokeWidth={2.5} dot={false} name="Mediana" />
        </LineChart>
      </ResponsiveContainer>
      {params && (
        <div className="flex flex-wrap gap-4 mt-3 text-[10px] text-zinc-500 font-mono">
          <span>μ anual: {(params.mu_annual * 100).toFixed(2)}%</span>
          <span>σ anual: {(params.sigma_annual * 100).toFixed(2)}%</span>
          <span>{String(data.n_simulations)} simulações · {pathCount} caminhos</span>
          <span>Obs: {String(data.observations_used)}</span>
        </div>
      )}
    </div>
  );
}

function ArimaChart({ data }: { data: Record<string, unknown> }) {
  const historical = data.historical as number[] | undefined;
  const forecast = data.forecast as number[] | undefined;
  const ci95l = data.ci_95_lower as number[] | undefined;
  const ci95u = data.ci_95_upper as number[] | undefined;
  const ci80l = data.ci_80_lower as number[] | undefined;
  const ci80u = data.ci_80_upper as number[] | undefined;
  if (!historical || !forecast) return null;
  const chartData = [
    ...historical.map((v, i) => ({ t: i, historical: v })),
    ...forecast.map((v, i) => ({ t: historical.length + i, forecast: v, ci80l: ci80l?.[i], ci80u: ci80u?.[i], ci95l: ci95l?.[i], ci95u: ci95u?.[i] })),
  ];
  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#71717a" }} />
          <YAxis tick={{ fontSize: 10, fill: "#71717a" }} />
          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
          <Area type="monotone" dataKey="ci95u" stroke="none" fill="#60a5fa10" name="IC 95%" />
          <Area type="monotone" dataKey="ci95l" stroke="none" fill="transparent" name="" />
          <Area type="monotone" dataKey="ci80u" stroke="none" fill="#60a5fa18" name="IC 80%" />
          <Area type="monotone" dataKey="ci80l" stroke="none" fill="transparent" name="" />
          <Line type="monotone" dataKey="historical" stroke="#a1a1aa" strokeWidth={1.5} dot={false} name="Histórico" />
          <Line type="monotone" dataKey="forecast" stroke="#60a5fa" strokeWidth={2} dot={false} name="Previsão" />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-3 text-[10px] text-zinc-500 font-mono">
        <span>Ordem: ARIMA{JSON.stringify(data.order)}</span>
        <span>AIC: {Number(data.aic).toFixed(1)}</span>
        <span>ADF p-value: {Number(data.adf_pvalue).toFixed(4)}</span>
        <span>{data.stationary ? "Estacionária" : "Não-estacionária (d=1)"}</span>
      </div>
    </div>
  );
}

function GarchChart({ data }: { data: Record<string, unknown> }) {
  const condVol = data.conditional_vol as number[] | undefined;
  const realVol = data.realized_vol as number[] | undefined;
  const volForecast = data.vol_forecast as number[] | undefined;
  if (!condVol) return null;
  const maxHist = Math.max(condVol.length, realVol?.length ?? 0);
  const chartData = [
    ...Array.from({ length: maxHist }).map((_, i) => ({
      t: i,
      conditional: condVol[i] != null ? +(condVol[i] * 100).toFixed(2) : undefined,
      realized: realVol && realVol[i] != null ? +(realVol[i] * 100).toFixed(2) : undefined,
    })),
    ...(volForecast ?? []).map((v, i) => ({ t: maxHist + i, forecast: +(v * 100).toFixed(2) })),
  ];
  const params = data.params as { alpha: number; beta: number; persistence: number } | undefined;
  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#71717a" }} />
          <YAxis tick={{ fontSize: 10, fill: "#71717a" }} unit="%" />
          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => `${v.toFixed(2)}%`} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Line type="monotone" dataKey="conditional" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="Vol Condicional" />
          <Line type="monotone" dataKey="realized" stroke="#71717a" strokeWidth={1} dot={false} name="Vol Realizada (21d)" />
          <Line type="monotone" dataKey="forecast" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="6 3" name="Forecast" />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-4 mt-3 text-[10px] text-zinc-500 font-mono">
        {params && <>
          <span>α: {params.alpha.toFixed(4)}</span>
          <span>β: {params.beta.toFixed(4)}</span>
          <span>Persistência: {params.persistence.toFixed(4)}</span>
        </>}
        <span>VaR 95% anual: {((data.var_95_annual as number) * 100).toFixed(2)}%</span>
        <span>Vol atual: {((data.current_vol_annual as number) * 100).toFixed(1)}% a.a.</span>
      </div>
    </div>
  );
}

function VarChart({ data }: { data: Record<string, unknown> }) {
  const variables = data.variables as string[] | undefined;
  const forecast = data.forecast as Record<string, number[]> | undefined;
  const irf = data.irf as Record<string, Record<string, number[]>> | undefined;
  if (!variables || !forecast) return null;
  const colors = ["#ec4899", "#60a5fa", "#34d399", "#f59e0b"];
  const forecastData = Array.from({ length: (forecast[variables[0]] ?? []).length }).map((_, i) => {
    const point: Record<string, number | string> = { t: i };
    variables.forEach(v => { point[v] = forecast[v]?.[i] ?? 0; });
    return point;
  });
  const irfShock = variables[0];
  const irfData = irf && irf[irfShock]
    ? Array.from({ length: (irf[irfShock][variables[0]] ?? []).length }).map((_, i) => {
        const point: Record<string, number | string> = { t: i };
        variables.forEach(v => { point[v] = (irf[irfShock]?.[v]?.[i] ?? 0) * 10000; });
        return point;
      })
    : [];
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">Previsão multivariada ({data.lag_order as number} lags)</p>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={forecastData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#71717a" }} />
            <YAxis tick={{ fontSize: 10, fill: "#71717a" }} />
            <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {variables.map((v, i) => (
              <Line key={v} type="monotone" dataKey={v} stroke={colors[i % colors.length]} strokeWidth={1.5} dot={false} name={v} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {irfData.length > 0 && (
        <div>
          <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">Impulso-Resposta (choque em {irfShock}) · bps</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={irfData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#71717a" }} label={{ value: "Períodos", position: "bottom", fontSize: 10, fill: "#71717a" }} />
              <YAxis tick={{ fontSize: 10, fill: "#71717a" }} unit=" bps" />
              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {variables.map((v, i) => (
                <Line key={v} type="monotone" dataKey={v} stroke={colors[i % colors.length]} strokeWidth={1.5} dot={false} name={v} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="flex gap-4 text-[10px] text-zinc-500 font-mono">
        <span>Variáveis: {variables.join(", ")}</span>
        <span>Lags: {String(data.lag_order)}</span>
        <span>Obs: {String(data.observations_used)}</span>
      </div>
    </div>
  );
}

export function PredResultChart({ methodId, data }: { methodId: string; data: Record<string, unknown> }) {
  const interpretation = data.interpretation as string | undefined;
  let chart: React.ReactNode = null;
  switch (methodId) {
    case "monte-carlo": chart = <MonteCarloChart data={data} />; break;
    case "arima": chart = <ArimaChart data={data} />; break;
    case "garch": chart = <GarchChart data={data} />; break;
    case "var": chart = <VarChart data={data} />; break;
  }
  return (
    <>
      {chart}
      {interpretation && (
        <div className="mt-4 rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Leitura do Modelo</p>
          <p className="text-[12px] text-zinc-400 leading-relaxed">{interpretation}</p>
        </div>
      )}
    </>
  );
}

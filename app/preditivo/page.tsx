"use client";

import { useState, useCallback } from "react";
import {
  BrainCircuit, Shuffle, LineChart, Waves, Network,
  FlaskConical, Sigma, Clock, Database, Play, Loader2,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart as RLineChart, Line, Area, AreaChart,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, ComposedChart,
} from "recharts";
import PageHeader from "@/components/PageHeader";

const API = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ────────────────────────────────────────────────────────────────────

interface MethodDef {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  title: string;
  tag: string;
  color: string;
  description: string;
  detail: string;
}

type ModelResult = Record<string, unknown> | null;

// ── Methods catalog ──────────────────────────────────────────────────────────

const METHODS: MethodDef[] = [
  {
    id: "monte-carlo",
    icon: Shuffle,
    title: "Simulação de Monte Carlo",
    tag: "Estocástico",
    color: "#34d399",
    description:
      "Geração de N caminhos estocásticos via GBM (Geometric Brownian Motion) calibrado com μ e σ históricos do portfólio. Permite estimar percentis da distribuição terminal e probabilidade de ruína.",
    detail: "10.000 simulações · GBM · Drift + Difusão",
  },
  {
    id: "arima",
    icon: LineChart,
    title: "ARIMA(p,d,q)",
    tag: "Série Temporal",
    color: "#60a5fa",
    description:
      "Modelo autoregressivo integrado de média móvel. Seleção automática de ordem via AIC/BIC, teste de estacionariedade (ADF), e geração de intervalos de confiança expandidos no horizonte de previsão (fan chart).",
    detail: "Auto-ARIMA · ADF test · IC 80%/95%",
  },
  {
    id: "prophet",
    icon: BrainCircuit,
    title: "Decomposição Aditiva",
    tag: "Tendência + Sazonalidade",
    color: "#8b5cf6",
    description:
      "Decomposição aditiva da série em tendência (piecewise linear/logistic), sazonalidade (Fourier) e efeitos de regressores externos. Robusto a dados faltantes e mudanças de regime.",
    detail: "Holt-Winters · Tendência + Sazonalidade + Resíduos",
  },
  {
    id: "garch",
    icon: Waves,
    title: "GARCH(1,1)",
    tag: "Volatilidade",
    color: "#f59e0b",
    description:
      "Modelagem da variância condicional via GARCH(1,1). Captura clusters de volatilidade, estima VaR paramétrico e projeta a volatilidade futura anualizada. Essencial para sizing de posição e gestão de risco.",
    detail: "Variância condicional · VaR · Vol Forecast",
  },
  {
    id: "var",
    icon: Network,
    title: "VAR(p) — Vetores Autorregressivos",
    tag: "Multivariado",
    color: "#ec4899",
    description:
      "Sistema de equações simultâneas para modelar interdependências entre ativos, taxas de juros, câmbio e índices. Permite análise de impulso-resposta e decomposição de variância para entender transmissão de choques.",
    detail: "IRF · Decomposição de Variância · Granger",
  },
];

// ── Chart renderers ──────────────────────────────────────────────────────────

function MonteCarloChart({ data }: { data: Record<string, unknown> }) {
  const perc = data.percentiles as { p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[] };
  const samplePaths = data.sample_paths as number[][] | undefined;
  if (!perc) return null;

  const chartData = perc.p50.map((_, i) => {
    const point: Record<string, number> = {
      t: i,
      p5: perc.p5[i],
      p50: perc.p50[i],
      p95: perc.p95[i],
    };
    if (samplePaths) {
      samplePaths.forEach((path, j) => { point[`s${j}`] = path[i]; });
    }
    return point;
  });

  const params = data.params as { mu_annual: number; sigma_annual: number } | undefined;
  const pathCount = samplePaths?.length ?? 0;

  return (
    <div>
      <ResponsiveContainer width="100%" height={380}>
        <RLineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" />
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#52525b" }} label={{ value: "Dias", position: "bottom", fontSize: 10, fill: "#52525b" }} />
          <YAxis tick={{ fontSize: 10, fill: "#52525b" }} />
          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }} />
          {Array.from({ length: pathCount }).map((_, j) => (
            <Line key={`s${j}`} type="monotone" dataKey={`s${j}`} stroke="#34d39918" strokeWidth={0.5} dot={false} isAnimationActive={false} legendType="none" />
          ))}
          <Line type="monotone" dataKey="p95" stroke="#34d39960" strokeWidth={1} dot={false} strokeDasharray="4 2" name="P95" />
          <Line type="monotone" dataKey="p5" stroke="#34d39960" strokeWidth={1} dot={false} strokeDasharray="4 2" name="P5" />
          <Line type="monotone" dataKey="p50" stroke="#34d399" strokeWidth={2.5} dot={false} name="Mediana" />
        </RLineChart>
      </ResponsiveContainer>
      {params && (
        <div className="flex flex-wrap gap-4 mt-3 text-[10px] text-zinc-500 font-mono">
          <span>μ anual: {(params.mu_annual * 100).toFixed(2)}%</span>
          <span>σ anual: {(params.sigma_annual * 100).toFixed(2)}%</span>
          <span>{String(data.n_simulations)} simulações · {pathCount} caminhos visíveis</span>
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
    ...forecast.map((v, i) => ({
      t: historical.length + i,
      forecast: v,
      ci80l: ci80l?.[i],
      ci80u: ci80u?.[i],
      ci95l: ci95l?.[i],
      ci95u: ci95u?.[i],
    })),
  ];

  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#71717a" }} />
          <YAxis tick={{ fontSize: 10, fill: "#71717a" }} />
          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }} />
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

function ProphetChart({ data }: { data: Record<string, unknown> }) {
  const historical = data.historical as number[] | undefined;
  const forecast = data.forecast as number[] | undefined;
  const upper95 = data.upper_95 as number[] | undefined;
  const lower95 = data.lower_95 as number[] | undefined;
  if (!historical || !forecast) return null;

  const chartData = [
    ...historical.map((v, i) => ({ t: i, historical: v })),
    ...forecast.map((v, i) => ({
      t: historical.length + i,
      forecast: v,
      upper: upper95?.[i],
      lower: lower95?.[i],
    })),
  ];

  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#71717a" }} />
          <YAxis tick={{ fontSize: 10, fill: "#71717a" }} />
          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }} />
          <Area type="monotone" dataKey="upper" stroke="none" fill="#8b5cf615" name="IC 95% sup" />
          <Area type="monotone" dataKey="lower" stroke="none" fill="transparent" name="" />
          <Line type="monotone" dataKey="historical" stroke="#a1a1aa" strokeWidth={1.5} dot={false} name="Histórico" />
          <Line type="monotone" dataKey="forecast" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Previsão" />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-3 text-[10px] text-zinc-500 font-mono">
        <span>Horizonte: {String(data.horizon)} dias</span>
        <span>Obs: {String(data.observations_used)}</span>
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
    ...(volForecast ?? []).map((v, i) => ({
      t: maxHist + i,
      forecast: +(v * 100).toFixed(2),
    })),
  ];

  const params = data.params as { alpha: number; beta: number; persistence: number } | undefined;

  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <RLineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#71717a" }} />
          <YAxis tick={{ fontSize: 10, fill: "#71717a" }} unit="%" />
          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }} formatter={(v: number) => `${v.toFixed(2)}%`} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Line type="monotone" dataKey="conditional" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="Vol Condicional" />
          <Line type="monotone" dataKey="realized" stroke="#71717a" strokeWidth={1} dot={false} name="Vol Realizada (21d)" />
          <Line type="monotone" dataKey="forecast" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="6 3" name="Forecast" />
        </RLineChart>
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
  const historical = data.historical as Record<string, number[]> | undefined;
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
          <RLineChart data={forecastData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#71717a" }} />
            <YAxis tick={{ fontSize: 10, fill: "#71717a" }} />
            <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {variables.map((v, i) => (
              <Line key={v} type="monotone" dataKey={v} stroke={colors[i % colors.length]} strokeWidth={1.5} dot={false} name={v} />
            ))}
          </RLineChart>
        </ResponsiveContainer>
      </div>
      {irfData.length > 0 && (
        <div>
          <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">
            Impulso-Resposta (choque em {irfShock}) · bps
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <RLineChart data={irfData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#71717a" }} label={{ value: "Períodos", position: "bottom", fontSize: 10, fill: "#71717a" }} />
              <YAxis tick={{ fontSize: 10, fill: "#71717a" }} unit=" bps" />
              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {variables.map((v, i) => (
                <Line key={v} type="monotone" dataKey={v} stroke={colors[i % colors.length]} strokeWidth={1.5} dot={false} name={v} />
              ))}
            </RLineChart>
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

// ── Chart dispatcher ─────────────────────────────────────────────────────────

function Interpretation({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
        Leitura do Modelo
      </p>
      <p className="text-[12px] text-zinc-400 leading-relaxed">{text}</p>
    </div>
  );
}

function ResultChart({ methodId, data }: { methodId: string; data: Record<string, unknown> }) {
  const interpretation = data.interpretation as string | undefined;
  let chart: React.ReactNode = null;
  switch (methodId) {
    case "monte-carlo": chart = <MonteCarloChart data={data} />; break;
    case "arima": chart = <ArimaChart data={data} />; break;
    case "prophet": chart = <ProphetChart data={data} />; break;
    case "garch": chart = <GarchChart data={data} />; break;
    case "var": chart = <VarChart data={data} />; break;
  }
  return (
    <>
      {chart}
      {interpretation && <Interpretation text={interpretation} />}
    </>
  );
}

// ── Method Card ──────────────────────────────────────────────────────────────

function MethodCard({ method, idx }: { method: MethodDef; idx: number }) {
  const [result, setResult] = useState<ModelResult>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API}/api/preditivo/${method.id}`);
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setResult(json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro de conexão");
    } finally {
      setLoading(false);
    }
  }, [method.id]);

  const Icon = method.icon;

  return (
    <div className="glass-card overflow-hidden" style={{ borderColor: `${method.color}0a` }}>
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-zinc-800/50">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${method.color}10` }}
        >
          <Icon size={18} style={{ color: method.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-bold text-zinc-200 truncate">
              {method.title}
            </h2>
            <span
              className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
              style={{ color: method.color, background: `${method.color}12` }}
            >
              {method.tag}
            </span>
          </div>
          <p className="text-[10px] text-zinc-600 font-mono mt-0.5">
            {method.detail}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-700 font-mono shrink-0">
            #{String(idx + 1).padStart(2, "0")}
          </span>
          <button
            onClick={run}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50"
            style={{
              background: `${method.color}15`,
              color: method.color,
              border: `1px solid ${method.color}30`,
            }}
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            {loading ? "Calculando..." : "Executar"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-5">
        <p className="text-[13px] text-zinc-400 leading-relaxed mb-5">
          {method.description}
        </p>

        {error && (
          <div className="rounded-lg p-3 mb-4 text-[11px] text-red-400 bg-red-500/8 border border-red-500/15">
            {error}
          </div>
        )}

        {result && <ResultChart methodId={method.id} data={result} />}

        {!result && !loading && !error && (
          <div
            className="w-full aspect-[16/9] rounded-lg border flex items-center justify-center"
            style={{ borderColor: `${method.color}15`, background: `${method.color}03` }}
          >
            <span className="text-[11px] text-zinc-600 font-mono">
              Clique em Executar para rodar o modelo
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PreditivoPage() {
  return (
    <>
      <PageHeader
        title="Estatísticas Preditivas"
        description="Econometria aplicada ao portfólio"
      />

      {/* ── Status bar ── */}
      <div className="glass-card p-4 mb-6 flex flex-wrap items-center gap-4 text-[11px]">
        <div className="flex items-center gap-2">
          <Database size={13} className="text-zinc-500" />
          <span className="text-zinc-500">Fonte:</span>
          <span className="text-zinc-300 font-semibold">db_cotacoes · retornos diários</span>
        </div>
        <div className="hidden sm:block h-3 w-px bg-zinc-800" />
        <div className="flex items-center gap-2">
          <Clock size={13} className="text-zinc-500" />
          <span className="text-zinc-500">Horizonte padrão:</span>
          <span className="text-zinc-300 font-semibold">252 dias úteis</span>
        </div>
        <div className="hidden sm:block h-3 w-px bg-zinc-800" />
        <div className="flex items-center gap-2">
          <Sigma size={13} className="text-zinc-500" />
          <span className="text-zinc-500">Confiança:</span>
          <span className="text-zinc-300 font-semibold">95%</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/8 border border-emerald-500/15">
          <FlaskConical size={12} className="text-emerald-400" />
          <span className="text-emerald-400 font-semibold uppercase tracking-wider text-[9px]">Operacional</span>
        </div>
      </div>

      {/* ── Methods ── */}
      <div className="space-y-4">
        {METHODS.map((method, idx) => (
          <MethodCard key={method.id} method={method} idx={idx} />
        ))}
      </div>
    </>
  );
}

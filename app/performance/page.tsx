"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, BarChart, Bar, Cell, ReferenceLine,
  LineChart, Line, ComposedChart,
} from "recharts";
import {
  TrendingUp, BarChart2, Activity,
  Calendar, AlertTriangle, DollarSign, RefreshCw,
  Play, Loader2,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";
import MetricCard from "@/components/MetricCard";
import { brl, compactBRL, pct } from "@/lib/format";
import { bumpDataVersion, withDataVersion } from "@/lib/data-version";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Summary {
  twrTotal: number;
  twrAnualizado: number;
  mwr: number;
  navFinal: number;
  navInicial: number;
  totalInvestido: number;
  custoPosicoesAtuais?: number;
  patrimonio?: { total: number; rv: number; rf: number; caixa: number; divida?: number; net?: number; alavancagemPct?: number };
  filtros?: { classe: string; setor: string; ticker: string; corretora: string; rvSetores: string[]; tickers: string[]; tickerSectors: Record<string, string>; corretoras: string[]; temCripto: boolean; temRF: boolean };
  duracaoAnos: number;
  primeiraData: string;
  ultimaData: string;
  vsCDI: number;
  vsIBOV: number;
  vsSP500BRL?: number;
  vsSP500?: number;
  cdiTotal: number;
  ibovTotal: number;
  sp500BrlTotal?: number;
  sp500Total?: number;
  maxDrawdown: number;
  volatility: number;
  sharpe: number;
  sortino: number;
  var95: number;
  var99: number;
  riskFreeRate?: number;
  ganhoEconomico: number;
  ganhoDecomposicao?: {
    navFinal: number; navInicial: number; flowsFromFirst: number;
    firstMeaningfulFlow: number; incomeFromFirst: number;
    forceZeroDays: number;
  };
  resultadoTotal?: number;
  resultadoTotalPct?: number;
  custoFIFOSnapshot?: number;
  peakDate?: string;
  troughDate?: string;
  peakTwr?: number;
  troughTwr?: number;
}

interface ChartPoint { date: string; nav: number; flow?: number; ret: number; twr: number; mwr_twr?: number | null; cdi_twr?: number | null; ibov_twr?: number | null; sp500_twr?: number | null; fx_twr?: number | null; ativo_twr?: number | null }
interface DrawdownPoint { date: string; drawdown: number; nav: number }
interface RollingPoint { date: string; "1M": number; "3M": number; "6M": number; "1A": number }
interface MonthlyReturn { month: string; return_pct: number }
interface MonthlyMTM { month: string; gain: number; gainPct: number; navEnd: number }
interface FlowEntry { date: string; flow: number; nav: number; nav_before: number; daily_return: number; cumulative_twr: number }
interface AttributionEntry { setor: string; macro: string; contrib_pct: number; nav_medio: number }

interface UsdView {
  summary: Summary;
  chart: ChartPoint[];
  monthlyReturns: MonthlyReturn[];
  monthlyMTM?: MonthlyMTM[];
  fxDecomposition?: { r_total: number; r_ativo: number; r_fx: number; r_combinado: number };
}

interface PerformanceResponse {
  summary: Summary;
  chart: ChartPoint[];
  benchmarks: { cdi: ChartPoint[]; ibov: ChartPoint[]; sp500brl?: ChartPoint[] };
  drawdownData: DrawdownPoint[];
  rolling: RollingPoint[];
  monthlyReturns: MonthlyReturn[];
  monthlyMTM?: MonthlyMTM[];
  flowLedger: FlowEntry[];
  attribution: AttributionEntry[];
  fxDecomposition: { r_total: number; r_ativo: number; r_fx: number; r_combinado: number };
  usdView: UsdView | null;
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

function computeYTDDays(): number {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  return Math.floor((now.getTime() - jan1.getTime()) / (1000 * 60 * 60 * 24));
}

const WINDOWS = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "YTD", days: computeYTDDays() },
  { label: "1A", days: 365 },
  { label: "3A", days: 1095 },
  { label: "5A", days: 1825 },
  { label: "Início", days: 0 },
];

const TOOLTIP_STYLE = {
  background: "#09090b",
  border: "1px solid #27272a",
  borderRadius: 12,
  color: "#fafafa",
  fontSize: 12,
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

// ── Predictive methods ───────────────────────────────────────────────────────

const PRED_API = process.env.NEXT_PUBLIC_API_URL || "";

interface PredMethod {
  id: string;
  title: string;
  tag: string;
  color: string;
  detail: string;
}

const PRED_METHODS: PredMethod[] = [
  { id: "monte-carlo", title: "Monte Carlo (GBM)", tag: "Estocástico", color: "#34d399", detail: "10.000 simulações · Drift + Difusão" },
  { id: "arima", title: "ARIMA(p,d,q)", tag: "Série Temporal", color: "#60a5fa", detail: "Auto-ARIMA · ADF · IC 80/95%" },
  { id: "garch", title: "GARCH(1,1)", tag: "Volatilidade", color: "#f59e0b", detail: "Variância condicional · VaR · Forecast" },
  { id: "var", title: "VAR(p) Multivariado", tag: "Multivariado", color: "#ec4899", detail: "IRF · Decomposição de Variância" },
];

type PredResult = Record<string, unknown> | null;

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

function PredResultChart({ methodId, data }: { methodId: string; data: Record<string, unknown> }) {
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

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "overview" | "drawdown" | "monthly" | "previsoes";
const TAB_LABELS: Record<Tab, string> = {
  overview: "Retorno",
  drawdown: "Drawdown",
  monthly: "Mensal",
  previsoes: "Previsões",
};

type CurrencyView = "BRL" | "USD";

export default function PerformancePage() {
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lookback, setLookback] = useState(0);
  const [classe, setClasse] = useState<"tudo" | "rv" | "rf">("tudo");
  const [setores, setSetores] = useState<string[]>([]);
  const setorQuery = setores.join(",");
  const [tickerFilter, setTickerFilter] = useState("");
  const [corretoraFilter, setCorretoraFilter] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [chartMode, setChartMode] = useState<"benchmarks" | "fx">("benchmarks");
  const [returnMetric, setReturnMetric] = useState<"twr" | "mwr">("twr");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [decomp, setDecomp] = useState<DecomposicaoResponse | null>(null);
  const [ganhoCanonical, setGanhoCanonical] = useState<number | null>(null);
  const [currencyView, setCurrencyView] = useState<CurrencyView>("BRL");
  const [monthlyView, setMonthlyView] = useState<"twr" | "mtm">("twr");
  const [predMethod, setPredMethod] = useState(PRED_METHODS[0].id);
  const [predResult, setPredResult] = useState<PredResult>(null);
  const [predLoading, setPredLoading] = useState(false);
  const [predError, setPredError] = useState<string | null>(null);

  const isUsd = currencyView === "USD";
  const currSymbol = isUsd ? "US$" : "R$";
  const fmtCurr = isUsd ? (v: number) => `US$ ${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : brl;
  const compactCurr = isUsd ? (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1e6) return `US$ ${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `US$ ${(v / 1e3).toFixed(1)}k`;
    return `US$ ${v.toFixed(0)}`;
  } : compactBRL;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const useCustom = customMode && customFrom && customTo;
    const rangeQuery = useCustom
      ? `from=${customFrom}&to=${customTo}`
      : `lookback=${lookback}`;
    const tickerQ = tickerFilter ? `&ticker=${encodeURIComponent(tickerFilter)}` : "";
    const corretoraQ = corretoraFilter ? `&corretora=${encodeURIComponent(corretoraFilter)}` : "";
    fetch(withDataVersion(`${API_URL}/api/performance/advanced?${rangeQuery}&classe=${classe}&setor=${encodeURIComponent(setorQuery)}${tickerQ}${corretoraQ}`))
      .then(r => r.json())
      .then(body => {
        if (cancelled) return;
        if (body.error) throw new Error(body.error);
        setData(body);
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lookback, classe, setorQuery, tickerFilter, corretoraFilter, customMode, customFrom, customTo]);

  useEffect(() => {
    fetch(withDataVersion(`${API_URL}/api/twr/decomposicao`))
      .then(r => r.json())
      .then(body => setDecomp(body))
      .catch(() => {});
    fetch(withDataVersion(`${API_URL}/api/composicao/resumo`))
      .then(r => r.json())
      .then(body => {
        if (body.resumo && body.rentabilidade) {
          const rent = body.rentabilidade as Array<{ lucro_nao_realizado_brl: number; lucro_realizado_brl: number }>;
          const gains = rent.reduce((s, r) => s + r.lucro_nao_realizado_brl + r.lucro_realizado_brl, 0);
          const proventos = body.resumo.total_proventos ?? 0;
          setGanhoCanonical(gains + proventos);
        }
      })
      .catch(() => {});
  }, []);

  // Active summary/chart based on currency view
  const activeSummary = useMemo(() => {
    if (!data) return null;
    return isUsd && data.usdView ? data.usdView.summary : data.summary;
  }, [data, isUsd]);

  const activeChart = useMemo(() => {
    if (!data) return [];
    return isUsd && data.usdView ? data.usdView.chart : data.chart;
  }, [data, isUsd]);

  const activeMonthly = useMemo(() => {
    if (!data) return [];
    return isUsd && data.usdView ? data.usdView.monthlyReturns : data.monthlyReturns;
  }, [data, isUsd]);

  const chartData = useMemo(() => {
    return activeChart.map(p => ({
      date: formatDateShort(p.date),
      fullDate: p.date,
      portfolio: +(p.twr * 100).toFixed(2),
      mwr: p.mwr_twr != null ? +(p.mwr_twr * 100).toFixed(2) : null,
      cdi: p.cdi_twr != null ? +(p.cdi_twr * 100).toFixed(2) : null,
      ibov: p.ibov_twr != null ? +(p.ibov_twr * 100).toFixed(2) : null,
      sp500: p.sp500_twr != null ? +(p.sp500_twr * 100).toFixed(2) : null,
      nav: p.nav,
      fx: p.fx_twr != null ? +(p.fx_twr * 100).toFixed(2) : null,
      ativo: p.ativo_twr != null ? +(p.ativo_twr * 100).toFixed(2) : null,
    }));
  }, [activeChart]);

  const drawdownData = useMemo(() =>
    (data?.drawdownData ?? []).map(d => ({ date: formatDateShort(d.date), drawdown: d.drawdown })),
  [data]);

  const runPrediction = async () => {
    setPredLoading(true);
    setPredError(null);
    setPredResult(null);
    try {
      const res = await fetch(`${PRED_API}/api/preditivo/${predMethod}`);
      const json = await res.json();
      if (json.error) setPredError(json.error);
      else setPredResult(json);
    } catch (e) {
      setPredError(e instanceof Error ? e.message : "Erro de conexão");
    } finally {
      setPredLoading(false);
    }
  };

  const monthlyGrid = useMemo(() => {
    if (activeMonthly.length === 0) return { years: [] as number[], byYearMonth: {} as Record<number, Record<number, number>> };
    const byYearMonth: Record<number, Record<number, number>> = {};
    for (const m of activeMonthly) {
      const [y, mo] = m.month.split("-").map(Number);
      if (!byYearMonth[y]) byYearMonth[y] = {};
      byYearMonth[y][mo] = m.return_pct;
    }
    const years = Object.keys(byYearMonth).map(Number).sort((a, b) => a - b);
    return { years, byYearMonth };
  }, [activeMonthly]);

  const activeMTM = useMemo(() => {
    if (!data) return [];
    return isUsd && data.usdView?.monthlyMTM ? data.usdView.monthlyMTM : (data.monthlyMTM ?? []);
  }, [data, isUsd]);

  const mtmGrid = useMemo(() => {
    if (activeMTM.length === 0) return { years: [] as number[], byYearMonth: {} as Record<number, Record<number, { gain: number; gainPct: number; navEnd: number }>> };
    const byYearMonth: Record<number, Record<number, { gain: number; gainPct: number; navEnd: number }>> = {};
    for (const m of activeMTM) {
      const [y, mo] = m.month.split("-").map(Number);
      if (!byYearMonth[y]) byYearMonth[y] = {};
      byYearMonth[y][mo] = { gain: m.gain, gainPct: m.gainPct, navEnd: m.navEnd };
    }
    const years = Object.keys(byYearMonth).map(Number).sort((a, b) => a - b);
    return { years, byYearMonth };
  }, [activeMTM]);

  const handleRefresh = () => {
    setLoading(true);
    setData(null);
    bumpDataVersion();
    fetch(withDataVersion(`${API_URL}/api/performance/advanced?lookback=${lookback}`))
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  if (loading && !data) return (<><PageHeader title="Performance" description="Carregando dados..." /><LoadingSpinner /></>);
  if (error) return (<><PageHeader title="Performance" description="" /><ErrorAlert message={error} /></>);
  if (!data || !activeSummary) return null;

  const s = activeSummary;
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

      {/* ── Currency View Toggle ── */}
      <div className="flex items-center gap-1 mb-6 bg-zinc-900/60 rounded-xl p-1 w-fit border border-zinc-800/50">
        {(["BRL", "USD"] as CurrencyView[]).map(cv => (
          <button key={cv} onClick={() => setCurrencyView(cv)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              currencyView === cv
                ? cv === "BRL"
                  ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                  : "bg-blue-500/20 border border-blue-500/40 text-blue-300"
                : "text-zinc-500 hover:text-zinc-300 border border-transparent"
            }`}>
            {cv === "BRL" ? "R$ Real" : "US$ Dólar"}
          </button>
        ))}
        <span className="text-[10px] text-zinc-600 px-2">
          {isUsd ? "Patrimônio em dólar" : "Patrimônio em real"}
        </span>
      </div>

      {/* ── Filtro por classe / setor / ativo / corretora ── */}
      {(() => {
        const f = data?.summary.filtros;
        if (!f) return null;
        const classes: { id: typeof classe; label: string; show: boolean }[] = [
          { id: "tudo", label: "Tudo", show: true },
          { id: "rv", label: "Renda Variável", show: f.rvSetores.length > 0 },
          { id: "rf", label: "Renda Fixa", show: f.temRF },
        ];
        const ts = f.tickerSectors;
        const filteredTickers = (f.tickers ?? []).filter(t => {
          if (!ts) return true;
          const setor = ts[t];
          if (!setor) return true;
          const isRF = ["Renda Fixa", "Renda Fixa USD", "Caixa/Liquidez"].includes(setor);
          const isRFPrec = setor === "Renda Fixa USD";
          if (classe === "rf") return isRFPrec;
          if (classe === "rv") {
            if (isRF) return false;
            if (setores.length > 0) return setores.includes(setor);
            return true;
          }
          if (setores.length > 0) return setores.includes(setor);
          return true;
        });
        return (
          <div className="mb-6 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {classes.filter(c => c.show).map(c => (
                <button key={c.id} onClick={() => { setClasse(c.id); setSetores([]); setTickerFilter(""); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    classe === c.id ? "bg-zinc-100 text-zinc-900" : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 border border-zinc-800/50"
                  }`}>
                  {c.label}
                </button>
              ))}
              <span className="text-zinc-700 mx-1">|</span>
              <select
                value={tickerFilter}
                onChange={e => setTickerFilter(e.target.value)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold outline-none transition-all ${
                  tickerFilter
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                    : "bg-zinc-900/60 text-zinc-400 border border-zinc-800/50"
                }`}
              >
                <option value="">Todos os ativos</option>
                {filteredTickers.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {(f.corretoras ?? []).length > 1 && (
                <>
                  <span className="text-zinc-700 mx-1">|</span>
                  <select
                    value={corretoraFilter}
                    onChange={e => setCorretoraFilter(e.target.value)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold outline-none transition-all ${
                      corretoraFilter
                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                        : "bg-zinc-900/60 text-zinc-400 border border-zinc-800/50"
                    }`}
                  >
                    <option value="">Todas corretoras</option>
                    {f.corretoras.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </>
              )}
            </div>
            {classe === "rv" && !tickerFilter && f.rvSetores.length > 1 && (
              <div className="flex flex-wrap items-center gap-1">
                {["", ...f.rvSetores].map(st => {
                  const active = st === "" ? setores.length === 0 : setores.includes(st);
                  return (
                    <button key={st || "todos"}
                      onClick={() => {
                        if (st === "") { setSetores([]); return; }
                        setSetores(prev => prev.includes(st) ? prev.filter(x => x !== st) : [...prev, st]);
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] transition-all ${
                        active ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-zinc-800/40 text-zinc-500 hover:text-zinc-300"
                      }`}>
                      {st || "Todos"}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Window selector (period filters) ── */}
      <div className="flex items-center gap-1.5 mb-6 flex-wrap">
        {WINDOWS.map(w => (
          <button key={w.label} onClick={() => { setCustomMode(false); setLookback(w.days); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              !customMode && lookback === w.days
                ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
            }`}>
            {w.label}
          </button>
        ))}
        <button onClick={() => setCustomMode(v => !v)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border inline-flex items-center gap-1.5 ${
            customMode
              ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
              : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
          }`}>
          <Calendar size={12} /> Personalizado
        </button>
      </div>

      {/* ── Intervalo personalizado ── */}
      {customMode && (
        <div className="flex flex-wrap items-end gap-3 mb-6 p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/50 animate-fade-in">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">De</span>
            <input type="date" value={customFrom} max={customTo || undefined}
              onChange={e => setCustomFrom(e.target.value)}
              className="bg-zinc-800/60 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500/50" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Até</span>
            <input type="date" value={customTo} min={customFrom || undefined}
              onChange={e => setCustomTo(e.target.value)}
              className="bg-zinc-800/60 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500/50" />
          </label>
          {data?.summary.filtros && (
            <span className="text-[10px] text-zinc-600 pb-2">
              {customFrom && customTo
                ? `Intervalo aplicado · ${formatDate(s.primeiraData)} → ${formatDate(s.ultimaData)}`
                : "Escolha as datas de início e fim"}
            </span>
          )}
        </div>
      )}

      {/* ── Hero Performance Command Center ── */}
      {(() => {
        const mwrTotal = s.duracaoAnos > 0 ? (Math.pow(1 + s.mwr, s.duracaoAnos) - 1) * 100 : mwrPct;
        const navAtual = s.patrimonio?.total ?? s.navFinal;
        const isUnfiltered = lookback === 0 && classe === "tudo" && setores.length === 0 && !tickerFilter && !corretoraFilter && !customMode;
        const isAllTime = lookback === 0 && !customMode;
        const useSnapshot = !!tickerFilter && isAllTime && s.resultadoTotal != null;
        const ge = isUnfiltered && !isUsd && ganhoCanonical != null
          ? ganhoCanonical
          : useSnapshot ? s.resultadoTotal! : s.ganhoEconomico;
        const custoFIFO = (tickerFilter && isAllTime && s.custoFIFOSnapshot) || s.custoPosicoesAtuais || s.totalInvestido;
        const pctBase = isAllTime ? custoFIFO : s.navInicial;
        const retornoTotalPct = useSnapshot && s.resultadoTotalPct != null
          ? s.resultadoTotalPct
          : pctBase > 0 ? (ge / pctBase) * 100 : 0;

        const rfPct = ((s.riskFreeRate ?? 0.10) * 100).toFixed(0);
        const benchmarks = [
          { label: isUsd ? "S&P 500" : "CDI", value: isUsd ? (s.sp500Total ?? 0) : s.cdiTotal, alpha: isUsd ? (s.vsSP500 ?? s.vsCDI) : s.vsCDI, color: isUsd ? "#ec4899" : "#6366f1" },
          { label: "IBOV", value: s.ibovTotal, alpha: s.vsIBOV, color: "#f59e0b" },
          ...(!isUsd && s.sp500BrlTotal != null ? [{ label: "S&P 500", value: s.sp500BrlTotal, alpha: s.vsSP500BRL ?? 0, color: "#ec4899" }] : []),
        ];

        const riskItems = [
          { label: "Volatilidade", val: `${(s.volatility * 100).toFixed(1)}%`, title: "Desvio padrão anualizado dos retornos diários", badge: <RatingBadge value={-(s.volatility * 100)} thresholds={[-30, -20, -10]} labels={["Alta", "Moderada", "Baixa", "Muito Baixa"]} /> },
          { label: "Max Drawdown", val: `${s.maxDrawdown.toFixed(1)}%`, title: "Maior queda do pico ao vale no período", badge: <RatingBadge value={s.maxDrawdown} thresholds={[-50, -30, -15]} labels={["Severo", "Alto", "Moderado", "Baixo"]} /> },
          { label: "Sharpe", val: s.sharpe.toFixed(2), title: `Retorno excedente sobre rf (${rfPct}% a.a.) ÷ volatilidade`, badge: <RatingBadge value={s.sharpe} thresholds={[0, 0.5, 1]} labels={["Fraco", "Razoável", "Bom", "Excelente"]} />, sub: `rf ${rfPct}%` },
          { label: "Sortino", val: s.sortino.toFixed(2), title: `Similar ao Sharpe, mas só penaliza volatilidade negativa (rf ${rfPct}% a.a.)`, badge: <RatingBadge value={s.sortino} thresholds={[0, 0.7, 1.5]} labels={["Fraco", "Razoável", "Bom", "Excelente"]} />, sub: `rf ${rfPct}%` },
          { label: "VaR 95%", val: `${s.var95.toFixed(2)}%`, title: "Value at Risk: em 95% dos dias, a perda diária não ultrapassou este valor" },
          { label: "VaR 99%", val: `${s.var99.toFixed(2)}%`, title: "Value at Risk: em 99% dos dias, a perda diária não ultrapassou este valor" },
        ];

        return (
          <div className="relative mb-4 animate-fade-in">
            <div className="perf-hero-card" style={{
              boxShadow: `0 0 120px -40px ${trendColor}10, 0 30px 60px -15px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)`
            }}>
              {/* ─ Animated shimmer accent ─ */}
              <div className="h-[2px] perf-accent" style={{
                background: `linear-gradient(90deg, transparent 0%, ${trendColor}30 20%, ${trendColor}aa 50%, ${trendColor}30 80%, transparent 100%)`,
              }} />

              {/* ─ Ambient radial glow ─ */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-44 pointer-events-none perf-glow" style={{
                background: `radial-gradient(ellipse at 50% -30%, ${trendColor}0c, transparent 70%)`
              }} />

              <div className="relative px-4 pt-5 pb-4 sm:px-6">
                {/* ── Primary Metrics ── */}
                <div className="flex items-center justify-center gap-0 mb-4">
                  {/* MWR — left wing */}
                  <div className="flex-1 text-right pr-4 sm:pr-6" title="Money-Weighted Return (XIRR): retorno ponderado pelo dinheiro investido. MWR > TWR = aportes bem-timed; MWR < TWR = o contrário">
                    <p className="text-[8px] sm:text-[9px] uppercase tracking-[0.2em] font-bold text-purple-400/60 mb-1">MWR</p>
                    <p className={`text-lg sm:text-2xl font-extrabold tracking-tight leading-none ${mwrTotal >= 0 ? "text-purple-300" : "text-red-400"}`}>
                      {mwrTotal >= 0 ? "+" : ""}{mwrTotal.toFixed(2)}%
                    </p>
                    <p className="text-[9px] text-zinc-600 mt-0.5">TIR {pct(mwrPct)}</p>
                  </div>

                  {/* TWR — hero centerpiece */}
                  <div className="flex-shrink-0 text-center px-4 sm:px-8 relative" title="Time-Weighted Return: encadeia os retornos diários neutralizando o efeito do tamanho e timing dos aportes — é a métrica comparável a índices">
                    <div className="absolute inset-0 rounded-2xl" style={{
                      background: `radial-gradient(circle at 50% 60%, ${trendColor}06, transparent 70%)`
                    }} />
                    <p className="relative text-[8px] sm:text-[9px] uppercase tracking-[0.3em] font-bold mb-1.5" style={{ color: `${trendColor}80` }}>TWR</p>
                    <p className="relative text-4xl sm:text-5xl font-black tracking-tighter leading-none" style={{
                      background: `linear-gradient(180deg, #ffffff 20%, ${trendColor}cc 100%)`,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      filter: `drop-shadow(0 4px 24px ${trendColor}20)`,
                    }}>
                      {twrPct >= 0 ? "+" : ""}{twrPct.toFixed(2)}%
                    </p>
                    <p className="relative text-[10px] text-zinc-500 mt-1.5 font-medium tracking-wide">CAGR {pct(s.twrAnualizado * 100)}</p>
                  </div>

                  {/* MTM — right wing */}
                  <div className="flex-1 pl-4 sm:pl-6" title="MTM (mark-to-market): variação de preço + proventos">
                    <p className="text-[8px] sm:text-[9px] uppercase tracking-[0.2em] font-bold text-amber-400/60 mb-1">MTM</p>
                    <p className={`text-lg sm:text-2xl font-extrabold tracking-tight leading-none ${ge >= 0 ? "text-amber-300" : "text-red-400"}`}>
                      {ge >= 0 ? "+" : ""}{compactCurr(ge)}
                    </p>
                    <p className="text-[9px] text-zinc-600 mt-0.5">
                      {retornoTotalPct >= 0 ? "+" : ""}{retornoTotalPct.toFixed(1)}% / {compactCurr(pctBase)}
                    </p>
                  </div>
                </div>

                {/* ── Gradient separator ── */}
                <div className="h-px bg-gradient-to-r from-transparent via-zinc-600/25 to-transparent" />

                {/* ── Context strip ── */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3">
                  <span className="text-[10px] text-zinc-500 font-medium">
                    {formatDuracao(s.duracaoAnos)} · {formatDate(s.primeiraData)} → {formatDate(s.ultimaData)}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {benchmarks.map(b => (
                      <span key={b.label} className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] backdrop-blur-sm" style={{
                        background: `linear-gradient(135deg, ${b.color}0a, ${b.color}04)`,
                        border: `1px solid ${b.color}18`,
                        boxShadow: `0 0 12px ${b.color}06`,
                      }}>
                        <span className="text-zinc-400 font-medium">{b.label}</span>
                        <span className="font-bold" style={{ color: b.color }}>{pct(b.value * 100)}</span>
                        <span className={`font-bold ${b.alpha >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          α{b.alpha >= 0 ? "+" : ""}{(b.alpha * 100).toFixed(1)}%
                        </span>
                      </span>
                    ))}
                  </div>
                  <div className="ml-auto flex items-center gap-2" title={`Patrimônio${(s.patrimonio?.divida ?? 0) > 0 ? " líquido (bruto " + compactCurr(navAtual) + " − margin " + compactCurr(s.patrimonio!.divida!) + ")" : ""}`}>
                    <span className="text-[9px] text-zinc-500 uppercase tracking-wider font-bold">
                      {(s.patrimonio?.divida ?? 0) > 0 ? "Net" : "Patrimônio"}
                    </span>
                    <span className="text-sm font-bold text-zinc-100">{compactCurr(s.patrimonio?.net ?? navAtual)}</span>
                    {(s.patrimonio?.divida ?? 0) > 0 && (
                      <span className="text-[9px] text-amber-400/70 font-medium">({(s.patrimonio!.alavancagemPct ?? 0).toFixed(1)}%)</span>
                    )}
                  </div>
                </div>

                {/* ── Gradient separator ── */}
                <div className="h-px bg-gradient-to-r from-transparent via-zinc-600/25 to-transparent" />

                {/* ── Integrated Risk Dashboard ── */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 pt-3">
                  {riskItems.map((r, i) => (
                    <div key={i} className="perf-risk-cell px-2 py-2 text-center" title={r.title}>
                      <p className="text-[7px] sm:text-[8px] text-zinc-500 uppercase tracking-wider font-bold mb-0.5 truncate">
                        {r.label}{r.sub ? <span className="text-zinc-600 normal-case font-normal"> ({r.sub})</span> : null}
                      </p>
                      <p className="text-xs sm:text-sm font-bold text-zinc-200 leading-tight">{r.val}</p>
                      {r.badge && <div className="mt-1">{r.badge}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Sub-tabs + chart toggles ── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex">
          {(Object.keys(TAB_LABELS) as Tab[]).map(tab => {
            const on = activeTab === tab;
            return (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="font-mono uppercase whitespace-nowrap"
                style={{
                  padding: "8px 14px",
                  borderBottom: `2px solid ${on ? "var(--accent)" : "var(--line)"}`,
                  color: on ? "var(--text)" : "var(--muted)",
                  fontSize: 11, fontWeight: 600, letterSpacing: ".05em",
                }}>
                {TAB_LABELS[tab]}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-zinc-800 overflow-hidden"
            title="TWR: retorno dos ativos (comparável a índices). MWR: retorno do SEU dinheiro, ponderado pelos aportes (estilo IBKR)">
            <button onClick={() => setReturnMetric("twr")}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                returnMetric === "twr"
                  ? "bg-emerald-900/50 text-emerald-300"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
              }`}>
              TWR
            </button>
            <button onClick={() => { setReturnMetric("mwr"); setChartMode("benchmarks"); }}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors border-l border-zinc-800 ${
                returnMetric === "mwr"
                  ? "bg-purple-900/50 text-purple-300"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
              }`}>
              MWR
            </button>
          </div>
          <div className="flex items-center rounded-lg border border-zinc-800 overflow-hidden">
            <button onClick={() => setChartMode("benchmarks")}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                chartMode === "benchmarks"
                  ? "bg-indigo-900/50 text-indigo-300"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
              }`}>
              Benchmarks
            </button>
            <button onClick={() => setChartMode("fx")}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors border-l border-zinc-800 ${
                chartMode === "fx"
                  ? "bg-amber-900/50 text-amber-300"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
              }`}>
              <DollarSign size={11} className="inline -mt-0.5 mr-0.5" />Câmbio
            </button>
          </div>
          <button onClick={handleRefresh} className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
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
                    <linearGradient id="gradSP500" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ec4899" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradAtivo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradFx" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradMwr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                  <ReferenceLine y={0} stroke="#27272a" strokeWidth={1} />
                  <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
                    formatter={(v: number, name: string) => [
                      `${v > 0 ? "+" : ""}${v.toFixed(2)}%`,
                      name === "portfolio" ? "Portfólio (TWR)" : name === "mwr" ? "Portfólio (MWR)" : name === "ativo" ? "Retorno Ativo" : name === "fx" ? "Efeito Câmbio" : name === "cdi" ? "CDI" : name === "ibov" ? "IBOV" : "S&P 500",
                    ]}
                    labelFormatter={label => `Data: ${label}`} />
                  <Legend formatter={v => v === "portfolio" ? "Portfólio (TWR)" : v === "mwr" ? "Portfólio (MWR)" : v === "ativo" ? "Retorno Ativo" : v === "fx" ? "Efeito Câmbio" : v === "cdi" ? "CDI" : v === "ibov" ? "IBOV" : "S&P 500"}
                    wrapperStyle={{ fontSize: 11, color: "#71717a" }} />
                  {/* Linha principal = métrica selecionada no toggle TWR | MWR */}
                  {returnMetric === "twr" ? (
                    <Area type="monotone" dataKey="portfolio" stroke={trendColor} fill="url(#gradPortfolio)"
                      strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  ) : (
                    <Area type="monotone" dataKey="mwr" stroke="#a78bfa" fill="url(#gradMwr)"
                      strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
                  )}
                  {chartMode === "benchmarks" && (
                    <>
                      <Area type="monotone" dataKey="cdi" stroke="#6366f1" fill="url(#gradCDI)"
                        strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                      <Area type="monotone" dataKey="ibov" stroke="#f59e0b" fill="url(#gradIBOV)"
                        strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                      <Area type="monotone" dataKey="sp500" stroke="#ec4899" fill="url(#gradSP500)"
                        strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                    </>
                  )}
                  {chartMode === "fx" && (
                    <>
                      {returnMetric === "twr" ? (
                        <Area type="monotone" dataKey="mwr" stroke="#a78bfa" fill="url(#gradMwr)"
                          strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />
                      ) : (
                        <Area type="monotone" dataKey="portfolio" stroke={trendColor} fill="url(#gradPortfolio)"
                          strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                      )}
                      <Area type="monotone" dataKey="ativo" stroke="#34d399" fill="url(#gradAtivo)"
                        strokeWidth={1.8} strokeDasharray="5 3" dot={false} />
                      <Area type="monotone" dataKey="fx" stroke="#f59e0b" fill="url(#gradFx)"
                        strokeWidth={1.8} strokeDasharray="5 3" dot={false} />
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
              <h2 className="section-title mb-4">Evolução do Patrimônio ({currSymbol})</h2>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="gradNav" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#E8A33D" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#E8A33D" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                    <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => compactCurr(v)} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => [fmtCurr(v), `NAV ${currSymbol}`]} />
                    <Area type="monotone" dataKey="nav" stroke="#E8A33D" fill="url(#gradNav)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-zinc-500 text-sm">Sem dados.</p>
              )}
            </div>

            <div className="glass-card p-5">
              <h2 className="section-title mb-4">Resumo do Período ({currSymbol})</h2>
              <div className="space-y-2">
                {[
                  { label: "TWR acumulado", value: pct(twrPct), color: trendColor },
                  { label: "TWR anualizado (CAGR)", value: pct(s.twrAnualizado * 100), color: trendColor },
                  { label: "MWR / TIR anualizado", value: pct(mwrPct), color: mwrPct >= 0 ? "#a78bfa" : "#f87171" },
                  { label: "CDI no período", value: pct(s.cdiTotal * 100), color: "#6366f1" },
                  { label: "IBOV no período", value: pct(s.ibovTotal * 100), color: "#f59e0b" },
                  ...(isUsd
                    ? [{ label: "S&P 500 no período", value: pct((s.sp500Total ?? 0) * 100), color: "#ec4899" }]
                    : [{ label: "S&P 500 (BRL)", value: pct((s.sp500BrlTotal ?? 0) * 100), color: "#ec4899" }]
                  ),
                  { label: isUsd ? "Alpha vs S&P 500" : "Alpha vs CDI", value: pct((isUsd ? (s.vsSP500 ?? s.vsCDI) : s.vsCDI) * 100), color: (isUsd ? (s.vsSP500 ?? s.vsCDI) : s.vsCDI) >= 0 ? "#34d399" : "#f87171" },
                  { label: "Patrimônio inicial", value: compactCurr(s.navInicial) },
                  { label: (lookback === 0 && !customMode) ? "Investido" : "NAV inicial", value: compactCurr((lookback === 0 && !customMode) ? ((tickerFilter && s.custoFIFOSnapshot) || s.custoPosicoesAtuais || s.totalInvestido) : s.navInicial) },
                  { label: "Patrimônio final", value: compactCurr(s.navFinal) },
                  ...(() => {
                    const isUnfiltered = lookback === 0 && classe === "tudo" && setores.length === 0 && !tickerFilter && !corretoraFilter && !customMode;
                    const isAllT = lookback === 0 && !customMode;
                    const useSnap = !!tickerFilter && isAllT && s.resultadoTotal != null;
                    const ge = isUnfiltered && !isUsd && ganhoCanonical != null
                      ? ganhoCanonical
                      : useSnap ? s.resultadoTotal! : s.ganhoEconomico;
                    return [{ label: "Ganho econômico", value: `${ge >= 0 ? "+" : ""}${compactCurr(ge)}`, color: ge >= 0 ? "#34d399" : "#f87171" }];
                  })(),
                  { label: "Duração", value: formatDuracao(s.duracaoAnos) },
                  { label: "Primeiro aporte", value: formatDate(s.primeiraData) },
                  ...(s.ganhoDecomposicao ? [
                    { label: "── Decomposição ──", value: "", color: "#71717a" },
                    { label: "NAV final (engine)", value: compactCurr(s.ganhoDecomposicao.navFinal) },
                    { label: "NAV inicial (engine)", value: compactCurr(s.ganhoDecomposicao.navInicial) },
                    { label: "Fluxos no período", value: compactCurr(s.ganhoDecomposicao.flowsFromFirst) },
                    { label: "Fluxo 1o dia (excluído)", value: compactCurr(s.ganhoDecomposicao.firstMeaningfulFlow) },
                    { label: "Proventos no período", value: compactCurr(s.ganhoDecomposicao.incomeFromFirst) },
                    { label: "Dias base ≤ 0", value: String(s.ganhoDecomposicao.forceZeroDays) },
                  ] : []),
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
            <h2 className="section-title mb-4"><Activity size={15} />TWR vs MWR — Comparação ({currSymbol})</h2>
            {(() => {
              const fxD = isUsd && data.usdView?.fxDecomposition
                ? data.usdView.fxDecomposition
                : data.fxDecomposition;
              return (
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
                      <DollarSign size={13} className="inline" /> Decomposição: Ativo vs Cambial {isUsd ? "(visão USD)" : ""}
                    </h3>
                    <p className="text-[10px] text-zinc-600 mb-3">
                      R<sub>total</sub> = R<sub>ativo</sub> + R<sub>fx</sub> + (R<sub>ativo</sub> × R<sub>fx</sub>) — o último termo é o <span className="text-purple-400">efeito cruzado</span>
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: `R. Total (${currSymbol})`, value: fxD.r_total * 100, color: "#60a5fa" },
                        { label: "Ativo (puro)", value: fxD.r_ativo * 100, color: "#34d399" },
                        { label: isUsd ? "Câmbio (BRL→USD)" : "Câmbio (USD→BRL)", value: fxD.r_fx * 100, color: "#f59e0b" },
                        { label: "Efeito cruzado", value: fxD.r_combinado * 100, color: "#8b5cf6" },
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
              );
            })()}
          </div>

          {/* Currency decomposition (BRL only) */}
          {!isUsd && decomp && decomp.buckets.length > 1 && (
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
                <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => [`${v.toFixed(2)}%`, "Drawdown"]} />
                <ReferenceLine y={0} stroke="#3f3f46" strokeWidth={1} />
                <Area type="monotone" dataKey="drawdown" stroke="#f87171" fill="url(#ddGrad)" strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Máximo Drawdown", value: `${s.maxDrawdown.toFixed(2)}%`, color: "text-red-400", desc: "Maior recuo observado" },
              { label: "Data do Pico", value: formatDateShort(s.peakDate ?? ""), color: "text-emerald-400", desc: `TWR máximo: +${((s.peakTwr ?? 0) * 100).toFixed(2)}%` },
              { label: "Data do Vale", value: formatDateShort(s.troughDate ?? ""), color: "text-amber-400", desc: `TWR mínimo: ${((s.troughTwr ?? 0) * 100).toFixed(2)}%` },
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
           TAB: PREVISÕES
         ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "previsoes" && (
        <div className="glass-card p-5">
          <h2 className="section-title mb-4"><Activity size={15} />Previsões — Modelos Econométricos</h2>

          {/* Method selector + run */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {PRED_METHODS.map(m => (
              <button key={m.id} onClick={() => { setPredMethod(m.id); setPredResult(null); setPredError(null); }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all border ${
                  predMethod === m.id
                    ? "text-zinc-100 border-opacity-50"
                    : "text-zinc-500 hover:text-zinc-300 border-zinc-800/50 bg-zinc-900/40"
                }`}
                style={predMethod === m.id ? { background: `${m.color}15`, borderColor: `${m.color}40`, color: m.color } : {}}>
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={predMethod === m.id ? { background: `${m.color}20` } : { background: "rgba(63,63,70,0.3)" }}>
                  {m.tag}
                </span>
                {m.title}
              </button>
            ))}
            <button onClick={runPrediction} disabled={predLoading}
              className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 disabled:opacity-50">
              {predLoading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              {predLoading ? "Calculando..." : "Executar"}
            </button>
          </div>

          {/* Method detail */}
          {(() => {
            const m = PRED_METHODS.find(x => x.id === predMethod)!;
            return (
              <p className="text-[10px] text-zinc-600 font-mono mb-4">
                {m.detail} · Fonte: db_cotacoes · Horizonte padrão: 252 dias úteis · Confiança: 95%
              </p>
            );
          })()}

          {/* Error */}
          {predError && (
            <div className="rounded-lg p-3 mb-4 text-[11px] text-red-400 bg-red-500/8 border border-red-500/15">
              {predError}
            </div>
          )}

          {/* Result */}
          {predResult && <PredResultChart methodId={predMethod} data={predResult} />}

          {/* Empty state */}
          {!predResult && !predLoading && !predError && (
            <div className="w-full aspect-[16/7] rounded-lg border border-zinc-800/30 bg-zinc-900/20 flex items-center justify-center">
              <span className="text-[11px] text-zinc-600 font-mono">Selecione um método e clique em Executar</span>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
           TAB: MONTHLY HEATMAP
         ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "monthly" && (
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title"><Calendar size={15} />Retornos Mensais — Heatmap</h2>
            <div className="flex rounded-lg overflow-hidden border border-zinc-800/60">
              <button onClick={() => setMonthlyView("twr")}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  monthlyView === "twr"
                    ? "bg-indigo-900/50 text-indigo-300"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}>
                TWR (%)
              </button>
              <button onClick={() => setMonthlyView("mtm")}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors border-l border-zinc-800 ${
                  monthlyView === "mtm"
                    ? "bg-amber-900/50 text-amber-300"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}>
                <DollarSign size={11} className="inline -mt-0.5 mr-0.5" />MTM ({currSymbol})
              </button>
            </div>
          </div>
          <p className="text-xs text-zinc-600 mb-5">
            {monthlyView === "twr"
              ? "Cada célula representa o retorno TWR do portfólio naquele mês. Verde = positivo, vermelho = negativo."
              : "Cada célula representa o ganho absoluto (MTM) do mês, usando preços e câmbio do último dia útil do período — cenário fechado."}
          </p>

          {/* ── TWR (%) heatmap ── */}
          {monthlyView === "twr" && (
            <>
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
            </>
          )}

          {/* ── MTM (R$) heatmap — cenário fechado ── */}
          {monthlyView === "mtm" && (
            <>
              {mtmGrid.years.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr>
                        <th className="text-left pr-3 pb-3 text-zinc-600 font-semibold uppercase tracking-wider text-[9px] w-12">Ano</th>
                        {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map(m => (
                          <th key={m} className="text-center pb-3 text-zinc-600 font-semibold uppercase tracking-wider text-[9px] min-w-[60px]">{m}</th>
                        ))}
                        <th className="text-center pb-3 text-zinc-600 font-semibold uppercase tracking-wider text-[9px] pl-3 w-20">Ano</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mtmGrid.years.map(year => {
                        const mths = mtmGrid.byYearMonth[year] ?? {};
                        const yearGain = Object.values(mths).reduce((s, v) => s + v.gain, 0);
                        const lastMonth = Math.max(...Object.keys(mths).map(Number));
                        const yearEndNav = mths[lastMonth]?.navEnd ?? 0;
                        return (
                          <tr key={year} className="group">
                            <td className="pr-3 py-1 text-zinc-400 font-bold text-[11px]">{year}</td>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(mo => {
                              const cell = mths[mo];
                              if (!cell) {
                                return <td key={mo} className="py-1 px-0.5"><div className="rounded-md h-11 bg-zinc-900/40" /></td>;
                              }
                              const v = cell.gain;
                              const pct = cell.gainPct;
                              const twrPctMonth = monthlyGrid.byYearMonth[year]?.[mo];
                              const isPos = v >= 0;
                              const absK = Math.abs(v) / 1000;
                              const intensity = Math.min(absK / 5, 1);
                              const bg = isPos
                                ? `rgba(52,211,153,${0.12 + intensity * 0.55})`
                                : `rgba(248,113,113,${0.12 + intensity * 0.55})`;
                              const textColor = isPos ? "#34d399" : "#f87171";
                              const label = absK >= 10
                                ? `${v >= 0 ? "+" : "-"}${(Math.abs(v) / 1000).toFixed(0)}k`
                                : `${v >= 0 ? "+" : "-"}${(Math.abs(v) / 1000).toFixed(1)}k`;
                              const moLabel = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][mo-1];
                              const tip = `${moLabel}/${year}: ${v >= 0 ? "+" : ""}${fmtCurr(v)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)${twrPctMonth != null ? ` · TWR ${twrPctMonth >= 0 ? "+" : ""}${twrPctMonth.toFixed(2)}%` : ""} · Patrimônio: ${fmtCurr(cell.navEnd)}`;
                              return (
                                <td key={mo} className="py-1 px-0.5">
                                  <div
                                    className="rounded-md h-11 flex flex-col items-center justify-center cursor-default transition-transform hover:scale-105"
                                    style={{ background: bg, color: textColor }}
                                    title={tip}
                                  >
                                    <span className="font-semibold text-[11px] leading-none">{label}</span>
                                    <span className="text-[9px] leading-none mt-0.5 opacity-75">{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>
                                  </div>
                                </td>
                              );
                            })}
                            <td className="py-1 pl-3">
                              {(() => {
                                const yearPct = Object.values(mths).reduce((acc, c) => acc * (1 + c.gainPct / 100), 1) * 100 - 100;
                                return (
                                  <div
                                    className="rounded-md h-11 flex flex-col items-center justify-center font-bold text-[10px] border"
                                    style={{
                                      borderColor: yearGain >= 0 ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)",
                                      color: yearGain >= 0 ? "#34d399" : "#f87171",
                                      background: yearGain >= 0 ? "rgba(52,211,153,0.07)" : "rgba(248,113,113,0.07)",
                                    }}
                                    title={`Patrimônio fim/${year}: ${fmtCurr(yearEndNav)}`}
                                  >
                                    <span>{yearGain >= 0 ? "+" : ""}{compactCurr(yearGain)}</span>
                                    <span className="text-[9px] opacity-75 mt-0.5">{yearPct >= 0 ? "+" : ""}{yearPct.toFixed(1)}%</span>
                                  </div>
                                );
                              })()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-zinc-600 text-sm text-center py-8">Sem dados de MTM disponíveis</p>
              )}

              {mtmGrid.years.length > 0 && (() => {
                const all = Object.values(mtmGrid.byYearMonth).flatMap(m => Object.values(m).map(c => c.gain));
                const pos = all.filter(v => v >= 0).length;
                const neg = all.filter(v => v < 0).length;
                const total = all.reduce((s, v) => s + v, 0);
                const avg = all.length > 0 ? total / all.length : 0;
                return (
                  <p className="text-xs text-zinc-600 mt-4">
                    Média mensal: <span className="text-zinc-400 font-semibold">{avg >= 0 ? "+" : ""}{compactCurr(avg)}</span>
                    {" · "}Total: <span className="text-zinc-400 font-semibold">{total >= 0 ? "+" : ""}{compactCurr(total)}</span>
                    {" · "}Positivos: <span className="text-emerald-400 font-semibold">{pos}</span>
                    {" · "}Negativos: <span className="text-red-400 font-semibold">{neg}</span>
                    {" · "}Hit rate: <span className="text-zinc-400 font-semibold">{all.length > 0 ? ((pos / all.length) * 100).toFixed(0) : 0}%</span>
                  </p>
                );
              })()}
            </>
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

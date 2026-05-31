"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Bitcoin,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Coins,
  Activity,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Target,
  RefreshCw,
} from "lucide-react";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Customized,
  Cell,
} from "recharts";
import { usePortfolio } from "@/lib/hooks";
import { brl, compactBRL, pct } from "@/lib/format";
import MetricCard from "@/components/MetricCard";
import DataTable from "@/components/DataTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";
import type { Position } from "@/lib/portfolio";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type RangeOption = "1mo" | "3mo" | "6mo" | "1y" | "max";

const RANGE_OPTIONS: { label: string; value: RangeOption }[] = [
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
  { label: "1A", value: "1y" },
  { label: "ALL", value: "max" },
];

// ─── Crypto ticker colors ─────────────────────────────────────────────────────

const TICKER_COLORS: Record<string, { bg: string; text: string; glow: string }> = {
  BTC: { bg: "bg-amber-500", text: "text-amber-500", glow: "#f59e0b" },
  ETH: { bg: "bg-indigo-500", text: "text-indigo-400", glow: "#818cf8" },
  SOL: { bg: "bg-purple-500", text: "text-purple-400", glow: "#a855f7" },
  ADA: { bg: "bg-blue-500", text: "text-blue-400", glow: "#3b82f6" },
  DOT: { bg: "bg-pink-500", text: "text-pink-400", glow: "#ec4899" },
  AVAX: { bg: "bg-red-500", text: "text-red-400", glow: "#ef4444" },
  MATIC: { bg: "bg-violet-500", text: "text-violet-400", glow: "#8b5cf6" },
  LINK: { bg: "bg-blue-500", text: "text-blue-400", glow: "#2563eb" },
  XRP: { bg: "bg-gray-400", text: "text-gray-300", glow: "#9ca3af" },
  DOGE: { bg: "bg-yellow-500", text: "text-yellow-400", glow: "#eab308" },
};

function getTickerStyle(ticker: string) {
  return TICKER_COLORS[ticker] ?? { bg: "bg-amber-500", text: "text-amber-400", glow: "#f59e0b" };
}

// ─── Candlestick renderer via Customized ───────────────────────────────────────

function CandlestickSeries(props: any) {
  const { xAxisMap, yAxisMap, formattedGraphicalItems } = props;

  const xAxis = xAxisMap && (Object.values(xAxisMap)[0] as any);
  const yAxis = yAxisMap && (Object.values(yAxisMap)[0] as any);

  if (!xAxis || !yAxis || !formattedGraphicalItems) return null;

  const yScale = yAxis.scale;
  const xScale = xAxis.scale;
  const bandWidth = xAxis.bandSize || xScale.bandwidth?.() || 6;

  const firstItem = formattedGraphicalItems[0];
  if (!firstItem) return null;

  const data: CandleData[] =
    firstItem.props?.points?.map((pt: any) => pt.payload) ?? [];
  if (data.length === 0) return null;

  const barWidth = Math.max(2, Math.min(10, bandWidth * 0.7));

  return (
    <g className="candlestick-series">
      {data.map((d, i) => {
        const x = xScale(i) + bandWidth / 2;
        if (isNaN(x)) return null;

        const isUp = d.close >= d.open;
        const color = isUp ? "#22c55e" : "#ef4444";

        const yHigh = yScale(d.high);
        const yLow = yScale(d.low);
        const yOpen = yScale(d.open);
        const yClose = yScale(d.close);

        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(1, Math.abs(yOpen - yClose));

        return (
          <g key={`candle-${i}`}>
            {/* Wick */}
            <line
              x1={x}
              x2={x}
              y1={yHigh}
              y2={yLow}
              stroke={color}
              strokeWidth={1}
              opacity={0.7}
            />
            {/* Body */}
            <rect
              x={x - barWidth / 2}
              y={bodyTop}
              width={barWidth}
              height={bodyHeight}
              fill={color}
              stroke={color}
              strokeWidth={0.5}
              rx={1}
            />
            {/* Subtle glow on body */}
            <rect
              x={x - barWidth / 2 - 1}
              y={bodyTop - 1}
              width={barWidth + 2}
              height={bodyHeight + 2}
              fill="none"
              stroke={color}
              strokeWidth={0.3}
              rx={2}
              opacity={0.3}
            />
          </g>
        );
      })}
    </g>
  );
}

// ─── Custom tooltip ────────────────────────────────────────────────────────────

function CandleTooltip({ active, payload }: any) {
  if (!active || !payload || !payload[0]) return null;
  const d = payload[0].payload as CandleData;
  const isUp = d.close >= d.open;
  const changePct = ((d.close - d.open) / d.open) * 100;

  const fmt = (v: number) =>
    v.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="rounded-xl border border-amber-500/20 bg-zinc-950/95 px-4 py-3 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 mb-2">
        <p className="text-xs text-amber-400/80 font-medium">{d.date}</p>
        <span
          className={`text-xs font-bold px-1.5 py-0.5 rounded ${
            isUp
              ? "bg-green-500/15 text-green-400"
              : "bg-red-500/15 text-red-400"
          }`}
        >
          {isUp ? "+" : ""}
          {changePct.toFixed(2)}%
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-xs">
        <span className="text-zinc-500">Open</span>
        <span className="text-zinc-200 text-right font-mono">$ {fmt(d.open)}</span>
        <span className="text-zinc-500">High</span>
        <span className="text-green-400/80 text-right font-mono">$ {fmt(d.high)}</span>
        <span className="text-zinc-500">Low</span>
        <span className="text-red-400/80 text-right font-mono">$ {fmt(d.low)}</span>
        <span className="text-zinc-500">Close</span>
        <span
          className={`text-right font-mono font-semibold ${
            isUp ? "text-green-400" : "text-red-400"
          }`}
        >
          $ {fmt(d.close)}
        </span>
        {d.volume > 0 && (
          <>
            <span className="text-zinc-500">Volume</span>
            <span className="text-zinc-400 text-right font-mono">
              {d.volume >= 1e9
                ? `${(d.volume / 1e9).toFixed(1)}B`
                : d.volume >= 1e6
                ? `${(d.volume / 1e6).toFixed(1)}M`
                : d.volume >= 1e3
                ? `${(d.volume / 1e3).toFixed(0)}K`
                : d.volume.toFixed(0)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Volume bar chart below candlestick ────────────────────────────────────────

function VolumeChart({ data }: { data: CandleData[] }) {
  if (data.length === 0 || data.every((d) => !d.volume)) return null;

  const maxVol = Math.max(...data.map((d) => d.volume || 0));
  const formatVol = (v: number) => {
    if (v >= 1e9) return `${(v / 1e9).toFixed(0)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return `${v}`;
  };

  return (
    <div className="h-[80px] w-full mt-0 -mb-1">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 0, right: 10, bottom: 0, left: 10 }}
        >
          <XAxis dataKey="date" hide />
          <YAxis domain={[0, maxVol * 1.5]} hide />
          <Bar dataKey="volume" isAnimationActive={false} maxBarSize={10}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={d.close >= d.open ? "#22c55e" : "#ef4444"}
                fillOpacity={0.25}
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Price display header ──────────────────────────────────────────────────────

function PriceHeader({
  position,
  lastCandle,
}: {
  position: Position | undefined;
  lastCandle: CandleData | undefined;
}) {
  if (!position) return null;

  const price = position.precoAtual;
  const dayChange = position.dayChangePct;
  const isUp = (dayChange ?? 0) >= 0;

  return (
    <div className="flex items-end gap-3 mb-1">
      <span className="text-2xl sm:text-3xl font-bold text-zinc-50 font-mono tracking-tight">
        {price != null
          ? `$ ${price.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`
          : "--"}
      </span>
      {dayChange != null && (
        <span
          className={`flex items-center gap-0.5 text-sm font-semibold mb-0.5 px-2 py-0.5 rounded-md ${
            isUp
              ? "text-green-400 bg-green-500/10"
              : "text-red-400 bg-red-500/10"
          }`}
        >
          {isUp ? (
            <ArrowUpRight size={14} />
          ) : (
            <ArrowDownRight size={14} />
          )}
          {pct(dayChange)}
        </span>
      )}
      {lastCandle && (
        <span className="text-xs text-zinc-600 mb-1 ml-auto hidden sm:inline">
          {lastCandle.date}
        </span>
      )}
    </div>
  );
}

// ─── Main Page Component ───────────────────────────────────────────────────────

export default function CriptoativosPage() {
  const { data: portfolio, loading, error } = usePortfolio();
  const [selectedTicker, setSelectedTicker] = useState<string>("");
  const [range, setRange] = useState<RangeOption>("6mo");
  const [ohlcData, setOhlcData] = useState<CandleData[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  const cripto: Position[] = useMemo(
    () =>
      (portfolio?.positions ?? []).filter(
        (p: Position) => p.setor === "Cripto"
      ),
    [portfolio]
  );

  // Auto-select first ticker
  useEffect(() => {
    if (cripto.length > 0 && !selectedTicker) {
      setSelectedTicker(cripto[0].ticker);
    }
  }, [cripto, selectedTicker]);

  // Fetch OHLC data
  const fetchOHLC = useCallback(
    async (ticker: string, rng: RangeOption) => {
      if (!ticker) return;
      setChartLoading(true);
      setChartError(null);
      try {
        const res = await fetch(
          `/api/crypto/history?ticker=${encodeURIComponent(ticker)}&range=${rng}`
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        setOhlcData(json.data ?? []);
      } catch (err) {
        setChartError(err instanceof Error ? err.message : String(err));
        setOhlcData([]);
      } finally {
        setChartLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedTicker) {
      fetchOHLC(selectedTicker, range);
    }
  }, [selectedTicker, range, fetchOHLC]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;

  if (cripto.length === 0) {
    return (
      <>
        {/* Empty state with Bitcoin-themed styling */}
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Bitcoin size={22} className="text-zinc-900" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-amber-200 via-amber-100 to-amber-300 bg-clip-text text-transparent">
                Criptoativos
              </h1>
              <p className="text-xs md:text-sm text-zinc-500 mt-0.5">
                Posicoes em Bitcoin, Ethereum e outros tokens
              </p>
            </div>
          </div>
        </div>
        <div className="glass-card p-10 text-center border-amber-500/10">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <Bitcoin size={32} className="text-amber-500/40" />
          </div>
          <p className="text-zinc-400 text-sm font-medium">
            Nenhum criptoativo encontrado na carteira
          </p>
          <p className="text-zinc-600 text-xs mt-2 max-w-sm mx-auto">
            Adicione transacoes com tickers como BTC, ETH, SOL na aba{" "}
            <code className="text-amber-500/60 bg-amber-500/5 px-1.5 py-0.5 rounded">
              meus_ativos
            </code>{" "}
            da planilha.
          </p>
        </div>
      </>
    );
  }

  // ── Metrics ──────────────────────────────────────────────────────────────────
  const totalBRL = cripto.reduce((s, p) => s + p.valorAtualBRL, 0);
  const custoBRL = cripto.reduce((s, p) => s + p.custoTotalBRL, 0);
  const lucroBRL = totalBRL - custoBRL;
  const lucroTotal = cripto.reduce((s, p) => s + (p.lucroBRL ?? 0), 0);
  const lucroPositivo = lucroBRL >= 0;
  const rentPct = custoBRL > 0 ? (lucroBRL / custoBRL) * 100 : 0;

  // Selected position
  const selectedPosition = cripto.find((p) => p.ticker === selectedTicker);
  const custoMedio = selectedPosition?.custoMedio ?? 0;
  const lastCandle = ohlcData.length > 0 ? ohlcData[ohlcData.length - 1] : undefined;
  const tickerStyle = getTickerStyle(selectedTicker);

  // Price performance over the displayed range
  const rangePerf =
    ohlcData.length >= 2
      ? ((ohlcData[ohlcData.length - 1].close - ohlcData[0].open) /
          ohlcData[0].open) *
        100
      : null;

  // Format X axis dates
  const formatXDate = (value: string) => {
    if (!value) return "";
    const parts = value.split("-");
    if (parts.length < 3) return value;
    return `${parts[2]}/${parts[1]}`;
  };

  // Format Y axis values
  const formatYValue = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
    return `$${value.toFixed(0)}`;
  };

  // Y domain with padding
  const yDomain =
    ohlcData.length > 0
      ? [
          Math.min(...ohlcData.map((d) => d.low)) * 0.98,
          Math.max(...ohlcData.map((d) => d.high)) * 1.02,
        ]
      : [0, 1];

  // Table columns
  const columns = [
    {
      key: "ticker",
      label: "Ativo",
      render: (v: unknown) => {
        const t = String(v);
        const style = getTickerStyle(t);
        return (
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${style.bg}`}
              style={{ boxShadow: `0 0 6px ${style.glow}40` }}
            />
            <span className="font-semibold text-zinc-100">{t}</span>
          </div>
        );
      },
    },
    {
      key: "quantidade",
      label: "Qtd",
      align: "right" as const,
      render: (v: unknown) =>
        Number(v).toLocaleString("en-US", { maximumFractionDigits: 8 }),
    },
    {
      key: "custoMedio",
      label: "PM (USD)",
      align: "right" as const,
      render: (v: unknown) => (
        <span className="font-mono">
          $ {Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: "precoAtual",
      label: "Preco Atual",
      align: "right" as const,
      render: (v: unknown) =>
        v != null ? (
          <span className="font-mono font-medium">
            ${" "}
            {Number(v).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        ) : (
          <span className="text-zinc-600">--</span>
        ),
    },
    {
      key: "valorAtualBRL",
      label: "Valor (R$)",
      align: "right" as const,
      render: (v: unknown) => (
        <span className="font-medium">{compactBRL(Number(v))}</span>
      ),
    },
    {
      key: "lucroBRL",
      label: "P&L (R$)",
      align: "right" as const,
      render: (v: unknown): React.ReactNode => {
        const n = Number(v);
        if (!isFinite(n)) return <span className="text-zinc-600">--</span>;
        return (
          <span
            className={`font-semibold ${
              n >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {brl(n)}
          </span>
        );
      },
    },
    {
      key: "lucroPct",
      label: "%",
      align: "right" as const,
      render: (v: unknown): React.ReactNode => {
        const n = Number(v);
        if (!isFinite(n)) return <span className="text-zinc-600">--</span>;
        return (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded ${
              n >= 0
                ? "text-green-400 bg-green-500/10"
                : "text-red-400 bg-red-500/10"
            }`}
          >
            {n >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {pct(n)}
          </span>
        );
      },
    },
    {
      key: "dayChangePct",
      label: "24h",
      align: "right" as const,
      render: (v: unknown): React.ReactNode => {
        if (v == null) return <span className="text-zinc-600">--</span>;
        const n = Number(v);
        return (
          <span
            className={`text-xs font-medium ${
              n >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {pct(n)}
          </span>
        );
      },
    },
  ];

  return (
    <>
      {/* ── Bitcoin-themed Header ──────────────────────────────────────────── */}
      <div className="mb-6 md:mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Bitcoin size={22} className="text-zinc-900" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-amber-200 via-amber-100 to-amber-300 bg-clip-text text-transparent">
              Criptoativos
            </h1>
            <p className="text-xs md:text-sm text-zinc-500 mt-0.5">
              Posicoes em Bitcoin, Ethereum e outros tokens
            </p>
          </div>
        </div>
      </div>

      {/* ── Metric Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="animate-fade-in">
          <MetricCard
            label="Total Cripto"
            value={compactBRL(totalBRL)}
            sub={`${cripto.length} ativo${cripto.length > 1 ? "s" : ""}`}
            icon={<Bitcoin size={18} />}
            glowColor="#f97316"
          />
        </div>
        <div className="animate-fade-in animate-delay-1">
          <MetricCard
            label="Custo Total"
            value={compactBRL(custoBRL)}
            icon={<DollarSign size={18} />}
            glowColor="#d97706"
          />
        </div>
        <div className="animate-fade-in animate-delay-2">
          <MetricCard
            label="P&L Total"
            value={brl(lucroTotal)}
            sub={
              custoBRL > 0
                ? `${lucroPositivo ? "+" : ""}${rentPct.toFixed(1)}% sobre custo`
                : undefined
            }
            icon={
              lucroPositivo ? (
                <TrendingUp size={18} />
              ) : (
                <TrendingDown size={18} />
              )
            }
            trend={lucroPositivo ? "up" : "down"}
            glowColor={lucroPositivo ? "#22c55e" : "#ef4444"}
          />
        </div>
        <div className="animate-fade-in animate-delay-3">
          <MetricCard
            label="Rentabilidade"
            value={custoBRL > 0 ? pct(rentPct) : "--"}
            icon={<Coins size={18} />}
            trend={lucroPositivo ? "up" : "down"}
            glowColor={lucroPositivo ? "#22c55e" : "#ef4444"}
          />
        </div>
      </div>

      {/* ── Chart Section ─────────────────────────────────────────────────── */}
      <div
        className="glass-card mb-6 animate-fade-in overflow-hidden"
        style={{
          borderColor: `${tickerStyle.glow}18`,
          boxShadow: `0 0 60px ${tickerStyle.glow}06, inset 0 1px 0 rgba(255,255,255,0.04)`,
        }}
      >
        {/* Top bar: ticker pills + price */}
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-zinc-800/60">
          {/* Ticker Selector */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {cripto.map((pos) => {
              const style = getTickerStyle(pos.ticker);
              const isSelected = selectedTicker === pos.ticker;
              return (
                <button
                  key={pos.ticker}
                  onClick={() => setSelectedTicker(pos.ticker)}
                  className={`relative px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    isSelected
                      ? "text-zinc-900 shadow-lg"
                      : "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700/80 hover:text-zinc-200 border border-zinc-700/50"
                  }`}
                  style={
                    isSelected
                      ? {
                          background: `linear-gradient(135deg, ${style.glow}, ${style.glow}cc)`,
                          boxShadow: `0 4px 16px ${style.glow}40`,
                        }
                      : undefined
                  }
                >
                  <span className="flex items-center gap-1.5">
                    {!isSelected && (
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: style.glow }}
                      />
                    )}
                    {pos.ticker}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Price header */}
          <PriceHeader position={selectedPosition} lastCandle={lastCandle} />
        </div>

        {/* Range selector + PM badge */}
        <div className="px-4 sm:px-6 py-2.5 flex items-center gap-1 bg-zinc-900/30">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                range === opt.value
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm shadow-amber-500/10"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
              }`}
            >
              {opt.label}
            </button>
          ))}

          {/* Range performance badge */}
          {rangePerf !== null && !chartLoading && (
            <span
              className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-md ${
                rangePerf >= 0
                  ? "text-green-400 bg-green-500/10"
                  : "text-red-400 bg-red-500/10"
              }`}
            >
              {rangePerf >= 0 ? "+" : ""}
              {rangePerf.toFixed(1)}%
            </span>
          )}

          {/* PM badge */}
          {selectedPosition && custoMedio > 0 && (
            <div className="ml-auto flex items-center gap-1.5 text-xs">
              <Target size={12} className="text-amber-500/70" />
              <span className="text-zinc-500">PM:</span>
              <span className="text-amber-400 font-mono font-semibold">
                ${" "}
                {custoMedio.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          )}
        </div>

        {/* Candlestick Chart */}
        <div className="px-2 sm:px-4">
          <div className="h-[320px] sm:h-[380px] w-full">
            {chartLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="relative w-10 h-10">
                    <div className="absolute inset-0 rounded-full border-2 border-amber-500/20" />
                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-500 animate-spin" />
                    <Bitcoin
                      size={18}
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-amber-500/60"
                    />
                  </div>
                  <span className="text-xs text-zinc-500">
                    Carregando cotacoes...
                  </span>
                </div>
              </div>
            ) : chartError ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto mb-3">
                    <Zap size={20} className="text-red-400" />
                  </div>
                  <p className="text-red-400 text-sm font-medium mb-1">
                    Erro ao carregar dados
                  </p>
                  <p className="text-zinc-600 text-xs mb-3">{chartError}</p>
                  <button
                    onClick={() => fetchOHLC(selectedTicker, range)}
                    className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/15 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <RefreshCw size={12} />
                    Tentar novamente
                  </button>
                </div>
              </div>
            ) : ohlcData.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <BarChart3
                    size={28}
                    className="text-zinc-700 mx-auto mb-2"
                  />
                  <p className="text-zinc-500 text-sm">
                    Sem dados para {selectedTicker}
                  </p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={ohlcData}
                  margin={{ top: 16, right: 12, bottom: 8, left: 12 }}
                >
                  <defs>
                    <linearGradient
                      id="pmLineGlow"
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="0"
                    >
                      <stop
                        offset="0%"
                        stopColor="#f59e0b"
                        stopOpacity={0}
                      />
                      <stop
                        offset="20%"
                        stopColor="#f59e0b"
                        stopOpacity={0.8}
                      />
                      <stop
                        offset="80%"
                        stopColor="#f59e0b"
                        stopOpacity={0.8}
                      />
                      <stop
                        offset="100%"
                        stopColor="#f59e0b"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#27272a"
                    vertical={false}
                    opacity={0.5}
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatXDate}
                    tick={{ fill: "#52525b", fontSize: 10 }}
                    axisLine={{ stroke: "#27272a" }}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={40}
                  />
                  <YAxis
                    domain={yDomain}
                    tickFormatter={formatYValue}
                    tick={{ fill: "#52525b", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={55}
                  />
                  <Tooltip
                    content={<CandleTooltip />}
                    cursor={{
                      stroke: "#f59e0b",
                      strokeWidth: 1,
                      strokeDasharray: "4 4",
                      opacity: 0.4,
                    }}
                  />

                  {/* PM Reference Line */}
                  {custoMedio > 0 &&
                    custoMedio >= yDomain[0] &&
                    custoMedio <= yDomain[1] && (
                      <ReferenceLine
                        y={custoMedio}
                        stroke="#f59e0b"
                        strokeDasharray="8 4"
                        strokeWidth={1.5}
                        strokeOpacity={0.7}
                        label={{
                          value: `PM $${custoMedio.toLocaleString("en-US", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}`,
                          position: "right",
                          fill: "#f59e0b",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      />
                    )}

                  {/* Invisible bar to give Customized access to data via formattedGraphicalItems */}
                  <Bar
                    dataKey="close"
                    fill="transparent"
                    isAnimationActive={false}
                  />

                  {/* Candlestick rendering */}
                  <Customized component={CandlestickSeries} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Volume bars */}
          {!chartLoading && !chartError && <VolumeChart data={ohlcData} />}
        </div>

        {/* Legend bar */}
        {ohlcData.length > 0 && !chartLoading && (
          <div className="px-4 sm:px-6 py-3 border-t border-zinc-800/40 flex flex-wrap items-center gap-4 text-xs text-zinc-500 justify-center bg-zinc-900/20">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-green-500/80" />
              Alta (Close {">"} Open)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-red-500/80" />
              Queda (Close {"<"} Open)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-0.5 bg-amber-500 rounded" />
              <span className="inline-block w-1 h-0.5 bg-amber-500 rounded" />
              Preco Medio (PM)
            </span>
          </div>
        )}
      </div>

      {/* ── Position Cards (mobile) + DataTable ──────────────────────────── */}
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-amber-500/70" />
          <h2 className="text-sm font-semibold text-zinc-300">Posicoes</h2>
          <span className="text-xs text-zinc-600 ml-1">
            {cripto.length} ativo{cripto.length > 1 ? "s" : ""}
          </span>
        </div>

        {/* Mobile position cards */}
        <div className="grid grid-cols-1 gap-2 sm:hidden mb-4">
          {cripto.map((pos) => {
            const style = getTickerStyle(pos.ticker);
            const lucro = pos.lucroBRL ?? 0;
            const isUp = lucro >= 0;
            return (
              <button
                key={pos.ticker}
                onClick={() => setSelectedTicker(pos.ticker)}
                className={`glass-card p-3 text-left transition-all duration-200 ${
                  selectedTicker === pos.ticker
                    ? "ring-1 ring-amber-500/30"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center"
                      style={{
                        backgroundColor: `${style.glow}20`,
                      }}
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: style.glow }}
                      />
                    </div>
                    <span className="font-bold text-zinc-100 text-sm">
                      {pos.ticker}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      isUp
                        ? "text-green-400 bg-green-500/10"
                        : "text-red-400 bg-red-500/10"
                    }`}
                  >
                    {pos.lucroPct != null ? pct(pos.lucroPct) : "--"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">
                    {pos.precoAtual != null
                      ? `$ ${pos.precoAtual.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`
                      : "--"}
                  </span>
                  <span className="text-zinc-300 font-medium">
                    {compactBRL(pos.valorAtualBRL)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block animate-fade-in">
          <DataTable
            data={cripto as unknown as Record<string, unknown>[]}
            columns={columns}
          />
        </div>
      </div>
    </>
  );
}

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  Cell,
} from "recharts";
import { BarChart3, RefreshCw, Zap, SlidersHorizontal, Check } from "lucide-react";
import { sma, ema, bollinger, rsi as rsiCalc, macd as macdCalc } from "@/lib/indicators";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PurchaseMarker {
  date: string;
  price: number;
  quantidade: number;
  moeda: string;
}

export type RangeOption = "1d" | "5d" | "1mo" | "3mo" | "6mo" | "ytd" | "1y" | "2y" | "5y" | "10y" | "max";

const RANGE_OPTIONS: { label: string; value: RangeOption }[] = [
  { label: "1D", value: "1d" },
  { label: "5D", value: "5d" },
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
  { label: "YTD", value: "ytd" },
  { label: "1A", value: "1y" },
  { label: "2A", value: "2y" },
  { label: "5A", value: "5y" },
  { label: "10A", value: "10y" },
  { label: "ALL", value: "max" },
];

// Indicadores selecionáveis. Overlays desenham sobre o preço; osciladores num
// painel próprio abaixo do gráfico.
interface IndicatorDef { key: string; label: string; color: string; kind: "overlay" | "osc" }
const INDICATORS: IndicatorDef[] = [
  { key: "sma20", label: "SMA 20", color: "#3b82f6", kind: "overlay" },
  { key: "sma50", label: "SMA 50", color: "#a855f7", kind: "overlay" },
  { key: "sma200", label: "SMA 200", color: "#f59e0b", kind: "overlay" },
  { key: "ema9", label: "EMA 9", color: "#22d3ee", kind: "overlay" },
  { key: "ema21", label: "EMA 21", color: "#ec4899", kind: "overlay" },
  { key: "bb", label: "Bollinger (20,2)", color: "#94a3b8", kind: "overlay" },
  { key: "rsi", label: "RSI (14)", color: "#e879f9", kind: "osc" },
  { key: "macd", label: "MACD (12,26,9)", color: "#38bdf8", kind: "osc" },
];

function IndicatorRow({ ind, on, onToggle }: { ind: IndicatorDef; on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-zinc-800/60">
      <span className="flex h-4 w-4 items-center justify-center rounded border" style={{ borderColor: on ? ind.color : "#3f3f46", background: on ? ind.color : "transparent" }}>
        {on && <Check size={11} className="text-black" />}
      </span>
      <span className="h-0.5 w-3 rounded-full" style={{ background: ind.color }} />
      <span className="text-xs text-zinc-300">{ind.label}</span>
    </button>
  );
}

// ─── Currency helpers ─────────────────────────────────────────────────────────

function currencySymbol(moeda: string): string {
  const m = (moeda || "BRL").toUpperCase();
  if (m === "BRL") return "R$";
  if (m === "USD") return "$";
  if (m === "EUR") return "€";
  if (m === "GBP") return "£";
  return `${m} `;
}

function fmtMoney(value: number, moeda: string): string {
  const m = (moeda || "BRL").toUpperCase();
  const locale = m === "BRL" ? "pt-BR" : "en-US";
  return `${currencySymbol(m)} ${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Date helpers ──────────────────────────────────────────────────────────────

function normalizeDate(raw: string): string {
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return raw.slice(0, 10);
}

function formatDisplayDate(d: string): string {
  const n = normalizeDate(d);
  const parts = n.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

// ─── Candlestick shape for Bar component ─────────────────────────────────────

export function makeCandleShape(yDomain: [number, number]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function CandleShape(props: any) {
    const { x, width, payload, background } = props;
    if (!payload || payload.open == null || payload.close == null) return <g />;
    if (!background || x == null || width == null) return <g />;

    const plotTop = background.y;
    const plotH = background.height;
    const domMin = yDomain[0];
    const domMax = yDomain[1];
    const domRange = domMax - domMin;
    if (domRange <= 0 || plotH <= 0) return <g />;

    const toY = (v: number) => plotTop + plotH - ((v - domMin) / domRange) * plotH;
    const cx = x + width / 2;
    const barW = Math.max(2, Math.min(10, width * 0.8));

    const isUp = payload.close >= payload.open;
    const color = isUp ? "#22c55e" : "#ef4444";
    const yHigh = toY(payload.high);
    const yLow = toY(payload.low);
    const yOpen = toY(payload.open);
    const yClose = toY(payload.close);
    const bodyTop = Math.min(yOpen, yClose);
    const bodyH = Math.max(1, Math.abs(yOpen - yClose));

    return (
      <g>
        <line x1={cx} x2={cx} y1={yHigh} y2={yLow} stroke={color} strokeWidth={1} opacity={0.7} />
        <rect x={cx - barW / 2} y={bodyTop} width={barW} height={bodyH} fill={color} stroke={color} strokeWidth={0.5} rx={1} />
        <rect x={cx - barW / 2 - 1} y={bodyTop - 1} width={barW + 2} height={bodyH + 2} fill="none" stroke={color} strokeWidth={0.3} rx={2} opacity={0.3} />
      </g>
    );
  };
}

// ─── Custom tooltip ────────────────────────────────────────────────────────────

export function CandleTooltip({ active, payload, moeda }: {
  active?: boolean;
  payload?: { payload: CandleData }[];
  moeda: string;
}) {
  if (!active || !payload || !payload[0]) return null;
  const d = payload[0].payload;
  const isUp = d.close >= d.open;
  const changePct = ((d.close - d.open) / d.open) * 100;

  return (
    <div className="rounded-xl border border-amber-500/20 bg-zinc-950/95 px-4 py-3 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 mb-2">
        <p className="text-xs text-amber-400/80 font-medium">{d.date}</p>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isUp ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
          {isUp ? "+" : ""}{changePct.toFixed(2)}%
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-xs">
        <span className="text-zinc-500">Open</span>
        <span className="text-zinc-200 text-right font-mono">{fmtMoney(d.open, moeda)}</span>
        <span className="text-zinc-500">High</span>
        <span className="text-green-400/80 text-right font-mono">{fmtMoney(d.high, moeda)}</span>
        <span className="text-zinc-500">Low</span>
        <span className="text-red-400/80 text-right font-mono">{fmtMoney(d.low, moeda)}</span>
        <span className="text-zinc-500">Close</span>
        <span className={`text-right font-mono font-semibold ${isUp ? "text-green-400" : "text-red-400"}`}>{fmtMoney(d.close, moeda)}</span>
        {d.volume > 0 && (
          <>
            <span className="text-zinc-500">Volume</span>
            <span className="text-zinc-400 text-right font-mono">
              {d.volume >= 1e9 ? `${(d.volume / 1e9).toFixed(1)}B` : d.volume >= 1e6 ? `${(d.volume / 1e6).toFixed(1)}M` : d.volume >= 1e3 ? `${(d.volume / 1e3).toFixed(0)}K` : d.volume.toFixed(0)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Volume bar chart ────────────────────────────────────────────────────────

export function VolumeChart({ data }: { data: CandleData[] }) {
  if (data.length === 0 || data.every((d) => !d.volume)) return null;
  const maxVol = Math.max(...data.map((d) => d.volume || 0));
  return (
    <div className="h-[80px] w-full mt-0 -mb-1">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 0, right: 10, bottom: 0, left: 10 }}>
          <XAxis dataKey="date" hide />
          <YAxis domain={[0, maxVol * 1.5]} hide />
          <Bar dataKey="volume" isAnimationActive={false} maxBarSize={10}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.close >= d.open ? "#22c55e" : "#ef4444"} fillOpacity={0.25} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Purchase markers: map to nearest candle date <= purchase date ─────────────

interface MappedPurchase extends PurchaseMarker {
  candleDate: string;
  retornoPct: number | null;
}

function mapPurchasesToCandles(
  purchases: PurchaseMarker[],
  candles: CandleData[],
  precoAtual?: number | null,
): MappedPurchase[] {
  if (candles.length === 0) return [];
  const candleDates = candles.map((c) => c.date);
  const firstDate = candleDates[0];
  const result: MappedPurchase[] = [];
  for (const p of purchases) {
    const pDate = normalizeDate(p.date);
    if (!pDate) continue;
    // Skip purchases older than the visible range.
    if (pDate < firstDate) continue;
    // Find the candle date <= purchase date that is closest (largest such date).
    let candleDate: string | null = null;
    for (const cd of candleDates) {
      if (cd <= pDate) candleDate = cd;
      else break;
    }
    if (!candleDate) continue;
    const retornoPct =
      precoAtual != null && p.price > 0 ? ((precoAtual - p.price) / p.price) * 100 : null;
    result.push({ ...p, candleDate, retornoPct });
  }
  return result;
}

// ─── Main shared chart component ───────────────────────────────────────────────

interface CandleChartProps {
  ticker: string;
  moeda: string;
  corretora?: string;
  purchases: PurchaseMarker[];
  precoAtual?: number | null;
  // Mostra a tabela "Compras marcadas no gráfico" abaixo do gráfico. Desligue
  // quando o consumidor já exibe a lista de transações (evita duplicar as compras).
  showPurchaseList?: boolean;
}

export default function CandleChart({
  ticker,
  moeda,
  corretora = "",
  purchases,
  precoAtual,
  showPurchaseList = true,
}: CandleChartProps) {
  const [range, setRange] = useState<RangeOption>("6mo");
  const [ohlcData, setOhlcData] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const toggleIndicator = (key: string) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  // Fecha o seletor de indicadores ao clicar fora.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  const assetMoeda = (moeda || "BRL").toUpperCase();

  const fetchOHLC = useCallback(async (rng: RangeOption) => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        ticker,
        moeda: assetMoeda,
        corretora,
        range: rng,
      });
      const res = await fetch(`/api/market/ohlc?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setOhlcData(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setOhlcData([]);
    } finally {
      setLoading(false);
    }
  }, [ticker, assetMoeda, corretora]);

  useEffect(() => {
    fetchOHLC(range);
  }, [fetchOHLC, range]);

  const yDomain = useMemo<[number, number]>(() => {
    if (ohlcData.length === 0) return [0, 1];
    return [
      Math.min(...ohlcData.map((d) => d.low)) * 0.98,
      Math.max(...ohlcData.map((d) => d.high)) * 1.02,
    ];
  }, [ohlcData]);

  const mappedPurchases = useMemo(
    () => mapPurchasesToCandles(purchases, ohlcData, precoAtual),
    [purchases, ohlcData, precoAtual],
  );

  // Calcula todos os indicadores e anexa ao dado do gráfico (Recharts lê por dataKey).
  const chartData = useMemo(() => {
    const closes = ohlcData.map((d) => d.close);
    const s20 = sma(closes, 20), s50 = sma(closes, 50), s200 = sma(closes, 200);
    const e9 = ema(closes, 9), e21 = ema(closes, 21);
    const bb = bollinger(closes, 20, 2);
    const r = rsiCalc(closes, 14);
    const m = macdCalc(closes);
    return ohlcData.map((d, i) => ({
      ...d,
      sma20: s20[i], sma50: s50[i], sma200: s200[i],
      ema9: e9[i], ema21: e21[i],
      bbU: bb.upper[i], bbM: bb.mid[i], bbL: bb.lower[i],
      rsi: r[i], macd: m.macd[i], macdSignal: m.signal[i], macdHist: m.hist[i],
    }));
  }, [ohlcData]);

  const showRsi = active.has("rsi");
  const showMacd = active.has("macd");

  const formatXDate = (value: string) => {
    if (!value) return "";
    const parts = value.split("-");
    if (parts.length < 3) return value;
    return `${parts[2]}/${parts[1]}`;
  };

  const formatYValue = (value: number) => {
    const sym = currencySymbol(assetMoeda).trim();
    if (value >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${sym}${(value / 1_000).toFixed(0)}k`;
    return `${sym}${value.toFixed(0)}`;
  };

  const rangePerf = ohlcData.length >= 2
    ? ((ohlcData[ohlcData.length - 1].close - ohlcData[0].open) / ohlcData[0].open) * 100
    : null;

  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/40 overflow-hidden">
      {/* Range selector + indicadores */}
      <div className="px-3 sm:px-4 py-2 flex items-center flex-wrap gap-1 bg-zinc-900/40 border-b border-zinc-800/50">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setRange(opt.value)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all duration-200 ${
              range === opt.value
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
            }`}
          >
            {opt.label}
          </button>
        ))}
        {rangePerf !== null && !loading && (
          <span className={`ml-2 text-[11px] font-bold px-2 py-0.5 rounded-md ${rangePerf >= 0 ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"}`}>
            {rangePerf >= 0 ? "+" : ""}{rangePerf.toFixed(1)}%
          </span>
        )}

        {/* Seletor de indicadores técnicos */}
        <div ref={pickerRef} className="relative ml-auto">
          <button
            onClick={() => setPickerOpen((o) => !o)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
              active.size > 0
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-zinc-700/50"
            }`}
          >
            <SlidersHorizontal size={12} />
            Indicadores
            {active.size > 0 && <span className="text-[9px] opacity-80">({active.size})</span>}
          </button>
          {pickerOpen && (
            <div
              className="absolute right-0 top-full mt-1 z-30 w-56 rounded-xl border border-zinc-700/60 bg-zinc-950/95 p-1.5 shadow-2xl backdrop-blur-md"
            >
              <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">Sobre o preço</div>
              {INDICATORS.filter((ind) => ind.kind === "overlay").map((ind) => (
                <IndicatorRow key={ind.key} ind={ind} on={active.has(ind.key)} onToggle={() => toggleIndicator(ind.key)} />
              ))}
              <div className="px-2 py-1 mt-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">Osciladores</div>
              {INDICATORS.filter((ind) => ind.kind === "osc").map((ind) => (
                <IndicatorRow key={ind.key} ind={ind} on={active.has(ind.key)} onToggle={() => toggleIndicator(ind.key)} />
              ))}
              {active.size > 0 && (
                <button onClick={() => setActive(new Set())} className="mt-1 w-full rounded-lg px-2 py-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors text-left">
                  Limpar todos
                </button>
              )}
            </div>
          )}
        </div>
        <span className="text-[10px] text-zinc-600">{ticker} · {assetMoeda}</span>
      </div>

      {/* Chart */}
      <div className="px-1 sm:px-2">
        <div className="h-[280px] sm:h-[320px] w-full">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="relative w-9 h-9">
                  <div className="absolute inset-0 rounded-full border-2 border-amber-500/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-500 animate-spin" />
                </div>
                <span className="text-xs text-zinc-500">Carregando cotacoes...</span>
              </div>
            </div>
          ) : error ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto mb-3">
                  <Zap size={20} className="text-red-400" />
                </div>
                <p className="text-red-400 text-sm font-medium mb-1">Erro ao carregar dados</p>
                <p className="text-zinc-600 text-xs mb-3">{error}</p>
                <button onClick={() => fetchOHLC(range)} className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/15 px-3 py-1.5 rounded-lg transition-colors">
                  <RefreshCw size={12} /> Tentar novamente
                </button>
              </div>
            </div>
          ) : ohlcData.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <BarChart3 size={28} className="text-zinc-700 mx-auto mb-2" />
                <p className="text-zinc-500 text-sm">Sem dados para {ticker}</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 16, right: 12, bottom: 8, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} opacity={0.5} />
                <XAxis dataKey="date" tickFormatter={formatXDate} tick={{ fill: "#52525b", fontSize: 10 }} axisLine={{ stroke: "#27272a" }} tickLine={false} interval="preserveStartEnd" minTickGap={40} />
                <YAxis domain={yDomain} tickFormatter={formatYValue} tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} width={55} />
                <Tooltip content={<CandleTooltip moeda={assetMoeda} />} cursor={{ stroke: "#f59e0b", strokeWidth: 1, strokeDasharray: "4 4", opacity: 0.4 }} />
                <Bar dataKey="close" fill="transparent" isAnimationActive={false}
                  shape={makeCandleShape(yDomain)}
                  background={{ fill: "transparent" }}
                />
                {/* Overlays de indicadores sobre o preço */}
                {active.has("bb") && <Line dataKey="bbU" stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls isAnimationActive={false} />}
                {active.has("bb") && <Line dataKey="bbM" stroke="#94a3b8" strokeWidth={0.8} dot={false} connectNulls isAnimationActive={false} opacity={0.7} />}
                {active.has("bb") && <Line dataKey="bbL" stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls isAnimationActive={false} />}
                {active.has("sma20") && <Line dataKey="sma20" stroke="#3b82f6" strokeWidth={1.3} dot={false} connectNulls isAnimationActive={false} />}
                {active.has("sma50") && <Line dataKey="sma50" stroke="#a855f7" strokeWidth={1.3} dot={false} connectNulls isAnimationActive={false} />}
                {active.has("sma200") && <Line dataKey="sma200" stroke="#f59e0b" strokeWidth={1.3} dot={false} connectNulls isAnimationActive={false} />}
                {active.has("ema9") && <Line dataKey="ema9" stroke="#22d3ee" strokeWidth={1.2} dot={false} connectNulls isAnimationActive={false} />}
                {active.has("ema21") && <Line dataKey="ema21" stroke="#ec4899" strokeWidth={1.2} dot={false} connectNulls isAnimationActive={false} />}
                {mappedPurchases.map((mp, i) => (
                  <ReferenceDot
                    key={`buy-${i}`}
                    x={mp.candleDate}
                    y={mp.price}
                    r={5}
                    fill="#fbbf24"
                    stroke="#0a0a0a"
                    strokeWidth={1.5}
                    ifOverflow="extendDomain"
                    isFront
                    shape={(props: { cx?: number; cy?: number }) => {
                      const { cx, cy } = props;
                      if (cx == null || cy == null) return <g />;
                      return (
                        <g>
                          <circle cx={cx} cy={cy} r={6} fill="#fbbf24" fillOpacity={0.18} />
                          <path
                            d={`M ${cx} ${cy - 6} L ${cx + 5} ${cy + 4} L ${cx - 5} ${cy + 4} Z`}
                            fill="#fbbf24"
                            stroke="#0a0a0a"
                            strokeWidth={1}
                          />
                        </g>
                      );
                    }}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        {!loading && !error && <VolumeChart data={ohlcData} />}
      </div>

      {/* Painel RSI */}
      {showRsi && !loading && !error && ohlcData.length > 0 && (
        <div className="px-1 sm:px-2 border-t border-zinc-800/50 pt-1">
          <div className="px-2 text-[10px] font-semibold text-fuchsia-400/80">RSI (14)</div>
          <div className="h-[90px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} opacity={0.4} />
                <XAxis dataKey="date" hide />
                <YAxis domain={[0, 100]} ticks={[30, 50, 70]} tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} width={55} />
                <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" opacity={0.4} />
                <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" opacity={0.4} />
                <Tooltip
                  contentStyle={{ background: "rgba(9,9,11,0.95)", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }}
                  labelStyle={{ color: "#a1a1aa" }}
                  formatter={(v: number) => [v?.toFixed(1), "RSI"]}
                />
                <Line dataKey="rsi" stroke="#e879f9" strokeWidth={1.3} dot={false} connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Painel MACD */}
      {showMacd && !loading && !error && ohlcData.length > 0 && (
        <div className="px-1 sm:px-2 border-t border-zinc-800/50 pt-1">
          <div className="px-2 text-[10px] font-semibold text-sky-400/80">MACD (12,26,9)</div>
          <div className="h-[100px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} opacity={0.4} />
                <XAxis dataKey="date" hide />
                <YAxis tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} width={55} />
                <ReferenceLine y={0} stroke="#3f3f46" strokeWidth={1} />
                <Tooltip
                  contentStyle={{ background: "rgba(9,9,11,0.95)", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 11 }}
                  labelStyle={{ color: "#a1a1aa" }}
                />
                <Bar dataKey="macdHist" isAnimationActive={false} maxBarSize={6}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={(d.macdHist ?? 0) >= 0 ? "#22c55e" : "#ef4444"} fillOpacity={0.5} />
                  ))}
                </Bar>
                <Line dataKey="macd" stroke="#38bdf8" strokeWidth={1.2} dot={false} connectNulls isAnimationActive={false} />
                <Line dataKey="macdSignal" stroke="#f59e0b" strokeWidth={1.2} dot={false} connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per-purchase return summary */}
      {showPurchaseList && !loading && !error && mappedPurchases.length > 0 && (
        <div className="border-t border-zinc-800/50">
          <div className="px-3 sm:px-4 py-2 flex items-center gap-2 bg-zinc-900/30">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-400/90">
              <span className="inline-block w-0 h-0 border-l-[5px] border-r-[5px] border-b-[8px] border-l-transparent border-r-transparent border-b-amber-400" />
              Compras marcadas no gráfico
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800/50">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Data</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Qtd</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Preço pago</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Retorno</th>
                </tr>
              </thead>
              <tbody>
                {mappedPurchases.map((mp, i) => {
                  const positivo = (mp.retornoPct ?? 0) >= 0;
                  return (
                    <tr key={i} className="border-b border-zinc-800/20 hover:bg-white/[0.015]">
                      <td className="px-3 py-1.5 text-zinc-400 font-mono">{formatDisplayDate(mp.date)}</td>
                      <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">
                        {mp.quantidade.toLocaleString("en-US", { maximumFractionDigits: 8 })}
                      </td>
                      <td className="px-3 py-1.5 text-right text-zinc-200 font-mono">{fmtMoney(mp.price, mp.moeda || assetMoeda)}</td>
                      <td className={`px-3 py-1.5 text-right font-semibold font-mono ${mp.retornoPct == null ? "text-zinc-600" : positivo ? "text-green-400" : "text-red-400"}`}>
                        {mp.retornoPct == null ? "—" : `${positivo ? "+" : ""}${mp.retornoPct.toFixed(1)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

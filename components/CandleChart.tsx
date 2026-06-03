"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  ReferenceDot,
  Cell,
} from "recharts";
import { BarChart3, RefreshCw, Zap } from "lucide-react";

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

export type RangeOption = "1mo" | "3mo" | "6mo" | "1y" | "max";

const RANGE_OPTIONS: { label: string; value: RangeOption }[] = [
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
  { label: "1A", value: "1y" },
  { label: "ALL", value: "max" },
];

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
}

export default function CandleChart({
  ticker,
  moeda,
  corretora = "",
  purchases,
  precoAtual,
}: CandleChartProps) {
  const [range, setRange] = useState<RangeOption>("6mo");
  const [ohlcData, setOhlcData] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      {/* Range selector */}
      <div className="px-3 sm:px-4 py-2 flex items-center gap-1 bg-zinc-900/40 border-b border-zinc-800/50">
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
        <span className="ml-auto text-[10px] text-zinc-600">{ticker} · {assetMoeda}</span>
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
              <ComposedChart data={ohlcData} margin={{ top: 16, right: 12, bottom: 8, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} opacity={0.5} />
                <XAxis dataKey="date" tickFormatter={formatXDate} tick={{ fill: "#52525b", fontSize: 10 }} axisLine={{ stroke: "#27272a" }} tickLine={false} interval="preserveStartEnd" minTickGap={40} />
                <YAxis domain={yDomain} tickFormatter={formatYValue} tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} width={55} />
                <Tooltip content={<CandleTooltip moeda={assetMoeda} />} cursor={{ stroke: "#f59e0b", strokeWidth: 1, strokeDasharray: "4 4", opacity: 0.4 }} />
                <Bar dataKey="close" fill="transparent" isAnimationActive={false}
                  shape={makeCandleShape(yDomain)}
                  background={{ fill: "transparent" }}
                />
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

      {/* Per-purchase return summary */}
      {!loading && !error && mappedPurchases.length > 0 && (
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

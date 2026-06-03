"use client";

import React, { useState, useMemo, useEffect, useCallback, memo } from "react";
import Link from "next/link";
import {
  ComposableMap, Geographies, Geography, Marker, ZoomableGroup,
} from "react-simple-maps";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip as RTooltip, YAxis,
} from "recharts";
import {
  ArrowLeft, Globe, TrendingUp, TrendingDown, Search,
  ArrowUpDown, DollarSign, Filter, ZoomIn, ZoomOut, Maximize2,
  Gauge, Activity,
} from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

interface CurrencyData {
  code: string;
  name: string;
  rate: number;
  change: number;
  changePct: number;
  flag: string;
  region: string;
  lat: number;
  lng: number;
}

type PeriodKey = "1S" | "1M" | "3M" | "6M" | "1A" | "YTD";

interface DxyData {
  value: number;
  change: number;
  changePct: number;
  source: "yahoo" | "sintetico";
  periods: Record<PeriodKey, number | null> | null;
  history: { date: string; close: number }[];
}

interface Verdict {
  label: string;
  tone: "forte" | "neutro" | "fraco";
  score: number;
  reason: string;
}

interface MoedasResponse {
  currencies: CurrencyData[];
  usdBrl: number;
  lastUpdate: string;
  dxy: DxyData | null;
  breadth: { up: number; down: number; total: number };
  verdict: Verdict;
  error?: string;
}

const TONE_COLORS: Record<Verdict["tone"], { color: string; bg: string; label: string }> = {
  forte:  { color: "#34d399", bg: "rgba(16,185,129,0.12)", label: "Dólar forte" },
  neutro: { color: "#fbbf24", bg: "rgba(245,158,11,0.12)", label: "Neutro" },
  fraco:  { color: "#f87171", bg: "rgba(239,68,68,0.12)",  label: "Dólar fraco" },
};

const PERIOD_LABELS: Record<PeriodKey, string> = {
  "1S": "1 sem", "1M": "1 mês", "3M": "3 meses", "6M": "6 meses", "1A": "1 ano", YTD: "Ano (YTD)",
};

const REGION_COLORS: Record<string, string> = {
  Americas: "#3b82f6",
  Europe: "#8b5cf6",
  Asia: "#f59e0b",
  "Middle East": "#ef4444",
  Africa: "#10b981",
  Oceania: "#06b6d4",
};

type SortKey = "code" | "rate" | "changePct" | "region";

// ── World Map component (memoized for performance) ───────────────────────────

const WorldMap = memo(function WorldMap({
  currencies,
  selectedRegion,
  hoveredCurrency,
  selectedCurrency,
  onHover,
  onSelect,
}: {
  currencies: CurrencyData[];
  selectedRegion: string | null;
  hoveredCurrency: string | null;
  selectedCurrency: CurrencyData | null;
  onHover: (code: string | null) => void;
  onSelect: (c: CurrencyData | null) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([10, 20]);

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(z * 1.5, 8)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(z / 1.5, 1)), []);
  const handleReset = useCallback(() => { setZoom(1); setCenter([10, 20]); }, []);

  return (
    <div className="relative">
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        {[
          { icon: ZoomIn, action: handleZoomIn, label: "Zoom in" },
          { icon: ZoomOut, action: handleZoomOut, label: "Zoom out" },
          { icon: Maximize2, action: handleReset, label: "Reset" },
        ].map(({ icon: Icon, action, label }) => (
          <button
            key={label}
            onClick={action}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
            style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
            title={label}
          >
            <Icon size={13} className="text-zinc-400" />
          </button>
        ))}
      </div>

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 130, center: [0, 30] }}
        style={{ width: "100%", height: "auto" }}
        width={800}
        height={450}
      >
        <ZoomableGroup
          zoom={zoom}
          center={center}
          onMoveEnd={({ coordinates, zoom: z }) => { setCenter(coordinates as [number, number]); setZoom(z); }}
          maxZoom={8}
        >
          {/* Graticule-like background */}
          <rect x={-200} y={-100} width={1200} height={700} fill="rgba(8,10,18,0.6)" />

          {/* Country shapes */}
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="rgba(255,255,255,0.04)"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: "none" },
                    hover: { fill: "rgba(255,255,255,0.08)", outline: "none" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {/* Currency markers */}
          {currencies.map((c) => {
            const regionColor = REGION_COLORS[c.region] ?? "#888";
            const isHovered = hoveredCurrency === c.code;
            const isSelected = selectedCurrency?.code === c.code;
            const active = isHovered || isSelected;
            const dimmed = selectedRegion ? c.region !== selectedRegion : false;
            const changeColor = c.changePct >= 0 ? "#4ade80" : "#f87171";
            const markerR = active ? 7 : 4.5;

            return (
              <Marker
                key={c.code}
                coordinates={[c.lng, c.lat]}
                onMouseEnter={() => onHover(c.code)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onSelect(isSelected ? null : c)}
              >
                <g style={{ opacity: dimmed ? 0.12 : 1, cursor: "pointer" }}>
                  {/* Glow ring */}
                  {active && (
                    <>
                      <circle r={markerR + 8} fill="none" stroke={changeColor} strokeWidth={0.6} opacity={0.3}>
                        <animate attributeName="r" from={markerR + 4} to={markerR + 14} dur="1.8s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.4" to="0" dur="1.8s" repeatCount="indefinite" />
                      </circle>
                      <circle r={markerR + 4} fill={`${regionColor}15`} stroke={regionColor} strokeWidth={0.4} opacity={0.5} />
                    </>
                  )}

                  {/* Shadow */}
                  <circle r={markerR} fill="rgba(0,0,0,0.4)" cx={0.5} cy={0.5} />

                  {/* Main circle */}
                  <circle
                    r={markerR}
                    fill={regionColor}
                    stroke={active ? "#fff" : `${regionColor}80`}
                    strokeWidth={active ? 1.8 : 0.6}
                    style={{ filter: active ? `drop-shadow(0 0 6px ${regionColor})` : undefined }}
                  />

                  {/* Inner change-color dot */}
                  <circle r={markerR * 0.4} fill={changeColor} opacity={0.9} />

                  {/* Label */}
                  {!dimmed && (
                    <text
                      y={-markerR - 4}
                      textAnchor="middle"
                      fill={active ? "#fff" : "rgba(255,255,255,0.6)"}
                      fontSize={active ? 11 : 8}
                      fontWeight={active ? 700 : 500}
                      fontFamily="system-ui, -apple-system, sans-serif"
                      style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
                    >
                      {c.code}
                    </text>
                  )}

                  {/* Tooltip */}
                  {active && (
                    <g>
                      <rect
                        x={-68} y={markerR + 6}
                        width={136} height={42}
                        rx={6}
                        fill="rgba(0,0,0,0.92)"
                        stroke="rgba(255,255,255,0.15)"
                        strokeWidth={0.5}
                        style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))" }}
                      />
                      <text x={0} y={markerR + 21} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={600} fontFamily="system-ui">
                        {c.flag} {c.name}
                      </text>
                      <text x={-28} y={markerR + 36} textAnchor="start" fill="#94a3b8" fontSize={9} fontFamily="system-ui">
                        1 USD = {fmtRate(c.rate)}
                      </text>
                      <text x={28} y={markerR + 36} textAnchor="end" fill={changeColor} fontSize={9} fontWeight={600} fontFamily="system-ui">
                        {c.changePct >= 0 ? "+" : ""}{c.changePct.toFixed(2)}%
                      </text>
                    </g>
                  )}
                </g>
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
});

// ── Main page ────────────────────────────────────────────────────────────────

export default function MoedasPage() {
  const [data, setData] = useState<MoedasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("changePct");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [hoveredCurrency, setHoveredCurrency] = useState<string | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyData | null>(null);

  useEffect(() => {
    fetch("/api/moedas")
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const regions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.currencies.map(c => c.region))].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.currencies;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.region.toLowerCase().includes(q)
      );
    }
    if (selectedRegion) {
      list = list.filter(c => c.region === selectedRegion);
    }
    list = [...list].sort((a, b) => {
      let va: number | string, vb: number | string;
      switch (sortKey) {
        case "code": va = a.code; vb = b.code; break;
        case "rate": va = a.rate; vb = b.rate; break;
        case "changePct": va = a.changePct; vb = b.changePct; break;
        case "region": va = a.region; vb = b.region; break;
        default: va = a.changePct; vb = b.changePct;
      }
      if (typeof va === "string") return sortAsc ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return list;
  }, [data, search, sortKey, sortAsc, selectedRegion]);

  const stats = useMemo(() => {
    if (!data) return null;
    const cs = data.currencies;
    const strongest = cs.reduce((a, b) => a.changePct < b.changePct ? a : b);
    const weakest = cs.reduce((a, b) => a.changePct > b.changePct ? a : b);
    return { strongest, weakest };
  }, [data]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "code" || key === "region"); }
  };

  const handleHover = useCallback((code: string | null) => setHoveredCurrency(code), []);
  const handleSelect = useCallback((c: CurrencyData | null) => setSelectedCurrency(c), []);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;

  return (
    <div className="min-h-screen pb-10">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-2">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/" className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <Globe className="text-cyan-400" size={22} />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-zinc-50 via-zinc-100 to-zinc-300 bg-clip-text text-transparent">
            Moedas do Mundo
          </h1>
        </div>
        <p className="text-xs text-zinc-500 ml-[66px]">
          Cotações em relação ao dólar · Atualizado: {formatDate(data.lastUpdate)}
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-4 space-y-6">

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            label="USD/BRL"
            value={`R$ ${data.usdBrl.toFixed(4)}`}
            icon={<DollarSign size={16} className="text-emerald-400" />}
          />
          <SummaryCard
            label="Mais forte (vs USD)"
            value={`${stats!.strongest.flag} ${stats!.strongest.code}`}
            sub={`${stats!.strongest.changePct >= 0 ? "+" : ""}${stats!.strongest.changePct.toFixed(2)}%`}
            subColor={stats!.strongest.changePct >= 0 ? "text-emerald-400" : "text-red-400"}
            icon={<TrendingUp size={16} className="text-emerald-400" />}
          />
          <SummaryCard
            label="Mais fraca (vs USD)"
            value={`${stats!.weakest.flag} ${stats!.weakest.code}`}
            sub={`${stats!.weakest.changePct >= 0 ? "+" : ""}${stats!.weakest.changePct.toFixed(2)}%`}
            subColor={stats!.weakest.changePct >= 0 ? "text-emerald-400" : "text-red-400"}
            icon={<TrendingDown size={16} className="text-red-400" />}
          />
          <SummaryCard
            label="Moedas monitoradas"
            value={`${data.currencies.length}`}
            sub={`${regions.length} regiões`}
            icon={<Globe size={16} className="text-cyan-400" />}
          />
        </div>

        {/* ── Termômetro do Dólar (DXY) ── */}
        {data.dxy && (
          <DollarThermometer dxy={data.dxy} verdict={data.verdict} breadth={data.breadth} />
        )}

        {/* ── World Map ── */}
        <div
          className="rounded-2xl p-3 md:p-5 overflow-hidden"
          style={{
            background: "rgba(13,14,20,0.8)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
          }}
        >
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Globe size={16} className="text-cyan-400" />
              Mapa de Cotações
            </h2>
            <div className="flex gap-1.5 flex-wrap">
              {regions.map(r => (
                <button
                  key={r}
                  onClick={() => setSelectedRegion(selectedRegion === r ? null : r)}
                  className="text-[10px] px-2.5 py-1 rounded-full transition-all"
                  style={{
                    background: selectedRegion === r
                      ? (REGION_COLORS[r] ?? "#888") + "30"
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${selectedRegion === r ? (REGION_COLORS[r] ?? "#888") + "60" : "rgba(255,255,255,0.06)"}`,
                    color: selectedRegion === r ? REGION_COLORS[r] ?? "#ddd" : "#888",
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ background: "rgba(5,7,14,0.5)" }}>
            <WorldMap
              currencies={data.currencies}
              selectedRegion={selectedRegion}
              hoveredCurrency={hoveredCurrency}
              selectedCurrency={selectedCurrency}
              onHover={handleHover}
              onSelect={handleSelect}
            />
          </div>

          {/* Region legend */}
          <div className="flex items-center justify-center gap-4 mt-3 flex-wrap">
            {Object.entries(REGION_COLORS).map(([region, color]) => (
              <div key={region} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}50` }} />
                <span className="text-[10px] text-zinc-500">{region}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Selected Currency Detail ── */}
        {selectedCurrency && (
          <div
            className="rounded-2xl p-5"
            style={{
              background: "rgba(13,14,20,0.8)",
              border: `1px solid ${(REGION_COLORS[selectedCurrency.region] ?? "#888")}30`,
              boxShadow: `0 8px 32px ${(REGION_COLORS[selectedCurrency.region] ?? "#888")}08`,
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{selectedCurrency.flag}</span>
                <div>
                  <h3 className="text-base font-semibold text-zinc-100">{selectedCurrency.name}</h3>
                  <p className="text-xs text-zinc-500">{selectedCurrency.code} · {selectedCurrency.region}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-zinc-100">{fmtRate(selectedCurrency.rate)}</p>
                <p className="text-xs text-zinc-500">1 USD = {selectedCurrency.code}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-4">
              <DetailBox
                label="Variação dia"
                value={`${selectedCurrency.changePct >= 0 ? "+" : ""}${selectedCurrency.changePct.toFixed(3)}%`}
                color={selectedCurrency.changePct >= 0 ? "text-emerald-400" : "text-red-400"}
              />
              <DetailBox
                label="Variação absoluta"
                value={`${selectedCurrency.change >= 0 ? "+" : ""}${selectedCurrency.change.toFixed(6)}`}
                color={selectedCurrency.change >= 0 ? "text-emerald-400" : "text-red-400"}
              />
              <DetailBox
                label="Vs BRL"
                value={data.usdBrl > 0 && selectedCurrency.code !== "BRL"
                  ? `R$ ${(data.usdBrl / selectedCurrency.rate).toFixed(4)}`
                  : selectedCurrency.code === "BRL"
                    ? `R$ 1.0000`
                    : "—"}
                color="text-zinc-200"
              />
            </div>
          </div>
        )}

        {/* ── Region Breakdown ── */}
        <div
          className="rounded-2xl p-4 md:p-6"
          style={{
            background: "rgba(13,14,20,0.8)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <h2 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
            <Filter size={16} className="text-violet-400" />
            Performance por Região
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {regions.map(region => {
              const rc = data.currencies.filter(c => c.region === region);
              const avg = rc.reduce((s, c) => s + c.changePct, 0) / rc.length;
              const color = REGION_COLORS[region] ?? "#888";
              return (
                <button
                  key={region}
                  onClick={() => setSelectedRegion(selectedRegion === region ? null : region)}
                  className="rounded-xl p-3 text-center transition-all hover:scale-[1.02]"
                  style={{
                    background: selectedRegion === region ? `${color}15` : "rgba(255,255,255,0.02)",
                    border: `1px solid ${selectedRegion === region ? `${color}40` : "rgba(255,255,255,0.05)"}`,
                  }}
                >
                  <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">{region}</p>
                  <p className={`text-sm font-bold mt-1 ${avg >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {avg >= 0 ? "+" : ""}{avg.toFixed(2)}%
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">{rc.length} moedas</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Currency Table ── */}
        <div
          className="rounded-2xl p-4 md:p-6"
          style={{
            background: "rgba(13,14,20,0.8)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <ArrowUpDown size={16} className="text-amber-400" />
              Todas as Moedas
            </h2>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input
                type="text"
                placeholder="Buscar moeda..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-zinc-900/50 border border-zinc-800 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 w-48"
              />
            </div>
          </div>

          {/* Table header */}
          <div className="hidden md:grid grid-cols-12 gap-2 px-3 py-2 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider border-b border-zinc-800/50">
            <SortHeader label="Moeda" colSpan={3} sortKey="code" current={sortKey} asc={sortAsc} onClick={handleSort} />
            <SortHeader label="Região" colSpan={2} sortKey="region" current={sortKey} asc={sortAsc} onClick={handleSort} />
            <SortHeader label="Cotação (1 USD)" colSpan={3} sortKey="rate" current={sortKey} asc={sortAsc} onClick={handleSort} />
            <SortHeader label="Variação" colSpan={2} sortKey="changePct" current={sortKey} asc={sortAsc} onClick={handleSort} />
            <div className="col-span-2 text-right">Vs BRL</div>
          </div>

          {/* Table rows */}
          <div className="divide-y divide-zinc-800/30">
            {filtered.map(c => {
              const isUp = c.changePct >= 0;
              const vsBrl = c.code === "BRL" ? 1 : data.usdBrl > 0 ? data.usdBrl / c.rate : 0;
              const regionColor = REGION_COLORS[c.region] ?? "#888";

              return (
                <div
                  key={c.code}
                  className="grid grid-cols-12 gap-2 px-3 py-3 items-center hover:bg-white/[0.02] transition-colors cursor-pointer rounded-lg"
                  onMouseEnter={() => setHoveredCurrency(c.code)}
                  onMouseLeave={() => setHoveredCurrency(null)}
                  onClick={() => setSelectedCurrency(selectedCurrency?.code === c.code ? null : c)}
                  style={{
                    background: selectedCurrency?.code === c.code ? "rgba(255,255,255,0.03)" : undefined,
                  }}
                >
                  {/* Currency */}
                  <div className="col-span-5 md:col-span-3 flex items-center gap-2">
                    <span className="text-lg">{c.flag}</span>
                    <div>
                      <p className="text-xs font-semibold text-zinc-200">{c.code}</p>
                      <p className="text-[10px] text-zinc-500 hidden sm:block">{c.name}</p>
                    </div>
                  </div>

                  {/* Region */}
                  <div className="col-span-2 hidden md:flex items-center">
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: `${regionColor}18`, color: regionColor }}
                    >
                      {c.region}
                    </span>
                  </div>

                  {/* Rate */}
                  <div className="col-span-3 md:col-span-3">
                    <p className="text-xs font-mono text-zinc-300">{fmtRate(c.rate)}</p>
                  </div>

                  {/* Change */}
                  <div className="col-span-2 flex items-center gap-1">
                    {isUp
                      ? <TrendingUp size={11} className="text-emerald-400 shrink-0" />
                      : <TrendingDown size={11} className="text-red-400 shrink-0" />}
                    <span className={`text-xs font-semibold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                      {isUp ? "+" : ""}{c.changePct.toFixed(2)}%
                    </span>
                  </div>

                  {/* Vs BRL */}
                  <div className="col-span-2 text-right hidden md:block">
                    <p className="text-xs font-mono text-zinc-400">
                      R$ {vsBrl < 0.01 ? vsBrl.toFixed(6) : vsBrl < 1 ? vsBrl.toFixed(4) : vsBrl.toFixed(2)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-8 text-zinc-600 text-sm">
              Nenhuma moeda encontrada
            </div>
          )}
        </div>

        {/* ── Strongest / Weakest bars ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChangeBar
            title="Mais Fortes vs USD (dia)"
            currencies={data.currencies
              .filter(c => c.changePct < 0)
              .sort((a, b) => a.changePct - b.changePct)
              .slice(0, 8)}
            color="#4ade80"
          />
          <ChangeBar
            title="Mais Fracas vs USD (dia)"
            currencies={data.currencies
              .filter(c => c.changePct > 0)
              .sort((a, b) => b.changePct - a.changePct)
              .slice(0, 8)}
            color="#f87171"
          />
        </div>

        {/* ── Footer ── */}
        <p className="text-center text-[10px] text-zinc-700 pt-4">
          Cotações via Yahoo Finance · DXY = ICE U.S. Dollar Index · Variações em relação ao dólar americano (USD)
        </p>
      </div>
    </div>
  );
}

// ── Dollar Thermometer (DXY) ─────────────────────────────────────────────────

const ALL_PERIODS: PeriodKey[] = ["1S", "1M", "3M", "6M", "1A", "YTD"];
const CHART_RANGES: { key: PeriodKey; days: number }[] = [
  { key: "1M", days: 30 }, { key: "3M", days: 90 },
  { key: "6M", days: 180 }, { key: "1A", days: 365 },
];

function DollarThermometer({ dxy, verdict, breadth }: {
  dxy: DxyData; verdict: Verdict; breadth: { up: number; down: number; total: number };
}) {
  const [chartRange, setChartRange] = useState<PeriodKey>("3M");
  const tone = TONE_COLORS[verdict.tone];
  const dxyUp = dxy.changePct >= 0;

  // Gauge: score -100..100 → ângulo 0..180
  const angle = ((verdict.score + 100) / 200) * 180;

  const chartData = useMemo(() => {
    if (dxy.history.length === 0) return [];
    const cfg = CHART_RANGES.find(r => r.key === chartRange) ?? CHART_RANGES[1];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - cfg.days);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    return dxy.history.filter(p => p.date >= cutoffStr);
  }, [dxy.history, chartRange]);

  const chartMin = useMemo(() => Math.min(...chartData.map(d => d.close)), [chartData]);
  const chartMax = useMemo(() => Math.max(...chartData.map(d => d.close)), [chartData]);
  const chartRangePct = chartData.length > 1
    ? ((chartData[chartData.length - 1].close / chartData[0].close) - 1) * 100
    : 0;

  return (
    <div
      className="rounded-2xl p-4 md:p-6"
      style={{
        background: "rgba(13,14,20,0.8)",
        border: `1px solid ${tone.color}25`,
        boxShadow: `0 8px 32px ${tone.color}08`,
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Gauge size={16} style={{ color: tone.color }} />
        <h2 className="text-sm font-semibold text-zinc-200">Termômetro do Dólar (DXY)</h2>
        <span className="text-[10px] text-zinc-600 ml-auto">
          {dxy.source === "sintetico" ? "índice sintético" : "ICE U.S. Dollar Index"}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Coluna 1 — Veredito + gauge */}
        <div className="flex flex-col items-center justify-center text-center">
          {/* Gauge semicircular */}
          <svg viewBox="0 0 200 110" className="w-full max-w-[220px]">
            <defs>
              <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f87171" />
                <stop offset="50%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#34d399" />
              </linearGradient>
            </defs>
            {/* Arco de fundo */}
            <path d="M 15 100 A 85 85 0 0 1 185 100" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={12} strokeLinecap="round" />
            <path d="M 15 100 A 85 85 0 0 1 185 100" fill="none" stroke="url(#gaugeGrad)" strokeWidth={12} strokeLinecap="round" opacity={0.85} />
            {/* Ponteiro */}
            <g transform={`rotate(${angle - 90} 100 100)`}>
              <line x1={100} y1={100} x2={100} y2={28} stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
              <circle cx={100} cy={100} r={6} fill="#fff" />
            </g>
            <text x={15} y={108} fill="#71717a" fontSize={8} textAnchor="middle">fraco</text>
            <text x={185} y={108} fill="#71717a" fontSize={8} textAnchor="middle">forte</text>
          </svg>

          <span
            className="text-[11px] px-2.5 py-1 rounded-full font-semibold mt-1"
            style={{ background: tone.bg, color: tone.color, border: `1px solid ${tone.color}40` }}
          >
            {verdict.label}
          </span>
          <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed max-w-[260px]">{verdict.reason}</p>
        </div>

        {/* Coluna 2 — DXY atual + períodos */}
        <div className="flex flex-col justify-center">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Índice DXY</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-zinc-100">{dxy.value.toFixed(2)}</span>
            <span className={`text-sm font-semibold flex items-center gap-1 ${dxyUp ? "text-emerald-400" : "text-red-400"}`}>
              {dxyUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {dxyUp ? "+" : ""}{dxy.changePct.toFixed(2)}% hoje
            </span>
          </div>

          {dxy.periods && (
            <div className="grid grid-cols-3 gap-2 mt-4">
              {ALL_PERIODS.map(p => {
                const v = dxy.periods![p];
                if (v == null) return null;
                const up = v >= 0;
                return (
                  <div key={p} className="rounded-lg px-2 py-1.5 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <p className="text-[9px] text-zinc-600 uppercase">{PERIOD_LABELS[p]}</p>
                    <p className={`text-xs font-bold font-mono ${up ? "text-emerald-400" : "text-red-400"}`}>
                      {up ? "+" : ""}{v.toFixed(1)}%
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Coluna 3 — Sparkline */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-zinc-500 flex items-center gap-1">
              <Activity size={11} /> Histórico DXY
            </span>
            <div className="flex gap-1">
              {CHART_RANGES.map(r => (
                <button
                  key={r.key}
                  onClick={() => setChartRange(r.key)}
                  className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
                  style={{
                    background: chartRange === r.key ? `${tone.color}25` : "rgba(255,255,255,0.04)",
                    color: chartRange === r.key ? tone.color : "#71717a",
                  }}
                >
                  {r.key}
                </button>
              ))}
            </div>
          </div>

          {chartData.length > 1 ? (
            <>
              <div className="flex-1 min-h-[120px]">
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="dxyArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chartRangePct >= 0 ? "#34d399" : "#f87171"} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={chartRangePct >= 0 ? "#34d399" : "#f87171"} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis domain={[chartMin, chartMax]} hide />
                    <RTooltip
                      contentStyle={{ background: "rgba(0,0,0,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: "#a1a1aa" }}
                      formatter={(v: number) => [v.toFixed(2), "DXY"]}
                    />
                    <Area
                      type="monotone" dataKey="close"
                      stroke={chartRangePct >= 0 ? "#34d399" : "#f87171"}
                      strokeWidth={1.5} fill="url(#dxyArea)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-zinc-600 text-center">
                {chartRangePct >= 0 ? "+" : ""}{chartRangePct.toFixed(2)}% no período · {breadth.up}/{breadth.total} moedas perderam p/ USD hoje
              </p>
            </>
          ) : (
            <div className="flex-1 min-h-[120px] flex items-center justify-center text-[11px] text-zinc-600">
              Histórico indisponível
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers & Sub-components ─────────────────────────────────────────────────

function fmtRate(rate: number): string {
  if (rate < 1) return rate.toFixed(6);
  if (rate < 100) return rate.toFixed(4);
  return rate.toFixed(2);
}

function SummaryCard({ label, value, sub, subColor, icon }: {
  label: string; value: string; sub?: string; subColor?: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-4 transition-transform hover:scale-[1.02]"
      style={{
        background: "rgba(13,14,20,0.8)",
        border: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-bold text-zinc-100">{value}</p>
      {sub && <p className={`text-[10px] mt-0.5 ${subColor ?? "text-zinc-500"}`}>{sub}</p>}
    </div>
  );
}

function DetailBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-zinc-600 uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function SortHeader({ label, colSpan, sortKey: sk, current, asc, onClick }: {
  label: string; colSpan: number; sortKey: SortKey;
  current: SortKey; asc: boolean; onClick: (k: SortKey) => void;
}) {
  const active = current === sk;
  return (
    <button
      className="text-left flex items-center gap-1 hover:text-zinc-400 transition-colors"
      style={{ gridColumn: `span ${colSpan}` }}
      onClick={() => onClick(sk)}
    >
      {label}
      {active && <ArrowUpDown size={9} className={asc ? "rotate-180" : ""} />}
    </button>
  );
}

function ChangeBar({ title, currencies, color }: {
  title: string; currencies: CurrencyData[]; color: string;
}) {
  if (currencies.length === 0) return null;
  const maxAbs = Math.max(...currencies.map(x => Math.abs(x.changePct)), 0.01);
  return (
    <div
      className="rounded-2xl p-4 md:p-5"
      style={{
        background: "rgba(13,14,20,0.8)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <h3 className="text-xs font-semibold text-zinc-300 mb-3">{title}</h3>
      <div className="space-y-2">
        {currencies.map(c => {
          const width = (Math.abs(c.changePct) / maxAbs) * 100;
          return (
            <div key={c.code} className="flex items-center gap-2">
              <span className="text-sm w-6">{c.flag}</span>
              <span className="text-[11px] font-semibold text-zinc-300 w-10">{c.code}</span>
              <div className="flex-1 h-4 rounded-full overflow-hidden bg-zinc-900/50 relative">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(width, 2)}%`,
                    background: `linear-gradient(90deg, ${color}40, ${color})`,
                  }}
                />
              </div>
              <span className="text-[11px] font-mono font-semibold w-16 text-right" style={{ color }}>
                {c.changePct >= 0 ? "+" : ""}{c.changePct.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

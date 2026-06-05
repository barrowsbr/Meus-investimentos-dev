"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef, memo } from "react";
import Link from "next/link";
import {
  ComposableMap, Geographies, Geography, Marker, ZoomableGroup,
} from "react-simple-maps";
import {
  ArrowLeft, Globe, TrendingUp, TrendingDown, Search,
  ArrowUpDown, Filter, ZoomIn, ZoomOut, Maximize2,
  Activity, BarChart3, Maximize,
} from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

interface IndexData {
  symbol: string;
  tvSymbol: string;
  name: string;
  country: string;
  flag: string;
  region: string;
  lat: number;
  lng: number;
  price: number;
  change: number;
  changePct: number;
  currency: string;
}

type PeriodKey = "1S" | "1M" | "3M" | "6M" | "1A" | "YTD";

interface BolsasResponse {
  indices: IndexData[];
  spHistory: { date: string; close: number }[];
  spPeriods: Record<PeriodKey, number | null> | null;
  breadth: { up: number; down: number; total: number };
  best: { symbol: string; name: string; flag: string; changePct: number };
  worst: { symbol: string; name: string; flag: string; changePct: number };
  lastUpdate: string;
  error?: string;
}

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

type SortKey = "name" | "price" | "changePct" | "region";

const ALL_PERIODS: PeriodKey[] = ["1S", "1M", "3M", "6M", "1A", "YTD"];

function fmtPrice(price: number): string {
  if (price >= 10000) return price.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (price >= 100) return price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
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

// ── World Map ──────────────────────────────────────────────────────────────

const WorldMap = memo(function WorldMap({
  indices,
  selectedRegion,
  hoveredIndex,
  selectedIndex,
  onHover,
  onSelect,
}: {
  indices: IndexData[];
  selectedRegion: string | null;
  hoveredIndex: string | null;
  selectedIndex: IndexData | null;
  onHover: (symbol: string | null) => void;
  onSelect: (i: IndexData | null) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([10, 20]);

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(z * 1.5, 8)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(z / 1.5, 1)), []);
  const handleReset = useCallback(() => { setZoom(1); setCenter([10, 20]); }, []);

  return (
    <div className="relative">
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
          <rect x={-200} y={-100} width={1200} height={700} fill="rgba(8,10,18,0.6)" />
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

          {indices.map((idx) => {
            const regionColor = REGION_COLORS[idx.region] ?? "#888";
            const isHovered = hoveredIndex === idx.symbol;
            const isSelected = selectedIndex?.symbol === idx.symbol;
            const active = isHovered || isSelected;
            const dimmed = selectedRegion ? idx.region !== selectedRegion : false;
            const changeColor = idx.changePct >= 0 ? "#4ade80" : "#f87171";
            const markerR = active ? 7 : 4.5;

            return (
              <Marker
                key={idx.symbol}
                coordinates={[idx.lng, idx.lat]}
                onMouseEnter={() => onHover(idx.symbol)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onSelect(isSelected ? null : idx)}
              >
                <g style={{ opacity: dimmed ? 0.12 : 1, cursor: "pointer" }}>
                  {active && (
                    <>
                      <circle r={markerR + 8} fill="none" stroke={changeColor} strokeWidth={0.6} opacity={0.3}>
                        <animate attributeName="r" from={markerR + 4} to={markerR + 14} dur="1.8s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.4" to="0" dur="1.8s" repeatCount="indefinite" />
                      </circle>
                      <circle r={markerR + 4} fill={`${regionColor}15`} stroke={regionColor} strokeWidth={0.4} opacity={0.5} />
                    </>
                  )}
                  <circle r={markerR} fill="rgba(0,0,0,0.4)" cx={0.5} cy={0.5} />
                  <circle
                    r={markerR}
                    fill={regionColor}
                    stroke={active ? "#fff" : `${regionColor}80`}
                    strokeWidth={active ? 1.8 : 0.6}
                    style={{ filter: active ? `drop-shadow(0 0 6px ${regionColor})` : undefined }}
                  />
                  <circle r={markerR * 0.4} fill={changeColor} opacity={0.9} />
                  {!dimmed && (
                    <text
                      y={-markerR - 4}
                      textAnchor="middle"
                      fill={active ? "#fff" : "rgba(255,255,255,0.6)"}
                      fontSize={active ? 10 : 7}
                      fontWeight={active ? 700 : 500}
                      fontFamily="system-ui, -apple-system, sans-serif"
                      style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
                    >
                      {idx.name.length > 14 ? idx.symbol.replace("^", "") : idx.name}
                    </text>
                  )}
                  {active && (
                    <g>
                      <rect
                        x={-72} y={markerR + 6}
                        width={144} height={42}
                        rx={6}
                        fill="rgba(0,0,0,0.92)"
                        stroke="rgba(255,255,255,0.15)"
                        strokeWidth={0.5}
                        style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))" }}
                      />
                      <text x={0} y={markerR + 21} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={600} fontFamily="system-ui">
                        {idx.flag} {idx.name}
                      </text>
                      <text x={-32} y={markerR + 36} textAnchor="start" fill="#94a3b8" fontSize={9} fontFamily="system-ui">
                        {fmtPrice(idx.price)}
                      </text>
                      <text x={32} y={markerR + 36} textAnchor="end" fill={changeColor} fontSize={9} fontWeight={600} fontFamily="system-ui">
                        {idx.changePct >= 0 ? "+" : ""}{idx.changePct.toFixed(2)}%
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

// ── Main page ──────────────────────────────────────────────────────────────

interface PeriodsCache {
  [symbol: string]: Record<PeriodKey, number | null> | null;
}

export default function BolsasPage() {
  const [data, setData] = useState<BolsasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("changePct");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<IndexData | null>(null);
  const [periodsCache, setPeriodsCache] = useState<PeriodsCache>({});
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [chartExpanded, setChartExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/bolsas")
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else {
          setData(d);
          if (d.spPeriods) {
            setPeriodsCache(prev => ({ ...prev, "^GSPC": d.spPeriods }));
          }
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const focusedSymbol = selectedIndex?.symbol ?? "^GSPC";

  useEffect(() => {
    if (!focusedSymbol || periodsCache[focusedSymbol] !== undefined) return;
    let cancelled = false;
    setPeriodsLoading(true);
    fetch(`/api/bolsas/history?symbol=${encodeURIComponent(focusedSymbol)}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        setPeriodsCache(prev => ({ ...prev, [focusedSymbol]: d.periods ?? null }));
      })
      .catch(() => {
        if (!cancelled) setPeriodsCache(prev => ({ ...prev, [focusedSymbol]: null }));
      })
      .finally(() => { if (!cancelled) setPeriodsLoading(false); });
    return () => { cancelled = true; };
  }, [focusedSymbol, periodsCache]);

  const regions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.indices.map(i => i.region))].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.indices;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.symbol.toLowerCase().includes(q) ||
        i.country.toLowerCase().includes(q) ||
        i.region.toLowerCase().includes(q)
      );
    }
    if (selectedRegion) {
      list = list.filter(i => i.region === selectedRegion);
    }
    list = [...list].sort((a, b) => {
      let va: number | string, vb: number | string;
      switch (sortKey) {
        case "name": va = a.name; vb = b.name; break;
        case "price": va = a.price; vb = b.price; break;
        case "changePct": va = a.changePct; vb = b.changePct; break;
        case "region": va = a.region; vb = b.region; break;
        default: va = a.changePct; vb = b.changePct;
      }
      if (typeof va === "string") return sortAsc ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return list;
  }, [data, search, sortKey, sortAsc, selectedRegion]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "name" || key === "region"); }
  };

  const handleHover = useCallback((symbol: string | null) => setHoveredIndex(symbol), []);
  const handleSelect = useCallback((i: IndexData | null) => setSelectedIndex(i), []);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;

  const sp = data.indices.find(i => i.symbol === "^GSPC");
  const ibov = data.indices.find(i => i.symbol === "^BVSP");
  const vix = data.indices.find(i => i.symbol === "^VIX");

  return (
    <div className="min-h-screen pb-10">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-2">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/" className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <BarChart3 className="text-blue-400" size={22} />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-zinc-50 via-zinc-100 to-zinc-300 bg-clip-text text-transparent">
            Bolsas do Mundo
          </h1>
        </div>
        <p className="text-xs text-zinc-500 ml-[66px]">
          {"Índices"} de mercado em tempo real &middot; Atualizado: {formatDate(data.lastUpdate)}
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-4 space-y-6">

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {sp && (
            <SummaryCard
              label="S&P 500"
              value={fmtPrice(sp.price)}
              sub={`${sp.changePct >= 0 ? "+" : ""}${sp.changePct.toFixed(2)}%`}
              subColor={sp.changePct >= 0 ? "text-emerald-400" : "text-red-400"}
              icon={<TrendingUp size={16} className="text-blue-400" />}
            />
          )}
          {ibov && (
            <SummaryCard
              label="Ibovespa"
              value={fmtPrice(ibov.price)}
              sub={`${ibov.changePct >= 0 ? "+" : ""}${ibov.changePct.toFixed(2)}%`}
              subColor={ibov.changePct >= 0 ? "text-emerald-400" : "text-red-400"}
              icon={<TrendingUp size={16} className="text-emerald-400" />}
            />
          )}
          <SummaryCard
            label="Melhor do dia"
            value={`${data.best.flag} ${data.best.name}`}
            sub={`+${data.best.changePct.toFixed(2)}%`}
            subColor="text-emerald-400"
            icon={<TrendingUp size={16} className="text-emerald-400" />}
          />
          <SummaryCard
            label="Pior do dia"
            value={`${data.worst.flag} ${data.worst.name}`}
            sub={`${data.worst.changePct.toFixed(2)}%`}
            subColor="text-red-400"
            icon={<TrendingDown size={16} className="text-red-400" />}
          />
        </div>

        {/* ── Index Thermometer (dynamic) ── */}
        {(() => {
          const focusIdx = selectedIndex ?? sp;
          if (!focusIdx) return null;
          const cachedPeriods = periodsCache[focusIdx.symbol];
          return (
            <IndexThermometer
              index={focusIdx}
              vix={vix ?? null}
              periods={cachedPeriods ?? null}
              breadth={data.breadth}
              historyLoading={periodsLoading && cachedPeriods === undefined}
              isDefault={!selectedIndex}
              expanded={chartExpanded}
              onToggleExpand={() => setChartExpanded(e => !e)}
            />
          );
        })()}

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
              <Globe size={16} className="text-blue-400" />
              Mapa de Bolsas
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
              indices={data.indices}
              selectedRegion={selectedRegion}
              hoveredIndex={hoveredIndex}
              selectedIndex={selectedIndex}
              onHover={handleHover}
              onSelect={handleSelect}
            />
          </div>

          <div className="flex items-center justify-center gap-4 mt-3 flex-wrap">
            {Object.entries(REGION_COLORS).map(([region, color]) => (
              <div key={region} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}50` }} />
                <span className="text-[10px] text-zinc-500">{region}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Selected Index Detail ── */}
        {selectedIndex && (
          <div
            className="rounded-2xl p-5"
            style={{
              background: "rgba(13,14,20,0.8)",
              border: `1px solid ${(REGION_COLORS[selectedIndex.region] ?? "#888")}30`,
              boxShadow: `0 8px 32px ${(REGION_COLORS[selectedIndex.region] ?? "#888")}08`,
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{selectedIndex.flag}</span>
                <div>
                  <h3 className="text-base font-semibold text-zinc-100">{selectedIndex.name}</h3>
                  <p className="text-xs text-zinc-500">{selectedIndex.country} &middot; {selectedIndex.region}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-zinc-100">{fmtPrice(selectedIndex.price)}</p>
                <p className="text-xs text-zinc-500">{selectedIndex.currency}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-4">
              <DetailBox
                label="Variação dia"
                value={`${selectedIndex.changePct >= 0 ? "+" : ""}${selectedIndex.changePct.toFixed(2)}%`}
                color={selectedIndex.changePct >= 0 ? "text-emerald-400" : "text-red-400"}
              />
              <DetailBox
                label="Variação absoluta"
                value={`${selectedIndex.change >= 0 ? "+" : ""}${fmtPrice(Math.abs(selectedIndex.change))}`}
                color={selectedIndex.change >= 0 ? "text-emerald-400" : "text-red-400"}
              />
              <DetailBox
                label="Último preço"
                value={`${fmtPrice(selectedIndex.price)} ${selectedIndex.currency}`}
                color="text-zinc-200"
              />
            </div>
          </div>
        )}

        {/* ── Region Performance ── */}
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
              const rc = data.indices.filter(i => i.region === region && i.symbol !== "^VIX");
              if (rc.length === 0) return null;
              const avg = rc.reduce((s, i) => s + i.changePct, 0) / rc.length;
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
                  <p className="text-[10px] text-zinc-600 mt-0.5">{rc.length} {"índices"}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Index Table ── */}
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
              Todos os {"Índices"}
            </h2>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input
                type="text"
                placeholder="Buscar bolsa..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-zinc-900/50 border border-zinc-800 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 w-48"
              />
            </div>
          </div>

          {/* Table header */}
          <div className="hidden md:grid grid-cols-12 gap-2 px-3 py-2 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider border-b border-zinc-800/50">
            <SortHeader label={"Índice"} colSpan={4} sortKey="name" current={sortKey} asc={sortAsc} onClick={handleSort} />
            <SortHeader label="Região" colSpan={2} sortKey="region" current={sortKey} asc={sortAsc} onClick={handleSort} />
            <SortHeader label="Preço" colSpan={3} sortKey="price" current={sortKey} asc={sortAsc} onClick={handleSort} />
            <SortHeader label="Variação" colSpan={3} sortKey="changePct" current={sortKey} asc={sortAsc} onClick={handleSort} />
          </div>

          {/* Table rows */}
          <div className="divide-y divide-zinc-800/30">
            {filtered.map(idx => {
              const isUp = idx.changePct >= 0;
              const regionColor = REGION_COLORS[idx.region] ?? "#888";

              return (
                <div
                  key={idx.symbol}
                  className="grid grid-cols-12 gap-2 px-3 py-3 items-center hover:bg-white/[0.02] transition-colors cursor-pointer rounded-lg"
                  onMouseEnter={() => setHoveredIndex(idx.symbol)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={() => setSelectedIndex(selectedIndex?.symbol === idx.symbol ? null : idx)}
                  style={{
                    background: selectedIndex?.symbol === idx.symbol ? "rgba(255,255,255,0.03)" : undefined,
                  }}
                >
                  {/* Index name */}
                  <div className="col-span-6 md:col-span-4 flex items-center gap-2">
                    <span className="text-lg">{idx.flag}</span>
                    <div>
                      <p className="text-xs font-semibold text-zinc-200">{idx.name}</p>
                      <p className="text-[10px] text-zinc-500">{idx.country}</p>
                    </div>
                  </div>

                  {/* Region */}
                  <div className="col-span-2 hidden md:flex items-center">
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: `${regionColor}18`, color: regionColor }}
                    >
                      {idx.region}
                    </span>
                  </div>

                  {/* Price */}
                  <div className="col-span-3 md:col-span-3">
                    <p className="text-xs font-mono text-zinc-300">{fmtPrice(idx.price)}</p>
                    <p className="text-[9px] text-zinc-600 md:hidden">{idx.currency}</p>
                  </div>

                  {/* Change */}
                  <div className="col-span-3 flex items-center gap-1 justify-end md:justify-start">
                    {isUp
                      ? <TrendingUp size={11} className="text-emerald-400 shrink-0" />
                      : <TrendingDown size={11} className="text-red-400 shrink-0" />}
                    <span className={`text-xs font-semibold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                      {isUp ? "+" : ""}{idx.changePct.toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-8 text-zinc-600 text-sm">
              Nenhum {"índice"} encontrado
            </div>
          )}
        </div>

        {/* ── Best / Worst bars ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChangeBar
            title="Maiores Altas (dia)"
            indices={data.indices
              .filter(i => i.changePct > 0 && i.symbol !== "^VIX")
              .sort((a, b) => b.changePct - a.changePct)
              .slice(0, 8)}
            color="#4ade80"
          />
          <ChangeBar
            title="Maiores Quedas (dia)"
            indices={data.indices
              .filter(i => i.changePct < 0 && i.symbol !== "^VIX")
              .sort((a, b) => a.changePct - b.changePct)
              .slice(0, 8)}
            color="#f87171"
          />
        </div>

        {/* ── Footer ── */}
        <p className="text-center text-[10px] text-zinc-700 pt-4">
          {`Cotações via Yahoo Finance · Dados com atraso de ~15 min para algumas bolsas`}
        </p>
      </div>
    </div>
  );
}

// ── Lightweight Charts (candlestick + volume + indicators) ──────────────

interface OhlcPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type Indicator = "sma20" | "sma50" | "ema20" | "bb" | "vol";
type TimeRange = "1M" | "3M" | "6M" | "1A" | "2A" | "5A";

const TIME_RANGES: { key: TimeRange; label: string; range: string; interval: string }[] = [
  { key: "1M", label: "1M", range: "1mo", interval: "1d" },
  { key: "3M", label: "3M", range: "3mo", interval: "1d" },
  { key: "6M", label: "6M", range: "6mo", interval: "1d" },
  { key: "1A", label: "1A", range: "1y", interval: "1d" },
  { key: "2A", label: "2A", range: "2y", interval: "1wk" },
  { key: "5A", label: "5A", range: "5y", interval: "1wk" },
];

const INDICATORS: { key: Indicator; label: string }[] = [
  { key: "sma20", label: "SMA 20" },
  { key: "sma50", label: "SMA 50" },
  { key: "ema20", label: "EMA 20" },
  { key: "bb", label: "Bollinger" },
  { key: "vol", label: "Volume" },
];

function computeSMA(data: OhlcPoint[], period: number): { time: string; value: number }[] {
  const result: { time: string; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    result.push({ time: data[i].time, value: sum / period });
  }
  return result;
}

function computeEMA(data: OhlcPoint[], period: number): { time: string; value: number }[] {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i].close;
  let ema = sum / period;
  const result: { time: string; value: number }[] = [{ time: data[period - 1].time, value: ema }];
  for (let i = period; i < data.length; i++) {
    ema = data[i].close * k + ema * (1 - k);
    result.push({ time: data[i].time, value: ema });
  }
  return result;
}

function computeBollinger(data: OhlcPoint[], period = 20, mult = 2) {
  const upper: { time: string; value: number }[] = [];
  const lower: { time: string; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    const mean = sum / period;
    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) sqSum += (data[j].close - mean) ** 2;
    const std = Math.sqrt(sqSum / period);
    upper.push({ time: data[i].time, value: mean + mult * std });
    lower.push({ time: data[i].time, value: mean - mult * std });
  }
  return { upper, lower };
}

function CandlestickChart({ symbol, height }: { symbol: string; height: number }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof import("lightweight-charts").createChart> | null>(null);
  const [ohlcData, setOhlcData] = useState<OhlcPoint[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("1A");
  const [activeIndicators, setActiveIndicators] = useState<Set<Indicator>>(new Set(["vol"]));
  const [crosshairData, setCrosshairData] = useState<OhlcPoint | null>(null);

  const toggleIndicator = useCallback((ind: Indicator) => {
    setActiveIndicators(prev => {
      const next = new Set(prev);
      if (next.has(ind)) next.delete(ind); else next.add(ind);
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    const cfg = TIME_RANGES.find(r => r.key === timeRange) ?? TIME_RANGES[3];
    fetch(`/api/bolsas/ohlc?symbol=${encodeURIComponent(symbol)}&range=${cfg.range}&interval=${cfg.interval}`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d.data) setOhlcData(d.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDataLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, timeRange]);

  useEffect(() => {
    if (!chartContainerRef.current || ohlcData.length === 0) return;

    let disposed = false;
    let chart: ReturnType<typeof import("lightweight-charts").createChart> | null = null;

    import("lightweight-charts").then((lc) => {
      if (disposed || !chartContainerRef.current) return;

      chartContainerRef.current.innerHTML = "";

      chart = lc.createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height,
        layout: {
          background: { type: lc.ColorType.Solid, color: "transparent" },
          textColor: "#71717a",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.03)" },
          horzLines: { color: "rgba(255,255,255,0.03)" },
        },
        crosshair: {
          mode: lc.CrosshairMode.Normal,
          vertLine: { color: "rgba(255,255,255,0.15)", style: lc.LineStyle.Dashed, width: 1, labelBackgroundColor: "#2a2a3e" },
          horzLine: { color: "rgba(255,255,255,0.15)", style: lc.LineStyle.Dashed, width: 1, labelBackgroundColor: "#2a2a3e" },
        },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.06)",
          scaleMargins: { top: 0.1, bottom: activeIndicators.has("vol") ? 0.25 : 0.05 },
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.06)",
          timeVisible: false,
        },
        handleScroll: { vertTouchDrag: false },
      });
      chartRef.current = chart;

      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderDownColor: "#ef4444",
        borderUpColor: "#22c55e",
        wickDownColor: "#ef444480",
        wickUpColor: "#22c55e80",
      });
      candleSeries.setData(ohlcData.map(d => ({
        time: d.time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      })));

      if (activeIndicators.has("vol")) {
        const volSeries = chart.addSeries(lc.HistogramSeries, {
          priceFormat: { type: "volume" },
          priceScaleId: "vol",
        });
        chart.priceScale("vol").applyOptions({
          scaleMargins: { top: 0.8, bottom: 0 },
        });
        volSeries.setData(ohlcData.map(d => ({
          time: d.time,
          value: d.volume,
          color: d.close >= d.open ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)",
        })));
      }

      const lineOpts = (color: string, dashed = false) => ({
        color,
        lineWidth: 1 as const,
        priceLineVisible: false,
        lastValueVisible: false,
        ...(dashed ? { lineStyle: lc.LineStyle.Dashed } : {}),
      });

      if (activeIndicators.has("sma20")) {
        const s = chart.addSeries(lc.LineSeries, lineOpts("#3b82f6"));
        s.setData(computeSMA(ohlcData, 20));
      }
      if (activeIndicators.has("sma50")) {
        const s = chart.addSeries(lc.LineSeries, lineOpts("#f59e0b"));
        s.setData(computeSMA(ohlcData, 50));
      }
      if (activeIndicators.has("ema20")) {
        const s = chart.addSeries(lc.LineSeries, lineOpts("#a855f7"));
        s.setData(computeEMA(ohlcData, 20));
      }
      if (activeIndicators.has("bb")) {
        const bb = computeBollinger(ohlcData);
        const upperS = chart.addSeries(lc.LineSeries, lineOpts("rgba(6,182,212,0.5)", true));
        const lowerS = chart.addSeries(lc.LineSeries, lineOpts("rgba(6,182,212,0.5)", true));
        upperS.setData(bb.upper);
        lowerS.setData(bb.lower);
      }

      chart.subscribeCrosshairMove((param) => {
        if (!param.time) { setCrosshairData(null); return; }
        const timeStr = String(param.time);
        const pt = ohlcData.find(d => d.time === timeStr);
        setCrosshairData(pt ?? null);
      });

      chart.timeScale().fitContent();

      const el = chartContainerRef.current;
      const resizeObserver = new ResizeObserver(entries => {
        if (chart && entries[0]) {
          chart.applyOptions({ width: entries[0].contentRect.width });
        }
      });
      resizeObserver.observe(el);

      return () => { resizeObserver.disconnect(); };
    });

    return () => {
      disposed = true;
      if (chart) { chart.remove(); chartRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ohlcData, height, activeIndicators]);

  const last = ohlcData.length > 0 ? ohlcData[ohlcData.length - 1] : null;
  const display = crosshairData ?? last;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 flex-wrap border-b border-white/[0.04]">
        {/* Time ranges */}
        <div className="flex gap-1">
          {TIME_RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setTimeRange(r.key)}
              className="text-[10px] px-2 py-1 rounded transition-colors"
              style={{
                background: timeRange === r.key ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.04)",
                color: timeRange === r.key ? "#3b82f6" : "#71717a",
                border: `1px solid ${timeRange === r.key ? "rgba(59,130,246,0.3)" : "transparent"}`,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Indicators */}
        <div className="flex gap-1 flex-wrap">
          {INDICATORS.map(ind => {
            const active = activeIndicators.has(ind.key);
            const colors: Record<Indicator, string> = {
              sma20: "#3b82f6", sma50: "#f59e0b", ema20: "#a855f7", bb: "#06b6d4", vol: "#71717a",
            };
            const c = colors[ind.key];
            return (
              <button
                key={ind.key}
                onClick={() => toggleIndicator(ind.key)}
                className="text-[9px] px-2 py-0.5 rounded-full transition-all"
                style={{
                  background: active ? `${c}20` : "rgba(255,255,255,0.03)",
                  color: active ? c : "#52525b",
                  border: `1px solid ${active ? `${c}40` : "rgba(255,255,255,0.05)"}`,
                }}
              >
                {ind.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* OHLC values bar */}
      {display && (
        <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] border-b border-white/[0.04] flex-wrap">
          <span className="text-zinc-500">O <span className="text-zinc-300 font-mono">{fmtPrice(display.open)}</span></span>
          <span className="text-zinc-500">H <span className="text-emerald-400 font-mono">{fmtPrice(display.high)}</span></span>
          <span className="text-zinc-500">L <span className="text-red-400 font-mono">{fmtPrice(display.low)}</span></span>
          <span className="text-zinc-500">C <span className={`font-mono font-semibold ${display.close >= display.open ? "text-emerald-400" : "text-red-400"}`}>{fmtPrice(display.close)}</span></span>
          {display.volume > 0 && (
            <span className="text-zinc-600">Vol <span className="text-zinc-400 font-mono">
              {display.volume >= 1e9 ? `${(display.volume / 1e9).toFixed(1)}B` :
               display.volume >= 1e6 ? `${(display.volume / 1e6).toFixed(1)}M` :
               display.volume >= 1e3 ? `${(display.volume / 1e3).toFixed(0)}K` :
               display.volume.toFixed(0)}
            </span></span>
          )}
        </div>
      )}

      {/* Chart */}
      {dataLoading ? (
        <div className="flex items-center justify-center text-[11px] text-zinc-500 animate-pulse" style={{ height }}>
          Carregando dados...
        </div>
      ) : ohlcData.length === 0 ? (
        <div className="flex items-center justify-center text-[11px] text-zinc-600" style={{ height }}>
          Dados indisponíveis para este índice
        </div>
      ) : (
        <div ref={chartContainerRef} style={{ height }} />
      )}

      {/* Legend */}
      {activeIndicators.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-1.5 flex-wrap">
          {activeIndicators.has("sma20") && <span className="text-[9px] flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ background: "#3b82f6" }} />SMA 20</span>}
          {activeIndicators.has("sma50") && <span className="text-[9px] flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ background: "#f59e0b" }} />SMA 50</span>}
          {activeIndicators.has("ema20") && <span className="text-[9px] flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ background: "#a855f7" }} />EMA 20</span>}
          {activeIndicators.has("bb") && <span className="text-[9px] flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ background: "#06b6d4" }} />Bollinger</span>}
        </div>
      )}
    </div>
  );
}

// ── Index Thermometer (dynamic — updates when user selects an index) ─────

function IndexThermometer({ index, vix, periods, breadth, historyLoading, isDefault, expanded, onToggleExpand }: {
  index: IndexData;
  vix: IndexData | null;
  periods: Record<PeriodKey, number | null> | null;
  breadth: { up: number; down: number; total: number };
  historyLoading: boolean;
  isDefault: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const isUp = index.changePct >= 0;

  const tone = useMemo(() => {
    if (index.changePct > 0.5) return { color: "#34d399", bg: "rgba(16,185,129,0.12)" };
    if (index.changePct < -0.5) return { color: "#f87171", bg: "rgba(239,68,68,0.12)" };
    return { color: "#fbbf24", bg: "rgba(245,158,11,0.12)" };
  }, [index.changePct]);

  return (
    <div
      className="rounded-2xl p-4 md:p-6 transition-all duration-300"
      style={{
        background: "rgba(13,14,20,0.8)",
        border: `1px solid ${tone.color}25`,
        boxShadow: `0 8px 32px ${tone.color}08`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Activity size={16} style={{ color: tone.color }} />
        <h2 className="text-sm font-semibold text-zinc-200">
          {isDefault ? "Panorama de Mercado" : (
            <span className="flex items-center gap-2">
              <span>{index.flag}</span>
              <span>{index.name}</span>
              <span className="text-[10px] text-zinc-500 font-normal">({index.country})</span>
            </span>
          )}
        </h2>
        <span className="text-[10px] text-zinc-600 ml-auto">
          {breadth.up}/{breadth.total} bolsas em alta
        </span>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-4">
        {/* Col 1: Index + VIX key metrics */}
        <div className="lg:col-span-4 flex flex-col justify-center gap-4">
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{index.name}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-zinc-100">{fmtPrice(index.price)}</span>
              <span className={`text-sm font-semibold flex items-center gap-1 ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                {isUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {isUp ? "+" : ""}{index.changePct.toFixed(2)}%
              </span>
            </div>
            <p className="text-[10px] text-zinc-600 mt-0.5">{index.currency}</p>
          </div>
          {vix && isDefault && (
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">VIX (Medo &amp; Ganância)</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-xl font-bold text-zinc-100">{vix.price.toFixed(2)}</span>
                <span className={`text-xs font-semibold ${vix.changePct >= 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {vix.changePct >= 0 ? "+" : ""}{vix.changePct.toFixed(2)}%
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  vix.price < 15 ? "bg-emerald-500/15 text-emerald-400" :
                  vix.price < 20 ? "bg-emerald-500/10 text-emerald-300" :
                  vix.price < 25 ? "bg-yellow-500/15 text-yellow-400" :
                  vix.price < 30 ? "bg-orange-500/15 text-orange-400" :
                  "bg-red-500/15 text-red-400"
                }`}>
                  {vix.price < 15 ? "Calmo" :
                   vix.price < 20 ? "Baixo" :
                   vix.price < 25 ? "Moderado" :
                   vix.price < 30 ? "Elevado" :
                   "Pânico"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Col 2: Periods */}
        <div className="lg:col-span-8 flex flex-col justify-center">
          {historyLoading ? (
            <div className="text-[11px] text-zinc-500 text-center animate-pulse">
              Carregando períodos...
            </div>
          ) : periods ? (
            <>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">{index.name} — Períodos</p>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {ALL_PERIODS.map(p => {
                  const v = periods[p];
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
            </>
          ) : (
            <div className="text-[11px] text-zinc-600 text-center">
              Dados de períodos indisponíveis
            </div>
          )}
        </div>
      </div>

      {/* Candlestick Chart */}
      <div className="rounded-xl overflow-hidden" style={{ background: "rgba(5,7,14,0.5)", border: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
          <span className="text-[10px] text-zinc-500 flex items-center gap-1.5">
            <BarChart3 size={11} />
            {index.flag} {index.name}
          </span>
          <button
            onClick={onToggleExpand}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
          >
            <Maximize size={10} />
            {expanded ? "Recolher" : "Expandir"}
          </button>
        </div>
        <CandlestickChart
          symbol={index.symbol}
          height={expanded ? 600 : 400}
        />
      </div>
    </div>
  );
}

// ── Helpers & Sub-components ──────────────────────────────────────────────

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
      <p className="text-sm font-bold text-zinc-100 truncate">{value}</p>
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

function ChangeBar({ title, indices, color }: {
  title: string; indices: IndexData[]; color: string;
}) {
  if (indices.length === 0) return null;
  const maxAbs = Math.max(...indices.map(x => Math.abs(x.changePct)), 0.01);
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
        {indices.map(idx => {
          const width = (Math.abs(idx.changePct) / maxAbs) * 100;
          return (
            <div key={idx.symbol} className="flex items-center gap-2">
              <span className="text-sm w-6">{idx.flag}</span>
              <span className="text-[11px] font-semibold text-zinc-300 w-28 truncate">{idx.name}</span>
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
                {idx.changePct >= 0 ? "+" : ""}{idx.changePct.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

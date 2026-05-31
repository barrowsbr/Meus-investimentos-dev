"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, Globe, TrendingUp, TrendingDown, Search,
  ArrowUpDown, DollarSign, Filter,
} from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

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

interface MoedasResponse {
  currencies: CurrencyData[];
  usdBrl: number;
  lastUpdate: string;
  error?: string;
}

// ── Simplified world map SVG paths (continents) ──────────────────────────────

const WORLD_PATHS = [
  // North America
  "M 50,95 L 55,80 60,75 70,65 90,60 110,55 120,58 135,55 145,60 155,72 160,80 155,90 145,105 140,115 135,120 120,125 115,130 110,130 100,125 90,120 80,115 70,110 60,105 Z",
  // South America
  "M 115,130 L 120,135 125,140 130,150 135,160 140,175 142,190 140,200 135,210 128,218 120,220 115,215 112,205 110,195 108,185 105,170 108,155 110,145 112,135 Z",
  // Europe
  "M 185,55 L 195,52 210,50 225,52 230,58 235,55 240,58 235,65 230,70 225,72 218,75 210,78 205,75 200,72 195,68 190,65 185,60 Z",
  // Africa
  "M 190,80 L 200,78 210,80 220,82 225,90 228,100 230,115 228,130 225,145 220,155 215,162 210,168 200,170 195,165 190,155 185,140 183,125 182,110 183,100 185,90 Z",
  // Asia
  "M 235,50 L 250,45 270,42 290,40 310,42 325,48 340,52 350,55 355,62 350,68 345,75 340,80 330,82 320,85 310,88 295,85 285,80 275,78 265,75 255,72 245,70 240,65 238,58 Z",
  // Middle East
  "M 225,72 L 235,68 245,72 255,75 250,82 245,88 240,85 235,82 230,78 Z",
  // Oceania
  "M 320,155 L 335,150 350,152 360,158 365,165 360,175 350,180 338,178 328,172 322,165 Z",
  // Australia
  "M 310,145 L 320,140 332,142 340,148 345,155 342,165 335,172 325,175 315,170 308,162 305,155 Z",
  // Japan/Korea islands
  "M 340,55 L 345,52 348,55 350,62 348,65 345,63 342,58 Z",
  // UK/Ireland
  "M 188,52 L 192,50 195,52 194,56 190,55 Z",
  // New Zealand
  "M 365,180 L 368,177 370,180 369,185 366,184 Z",
  // Indonesia/SE Asia islands
  "M 300,100 L 308,98 315,100 325,105 330,110 325,115 315,112 305,108 300,105 Z",
];

// Equirectangular projection: lng → x, lat → y
function project(lat: number, lng: number): [number, number] {
  const x = ((lng + 180) / 360) * 400 + 10;
  const y = ((90 - lat) / 180) * 240 + 10;
  return [x, y];
}

const REGION_COLORS: Record<string, string> = {
  Americas: "#3b82f6",
  Europe: "#8b5cf6",
  Asia: "#f59e0b",
  "Middle East": "#ef4444",
  Africa: "#10b981",
  Oceania: "#06b6d4",
};

type SortKey = "code" | "rate" | "changePct" | "region";

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
    const avgChange = cs.reduce((s, c) => s + c.changePct, 0) / cs.length;
    return { strongest, weakest, avgChange };
  }, [data]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "code" || key === "region"); }
  };

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

        {/* ── World Map ── */}
        <div
          className="rounded-2xl p-4 md:p-6 overflow-hidden"
          style={{
            background: "rgba(13,14,20,0.8)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Globe size={16} className="text-cyan-400" />
              Mapa de Cotações
            </h2>
            <div className="flex gap-2 flex-wrap">
              {regions.map(r => (
                <button
                  key={r}
                  onClick={() => setSelectedRegion(selectedRegion === r ? null : r)}
                  className="text-[10px] px-2 py-0.5 rounded-full transition-all"
                  style={{
                    background: selectedRegion === r
                      ? (REGION_COLORS[r] ?? "#888") + "30"
                      : "rgba(255,255,255,0.05)",
                    border: `1px solid ${selectedRegion === r ? (REGION_COLORS[r] ?? "#888") + "60" : "rgba(255,255,255,0.08)"}`,
                    color: selectedRegion === r ? REGION_COLORS[r] ?? "#ddd" : "#888",
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="relative w-full" style={{ paddingBottom: "60%" }}>
            <svg
              viewBox="0 0 420 260"
              className="absolute inset-0 w-full h-full"
              style={{ filter: "drop-shadow(0 0 20px rgba(6,182,212,0.05))" }}
            >
              {/* Grid lines */}
              {[...Array(7)].map((_, i) => (
                <line
                  key={`h${i}`}
                  x1="10" y1={10 + i * 40}
                  x2="410" y2={10 + i * 40}
                  stroke="rgba(255,255,255,0.03)"
                  strokeWidth="0.5"
                />
              ))}
              {[...Array(9)].map((_, i) => (
                <line
                  key={`v${i}`}
                  x1={10 + i * 50} y1="10"
                  x2={10 + i * 50} y2="250"
                  stroke="rgba(255,255,255,0.03)"
                  strokeWidth="0.5"
                />
              ))}

              {/* Continent shapes */}
              {WORLD_PATHS.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="rgba(255,255,255,0.03)"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="0.5"
                />
              ))}

              {/* Currency markers */}
              {data.currencies.map(c => {
                const [cx, cy] = project(c.lat, c.lng);
                const regionColor = REGION_COLORS[c.region] ?? "#888";
                const isHovered = hoveredCurrency === c.code;
                const isSelected = selectedCurrency?.code === c.code;
                const dimmed = selectedRegion && c.region !== selectedRegion;
                const changeColor = c.changePct >= 0 ? "#4ade80" : "#f87171";
                const pulseSize = Math.min(Math.abs(c.changePct) * 3 + 4, 12);

                return (
                  <g
                    key={c.code}
                    className="cursor-pointer transition-all duration-200"
                    style={{ opacity: dimmed ? 0.15 : 1 }}
                    onMouseEnter={() => setHoveredCurrency(c.code)}
                    onMouseLeave={() => setHoveredCurrency(null)}
                    onClick={() => setSelectedCurrency(isSelected ? null : c)}
                  >
                    {/* Pulse ring */}
                    <circle
                      cx={cx} cy={cy} r={pulseSize}
                      fill="none"
                      stroke={changeColor}
                      strokeWidth="0.5"
                      opacity={isHovered || isSelected ? 0.6 : 0.15}
                    >
                      {(isHovered || isSelected) && (
                        <animate
                          attributeName="r"
                          from={pulseSize}
                          to={pulseSize + 6}
                          dur="1.5s"
                          repeatCount="indefinite"
                        />
                      )}
                      {(isHovered || isSelected) && (
                        <animate
                          attributeName="opacity"
                          from="0.6"
                          to="0"
                          dur="1.5s"
                          repeatCount="indefinite"
                        />
                      )}
                    </circle>

                    {/* Main dot */}
                    <circle
                      cx={cx} cy={cy}
                      r={isHovered || isSelected ? 5 : 3.5}
                      fill={regionColor}
                      stroke={isHovered || isSelected ? "#fff" : regionColor}
                      strokeWidth={isHovered || isSelected ? 1.5 : 0.5}
                      opacity={0.9}
                    />

                    {/* Change indicator dot */}
                    <circle
                      cx={cx + 4} cy={cy - 4}
                      r={1.5}
                      fill={changeColor}
                    />

                    {/* Label (always visible for non-dimmed) */}
                    {!dimmed && (
                      <text
                        x={cx} y={cy - 7}
                        textAnchor="middle"
                        fill={isHovered || isSelected ? "#fff" : "rgba(255,255,255,0.5)"}
                        fontSize={isHovered || isSelected ? "7" : "5.5"}
                        fontWeight={isHovered || isSelected ? "600" : "400"}
                        fontFamily="system-ui, sans-serif"
                      >
                        {c.code}
                      </text>
                    )}

                    {/* Tooltip on hover */}
                    {(isHovered || isSelected) && (
                      <g>
                        <rect
                          x={cx - 40} y={cy + 8}
                          width="80" height="34"
                          rx="4"
                          fill="rgba(0,0,0,0.85)"
                          stroke="rgba(255,255,255,0.15)"
                          strokeWidth="0.5"
                        />
                        <text x={cx} y={cy + 20} textAnchor="middle" fill="#fff" fontSize="6.5" fontWeight="600" fontFamily="system-ui">
                          {c.flag} {c.name}
                        </text>
                        <text x={cx - 18} y={cy + 30} textAnchor="start" fill="#94a3b8" fontSize="5.5" fontFamily="system-ui">
                          1 USD = {c.rate.toFixed(4)}
                        </text>
                        <text x={cx + 18} y={cy + 30} textAnchor="end" fill={changeColor} fontSize="5.5" fontWeight="600" fontFamily="system-ui">
                          {c.changePct >= 0 ? "+" : ""}{c.changePct.toFixed(2)}%
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Equator line */}
              <line
                x1="10" y1={10 + (90 / 180) * 240}
                x2="410" y2={10 + (90 / 180) * 240}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="0.5"
                strokeDasharray="4 4"
              />
            </svg>
          </div>

          {/* Region legend */}
          <div className="flex items-center justify-center gap-4 mt-3 flex-wrap">
            {Object.entries(REGION_COLORS).map(([region, color]) => (
              <div key={region} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: color }} />
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
                <p className="text-lg font-bold text-zinc-100">
                  {selectedCurrency.rate < 1
                    ? selectedCurrency.rate.toFixed(6)
                    : selectedCurrency.rate < 100
                      ? selectedCurrency.rate.toFixed(4)
                      : selectedCurrency.rate.toFixed(2)}
                </p>
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
                    <p className="text-xs font-mono text-zinc-300">
                      {c.rate < 1
                        ? c.rate.toFixed(6)
                        : c.rate < 100
                          ? c.rate.toFixed(4)
                          : c.rate.toFixed(2)}
                    </p>
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
                      R$ {vsBrl < 0.01
                        ? vsBrl.toFixed(6)
                        : vsBrl < 1
                          ? vsBrl.toFixed(4)
                          : vsBrl.toFixed(2)}
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
          <BarChart_
            title="Mais Fortes vs USD (dia)"
            currencies={data.currencies
              .filter(c => c.changePct < 0)
              .sort((a, b) => a.changePct - b.changePct)
              .slice(0, 8)}
            color="#4ade80"
          />
          <BarChart_
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
          Dados: Open Exchange Rates API · Cotações em relação ao dólar americano (USD)
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
      className={`col-span-${colSpan} text-left flex items-center gap-1 hover:text-zinc-400 transition-colors`}
      style={{ gridColumn: `span ${colSpan}` }}
      onClick={() => onClick(sk)}
    >
      {label}
      {active && <ArrowUpDown size={9} className={asc ? "rotate-180" : ""} />}
    </button>
  );
}

function BarChart_({ title, currencies, color }: {
  title: string; currencies: CurrencyData[]; color: string;
}) {
  if (currencies.length === 0) return null;
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
          const maxAbs = Math.max(...currencies.map(x => Math.abs(x.changePct)), 0.01);
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

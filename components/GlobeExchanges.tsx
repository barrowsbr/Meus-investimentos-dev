"use client";

import React, { useState, useEffect, useCallback, useRef, memo } from "react";
import {
  ComposableMap, Geographies, Geography, Marker,
} from "react-simple-maps";
import { Crosshair, Flame, RotateCcw } from "lucide-react";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// ── Stock Exchanges ─────────────────────────────────────────────────────────

interface Exchange {
  name: string;
  shortName: string;
  city: string;
  country: string;
  coords: [number, number]; // [lng, lat]
  region: string;
}

const EXCHANGES: Exchange[] = [
  // Americas
  { name: "New York Stock Exchange", shortName: "NYSE", city: "New York", country: "EUA", coords: [-74.0, 40.7], region: "americas" },
  { name: "NASDAQ", shortName: "NASDAQ", city: "New York", country: "EUA", coords: [-73.98, 40.75], region: "americas" },
  { name: "B3 — Brasil Bolsa Balcão", shortName: "B3", city: "São Paulo", country: "Brasil", coords: [-46.6, -23.5], region: "americas" },
  { name: "Toronto Stock Exchange", shortName: "TSX", city: "Toronto", country: "Canadá", coords: [-79.4, 43.65], region: "americas" },
  { name: "Bolsa Mexicana de Valores", shortName: "BMV", city: "Cidade do México", country: "México", coords: [-99.13, 19.43], region: "americas" },
  { name: "Bolsa de Santiago", shortName: "BCS", city: "Santiago", country: "Chile", coords: [-70.65, -33.45], region: "americas" },
  { name: "Bolsa de Buenos Aires", shortName: "BYMA", city: "Buenos Aires", country: "Argentina", coords: [-58.38, -34.6], region: "americas" },
  { name: "Bolsa de Colombia", shortName: "BVC", city: "Bogotá", country: "Colômbia", coords: [-74.07, 4.71], region: "americas" },

  // Europe
  { name: "London Stock Exchange", shortName: "LSE", city: "Londres", country: "Reino Unido", coords: [-0.09, 51.51], region: "europe" },
  { name: "Euronext", shortName: "ENX", city: "Paris", country: "França", coords: [2.35, 48.86], region: "europe" },
  { name: "Deutsche Börse", shortName: "XETRA", city: "Frankfurt", country: "Alemanha", coords: [8.68, 50.11], region: "europe" },
  { name: "Swiss Exchange", shortName: "SIX", city: "Zurique", country: "Suíça", coords: [8.54, 47.37], region: "europe" },
  { name: "Borsa Italiana", shortName: "MIL", city: "Milão", country: "Itália", coords: [9.19, 45.46], region: "europe" },
  { name: "Bolsa de Madrid", shortName: "BME", city: "Madrid", country: "Espanha", coords: [-3.70, 40.42], region: "europe" },
  { name: "Bolsa de Valores de Lisboa", shortName: "LISB", city: "Lisboa", country: "Portugal", coords: [-9.14, 38.74], region: "europe" },
  { name: "OMX Nordic Exchange", shortName: "OMX", city: "Estocolmo", country: "Suécia", coords: [18.07, 59.33], region: "europe" },
  { name: "Moscow Exchange", shortName: "MOEX", city: "Moscou", country: "Rússia", coords: [37.62, 55.75], region: "europe" },
  { name: "Warsaw Stock Exchange", shortName: "GPW", city: "Varsóvia", country: "Polônia", coords: [21.01, 52.23], region: "europe" },

  // Asia-Pacific
  { name: "Tokyo Stock Exchange", shortName: "TSE", city: "Tóquio", country: "Japão", coords: [139.69, 35.68], region: "asia" },
  { name: "Shanghai Stock Exchange", shortName: "SSE", city: "Xangai", country: "China", coords: [121.47, 31.23], region: "asia" },
  { name: "Shenzhen Stock Exchange", shortName: "SZSE", city: "Shenzhen", country: "China", coords: [114.06, 22.54], region: "asia" },
  { name: "Hong Kong Stock Exchange", shortName: "HKEX", city: "Hong Kong", country: "China", coords: [114.17, 22.28], region: "asia" },
  { name: "Korea Exchange", shortName: "KRX", city: "Seul", country: "Coreia do Sul", coords: [126.98, 37.57], region: "asia" },
  { name: "Taiwan Stock Exchange", shortName: "TWSE", city: "Taipei", country: "Taiwan", coords: [121.56, 25.03], region: "asia" },
  { name: "Singapore Exchange", shortName: "SGX", city: "Singapura", country: "Singapura", coords: [103.85, 1.35], region: "asia" },
  { name: "BSE India", shortName: "BSE", city: "Mumbai", country: "Índia", coords: [72.88, 19.08], region: "asia" },
  { name: "National Stock Exchange", shortName: "NSE", city: "Mumbai", country: "Índia", coords: [72.85, 18.95], region: "asia" },
  { name: "Australian Securities Exchange", shortName: "ASX", city: "Sydney", country: "Austrália", coords: [151.21, -33.87], region: "asia" },
  { name: "NZX Limited", shortName: "NZX", city: "Wellington", country: "Nova Zelândia", coords: [174.78, -41.29], region: "asia" },
  { name: "Bursa Malaysia", shortName: "KLSE", city: "Kuala Lumpur", country: "Malásia", coords: [101.69, 3.14], region: "asia" },
  { name: "Stock Exchange of Thailand", shortName: "SET", city: "Bangkok", country: "Tailândia", coords: [100.5, 13.76], region: "asia" },
  { name: "Jakarta Stock Exchange", shortName: "IDX", city: "Jacarta", country: "Indonésia", coords: [106.85, -6.21], region: "asia" },
  { name: "Philippine Stock Exchange", shortName: "PSE", city: "Manila", country: "Filipinas", coords: [120.98, 14.6], region: "asia" },
  { name: "Ho Chi Minh Stock Exchange", shortName: "HOSE", city: "Ho Chi Minh", country: "Vietnã", coords: [106.7, 10.78], region: "asia" },

  // Middle East & Africa
  { name: "Saudi Exchange (Tadawul)", shortName: "TASI", city: "Riad", country: "Arábia Saudita", coords: [46.68, 24.71], region: "mena" },
  { name: "Tel Aviv Stock Exchange", shortName: "TASE", city: "Tel Aviv", country: "Israel", coords: [34.78, 32.08], region: "mena" },
  { name: "Dubai Financial Market", shortName: "DFM", city: "Dubai", country: "Emirados", coords: [55.27, 25.2], region: "mena" },
  { name: "Abu Dhabi Securities Exchange", shortName: "ADX", city: "Abu Dhabi", country: "Emirados", coords: [54.37, 24.45], region: "mena" },
  { name: "Qatar Stock Exchange", shortName: "QSE", city: "Doha", country: "Catar", coords: [51.53, 25.29], region: "mena" },
  { name: "Istanbul Stock Exchange", shortName: "BIST", city: "Istambul", country: "Turquia", coords: [29.0, 41.01], region: "mena" },
  { name: "Johannesburg Stock Exchange", shortName: "JSE", city: "Joanesburgo", country: "África do Sul", coords: [28.04, -26.2], region: "mena" },
  { name: "Egyptian Exchange", shortName: "EGX", city: "Cairo", country: "Egito", coords: [31.24, 30.04], region: "mena" },
  { name: "Casablanca Stock Exchange", shortName: "CSE", city: "Casablanca", country: "Marrocos", coords: [-7.59, 33.59], region: "mena" },
  { name: "Nairobi Securities Exchange", shortName: "NSE", city: "Nairóbi", country: "Quênia", coords: [36.82, -1.29], region: "mena" },
  { name: "Nigerian Exchange", shortName: "NGX", city: "Lagos", country: "Nigéria", coords: [3.39, 6.45], region: "mena" },
];

// ── Conflicts/Wars ──────────────────────────────────────────────────────────

interface Conflict {
  name: string;
  coords: [number, number];
  intensity: "high" | "medium" | "low";
}

const CONFLICTS: Conflict[] = [
  { name: "Ucrânia–Rússia", coords: [35.0, 48.5], intensity: "high" },
  { name: "Israel–Gaza", coords: [34.4, 31.4], intensity: "high" },
  { name: "Sudão", coords: [32.5, 15.6], intensity: "high" },
  { name: "Myanmar", coords: [96.2, 19.8], intensity: "medium" },
  { name: "Síria", coords: [38.0, 35.0], intensity: "medium" },
  { name: "Iêmen (Houthis)", coords: [44.2, 15.4], intensity: "medium" },
  { name: "RD Congo", coords: [28.8, -2.5], intensity: "medium" },
  { name: "Somália", coords: [45.3, 5.15], intensity: "low" },
  { name: "Sahel (Mali/Burkina)", coords: [-1.5, 14.0], intensity: "low" },
  { name: "Haiti", coords: [-72.3, 18.5], intensity: "low" },
];

const REGION_COLORS: Record<string, string> = {
  americas: "#34d399",
  europe: "#60a5fa",
  asia: "#f59e0b",
  mena: "#ec4899",
};

const INTENSITY_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f97316",
  low: "#eab308",
};

// ── Globe Component ─────────────────────────────────────────────────────────

const GlobeExchanges = memo(function GlobeExchanges() {
  const [rotation, setRotation] = useState<[number, number]>([-40, -15]);
  const [hoveredExchange, setHoveredExchange] = useState<string | null>(null);
  const [hoveredConflict, setHoveredConflict] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startRot: [number, number] } | null>(null);
  const autoRotateRef = useRef<number>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-rotate when not interacting
  useEffect(() => {
    if (isDragging) return;
    autoRotateRef.current = window.setInterval(() => {
      setRotation(([lng, lat]) => [(lng - 0.15) % 360, lat]);
    }, 50);
    return () => clearInterval(autoRotateRef.current);
  }, [isDragging]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startRot: [...rotation] as [number, number] };
  }, [rotation]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const sensitivity = 0.3;
    setRotation([
      dragRef.current.startRot[0] + dx * sensitivity,
      Math.max(-60, Math.min(60, dragRef.current.startRot[1] - dy * sensitivity)),
    ]);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragRef.current = null;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    setIsDragging(true);
    dragRef.current = { startX: t.clientX, startY: t.clientY, startRot: [...rotation] as [number, number] };
  }, [rotation]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || !dragRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - dragRef.current.startX;
    const dy = t.clientY - dragRef.current.startY;
    const sensitivity = 0.3;
    setRotation([
      dragRef.current.startRot[0] + dx * sensitivity,
      Math.max(-60, Math.min(60, dragRef.current.startRot[1] - dy * sensitivity)),
    ]);
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    dragRef.current = null;
  }, []);

  const handleReset = useCallback(() => {
    setRotation([-40, -15]);
  }, []);

  // Calculate globe size based on viewport
  const [dims, setDims] = useState({ w: 800, h: 800 });
  useEffect(() => {
    function update() {
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const size = Math.min(vw, vh) * 0.92;
      setDims({ w: Math.round(size), h: Math.round(size) });
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const globeScale = dims.w * 0.45;

  return (
    <div
      ref={containerRef}
      className="relative w-full flex flex-col items-center justify-center overflow-hidden select-none"
      style={{ height: "100vh", minHeight: 600 }}
    >
      {/* Ambient glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: dims.w * 1.1,
          height: dims.h * 1.1,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.06) 0%, rgba(212,165,116,0.03) 40%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      {/* Section header */}
      <div className="absolute top-4 left-0 right-0 flex items-center justify-center gap-3 z-20">
        <div className="h-px flex-1 max-w-[120px]" style={{ background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.3))" }} />
        <span className="text-[10px] font-extrabold tracking-[2.5px] uppercase text-indigo-400/70">Bolsas & Geopolítica</span>
        <div className="h-px flex-1 max-w-[120px]" style={{ background: "linear-gradient(90deg, rgba(99,102,241,0.3), transparent)" }} />
      </div>

      {/* Reset button */}
      <button
        onClick={handleReset}
        className="absolute top-12 right-4 z-20 w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
        style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}
        title="Resetar posição"
      >
        <RotateCcw size={14} className="text-zinc-400" />
      </button>

      {/* Globe */}
      <div
        className="relative cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <ComposableMap
          projection="geoOrthographic"
          projectionConfig={{
            rotate: [rotation[0], rotation[1], 0],
            scale: globeScale,
          }}
          width={dims.w}
          height={dims.h}
          style={{ width: dims.w, height: dims.h }}
        >
          {/* Ocean/sphere background */}
          <circle
            cx={dims.w / 2}
            cy={dims.h / 2}
            r={globeScale}
            fill="rgba(8,12,24,0.85)"
            stroke="rgba(99,102,241,0.12)"
            strokeWidth={1}
          />

          {/* Countries */}
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="rgba(255,255,255,0.05)"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth={0.3}
                  style={{
                    default: { outline: "none" },
                    hover: { fill: "rgba(255,255,255,0.09)", outline: "none" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {/* Conflict markers */}
          {CONFLICTS.map((c) => {
            const color = INTENSITY_COLORS[c.intensity];
            const isHovered = hoveredConflict === c.name;
            const r = c.intensity === "high" ? 6 : c.intensity === "medium" ? 4.5 : 3.5;
            return (
              <Marker
                key={c.name}
                coordinates={c.coords}
                onMouseEnter={() => setHoveredConflict(c.name)}
                onMouseLeave={() => setHoveredConflict(null)}
              >
                <g style={{ cursor: "default" }}>
                  {/* Pulse ring */}
                  <circle r={r * 2.5} fill="none" stroke={color} strokeWidth={0.6} opacity={0.3}>
                    <animate attributeName="r" from={String(r)} to={String(r * 3)} dur={c.intensity === "high" ? "1.5s" : "2.5s"} repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.5" to="0" dur={c.intensity === "high" ? "1.5s" : "2.5s"} repeatCount="indefinite" />
                  </circle>
                  <circle r={r} fill={color} opacity={0.7} />
                  <circle r={r * 0.4} fill="#fff" opacity={0.8} />
                  {isHovered && (
                    <>
                      <rect x={-50} y={-r - 20} width={100} height={16} rx={4} fill="rgba(0,0,0,0.85)" stroke={color} strokeWidth={0.5} />
                      <text x={0} y={-r - 9} textAnchor="middle" fontSize={8} fontWeight={700} fill="#fff">{c.name}</text>
                    </>
                  )}
                </g>
              </Marker>
            );
          })}

          {/* Exchange markers */}
          {EXCHANGES.map((ex) => {
            const color = REGION_COLORS[ex.region] ?? "#888";
            const isHovered = hoveredExchange === ex.shortName;
            return (
              <Marker
                key={ex.shortName + ex.city}
                coordinates={ex.coords}
                onMouseEnter={() => setHoveredExchange(ex.shortName)}
                onMouseLeave={() => setHoveredExchange(null)}
              >
                <g style={{ cursor: "pointer" }}>
                  {/* Glow */}
                  <circle r={isHovered ? 7 : 3.5} fill={color} opacity={isHovered ? 0.35 : 0.15}>
                    {!isHovered && (
                      <animate attributeName="opacity" values="0.15;0.3;0.15" dur="3s" repeatCount="indefinite" />
                    )}
                  </circle>
                  <circle r={isHovered ? 4 : 2} fill={color} opacity={0.9} />
                  {/* Label */}
                  {isHovered && (
                    <>
                      <rect x={-55} y={-35} width={110} height={28} rx={5} fill="rgba(0,0,0,0.9)" stroke={color} strokeWidth={0.6} />
                      <text x={0} y={-22} textAnchor="middle" fontSize={7.5} fontWeight={800} fill={color}>{ex.shortName}</text>
                      <text x={0} y={-13} textAnchor="middle" fontSize={6} fill="rgba(255,255,255,0.6)">{ex.city}, {ex.country}</text>
                    </>
                  )}
                </g>
              </Marker>
            );
          })}
        </ComposableMap>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-0 right-0 z-20 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4">
        {/* Exchange regions */}
        <div className="flex items-center gap-3">
          <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-wider">Bolsas:</span>
          {Object.entries(REGION_COLORS).map(([region, color]) => (
            <div key={region} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="text-[9px] text-zinc-500 capitalize">{region === "mena" ? "Oriente Médio & África" : region === "americas" ? "Américas" : region === "europe" ? "Europa" : "Ásia-Pacífico"}</span>
            </div>
          ))}
        </div>
        <div className="hidden sm:block h-3 w-px bg-zinc-800" />
        {/* Conflicts */}
        <div className="flex items-center gap-3">
          <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-wider">Conflitos:</span>
          {Object.entries(INTENSITY_COLORS).map(([level, color]) => (
            <div key={level} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="text-[9px] text-zinc-500 capitalize">{level === "high" ? "Alto" : level === "medium" ? "Médio" : "Baixo"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Counter badges */}
      <div className="absolute bottom-14 left-0 right-0 z-20 flex items-center justify-center gap-3">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(99,102,241,0.2)" }}>
          <Crosshair size={10} className="text-indigo-400" />
          <span className="text-[10px] font-bold text-zinc-300">{EXCHANGES.length}</span>
          <span className="text-[9px] text-zinc-500">bolsas</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <Flame size={10} className="text-red-400" />
          <span className="text-[10px] font-bold text-zinc-300">{CONFLICTS.length}</span>
          <span className="text-[9px] text-zinc-500">conflitos</span>
        </div>
      </div>
    </div>
  );
});

export default GlobeExchanges;

"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ComposableMap, Geographies, Geography, Marker, ZoomableGroup, Sphere, Graticule,
} from "react-simple-maps";
import { ArrowLeft, Globe2, Map as MapIcon } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";
import {
  GEO_URL, REGION_COLORS, heatColor, buildCountryHeatMap,
  type IndexData,
} from "@/lib/world-map";

interface BolsasResponse {
  indices: IndexData[];
  lastUpdate: string;
  error?: string;
}

type MapStyle = "choropleth" | "bubbles" | "spikes" | "globe" | "pins" | "tiles" | "radar" | "terminal" | "treemap" | "horizon";

const STYLES: { key: MapStyle; label: string; desc: string }[] = [
  { key: "choropleth", label: "Mapa de Calor", desc: "Países coloridos pela variação do dia (original)" },
  { key: "bubbles", label: "Bolhas", desc: "Círculos proporcionais à intensidade do movimento" },
  { key: "spikes", label: "Picos", desc: "Espinhas verticais — altura = magnitude" },
  { key: "globe", label: "Globo 3D", desc: "Projeção ortográfica giratória" },
  { key: "pins", label: "Marcadores", desc: "Etiquetas com bandeira e variação por índice" },
  { key: "tiles", label: "Grade Regional", desc: "Cartograma em blocos agrupados por região" },
  { key: "radar", label: "Radar", desc: "Radar militar — mercados como blips posicionados por região e magnitude" },
  { key: "terminal", label: "Terminal", desc: "Bloomberg terminal retrô — dados densos em fósforo verde" },
  { key: "treemap", label: "Treemap", desc: "Mapa de calor em blocos — maiores movimentos ganham mais espaço" },
  { key: "horizon", label: "Skyline", desc: "Horizonte urbano noturno — cada prédio é um índice" },
];

function HeatLegend() {
  return (
    <div className="flex items-center justify-center gap-2 mt-3">
      <span className="text-[9px] text-red-400 font-semibold">-4%</span>
      <div className="h-2 rounded-full flex-1 max-w-[200px]" style={{ background: "linear-gradient(90deg, #ef4444, #facc15, #22c55e)" }} />
      <span className="text-[9px] text-emerald-400 font-semibold">+4%</span>
    </div>
  );
}

const MAP_BG = "#0f1724";

// ── 1. Choropleth (original) ────────────────────────────────────────────────
function MapChoropleth({ indices }: { indices: IndexData[] }) {
  const heat = useMemo(() => buildCountryHeatMap(indices), [indices]);
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <div className="rounded-xl overflow-hidden relative" style={{ background: MAP_BG }}>
      <ComposableMap projection="geoMercator" projectionConfig={{ scale: 130, center: [0, 30] }} width={800} height={420} style={{ width: "100%", height: "auto" }}>
        <ZoomableGroup center={[0, 30]} minZoom={1} maxZoom={5} /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ filterZoomEvent={(e: any) => e?.type === "wheel"}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) => geographies.map((geo) => {
              const entry = heat.get(String(geo.id));
              const fill = entry ? heatColor(entry.changePct) : "#1e293b";
              return (
                <Geography key={geo.rsmKey} geography={geo} fill={fill} stroke="#334155" strokeWidth={0.5}
                  style={{ default: { outline: "none" }, hover: { outline: "none", fill, stroke: "#94a3b8", strokeWidth: 0.8 }, pressed: { outline: "none" } }}
                  onMouseEnter={() => entry && setHovered(entry.name)} onMouseLeave={() => setHovered(null)} />
              );
            })}
          </Geographies>
          {indices.filter(i => i.symbol !== "^VIX").map(i => {
            if (hovered !== i.name) return null;
            return (
              <Marker key={i.symbol} coordinates={[i.lng, i.lat]}>
                <rect x={-60} y={-30} width={120} height={28} rx={4} fill="rgba(0,0,0,0.9)" stroke={heatColor(i.changePct)} strokeWidth={0.8} />
                <text textAnchor="middle" y={-14} style={{ fontSize: 9.5, fontWeight: 700, fill: "#fafafa", fontFamily: "ui-monospace, monospace" }}>{i.flag} {i.name}</text>
                <text textAnchor="middle" y={-4} style={{ fontSize: 9, fontWeight: 600, fill: heatColor(i.changePct), fontFamily: "ui-monospace, monospace" }}>{i.changePct >= 0 ? "+" : ""}{i.changePct.toFixed(2)}%</text>
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}

// ── 2. Bubble map ─────────────────────────────────────────────────────────
function MapBubbles({ indices }: { indices: IndexData[] }) {
  const pts = indices.filter(i => i.symbol !== "^VIX" && i.lat && i.lng);
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <div className="rounded-xl overflow-hidden relative" style={{ background: MAP_BG }}>
      <ComposableMap projection="geoMercator" projectionConfig={{ scale: 130, center: [0, 30] }} width={800} height={420} style={{ width: "100%", height: "auto" }}>
        <Geographies geography={GEO_URL}>
          {({ geographies }) => geographies.map((geo) => (
            <Geography key={geo.rsmKey} geography={geo} fill="#1b2433" stroke="#26334a" strokeWidth={0.4} style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }} />
          ))}
        </Geographies>
        {pts.map(i => {
          const r = 4 + (Math.min(Math.abs(i.changePct), 5) / 5) * 22;
          const c = heatColor(i.changePct);
          return (
            <Marker key={i.symbol} coordinates={[i.lng, i.lat]} onMouseEnter={() => setHovered(i.symbol)} onMouseLeave={() => setHovered(null)}>
              <circle r={r} fill={c} fillOpacity={0.32} stroke={c} strokeWidth={1.2} />
              {hovered === i.symbol && (
                <g>
                  <rect x={-58} y={-r - 32} width={116} height={28} rx={4} fill="rgba(0,0,0,0.92)" stroke={c} strokeWidth={0.8} />
                  <text textAnchor="middle" y={-r - 18} style={{ fontSize: 9.5, fontWeight: 700, fill: "#fafafa", fontFamily: "ui-monospace, monospace" }}>{i.flag} {i.name}</text>
                  <text textAnchor="middle" y={-r - 8} style={{ fontSize: 9, fontWeight: 600, fill: c, fontFamily: "ui-monospace, monospace" }}>{i.changePct >= 0 ? "+" : ""}{i.changePct.toFixed(2)}%</text>
                </g>
              )}
            </Marker>
          );
        })}
      </ComposableMap>
      <HeatLegend />
    </div>
  );
}

// ── 3. Spike map ────────────────────────────────────────────────────────────
function MapSpikes({ indices }: { indices: IndexData[] }) {
  const pts = indices.filter(i => i.symbol !== "^VIX" && i.lat && i.lng);
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <div className="rounded-xl overflow-hidden relative" style={{ background: MAP_BG }}>
      <ComposableMap projection="geoMercator" projectionConfig={{ scale: 130, center: [0, 30] }} width={800} height={420} style={{ width: "100%", height: "auto" }}>
        <Geographies geography={GEO_URL}>
          {({ geographies }) => geographies.map((geo) => (
            <Geography key={geo.rsmKey} geography={geo} fill="#1b2433" stroke="#26334a" strokeWidth={0.4} style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }} />
          ))}
        </Geographies>
        {pts.map(i => {
          const h = 6 + (Math.min(Math.abs(i.changePct), 5) / 5) * 70;
          const w = 7;
          const c = i.changePct >= 0 ? "#22c55e" : "#ef4444";
          return (
            <Marker key={i.symbol} coordinates={[i.lng, i.lat]} onMouseEnter={() => setHovered(i.symbol)} onMouseLeave={() => setHovered(null)}>
              <polygon points={`${-w / 2},0 ${w / 2},0 0,${-h}`} fill={c} fillOpacity={0.75} stroke={c} strokeWidth={0.6} />
              <circle r={1.6} fill={c} />
              {hovered === i.symbol && (
                <g>
                  <rect x={-56} y={-h - 30} width={112} height={26} rx={4} fill="rgba(0,0,0,0.92)" stroke={c} strokeWidth={0.8} />
                  <text textAnchor="middle" y={-h - 18} style={{ fontSize: 9, fontWeight: 700, fill: "#fafafa", fontFamily: "ui-monospace, monospace" }}>{i.flag} {i.name}</text>
                  <text textAnchor="middle" y={-h - 8} style={{ fontSize: 8.5, fontWeight: 600, fill: c, fontFamily: "ui-monospace, monospace" }}>{i.changePct >= 0 ? "+" : ""}{i.changePct.toFixed(2)}%</text>
                </g>
              )}
            </Marker>
          );
        })}
      </ComposableMap>
      <p className="text-center text-[9px] text-zinc-600 mt-2">altura = magnitude · verde sobe · vermelho cai</p>
    </div>
  );
}

// ── 4. Orthographic globe ─────────────────────────────────────────────────
function MapGlobe({ indices }: { indices: IndexData[] }) {
  const heat = useMemo(() => buildCountryHeatMap(indices), [indices]);
  const [rotation, setRotation] = useState(-40);
  return (
    <div className="rounded-xl overflow-hidden relative" style={{ background: "radial-gradient(circle at 50% 40%, #15233b 0%, #0a111e 70%)" }}>
      <ComposableMap projection="geoOrthographic" projectionConfig={{ rotate: [rotation, -15, 0], scale: 200 }} width={800} height={460} style={{ width: "100%", height: "auto" }}>
        <Sphere id="globe-sphere" fill="#0d1626" stroke="#1e3050" strokeWidth={1} />
        <Graticule stroke="#1c2b45" strokeWidth={0.4} />
        <Geographies geography={GEO_URL}>
          {({ geographies }) => geographies.map((geo) => {
            const entry = heat.get(String(geo.id));
            const fill = entry ? heatColor(entry.changePct) : "#22304a";
            return (
              <Geography key={geo.rsmKey} geography={geo} fill={fill} stroke="#0a111e" strokeWidth={0.4}
                style={{ default: { outline: "none" }, hover: { outline: "none", fill: entry ? fill : "#2c3c5a" }, pressed: { outline: "none" } }} />
            );
          })}
        </Geographies>
      </ComposableMap>
      <div className="flex items-center gap-3 px-6 py-3">
        <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Girar</span>
        <input type="range" min={-180} max={180} value={rotation} onChange={e => setRotation(Number(e.target.value))} className="flex-1 accent-cyan-400" />
      </div>
      <HeatLegend />
    </div>
  );
}

// ── 5. Labeled pins ───────────────────────────────────────────────────────
function MapPins({ indices }: { indices: IndexData[] }) {
  const pts = indices.filter(i => i.symbol !== "^VIX" && i.lat && i.lng);
  return (
    <div className="rounded-xl overflow-hidden relative" style={{ background: MAP_BG }}>
      <ComposableMap projection="geoMercator" projectionConfig={{ scale: 130, center: [0, 30] }} width={800} height={440} style={{ width: "100%", height: "auto" }}>
        <ZoomableGroup center={[0, 30]} minZoom={1} maxZoom={6} /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ filterZoomEvent={(e: any) => e?.type === "wheel"}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) => geographies.map((geo) => (
              <Geography key={geo.rsmKey} geography={geo} fill="#202b3d" stroke="#2c3a52" strokeWidth={0.4} style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }} />
            ))}
          </Geographies>
          {pts.map(i => {
            const c = heatColor(i.changePct);
            return (
              <Marker key={i.symbol} coordinates={[i.lng, i.lat]}>
                <circle r={2} fill={c} />
                <g transform="translate(0,-6)">
                  <rect x={-26} y={-13} width={52} height={13} rx={3} fill="rgba(0,0,0,0.85)" stroke={c} strokeWidth={0.6} />
                  <text textAnchor="middle" y={-3.5} style={{ fontSize: 7.5, fontWeight: 700, fill: c, fontFamily: "ui-monospace, monospace" }}>{i.flag}{i.changePct >= 0 ? "+" : ""}{i.changePct.toFixed(1)}%</text>
                </g>
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>
      <p className="text-center text-[9px] text-zinc-600 mt-2">role para dar zoom · cada etiqueta = um índice</p>
    </div>
  );
}

// ── 6. Regional tile grid (cartograma) ────────────────────────────────────
function MapTiles({ indices }: { indices: IndexData[] }) {
  const byRegion = useMemo(() => {
    const m = new Map<string, IndexData[]>();
    for (const i of indices) {
      if (i.symbol === "^VIX") continue;
      const arr = m.get(i.region) ?? [];
      arr.push(i);
      m.set(i.region, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => b.changePct - a.changePct);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [indices]);

  return (
    <div className="rounded-xl p-4 space-y-5" style={{ background: MAP_BG }}>
      {byRegion.map(([region, items]) => (
        <div key={region}>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full" style={{ background: REGION_COLORS[region] ?? "#888" }} />
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: REGION_COLORS[region] ?? "#aaa" }}>{region}</span>
            <span className="text-[10px] text-zinc-600">{items.length}</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 gap-1.5">
            {items.map(i => {
              const c = heatColor(i.changePct);
              return (
                <div key={i.symbol} className="rounded-md p-2 flex flex-col items-center justify-center text-center aspect-square" style={{ background: `${c}28`, border: `1px solid ${c}66` }} title={`${i.name} (${i.country})`}>
                  <span className="text-base leading-none">{i.flag}</span>
                  <span className="text-[8.5px] text-zinc-300 truncate w-full mt-1 leading-tight">{i.name}</span>
                  <span className="text-[10px] font-bold font-mono mt-0.5" style={{ color: c }}>{i.changePct >= 0 ? "+" : ""}{i.changePct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <HeatLegend />
    </div>
  );
}

// ── 7. Radar sweep ──────────────────────────────────────────────────────────
function MapRadar({ indices }: { indices: IndexData[] }) {
  const [sweep, setSweep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSweep(a => (a + 1.5) % 360), 40);
    return () => clearInterval(id);
  }, []);

  const { blips, regions, sectorAngle } = useMemo(() => {
    const pts = indices.filter(i => i.symbol !== "^VIX");
    const regs = [...new Set(pts.map(i => i.region))].sort();
    const sa = 360 / regs.length;
    const cx = 250, cy = 250, maxR = 200;
    const result: { x: number; y: number; d: IndexData; color: string }[] = [];
    for (let ri = 0; ri < regs.length; ri++) {
      const regionPts = pts.filter(p => p.region === regs[ri]);
      const base = ri * sa;
      for (let pi = 0; pi < regionPts.length; pi++) {
        const p = regionPts[pi];
        const angle = base + (pi + 0.5) * (sa / regionPts.length);
        const dist = maxR * 0.12 + (Math.min(Math.abs(p.changePct), 5) / 5) * maxR * 0.82;
        const rad = (angle - 90) * Math.PI / 180;
        result.push({ x: cx + dist * Math.cos(rad), y: cy + dist * Math.sin(rad), d: p, color: heatColor(p.changePct) });
      }
    }
    return { blips: result, regions: regs, sectorAngle: sa };
  }, [indices]);

  const cx = 250, cy = 250, maxR = 200;
  const sRad = (sweep - 90) * Math.PI / 180;

  return (
    <div className="rounded-xl overflow-hidden flex items-center justify-center py-4" style={{ background: "radial-gradient(circle at 50% 50%, #071a12 0%, #030d08 80%)" }}>
      <svg viewBox="0 0 500 530" className="w-full max-w-[520px]">
        <defs>
          <pattern id="scanlines" width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="4" height="2" fill="rgba(0,0,0,0.12)" />
          </pattern>
        </defs>
        {[0.25, 0.5, 0.75, 1].map(f => (
          <circle key={f} cx={cx} cy={cy} r={maxR * f} fill="none" stroke="#0f3324" strokeWidth={0.6} strokeDasharray={f < 1 ? "3,5" : "0"} />
        ))}
        {regions.map((_, ri) => {
          const a = (ri * sectorAngle - 90) * Math.PI / 180;
          return <line key={ri} x1={cx} y1={cy} x2={cx + maxR * Math.cos(a)} y2={cy + maxR * Math.sin(a)} stroke="#0f3324" strokeWidth={0.4} />;
        })}
        {regions.map((r, ri) => {
          const a = (ri * sectorAngle + sectorAngle / 2 - 90) * Math.PI / 180;
          return (
            <text key={r} x={cx + (maxR + 22) * Math.cos(a)} y={cy + (maxR + 22) * Math.sin(a)}
              textAnchor="middle" dominantBaseline="middle"
              style={{ fontSize: 7.5, fill: REGION_COLORS[r] ?? "#555", fontFamily: "ui-monospace, monospace", fontWeight: 700, letterSpacing: "0.05em" }}>
              {r}
            </text>
          );
        })}
        {Array.from({ length: 30 }, (_, i) => {
          const tr = (sweep - i * 1.5 - 90) * Math.PI / 180;
          return <line key={i} x1={cx} y1={cy} x2={cx + maxR * Math.cos(tr)} y2={cy + maxR * Math.sin(tr)} stroke="#22c55e" strokeWidth={0.8} opacity={Math.max(0, 0.2 - i * 0.006)} />;
        })}
        <line x1={cx} y1={cy} x2={cx + maxR * Math.cos(sRad)} y2={cy + maxR * Math.sin(sRad)} stroke="#22c55e" strokeWidth={2} opacity={0.8} />
        {blips.map(b => (
          <g key={b.d.symbol}>
            <circle cx={b.x} cy={b.y} r={5} fill={b.color} fillOpacity={0.85} />
            <circle cx={b.x} cy={b.y} r={9} fill="none" stroke={b.color} strokeWidth={0.5} opacity={0.3} />
            <text x={b.x} y={b.y + 14} textAnchor="middle" style={{ fontSize: 6, fill: "#8eba9a", fontFamily: "ui-monospace, monospace" }}>
              {b.d.flag} {b.d.changePct >= 0 ? "+" : ""}{b.d.changePct.toFixed(1)}%
            </text>
          </g>
        ))}
        <circle cx={cx} cy={cy} r={3.5} fill="#22c55e" opacity={0.9} />
        <circle cx={cx} cy={cy} r={6} fill="none" stroke="#22c55e" strokeWidth={0.5} opacity={0.4} />
        <rect x="0" y="0" width="500" height="530" fill="url(#scanlines)" pointerEvents="none" />
        <text x={250} y={515} textAnchor="middle" style={{ fontSize: 7.5, fill: "#22553a", fontFamily: "ui-monospace, monospace", letterSpacing: "0.12em" }}>
          GLOBAL MARKET RADAR · DISTÂNCIA = MAGNITUDE · ÂNGULO = REGIÃO
        </text>
      </svg>
    </div>
  );
}

// ── 8. Terminal Bloomberg ────────────────────────────────────────────────────
function MapTerminal({ indices }: { indices: IndexData[] }) {
  const sorted = useMemo(() =>
    [...indices].filter(i => i.symbol !== "^VIX").sort((a, b) => b.changePct - a.changePct),
  [indices]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const winners = sorted.filter(i => i.changePct > 0).length;
  const losers = sorted.filter(i => i.changePct < 0).length;

  return (
    <div className="rounded-xl overflow-hidden font-mono text-[11px]" style={{ background: "#080c04", border: "1px solid #1a2a12" }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ background: "#0c1208", borderBottom: "1px solid #1a2812" }}>
        <div className="flex items-center gap-3">
          <span className="text-amber-500 font-bold tracking-wider text-[10px]">MKTS GLOBAL</span>
          <span className="text-green-700 text-[9px]">│</span>
          <span className="text-green-600 text-[9px]">▲{winners}</span>
          <span className="text-red-600 text-[9px]">▼{losers}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-green-800 text-[9px]">{new Date().toLocaleTimeString()}</span>
          <span className={`text-[10px] ${tick % 2 === 0 ? "text-green-500" : "text-green-900"}`}>●</span>
        </div>
      </div>
      <div className="hidden sm:grid grid-cols-[40px_1fr_90px_80px_90px] gap-px px-2 py-1.5" style={{ background: "#0a1006", borderBottom: "1px solid #151f10" }}>
        <span className="text-green-800 text-[9px]">FLAG</span>
        <span className="text-green-800 text-[9px]">INDEX</span>
        <span className="text-green-800 text-[9px] text-right">PRICE</span>
        <span className="text-green-800 text-[9px] text-right">CHG</span>
        <span className="text-green-800 text-[9px] text-right">%CHG</span>
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {sorted.map(i => {
          const up = i.changePct >= 0;
          const fg = up ? "#22c55e" : "#ef4444";
          const bgBase = up ? "rgba(34,197,94," : "rgba(239,68,68,";
          const intensity = Math.min(Math.abs(i.changePct) / 3, 1);
          return (
            <div key={i.symbol}
              className="grid grid-cols-[40px_1fr_90px] sm:grid-cols-[40px_1fr_90px_80px_90px] gap-px px-2 py-1 items-center"
              style={{ background: `${bgBase}${(0.02 + intensity * 0.08).toFixed(2)})`, borderBottom: "1px solid #111808" }}>
              <span>{i.flag}</span>
              <span className="text-zinc-400 truncate text-[10px]" title={i.name}>{i.symbol.replace("^", "")}</span>
              <span className="text-zinc-500 text-right text-[10px]">{i.price.toLocaleString("en", { maximumFractionDigits: i.price > 1000 ? 0 : 2 })}</span>
              <span className="hidden sm:block text-right text-[10px]" style={{ color: fg }}>{up ? "+" : ""}{i.change.toFixed(Math.abs(i.change) > 100 ? 0 : 2)}</span>
              <span className="hidden sm:block text-right font-bold" style={{ color: fg }}>{up ? "▲" : "▼"} {Math.abs(i.changePct).toFixed(2)}%</span>
            </div>
          );
        })}
      </div>
      <div className="px-3 py-1.5 flex items-center gap-4 overflow-hidden" style={{ background: "#0a1006", borderTop: "1px solid #1a2812" }}>
        <span className="text-amber-600 text-[9px] flex-shrink-0">TICKER</span>
        <div className="flex gap-4 overflow-hidden text-[9px]">
          {sorted.slice(0, 15).map(i => (
            <span key={i.symbol} className="flex-shrink-0" style={{ color: i.changePct >= 0 ? "#22c55e" : "#ef4444" }}>
              {i.flag}{i.symbol.replace("^", "")} {i.changePct >= 0 ? "+" : ""}{i.changePct.toFixed(1)}%
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 9. Treemap (finviz-style) ────────────────────────────────────────────────
function treemapLayout(
  items: { weight: number; data: IndexData }[],
  x: number, y: number, w: number, h: number,
): { x: number; y: number; w: number; h: number; data: IndexData }[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ x, y, w, h, data: items[0].data }];
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total === 0) return [];
  let acc = 0, splitIdx = 1;
  for (let i = 0; i < items.length - 1; i++) {
    acc += items[i].weight;
    if (acc >= total / 2) { splitIdx = i + 1; break; }
  }
  const g1 = items.slice(0, splitIdx);
  const g2 = items.slice(splitIdx);
  const ratio = g1.reduce((s, i) => s + i.weight, 0) / total;
  if (w >= h) {
    return [
      ...treemapLayout(g1, x, y, w * ratio, h),
      ...treemapLayout(g2, x + w * ratio, y, w * (1 - ratio), h),
    ];
  }
  return [
    ...treemapLayout(g1, x, y, w, h * ratio),
    ...treemapLayout(g2, x, y + h * ratio, w, h * (1 - ratio)),
  ];
}

function MapTreemap({ indices }: { indices: IndexData[] }) {
  const rects = useMemo(() => {
    const pts = indices.filter(i => i.symbol !== "^VIX");
    const items = pts
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .map(i => ({ weight: Math.max(Math.abs(i.changePct), 0.15), data: i }));
    return treemapLayout(items, 0, 0, 800, 480);
  }, [indices]);

  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: MAP_BG }}>
      <svg viewBox="0 0 800 480" className="w-full" preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        {rects.map(r => {
          const c = heatColor(r.data.changePct);
          const isHov = hovered === r.data.symbol;
          const minDim = Math.min(r.w, r.h);
          return (
            <g key={r.data.symbol} onMouseEnter={() => setHovered(r.data.symbol)} onMouseLeave={() => setHovered(null)} style={{ cursor: "default" }}>
              <rect x={r.x + 1} y={r.y + 1} width={Math.max(r.w - 2, 0)} height={Math.max(r.h - 2, 0)}
                rx={2} fill={c} fillOpacity={isHov ? 0.55 : 0.28}
                stroke={isHov ? "#fff" : c} strokeWidth={isHov ? 1.5 : 0.6} strokeOpacity={isHov ? 0.6 : 0.4} />
              {minDim > 28 && (
                <>
                  <text x={r.x + r.w / 2} y={r.y + r.h / 2 - (minDim > 50 ? 6 : 0)} textAnchor="middle" dominantBaseline="middle"
                    style={{ fontSize: Math.min(minDim / 4, 13), fill: "#fafafa", fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>
                    {r.data.flag} {r.data.symbol.replace("^", "")}
                  </text>
                  {minDim > 48 && (
                    <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 10} textAnchor="middle" dominantBaseline="middle"
                      style={{ fontSize: Math.min(minDim / 5, 12), fill: c, fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>
                      {r.data.changePct >= 0 ? "+" : ""}{r.data.changePct.toFixed(2)}%
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── 10. City skyline / Horizon ──────────────────────────────────────────────
function MapHorizon({ indices }: { indices: IndexData[] }) {
  const grouped = useMemo(() => {
    const pts = indices.filter(i => i.symbol !== "^VIX");
    const regions = [...new Set(pts.map(i => i.region))].sort();
    return regions.map(r => ({
      region: r,
      items: pts.filter(p => p.region === r).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)),
    }));
  }, [indices]);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "linear-gradient(180deg, #070b14 0%, #0c1220 40%, #101828 75%, #151f30 100%)" }}>
      <svg className="w-full" viewBox="0 0 800 25" style={{ display: "block" }}>
        {Array.from({ length: 50 }, (_, i) => (
          <circle key={i} cx={(i * 97 + 13) % 800} cy={(i * 43 + 7) % 25} r={0.4 + (i % 3) * 0.3} fill="#fff" opacity={0.12 + (i % 4) * 0.08} />
        ))}
      </svg>
      <div className="flex gap-5 overflow-x-auto px-4 pb-4">
        {grouped.map(({ region, items }) => (
          <div key={region} className="flex-shrink-0">
            <div className="flex items-end gap-[2px]" style={{ height: 220 }}>
              {items.map((item, bIdx) => {
                const h = 18 + (Math.min(Math.abs(item.changePct), 5) / 5) * 172;
                const c = heatColor(item.changePct);
                const windowRows = Math.max(0, Math.floor((h - 14) / 10));
                return (
                  <div key={item.symbol} className="flex flex-col items-center" style={{ width: 26 }} title={`${item.name} · ${item.changePct >= 0 ? "+" : ""}${item.changePct.toFixed(2)}%`}>
                    <div className="relative" style={{ height: h, width: 26 }}>
                      <div className="absolute left-1/2 -translate-x-1/2 -top-3 w-[1px]" style={{ height: 6, background: c, opacity: 0.5 }} />
                      <div className="absolute left-1/2 -translate-x-1/2 rounded-full" style={{ top: -14, width: 3, height: 3, background: c, opacity: 0.7 }} />
                      <div className="absolute bottom-0 left-0 right-0 rounded-t-sm overflow-hidden" style={{ height: h, background: `linear-gradient(180deg, ${c}44 0%, ${c}18 100%)`, borderLeft: `1px solid ${c}55`, borderRight: `1px solid ${c}33`, borderTop: `1px solid ${c}55` }}>
                        <div className="flex flex-col items-center gap-[3px] pt-2">
                          {Array.from({ length: windowRows }, (_, wi) => (
                            <div key={wi} className="flex gap-[2px]">
                              {[0, 1, 2].map(col => (
                                <div key={col} className="w-[4px] h-[4px] rounded-[0.5px]"
                                  style={{ background: (bIdx * 7 + wi * 3 + col * 11 + 5) % 5 !== 0 ? `${c}88` : `${c}15` }} />
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-[120%] h-2 rounded-full" style={{ background: c, opacity: 0.08, filter: "blur(4px)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="h-[1px] mt-1" style={{ background: `linear-gradient(90deg, transparent, ${REGION_COLORS[region] ?? "#444"}66, transparent)` }} />
            <div className="flex items-center justify-center gap-1.5 mt-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: REGION_COLORS[region] ?? "#666" }} />
              <span className="text-[8px] font-bold uppercase tracking-[0.15em]" style={{ color: REGION_COLORS[region] ?? "#666" }}>{region}</span>
            </div>
            <div className="flex justify-center gap-[2px] mt-1">
              {items.map(item => (
                <span key={item.symbol} className="text-[7px]" title={item.name}>{item.flag}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Scanner2Page() {
  const [data, setData] = useState<BolsasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [style, setStyle] = useState<MapStyle>("choropleth");

  useEffect(() => {
    fetch("/api/bolsas")
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;

  const indices = data.indices;

  return (
    <div className="min-h-screen pb-10">
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-2">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/bolsas" className="text-zinc-600 hover:text-zinc-400 transition-colors"><ArrowLeft size={18} /></Link>
          <Globe2 className="text-cyan-400" size={22} />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-zinc-50 via-zinc-100 to-zinc-300 bg-clip-text text-transparent">Scanner 2</h1>
        </div>
        <p className="text-xs text-zinc-500 ml-[34px]">Laboratório de visualizações do mapa de mercados globais</p>
      </div>

      <div className="max-w-7xl mx-auto px-4 space-y-4">
        {/* Style selector */}
        <div className="flex flex-wrap gap-2">
          {STYLES.map(s => {
            const on = style === s.key;
            return (
              <button key={s.key} onClick={() => setStyle(s.key)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-left transition-all"
                style={{ background: on ? "rgba(6,182,212,0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${on ? "rgba(6,182,212,0.4)" : "rgba(255,255,255,0.06)"}` }}>
                <MapIcon size={13} className={on ? "text-cyan-400" : "text-zinc-500"} />
                <span className={`text-[11px] font-semibold ${on ? "text-cyan-300" : "text-zinc-400"}`}>{s.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-zinc-500">{STYLES.find(s => s.key === style)?.desc}</p>

        {/* Map panel */}
        <div className="rounded-2xl p-3 md:p-5 overflow-hidden" style={{ background: "rgba(13,14,20,0.92)", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
          {style === "choropleth" && <MapChoropleth indices={indices} />}
          {style === "bubbles" && <MapBubbles indices={indices} />}
          {style === "spikes" && <MapSpikes indices={indices} />}
          {style === "globe" && <MapGlobe indices={indices} />}
          {style === "pins" && <MapPins indices={indices} />}
          {style === "tiles" && <MapTiles indices={indices} />}
          {style === "radar" && <MapRadar indices={indices} />}
          {style === "terminal" && <MapTerminal indices={indices} />}
          {style === "treemap" && <MapTreemap indices={indices} />}
          {style === "horizon" && <MapHorizon indices={indices} />}
        </div>
      </div>
    </div>
  );
}

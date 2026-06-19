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

type MapStyle = "choropleth" | "bubbles" | "spikes" | "globe" | "pins" | "tiles";

const STYLES: { key: MapStyle; label: string; desc: string }[] = [
  { key: "choropleth", label: "Mapa de Calor", desc: "Países coloridos pela variação do dia (original)" },
  { key: "bubbles", label: "Bolhas", desc: "Círculos proporcionais à intensidade do movimento" },
  { key: "spikes", label: "Picos", desc: "Espinhas verticais — altura = magnitude" },
  { key: "globe", label: "Globo 3D", desc: "Projeção ortográfica giratória" },
  { key: "pins", label: "Marcadores", desc: "Etiquetas com bandeira e variação por índice" },
  { key: "tiles", label: "Grade Regional", desc: "Cartograma em blocos agrupados por região" },
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
        </div>
      </div>
    </div>
  );
}

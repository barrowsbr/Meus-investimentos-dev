"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RadarMap — a tela-base persistente da página. O mapa É a interface: o
// choropleth repinta conforme a camada ativa (Mercados / Câmbio) e clicar num
// país abre o dossiê. Marcadores adicionam o ponto preciso de cada praça.
// ─────────────────────────────────────────────────────────────────────────────

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { GEO_URL, REGION_COLORS, heatColor } from "@/lib/world-map";
import { ISO_NUM_TO_COUNTRY, type HeatEntry } from "@/lib/radar/geo";
import type { RadarLayer } from "@/lib/radar/types";

export interface MarkerPoint {
  id: string;
  lat: number;
  lng: number;
  changePct: number;
  region: string;
  label: string;
  country: string;
}

interface RadarMapProps {
  layer: RadarLayer;
  heat: Map<string, HeatEntry>;
  markers: MarkerPoint[];
  selectedIso: string | null;
  regionFilter: string | null;
  onSelectCountry: (iso: string) => void;
}

interface Tip { x: number; y: number; title: string; sub: string; pct: number }

const NEUTRAL = "#161a24";

function RadarMapInner({
  layer, heat, markers, selectedIso, regionFilter, onSelectCountry,
}: RadarMapProps) {
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([10, 20]);
  const [tip, setTip] = useState<Tip | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(z * 1.5, 8)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z / 1.5, 1)), []);
  const reset = useCallback(() => { setZoom(1); setCenter([10, 20]); }, []);

  useEffect(() => {
    const svg = wrapRef.current?.querySelector("svg");
    if (svg) svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  });

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden rounded-xl md:rounded-2xl"
      style={{ background: "radial-gradient(120% 100% at 50% 0%, #0d1018 0%, #070912 70%)" }}
      onMouseLeave={() => setTip(null)}
    >
      {/* Controles de zoom */}
      <div className="absolute top-3 right-3 z-20 flex flex-col gap-1.5">
        {[
          { icon: ZoomIn, action: zoomIn, label: "Aproximar" },
          { icon: ZoomOut, action: zoomOut, label: "Afastar" },
          { icon: Maximize2, action: reset, label: "Resetar" },
        ].map(({ icon: Icon, action, label }) => (
          <button
            key={label}
            onClick={action}
            title={label}
            className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
            style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <Icon size={14} className="text-zinc-300" />
          </button>
        ))}
      </div>

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 145, center: [15, 20] }}
        style={{ width: "100%", height: "100%" }}
        width={900}
        height={520}
      >
        <ZoomableGroup
          zoom={zoom}
          center={center}
          onMoveEnd={({ zoom: z, coordinates }) => {
            setZoom(Math.max(1, Math.min(8, z)));
            setCenter(coordinates as [number, number]);
          }}
          minZoom={1}
          maxZoom={8}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          filterZoomEvent={(evt: any) => evt?.type === "wheel"}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const iso = String(geo.id);
                const entry = heat.get(iso);
                const known = !!ISO_NUM_TO_COUNTRY[iso];
                const fill = entry ? heatColor(entry.changePct) : NEUTRAL;
                const isSelected = selectedIso === iso;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fill}
                    stroke={isSelected ? "#fff" : "rgba(255,255,255,0.12)"}
                    strokeWidth={isSelected ? 1.1 : 0.35}
                    onMouseEnter={(e: React.MouseEvent) => {
                      if (!entry) return;
                      setTip({
                        x: e.clientX, y: e.clientY,
                        title: `${entry.flag} ${entry.country}`,
                        sub: entry.label,
                        pct: entry.changePct,
                      });
                    }}
                    onMouseMove={(e: React.MouseEvent) => setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
                    onMouseLeave={() => setTip(null)}
                    onClick={() => known && onSelectCountry(iso)}
                    style={{
                      default: { outline: "none", opacity: entry ? 1 : 0.55, transition: "fill .3s" },
                      hover: { outline: "none", opacity: 1, cursor: known ? "pointer" : "default", filter: entry ? "brightness(1.25)" : "none" },
                      pressed: { outline: "none" },
                    }}
                  />
                );
              })
            }
          </Geographies>

          {/* Marcadores = camada visual (decorativa). A interação acontece nos
              países (choropleth) — repintar a superfície, clicar no país. */}
          {markers.map((m) => {
            const regionColor = REGION_COLORS[m.region] ?? "#888";
            const dimmed = regionFilter ? m.region !== regionFilter : false;
            const changeColor = m.changePct >= 0 ? "#4ade80" : "#f87171";
            const r = 3.2;
            return (
              <Marker key={m.id} coordinates={[m.lng, m.lat]}>
                <g style={{ opacity: dimmed ? 0.1 : 0.95, pointerEvents: "none" }}>
                  <circle r={r} fill={regionColor} stroke="rgba(255,255,255,0.45)" strokeWidth={0.4} />
                  <circle r={r * 0.42} fill={changeColor} />
                  {layer === "cambio" && !dimmed && (
                    <text y={-r - 2.5} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={6.5} fontWeight={600} style={{ textShadow: "0 1px 2px #000" }}>
                      {m.label}
                    </text>
                  )}
                </g>
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip flutuante */}
      {tip && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg px-3 py-2 text-xs shadow-xl"
          style={{
            left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 9999) - 180),
            top: tip.y + 14,
            background: "rgba(8,10,18,0.95)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <p className="font-semibold text-zinc-100">{tip.title}</p>
          <p className="text-[11px] text-zinc-400">{tip.sub}</p>
          <p className="font-mono text-[11px] font-bold" style={{ color: tip.pct >= 0 ? "#4ade80" : "#f87171" }}>
            {tip.pct >= 0 ? "+" : ""}{tip.pct.toFixed(2)}%
          </p>
        </div>
      )}
    </div>
  );
}

export const RadarMap = memo(RadarMapInner);

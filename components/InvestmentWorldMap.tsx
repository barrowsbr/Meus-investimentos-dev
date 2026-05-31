"use client";

import React, { memo, useState, useCallback } from "react";
import {
  ComposableMap, Geographies, Geography, Marker, ZoomableGroup,
} from "react-simple-maps";
import { compactBRL } from "@/lib/format";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const REGION_COLORS: Record<string, string> = {
  Americas: "#3b82f6",
  Europe: "#8b5cf6",
  Asia: "#f59e0b",
  "Middle East": "#ef4444",
  Africa: "#10b981",
  Oceania: "#06b6d4",
};

export interface CountryAllocation {
  country: { code: string; name: string; lat: number; lng: number; region: string };
  value_brl: number;
  pct: number;
  tickers: string[];
}

interface Props {
  data: CountryAllocation[];
  totalBRL: number;
}

const InvestmentWorldMap = memo(function InvestmentWorldMap({ data, totalBRL }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([10, 20]);

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(z * 1.5, 6)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(z / 1.5, 1)), []);
  const handleReset = useCallback(() => { setZoom(1); setCenter([10, 20]); }, []);

  const maxValue = data.length > 0 ? data[0].value_brl : 1;

  return (
    <div className="relative">
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        {[
          { label: "+", action: handleZoomIn },
          { label: "−", action: handleZoomOut },
          { label: "⟲", action: handleReset },
        ].map(({ label, action }) => (
          <button key={label} onClick={action}
            className="w-6 h-6 rounded-md flex items-center justify-center text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Tooltip */}
      {hovered && (() => {
        const item = data.find(d => d.country.code === hovered);
        if (!item) return null;
        return (
          <div className="absolute top-2 left-2 z-10 px-3 py-2 rounded-xl text-xs pointer-events-none"
            style={{ background: "#13141A", border: "1px solid #1E2028", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
            <p className="font-bold text-zinc-200">{item.country.name}</p>
            <p className="text-zinc-300 font-mono">{compactBRL(item.value_brl)} <span className="text-zinc-500">({item.pct.toFixed(1)}%)</span></p>
            <p className="text-zinc-600 mt-0.5">{item.tickers.join(", ")}</p>
          </div>
        );
      })()}

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 130, center: [0, 30] }}
        style={{ width: "100%", height: "auto" }}
        width={800}
        height={420}
      >
        <ZoomableGroup
          zoom={zoom}
          center={center}
          onMoveEnd={({ coordinates, zoom: z }) => { setCenter(coordinates as [number, number]); setZoom(z); }}
          maxZoom={6}
        >
          <rect x={-200} y={-100} width={1200} height={700} fill="rgba(8,10,18,0.6)" />

          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="rgba(255,255,255,0.04)"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={0.3}
                  style={{
                    default: { outline: "none" },
                    hover: { fill: "rgba(255,255,255,0.07)", outline: "none" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {/* Investment markers — sized by value */}
          {data.map((item) => {
            const regionColor = REGION_COLORS[item.country.region] ?? "#888";
            const isHovered = hovered === item.country.code;
            // Scale radius: min 3, max 22 based on sqrt proportion
            const ratio = maxValue > 0 ? item.value_brl / maxValue : 0;
            const baseR = 3 + Math.sqrt(ratio) * 19;
            const r = isHovered ? baseR * 1.25 : baseR;

            return (
              <Marker
                key={item.country.code}
                coordinates={[item.country.lng, item.country.lat]}
                onMouseEnter={() => setHovered(item.country.code)}
                onMouseLeave={() => setHovered(null)}
              >
                <g style={{ cursor: "pointer" }}>
                  {/* Pulse ring on hover */}
                  {isHovered && (
                    <circle r={r + 6} fill="none" stroke={regionColor} strokeWidth={0.8} opacity={0.4}>
                      <animate attributeName="r" from={String(r + 2)} to={String(r + 14)} dur="1.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.5" to="0" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                  )}

                  {/* Shadow */}
                  <circle r={r} fill="rgba(0,0,0,0.3)" cx={0.5} cy={0.5} />

                  {/* Outer circle */}
                  <circle
                    r={r}
                    fill={`${regionColor}30`}
                    stroke={isHovered ? "#fff" : `${regionColor}80`}
                    strokeWidth={isHovered ? 1.5 : 0.8}
                    style={{ filter: isHovered ? `drop-shadow(0 0 8px ${regionColor})` : undefined }}
                  />

                  {/* Inner filled circle */}
                  <circle r={r * 0.6} fill={regionColor} opacity={0.85} />

                  {/* Label for large bubbles */}
                  {r > 8 && (
                    <text
                      y={-r - 4}
                      textAnchor="middle"
                      fill={isHovered ? "#fff" : "rgba(255,255,255,0.7)"}
                      fontSize={isHovered ? 11 : 9}
                      fontWeight={isHovered ? "bold" : "normal"}
                      style={{ pointerEvents: "none", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
                    >
                      {item.country.code}
                    </text>
                  )}

                  {/* % label inside large bubbles */}
                  {r > 12 && (
                    <text
                      y={1}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#fff"
                      fontSize={Math.max(7, r * 0.45)}
                      fontWeight="bold"
                      style={{ pointerEvents: "none" }}
                    >
                      {item.pct.toFixed(0)}%
                    </text>
                  )}
                </g>
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 px-1">
        {data.slice(0, 8).map(item => (
          <div key={item.country.code} className="flex items-center gap-1.5 text-[10px]"
            onMouseEnter={() => setHovered(item.country.code)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: "pointer" }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: REGION_COLORS[item.country.region] ?? "#888" }} />
            <span className="text-zinc-400">{item.country.name}</span>
            <span className="text-zinc-600 font-mono">{item.pct.toFixed(1)}%</span>
          </div>
        ))}
        {data.length > 8 && (
          <span className="text-[10px] text-zinc-600">+{data.length - 8} países</span>
        )}
      </div>
    </div>
  );
});

export default InvestmentWorldMap;

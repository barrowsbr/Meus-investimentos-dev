"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RadarMap — a tela-base persistente da página. O mapa É a interface: o
// choropleth repinta conforme a camada ativa (Mercados / Câmbio) e clicar num
// país abre o dossiê. Marcadores adicionam o ponto preciso de cada praça.
// ─────────────────────────────────────────────────────────────────────────────

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from "react-simple-maps";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { GEO_URL, intensityColor } from "@/lib/world-map";
import { type HeatEntry, type ExposureMarker } from "@/lib/radar/geo";
import { resolveCountryMeta } from "@/lib/radar/countries";
import type { RadarLayer } from "@/lib/radar/types";

interface RadarMapProps {
  layer: RadarLayer;
  heat: Map<string, HeatEntry>;
  markers?: ExposureMarker[];
  selectedIso: string | null;
  regionFilter: string | null;
  onSelectCountry: (iso: string, name: string) => void;
}

interface Tip { x: number; y: number; title: string; sub: string; value: string | null; positive: boolean }

const NEUTRAL = "#161a24";

// Rótulos das pontas da legenda por camada (esquerda = vermelho, direita = verde).
const LEGEND: Record<RadarLayer, [string, string]> = {
  mercados: ["Queda", "Alta"],
  cambio: ["Moeda fraca", "Moeda forte"],
  instabilidade: ["Risco alto", "Risco baixo"],
  exposicao: ["Menor alocação", "Maior alocação"],
};

function RadarMapInner({
  layer, heat, markers = [], selectedIso, regionFilter, onSelectCountry,
}: RadarMapProps) {
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([10, 20]);
  const [tip, setTip] = useState<Tip | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(z * 1.5, 8)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z / 1.5, 1)), []);
  const reset = useCallback(() => { setZoom(1); setCenter([10, 20]); }, []);

  useEffect(() => { if (selectedIso) setTip(null); }, [selectedIso]);

  useEffect(() => {
    const svg = wrapRef.current?.querySelector("svg");
    if (svg) svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  });

  return (
    <div
      ref={wrapRef}
      data-no-pull
      className="relative h-full w-full overflow-hidden rounded-xl md:rounded-2xl"
      style={{ background: "transparent" }}
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
                // Identidade de QUALQUER país (bandeira/nome/região) — para que
                // todos sejam clicáveis e tenham tooltip, mesmo sem dado de calor.
                const meta = resolveCountryMeta(iso, (geo.properties as { name?: string })?.name);
                const known = !!meta;
                const fill = entry ? intensityColor(entry.intensity) : NEUTRAL;
                const isSelected = selectedIso === iso;
                // Filtro de região atua no PRÓPRIO país (não só nos marcadores):
                // com filtro ativo, só a região escolhida fica acesa.
                const matchesFilter = !regionFilter || entry?.region === regionFilter;
                const opacity = regionFilter
                  ? (entry && matchesFilter ? 1 : 0.1)
                  : (entry ? 1 : 0.55);
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fill}
                    stroke={isSelected ? "#fff" : "rgba(255,255,255,0.12)"}
                    strokeWidth={isSelected ? 1.1 : 0.35}
                    onMouseEnter={(e: React.MouseEvent) => {
                      // Tooltip para TODO país: com dado de calor mostra o valor;
                      // sem dado, mostra só bandeira + nome + região.
                      const flag = entry?.flag || meta?.flag || "";
                      const name = entry?.country || meta?.name || "";
                      if (!name) return;
                      setTip({
                        x: e.clientX, y: e.clientY,
                        title: `${flag} ${name}`.trim(),
                        sub: entry?.label ?? (meta?.region && meta.region !== "—" ? meta.region : "Sem dados de mercado"),
                        value: entry?.valueText ?? null,
                        positive: entry?.positive ?? false,
                      });
                    }}
                    onMouseMove={(e: React.MouseEvent) => setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
                    onMouseLeave={() => setTip(null)}
                    onClick={() => known && onSelectCountry(iso, meta!.name)}
                    style={{
                      default: { outline: "none", opacity, transition: "fill .3s, opacity .3s" },
                      hover: { outline: "none", opacity: matchesFilter ? 1 : 0.1, cursor: known ? "pointer" : "default", filter: entry && matchesFilter ? "brightness(1.25)" : (known ? "brightness(1.4)" : "none") },
                      pressed: { outline: "none" },
                    }}
                  />
                );
              })
            }
          </Geographies>

          {/* Marcadores das praças onde há alocação (camada "Minhas bolsas").
              r/strokeWidth divididos pelo zoom → tamanho constante na tela. */}
          {markers.map((m) => {
            const scale = Math.sqrt(m.pct / 100); // 0..1 pela % de alocação
            return (
              <Marker key={m.iso2} coordinates={[m.lng, m.lat]}>
                <g
                  onClick={() => m.isoNum && onSelectCountry(m.isoNum, m.countryPT)}
                  onMouseEnter={(e: React.MouseEvent) =>
                    setTip({
                      x: e.clientX, y: e.clientY,
                      title: `${m.flag} ${m.countryPT}`.trim(),
                      sub: `${m.pct.toFixed(m.pct < 1 ? 2 : 1)}% · na bolsa local`,
                      value: m.valueText,
                      positive: true,
                    })
                  }
                  onMouseMove={(e: React.MouseEvent) => setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
                  onMouseLeave={() => setTip(null)}
                  style={{ cursor: "pointer" }}
                >
                  <circle r={(9 + 6 * scale) / zoom} fill="rgba(59,130,246,0.18)" />
                  <circle r={(4 + 3 * scale) / zoom} fill="#3b82f6" stroke="#fff" strokeWidth={1.4 / zoom} />
                </g>
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>

      {/* Legenda da escala de cor (canto inferior esquerdo) */}
      <div
        className="pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-lg px-2.5 py-1.5"
        style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <span className="text-[9px] font-medium text-zinc-400">{LEGEND[layer][0]}</span>
        <span
          className="h-2 w-20 rounded-full"
          style={{ background: "linear-gradient(90deg, #ef4444 0%, #facc15 50%, #22c55e 100%)" }}
        />
        <span className="text-[9px] font-medium text-zinc-400">{LEGEND[layer][1]}</span>
      </div>

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
          {tip.value != null && (
            <p className="font-mono text-[11px] font-bold" style={{ color: tip.positive ? "#4ade80" : "#f87171" }}>
              {tip.value}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export const RadarMap = memo(RadarMapInner);

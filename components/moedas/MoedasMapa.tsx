"use client";

// ─────────────────────────────────────────────────────────────────────────────
// MoedasMapa — mapa-múndi da coleção: países com moedas acendem em âmbar
// (intensidade pela quantidade). Clique filtra a lista da página.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { GEO_URL, COUNTRY_TO_ISO_NUM } from "@/lib/world-map";

export interface PaisStat { pais: string; qtd: number; valor: number }

interface Props {
  porPais: PaisStat[];
  selecionado: string | null;
  onSelect: (pais: string | null) => void;
}

const NEUTRAL = "#141823";

export default function MoedasMapa({ porPais, selecionado, onSelect }: Props) {
  const [tip, setTip] = useState<{ x: number; y: number; texto: string } | null>(null);

  const porIso = useMemo(() => {
    const map = new Map<string, PaisStat>();
    for (const p of porPais) {
      const iso = COUNTRY_TO_ISO_NUM[p.pais];
      if (iso) map.set(iso, p);
    }
    return map;
  }, [porPais]);

  const maxQtd = Math.max(1, ...porPais.map((p) => p.qtd));

  return (
    <div className="relative overflow-hidden rounded-2xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <ComposableMap projection="geoNaturalEarth1" projectionConfig={{ scale: 150 }} style={{ width: "100%", height: "auto" }}>
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const stat = porIso.get(geo.id as string);
              const t = stat ? 0.25 + 0.75 * Math.sqrt(stat.qtd / maxQtd) : 0;
              const isSel = stat && selecionado === stat.pais;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onClick={() => stat && onSelect(isSel ? null : stat.pais)}
                  onMouseEnter={(e: React.MouseEvent) => {
                    if (stat) setTip({ x: e.clientX, y: e.clientY, texto: `${stat.pais} · ${stat.qtd} ${stat.qtd === 1 ? "moeda" : "moedas"}` });
                  }}
                  onMouseMove={(e: React.MouseEvent) => setTip((v) => (v ? { ...v, x: e.clientX, y: e.clientY } : v))}
                  onMouseLeave={() => setTip(null)}
                  style={{
                    default: {
                      fill: stat ? `rgba(245,158,11,${(0.18 + 0.62 * t).toFixed(2)})` : NEUTRAL,
                      stroke: isSel ? "#fbbf24" : "rgba(255,255,255,0.08)",
                      strokeWidth: isSel ? 1.2 : 0.4,
                      outline: "none",
                      cursor: stat ? "pointer" : "default",
                    },
                    hover: {
                      fill: stat ? "rgba(245,158,11,0.9)" : NEUTRAL,
                      stroke: "rgba(255,255,255,0.25)",
                      strokeWidth: 0.6,
                      outline: "none",
                      cursor: stat ? "pointer" : "default",
                    },
                    pressed: { fill: "rgba(245,158,11,0.95)", outline: "none" },
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
      {tip && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-zinc-100"
          style={{ left: tip.x + 12, top: tip.y - 10, background: "rgba(10,12,18,0.92)", border: "1px solid rgba(245,158,11,0.35)" }}
        >
          {tip.texto}
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2.5 left-3 flex items-center gap-2 text-[9px] text-zinc-500">
        <span className="h-2 w-16 rounded-full" style={{ background: "linear-gradient(90deg, rgba(245,158,11,0.2), rgba(245,158,11,0.95))" }} />
        <span>menos → mais moedas · clique para filtrar</span>
      </div>
    </div>
  );
}

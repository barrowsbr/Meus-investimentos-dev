"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LayersRail — controles que orbitam o mapa: a lente ativa (camadas), o filtro
// de região, a legenda e o "pulso global" (breadth + destaques do dia).
// Sem abas concorrentes: tudo repinta a mesma superfície.
// ─────────────────────────────────────────────────────────────────────────────

import { BarChart3, ArrowLeftRight, Shield, Layers, TrendingUp, TrendingDown } from "lucide-react";
import { REGION_COLORS } from "@/lib/world-map";
import type { RadarLayer, BolsasResponse } from "@/lib/radar/types";

const LAYERS: { key: RadarLayer; label: string; sub: string; icon: typeof BarChart3 }[] = [
  { key: "mercados", label: "Mercados", sub: "Variação do índice local", icon: BarChart3 },
  { key: "cambio", label: "Câmbio", sub: "Força da moeda vs USD", icon: ArrowLeftRight },
  { key: "instabilidade", label: "Risco", sub: "Índice de instabilidade", icon: Shield },
  { key: "etf", label: "ETF", sub: "Exposição geográfica do portfólio", icon: Layers },
];

interface Props {
  layer: RadarLayer;
  setLayer: (l: RadarLayer) => void;
  regions: string[];
  regionFilter: string | null;
  setRegionFilter: (r: string | null) => void;
  markets: BolsasResponse | null;
}

export default function LayersRail({ layer, setLayer, regions, regionFilter, setRegionFilter, markets }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {/* Camadas */}
      <section>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Camadas</h3>
        <div className="flex flex-col gap-1.5">
          {LAYERS.map(({ key, label, sub, icon: Icon }) => {
            const active = layer === key;
            return (
              <button
                key={key}
                onClick={() => setLayer(key)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all"
                style={{
                  background: active ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${active ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <Icon size={16} className={active ? "text-blue-400" : "text-zinc-500"} />
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${active ? "text-zinc-100" : "text-zinc-300"}`}>{label}</p>
                  <p className="truncate text-[10px] text-zinc-500">{sub}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Filtro de região */}
      {regions.length > 0 && (
        <section>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Região</h3>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setRegionFilter(null)}
              className="rounded-full px-2.5 py-1 text-[10px] transition-all"
              style={{
                background: !regionFilter ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${!regionFilter ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.06)"}`,
                color: !regionFilter ? "#fff" : "#888",
              }}
            >
              Todas
            </button>
            {regions.map((r) => {
              const c = REGION_COLORS[r] ?? "#888";
              const active = regionFilter === r;
              return (
                <button
                  key={r}
                  onClick={() => setRegionFilter(active ? null : r)}
                  className="rounded-full px-2.5 py-1 text-[10px] transition-all"
                  style={{
                    background: active ? `${c}30` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${active ? `${c}60` : "rgba(255,255,255,0.06)"}`,
                    color: active ? c : "#888",
                  }}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Legenda do calor */}
      <section>
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Escala</h3>
        {layer === "etf" ? (
          <>
            <div className="h-2 w-full rounded-full" style={{ background: "linear-gradient(90deg,#254e82,#38bdf8)" }} />
            <div className="mt-1 flex justify-between text-[9px] text-zinc-500">
              <span>Menor</span><span>Maior exposição</span>
            </div>
          </>
        ) : (
          <>
            <div className="h-2 w-full rounded-full" style={{ background: "linear-gradient(90deg,#ef4444,#fbbf24,#22c55e)" }} />
            <div className="mt-1 flex justify-between text-[9px] text-zinc-500">
              <span>-4%</span><span>0</span><span>+4%</span>
            </div>
          </>
        )}
      </section>

      {/* Pulso global */}
      {markets && (
        <section className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Pulso global</h3>
          <div className="mb-2 flex items-center gap-1.5">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full bg-emerald-500" style={{ width: `${markets.breadth.total ? (markets.breadth.up / markets.breadth.total) * 100 : 0}%` }} />
            </div>
            <span className="font-mono text-[10px] text-zinc-400">{markets.breadth.up}/{markets.breadth.total}</span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[11px]">
              <TrendingUp size={12} className="text-emerald-400" />
              <span className="truncate text-zinc-300">{markets.best.flag} {markets.best.name}</span>
              <span className="ml-auto font-mono font-semibold text-emerald-400">+{markets.best.changePct.toFixed(1)}%</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <TrendingDown size={12} className="text-red-400" />
              <span className="truncate text-zinc-300">{markets.worst.flag} {markets.worst.name}</span>
              <span className="ml-auto font-mono font-semibold text-red-400">{markets.worst.changePct.toFixed(1)}%</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

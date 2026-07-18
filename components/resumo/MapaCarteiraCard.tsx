"use client";

// Extraído de app/resumo/page.tsx — Mapa da Carteira: sunburst (classe → setor
// → ativo) + sidebar unificada com breakdown clicável.

import React from "react";
import { PieChart as PieIcon } from "lucide-react";
import SunburstChart from "@/components/SunburstChart";
import { compactBRL } from "@/lib/format";

interface MapaCarteiraCardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sunburstData: { level1: any[]; level2: any[]; level3: any[] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nestedMiddle: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nestedOuter: any[];
  selectedClass: string | null;
  selectedSector: string | null;
  setSelectedClass: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedSector: React.Dispatch<React.SetStateAction<string | null>>;
}

export default function MapaCarteiraCard({
  sunburstData, nestedMiddle, nestedOuter,
  selectedClass, selectedSector, setSelectedClass, setSelectedSector,
}: MapaCarteiraCardProps) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title"><PieIcon size={15} />Mapa da Carteira</h2>
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          {selectedSector && (
            <button onClick={() => setSelectedSector(null)}
              className="px-2 py-1 rounded-md border border-zinc-700 hover:text-zinc-300 transition-colors">
              ← {selectedSector}
            </button>
          )}
          {selectedClass && (
            <button onClick={() => { setSelectedClass(null); setSelectedSector(null); }}
              className="px-2 py-1 rounded-md border border-zinc-700 hover:text-zinc-300 transition-colors">
              ← Todos
            </button>
          )}
          {!selectedClass && <span>Clique nos anéis para filtrar</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 flex justify-center">
          <SunburstChart
            level1={sunburstData.level1}
            level2={nestedMiddle}
            level3={nestedOuter}
            size={560}
            selectedClass={selectedClass}
            selectedSector={selectedSector}
            onSelectClass={setSelectedClass}
            onSelectSector={setSelectedSector}
          />
        </div>

        {/* Unified sidebar: Class + Sector + Assets */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          {/* Class breakdown */}
          <div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold mb-2.5">Classe</p>
            <div className="space-y-2.5">
              {sunburstData.level1.map((s: any) => (
                <div key={s.name} className="cursor-pointer group"
                  onClick={() => { setSelectedClass(selectedClass === s.name ? null : s.name); setSelectedSector(null); }}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-opacity"
                        style={{ backgroundColor: s.color, opacity: selectedClass && selectedClass !== s.name ? 0.25 : 1 }} />
                      <span className="text-xs text-zinc-300 group-hover:text-zinc-100 font-medium transition-colors"
                        style={{ opacity: selectedClass && selectedClass !== s.name ? 0.35 : 1 }}>{s.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-400">{compactBRL(s.value)}</span>
                      <span className="text-xs font-mono font-bold tabular-nums transition-opacity"
                        style={{ color: s.color, opacity: selectedClass && selectedClass !== s.name ? 0.25 : 1 }}>
                        {s.pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="h-1 rounded-full bg-zinc-800/60 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${s.pct}%`, backgroundColor: s.color, opacity: selectedClass && selectedClass !== s.name ? 0.2 : 0.7 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />

          {/* Sector breakdown */}
          <div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold mb-2">
              Setores{selectedClass ? ` · ${selectedClass === "Renda Variável" ? "RV" : "RF"}` : ""}
            </p>
            <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 200 }}>
              {nestedMiddle.map((s: any) => (
                <div key={s.name} className="flex items-center justify-between cursor-pointer group py-0.5"
                  onClick={() => { setSelectedClass(s.parentName); setSelectedSector(selectedSector === s.name ? null : s.name); }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0 transition-opacity"
                      style={{ backgroundColor: s.color, opacity: selectedSector && selectedSector !== s.name ? 0.25 : 1 }} />
                    <span className="text-[11px] text-zinc-500 group-hover:text-zinc-300 transition-colors"
                      style={{ opacity: selectedSector && selectedSector !== s.name ? 0.35 : 1 }}>{s.name}</span>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums transition-opacity"
                    style={{ color: s.color, opacity: selectedSector && selectedSector !== s.name ? 0.25 : 1 }}>
                    {s.pct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Assets */}
          {nestedOuter.length > 0 && (
            <>
              <div className="h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold mb-2">
                  Ativos{selectedSector ? ` · ${selectedSector}` : ""}
                </p>
                <div className="space-y-1 overflow-y-auto" style={{ maxHeight: 160 }}>
                  {nestedOuter.map((s: any, i: number) => (
                    <div key={`leg-out-${i}`} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="text-[10px] text-zinc-600">{s.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500 tabular-nums">{s.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

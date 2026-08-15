"use client";

// Extraído de app/resumo/page.tsx — Mapa da Carteira: sunburst HIERÁRQUICO
// (classe → setor → ativo, zoom animado) + sidebar com breakdown clicável +
// popup-dossiê do ativo (clique no anel externo ou na lista; dados reais da
// posição via prop positions).

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PieChart as PieIcon, X } from "lucide-react";
import SunburstChart from "@/components/SunburstChart";
import { brl, compactBRL } from "@/lib/format";

interface PosicaoDossie {
  ticker: string; setor: string; moeda: string; quantidade: number;
  precoAtual: number | null; valorAtualBRL: number; custoTotalBRL: number;
  lucroBRL: number | null; lucroPct: number | null; proventosBRL: number;
  retornoTotalPct: number | null;
}

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
  positions?: PosicaoDossie[];
}

export default function MapaCarteiraCard({
  sunburstData, nestedMiddle, nestedOuter,
  selectedClass, selectedSector, setSelectedClass, setSelectedSector,
  positions = [],
}: MapaCarteiraCardProps) {
  const [ativoSel, setAtivoSel] = useState<string | null>(null);

  useEffect(() => {
    if (!ativoSel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAtivoSel(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ativoSel]);

  const base = (t: string) => t.toUpperCase().replace(/\.SA$/, "").trim();
  const abrirAtivo = (name: string) => setAtivoSel(name);
  const posDo = (name: string | null) =>
    name ? positions.find(p => base(p.ticker) === base(name)) ?? null : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const noDo = (name: string | null): any =>
    name ? sunburstData.level3.find((a: any) => base(a.name) === base(name)) ?? null : null;

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
            level2={sunburstData.level2}
            level3={sunburstData.level3}
            size={560}
            selectedClass={selectedClass}
            selectedSector={selectedSector}
            onSelectClass={setSelectedClass}
            onSelectSector={setSelectedSector}
            onSelectAsset={abrirAtivo}
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
                    <div key={`leg-out-${i}`} className="flex items-center justify-between cursor-pointer hover:bg-white/[0.04] rounded px-1 -mx-1 transition-colors"
                      onClick={() => abrirAtivo(s.name)}>
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

      {/* Popup-dossiê do ativo */}
      {ativoSel && typeof document !== "undefined" && (() => {
        const pos = posDo(ativoSel);
        const node = noDo(ativoSel);
        const linhas: Array<{ rotulo: string; valor: string; cor?: string }> = [];
        if (node) linhas.push({ rotulo: "Fatia do portfólio", valor: `${node.pct.toFixed(1).replace(".", ",")}%` });
        if (pos) {
          if (pos.quantidade > 0 && pos.precoAtual != null) {
            linhas.push({ rotulo: "Posição", valor: `${pos.quantidade.toLocaleString("pt-BR")} × ${pos.precoAtual.toLocaleString(pos.moeda === "BRL" ? "pt-BR" : "en-US", { minimumFractionDigits: 2 })}` });
          }
          linhas.push({ rotulo: "Custo", valor: brl(pos.custoTotalBRL) });
          if (pos.lucroBRL != null) linhas.push({
            rotulo: "Lucro (preço)", cor: pos.lucroBRL >= 0 ? "#34d399" : "#f87171",
            valor: `${pos.lucroBRL >= 0 ? "+" : ""}${brl(pos.lucroBRL)}${pos.lucroPct != null ? ` (${pos.lucroPct >= 0 ? "+" : ""}${pos.lucroPct.toFixed(1).replace(".", ",")}%)` : ""}`,
          });
          if (pos.proventosBRL > 0) linhas.push({ rotulo: "Proventos recebidos", valor: `+${brl(pos.proventosBRL)}`, cor: "#34d399" });
          if (pos.retornoTotalPct != null) linhas.push({
            rotulo: "Retorno total", cor: pos.retornoTotalPct >= 0 ? "#34d399" : "#f87171",
            valor: `${pos.retornoTotalPct >= 0 ? "+" : ""}${pos.retornoTotalPct.toFixed(1).replace(".", ",")}%`,
          });
        }
        return createPortal(
          <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4 animate-fade-in"
            style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(4px)" }} onClick={() => setAtivoSel(null)}>
            <div className="flex w-full flex-col overflow-hidden shadow-2xl sm:max-w-sm"
              style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, maxHeight: "80vh", paddingBottom: "env(safe-area-inset-bottom)" }}
              onClick={ev => ev.stopPropagation()}>
              <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="min-w-0">
                  <span className="block truncate text-sm font-bold" style={{ color: "var(--text)" }}>{ativoSel}</span>
                  <span className="text-[10px] text-zinc-600">{pos?.setor ?? node?.parentName ?? ""}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-extrabold text-zinc-200">{node ? compactBRL(node.value) : pos ? compactBRL(pos.valorAtualBRL) : ""}</span>
                  <button onClick={() => setAtivoSel(null)} aria-label="Fechar" className="rounded-md p-1 opacity-70 transition-opacity hover:opacity-100" style={{ color: "var(--muted)" }}><X size={16} /></button>
                </div>
              </div>
              <div className="overflow-y-auto px-5 py-4">
                <div className="flex flex-col gap-1.5 text-[12px]">
                  {linhas.map(l => (
                    <div key={l.rotulo} className="flex justify-between gap-3">
                      <span className="text-zinc-500">{l.rotulo}</span>
                      <span className="font-mono font-semibold" style={{ color: l.cor ?? "var(--text)" }}>{l.valor}</span>
                    </div>
                  ))}
                  {linhas.length === 0 && <p className="text-zinc-500">Sem detalhes de posição para este item.</p>}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        );
      })()}
    </div>
  );
}

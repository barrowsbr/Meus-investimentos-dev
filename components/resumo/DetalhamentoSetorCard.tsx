"use client";

// Extraído de app/resumo/page.tsx — Detalhamento por Setor (lista expansível
// até o ativo, com barra de percentual e retorno por posição).

import React from "react";
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import { compactBRL } from "@/lib/format";
import { sectorEconColor, type SetoresApiData } from "@/components/resumo/shared";

interface DetalhamentoSetorCardProps {
  sd: SetoresApiData;
  expandedSectors: Set<string>;
  setExpandedSectors: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export default function DetalhamentoSetorCard({ sd, expandedSectors, setExpandedSectors }: DetalhamentoSetorCardProps) {
  const toggleSector = (setor: string) => {
    setExpandedSectors(prev => {
      const next = new Set(prev);
      if (next.has(setor)) next.delete(setor); else next.add(setor);
      return next;
    });
  };
  return (
    <div className="glass-card p-4">
      <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3">
        Detalhamento por Setor ({sd.sectors.length})
      </h3>
      <div className="space-y-0.5">
        {sd.sectors.map(s => {
          const isExpanded = expandedSectors.has(s.setor);
          return (
            <div key={s.setor}>
              <button onClick={() => toggleSector(s.setor)}
                className="w-full flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                {isExpanded ? <ChevronDown size={10} className="text-zinc-500 shrink-0" /> : <ChevronRight size={10} className="text-zinc-500 shrink-0" />}
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sectorEconColor(s.setor) }} />
                <span className="text-xs font-semibold text-zinc-200 flex-1 text-left truncate">{s.setor}</span>
                <span className="text-[10px] text-zinc-600 font-mono shrink-0 w-6 text-right">{s.posicoes.length}</span>
                <span className="text-xs text-zinc-300 font-mono font-bold shrink-0 w-20 text-right">{compactBRL(s.valorBRL)}</span>
                <div className="w-14 shrink-0">
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(s.pct, 100)}%`, background: sectorEconColor(s.setor) }} />
                  </div>
                </div>
                <span className="text-xs text-zinc-400 font-mono shrink-0 w-12 text-right">{s.pct.toFixed(1)}%</span>
              </button>
              {isExpanded && (
                <div className="ml-7 mr-1 mb-1.5">
                  {s.posicoes.map(p => {
                    const retTotal = p.retornoTotalPct ?? p.lucroPct;
                    const pos = retTotal >= 0;
                    return (
                      <div key={p.ticker} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-white/[0.02] transition-colors">
                        <span className="text-[11px] font-bold text-zinc-300 w-16 truncate">{p.ticker}</span>
                        <span className="text-[10px] text-zinc-600 flex-1 truncate">{p.nome !== p.ticker ? p.nome : p.industry}</span>
                        <span className="text-[10px] text-zinc-500 font-mono w-14 text-right">{compactBRL(p.valorBRL)}</span>
                        <span className="text-[10px] text-zinc-600 font-mono w-10 text-right">
                          {sd.totalBRL > 0 ? ((p.valorBRL / sd.totalBRL) * 100).toFixed(1) : "0.0"}%
                        </span>
                        {p.tipo === "RV" ? (
                          <span className={`text-[10px] font-mono font-bold w-14 text-right flex items-center justify-end gap-0.5 ${pos ? "text-emerald-400" : "text-red-400"}`}>
                            {pos ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                            {retTotal !== 0 ? `${pos ? "+" : ""}${retTotal.toFixed(1)}%` : "—"}
                          </span>
                        ) : (
                          <span className="text-[10px] text-zinc-600 w-14 text-right">{p.moeda}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

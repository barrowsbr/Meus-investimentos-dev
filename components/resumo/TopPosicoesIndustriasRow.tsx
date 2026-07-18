"use client";

// Extraído de app/resumo/page.tsx — linha com os cards Top 15 Posições e
// Top Indústrias (aba Alocação).

import React from "react";
import { compactBRL } from "@/lib/format";
import { sectorEconColor, type SetoresApiData } from "@/components/resumo/shared";

interface TopPosicoesIndustriasRowProps {
  sd: SetoresApiData;
  sectorIndustryBreakdown: { industry: string; setor: string; valorBRL: number; count: number }[];
}

export default function TopPosicoesIndustriasRow({ sd, sectorIndustryBreakdown }: TopPosicoesIndustriasRowProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="glass-card p-4">
        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Top 15 Posições</h3>
        <div className="space-y-0.5">
          {sd.positions.slice(0, 15).map((p, i) => {
            const posPct = sd.totalBRL > 0 ? (p.valorBRL / sd.totalBRL) * 100 : 0;
            return (
              <div key={p.ticker} className="flex items-center gap-2 py-1">
                <span className="text-[10px] text-zinc-700 font-mono w-4 text-right">{i + 1}</span>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sectorEconColor(p.setorEconomico) }} />
                <span className="text-[11px] font-bold text-zinc-200 w-16 truncate">{p.ticker}</span>
                <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(posPct * 2.5, 100)}%`, background: sectorEconColor(p.setorEconomico), opacity: 0.6 }} />
                </div>
                <span className="text-[10px] text-zinc-400 font-mono w-10 text-right">{posPct.toFixed(1)}%</span>
                <span className="text-[10px] text-zinc-500 font-mono w-14 text-right">{compactBRL(p.valorBRL)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {sectorIndustryBreakdown.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Top Indústrias</h3>
          <div className="space-y-0.5">
            {sectorIndustryBreakdown.slice(0, 15).map(ind => (
              <div key={`${ind.setor}|${ind.industry}`} className="flex items-center gap-2 py-1 px-1">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sectorEconColor(ind.setor) }} />
                <span className="text-[11px] text-zinc-300 flex-1 truncate">{ind.industry}</span>
                <span className="text-[9px] text-zinc-700 shrink-0">{ind.count}</span>
                <span className="text-[11px] text-zinc-300 font-mono font-bold shrink-0 w-16 text-right">{compactBRL(ind.valorBRL)}</span>
                <span className="text-[10px] text-zinc-500 font-mono shrink-0 w-10 text-right">
                  {sd.totalBRL > 0 ? ((ind.valorBRL / sd.totalBRL) * 100).toFixed(1) : "0.0"}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

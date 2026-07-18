"use client";

// Extraído de app/resumo/page.tsx — cabeçalho da aba Alocação: lente Padrão ×
// ETFs abertos + métricas (patrimônio, alocação, diversificação, concentração).

import React from "react";
import { Eye, Layers, Loader2 } from "lucide-react";
import { compactBRL } from "@/lib/format";
import type { SetoresApiData, SetoresStats } from "@/components/resumo/shared";

interface AlocacaoHeaderCardProps {
  sd: SetoresApiData;
  setoresStats: SetoresStats;
  sectorConsolidated: boolean;
  setSectorConsolidated: (v: boolean) => void;
  setoresLtLoading: boolean;
  ltMeta: SetoresApiData["lookthrough"];
}

export default function AlocacaoHeaderCard({
  sd, setoresStats, sectorConsolidated, setSectorConsolidated, setoresLtLoading, ltMeta,
}: AlocacaoHeaderCardProps) {
  const rvP = sd.totalBRL > 0 ? (sd.rvBRL / sd.totalBRL) * 100 : 0;
  const rfP = sd.totalBRL > 0 ? (sd.rfBRL / sd.totalBRL) * 100 : 0;
  return (
    <div className="glass-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--line)" }}>
          <button onClick={() => setSectorConsolidated(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors"
            style={{ background: !sectorConsolidated ? "var(--accent-wash)" : "transparent", color: !sectorConsolidated ? "var(--accent)" : "var(--muted)" }}>
            <Eye size={11} /> Padrão
          </button>
          <button onClick={() => setSectorConsolidated(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors"
            style={{ background: sectorConsolidated ? "rgba(139,92,246,0.12)" : "transparent", color: sectorConsolidated ? "#a78bfa" : "var(--muted)" }}>
            <Layers size={11} /> ETFs abertos
          </button>
        </div>
        {sectorConsolidated && setoresLtLoading && (
          <span className="flex items-center gap-1.5 text-[10px] text-zinc-500"><Loader2 size={11} className="animate-spin" /> decompondo ETFs…</span>
        )}
        {sectorConsolidated && !setoresLtLoading && ltMeta && (
          <span className="text-[10px] text-zinc-600">
            {ltMeta.supported.length} ETF{ltMeta.supported.length !== 1 ? "s" : ""} decompostos
            {ltMeta.unsupported.length > 0 && ` · ${ltMeta.unsupported.length} sem dados`}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Patrimônio</div>
          <div className="text-sm font-bold text-zinc-100">{compactBRL(sd.totalBRL)}</div>
        </div>
        <div>
          <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Alocação</div>
          <div className="text-sm font-bold">
            <span className="text-blue-400">{rvP.toFixed(0)}% RV</span>
            <span className="text-zinc-600 mx-1">·</span>
            <span className="text-teal-400">{rfP.toFixed(0)}% RF</span>
          </div>
        </div>
        <div>
          <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Diversificação</div>
          <div className="text-sm font-bold text-zinc-200">{sd.sectors.length} setores · {sd.positions.length} ativos</div>
        </div>
        <div>
          <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Concentração</div>
          <div className="text-sm font-bold text-zinc-200">
            Top 3 {setoresStats.top3.toFixed(0)}%
            <span className="text-[10px] text-zinc-600 ml-1">N eff {setoresStats.effN.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {sectorConsolidated && ltMeta && (
        <div className="rounded-lg px-3 py-2 mt-3 flex items-start gap-2" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
          <Layers size={12} className="text-violet-400 mt-0.5 shrink-0" />
          <p className="text-[10px] text-zinc-500 leading-relaxed">
            ETFs decompostos nos ativos subjacentes.
            {ltMeta.supported.length > 0 && <> <b className="text-zinc-400">{ltMeta.supported.join(", ")}</b>.</>}
            {ltMeta.unsupported.length > 0 && <> Sem dados: <b className="text-zinc-400">{ltMeta.unsupported.join(", ")}</b>.</>}
          </p>
        </div>
      )}
    </div>
  );
}

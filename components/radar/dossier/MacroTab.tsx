"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import type { CountryMacro } from "@/lib/radar/types";
import { formatMacro } from "./format-macro";

export default function MacroTab({ macro, loading }: { macro: CountryMacro | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-zinc-500">
        <Loader2 size={16} className="animate-spin" /> Carregando macro…
      </div>
    );
  }
  if (!macro || macro.indicators.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-zinc-500">
        Sem dados macro (World Bank) para este país.
        {macro?.teUrl && (
          <a href={macro.teUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-blue-400 hover:underline">
            Ver no Trading Economics <ExternalLink size={11} />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-2">
        {macro.indicators.map((ind) => (
          <div key={ind.id} className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">{ind.label}</p>
            <p className="mt-0.5 font-mono text-sm font-semibold text-zinc-100">{formatMacro(ind.value, ind.format)}</p>
            {ind.year && <p className="text-[9px] text-zinc-600">{ind.year}</p>}
          </div>
        ))}
      </div>

      {macro.exchangeRate?.vsBRL != null && macro.currency && macro.currency !== "BRL" && (
        <div className="rounded-xl px-3 py-2.5 text-xs text-zinc-400" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="text-zinc-500">Câmbio: </span>
          1 {macro.currency} = R$ {macro.exchangeRate.vsBRL.toFixed(4)}
        </div>
      )}

      {macro.teUrl && (
        <a href={macro.teUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline">
          Detalhes no Trading Economics <ExternalLink size={11} />
        </a>
      )}
      <p className="text-[10px] text-zinc-600">Fonte: World Bank · valor mais recente disponível.</p>
    </div>
  );
}

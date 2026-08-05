"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TransmissaoPanel — o Mapa de Transmissão Macro DENTRO do Radar. Abre no lugar
// do mapa (mesmo posicionamento do CommoditiesPanel) e reusa a vista compartilhada
// (DivergenceView). O relatório vem do RadarShell (mesmo fetch do badge do rail),
// então não há chamada duplicada. O painel força as CSS vars ESCURAS no seu
// escopo — assim a vista fica coerente com o Radar mesmo em tema claro (creme).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { ArrowLeft, RefreshCw, Network } from "lucide-react";
import type { DivergenceReport } from "@/lib/macro-map/types";
import { DivergenceView } from "@/components/macro-map/DivergenceView";

// Escopo escuro: sobrepõe as vars de tema só neste subtree.
const DARK_SCOPE = {
  "--panel": "#0e0e12",
  "--line": "rgba(255,255,255,0.08)",
  "--text": "#e4e4e7",
  "--text-2": "#a1a1aa",
  "--muted": "#8b8b93",
  "--faint": "#6b6b73",
} as React.CSSProperties;

export default function TransmissaoPanel({
  report, loading, erro, onReload, onClose, dossierOpen = false,
}: {
  report: DivergenceReport | null;
  loading: boolean;
  erro: string | null;
  onReload: () => void;
  onClose: () => void;
  dossierOpen?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const anomalias = report?.resumo.anomalo ?? 0;

  return (
    <div
      className={`fixed inset-0 z-[65] flex flex-col overflow-hidden md:absolute md:inset-y-0 md:left-0 md:z-[64] md:rounded-2xl ${dossierOpen ? "md:right-[380px]" : "md:right-0"}`}
      style={{ ...DARK_SCOPE, background: "radial-gradient(120% 100% at 50% 0%, #0d1018 0%, #070912 70%)", paddingTop: "env(safe-area-inset-top)" }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <button
          onClick={onClose}
          className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/10"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <ArrowLeft size={14} /> Mapa
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Network size={15} className="shrink-0 text-amber-400" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-zinc-100">
              Transmissão Macro
              {anomalias > 0 && (
                <span className="ml-2 rounded-full px-1.5 py-0.5 align-middle font-mono text-[10px] font-bold" style={{ background: "rgba(232,163,61,0.18)", color: "#E8A33D", border: "1px solid rgba(232,163,61,0.4)" }}>
                  {anomalias} anomalia{anomalias > 1 ? "s" : ""}
                </span>
              )}
            </h2>
            <p className="truncate text-[10px] text-zinc-500">Detector de divergência — o que deveria acontecer vs. o que aconteceu (EUA/Brasil)</p>
          </div>
        </div>
        <button
          onClick={onReload}
          disabled={loading}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 disabled:opacity-40"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          title="Atualizar"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-4">
        <div className="mx-auto max-w-3xl">
          <DivergenceView report={report} loading={loading} erro={erro} />
        </div>
      </div>
    </div>
  );
}

"use client";

// Extraído de app/performance/page.tsx — aba Previsões: seletor de método
// econométrico + execução e resultado (estado continua na página).

import React from "react";
import { Activity, Play, Loader2 } from "lucide-react";
import { PRED_METHODS, PredResultChart, type PredResult } from "@/components/performance/PredicaoCharts";

export default function PrevisoesTab({
  predMethod, setPredMethod, predResult, setPredResult, predLoading, predError, setPredError, runPrediction,
}: {
  predMethod: string;
  setPredMethod: React.Dispatch<React.SetStateAction<string>>;
  predResult: PredResult;
  setPredResult: React.Dispatch<React.SetStateAction<PredResult>>;
  predLoading: boolean;
  predError: string | null;
  setPredError: React.Dispatch<React.SetStateAction<string | null>>;
  runPrediction: () => void;
}) {
  return (
    <div className="glass-card p-5">
      <h2 className="section-title mb-4"><Activity size={15} />Previsões — Modelos Econométricos</h2>

      {/* Method selector + run */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {PRED_METHODS.map(m => (
          <button key={m.id} onClick={() => { setPredMethod(m.id); setPredResult(null); setPredError(null); }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all border ${
              predMethod === m.id
                ? "text-zinc-100 border-opacity-50"
                : "text-zinc-500 hover:text-zinc-300 border-zinc-800/50 bg-zinc-900/40"
            }`}
            style={predMethod === m.id ? { background: `${m.color}15`, borderColor: `${m.color}40`, color: m.color } : {}}>
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={predMethod === m.id ? { background: `${m.color}20` } : { background: "rgba(63,63,70,0.3)" }}>
              {m.tag}
            </span>
            {m.title}
          </button>
        ))}
        <button onClick={runPrediction} disabled={predLoading}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 disabled:opacity-50">
          {predLoading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {predLoading ? "Calculando..." : "Executar"}
        </button>
      </div>

      {/* Method detail */}
      {(() => {
        const m = PRED_METHODS.find(x => x.id === predMethod)!;
        return (
          <p className="text-[10px] text-zinc-600 font-mono mb-4">
            {m.detail} · Fonte: db_cotacoes · Horizonte padrão: 252 dias úteis · Confiança: 95%
          </p>
        );
      })()}

      {/* Error */}
      {predError && (
        <div className="rounded-lg p-3 mb-4 text-[11px] text-red-400 bg-red-500/8 border border-red-500/15">
          {predError}
        </div>
      )}

      {/* Result */}
      {predResult && <PredResultChart methodId={predMethod} data={predResult} />}

      {/* Empty state */}
      {!predResult && !predLoading && !predError && (
        <div className="w-full aspect-[16/7] rounded-lg border border-zinc-800/30 bg-zinc-900/20 flex items-center justify-center">
          <span className="text-[11px] text-zinc-600 font-mono">Selecione um método e clique em Executar</span>
        </div>
      )}
    </div>
  );
}

"use client";

// Extraído de app/configuracoes/page.tsx — helpers compartilhados pelas seções
// de Configurações (API_URL e a linha de liga/desliga ToggleRow).

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// Linha de liga/desliga reutilizável (título + descrição + toggle ON/OFF).
export function ToggleRow({ title, desc, on, onToggle, disabled }: {
  title: string; desc: string; on: boolean; onToggle: () => void; disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 transition-opacity ${disabled ? "opacity-40" : ""}`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-200">{title}</p>
        <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{desc}</p>
      </div>
      <label className={`flex items-center gap-2 select-none shrink-0 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
        <div
          className={`rounded-full transition-colors relative ${on ? "bg-emerald-500" : "bg-zinc-600"}`}
          style={{ width: 40, height: 22 }}
          onClick={() => !disabled && onToggle()}
        >
          <div className="absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-all" style={{ left: on ? 20 : 2 }} />
        </div>
        <span className={`text-xs font-mono font-bold ${on ? "text-emerald-400" : "text-zinc-500"}`}>{on ? "ON" : "OFF"}</span>
      </label>
    </div>
  );
}

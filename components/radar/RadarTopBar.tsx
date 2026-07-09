"use client";

import { useState } from "react";
import { Radar as RadarIcon, Search, Circle, Command, Globe } from "lucide-react";
import WorldMonitorModal from "@/components/WorldMonitorModal";

interface Props {
  lastUpdate?: string;
}

// Abre o Command Palette (⌘K) — a busca única do Radar: países, ações e índices.
function openPalette() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
}

export default function RadarTopBar({ lastUpdate }: Props) {
  const [wmOpen, setWmOpen] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:h-9 sm:w-9" style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)" }}>
          <RadarIcon size={16} className="text-blue-400 sm:hidden" />
          <RadarIcon size={18} className="hidden text-blue-400 sm:block" />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-bold leading-tight text-zinc-50 sm:text-lg">Radar</h1>
          <p className="hidden text-[11px] text-zinc-500 sm:block">Mapa como produto · clique num país para o dossiê</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {lastUpdate && (
          <span className="hidden items-center gap-1.5 text-[11px] text-zinc-500 sm:flex">
            <Circle size={7} className="animate-pulse fill-emerald-400 text-emerald-400" />
            {new Date(lastUpdate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <button
          type="button"
          onClick={() => setWmOpen(true)}
          title="World Monitor — monitor global ao vivo (abre embutido no app)"
          className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-[11px] text-zinc-500 transition-colors hover:border-cyan-500/40 hover:text-cyan-300 sm:px-2.5"
        >
          <Globe size={13} />
          <span className="hidden lg:inline">World Monitor</span>
        </button>
        <WorldMonitorModal open={wmOpen} onClose={() => setWmOpen(false)} />

        {/* Barra de busca ÚNICA — abre o Command Palette (⌘K), que busca países,
            ações e índices. Antes eram duas coisas (barra só de países + botão
            ⌘K); agora é só a barra e ela abre o popup. */}
        <button
          onClick={openPalette}
          title="Buscar país, ação ou índice (⌘K)"
          className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 py-1.5 pl-3 pr-2 text-xs text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300 sm:pr-3"
        >
          <Search size={14} className="shrink-0 text-zinc-600" />
          <span className="hidden text-left sm:inline sm:w-40 md:w-48">Buscar país, ação, índice…</span>
          <span className="hidden items-center gap-0.5 rounded border border-zinc-700/70 px-1 py-0.5 text-[9px] text-zinc-500 sm:flex">
            <Command size={9} />K
          </span>
        </button>
      </div>
    </div>
  );
}

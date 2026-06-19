"use client";

import { useMemo, useState } from "react";
import { Radar as RadarIcon, Search, Circle, Command } from "lucide-react";
import { COUNTRY_TO_ISO_NUM } from "@/lib/world-map";

// Países pesquisáveis = os que o mapa sabe abrir (têm ISO numérico).
const COUNTRIES = Object.keys(COUNTRY_TO_ISO_NUM)
  .filter((c) => c !== "Europa")
  .sort((a, b) => a.localeCompare(b, "pt"));

interface Props {
  lastUpdate?: string;
  onPickCountry: (name: string) => void;
}

export default function RadarTopBar({ lastUpdate, onPickCountry }: Props) {
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);

  const results = useMemo(() => {
    if (!q.trim()) return [];
    const s = q.toLowerCase();
    return COUNTRIES.filter((c) => c.toLowerCase().includes(s)).slice(0, 8);
  }, [q]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)" }}>
          <RadarIcon size={18} className="text-blue-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight text-zinc-50">Radar</h1>
          <p className="text-[11px] text-zinc-500">Mapa como produto · clique num país para o dossiê</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {lastUpdate && (
          <span className="hidden items-center gap-1.5 text-[11px] text-zinc-500 sm:flex">
            <Circle size={7} className="animate-pulse fill-emerald-400 text-emerald-400" />
            {new Date(lastUpdate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
          className="hidden items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-[11px] text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300 sm:flex"
        >
          <Command size={11} />K
        </button>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Buscar país…"
            className="w-36 rounded-lg border border-zinc-800 bg-zinc-900/60 py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none sm:w-56"
          />
          {focused && results.length > 0 && (
            <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 shadow-xl backdrop-blur">
              {results.map((c) => (
                <button
                  key={c}
                  onMouseDown={() => { onPickCountry(c); setQ(""); }}
                  className="block w-full px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-white/5"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

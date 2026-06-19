"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Command Palette (⌘K) — navegação por intenção no Radar. Busca países,
// camadas e ações rápidas. Fase 3 do doc de visão.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Globe, BarChart3, ArrowLeftRight, Shield,
  MapPin, Newspaper, Brain,
} from "lucide-react";
import { COUNTRY_TO_ISO_NUM } from "@/lib/world-map";
import type { RadarLayer } from "@/lib/radar/types";

interface CommandItem {
  id: string;
  label: string;
  sublabel?: string;
  icon: typeof Globe;
  action: () => void;
  category: string;
}

const COUNTRIES = Object.keys(COUNTRY_TO_ISO_NUM)
  .filter((c) => c !== "Europa")
  .sort((a, b) => a.localeCompare(b, "pt"));

interface Props {
  onPickCountry: (name: string) => void;
  onSetLayer: (layer: RadarLayer) => void;
}

export default function CommandPalette({ onPickCountry, onSetLayer }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery("");
        setSelectedIdx(0);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const execute = useCallback((item: CommandItem) => {
    item.action();
    setOpen(false);
    setQuery("");
  }, []);

  const items = useMemo<CommandItem[]>(() => {
    const all: CommandItem[] = [];

    // Layer commands
    all.push(
      { id: "layer-mercados", label: "Camada: Mercados", sublabel: "Variação dos índices locais", icon: BarChart3, action: () => onSetLayer("mercados"), category: "Camadas" },
      { id: "layer-cambio", label: "Camada: Câmbio", sublabel: "Força da moeda vs USD", icon: ArrowLeftRight, action: () => onSetLayer("cambio"), category: "Camadas" },
      { id: "layer-risco", label: "Camada: Risco", sublabel: "Índice de instabilidade", icon: Shield, action: () => onSetLayer("instabilidade"), category: "Camadas" },
    );

    // Country commands
    for (const c of COUNTRIES) {
      all.push({
        id: `country-${c}`,
        label: c,
        sublabel: "Abrir dossiê",
        icon: MapPin,
        action: () => onPickCountry(c),
        category: "Países",
      });
    }

    if (!query.trim()) return all.slice(0, 12);

    const q = query.toLowerCase();
    return all.filter((item) =>
      item.label.toLowerCase().includes(q) ||
      item.sublabel?.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    ).slice(0, 12);
  }, [query, onPickCountry, onSetLayer]);

  useEffect(() => { setSelectedIdx(0); }, [query]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && items[selectedIdx]) {
      e.preventDefault();
      execute(items[selectedIdx]);
    }
  }, [items, selectedIdx, execute]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  if (!open) return null;

  let lastCategory = "";

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: "rgba(14,16,24,0.98)", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <Search size={16} className="shrink-0 text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar país, camada ou ação…"
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none"
          />
          <kbd className="hidden rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 sm:inline">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-72 overflow-y-auto py-2">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-zinc-500">Nenhum resultado</p>
          ) : (
            items.map((item, i) => {
              const showCategory = item.category !== lastCategory;
              lastCategory = item.category;
              const Icon = item.icon;
              const isSelected = i === selectedIdx;
              return (
                <div key={item.id}>
                  {showCategory && (
                    <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                      {item.category}
                    </p>
                  )}
                  <button
                    onClick={() => execute(item)}
                    onMouseEnter={() => setSelectedIdx(i)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors"
                    style={{ background: isSelected ? "rgba(59,130,246,0.1)" : "transparent" }}
                  >
                    <Icon size={14} className={isSelected ? "text-blue-400" : "text-zinc-500"} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${isSelected ? "text-zinc-100" : "text-zinc-300"}`}>{item.label}</p>
                      {item.sublabel && <p className="truncate text-[11px] text-zinc-600">{item.sublabel}</p>}
                    </div>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/5 px-4 py-2 text-[10px] text-zinc-600">
          <span className="mr-3">↑↓ navegar</span>
          <span className="mr-3">↵ selecionar</span>
          <span>esc fechar</span>
        </div>
      </div>
    </div>
  );
}

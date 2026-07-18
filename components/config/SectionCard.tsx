"use client";

// Extraído de app/configuracoes/page.tsx — card retrátil das Configurações
// (com chips de status no cabeçalho e persistência dos cards abertos na sessão).

import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";

// Chip de status no cabeçalho do card — mostra o estado SEM precisar abrir.
export type CardChip = { label: string; tone: "ok" | "warn" | "off" | "muted" };

const CHIP_TONE: Record<CardChip["tone"], React.CSSProperties> = {
  ok:    { background: "rgba(63,185,80,0.10)",  border: "1px solid rgba(63,185,80,0.35)",  color: "#3FB950" },
  warn:  { background: "rgba(232,163,61,0.10)", border: "1px solid rgba(232,163,61,0.35)", color: "#E8A33D" },
  off:   { background: "rgba(240,80,74,0.08)",  border: "1px solid rgba(240,80,74,0.30)",  color: "#F0504A" },
  muted: { background: "rgba(128,128,128,0.08)", border: "1px solid var(--line-strong)",   color: "var(--muted)" },
};

// Cards abertos persistem na sessão do navegador — voltar pra página mantém o contexto.
const OPEN_KEY = "cfg-open-cards";
function readOpenSet(): Set<string> {
  try { return new Set(JSON.parse(sessionStorage.getItem(OPEN_KEY) ?? "[]")); } catch { return new Set(); }
}

export function SectionCard({ id, title, desc, icon, chips, children, defaultOpen = false }: {
  id?: string;
  title: string;
  desc?: string;
  icon: React.ReactNode;
  chips?: CardChip[];
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (id && readOpenSet().has(id)) setOpen(true);
  }, [id]);

  const toggle = () => setOpen((o) => {
    const n = !o;
    if (id) {
      try {
        const set = readOpenSet();
        if (n) set.add(id); else set.delete(id);
        sessionStorage.setItem(OPEN_KEY, JSON.stringify([...set]));
      } catch { /* ignore */ }
    }
    return n;
  });

  return (
    <div className="glass-card overflow-hidden mb-3 transition-colors hover:border-zinc-700/70">
      <button className="w-full flex items-center gap-3 p-4 sm:px-5 text-left hover:bg-white/[0.02] transition-colors" onClick={toggle}>
        <span className="text-zinc-400 shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-zinc-200 text-sm truncate">{title}</span>
          {desc && <span className="block text-[11px] text-zinc-600 truncate mt-0.5">{desc}</span>}
        </span>
        {chips && chips.length > 0 && (
          <span className="hidden sm:flex items-center gap-1.5 shrink-0">
            {chips.map((c, i) => (
              <span key={i} className="rounded-full px-2 py-0.5 text-[10px] font-mono font-bold whitespace-nowrap" style={CHIP_TONE[c.tone]}>
                {c.label}
              </span>
            ))}
          </span>
        )}
        <ChevronDown size={15} className="text-zinc-500 shrink-0 transition-transform duration-200" style={{ transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && (
        <div className="px-4 sm:px-5 pb-5 border-t border-zinc-800/50 pt-4">
          {/* Chips visíveis no mobile quando aberto (no fechado economizam espaço) */}
          {chips && chips.length > 0 && (
            <div className="sm:hidden flex flex-wrap gap-1.5 mb-3">
              {chips.map((c, i) => (
                <span key={i} className="rounded-full px-2 py-0.5 text-[10px] font-mono font-bold" style={CHIP_TONE[c.tone]}>{c.label}</span>
              ))}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

"use client";

// Linha retrátil das Configurações (lista agrupada estilo iOS). Renderiza como
// UMA LINHA dentro de um contêiner de grupo — sem card próprio: ícone em tile
// tingido com a cor do grupo (amarra visualmente), título + descrição, chips de
// status e conteúdo que expande logo abaixo. Cards abertos persistem na sessão.

import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";

// Chip de status no cabeçalho — mostra o estado SEM precisar abrir.
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

export function SectionCard({ id, title, desc, icon, cor = "var(--muted)", chips, children, defaultOpen = false }: {
  id?: string;
  title: string;
  desc?: string;
  icon: React.ReactNode;
  cor?: string;
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
    <div style={{ background: open ? "color-mix(in srgb, var(--fg) 3%, transparent)" : "transparent", transition: "background .2s" }}>
      <button
        className="w-full flex items-center gap-3 px-3.5 sm:px-4 py-3.5 text-left"
        onClick={toggle}
      >
        <span
          className="grid place-items-center rounded-xl shrink-0"
          style={{
            width: 36, height: 36,
            background: `color-mix(in srgb, ${cor} 13%, transparent)`,
            border: `1px solid color-mix(in srgb, ${cor} 32%, transparent)`,
            color: cor,
          }}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-[13.5px] leading-tight truncate" style={{ color: "var(--fg)" }}>{title}</span>
          {desc && <span className="block text-[11px] leading-snug mt-0.5 truncate" style={{ color: "var(--faint)" }}>{desc}</span>}
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
        <ChevronDown size={16} className="shrink-0 transition-transform duration-200" style={{ color: "var(--faint)", transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && (
        <div className="px-3.5 sm:px-4 pb-5 pt-0">
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

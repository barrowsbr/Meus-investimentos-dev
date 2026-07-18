"use client";

// Extraído de app/performance/page.tsx — legenda-filtro das séries do gráfico.

import React from "react";
import type { LucideIcon } from "lucide-react";

// ── Chart series legend-filter ────────────────────────────────────────────────
// O toggle É a legenda: cada botão mostra o traço na cor exata da sua linha no
// gráfico. Ativo = cor cheia + leve preenchimento; inativo = cinza apagado.

export function SeriesToggle({ active, color, label, dashed, onClick, icon: Icon, title }: {
  active: boolean;
  color: string;
  label: string;
  dashed?: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title ?? label}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md transition-all whitespace-nowrap"
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: active ? "var(--text)" : "var(--faint)",
        background: active ? `${color}1f` : "transparent",
        border: `1px solid ${active ? `${color}55` : "transparent"}`,
      }}
    >
      {Icon ? (
        <Icon size={12} className={active ? "" : "opacity-50"} />
      ) : (
        <span
          aria-hidden
          style={{
            width: 16,
            borderTop: `2px ${dashed ? "dashed" : "solid"} ${active ? color : "var(--line-strong)"}`,
            display: "inline-block",
          }}
        />
      )}
      {label}
    </button>
  );
}

export function LegendGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-mono select-none"
      style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" }}
    >
      {children}
    </span>
  );
}

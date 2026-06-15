"use client";

import type { ReactNode } from "react";

export interface PageTab {
  id: string;
  label: string;
}

interface Props {
  title: string;
  description?: string;
  /** Abas opcionais (underline 2px no ativo). */
  tabs?: PageTab[];
  activeTab?: string;
  onTab?: (id: string) => void;
  /** Slot à direita do título (ações, badges). */
  right?: ReactNode;
}

/**
 * PageHead do terminal: título 21px/700 + subtítulo --muted + abas opcionais.
 * (Antigo gradiente de texto removido — ver handoff Barroots Terminal §5.)
 */
export default function PageHeader({ title, description, tabs, activeTab, onTab, right }: Props) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3 min-w-0">
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, letterSpacing: "-.01em", color: "var(--text)" }}>
            {title}
          </h1>
          {description && (
            <span className="truncate" style={{ fontSize: 12.5, color: "var(--muted)" }}>
              {description}
            </span>
          )}
        </div>
        {right}
      </div>

      {tabs && tabs.length > 0 && (
        <div className="flex mt-3.5 overflow-x-auto scrollbar-hide" style={{ borderBottom: "1px solid var(--line)" }}>
          {tabs.map((t) => {
            const on = t.id === activeTab;
            return (
              <button
                key={t.id}
                onClick={() => onTab?.(t.id)}
                className="font-mono whitespace-nowrap"
                style={{
                  padding: "9px 16px",
                  marginBottom: -1,
                  borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`,
                  background: "transparent",
                  color: on ? "var(--text)" : "var(--muted)",
                  fontSize: 11.5,
                  fontWeight: 600,
                  letterSpacing: ".05em",
                  textTransform: "uppercase",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

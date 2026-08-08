"use client";

// Extraído de app/performance/page.tsx — legenda-filtro das séries do gráfico.

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BENCHES, benchColor, type BenchKey } from "@/components/performance/shared";

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

// ── Picker de benchmarks ─────────────────────────────────────────────────────
// Um botão só ("Benchmarks" + pontinhos das cores ativas) abrindo um popover
// com os grupos Brasil/Mundo — a linha de botões não cresce com o catálogo.
// Cada linha mostra o traço na cor da série, a nota e o acumulado do período.
export function BenchmarkPicker({ ativos, onToggle, isLight, isUsd, totais, dimmed }: {
  ativos: BenchKey[];
  onToggle: (key: BenchKey) => void;
  isLight: boolean;
  isUsd: boolean;
  totais: Partial<Record<BenchKey, number>>;
  /** Modo câmbio ativo: seleção guardada mas oculta no gráfico. */
  dimmed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Clamp de viewport: o painel ancora à esquerda do botão; em tela estreita
  // (iPhone) isso estouraria a borda direita — mede e desloca o necessário.
  const [shiftX, setShiftX] = useState(0);
  useEffect(() => {
    if (!open) { setShiftX(0); return; }
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const overflow = rect.right - (window.innerWidth - 12);
    if (overflow > 0) setShiftX(-Math.min(overflow, rect.left));
  }, [open]);

  // Fecha no clique fora e no Esc — popover leve, sem lib.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const visiveis = BENCHES.filter(b => !(isUsd && b.brlOnly));
  const ativosVisiveis = visiveis.filter(b => ativos.includes(b.key));
  const grupos: Array<"Brasil" | "Mundo"> = ["Brasil", "Mundo"];

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        title="Escolher benchmarks — todos convertidos para a moeda da visão"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md transition-all whitespace-nowrap"
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: ativosVisiveis.length > 0 && !dimmed ? "var(--text)" : "var(--faint)",
          background: open ? "rgba(128,128,128,0.12)" : "transparent",
          border: `1px solid ${open || ativosVisiveis.length > 0 ? "var(--line-strong)" : "transparent"}`,
          opacity: dimmed ? 0.55 : 1,
        }}
      >
        {/* Pontinhos das séries ativas — a legenda mora no próprio botão */}
        {ativosVisiveis.length > 0 ? (
          <span className="inline-flex items-center" style={{ gap: 3 }}>
            {ativosVisiveis.slice(0, 6).map(b => (
              <span key={b.key} aria-hidden style={{
                width: 7, height: 7, borderRadius: "50%",
                background: benchColor(b, isLight),
              }} />
            ))}
          </span>
        ) : null}
        Benchmarks{ativosVisiveis.length > 0 ? ` (${ativosVisiveis.length})` : ""}
        <ChevronDown size={12} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full mt-1.5 z-50 rounded-xl shadow-2xl"
          style={{
            transform: shiftX ? `translateX(${shiftX}px)` : undefined,
            width: 316,
            maxWidth: "calc(100vw - 24px)",
            background: isLight ? "#FDFAF1" : "rgba(17,17,20,0.97)",
            border: "1px solid var(--line-strong)",
            backdropFilter: "blur(12px)",
            padding: "10px 10px 8px",
          }}
        >
          {dimmed && (
            <p className="mb-2 rounded-md px-2 py-1.5" style={{ fontSize: 10.5, color: "var(--muted)", background: "rgba(128,128,128,0.09)" }}>
              Modo câmbio ativo — os benchmarks voltam ao desligá-lo (a seleção fica guardada).
            </p>
          )}
          {grupos.map(grupo => {
            const doGrupo = visiveis.filter(b => b.grupo === grupo);
            if (doGrupo.length === 0) return null;
            return (
              <div key={grupo} className="mb-1.5 last:mb-0">
                <p className="font-mono select-none px-1.5 pb-1" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" }}>
                  {grupo}
                </p>
                {doGrupo.map(b => {
                  const on = ativos.includes(b.key);
                  const cor = benchColor(b, isLight);
                  const total = totais[b.key];
                  return (
                    <button
                      key={b.key}
                      onClick={() => onToggle(b.key)}
                      title={b.nota}
                      className="w-full flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors"
                      style={{ background: on ? `${cor}14` : "transparent" }}
                    >
                      <span aria-hidden style={{ width: 18, flexShrink: 0, borderTop: `2px dashed ${on ? cor : "var(--line-strong)"}` }} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5" style={{ fontSize: 11.5, fontWeight: 600, color: on ? "var(--text)" : "var(--muted)" }}>
                          {b.label}
                          {on && <Check size={11} style={{ color: cor }} />}
                        </span>
                        <span className="block truncate" style={{ fontSize: 10, color: "var(--faint)" }}>{b.nota}</span>
                      </span>
                      <span className="font-mono tnum flex-shrink-0" style={{ fontSize: 10.5, fontWeight: 700, color: total == null ? "var(--faint)" : total >= 0 ? "var(--pos)" : "var(--neg)" }}>
                        {total == null ? "—" : `${total >= 0 ? "+" : ""}${total.toFixed(1)}%`}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
          <p className="px-1.5 pt-1.5" style={{ fontSize: 9.5, color: "var(--faint)", borderTop: "1px solid var(--line)" }}>
            Tudo na moeda da visão ({isUsd ? "US$" : "R$"}) — nunca o índice cru.
          </p>
        </div>
      )}
    </div>
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

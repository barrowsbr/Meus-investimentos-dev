"use client";

// Popup do "Retorno do dia · por book" (aberto pelo Σ na Home). Recebe os cards
// (IBKR/Brasil/Bitcoin/Câmbio) como children. O botão "Expandir" NÃO navega —
// mostra a página Hoje (HojeContent) DENTRO do mesmo popup; "Recolher" volta
// aos 4 cards.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TrendingUp, X, Maximize2, Minimize2 } from "lucide-react";
import HojeContent from "@/components/HojeContent";

export default function RetornoDiaModal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!open) { setExpanded(false); return; } // reabre sempre compacto
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(4,8,11,0.78)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className={`flex w-full flex-col overflow-hidden rounded-2xl transition-[max-width] duration-200 ${expanded ? "max-w-5xl" : "max-w-3xl"}`}
        style={{ height: expanded ? "min(90vh, 900px)" : undefined, maxHeight: "min(90vh, 900px)", border: "1px solid rgba(251,191,36,0.32)", background: "rgba(8,15,20,0.97)", boxShadow: "0 0 80px -20px rgba(251,191,36,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ borderBottom: "1px solid rgba(251,191,36,0.18)" }}>
          <TrendingUp size={15} className="text-amber-300 shrink-0" />
          <span className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-amber-200/90">
            {expanded ? "Hoje · Fechamento do dia" : "Retorno do dia · por book"}
          </span>
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <button
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Recolher" : "Expandir (ver o fechamento do dia)"}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-amber-300/70 transition-colors hover:bg-amber-400/10 hover:text-amber-200"
            >
              {expanded ? <><Minimize2 size={13} /> <span className="hidden sm:inline">Recolher</span></> : <><Maximize2 size={13} /> <span className="hidden sm:inline">Expandir</span></>}
            </button>
            <button
              onClick={onClose}
              title="Fechar (Esc)"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
            >
              <X size={14} /> <span className="hidden sm:inline">ESC</span>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {expanded ? <div className="p-4 sm:p-5"><HojeContent /></div> : children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

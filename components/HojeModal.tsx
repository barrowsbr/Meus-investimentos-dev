"use client";

// Popup do "Hoje" (fechamento do dia) — mesmo estilo do modal de deeplink
// (EmbedModal). Aberto ao clicar em "Σ Retorno do dia" na Home. É o acesso
// principal ao Hoje (o item saiu da sidebar).

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Sunrise, X, Maximize2 } from "lucide-react";
import HojeContent from "@/components/HojeContent";

export default function HojeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
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
        className="flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl"
        style={{ height: "min(90vh, 900px)", border: "1px solid rgba(251,191,36,0.32)", background: "rgba(8,15,20,0.97)", boxShadow: "0 0 80px -20px rgba(251,191,36,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra superior */}
        <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ borderBottom: "1px solid rgba(251,191,36,0.18)" }}>
          <Sunrise size={15} className="text-amber-300 shrink-0" />
          <span className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-amber-200/90">Hoje · Fechamento do dia</span>
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <Link
              href="/hoje"
              onClick={onClose}
              title="Abrir página cheia"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-amber-300/70 transition-colors hover:bg-amber-400/10 hover:text-amber-200"
            >
              <Maximize2 size={13} /> <span className="hidden sm:inline">Página</span>
            </Link>
            <button
              onClick={onClose}
              title="Fechar (Esc)"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
            >
              <X size={14} /> <span className="hidden sm:inline">ESC</span>
            </button>
          </div>
        </div>

        {/* Conteúdo (rola) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <HojeContent />
        </div>
      </div>
    </div>,
    document.body,
  );
}

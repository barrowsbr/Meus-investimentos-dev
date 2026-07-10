"use client";

// Popup do histórico patrimonial — mesmo estilo do modal de deeplink de sites
// externos (EmbedModal): overlay com blur, painel arredondado, barra de título
// e fecha por Esc/clique fora. Aberto ao clicar em "Patrimônio total" na Home.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Wallet, X, Maximize2 } from "lucide-react";
import PatrimonioContent from "@/components/PatrimonioContent";

export default function PatrimonioModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
        style={{ height: "min(90vh, 900px)", border: "1px solid rgba(52,211,153,0.35)", background: "rgba(8,15,20,0.97)", boxShadow: "0 0 80px -20px rgba(52,211,153,0.35)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra superior */}
        <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ borderBottom: "1px solid rgba(52,211,153,0.2)" }}>
          <Wallet size={15} className="text-emerald-300 shrink-0" />
          <span className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200/90">Patrimônio · Histórico</span>
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <Link
              href="/patrimonio"
              onClick={onClose}
              title="Abrir página cheia"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-emerald-300/70 transition-colors hover:bg-emerald-400/10 hover:text-emerald-200"
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
          <PatrimonioContent embedded />
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";

// Modal genérico para detalhes da Performance (Resumo, TWR vs MWR, Decomposição
// por Moeda). Centrado no desktop, bottom-sheet no mobile. Portaled para o body
// (escapa de qualquer ancestral com transform/filter). Fecha no ✕, no backdrop
// ou com Esc.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export default function PerfModal({
  title, subtitle, onClose, children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <>
      <style>{`@keyframes perfModalIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}`}</style>
      <div
        className="fixed inset-0 z-[200] flex items-end justify-center backdrop-blur-sm sm:items-center sm:p-4"
        style={{ background: "rgba(0,0,0,0.72)" }}
        onClick={onClose}
      >
        <div
          className="max-h-[88dvh] w-full overflow-hidden rounded-t-2xl shadow-2xl animate-[perfModalIn_.2s_ease-out] sm:max-w-2xl sm:rounded-2xl"
          style={{ background: "var(--surface, #0b0d14)", border: "1px solid rgba(255,255,255,0.1)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="sticky top-0 flex items-center justify-between border-b px-5 py-3.5"
            style={{ borderColor: "rgba(255,255,255,0.08)", background: "var(--surface, #0b0d14)" }}
          >
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{title}</h3>
              {subtitle && <p className="text-[11px]" style={{ color: "var(--faint)" }}>{subtitle}</p>}
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 transition-colors hover:bg-white/10" title="Fechar">
              <X size={18} style={{ color: "var(--muted)" }} />
            </button>
          </div>
          <div className="max-h-[calc(88dvh-3.5rem)] overflow-y-auto p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:pb-5">
            {children}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

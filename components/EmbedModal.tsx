"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EmbedModal — abre um link externo DENTRO do app (iframe), sem jogar o usuário
// para outra aba. Muitos sites (Yahoo Finance, veículos de notícia, gov) mandam
// X-Frame-Options / CSP frame-ancestors e RECUSAM ser embutidos — nesses casos
// o iframe viria em branco. Por isso há detecção: se o quadro não carregar em
// ~3s, mostramos um fallback limpo com "Abrir em nova aba" (o site não permite
// incorporação — limitação dele, não do app).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { X, ExternalLink, Globe, Loader2 } from "lucide-react";

export interface EmbedTarget {
  url: string;
  title: string;
  /** Subtítulo opcional na barra (ex.: "monitor global ao vivo"). */
  sub?: string;
}

export default function EmbedModal({ item, onClose }: { item: EmbedTarget | null; onClose: () => void }) {
  const [status, setStatus] = useState<"loading" | "ok" | "blocked">("loading");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!item) return;
    setStatus("loading");
    // Se o iframe não disparar onLoad em ~3,2s, presumimos bloqueio de embed.
    timer.current = setTimeout(() => setStatus((s) => (s === "loading" ? "blocked" : s)), 3200);

    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(4,8,11,0.78)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl"
        style={{ height: "min(90vh, 900px)", border: "1px solid rgba(34,211,238,0.35)", background: "rgba(8,15,20,0.95)", boxShadow: "0 0 80px -20px rgba(34,211,238,0.35)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra superior */}
        <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ borderBottom: "1px solid rgba(34,211,238,0.2)" }}>
          <Globe size={15} className="text-cyan-300 shrink-0" />
          <span className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200/90">{item.title}</span>
          {item.sub && <span className="ml-2 hidden truncate text-[10px] text-cyan-400/40 sm:inline">{item.sub}</span>}
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <a
              href={item.url} target="_blank" rel="noopener noreferrer" title="Abrir em nova aba"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-cyan-300/70 transition-colors hover:bg-cyan-400/10 hover:text-cyan-200"
            >
              <ExternalLink size={13} /> <span className="hidden sm:inline">Nova aba</span>
            </a>
            <button
              onClick={onClose} title="Fechar (Esc)"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
            >
              <X size={14} /> <span className="hidden sm:inline">ESC</span>
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="relative flex-1 bg-black">
          {status === "blocked" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
              <Globe size={34} className="text-cyan-400/40" />
              <p className="text-sm text-zinc-300">Este site não permite abrir embutido no app.</p>
              <p className="max-w-sm text-xs text-zinc-500">
                Por segurança, <span className="text-zinc-300">{hostOf(item.url)}</span> bloqueia incorporação
                (X-Frame-Options). Abra em nova aba para visualizar.
              </p>
              <a
                href={item.url} target="_blank" rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/25"
              >
                <ExternalLink size={15} /> Abrir em nova aba
              </a>
            </div>
          ) : (
            <>
              {status === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="animate-spin text-cyan-400/50" size={30} />
                </div>
              )}
              <iframe
                src={item.url}
                title={item.title}
                className="absolute inset-0 h-full w-full"
                style={{ border: "none" }}
                allow="fullscreen; geolocation"
                referrerPolicy="no-referrer-when-downgrade"
                onLoad={() => { if (timer.current) clearTimeout(timer.current); setStatus("ok"); }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "o site"; }
}

"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EmbedModal — abre um link externo DENTRO do app (iframe), sem jogar o usuário
// para outra aba.
//
// Estabilidade: sites pesados (ex.: World Monitor) às vezes não disparam onLoad
// na 1ª tentativa dentro do tempo — só "pegavam" na 2ª recarga manual. Por isso
// há RETRY AUTOMÁTICO: se o quadro não carregar em ~5s, remontamos o iframe
// (carga dupla/tripla) antes de desistir. Só depois de esgotar as tentativas
// mostramos o fallback "Abrir em nova aba" — necessário para sites que mandam
// X-Frame-Options e realmente recusam ser embutidos (Yahoo, veículos, gov).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { X, ExternalLink, Globe, Loader2, RotateCw, Languages } from "lucide-react";

export interface EmbedTarget {
  url: string;
  title: string;
  sub?: string;
}

const MAX_ATTEMPTS = 3;   // 1 inicial + 2 recargas automáticas
const PER_ATTEMPT_MS = 5000;

// Reescreve a URL para o proxy de tradução do Google (translate.goog), que
// renderiza o site inteiro traduzido — inclusive conteúdo carregado por JS.
// Não dá para traduzir o iframe direto (mesma-origem bloqueia ler/editar o DOM
// de outro domínio); mandar pelo proxy é a forma que funciona de fato.
// host: cada "-" vira "--" e cada "." vira "-", depois ".translate.goog".
function toTranslateUrl(rawUrl: string, tl = "pt"): string {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/-/g, "--").replace(/\./g, "-");
    u.searchParams.set("_x_tr_sl", "auto");
    u.searchParams.set("_x_tr_tl", tl);
    u.searchParams.set("_x_tr_hl", tl);
    const qs = u.searchParams.toString();
    return `${u.protocol}//${host}.translate.goog${u.pathname}${qs ? "?" + qs : ""}${u.hash}`;
  } catch {
    return rawUrl;
  }
}

export default function EmbedModal({ item, onClose }: { item: EmbedTarget | null; onClose: () => void }) {
  const [status, setStatus] = useState<"loading" | "ok" | "blocked">("loading");
  const [attempt, setAttempt] = useState(0); // também é a key do iframe (remonta ao mudar)
  const [translate, setTranslate] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset ao abrir/trocar de destino ou ao alternar tradução + Esc + trava de scroll.
  useEffect(() => {
    if (!item) return;
    setStatus("loading");
    setAttempt(0);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [item, translate, onClose]);

  // Timeout por tentativa → recarrega automaticamente; esgotado → bloqueado.
  useEffect(() => {
    if (!item || status !== "loading") return;
    timer.current = setTimeout(() => {
      setAttempt((a) => {
        if (a + 1 < MAX_ATTEMPTS) return a + 1; // remonta o iframe (nova carga)
        setStatus("blocked");
        return a;
      });
    }, PER_ATTEMPT_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [item, status, attempt]);

  if (!item) return null;

  const src = translate ? toTranslateUrl(item.url) : item.url;
  const retryManual = () => { setStatus("loading"); setAttempt((a) => a + 1); };

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
            <button
              onClick={() => setTranslate((t) => !t)}
              title={translate ? "Ver original" : "Traduzir para português (via Google)"}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] transition-colors ${
                translate ? "bg-cyan-400/15 text-cyan-200" : "text-cyan-300/70 hover:bg-cyan-400/10 hover:text-cyan-200"
              }`}
            >
              <Languages size={13} /> <span className="hidden sm:inline">{translate ? "PT ✓" : "Traduzir"}</span>
            </button>
            <button
              onClick={retryManual} title="Recarregar"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-cyan-300/70 transition-colors hover:bg-cyan-400/10 hover:text-cyan-200"
            >
              <RotateCw size={13} /> <span className="hidden sm:inline">Recarregar</span>
            </button>
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
              <p className="text-sm text-zinc-300">Não foi possível abrir embutido.</p>
              <p className="max-w-sm text-xs text-zinc-500">
                <span className="text-zinc-300">{hostOf(item.url)}</span> pode estar lento ou bloquear incorporação
                (X-Frame-Options). Tente recarregar ou abra em nova aba.
              </p>
              <div className="mt-1 flex items-center gap-2">
                <button
                  onClick={retryManual}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.12]"
                >
                  <RotateCw size={15} /> Tentar de novo
                </button>
                <a
                  href={item.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/25"
                >
                  <ExternalLink size={15} /> Abrir em nova aba
                </a>
              </div>
            </div>
          ) : (
            <>
              {status === "loading" && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/40 pointer-events-none">
                  <Loader2 className="animate-spin text-cyan-400/50" size={30} />
                  {attempt > 0 && (
                    <span className="text-[10px] text-cyan-400/40">recarregando… ({attempt + 1}/{MAX_ATTEMPTS})</span>
                  )}
                </div>
              )}
              <iframe
                key={`${translate ? "t" : "o"}-${attempt}`}
                src={src}
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

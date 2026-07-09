"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { X, Globe, Telescope } from "lucide-react";
import { useGlobeOverlay } from "./GlobeOverlayContext";
import { getHoloStyle, HOLO_STYLE_EVENT, type HoloStyle } from "@/lib/holo-style";
import WorldMonitorModal from "./WorldMonitorModal";
import { openEmbed } from "@/lib/embed-link";

// Globo three.js já existente — só no cliente.
const HoloGlobe = dynamic(() => import("@/components/HoloGlobe"), { ssr: false });

/**
 * Overlay do globo holográfico, montado no nível do shell (sobre todas as rotas).
 * Clique na logo da CommandBar → o globo "nasce" da logo (cone de projeção +
 * escala a partir do canto) e cresce até o centro. Fecha por scrim / ✕ / Esc.
 * Reaproveita <HoloGlobe mode="globe">; o cone/scrim/HUD são a moldura ciano.
 */
export default function HoloOverlay() {
  const { open, setOpen, originRef } = useGlobeOverlay();
  const [closing, setClosing] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [cone, setCone] = useState<{ x: number; y: number } | null>(null);
  const [coneOn, setConeOn] = useState(false);
  // Estilo do globo (Configurações → Preferências do Sistema): imersivo (tela
  // cheia) ou clássico (janela com bordas). Reage ao evento sem recarregar.
  const [holoStyle, setHoloStyleState] = useState<HoloStyle>("imersivo");
  const [wmOpen, setWmOpen] = useState(false);

  useEffect(() => {
    setHoloStyleState(getHoloStyle());
    const onChange = () => setHoloStyleState(getHoloStyle());
    window.addEventListener(HOLO_STYLE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(HOLO_STYLE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  // Offset logo→centro: deixa o stage (fechado) posicionado sobre a logo, para
  // o globo "sair" exatamente dela em qualquer resolução.
  const computeOrigin = useCallback(() => {
    if (typeof window === "undefined") return;
    const el = originRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    setOffset({ x: cx - window.innerWidth / 2, y: cy - window.innerHeight / 2 });
    setCone({ x: cx, y: cy });
  }, [originRef]);

  useEffect(() => {
    computeOrigin();
    const t = window.setTimeout(computeOrigin, 300); // logo pode montar depois
    window.addEventListener("resize", computeOrigin);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", computeOrigin);
    };
  }, [computeOrigin]);

  const doClose = useCallback(() => {
    setClosing(true);
    setConeOn(false);
    setOpen(false);
    window.setTimeout(() => setClosing(false), 360);
  }, [setOpen]);

  // Ao abrir: dispara o cone de projeção e arma o Esc.
  useEffect(() => {
    if (!open) return;
    computeOrigin();
    setConeOn(true);
    const t = window.setTimeout(() => setConeOn(false), 820);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") doClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, computeOrigin, doClose]);

  const cx = typeof window !== "undefined" ? window.innerWidth / 2 : 0;
  const cy = typeof window !== "undefined" ? window.innerHeight / 2 : 0;

  return (
    <>
      {/* Scrim escurecido — clique fecha */}
      <div className="holo-scrim" data-open={open ? "true" : "false"} onClick={doClose} aria-hidden={!open} />

      {/* Cone de projeção ciano (some após ~0,8s) */}
      {coneOn && cone && (
        <svg
          className="holo-cone"
          style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 92, pointerEvents: "none" }}
          aria-hidden
        >
          <polygon
            points={`${cone.x},${cone.y} ${cx - 140},${cy} ${cx + 140},${cy}`}
            fill="rgba(103,232,249,0.10)"
            stroke="rgba(103,232,249,0.35)"
            strokeWidth={1}
          />
        </svg>
      )}

      {/* Stage central — sempre montado p/ a transição disparar */}
      <div
        className="holo-stage"
        data-open={open ? "true" : "false"}
        data-closing={closing ? "true" : "false"}
        data-variant={holoStyle}
        style={{ "--holo-ox": `${offset.x}px`, "--holo-oy": `${offset.y}px` } as CSSProperties}
      >
        <span className="holo-corner holo-corner-tl" />
        <span className="holo-corner holo-corner-tr" />
        <span className="holo-corner holo-corner-bl" />
        <span className="holo-corner holo-corner-br" />

        <div className="holo-legend">Mercados Globais · Tempo Real</div>

        {/* Imersivo: o globo preenche o palco inteiro (tela cheia).
            Clássico: janela compacta centralizada (como era antes).
            pointerEvents só quando aberto: fechado, o wrapper não pode
            engolir os cliques do dashboard. */}
        <div
          style={
            holoStyle === "classico"
              ? { pointerEvents: open ? "auto" : "none", width: "100%", display: "flex", justifyContent: "center" }
              : { pointerEvents: open ? "auto" : "none", position: "absolute", inset: 0 }
          }
        >
          <HoloGlobe mode={open ? "globe" : "off"} variant={holoStyle} />
        </div>

        <span className="holo-sweep" aria-hidden />
      </div>

      {/* Atalhos — abrem EMBUTIDO no app (iframe), sem sair do ambiente */}
      {open && (
        <div
          className="fixed left-1/2 z-[95] flex -translate-x-1/2 items-center gap-2"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 22px)" }}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setWmOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-300/80 backdrop-blur transition-colors hover:border-cyan-300/60 hover:text-cyan-200"
            style={{ background: "rgba(8,15,20,0.55)" }}
          >
            <Globe size={12} /> World Monitor
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openEmbed("https://eyes.nasa.gov/apps/exo/", "NASA Eyes — Exoplanetas 3D", "eyes.nasa.gov"); }}
            className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-300/80 backdrop-blur transition-colors hover:border-cyan-300/60 hover:text-cyan-200"
            style={{ background: "rgba(8,15,20,0.55)" }}
          >
            <Telescope size={12} /> Exoplanetas 3D
          </button>
        </div>
      )}

      <WorldMonitorModal open={wmOpen} onClose={() => setWmOpen(false)} />

      {/* Fechar */}
      {open && (
        <button className="holo-close" onClick={doClose} aria-label="Fechar globo (Esc)">
          <X size={13} /> ESC
        </button>
      )}
    </>
  );
}

"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { X } from "lucide-react";
import { useGlobeOverlay } from "./GlobeOverlayContext";

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
        style={{ "--holo-ox": `${offset.x}px`, "--holo-oy": `${offset.y}px` } as CSSProperties}
      >
        <span className="holo-corner holo-corner-tl" />
        <span className="holo-corner holo-corner-tr" />
        <span className="holo-corner holo-corner-bl" />
        <span className="holo-corner holo-corner-br" />

        <div className="holo-legend">Mercados Globais · Tempo Real</div>

        <div style={{ pointerEvents: "auto", width: "100%", display: "flex", justifyContent: "center" }}>
          <HoloGlobe mode={open ? "globe" : "off"} />
        </div>

        <span className="holo-sweep" aria-hidden />
      </div>

      {/* Fechar */}
      {open && (
        <button className="holo-close" onClick={doClose} aria-label="Fechar globo (Esc)">
          <X size={13} /> ESC
        </button>
      )}
    </>
  );
}

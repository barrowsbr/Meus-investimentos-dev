"use client";

import { useEffect, useRef, useState } from "react";

// Mascote Barroots atravessando a barra superior a cada 1 min. Sprite sheet
// PNG transparente (12 frames de caminhada extraídos do vídeo do dono —
// vídeo com alpha não funciona no iOS, sprite CSS funciona em tudo).
// Liga/desliga em Configurações → Preferências (localStorage + evento).

export const WALKER_KEY = "walker-enabled";
export const WALKER_EVENT = "walker-toggle";

const SPRITE = "/midias/barroots-walker.png";
const CELL_W = 68;   // largura de cada frame no sheet
const CELL_H = 120;  // altura do sheet
const FRAMES = 12;
const SCALE = 0.34;  // ~41px de altura na barra de 54px
const CROSS_MS = 12_000;   // tempo pra atravessar a tela
const INTERVAL_MS = 60_000; // 1 min entre aparições
const FIRST_MS = 4_000;     // primeira aparição logo após abrir

export function isWalkerEnabled(): boolean {
  try { return localStorage.getItem(WALKER_KEY) !== "0"; } catch { return true; }
}

export default function WalkerSprite() {
  const [walking, setWalking] = useState(false);
  const enabledRef = useRef(true);

  useEffect(() => {
    const sync = () => {
      enabledRef.current = isWalkerEnabled();
      if (!enabledRef.current) setWalking(false);
    };
    sync();
    window.addEventListener(WALKER_EVENT, sync);
    window.addEventListener("storage", sync);

    let stop: ReturnType<typeof setTimeout> | null = null;
    const start = () => {
      if (!enabledRef.current) return;
      if (document.hidden) return; // aba em segundo plano não anda
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      setWalking(true);
      if (stop) clearTimeout(stop);
      stop = setTimeout(() => setWalking(false), CROSS_MS + 300);
    };
    const first = setTimeout(start, FIRST_MS);
    const interval = setInterval(start, INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
      if (stop) clearTimeout(stop);
      window.removeEventListener(WALKER_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!walking) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[6] overflow-hidden"
      style={{ height: 54 }}
    >
      <style>{`
        @keyframes walker-cross {
          from { transform: translateX(-${CELL_W}px) scale(${SCALE}); }
          to   { transform: translateX(calc(100vw + ${CELL_W}px)) scale(${SCALE}); }
        }
        @keyframes walker-gait {
          from { background-position-x: 0; }
          to   { background-position-x: -${CELL_W * FRAMES}px; }
        }
      `}</style>
      <div
        style={{
          position: "absolute",
          bottom: 1,
          left: 0,
          width: CELL_W,
          height: CELL_H,
          backgroundImage: `url(${SPRITE})`,
          backgroundSize: `${CELL_W * FRAMES}px ${CELL_H}px`,
          backgroundRepeat: "no-repeat",
          transformOrigin: "bottom left",
          animation: `walker-cross ${CROSS_MS}ms linear forwards, walker-gait 550ms steps(${FRAMES}) infinite`,
          filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.45))",
          willChange: "transform",
        }}
      />
    </div>
  );
}

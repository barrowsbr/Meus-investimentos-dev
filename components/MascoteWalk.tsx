"use client";

// Easter-egg: ao clicar na logo Barroots no topo da Home, o mascote (boneco-árvore)
// atravessa a tela caminhando. O passeio horizontal JÁ ESTÁ no próprio vídeo
// (o boneco entra por um lado e sai pelo outro) — nada de animar translateX.
//
// Remoção de fundo DE VERDADE (não blend): o vídeo tem fundo preto puro (crushado
// no encode); cada frame é desenhado num canvas reduzido e o alpha de cada pixel
// vem do brilho — preto vira transparente, o personagem fica 100% OPACO (o
// mix-blend-mode: screen antigo deixava o boneco fantasmagórico). Se qualquer
// etapa falhar (canvas/getImageData), cai no fallback de screen-blend.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const KEY_LO = 12;  // brilho (0-255) até onde é fundo → alpha 0
const KEY_HI = 40;  // brilho a partir do qual é personagem → alpha 255
const MAX_W = 854;  // resolução de trabalho do canvas (perf em mobile)

export default function MascoteWalk({ show, onDone }: { show: boolean; onDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (!show) return;
    setFallback(false);
    const v = videoRef.current;
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }

    let raf = 0;
    let usingFallback = false;
    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2 && !usingFallback) {
        try {
          const vw = video.videoWidth || 1280;
          const vh = video.videoHeight || 720;
          const w = Math.min(MAX_W, vw);
          const h = Math.round(w * (vh / vw));
          if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, w, h);
            const frame = ctx.getImageData(0, 0, w, h);
            const p = frame.data;
            for (let i = 0; i < p.length; i += 4) {
              // brilho = max(R,G,B); rampa LO..HI → alpha 0..255
              const r = p[i], g = p[i + 1], b = p[i + 2];
              const m = r > g ? (r > b ? r : b) : (g > b ? g : b);
              p[i + 3] = m <= KEY_LO ? 0 : m >= KEY_HI ? 255 : ((m - KEY_LO) * 255 / (KEY_HI - KEY_LO)) | 0;
            }
            ctx.putImageData(frame, 0, 0);
          }
        } catch {
          usingFallback = true;
          setFallback(true); // canvas indisponível → mostra o vídeo com screen-blend
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // trava de segurança: se o vídeo não disparar `ended`, encerra sozinho
    const t = window.setTimeout(onDone, 12_000);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); };
  }, [show, onDone]);

  if (!show || typeof document === "undefined") return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[300] overflow-hidden" aria-hidden>
      {/* Vídeo fonte — escondido (o canvas é quem aparece); precisa estar "visível"
          p/ o iOS continuar tocando, por isso 2px transparente e não display:none */}
      <video
        ref={videoRef}
        src="/midias/mascote.mp4"
        muted
        playsInline
        autoPlay
        onEnded={onDone}
        style={fallback
          ? { position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: "2vh", width: "min(170vw, 1400px)", mixBlendMode: "screen" }
          : { position: "absolute", width: 2, height: 2, opacity: 0.01 }}
      />
      {!fallback && (
        <canvas
          ref={canvasRef}
          // Maior que a tela no mobile (170vw): o boneco fica grande e a entrada/
          // saída acontece fora da borda; no desktop capado em 1400px.
          style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: "2vh", width: "min(170vw, 1400px)", height: "auto" }}
        />
      )}
    </div>,
    document.body,
  );
}

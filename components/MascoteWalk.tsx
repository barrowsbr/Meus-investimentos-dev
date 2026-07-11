"use client";

// Easter-egg: ao clicar na logo Barroots no topo da Home, o mascote (boneco-árvore)
// atravessa a tela caminhando, no formato retrato/móbile. O vídeo tem fundo preto
// puro (fundo "removido" no encode) e o FUNDO some via `mix-blend-mode: screen`.
//
// IMPORTANTE: o blend fica no OVERLAY fixo (não no <video>). O overlay é filho
// direto do <body>, então ele mescla com a página atrás (screen de preto = a
// própria página, invisível; o personagem, claro, aparece realçado). Se o blend
// ficasse no vídeo, o `transform` da animação isolaria o grupo e o preto voltaria
// a aparecer como retângulo. Toca uma vez e se auto-remove.

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function MascoteWalk({ show, onDone }: { show: boolean; onDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!show) return;
    const v = videoRef.current;
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
    // trava de segurança: se o vídeo não disparar `ended`, encerra sozinho
    const t = window.setTimeout(onDone, 6500);
    return () => window.clearTimeout(t);
  }, [show, onDone]);

  if (!show || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[300] overflow-hidden"
      style={{ mixBlendMode: "screen" }}
      aria-hidden
    >
      <div className="mascote-walk absolute bottom-[2vh]">
        <video
          ref={videoRef}
          src="/midias/mascote.mp4"
          muted
          playsInline
          autoPlay
          onEnded={onDone}
          className="block h-[52vh] max-h-[440px] w-auto"
        />
      </div>

      <style jsx>{`
        .mascote-walk {
          left: 0;
          animation: mascote-walk 5.6s linear forwards;
          will-change: transform;
        }
        @keyframes mascote-walk {
          0% {
            transform: translateX(-60vw);
          }
          100% {
            transform: translateX(105vw);
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}

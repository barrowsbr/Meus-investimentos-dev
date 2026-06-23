"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "./TerminalProvider";

export default function MatrixRain() {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (theme !== "matrix") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const GLYPHS =
      "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ﾞ<>=*+-¦|".split("");

    const FONT_SIZE = 16;
    let cols = 0;
    let drops: number[] = [];
    let speeds: number[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;

    /**
     * Dimensiona o buffer de desenho ao tamanho REAL renderizado do canvas
     * (clientWidth/clientHeight), não a window.innerHeight nem 100vh — isso
     * elimina a divergência da barra de URL no Safari iOS que deixava o canvas
     * em branco/desalinhado no mobile.
     */
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas!.clientWidth || window.innerWidth;
      const h = canvas!.clientHeight || window.innerHeight;
      if (w === width && h === height) return;
      width = w;
      height = h;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const newCols = Math.ceil(width / FONT_SIZE);
      // Preserva colunas existentes ao redimensionar; cria novas onde faltar.
      const oldDrops = drops;
      drops = new Array(newCols).fill(0).map((_, i) =>
        oldDrops[i] ?? Math.floor((Math.random() * -height) / FONT_SIZE)
      );
      speeds = new Array(newCols).fill(0).map((_, i) =>
        speeds[i] ?? 0.5 + Math.random() * 0.9
      );
      cols = newCols;
      ctx!.fillStyle = "#050A05";
      ctx!.fillRect(0, 0, width, height);
    }

    function draw() {
      // Rastro: véu translúcido escuro → caudas que desvanecem.
      ctx!.fillStyle = "rgba(5, 10, 5, 0.10)";
      ctx!.fillRect(0, 0, width, height);
      ctx!.font = `${FONT_SIZE}px monospace`;

      for (let i = 0; i < cols; i++) {
        const ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        const x = i * FONT_SIZE;
        const y = drops[i] * FONT_SIZE;

        if (Math.random() > 0.975) {
          ctx!.fillStyle = "rgba(190, 255, 190, 0.95)"; // cabeça brilhante
        } else {
          ctx!.fillStyle = "rgba(0, 255, 65, 0.55)"; // corpo verde fósforo
        }
        ctx!.fillText(ch, x, y);

        if (y > height && Math.random() > 0.975) {
          drops[i] = Math.floor(Math.random() * -20);
        }
        drops[i] += speeds[i];
      }
    }

    let raf = 0;
    let last = 0;
    const FRAME_MS = 1000 / 20;
    let running = true;

    function loop(t: number) {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (t - last < FRAME_MS) return;
      last = t;
      draw();
    }

    // Primeira medição: dois rAFs garantem que o layout já aplicou as
    // dimensões do canvas (crítico no mobile, onde innerHeight ainda não está
    // estável no primeiro frame após troca de tema).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resize();
        if (reduced) {
          draw();
          draw();
        } else if (running) {
          raf = requestAnimationFrame(loop);
        }
      });
    });

    // ResizeObserver: reage ao tamanho real do canvas (rotação, barra de URL
    // aparecendo/sumindo no mobile, etc.) sem depender de window.resize.
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    function onVisibility() {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduced && !running) {
        running = true;
        last = 0;
        resize();
        raf = requestAnimationFrame(loop);
      }
    }

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [theme]);

  if (theme !== "matrix") return null;

  return (
    <>
      <canvas ref={canvasRef} className="matrix-rain" aria-hidden />
      <div className="matrix-crt" aria-hidden />
    </>
  );
}

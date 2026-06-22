"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "./TerminalProvider";

/**
 * MATRIX — chuva digital + camada CRT.
 *
 * Renderiza apenas quando o tema é "matrix". Dá PROFUNDIDADE ao tema (em vez de
 * um verde chapado "filtro por cima"): glifos katakana caindo atrás do conteúdo
 * + uma camada CRT (scanlines, vinheta, flicker) por cima — tudo pointer-events
 * none, então não interfere na interação.
 *
 * Cuidados:
 * - Pausa quando a aba não está visível (visibilitychange) — economiza CPU.
 * - Respeita prefers-reduced-motion: mostra um quadro estático, sem animar.
 * - FPS limitado (~20fps) e opacidade baixa: presença ambiente, não distração.
 */
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

    // Glifos: katakana (meia-largura) + dígitos + alguns latinos — o "código" de Matrix.
    const GLYPHS =
      "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ﾞ<>=*+-¦|".split("");

    const FONT_SIZE = 16;
    let cols = 0;
    let drops: number[] = [];
    let speeds: number[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;

    function setup() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / FONT_SIZE);
      drops = new Array(cols).fill(0).map(() => Math.floor((Math.random() * -height) / FONT_SIZE));
      speeds = new Array(cols).fill(0).map(() => 0.5 + Math.random() * 0.9);
      ctx!.fillStyle = "#050A05";
      ctx!.fillRect(0, 0, width, height);
    }

    function draw() {
      // Rastro: véu translúcido escuro a cada quadro → caudas que desvanecem.
      ctx!.fillStyle = "rgba(5, 10, 5, 0.10)";
      ctx!.fillRect(0, 0, width, height);
      ctx!.font = `${FONT_SIZE}px var(--font-mono), monospace`;

      for (let i = 0; i < cols; i++) {
        const ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        const x = i * FONT_SIZE;
        const y = drops[i] * FONT_SIZE;

        // Cabeça do fluxo mais brilhante (quase branca), corpo verde fósforo.
        if (Math.random() > 0.975) {
          ctx!.fillStyle = "rgba(190, 255, 190, 0.95)";
        } else {
          ctx!.fillStyle = "rgba(0, 255, 65, 0.55)";
        }
        ctx!.fillText(ch, x, y);

        if (y > height && Math.random() > 0.975) {
          drops[i] = Math.floor((Math.random() * -20));
        }
        drops[i] += speeds[i];
      }
    }

    let raf = 0;
    let last = 0;
    const FRAME_MS = 1000 / 20; // ~20fps: fluido o bastante, leve na CPU
    let running = true;

    function loop(t: number) {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (t - last < FRAME_MS) return;
      last = t;
      draw();
    }

    setup();
    if (reduced) {
      // Sem animação: um único quadro estático de glifos esparsos.
      draw();
      draw();
    } else {
      raf = requestAnimationFrame(loop);
    }

    function onResize() {
      setup();
    }
    function onVisibility() {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduced && !running) {
        running = true;
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    }

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
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

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

    function setup() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      // Use screen dimensions as reliable fallback for mobile
      width = window.innerWidth || document.documentElement.clientWidth || screen.width;
      height = window.innerHeight || document.documentElement.clientHeight || screen.height;
      // Don't override CSS sizing — let CSS handle display size, set pixel buffer directly
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / FONT_SIZE);
      drops = new Array(cols).fill(0).map(() =>
        Math.floor((Math.random() * -height) / FONT_SIZE)
      );
      speeds = new Array(cols).fill(0).map(() => 0.5 + Math.random() * 0.9);
      ctx!.fillStyle = "#050A05";
      ctx!.fillRect(0, 0, width, height);
    }

    function draw() {
      ctx!.fillStyle = "rgba(5, 10, 5, 0.10)";
      ctx!.fillRect(0, 0, width, height);
      ctx!.font = `${FONT_SIZE}px monospace`;

      for (let i = 0; i < cols; i++) {
        const ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        const x = i * FONT_SIZE;
        const y = drops[i] * FONT_SIZE;

        if (Math.random() > 0.975) {
          ctx!.fillStyle = "rgba(190, 255, 190, 0.95)";
        } else {
          ctx!.fillStyle = "rgba(0, 255, 65, 0.55)";
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

    setup();

    if (reduced) {
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
    window.addEventListener("orientationchange", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
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

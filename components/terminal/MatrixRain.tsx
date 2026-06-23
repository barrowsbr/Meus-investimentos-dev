"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "./TerminalProvider";
import { applySize, attachResizeListeners, type CanvasState } from "@/lib/canvas-resize";

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
    const GLYPHS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ﾞ<>=*+-¦|".split("");
    const FONT_SIZE = 16;

    let cols = 0;
    let drops: number[] = [];
    let speeds: number[] = [];
    const state: CanvasState = { width: 0, height: 0, dpr: 1 };

    function resize() {
      const changed = applySize(canvas!, ctx!, state);
      if (!changed) return;
      const newCols = Math.ceil(state.width / FONT_SIZE);
      const oldDrops = drops;
      drops = new Array(newCols).fill(0).map((_, i) =>
        oldDrops[i] ?? Math.floor((Math.random() * -state.height) / FONT_SIZE)
      );
      speeds = new Array(newCols).fill(0).map((_, i) =>
        speeds[i] ?? 0.5 + Math.random() * 0.9
      );
      cols = newCols;
      ctx!.fillStyle = "#050A05";
      ctx!.fillRect(0, 0, state.width, state.height);
    }

    function draw() {
      ctx!.fillStyle = "rgba(5, 10, 5, 0.10)";
      ctx!.fillRect(0, 0, state.width, state.height);
      ctx!.font = `${FONT_SIZE}px monospace`;

      for (let i = 0; i < cols; i++) {
        const ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        const x = i * FONT_SIZE;
        const y = drops[i] * FONT_SIZE;
        ctx!.fillStyle = Math.random() > 0.975
          ? "rgba(190, 255, 190, 0.95)"
          : "rgba(0, 255, 65, 0.55)";
        ctx!.fillText(ch, x, y);
        if (y > state.height && Math.random() > 0.975) {
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
      resize();
      if (t - last < FRAME_MS) return;
      last = t;
      draw();
    }

    function start() {
      resize();
      if (state.width < 10 || state.height < 10) return;
      if (reduced) { draw(); draw(); return; }
      if (running) raf = requestAnimationFrame(loop);
    }

    requestAnimationFrame(() => requestAnimationFrame(start));
    const t1 = setTimeout(start, 300);
    const t2 = setTimeout(start, 800);

    const listeners = attachResizeListeners(canvas, resize);

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

    const safety = setInterval(() => {
      if (!running && !reduced && !document.hidden) {
        running = true;
        last = 0;
        resize();
        raf = requestAnimationFrame(loop);
      }
    }, 3000);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      clearInterval(safety);
      listeners.dispose();
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

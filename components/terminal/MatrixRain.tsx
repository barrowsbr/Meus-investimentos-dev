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

    function getViewportSize(): [number, number] {
      const vv = window.visualViewport;
      const rect = canvas!.getBoundingClientRect();
      const w = rect.width || canvas!.clientWidth || vv?.width || window.innerWidth;
      const h = rect.height || canvas!.clientHeight || vv?.height || window.innerHeight;
      return [w, h];
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const [w, h] = getViewportSize();
      if (w < 10 || h < 10) return;
      if (w === width && h === height) return;
      width = w;
      height = h;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const newCols = Math.ceil(width / FONT_SIZE);
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

    function startIfReady() {
      resize();
      if (width < 10 || height < 10) return false;
      if (reduced) {
        draw();
        draw();
      } else if (running) {
        raf = requestAnimationFrame(loop);
      }
      return true;
    }

    // Primary: double rAF waits for layout
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        startIfReady();
      });
    });

    // Fallback: if double rAF wasn't enough (slow mobile), retry after 300ms
    const fallbackTimer = setTimeout(() => {
      if (width < 10 || height < 10) startIfReady();
    }, 300);

    // Second fallback at 800ms for very slow devices
    const fallbackTimer2 = setTimeout(() => {
      if (width < 10 || height < 10) startIfReady();
    }, 800);

    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    const onVVResize = () => resize();
    window.visualViewport?.addEventListener("resize", onVVResize);

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
      clearTimeout(fallbackTimer);
      clearTimeout(fallbackTimer2);
      ro.disconnect();
      window.visualViewport?.removeEventListener("resize", onVVResize);
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

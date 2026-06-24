"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "./TerminalProvider";
import { applySize, attachResizeListeners, type CanvasState } from "@/lib/canvas-resize";

export default function AmbarBackground() {
  const { theme, bgAnim } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (theme !== "ambar" || !bgAnim) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state: CanvasState = { width: 0, height: 0, dpr: 1 };
    let lastDrawTime = 0;

    interface Particle {
      x: number;
      y: number;
      speed: number;
      char: string;
      opacity: number;
      fadeDir: number;
      col: number;
    }

    const CHARS = "0123456789$%.:+=─│┐┘└┌".split("");
    const FONT_SIZE = 14;
    let particles: Particle[] = [];
    let cols = 0;
    let frameCount = 0;

    function spawnParticles() {
      cols = Math.ceil(state.width / (FONT_SIZE * 2.2));
      const count = Math.min(cols * 3, 180);
      particles = [];
      for (let i = 0; i < count; i++) {
        particles.push(makeParticle(true));
      }
    }

    function makeParticle(randomY: boolean): Particle {
      const col = Math.floor(Math.random() * cols);
      return {
        x: col * FONT_SIZE * 2.2 + FONT_SIZE,
        y: randomY ? Math.random() * state.height : -FONT_SIZE,
        speed: 0.3 + Math.random() * 0.8,
        char: CHARS[Math.floor(Math.random() * CHARS.length)],
        opacity: 0.08 + Math.random() * 0.25,
        fadeDir: Math.random() > 0.5 ? 1 : -1,
        col,
      };
    }

    function resize() {
      if (!applySize(canvas!, ctx!, state)) return;
      spawnParticles();
      draw();
    }

    function draw() {
      lastDrawTime = performance.now();
      frameCount++;
      const { width, height } = state;

      ctx!.fillStyle = "rgba(8, 8, 10, 0.06)";
      ctx!.fillRect(0, 0, width, height);
      if (frameCount <= 2) {
        ctx!.fillStyle = "#08080A";
        ctx!.fillRect(0, 0, width, height);
      }

      ctx!.font = `${FONT_SIZE}px monospace`;

      for (const p of particles) {
        p.opacity += p.fadeDir * 0.003;
        if (p.opacity > 0.35) { p.opacity = 0.35; p.fadeDir = -1; }
        if (p.opacity < 0.06) { p.opacity = 0.06; p.fadeDir = 1; }

        ctx!.fillStyle = `rgba(232, 163, 61, ${p.opacity})`;
        ctx!.fillText(p.char, p.x, p.y);

        p.y += p.speed;

        if (Math.random() < 0.005) {
          p.char = CHARS[Math.floor(Math.random() * CHARS.length)];
        }

        if (p.y > height + FONT_SIZE) {
          Object.assign(p, makeParticle(false));
        }
      }

      // Subtle horizontal scan line moving down
      const scanY = (frameCount * 0.5) % height;
      ctx!.fillStyle = "rgba(232, 163, 61, 0.04)";
      ctx!.fillRect(0, scanY, width, 2);
    }

    let raf = 0;
    let last = 0;
    const FRAME_MS = 1000 / 24;
    let alive = true;

    function loop(t: number) {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      resize();
      if (t - last < FRAME_MS) return;
      last = t;
      draw();
    }

    function boot() {
      resize();
      if (state.width > 0 && state.height > 0 && alive) {
        raf = requestAnimationFrame(loop);
      }
    }

    requestAnimationFrame(() => requestAnimationFrame(boot));
    const t1 = setTimeout(boot, 300);
    const t2 = setTimeout(boot, 800);

    const listeners = attachResizeListeners(canvas, resize);

    function onVisibility() {
      if (document.hidden) { cancelAnimationFrame(raf); }
      else if (alive) { last = 0; resize(); raf = requestAnimationFrame(loop); }
    }
    document.addEventListener("visibilitychange", onVisibility);

    const backup = setInterval(() => {
      if (!alive) return;
      if (performance.now() - lastDrawTime > 500) {
        resize();
        if (state.width > 0) draw();
      }
      if (alive && !document.hidden) {
        cancelAnimationFrame(raf);
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    }, 1000);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      clearInterval(backup);
      listeners.dispose();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [theme, bgAnim]);

  if (theme !== "ambar" || !bgAnim) return null;

  return (
    <>
      <canvas ref={canvasRef} className="ambar-bg" aria-hidden />
      <div className="ambar-scanlines" aria-hidden />
    </>
  );
}
